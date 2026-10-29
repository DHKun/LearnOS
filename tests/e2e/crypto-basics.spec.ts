import fs from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/crypto-basics");

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

test.describe("密码学入门（crypto-basics）", () => {
  test("八章全部通过真实界面与服务端验证完成，结课并获得 130 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("crypto");
    const course = await getCourseBySlug("crypto-basics");
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

      await open("goals");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 镜像：算出每个镜像的文件指纹，和官网的比。
      await open("hashing");
      const mirror = page.getByTestId("crypto-basics-mirror");
      for (const id of ["a", "b", "c", "d"]) await mirror.locator(`[data-mirror="${id}"]`).getByRole("button", { name: /计算下载到的文件的指纹/ }).click();
      for (const id of ["a", "c"]) await mirror.locator(`[data-mirror="${id}"]`).getByLabel("可以放心从这里下载").check();
      await mirror.getByLabel(/篡改文件的人也能顺手改掉指纹/).check();
      await passLab(page, "提交判断");
      await answerQuiz(page, "hash.server.json");
      await expectChapterDone(page);

      // 03 存密码：加盐慢哈希，强度要合适。
      await open("passwords");
      const password = page.getByTestId("crypto-basics-password");
      await password.getByLabel(/专门设计得很慢的密码哈希/).check();
      await password.getByLabel("3 秒").check();
      await expect(password.locator('[data-goal="login"]')).toHaveAttribute("data-ok", "false");
      await password.getByLabel("100 毫秒").check();
      await expect(password.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交方案");
      await expectChapterDone(page);

      // 04 对称加密。
      await open("symmetric");
      const symmetric = page.getByTestId("crypto-basics-symmetric");
      await symmetric.getByLabel(/计数器模式/).check();
      await expect(symmetric.locator('[data-goal="repeat"]')).toHaveAttribute("data-ok", "false");
      await symmetric.getByLabel("每条消息重新生成").check();
      await symmetric.getByLabel("事先当面交给对方").check();
      await expect(symmetric.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交设置");
      await answerQuiz(page, "symmetric.server.json");
      await expectChapterDone(page);

      // 05 公钥：馆长的公钥加密，你的私钥签名。
      await open("public-key");
      const pub = page.getByTestId("crypto-basics-public");
      await pub.locator('fieldset:has-text("加密")').getByLabel("馆长的公钥").check();
      await pub.locator('fieldset:has-text("签名")').getByLabel("你的私钥").check();
      await expect(pub.locator('[data-goal][data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交选择");
      await expectChapterDone(page);

      // 06 签名：先验证，再判断。
      await open("signatures");
      const signature = page.getByTestId("crypto-basics-signature");
      for (const id of ["a", "b", "c"]) await signature.locator(`[data-announcement="${id}"]`).getByRole("button", { name: /验证签名/ }).click();
      await expect(signature.locator('[data-announcement="b"]')).toContainText("签名与内容匹配");
      await expect(signature.locator('[data-announcement="c"]')).toContainText("签名与内容不匹配");
      const verdicts: Record<string, string> = { a: "trust", b: "wrong-key", c: "tampered", d: "unsigned" };
      for (const [id, verdict] of Object.entries(verdicts)) await signature.getByLabel(`公告 ${id.toUpperCase()} 的判断`).selectOption(verdict);
      await passLab(page, "提交判断");
      await answerQuiz(page, "signature.server.json");
      await expectChapterDone(page);

      // 07 证书。
      await open("https");
      const cert = page.getByTestId("crypto-basics-certificate");
      const certs: Record<string, string> = { home: "ok", api: "ok", cafe: "untrusted", old: "expired", apex: "name", lookalike: "elsewhere" };
      for (const [id, verdict] of Object.entries(certs)) await cert.locator(`[data-certificate="${id}"] select`).selectOption(verdict);
      await passLab(page, "提交判断");
      await answerQuiz(page, "https.server.json");
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
