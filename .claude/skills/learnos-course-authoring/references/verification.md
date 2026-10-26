# 验证：测试模板、本地环境、截图检查

课程写完不等于做完。“代码写好了”不算交付，要有可以执行的证据：单元测试证明判分规则对，E2E 证明真实界面能走完全课，截图证明在各种宽度和主题下看起来没问题。

## 目录

1. 单元测试模板
2. E2E 模板
3. 本地验证环境
4. 截图检查清单
5. 交付前的命令

## 1. 单元测试模板

`tests/unit/<slug>.test.ts`。每个校验器都至少覆盖这三类断言，它们直接对应第 2 节的设计原则：

```ts
import { describe, expect, it } from "vitest";

import { INITIAL_STATE } from "@/content/courses/<slug>/simulation/labs";
import { validateMyLab } from "@/content/courses/<slug>/validators";

describe("<slug> 服务端验证器", () => {
  it("初始状态与照抄题干都不能通过", () => {
    expect(validateMyLab(INITIAL_STATE).passed).toBe(false);
    expect(validateMyLab(/* 题干字面上暗示、但实际不对的做法 */).passed).toBe(false);
  });

  it("正确做法通过；每个关键条件单独去掉都不通过", () => {
    const good = { /* … */ };
    expect(validateMyLab(good).passed).toBe(true);
    for (const change of [{ a: "x" }, { b: false } /* 每个控件各改一处 */]) {
      expect(validateMyLab({ ...good, ...change }).passed).toBe(false);
    }
  });

  it("忽略客户端自报的结果；拒绝超长或格式错误的输入", () => {
    expect(validateMyLab({ ...BAD, passed: true }).passed).toBe(false);
    expect(validateMyLab({ field: "x".repeat(10_000) }).passed).toBe(false);
    expect(validateMyLab(null).passed).toBe(false);
  });
});
```

“每个关键条件单独去掉都不通过”这一条最有用：它能证明每个控件**都真的起作用**。哪个控件改了也不影响结果，它就是摆设。

模拟引擎本身也值得单独测几条，例如“片段不进入请求行”“PUT 会清空没发送的字段”，这些是课程想教的知识点，测试也就成了它们的文档。参考 `tests/unit/http-hands-on.test.ts`。

## 2. E2E 模板

`tests/e2e/<slug>.spec.ts`：通过真实界面完成**每一章**，最后核对结课状态和积分。

```ts
import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createTestStudent, deleteTestStudent, getCourseBySlug, getEnrollments, getLessons, getPointsTotal, login } from "./helpers";

const COURSE_DIR = path.join(process.cwd(), "content/courses/<slug>");

async function answerQuiz(page: Page, file: string) {
  const quiz = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, "assessments", file), "utf8"));
  for (const q of quiz.questions) {
    const answers = Array.isArray(q.answer) ? q.answer : [String(q.answer)];   // 判断题的值是 "true" / "false"
    for (const a of answers) await page.locator(`[data-question-id="${q.id}"] input[value="${a}"]`).check();
  }
  await page.getByRole("button", { name: "提交知识检查" }).click();
  await expect(page.getByText("本章知识检查已通过")).toBeVisible({ timeout: 20_000 });
}

async function passLab(page: Page, submitLabel: string) {
  await page.getByRole("button", { name: submitLabel }).click();
  await expect(page.getByText("服务端验证通过").first()).toBeVisible({ timeout: 20_000 });
}

test("全部章节经真实界面完成并结课", async ({ page }) => {
  test.setTimeout(300_000);
  const student = await createTestStudent("<slug>");
  const course = await getCourseBySlug("<slug>");
  const lessons = await getLessons(course.id);
  const open = (slug: string) => page.goto(`/learn/${course.id}?lesson=${lessons.find((l) => l.slug === slug)!.id}`);
  try {
    await login(page, student.email, student.password);
    await page.goto(`/courses/${course.slug}`);
    await page.getByRole("button", { name: "参加课程" }).click();

    await open("intro");
    await page.getByRole("button", { name: /标记本章完成/ }).click();
    await expect(page.getByText(/本章已完成/).first()).toBeVisible({ timeout: 20_000 });

    await open("lab-chapter");
    // 先断言初始状态确实是坏的（比如出现了某个错误码），再修好它
    await passLab(page, "提交…");
    // …每章一段
    await open("final");
    await answerQuiz(page, "final.server.json");
    await expect(page.getByText("课程已完成，当前为只读复习模式")).toBeVisible({ timeout: 20_000 });

    expect((await getEnrollments(student.id))[0].status).toBe("completed");
    expect(await getPointsTotal(student.id)).toBe(lessons.length * 10 + 50);
  } finally {
    await deleteTestStudent(student.id);
  }
});
```

要点：
- 实验章节先断言“坏状态确实可见”，再去修，这样才能证明工单真的有问题要解决。
- 定位元素优先用 `getByLabel`（组件里加好 `aria-label`）和 `getByTestId`。`getByText` 可能命中折叠表格里的隐藏文本，要限定在实验的 `data-testid` 里，或加 `exact: true`。
- 用 `?lesson=<id>` 跳转章节，不依赖目录展开状态。目录默认只展开当前单元，点击其他单元的章节前要先点开那个单元。
- 平台级测试（安全、并发、响应式等）以某门课为基准时，不要在这些测试里绑定课程的具体文案，除非确实需要。

