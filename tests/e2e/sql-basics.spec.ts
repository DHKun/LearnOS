import fs from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/sql-basics");

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

/** Replaces the query, runs it, and waits for a result or an error. */
async function runQuery(lab: Locator, sql: string) {
  await lab.getByLabel("SQL").fill(sql);
  await lab.getByRole("button", { name: "运行查询" }).click();
  await expect(lab.getByTestId("query-output")).not.toContainText("运行之后");
}

async function runStatements(lab: Locator, ...statements: string[]) {
  for (const sql of statements) {
    await lab.getByLabel("SQL").fill(sql);
    await lab.getByRole("button", { name: "运行", exact: true }).click();
    await expect(lab.getByLabel("SQL")).toHaveValue("");
  }
}

test.describe("数据库与 SQL（sql-basics）", () => {
  test("九章全部通过真实界面与服务端验证完成，结课并获得 140 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("sql");
    const course = await getCourseBySlug("sql-basics");
    const lessons = await getLessons(course.id);
    const open = async (slug: string) => {
      await page.goto(`/learn/${course.id}?lesson=${lessons.find((item) => item.slug === slug)!.id}`);
      await expect(page.locator("main main h1")).toBeVisible({ timeout: 20_000 });
    };

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await expect(page.getByTestId("course-path-context")).toContainText("第 1 / 6 门");
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      await open("tables");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 逾期：= NULL 查不出东西。
      await open("select-where");
      const overdue = page.getByTestId("sql-basics-overdue");
      await runQuery(overdue, "SELECT * FROM loans WHERE returned = NULL");
      await expect(overdue.getByTestId("query-output")).toContainText("(0 行");
      await runQuery(overdue, "SELECT id, reader_id, due FROM loans WHERE returned IS NULL AND due < CURRENT_DATE");
      await expect(overdue.getByTestId("query-output")).toContainText("(11 行");
      await passLab(page, "提交查询");
      await answerQuiz(page, "where.server.json");
      await expectChapterDone(page);

      // 03 最新上架。
      await open("order-limit");
      const latest = page.getByTestId("sql-basics-latest");
      await expect(latest.getByLabel("SQL")).toHaveValue(/ORDER BY added/);
      await runQuery(latest, "SELECT title, added FROM books WHERE status = 'available' ORDER BY added DESC LIMIT 5");
      await expect(latest.getByTestId("query-output")).toContainText("我与地坛");
      await passLab(page, "提交查询");
      await expectChapterDone(page);

      // 04 超过上限：WHERE 里不能用聚合。
      await open("group-by");
      const limit = page.getByTestId("sql-basics-overLimit");
      await runQuery(limit, "SELECT reader_id FROM loans WHERE COUNT(*) > 5");
      await expect(limit.getByTestId("query-output")).toContainText("aggregate functions are not allowed in WHERE");
      await runQuery(limit, "SELECT r.name, COUNT(*) AS n FROM loans l JOIN readers r ON r.id = l.reader_id WHERE l.returned IS NULL GROUP BY r.id HAVING COUNT(*) > 5");
      await passLab(page, "提交查询");
      await answerQuiz(page, "group.server.json");
      await expectChapterDone(page);

      // 05 报表：LEFT JOIN + COUNT(l.id)。
      await open("join");
      const report = page.getByTestId("sql-basics-report");
      await runQuery(report, "SELECT r.id, r.name, COUNT(l.id) AS loans FROM readers r LEFT JOIN loans l ON l.reader_id = r.id GROUP BY r.id ORDER BY r.id");
      await expect(report.getByTestId("query-output")).toContainText("(14 行");
      await passLab(page, "提交查询");
      await answerQuiz(page, "join.server.json");
      await expectChapterDone(page);

      // 06 增删改：外键先拦一次。
      await open("modify");
      const modify = page.getByTestId("sql-basics-modify");
      await runStatements(modify, "DELETE FROM readers WHERE id = 14");
      await expect(modify.getByTestId("console-output")).toContainText("violates foreign key constraint");
      await runStatements(
        modify,
        "INSERT INTO books (title, author, category, added, copies) VALUES ('雪国', '川端康成', '文学', CURRENT_DATE, 2)",
        "UPDATE readers SET email = 'chenxiao@mail.test' WHERE id = 9",
        "DELETE FROM loans WHERE reader_id = 14",
        "DELETE FROM readers WHERE id = 14",
      );
      await expect(modify.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交检查");
      await expectChapterDone(page);

      // 07 事务：出错中止 → ROLLBACK → 重来并 COMMIT。
      await open("transactions");
      const tx = page.getByTestId("sql-basics-transaction");
      await runStatements(tx, "UPDATE books SET copies = copies + 1 WHERE id = 1", "BEGIN", "UPDATE books SET copies = copies - 1 WHERE id = 1", "INSERT INTO loans (book_id, reader_id, borrowed, due) VALUES (1, 44, CURRENT_DATE, CURRENT_DATE + 14)");
      await expect(tx.getByTestId("tx-banner")).toContainText("ROLLBACK");
      await runStatements(tx, "ROLLBACK", "BEGIN", "UPDATE books SET copies = copies - 1 WHERE id = 1", "INSERT INTO loans (book_id, reader_id, borrowed, due) VALUES (1, 4, CURRENT_DATE, CURRENT_DATE + 14)");
      await expect(tx.locator('[data-goal="loan"]')).toHaveAttribute("data-ok", "false");
      await runStatements(tx, "COMMIT");
      await expect(tx.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交检查");
      await answerQuiz(page, "transaction.server.json");
      await expectChapterDone(page);

      // 08 事故恢复。
      await open("incident");
      const incident = page.getByTestId("sql-basics-incident");
      await runStatements(
        incident,
        "SELECT * FROM returns_log",
        "BEGIN",
        "UPDATE loans SET returned = (SELECT b.returned FROM loans_backup b WHERE b.id = loans.id) WHERE id NOT IN (SELECT loan_id FROM returns_log)",
        "COMMIT",
      );
      await expect(incident.getByTestId("console-output")).toContainText("UPDATE 45");
      await passLab(page, "提交修复结果");
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
