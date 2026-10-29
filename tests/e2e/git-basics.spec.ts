import fs from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { HISTORY_ANSWERS, HISTORY_QUESTIONS } from "../../content/courses/git-basics/simulation/labs";
import { HOURS_FIXED, incidentCommits, indexWith } from "../../content/courses/git-basics/simulation/site";
import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/git-basics");

async function answerQuiz(page: Page, file: string) {
  const quiz = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, "assessments", file), "utf8")) as {
    questions: { id: string; answer: string | string[] | boolean }[];
  };
  for (const question of quiz.questions) {
    const answers = Array.isArray(question.answer) ? question.answer : [String(question.answer)];
    for (const answer of answers) await page.locator(`[data-question-id="${question.id}"] input[value="${answer}"]`).check();
  }
  await page.getByRole("button", { name: "提交知识检查" }).click();
  await expect(page.getByText("本章知识检查已通过")).toBeVisible({ timeout: 20_000 });
}

async function passLab(page: Page, submitLabel: string) {
  await page.getByRole("button", { name: submitLabel }).click();
  await expect(page.getByText("服务端验证通过").first()).toBeVisible({ timeout: 20_000 });
}

async function expectChapterDone(page: Page) {
  await expect(page.getByText(/本章已完成/).first()).toBeVisible({ timeout: 20_000 });
}

async function run(lab: Locator, ...commands: string[]) {
  for (const command of commands) {
    const input = lab.getByLabel("命令");
    await input.fill(command);
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(lab.getByTestId("terminal-output")).toContainText(command);
  }
}

/** Opens a file in the lab's editor, replaces its content and saves it. */
async function edit(lab: Locator, file: string, content: string) {
  await lab.getByTestId("files-panel").getByRole("button", { name: new RegExp(`^${file.replace(".", "\\.")}`) }).click();
  await lab.getByLabel("编辑器").fill(content);
  await lab.getByRole("button", { name: `保存 ${file}` }).click();
  await expect(lab.getByTestId("terminal-output")).toContainText(`在编辑器里保存了 ${file}`);
}

test.describe("Git 版本控制（git-basics）", () => {
  test("九章全部通过真实界面与服务端验证完成，结课并获得 140 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("git");
    const course = await getCourseBySlug("git-basics");
    const lessons = await getLessons(course.id);
    const open = async (slug: string) => {
      await page.goto(`/learn/${course.id}?lesson=${lessons.find((item) => item.slug === slug)!.id}`);
      await expect(page.locator("main main h1")).toBeVisible({ timeout: 20_000 });
    };

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await expect(page.getByTestId("course-path-context")).toContainText("第 7 / 7 门");
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      // 01 手动完成。
      await open("why-git");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 第一次提交：git add . 会带上 .env；撤掉重来。
      await open("first-commit");
      const commit = page.getByTestId("git-basics-commit");
      await run(commit, "git status", "git add .", "git commit -m 修复借阅页");
      await expect(commit.locator('[data-goal="env"]')).toHaveAttribute("data-ok", "false");
      await run(commit, "git reset HEAD~", "echo .env >> .gitignore", "git add loans.js loans.html .gitignore", "git commit -m '借阅页：禁用账号不能借书，显示借书上限'");
      await expect(commit.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交检查");
      await answerQuiz(page, "commit.server.json");
      await expectChapterDone(page);

      // 03 读历史。
      await open("history");
      const history = page.getByTestId("git-basics-history");
      await run(history, "git log --oneline -- config.js", "git blame index.html");
      await expect(history.getByTestId("terminal-output")).toContainText(HISTORY_ANSWERS.days);
      for (const item of HISTORY_QUESTIONS) {
        if ("options" in item) await history.getByRole("radio", { name: HISTORY_ANSWERS[item.id], exact: true }).check();
        else await history.getByLabel(item.question).fill(HISTORY_ANSWERS[item.id]);
      }
      await passLab(page, "提交答案");
      await expectChapterDone(page);

      // 04 撤销：先移出暂存区再 amend。
      await open("undo");
      const undo = page.getByTestId("git-basics-undo");
      await expect(undo.locator('[data-goal="restore"]')).toHaveAttribute("data-ok", "false");
      await run(undo, "git status", "git restore index.html", "git restore --staged style.css", "git add search.js", "git commit --amend -m 添加搜索框");
      await expect(undo.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交检查");
      await answerQuiz(page, "undo.server.json");
      await expectChapterDone(page);

      // 05 分支：功能在分支上，修复在 main 上。
      await open("branches");
      const branch = page.getByTestId("git-basics-branch");
      await run(branch, "git switch -c feature/search", "echo '// 搜索' > search.js", "git add search.js", "git commit -m 搜索功能雏形", "git switch main");
      await expect(branch.getByTestId("files-panel")).not.toContainText("search.js");
      await edit(branch, "index.html", indexWith(HOURS_FIXED));
      await run(branch, "git commit -am 修正工作日开馆时间");
      await expect(branch.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交检查");
      await expectChapterDone(page);

      // 06 合并冲突：两边的修改都留下。
      await open("merge");
      const merge = page.getByTestId("git-basics-merge");
      await run(merge, "git merge feature/weekend");
      await expect(merge.getByTestId("terminal-output")).toContainText("CONFLICT");
      await edit(merge, "index.html", indexWith("<p>开馆时间：周一至周五 9:00–21:00，周末 10:00–16:00</p>"));
      await run(merge, "git add index.html", "git commit");
      await expect(merge.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交检查");
      await answerQuiz(page, "merge.server.json");
      await expectChapterDone(page);

      // 07 远程：被拒绝后先 pull。
      await open("remote");
      const remote = page.getByTestId("git-basics-remote");
      await run(remote, "git push");
      await expect(remote.getByTestId("terminal-output")).toContainText("[rejected]");
      await run(remote, "git pull", "git push");
      await expect(remote.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交检查");
      await answerQuiz(page, "remote.server.json");
      await expectChapterDone(page);

      // 08 线上事故：revert 引入问题的那次提交。
      await open("incident");
      const incident = page.getByTestId("git-basics-incident");
      const bad = incidentCommits().helper.id.slice(0, 7);
      await run(incident, "git log -p -n 3 -- loans.js", `git revert ${bad}`, "git push", "git status");
      await expect(incident.getByTestId("terminal-output")).toContainText("docs/search-plan.md");
      await passLab(page, "提交处理结果");
      await expectChapterDone(page);

      // 09 结业测验 → 结课。
      await open("final");
      await answerQuiz(page, "final.server.json");
      await expect(page.getByText("课程已完成，当前为只读复习模式")).toBeVisible({ timeout: 20_000 });

      expect((await getEnrollments(student.id))[0].status).toBe("completed");
      expect(await getPointsTotal(student.id)).toBe(lessons.length * 10 + 50);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
