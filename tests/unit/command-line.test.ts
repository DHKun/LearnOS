import { describe, expect, it } from "vitest";

import {
  LOG_ANSWERS,
  PATHS_INITIAL,
  PERMS_INITIAL,
  TOP_VISITORS,
  replayLab,
} from "@/content/courses/command-line/simulation/labs";
import { pathsMachine } from "@/content/courses/command-line/simulation/server";
import { applyMode, globMatch, normalize, runLine } from "@/content/courses/command-line/simulation/shell";
import {
  validateDiskLab,
  validateEnvLab,
  validateFilesLab,
  validateLogsLab,
  validatePathsLab,
  validatePermsLab,
  validatePipesLab,
  validateProcessLab,
} from "@/content/courses/command-line/validators";

const LOG = "/var/log/library/access.log";

function run(history: string[]) {
  const { transcript } = replayLab("paths", history);
  return transcript[transcript.length - 1]!;
}

describe("command-line 模拟终端", () => {
  it("路径、引号、变量与通配符", () => {
    expect(normalize("/srv/library/../shared/./uploads/")).toBe("/srv/shared/uploads");
    expect(run(["cd ../shared", "pwd"]).out).toBe("/srv/shared\n");
    expect(run(["echo '$HOME' \"$HOME\" ~deploy"]).out).toBe("$HOME /home/ops /home/deploy\n");
    expect(run(["ls releases/*"]).out).toContain("releases/current");
    expect(globMatch("*.tmp", "upload-7f3a.tmp")).toBe(true);
    expect(globMatch("*.tmp", ".hidden.tmp")).toBe(true);
    expect(run(["ls /root"]).err).toContain("Permission denied");
    expect(run(["rm -rf /"]).err).toContain("refusing");
    expect(applyMode(0o644, "u+x,go-r")).toBe(0o700);
  });

  it("> 先清空文件再运行命令；>> 追加；2> 单独接住报错", () => {
    const m = pathsMachine();
    runLine(m, "echo 一 > /home/ops/a.txt");
    runLine(m, "echo 二 >> /home/ops/a.txt");
    expect(m.fs["/home/ops/a.txt"]!.content).toBe("一\n二\n");
    runLine(m, "sort /home/ops/a.txt > /home/ops/a.txt");
    expect(m.fs["/home/ops/a.txt"]!.content).toBe("");
    const result = runLine(m, "find / -name db.env 2>/dev/null");
    expect(result.out).toBe("/srv/library/config/db.env\n");
    expect(result.err).toBe("");
  });

  it("不执行任何真实命令：未知命令、命令替换和后台运行都会被拒绝", () => {
    expect(run(["python3 -c 'print(1)'"]).err).toContain("command not found");
    expect(run(["echo $(whoami)"]).err).toContain("命令替换");
    expect(run(["sleep 10 &"]).err).toContain("后台");
    expect(run(["x".repeat(400)]).err).toContain("命令太长");
  });

  it("grep 是纯文字匹配：直接搜 500 会命中响应大小和地址", () => {
    const naive = run([`grep 500 ${LOG} | head -n 1`]).out;
    expect(naive).not.toContain('" 500 ');
    expect(run([`grep '" 500 ' ${LOG} | head -n 1`]).out).toContain(LOG_ANSWERS.first);
  });

  it("uniq -c 只合并相邻行：不先排序，计数就是错的", () => {
    const wrong = run([`cut -d ' ' -f 1 ${LOG} | uniq -c | sort -rn | head -n 1`]).out;
    const right = run([`cut -d ' ' -f 1 ${LOG} | sort | uniq -c | sort -rn | head -n 1`]).out;
    expect(right.trim()).toBe(`${TOP_VISITORS[0]!.count} ${TOP_VISITORS[0]!.ip}`);
    expect(wrong.trim()).not.toBe(right.trim());
  });
});

