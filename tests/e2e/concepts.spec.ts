import { expect, test, type Page } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  login,
} from "./helpers";

async function savedConceptStep(page: Page, blockId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const current = await (await fetch("/api/enrollments/current")).json();
    const lessonId = current?.data?.enrollment?.currentLessonId;
    if (!lessonId) return -1;
    const response = await (await fetch(`/api/learning/states/${lessonId}`)).json();
    const state = response?.data?.state;
    const block = state?.blocks?.[id];
    return typeof block?.conceptStep === "number"
      ? block.conceptStep
      : typeof state?.conceptStep === "number"
        ? state.conceptStep
        : -1;
  }, blockId);
}

async function joinAndOpen(
  page: Page,
  slug: string,
  articleTitle: RegExp,
  conceptId: string,
) {
  const student = await createTestStudent(`concept-${slug}`);
  const course = await getCourseBySlug(slug);
  await login(page, student.email, student.password);
  await page.goto(`/courses/${course.slug}`);
  await page.getByRole("button", { name: "参加课程" }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`));
  await page.getByRole("link", { name: articleTitle }).first().click();
  const concept = page.locator(`[data-concept-id="${conceptId}"]`);
  await expect(concept).toBeVisible({ timeout: 20_000 });
  return { student, concept };
}

test.describe("概念动画", () => {
  test("SQL 两个概念可播放、单步、重播、展开类比边界", async ({ page }) => {
    const first = await joinAndOpen(
      page,
      "sql-injection-basics",
      /注入从哪里来/,
      "sql-injection-basics/data-vs-instruction",
    );
    try {
      const concept = first.concept;
      await concept.getByRole("button", { name: "播放动画" }).click();
      await expect(concept.getByRole("button", { name: "暂停动画" })).toBeVisible();
      await concept.getByRole("button", { name: "暂停动画" }).click();
      await concept.getByRole("button", { name: "下一步" }).click();
      await expect(concept.getByText(/2 \/ 4/)).toBeVisible();
      await concept.getByRole("button", { name: "重新播放" }).click();
      await expect(concept.getByText(/1 \/ 4/)).toBeVisible();
      await concept.getByText("类比边界与真实系统映射").click();
      await expect(concept.getByText("真实对象")).toBeVisible();

      await concept.getByRole("button", { name: "下一步" }).click();
      await expect
        .poll(() => savedConceptStep(page, "sql-origin"), { timeout: 20_000 })
        .toBe(1);
      await page.reload();
      const restored = page.locator('[data-concept-id="sql-injection-basics/data-vs-instruction"]');
      await expect(restored).toBeVisible({ timeout: 20_000 });
      await expect(restored.getByText(/2 \/ 4/)).toBeVisible();

      await page.getByRole("link", { name: /参数化查询为什么有效/ }).first().click();
      const binding = page.locator('[data-concept-id="sql-injection-basics/parameter-binding"]');
      await expect(binding).toBeVisible({ timeout: 20_000 });
      await binding.getByRole("button", { name: "参数化查询", exact: true }).click();
      await expect(binding.getByText("固定模板")).toBeVisible();
      const check = page.getByLabel("知识检查");
      await check.getByRole("radio", { name: "SQL 结构先固定，输入只作为值绑定" }).check();
      await check.getByRole("button", { name: "检查答案" }).click();
      await expect(check.getByText("判断正确")).toBeVisible();
    } finally {
      await deleteTestStudent(first.student.id);
    }
  });

  test("幂等性两个概念可切换案例并查看结果", async ({ page }) => {
    const first = await joinAndOpen(
      page,
      "idempotent-retries",
      /超时的请求到底发生了什么/,
      "idempotent-retries/lost-response",
    );
    try {
      const lost = first.concept;
      await lost.getByRole("button", { name: "响应丢失" }).click();
      await lost.getByRole("button", { name: "下一步" }).click();
      await lost.getByRole("button", { name: "下一步" }).click();
      await expect(lost.getByText("回执在网络中丢失")).toBeVisible();

      await page.getByRole("link", { name: /幂等键与去重存储/ }).first().click();
      const dedup = page.locator('[data-concept-id="idempotent-retries/deduplication"]');
      await expect(dedup).toBeVisible({ timeout: 20_000 });
      await dedup.getByRole("button", { name: "复用稳定键" }).click();
      await dedup.getByRole("button", { name: /服务端去重：关/ }).click();
      await dedup.getByRole("button", { name: "下一步" }).click();
      await dedup.getByRole("button", { name: "下一步" }).click();
      await dedup.getByRole("button", { name: "下一步" }).click();
      await expect(dedup.getByText(/实际扣款 1 次/)).toBeVisible();
    } finally {
      await deleteTestStudent(first.student.id);
    }
  });
});
