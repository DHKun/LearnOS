import { describe, expect, it } from "vitest";

import { buildCourseUpdate } from "@/lib/content/sync-policy";

const manifest = { version: "1.2.0", title: "仓库标题", description: "仓库简介" };

describe("course metadata sync policy", () => {
  it("普通同步不覆盖管理员编辑的标题和简介", () => {
    expect(buildCourseUpdate(manifest, {})).toEqual({ content_version: "1.2.0" });
  });

  it("显式 refreshMetadata 才覆盖标题和简介", () => {
    expect(buildCourseUpdate(manifest, { refreshMetadata: true })).toEqual({
      content_version: "1.2.0",
      title: "仓库标题",
      description: "仓库简介",
    });
  });

  it("发布标记独立保留", () => {
    expect(buildCourseUpdate(manifest, { publish: true })).toEqual({
      content_version: "1.2.0",
      status: "published",
    });
  });
});
