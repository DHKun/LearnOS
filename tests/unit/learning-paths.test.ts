import { describe, expect, it } from "vitest";

import { checkPath, loadPaths, validateAllPaths } from "@/lib/content/paths";
import { buildPathViews, pathContextFor } from "@/lib/services/paths";
import type { CourseListItem } from "@/lib/types";

const manifest = {
  schemaVersion: 1,
  slug: "demo-path",
  title: "示例路线",
  description: "用于测试。",
  level: "入门",
  courses: [
    { course: "a", summary: "第一门" },
    { course: "planned", title: "还没做的课", summary: "即将上线" },
    { course: "b", summary: "第三门" },
    { course: "c", summary: "第四门" },
  ],
};

function course(slug: string, myStatus: CourseListItem["myStatus"] = null): CourseListItem {
  return {
    id: `id-${slug}`,
    slug,
    title: `课程 ${slug}`,
    description: "",
    lessonCount: 10,
    status: "published",
    myStatus,
    myProgress: myStatus ? { completed: 1, total: 10, percent: 10 } : null,
  };
}

describe("学习路线定义", () => {
  it("仓库里的路线全部通过校验，并能被加载", () => {
    const results = validateAllPaths();
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((item) => !item.ok)).toEqual([]);
    expect(loadPaths().map((path) => path.slug)).toContain("computer-foundations");
  });

  it("拒绝目录名不一致、重复课程、没有标题的未上线课程", () => {
    const known = ["a", "b", "c"];
    expect(() => checkPath(manifest, "demo-path", known)).not.toThrow();
    expect(() => checkPath(manifest, "other", known)).toThrow("目录名");
    expect(() =>
      checkPath({ ...manifest, courses: [...manifest.courses, { course: "a", summary: "重复" }] }, "demo-path", known),
    ).toThrow("两次");
    expect(() =>
      checkPath({ ...manifest, courses: [{ course: "ghost", summary: "没有标题" }] }, "demo-path", known),
    ).toThrow("title");
    expect(() => checkPath({ ...manifest, level: "大师" }, "demo-path", known)).toThrow();
  });
});

describe("学习路线进度", () => {
  const paths = [checkPath(manifest, "demo-path", ["a", "b", "c"])];

  it("未发布或不存在的课程显示为即将上线，不计入可学数量", () => {
    const [view] = buildPathViews(paths, [course("a"), course("c")]);
    expect(view.steps.map((step) => step.state)).toEqual(["available", "upcoming", "upcoming", "available"]);
    expect(view.available).toBe(2);
    expect(view.next?.slug).toBe("a");
  });

  it("推荐下一门跳过已完成和即将上线的课程；进行中、已暂停的课程优先", () => {
    const [view] = buildPathViews(paths, [course("a", "completed"), course("b", "abandoned"), course("c", "active")]);
    expect(view.completed).toBe(1);
    expect(view.next?.slug).toBe("b");
    expect(view.next?.state).toBe("abandoned");
  });

  it("课程在路线中的位置和它后面的下一门", () => {
    const views = buildPathViews(paths, [course("a", "completed"), course("b", "completed"), course("c")]);
    expect(pathContextFor(views, "a")).toEqual([
      expect.objectContaining({ position: 1, total: 4, next: expect.objectContaining({ slug: "c" }) }),
    ]);
    expect(pathContextFor(views, "c")[0].next).toBeNull();
    expect(pathContextFor(views, "not-on-path")).toEqual([]);
  });
});