## 3. 本地验证环境

集成测试和 E2E 需要真实的 PostgreSQL。为了不碰用户已有的容器和数据卷，起一个**独立命名、独立端口**的临时库：

```bash
docker run -d --name learnos-<slug>-pg -e POSTGRES_DB=learnos -e POSTGRES_USER=learnos -e POSTGRES_PASSWORD=learnos \
  -p 127.0.0.1:55499:5432 \
  -v "$PWD/db/schema.sql:/docker-entrypoint-initdb.d/001-schema.sql:ro" \
  -v "$PWD/db/migrations/0000_cooing_peter_parker.sql:/docker-entrypoint-initdb.d/002-auth.sql:ro" \
  postgres:17
# 之后新增的迁移（db/migrations/0001_*.sql 等）要手动执行：
docker exec -i learnos-<slug>-pg psql -U learnos -d learnos -v ON_ERROR_STOP=1 < db/migrations/0001_….sql
```

环境变量写在 scratchpad 里的 `env.sh`，不要写进仓库：

```bash
export LEARNOS_DB_URL=postgresql://learnos:learnos@127.0.0.1:55499/learnos
export BETTER_AUTH_SECRET=<随机 32+ 字符> BETTER_AUTH_URL=http://127.0.0.1:3077 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3077
export APP_PORT=3077 APP_BIND_HOST=127.0.0.1 E2E_BASE_URL=http://127.0.0.1:3077
export BETTER_AUTH_ALLOW_SIGNUP=true   # E2E 通过注册接口建测试学生；seed:admin 也依赖它
export BETTER_AUTH_RATE_LIMIT=false    # 否则批量建号会被限流（429）
export ADMIN_EMAIL=admin@learnos.local ADMIN_PASSWORD='LearnOS-Admin-2025!'   # 部分 E2E 写死了这个管理员密码
```

然后：

```bash
. env.sh && pnpm courses:sync --publish && pnpm seed:admin && pnpm seed:demo
. env.sh && pnpm dev                       # 后台运行
. env.sh && pnpm test                      # 单元 + 集成
. env.sh && pnpm test:e2e --grep-invert FloatCTF
```

几个容易卡住的地方：
- **FloatCTF 集成测试**依赖 `FLOATCTF_OIDC_ENABLED` 未设置时的默认值（启用）。跑 `pnpm test` 前要 `unset FLOATCTF_OIDC_ENABLED`。
- **没有 Playwright 自带的浏览器**时，不要擅自安装，先问用户。本机若装了 Chrome，可以用 `E2E_BROWSER_CHANNEL=chrome`（`playwright.config.ts` 已支持）。
- **`.next/types` 里残留其他分支的路由类型**会让 `pnpm typecheck` 报错；跑一次 `pnpm build` 会重新生成。不要在 dev 服务器运行时执行 build，两者会同时写 `.next`。
- **zsh 不会对未加引号的变量分词**：把列表传给脚本时用 `${=args}`。
- 测试数据库里如果残留别的课程数据，可能掩盖“只有这一门课”时才出现的问题；必要时清掉它们（只在自己起的临时库里这样做）。

## 4. 截图检查清单

```bash
. env.sh && pnpm exec tsx .claude/skills/learnos-course-authoring/scripts/review-shots.ts \
  --course <slug> --email <学生邮箱> --password '<密码>' --out <scratchpad>/review --channel chrome
```

它会给每章生成 1440px、390px 以及亮色、暗色共四套整页截图，外加每个动画和实验的单独截图，并报告横向溢出。用一个没有其他进行中课程的学生账号。逐张看，重点检查：

- [ ] **实验的初始状态**：问题是否一眼可见？有没有一开始就显示绿色或通过的地方？
- [ ] **同一条提示有没有重复出现**（结果面板里一次，判定提示里又一次）。
- [ ] **列表有没有被 prose 样式加上圆点**，表格是否在窄屏下溢出。
- [ ] **暗色模式**：有没有写死的浅色背景、对比度不够的文字。
- [ ] **390px**：多栏动画是否已纵向堆叠，数据包标签有没有压在节点上，按钮能否点到。
- [ ] **动画的每一步**：脚本只截第一步；要看中间步骤，可以在 E2E 里点“下一步”后截图，或手动检查。
- [ ] **线索是否藏得恰当**：答案没有直接写在题干或出错的那条记录里。

截图只在本地查看，不要提交到仓库。

## 5. 交付前的命令

```bash
pnpm courses:validate
pnpm typecheck && pnpm lint          # lint 里如果有原本就存在的问题，在汇报里说明
. env.sh && pnpm test
. env.sh && pnpm test:e2e --grep-invert FloatCTF
pnpm build && pnpm security:scan     # 确认答案和解析没有进入客户端资源
```

汇报时如实写出每条命令的结果，以及哪些没有运行、为什么。
