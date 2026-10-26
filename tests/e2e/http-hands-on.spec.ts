import fs from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getEnrollments,
  getLessons,
  getPointsTotal,
} from "./helpers";
import { login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/http-hands-on");
const SHOTS = process.env.E2E_SCREENSHOT_DIR;

type QuizFile = { questions: { id: string; answer: string | string[] | boolean }[] };

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function expectChapterDone(page: Page) {
  await expect(page.getByText(/本章已完成/).first()).toBeVisible({ timeout: 20_000 });
}

async function passLab(page: Page, submitLabel: string | RegExp) {
  await page.getByRole("button", { name: submitLabel }).click();
  await expect(page.getByText("服务端验证通过").first()).toBeVisible({ timeout: 20_000 });
}

async function answerQuiz(page: Page, file: string) {
  const quiz = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, "assessments", file), "utf8")) as QuizFile;
  for (const question of quiz.questions) {
    const raw = question.answer;
    const answers = Array.isArray(raw) ? raw : [typeof raw === "boolean" ? String(raw) : raw];
    for (const answer of answers) {
      await page.locator(`[data-question-id="${question.id}"] input[value="${answer}"]`).check();
    }
  }
  await page.getByRole("button", { name: "提交知识检查" }).click();
  await expect(page.getByText("本章知识检查已通过")).toBeVisible({ timeout: 20_000 });
}

async function setRequest(
  page: Page,
  id: string,
  request: { method?: string; url?: string; headers?: [string, string][]; body?: string },
) {
  if (request.method) await page.getByLabel(`${id} 方法`).selectOption(request.method);
  if (request.url) await page.getByLabel(`${id} URL`).fill(request.url);
  if (request.headers) {
    for (const [index, [name, value]] of request.headers.entries()) {
      const nameBox = page.getByLabel(`${id} 请求头 ${index + 1} 名称`);
      if ((await nameBox.count()) === 0) await page.getByRole("button", { name: "添加请求头" }).click();
      await page.getByLabel(`${id} 请求头 ${index + 1} 名称`).fill(name);
      await page.getByLabel(`${id} 请求头 ${index + 1} 值`).fill(value);
    }
  }
  if (request.body !== undefined) await page.getByLabel(`${id} 正文`).fill(request.body);
  await page.getByRole("button", { name: "发送请求" }).click();
}

