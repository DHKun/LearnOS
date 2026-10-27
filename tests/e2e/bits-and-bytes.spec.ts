import fs from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { MOJIBAKE_RECORDS, USB_FILES } from "../../content/courses/bits-and-bytes/simulation/labs";
import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/bits-and-bytes");

type QuizFile = { questions: { id: string; answer: string | string[] | boolean }[] };

async function answerQuiz(page: Page, file: string) {
  const quiz = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, "assessments", file), "utf8")) as QuizFile;
  for (const question of quiz.questions) {
    const answers = Array.isArray(question.answer) ? question.answer : [String(question.answer)];
    for (const answer of answers) {
      await page.locator(`[data-question-id="${question.id}"] input[value="${answer}"]`).check();
    }
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

test.describe("计算机通识课（bits-and-bytes）", () => {
  test("十三章全部通过真实界面与服务端验证完成，结课并获得 180 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("bits");
    const course = await getCourseBySlug("bits-and-bytes");
    const lessons = await getLessons(course.id);
    const open = async (slug: string) => {
      await page.goto(`/learn/${course.id}?lesson=${lessons.find((item) => item.slug === slug)!.id}`);
      await expect(page.locator("main main h1")).toBeVisible({ timeout: 20_000 });
    };

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await expect(page.getByRole("heading", { name: "0 和 1 的世界：计算机怎么表示信息" })).toBeVisible();
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      // 01 手动完成；开关可以点。
      await open("why-binary");
      const switches = page.locator('[data-concept-id="bits-and-bytes/switches"]');
      await switches.getByRole("button", { name: "下一步" }).click();
      await switches.getByRole("button", { name: "下一步" }).click();
      await switches.getByRole("button", { name: "第 1 个开关：关" }).click();
      await expect(switches.getByText("二进制 11001011")).toBeVisible();
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 灯带：十进制 24 被当成十六进制。
      await open("hex");
      const led = page.getByTestId("bits-and-bytes-led");
      await expect(led.getByText("现在亮的是第 3、6 颗，和目标不一致。")).toBeVisible();
      await led.getByLabel("灯带 1 配置值").fill("18");
      await led.getByLabel("灯带 2 配置值").fill("F0");
      await led.getByLabel("灯带 3 配置值").fill("DA");
      await passLab(page, "提交三条灯带的配置");
      await expectChapterDone(page);

      // 03 容量与字节序。
      await open("bytes");
      const size = page.getByTestId("bits-and-bytes-size");
      await size.getByLabel("系统会把容量显示为约多少 GB？（取整数）").fill("931");
      await size.getByLabel("理想情况下，下载速度最多每秒多少 MB（兆字节）？").fill("12.5");
      await size.getByLabel("这个数是多少？").fill("258");
      await size.getByLabel("小端序（低位字节在前）").check();
      await size.getByLabel("它最大能存到多少？").fill("65535");
      await passLab(page, "提交答案");
      await answerQuiz(page, "bytes.server.json");
      await expectChapterDone(page);

      // 04 整数类型：初始配置溢出。
      await open("integers");
      const ints = page.getByTestId("bits-and-bytes-int");
      await expect(ints.locator('[data-goal="correct"]')).toHaveAttribute("data-ok", "false");
      await ints.getByLabel("金币 类型").selectOption("uint32");
      await ints.getByLabel("玩家编号 类型").selectOption("uint32");
      await ints.getByLabel("生命值变化 类型").selectOption("int16");
      await expect(ints.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交类型配置");
      await answerQuiz(page, "integers.server.json");
      await expectChapterDone(page);

      // 05 钱包。
      await open("decimals");
      const money = page.getByTestId("bits-and-bytes-money");
      await expect(money.getByText(/余额不足/).first()).toBeVisible();
      await money.getByLabel("金额怎么存").selectOption("cents");
      await money.getByLabel("什么时候四舍五入到分").selectOption("line");
      await money.getByLabel("界面怎么显示").selectOption("fixed");
      await expect(money.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交钱包设置");
      await expectChapterDone(page);

      // 06 UTF-8。
      await open("unicode");
      const utf8 = page.getByTestId("bits-and-bytes-utf8");
      await utf8.getByLabel("这段文本一共有几个字符？").fill("5");
      await utf8.getByLabel("一共占多少个字节？").fill("12");
      await utf8.getByLabel("最后一个字符从第几个字节开始？（从 0 开始数）").fill("8");
      await utf8.getByLabel(/最后一个字符坏了/).check();
      await passLab(page, "提交答案");
      await answerQuiz(page, "text.server.json");
      await expectChapterDone(page);

      // 07 乱码：先用试验台验证一个猜想。
      await open("mojibake");
      const mojibake = page.getByTestId("bits-and-bytes-mojibake");
      await mojibake.getByLabel("试验台解码方式").selectOption("utf-8");
      await expect(mojibake.getByText("你好", { exact: true })).toBeVisible();
      for (const record of MOJIBAKE_RECORDS) {
        await mojibake.getByLabel(`${record.source} 的原因`).selectOption(record.cause);
        await mojibake.getByLabel(`${record.source} 能否恢复`).selectOption(record.recoverable);
      }
      await passLab(page, "提交诊断报告");
      await expectChapterDone(page);

      // 08 配色。
      await open("color");
      const color = page.getByTestId("bits-and-bytes-color");
      await expect(color.locator('[data-goal="button"]')).toHaveAttribute("data-ok", "false");
      await color.getByLabel("按钮底色 颜色值").fill("#1F5FAD");
      await color.getByLabel("亮色模式的链接色 颜色值").fill("#1F5FAD");
      await color.getByLabel("暗色模式的链接色 颜色值").fill("#6AA6F0");
      await expect(color.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交配色");
      await expectChapterDone(page);

      // 09 图片。
      await open("images");
      const images = page.getByTestId("bits-and-bytes-image");
      await expect(images.locator('[data-image="icon"]')).toContainText("背景变成了白底");
      await images.getByLabel("首页大图（照片） 格式").selectOption("jpeg");
      await images.getByLabel("首页大图（照片） 尺寸").selectOption("half");
      await images.getByLabel("Logo（纯色块 + 文字） 格式").selectOption("png");
      await images.getByLabel("应用图标（透明背景、柔和阴影） 格式").selectOption("png");
      await expect(images.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交图片方案");
      await answerQuiz(page, "images.server.json");
      await expectChapterDone(page);

      // 10 文件头。
      await open("file-headers");
      const header = page.getByTestId("bits-and-bytes-header");
      for (const file of USB_FILES) {
        await header.getByLabel(`${file.name} 的类型`).selectOption(file.type);
        await header.getByLabel(`${file.name} 的状态`).selectOption(file.status);
      }
      await header.getByLabel("holiday.jpg 宽度").fill("1920");
      await header.getByLabel("cat.png 文件头").fill("89 50 4E 47 0D 0A 1A 0A");
      await expect(header.getByText("现在是合法的 PNG 签名")).toBeVisible();
      await passLab(page, "提交检查结果");
      await answerQuiz(page, "files.server.json");
      await expectChapterDone(page);

      // 11 奇偶校验。
      await open("checksum");
      const parity = page.getByTestId("bits-and-bytes-parity");
      await parity.getByLabel("第一组 第 4 行第 6 列").click();
      await expect(parity.getByText("LearnOS!", { exact: true })).toBeVisible();
      await parity.getByLabel(/只能要求重发/).check();
      await passLab(page, "提交修复结果");
      await expectChapterDone(page);

      // 12 修复成绩单：先用工具把名字编码成 UTF-8。
      await open("repair");
      const repair = page.getByTestId("bits-and-bytes-repair");
      await expect(repair.getByText("签名不是 SCOR，官方读取器不认这个文件")).toBeVisible();
      await repair.getByLabel("要编码的文字").fill("林小满");
      await expect(repair.getByText("E6 9E 97 E5 B0 8F E6 BB A1")).toBeVisible();
      await repair.getByLabel("文件字节").fill("53 43 4F 52 00 17 01 09 E6 9E 97 E5 B0 8F E6 BB A1 62 5F 57 01 18 0A");
      await passLab(page, "提交修好的文件");
      await expectChapterDone(page);

      // 13 结业测验 → 结课。
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
