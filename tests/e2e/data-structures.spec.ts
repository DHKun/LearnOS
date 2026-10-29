import fs from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { bfs } from "../../content/courses/data-structures/simulation/algorithms";
import { ABSENT, FLOOR, PRESENT, SHELF, START, TARGET } from "../../content/courses/data-structures/simulation/labs";
import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/data-structures");

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

/** The indexes a binary search looks at (plus the bracketing neighbour when the value is absent). */
function binary(target: number): number[] {
  const seen: number[] = [];
  let lo = 0;
  let hi = SHELF.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    seen.push(mid);
    if (SHELF[mid] === target) break;
    if (SHELF[mid]! < target) lo = mid + 1;
    else hi = mid - 1;
  }
  if (!SHELF.includes(target)) {
    const lower = SHELF.findIndex((value) => value > target) - 1;
    for (const index of [lower, lower + 1]) if (!seen.includes(index)) seen.push(index);
  }
  return seen;
}

function shortestPath(): [number, number][] {
  const fromTarget = bfs(FLOOR, TARGET);
  const out: [number, number][] = [];
  let current = START;
  while (current.join() !== TARGET.join()) {
    const d = fromTarget.get(current.join(","))!;
    const [x, y] = current;
    current = ([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]).find((cell) => fromTarget.get(cell.join(",")) === d - 1)!;
    out.push(current);
  }
  return out;
}

test.describe("数据结构与算法入门（data-structures）", () => {
  test("八章全部通过真实界面与服务端验证完成，结课并获得 130 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("ds");
    const course = await getCourseBySlug("data-structures");
    const lessons = await getLessons(course.id);
    const open = async (slug: string) => {
      await page.goto(`/learn/${course.id}?lesson=${lessons.find((item) => item.slug === slug)!.id}`);
      await expect(page.locator("main main h1")).toBeVisible({ timeout: 20_000 });
    };

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await expect(page.getByTestId("course-path-context")).toContainText("第 3 / 7 门");
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      await open("growth");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 二分查找：找到一本，再确认另一本不在。
      await open("search");
      const search = page.getByTestId("data-structures-search");
      for (const index of binary(PRESENT)) await search.getByRole("button", { name: `第 ${index + 1} 本`, exact: true }).click();
      await expect(search.locator('[data-goal="found"]')).toHaveAttribute("data-ok", "true");
      await search.getByRole("tab", { name: new RegExp(`确认 ${ABSENT}`) }).click();
      for (const index of binary(ABSENT)) await search.getByRole("button", { name: `第 ${index + 1} 本`, exact: true }).click();
      await expect(search.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交查找记录");
      await answerQuiz(page, "search.server.json");
      await expectChapterDone(page);

      // 03 数组与链表。
      await open("arrays-lists");
      const structure = page.getByTestId("data-structures-structure");
      await expect(structure.locator('[data-goal="new-books"]')).toHaveAttribute("data-ok", "false");
      await structure.locator('fieldset:has-text("新书登记")').getByLabel("链表").check();
      await structure.locator('fieldset:has-text("预约排队")').getByLabel("链表").check();
      await expect(structure.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交选择");
      await expectChapterDone(page);

      // 04 栈与队列。
      await open("stacks-queues");
      const queue = page.getByTestId("data-structures-queue");
      for (const label of ["借书窗口叫号用", "打印借阅单用"]) await queue.locator(`fieldset:has-text("${label}")`).getByLabel("队列（先进先出）").check();
      await expect(queue.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交选择");
      await answerQuiz(page, "queue.server.json");
      await expectChapterDone(page);

      // 05 哈希。
      await open("hashing");
      const hash = page.getByTestId("data-structures-hash");
      await hash.getByLabel("整个号码除以格子数，看余数").check();
      await expect(hash.locator('[data-goal="chain"]')).toHaveAttribute("data-ok", "false");
      await hash.getByLabel("97 个").check();
      await expect(hash.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交方案");
      await answerQuiz(page, "hash.server.json");
      await expectChapterDone(page);

      // 06 排序。
      await open("sorting");
      const sort = page.getByTestId("data-structures-sort");
      await sort.getByLabel(/只有 5 本放错了位置 的排序方法/).selectOption("insertion");
      await sort.getByLabel(/顺序完全打乱 的排序方法/).selectOption("quick");
      await sort.getByLabel(/同一年的要保持书名顺序 的排序方法/).selectOption("quick");
      await expect(sort.locator('[data-goal="stable"]')).toHaveAttribute("data-ok", "false");
      await sort.getByLabel(/同一年的要保持书名顺序 的排序方法/).selectOption("merge");
      await expect(sort.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交选择");
      await answerQuiz(page, "sort.server.json");
      await expectChapterDone(page);

      // 07 最短路线。
      await open("graphs");
      const route = page.getByTestId("data-structures-route");
      for (const [x, y] of shortestPath()) await route.getByRole("button", { name: new RegExp(`^${x},${y}`) }).click();
      await expect(route.getByTestId("route-moves")).toContainText("到达科幻区");
      await passLab(page, "提交路线");
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
