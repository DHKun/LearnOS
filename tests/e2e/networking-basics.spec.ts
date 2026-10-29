import fs from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { DNS_RECORDS } from "../../content/courses/networking-basics/simulation/labs";
import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/networking-basics");

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

test.describe("网络基础（networking-basics）", () => {
  test("十一章全部通过真实界面与服务端验证完成，结课并获得 160 积分", async ({ page }) => {
    test.setTimeout(300_000);
    const student = await createTestStudent("net");
    const course = await getCourseBySlug("networking-basics");
    const lessons = await getLessons(course.id);
    const open = async (slug: string) => {
      await page.goto(`/learn/${course.id}?lesson=${lessons.find((item) => item.slug === slug)!.id}`);
      await expect(page.locator("main main h1")).toBeVisible({ timeout: 20_000 });
    };

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await expect(page.getByTestId("course-path-context")).toContainText("第 4 / 7 门");
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      // 01 手动完成。
      await open("how-networks-work");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expectChapterDone(page);

      // 02 打印机不在同一网段。
      await open("ip-subnet");
      const subnet = page.getByTestId("networking-basics-subnet");
      await expect(subnet.locator('[data-goal="subnet"]')).toHaveAttribute("data-ok", "false");
      await subnet.getByLabel("打印机 IP 地址").fill("192.168.1.150");
      await expect(subnet.locator('[data-goal="free"]')).toHaveAttribute("data-ok", "false");
      await subnet.getByLabel("打印机 IP 地址").fill("192.168.1.60");
      await subnet.getByLabel("默认网关", { exact: true }).fill("192.168.1.1");
      await expect(subnet.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交打印机设置");
      await answerQuiz(page, "ip.server.json");
      await expectChapterDone(page);

      // 03 ARP 抓包。
      await open("lan-arp");
      const arp = page.getByTestId("networking-basics-arp");
      await arp.getByLabel("是哪个 IP 地址在问？").fill("192.168.1.23");
      await arp.getByLabel("发给局域网里的所有设备（广播）").check();
      await arp.getByLabel("两台设备用了同一个 IP 地址").check();
      await arp.getByLabel(/孩子的旧平板/).check();
      await passLab(page, "提交答案");
      await expectChapterDone(page);

      // 04 路由表：先只改默认路由，总部会断。
      await open("routing");
      const route = page.getByTestId("networking-basics-route");
      await expect(route.locator('[data-scenario="library"]')).toHaveAttribute("data-ok", "false");
      await route.getByLabel("第 2 条路由 下一跳").selectOption("isp");
      await expect(route.locator('[data-scenario="hq"]')).toHaveAttribute("data-ok", "false");
      await route.getByRole("button", { name: "添加路由" }).click();
      await route.getByLabel("第 3 条路由 目的网段").fill("10.8.0.0/16");
      await route.getByLabel("第 3 条路由 下一跳").selectOption("vpn");
      await expect(route.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交路由表");
      await expectChapterDone(page);

      // 05 DNS 诊断。
      await open("dns");
      const dns = page.getByTestId("networking-basics-dns");
      for (const record of DNS_RECORDS) await dns.getByLabel(`${record.who} 的原因`).selectOption(record.cause);
      await dns.getByRole("radio", { name: /198\.51\.100\.7\s+library\.test/ }).check();
      await passLab(page, "提交诊断报告");
      await answerQuiz(page, "dns.server.json");
      await expectChapterDone(page);

      // 06 防火墙：语音要 UDP，SSH 限定来源，数据库不对外。
      await open("ports");
      const firewall = page.getByTestId("networking-basics-firewall");
      await expect(firewall.locator('[data-scenario="https"]')).toHaveAttribute("data-ok", "false");
      await firewall.getByLabel("第 2 条规则 协议").selectOption("udp");
      await firewall.getByLabel("第 3 条规则 来源").selectOption("office");
      await firewall.getByRole("button", { name: "删除第 4 条规则" }).click();
      await firewall.getByRole("button", { name: "添加规则" }).click();
      await firewall.getByLabel("第 4 条规则 端口").fill("443");
      await expect(firewall.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交防火墙规则");
      await answerQuiz(page, "transport.server.json");
      await expectChapterDone(page);

      // 07 TCP 抓包。
      await open("tcp");
      const tcp = page.getByTestId("networking-basics-tcp");
      await tcp.getByLabel("建立连接用了几个包？").fill("3");
      await tcp.getByLabel("第 7、9 号包到达后，接收方回复的确认号（ack）都是多少？").fill("1001");
      await tcp.getByLabel("发送方重传的数据从哪个序号（seq）开始？").fill("1001");
      await tcp.getByLabel("重传的包到达后，确认号一下子跳到了多少？").fill("4001");
      await tcp.getByLabel("完整的 4000 字节，顺序和发送时一样").check();
      await passLab(page, "提交答案");
      await expectChapterDone(page);

      // 08 NAT：协议、危险转发、地址保留。
      await open("nat");
      const nat = page.getByTestId("networking-basics-nat");
      await expect(nat.locator('[data-scenario="admin"]')).toHaveAttribute("data-ok", "false");
      await nat.getByLabel("第 2 条转发 协议").selectOption("udp");
      await nat.getByRole("button", { name: "删除第 3 条转发" }).click();
      await expect(nat.locator('[data-scenario="nas"]')).toHaveAttribute("data-ok", "false");
      await nat.getByLabel("NAS 保留地址").fill("192.168.1.20");
      await nat.getByLabel("游戏机 保留地址").fill("192.168.1.37");
      await expect(nat.locator('[data-ok="false"]')).toHaveCount(0);
      await passLab(page, "提交路由器设置");
      await answerQuiz(page, "nat.server.json");
      await expectChapterDone(page);

      // 09 traceroute。
      await open("troubleshooting");
      const trace = page.getByTestId("networking-basics-trace");
      await trace.getByLabel(/这台路由器不回应探测包，但它照常转发/).check();
      await trace.getByLabel("这台路由器回应探测包慢，不代表它转发慢").check();
      await trace.getByLabel("运营商网络之外、到机房之间的线路").check();
      await passLab(page, "提交判断");
      await expectChapterDone(page);

      // 10 新笔记本：先用命令查，再改设置。
      await open("get-online");
      const laptop = page.getByTestId("networking-basics-laptop");
      await laptop.getByRole("button", { name: "运行" }).click();
      await expect(laptop.getByText(/另一台设备正在使用此 IP 地址/)).toBeVisible();
      await laptop.getByLabel("IP 地址", { exact: true }).fill("192.168.1.60");
      await laptop.getByLabel("默认网关", { exact: true }).fill("192.168.1.1");
      await laptop.getByLabel("DNS 服务器", { exact: true }).fill("192.168.1.1");
      await laptop.getByLabel("命令").fill("curl https://library.test");
      await laptop.getByRole("button", { name: "运行" }).click();
      await expect(laptop.getByText(/HTTP\/1\.1 200 OK/)).toBeVisible();
      await passLab(page, "提交网络设置");
      await expectChapterDone(page);

      // 11 结业测验 → 结课。
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
