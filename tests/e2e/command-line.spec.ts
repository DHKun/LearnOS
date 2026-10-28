import fs from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { LOG_ANSWERS, LOG_QUESTIONS } from "../../content/courses/command-line/simulation/labs";
import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/command-line");
const LOG = "/var/log/library/access.log";

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

/** Types each command into the lab's terminal and waits for it to show up in the transcript. */
async function run(lab: Locator, ...commands: string[]) {
  for (const command of commands) {
    const input = lab.getByLabel("命令");
    await input.fill(command);
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(lab.getByTestId("terminal-output")).toContainText(command);
  }
}

test.describe("命令行与文件系统（command-line）", () => {
  test("十章全部通过真实界面与服务端验证完成，结课并获得 150 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("cli");
    const course = await getCourseBySlug("command-line");
    const lessons = await getLessons(course.id);
    const open = async (slug: string) => {
      await page.goto(`/learn/${course.id}?lesson=${lessons.find((item) => item.slug === slug)!.id}`);
      await expect(page.locator("main main h1")).toBeVisible({ timeout: 20_000 });
    };

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await expect(page.getByTestId("course-path-context")).toContainText("第 4 / 5 门");
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      // 01 手动完成。
      await open("what-is-shell");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 路径：初始设置在定时任务下全部或部分指错；先用终端看清目录名。
      await open("paths");
      const paths = page.getByTestId("command-line-paths");
      await expect(paths.locator('[data-setting="release"]')).toHaveAttribute("data-ok", "false");
      await expect(paths.locator('[data-setting="static"] [data-context="manual"]')).toHaveAttribute("data-ok", "true");
      await expect(paths.locator('[data-setting="static"] [data-context="cron"]')).toHaveAttribute("data-ok", "false");
      await run(paths, "ls /srv/library");
      await expect(paths.getByTestId("terminal-output")).toContainText("releases");
      await paths.getByLabel("static 的路径").fill("/srv/library/static");
      await paths.getByLabel("uploads 的路径").fill("/srv/shared/uploads");
      await paths.getByLabel("release 的路径").fill("/srv/library/releases/current");
      await paths.getByLabel("logs 的路径").fill("~deploy/logs");
      await expect(paths.locator('[data-setting][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交部署设置");
      await answerQuiz(page, "paths.server.json");
      await expectChapterDone(page);

      // 03 整理上传目录：先踩一次同名覆盖，重置后再做对。
      await open("files");
      const files = page.getByTestId("command-line-files");
      await expect(files.locator('[data-goal="lost"]')).toHaveAttribute("data-ok", "true");
      await run(files, "mkdir docs", "mv inbox/report.pdf docs/", "mv inbox/old/report.pdf docs/");
      await expect(files.locator('[data-goal="lost"]')).toHaveAttribute("data-ok", "false");
      await files.getByRole("button", { name: "清空记录并重置" }).click();
      await expect(files.locator('[data-goal="lost"]')).toHaveAttribute("data-ok", "true");
      await run(
        files,
        "mkdir images docs",
        "mv inbox/*.jpg inbox/*.png images/",
        "mv inbox/report.pdf inbox/manual.pdf docs/",
        "mv inbox/old/report.pdf docs/report-2025.pdf",
        "rm inbox/*.tmp inbox/old/*.tmp",
        "rmdir inbox/old",
      );
      await expect(files.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交整理结果");
      await expectChapterDone(page);

      // 04 读日志：答案从日志里查出来。
      await open("reading");
      const logs = page.getByTestId("command-line-logs");
      await run(logs, `grep '" 500 ' access.log | head -n 1`, `grep -c '" 500 ' access.log`);
      await expect(logs.getByTestId("terminal-output")).toContainText(LOG_ANSWERS.first);
      for (const item of LOG_QUESTIONS) {
        if (item.id === "cause") await logs.getByLabel("数据库的连接数用完了").check();
        else await logs.getByLabel(item.question).fill(LOG_ANSWERS[item.id]);
      }
      await passLab(page, "提交答案");
      await answerQuiz(page, "logs.server.json");
      await expectChapterDone(page);

      // 05 管道：先排序再计数，追加到周报。
      await open("pipes");
      const pipes = page.getByTestId("command-line-pipes");
      await expect(pipes.locator('[data-goal="top"]')).toHaveAttribute("data-ok", "false");
      await run(pipes, `cut -d ' ' -f 1 ${LOG} | sort | uniq -c | sort -rn | head -n 3 >> weekly-report.txt`);
      await expect(pipes.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交周报");
      await expectChapterDone(page);

      // 06 权限：开够，不多开。
      await open("permissions");
      const perms = page.getByTestId("command-line-perms");
      await expect(perms.locator('[data-scenario="read-page"]')).toHaveAttribute("data-ok", "false");
      await expect(perms.locator('[data-scenario="leak-db"]')).toHaveAttribute("data-ok", "false");
      const modes: Record<string, string> = {
        "/srv/library/static": "750",
        "/srv/library/static/index.html": "640",
        "/srv/library/uploads": "775",
        "/srv/library/bin/deploy.sh": "750",
        "/srv/library/config": "750",
        "/srv/library/config/db.env": "640",
      };
      await perms.getByLabel("/srv/library/uploads 的权限").fill("777");
      await expect(perms.locator('[data-scenario="guest-upload"]')).toHaveAttribute("data-ok", "false");
      for (const [target, mode] of Object.entries(modes)) await perms.getByLabel(`${target} 的权限`).fill(mode);
      await expect(perms.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交权限设置");
      await answerQuiz(page, "perms.server.json");
      await expectChapterDone(page);

      // 07 进程：找出占着 80 端口的旧进程，TERM 结束它，交给 systemd。
      await open("processes");
      const processes = page.getByTestId("command-line-processes");
      await run(processes, "sudo systemctl restart library-web");
      await expect(processes.getByTestId("terminal-output")).toContainText("failed");
      await run(processes, "ss -ltnp");
      await expect(processes.getByTestId("terminal-output")).toContainText("pid=812");
      await run(processes, "kill 812", "sudo systemctl start library-web", "curl -I localhost");
      await expect(processes.getByTestId("terminal-output")).toContainText("1.4.0");
      await expect(processes.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交处理结果");
      await expectChapterDone(page);

      // 08 PATH：现在能用，下次登录也能用。
      await open("environment");
      const env = page.getByTestId("command-line-env");
      const line = "export PATH=/opt/node20/bin:$PATH:/opt/libctl/bin";
      await run(env, line);
      await expect(env.locator('[data-check="node"] [data-when="now"]')).toHaveAttribute("data-ok", "true");
      await expect(env.locator('[data-check="node"] [data-when="later"]')).toHaveAttribute("data-ok", "false");
      await run(env, `echo '${line}' >> ~/.bashrc`);
      await expect(env.locator('[data-when][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交环境设置");
      await answerQuiz(page, "env.server.json");
      await expectChapterDone(page);

      // 09 磁盘满了：删掉还开着的日志不够，要重启服务。
      await open("disk-full");
      const disk = page.getByTestId("command-line-disk");
      await run(disk, "df -h", "du -sh /var/log/library/*", "rm /var/log/library/debug.log", "df -h");
      await expect(disk.getByTestId("terminal-output")).not.toContainText(" 24% ");
      await run(disk, "sudo systemctl restart library-web", "df -h", "curl -I localhost");
      await expect(disk.getByTestId("terminal-output")).toContainText("200 OK");
      await passLab(page, "提交处理结果");
      await expectChapterDone(page);

      // 10 结业测验 → 结课。
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