describe("command-line 服务端验证器", () => {
  it("路径：初始设置不通过；改成绝对路径才在两种运行方式下都对", () => {
    expect(validatePathsLab({ values: PATHS_INITIAL }).passed).toBe(false);
    const good = { static: "/srv/library/static", uploads: "/srv/shared/uploads", release: "/srv/library/releases/current", logs: "/home/deploy/logs" };
    expect(validatePathsLab({ values: good }).passed).toBe(true);
    expect(validatePathsLab({ values: { ...good, logs: "~deploy/logs", uploads: "/srv/library/../shared/uploads" } }).passed).toBe(true);
    for (const change of [{ static: "static" }, { release: "/srv/library/release/current" }, { logs: "~/logs" }, { uploads: "/srv/library/uploads" }]) {
      expect(validatePathsLab({ values: { ...good, ...change } }).passed).toBe(false);
    }
    expect(validatePathsLab({ values: { ...good, static: "x".repeat(500) } }).passed).toBe(false);
  });

  const tidy = [
    "mkdir images docs",
    "mv inbox/*.jpg inbox/*.png images/",
    "mv inbox/report.pdf inbox/manual.pdf docs/",
    "mv inbox/old/report.pdf docs/report-2025.pdf",
    "rm inbox/*.tmp inbox/old/*.tmp",
    "rmdir inbox/old",
  ];

  it("整理上传目录：同名的报告会被 mv 覆盖；隐藏文件要留下", () => {
    expect(validateFilesLab({ history: [] }).passed).toBe(false);
    expect(validateFilesLab({ history: tidy }).passed).toBe(true);
    const overwrite = [...tidy.slice(0, 3), "mv inbox/old/report.pdf docs/", ...tidy.slice(4)];
    const verdict = validateFilesLab({ history: overwrite });
    expect(verdict.passed).toBe(false);
    expect(String(verdict.feedback.message)).toContain("覆盖");
    expect(validateFilesLab({ history: [...tidy, "rm -rf inbox"] }).passed).toBe(false);
    expect(validateFilesLab({ history: tidy.filter((line) => !line.startsWith("rmdir")) }).passed).toBe(false);
    expect(validateFilesLab({ history: tidy, passed: true }).passed).toBe(true);
    expect(validateFilesLab({ history: [], passed: true }).passed).toBe(false);
  });

  it("读日志：答案从日志里读出来；把“500 字节”当成状态码会得到提示", () => {
    expect(validateLogsLab({ answers: LOG_ANSWERS }).passed).toBe(true);
    expect(validateLogsLab({ answers: { ...LOG_ANSWERS, first: "7:42:13", path: "/api/loans/" } }).passed).toBe(true);
    const trap = run([`grep 500 ${LOG} | head -n 1`]).out.match(/:(\d\d:\d\d:\d\d) /)![1]!;
    const verdict = validateLogsLab({ answers: { ...LOG_ANSWERS, first: trap } });
    expect(verdict.passed).toBe(false);
    expect(String(verdict.feedback.message)).toContain("状态码是 200");
    expect(validateLogsLab({ answers: { ...LOG_ANSWERS, cause: "disk" } }).passed).toBe(false);
  });

  it("管道：先排序再计数，再追加到周报末尾", () => {
    const pipe = `cut -d ' ' -f 1 ${LOG} | sort | uniq -c | sort -rn | head -n 3`;
    expect(validatePipesLab({ history: [`${pipe} >> weekly-report.txt`] }).passed).toBe(true);
    expect(validatePipesLab({ history: [`awk '{print $1}' ${LOG} | sort | uniq -c | sort -rn | head -3 >> ~/weekly-report.txt`] }).passed).toBe(true);
    const overwrite = validatePipesLab({ history: [`${pipe} > weekly-report.txt`] });
    expect(overwrite.passed).toBe(false);
    expect(String(overwrite.feedback.message)).toContain(">>");
    expect(validatePipesLab({ history: [`cut -d ' ' -f 1 ${LOG} | uniq -c | sort -rn | head -n 3 >> weekly-report.txt`] }).passed).toBe(false);
    expect(String(validatePipesLab({ history: [`cut -d ' ' -f 1 ${LOG} | sort | uniq -c | sort -n | tail -n 3 >> weekly-report.txt`] }).feedback.message)).toContain("顺序");
  });

  it("权限：开够、但不多开", () => {
    expect(validatePermsLab({ modes: PERMS_INITIAL }).passed).toBe(false);
    const good = { static: "750", index: "640", uploads: "775", deploy: "750", config: "750", db: "640" };
    expect(validatePermsLab({ modes: good }).passed).toBe(true);
    expect(validatePermsLab({ modes: { ...good, static: "755", index: "644", config: "755", db: "640" } }).passed).toBe(true);
    for (const change of [{ static: "740" }, { uploads: "755" }, { uploads: "777" }, { deploy: "644" }, { db: "600" }, { db: "644", config: "755" }, { static: "755", index: "646" }, { index: "440" }, { db: "abc" }]) {
      expect(validatePermsLab({ modes: { ...good, ...change } }).passed).toBe(false);
    }
    expect(validatePermsLab({ modes: Object.fromEntries(Object.keys(good).map((key) => [key, "777"])) }).passed).toBe(false);
  });

  it("进程：找出占着 80 端口的旧进程，用 TERM 结束它，再交给 systemd 启动", () => {
    const good = ["ss -ltnp", "kill 812", "sudo systemctl start library-web"];
    expect(validateProcessLab({ history: good }).passed).toBe(true);
    expect(validateProcessLab({ history: ["sudo systemctl restart library-web"] }).passed).toBe(false);
    const hard = validateProcessLab({ history: ["kill -9 812", "sudo systemctl start library-web"] });
    expect(hard.passed).toBe(false);
    expect(String(hard.feedback.message)).toContain(".part");
    expect(validateProcessLab({ history: ["kill 812 813", "sudo systemctl start library-web"] }).passed).toBe(false);
    expect(validateProcessLab({ history: ["kill 812"] }).passed).toBe(false);
  });

  it("PATH：新目录放在前面，并写进 ~/.bashrc；不能覆盖原来的 .bashrc", () => {
    const line = "export PATH=/opt/node20/bin:$PATH:/opt/libctl/bin";
    expect(validateEnvLab({ history: [line, `echo '${line}' >> ~/.bashrc`] }).passed).toBe(true);
    expect(validateEnvLab({ history: [`echo '${line}' >> ~/.bashrc`, "source ~/.bashrc"] }).passed).toBe(true);
    expect(String(validateEnvLab({ history: [line] }).feedback.message)).toContain("重新登录");
    const appended = "export PATH=$PATH:/opt/node20/bin:/opt/libctl/bin";
    expect(validateEnvLab({ history: [appended, `echo '${appended}' >> ~/.bashrc`] }).passed).toBe(false);
    expect(validateEnvLab({ history: [line, `echo '${line}' > ~/.bashrc`] }).passed).toBe(false);
    expect(validateEnvLab({ history: ["export PATH=/opt/node20/bin:/opt/libctl/bin"] }).passed).toBe(false);
  });

  it("磁盘满了：删掉被打开的日志不会释放空间，要清空它或重启服务", () => {
    const rmOnly = validateDiskLab({ history: ["rm /var/log/library/debug.log"] });
    expect(rmOnly.passed).toBe(false);
    expect(String(rmOnly.feedback.message)).toContain("还开着");
    expect(validateDiskLab({ history: ["rm /var/log/library/debug.log", "sudo systemctl restart library-web"] }).passed).toBe(true);
    expect(validateDiskLab({ history: ["truncate -s 0 /var/log/library/debug.log"] }).passed).toBe(true);
    expect(validateDiskLab({ history: ["> /var/log/library/debug.log"] }).passed).toBe(true);
    expect(validateDiskLab({ history: ["rm -rf /var/log/library/*", "sudo systemctl restart library-web"] }).passed).toBe(false);
    expect(validateDiskLab({ history: ["rm /home/ops/backups/*", "truncate -s 0 /var/log/library/debug.log"] }).passed).toBe(false);
    expect(validateDiskLab({ history: ["rm /home/ops/backups/*"] }).passed).toBe(false);
  });

  it("拒绝格式错误、超长或超量的命令记录", () => {
    expect(validateFilesLab(null).passed).toBe(false);
    expect(validateFilesLab({ history: "rm -rf /" }).passed).toBe(false);
    expect(validateFilesLab({ history: ["x".repeat(201)] }).passed).toBe(false);
    expect(validateFilesLab({ history: Array.from({ length: 41 }, () => "pwd") }).passed).toBe(false);
  });
});
