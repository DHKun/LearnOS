import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ACTIVITY_IDS, CONCEPT_IDS } from "@/lib/generated/course-catalog";

describe("课程插件自动注册", () => {
  it("生成目录包含所有已安装课程的概念与活动", () => {
    expect([...CONCEPT_IDS].sort()).toEqual([
      "bits-and-bytes/codebook",
      "bits-and-bytes/color",
      "bits-and-bytes/compression",
      "bits-and-bytes/endian",
      "bits-and-bytes/float",
      "bits-and-bytes/hex",
      "bits-and-bytes/overflow",
      "bits-and-bytes/parity",
      "bits-and-bytes/signature",
      "bits-and-bytes/switches",
      "bits-and-bytes/utf8",
      "http-hands-on/auth",
      "http-hands-on/cache",
      "http-hands-on/cookie",
      "http-hands-on/journey",
      "http-hands-on/message",
      "http-hands-on/negotiation",
      "http-hands-on/redirect",
      "http-hands-on/retry",
      "http-hands-on/tls",
      "http-hands-on/url",
      "networking-basics/arp",
      "networking-basics/dns",
      "networking-basics/nat",
      "networking-basics/packets",
      "networking-basics/ports",
      "networking-basics/routing",
      "networking-basics/subnet",
      "networking-basics/tcp",
      "networking-basics/traceroute",
    ]);
    expect([...ACTIVITY_IDS].sort()).toEqual([
      "bits-and-bytes/color-lab",
      "bits-and-bytes/header-lab",
      "bits-and-bytes/image-lab",
      "bits-and-bytes/int-lab",
      "bits-and-bytes/led-lab",
      "bits-and-bytes/mojibake-lab",
      "bits-and-bytes/money-lab",
      "bits-and-bytes/parity-lab",
      "bits-and-bytes/repair-lab",
      "bits-and-bytes/size-lab",
      "bits-and-bytes/utf8-lab",
      "http-hands-on/cache-lab",
      "http-hands-on/cookie-lab",
      "http-hands-on/diagnosis-lab",
      "http-hands-on/final-mission",
      "http-hands-on/json-lab",
      "http-hands-on/method-lab",
      "http-hands-on/request-lab",
      "http-hands-on/response-lab",
      "http-hands-on/url-lab",
      "networking-basics/arp-lab",
      "networking-basics/dns-lab",
      "networking-basics/firewall-lab",
      "networking-basics/laptop-lab",
      "networking-basics/nat-lab",
      "networking-basics/route-lab",
      "networking-basics/subnet-lab",
      "networking-basics/tcp-lab",
      "networking-basics/trace-lab",
    ]);
  });

  it("生成物不含手工 Registry 路径，且组件文件位于课程目录内", () => {
    const generated = fs.readFileSync(
      path.join(process.cwd(), "lib/generated/course-components.tsx"),
      "utf8",
    );
    expect(generated).toContain("content/courses/http-hands-on/");
    expect(generated).toContain("content/courses/bits-and-bytes/");
    expect(generated).toContain("content/courses/networking-basics/");
    expect(generated).not.toContain("components/activities/sql-injection");
    expect(generated).not.toContain("components/concepts/sql");
  });
});
