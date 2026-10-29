import fs from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { ARRAY_BROKEN, STACK_BROKEN, SUM_BROKEN, traceAnswers } from "../../content/courses/how-programs-run/simulation/labs";
import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/how-programs-run");

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

/** Puts a program in the editor and runs the tests. */
async function runProgram(lab: Locator, source: string) {
  await lab.getByLabel("程序").fill(source);
  await lab.getByRole("button", { name: "运行测试" }).click();
  await expect(lab.getByTestId("tests")).toBeVisible();
}

test.describe("程序是怎么跑起来的（how-programs-run）", () => {
  test("八章全部通过真实界面与服务端验证完成，结课并获得 130 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("hpr");
    const course = await getCourseBySlug("how-programs-run");
    const lessons = await getLessons(course.id);
    const open = async (slug: string) => {
      await page.goto(`/learn/${course.id}?lesson=${lessons.find((item) => item.slug === slug)!.id}`);
      await expect(page.locator("main main h1")).toBeVisible({ timeout: 20_000 });
    };

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await expect(page.getByTestId("course-path-context")).toContainText("第 2 / 6 门");
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      await open("parts");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 单步跟踪，答案从调试器里读出来。
      await open("instructions");
      const traceLab = page.getByTestId("how-programs-run-trace");
      await traceLab.getByRole("button", { name: "下一步" }).click();
      await expect(traceLab.locator('[data-register="R0"]')).toContainText("8");
      await traceLab.getByRole("button", { name: "运行到底" }).click();
      await expect(traceLab.getByTestId("debugger-output")).toContainText("37");
      const answers = traceAnswers();
      await traceLab.getByLabel("程序结束时，地址 [20] 里是多少？").fill(String(answers.subtotal));
      await traceLab.getByLabel("程序结束时，地址 [21] 里是多少？").fill(String(answers.total));
      await traceLab.getByLabel(/一共执行了几条指令/).fill(String(answers.steps));
      await traceLab.getByLabel("数量").fill("1");
      await traceLab.getByRole("button", { name: "运行到底" }).click();
      await expect(traceLab.getByTestId("debugger-output")).toContainText(String(answers.single));
      await traceLab.getByLabel(/如果把 \[11\] 改成 1/).fill(String(answers.single));
      await passLab(page, "提交答案");
      await answerQuiz(page, "instructions.server.json");
      await expectChapterDone(page);

      // 03 循环：先看到测试失败，再改成先判断后做。
      await open("loops");
      const loop = page.getByTestId("how-programs-run-loop");
      await runProgram(loop, SUM_BROKEN);
      await expect(loop.getByTestId("tests").locator('[data-ok="false"]')).not.toHaveCount(0);
      const fixed = SUM_BROKEN.replace(
        "loop: ADD R2, R1      ; sum = sum + i\n      ADD R1, 1       ; i = i + 1\n      CMP R1, R0\n      JLT loop        ; i < N 就继续",
        "loop: CMP R0, R1\n      JLT done\n      ADD R2, R1\n      ADD R1, 1\n      JMP loop\ndone:",
      );
      await runProgram(loop, fixed);
      await expect(loop.getByTestId("tests").locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交程序");
      await expectChapterDone(page);

      // 04 数组越界。
      await open("memory");
      const array = page.getByTestId("how-programs-run-array");
      await runProgram(array, ARRAY_BROKEN.replace("CMP R1, 36", "CMP R1, 35"));
      await expect(array.getByTestId("tests").locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交程序");
      await answerQuiz(page, "memory.server.json");
      await expectChapterDone(page);

      // 05 栈。
      await open("stack");
      const stack = page.getByTestId("how-programs-run-stack");
      await runProgram(stack, STACK_BROKEN);
      await expect(stack.getByTestId("tests")).toContainText("栈满了");
      await runProgram(stack, STACK_BROKEN.replace("      RET", "      POP R1\n      RET"));
      await expect(stack.getByTestId("tests").locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交程序");
      await expectChapterDone(page);

      // 06 缓存。
      await open("cache");
      const cache = page.getByTestId("how-programs-run-cache");
      await expect(cache.locator('[data-task][data-ok="false"]')).toHaveCount(3);
      await cache.getByLabel("外层按行，内层按列").check();
      await cache.getByLabel("先放 32 个借阅数，再放 32 个罚金").check();
      await cache.getByLabel("从地址 24 开始").check();
      await expect(cache.locator('[data-task][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交选择");
      await answerQuiz(page, "cache.server.json");
      await expectChapterDone(page);

      // 07 调度：时间片太大太小都不行。
      await open("os");
      const schedule = page.getByTestId("how-programs-run-schedule");
      await schedule.getByLabel(/轮转/).check();
      await schedule.getByLabel("2 毫秒").check();
      await expect(schedule.locator('[data-goal="overhead"]')).toHaveAttribute("data-ok", "false");
      await schedule.getByLabel("5 毫秒").check();
      await expect(schedule.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交调度方式");
      await answerQuiz(page, "os.server.json");
      await expectChapterDone(page);

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
