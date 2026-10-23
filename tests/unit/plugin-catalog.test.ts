import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ACTIVITY_IDS, CONCEPT_IDS } from "@/lib/generated/course-catalog";

describe("课程插件自动注册", () => {
  it("生成目录包含所有已安装课程的概念与活动", () => {
    expect([...CONCEPT_IDS].sort()).toEqual([
      "http-fundamentals/cache",
      "http-fundamentals/cookie",
      "http-fundamentals/journey",
      "http-fundamentals/request",
      "http-fundamentals/status",
      "http-fundamentals/tls",
      "http-fundamentals/url",
    ]);
    expect([...ACTIVITY_IDS].sort()).toEqual([
      "http-fundamentals/cache-console",
      "http-fundamentals/cookie-console",
      "http-fundamentals/diagnosis-console",
      "http-fundamentals/final-mission",
      "http-fundamentals/json-console",
      "http-fundamentals/method-matcher",
      "http-fundamentals/request-console",
    ]);
  });

  it("生成物不含手工 Registry 路径，且组件文件位于课程目录内", () => {
    const generated = fs.readFileSync(
      path.join(process.cwd(), "lib/generated/course-components.tsx"),
      "utf8",
    );
    expect(generated).toContain("content/courses/http-fundamentals/");
    expect(generated).not.toContain("components/activities/sql-injection");
    expect(generated).not.toContain("components/concepts/sql");
  });
});