test.describe("HTTP 实战课程（http-hands-on）", () => {
  test("十三章全部通过真实界面与服务端验证完成，结课并获得 180 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("hands-on");
    const course = await getCourseBySlug("http-hands-on");
    const lessons = await getLessons(course.id);
    const open = async (slug: string) => {
      const lesson = lessons.find((item) => item.slug === slug)!;
      await page.goto(`/learn/${course.id}?lesson=${lesson.id}`);
      await expect(page.locator("article, main").first()).toBeVisible({ timeout: 20_000 });
    };

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await expect(page.getByRole("heading", { name: "HTTP 实战：看懂并修好每一次请求" })).toBeVisible();
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      // 01 手动完成；概念动画可单步。
      await open("first-request");
      const journey = page.locator('[data-concept-id="http-hands-on/journey"]');
      await expect(journey).toBeVisible();
      await journey.getByRole("button", { name: "下一步" }).click();
      await expect(journey.getByText("library.test 在哪？", { exact: true })).toBeVisible();
      await shot(page, "01-first-request");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 URL：片段不发送、端口错误连不上。
      await open("url");
      const urlLab = page.getByTestId("http-hands-on-url");
      await urlLab.getByRole("button", { name: "打开" }).first().click();
      await expect(urlLab.getByText("GET /api/books HTTP/1.1").first()).toBeVisible();
      await urlLab.getByLabel("任务 1 地址栏").fill("https://library.test/api/books?page=2");
      await urlLab.getByLabel("任务 2 地址栏").fill("https://library.test/api/books?q=实战");
      await urlLab.getByRole("button", { name: "打开" }).first().click();
      await shot(page, "02-url");
      await passLab(page, "提交两条修好的链接");
      await expectChapterDone(page);

      // 03 请求：先看失败记录，再按 ID 请求。
      await open("request");
      await setRequest(page, "请求实验", { url: "/api/books?q=排错" });
      await expect(page.getByText('"title": "HTTP 从入门到排错"').first()).toBeVisible();
      await setRequest(page, "请求实验", { url: "/api/books/2" });
      await shot(page, "03-request");
      await passLab(page, "提交选中的请求");
      await expectChapterDone(page);

      // 04 响应：从响应里读答案 + 正式检查。
      await open("response");
      const responseLab = page.getByTestId("http-hands-on-response");
      await responseLab.getByLabel("以后想再读取这条留言，应该请求哪个路径？").fill("/api/notes/42");
      await responseLab.getByLabel("浏览器接下来会自动请求哪个地址？").fill("https://library.test/api/books?page=1");
      for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE"]) {
        await responseLab.getByRole("checkbox", { name: method, exact: true }).check();
      }
      await responseLab.getByLabel("客户端至少应该等待多少秒再重试？").fill("120");
      await responseLab.getByLabel("服务器给的是一张 HTML 登录页，不是 JSON").check();
      await passLab(page, "提交解读");
      await answerQuiz(page, "response.server.json");
      await expectChapterDone(page);

      // 05 方法：PUT 会丢字段，PATCH 才对。
      await open("methods");
      await setRequest(page, "方法实验", {
        method: "PUT",
        headers: [["Accept", "application/json"], ["Content-Type", "application/json"]],
        body: '{"title":"TCP/IP 漫游指南"}',
      });
      await expect(page.getByText("（空）").first()).toBeVisible();
      await page.getByRole("button", { name: "提交全部请求记录" }).click();
      await expect(page.getByText(/PUT，它会用你发送的内容整体替换资源/)).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: /清空记录并重置模拟数据/ }).click();
      await setRequest(page, "方法实验", { method: "PATCH" });
      await shot(page, "05-methods");
      await passLab(page, "提交全部请求记录");
      await answerQuiz(page, "methods.server.json");
      await expectChapterDone(page);

      // 06 JSON：406 → 415 → 400 → 201。
      await open("headers-body");
      await setRequest(page, "JSON 实验", {});
      await expect(page.getByTestId("http-hands-on-json").getByText("406", { exact: true }).first()).toBeVisible();
      await setRequest(page, "JSON 实验", {
        headers: [["Accept", "application/json"], ["Content-Type", "application/json"]],
        body: '{"title":"周末读完第三章"}',
      });
      await shot(page, "06-json");
      await passLab(page, "提交最后一次发送的请求");
      await answerQuiz(page, "headers.server.json");
      await expectChapterDone(page);

      // 07 Cookie：五个场景。
      await open("cookie");
      const cookieLab = page.getByTestId("http-hands-on-cookie");
      await cookieLab.getByLabel("Path").selectOption("/");
      await cookieLab.getByLabel("SameSite").selectOption("Strict");
      await cookieLab.getByLabel("Secure").check();
      await cookieLab.getByLabel("HttpOnly").check();
      await expect(cookieLab.locator('[data-cookie-scenario="email"]')).toHaveAttribute("data-ok", "false");
      await cookieLab.getByLabel("SameSite").selectOption("Lax");
      await expect(cookieLab.locator('[data-ok="false"]')).toHaveCount(0);
      await shot(page, "07-cookie");
      await passLab(page, "提交 Cookie 配置");
      await expectChapterDone(page);

      // 08 / 09 正式检查。
      await open("auth");
      const auth = page.locator('[data-concept-id="http-hands-on/auth"]');
      await auth.getByRole("radio", { name: "读者 xiaolin" }).click();
      for (let i = 0; i < 3; i += 1) await auth.getByRole("button", { name: "下一步" }).click();
      await expect(auth.getByText("403", { exact: true })).toBeVisible();
      await shot(page, "08-auth");
      await answerQuiz(page, "auth.server.json");
      await expectChapterDone(page);

      await open("https");
      await answerQuiz(page, "https.server.json");
      await expectChapterDone(page);

      // 10 缓存回放。
      await open("cache");
      const cacheLab = page.getByTestId("http-hands-on-cache");
      await expect(cacheLab.getByText("⚠ 过期内容").first()).toBeVisible();
      await cacheLab.getByLabel("/index.html 缓存策略").selectOption("no-cache");
      await cacheLab.getByLabel("/app.[hash].js 缓存策略").selectOption("max-age=31536000, immutable");
      await cacheLab.getByLabel("/api/loans 缓存策略").selectOption("no-store");
      await expect(cacheLab.getByText("⚠ 过期内容")).toHaveCount(0);
      await shot(page, "10-cache");
      await passLab(page, "提交缓存策略");
      await expectChapterDone(page);

      // 11 Network 面板诊断。
      await open("debugging");
      const answers: Record<string, string> = {
        "https://library.test/account/loans": "ok",
        "https://library.test/app.8c21.js": "ok",
        "https://cdn.libary.test/fonts/kai.woff2": "dns",
        "https://library.test/api/loans": "cookie",
        "https://library.test/api/recommendations": "server",
        "https://library.test/api/books/2": "ok",
        "https://library.test/api/loans/12": "media",
        "https://library.test/favicon.ico": "harmless",
      };
      for (const [url, value] of Object.entries(answers)) {
        await page.getByLabel(`${url} 的判断`).selectOption(value);
      }
      await page.getByLabel(/根因是哪一条请求/).selectOption("loans");
      await shot(page, "11-debugging");
      await passLab(page, "提交诊断报告");
      await expectChapterDone(page);

      // 12 综合任务：登录 → 借书，Cookie 由浏览器自动附上。
      await open("practice");
      await setRequest(page, "综合任务", {
        method: "POST",
        url: "/api/session",
        headers: [["Accept", "application/json"], ["Content-Type", "application/json"]],
        body: '{"username":"xiaolin","password":"read-more"}',
      });
      await expect(page.getByText(/sid=sid-xiaolin-/).first()).toBeVisible();
      await setRequest(page, "综合任务", { url: "/api/loans", body: '{"bookId":8}' });
      await expect(page.getByText(/HTTP 实战手册（第 2 版）/).first()).toBeVisible();
      await shot(page, "12-practice");
      await passLab(page, "提交全部请求记录");
      await expectChapterDone(page);

      // 13 结业测验 → 结课。
      await open("final");
      await answerQuiz(page, "final.server.json");
      await expect(page.getByText("课程已完成，当前为只读复习模式")).toBeVisible({ timeout: 20_000 });

      const enrollments = await getEnrollments(student.id);
      expect(enrollments[0].status).toBe("completed");
      // 13 × 10 + 结业 50
      expect(await getPointsTotal(student.id)).toBe(180);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
