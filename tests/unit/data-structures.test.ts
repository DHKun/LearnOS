import { describe, expect, it } from "vitest";

import { SORTS, bfs, drain, isStable } from "@/content/courses/data-structures/simulation/algorithms";
import { ABSENT, FLOOR, HASH_INITIAL, PRESENT, SHELF, SHORTEST, START, TARGET } from "@/content/courses/data-structures/simulation/labs";
import {
  validateHashLab,
  validateQueueLab,
  validateRouteLab,
  validateSearchLab,
  validateSortLab,
  validateStructureLab,
} from "@/content/courses/data-structures/validators";

/** Binary search, recording the indexes looked at. */
function binary(target: number): number[] {
  const seen: number[] = [];
  let lo = 0;
  let hi = SHELF.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    seen.push(mid);
    if (SHELF[mid] === target) break;
    if (SHELF[mid]! < target) lo = mid + 1;
    else hi = mid - 1;
  }
  if (!SHELF.includes(target)) {
    const lower = SHELF.findIndex((value) => value > target) - 1;
    for (const index of [lower, lower + 1]) if (!seen.includes(index)) seen.push(index);
  }
  return seen;
}

/** A shortest path found by walking back down the BFS distances. */
function shortestPath(): [number, number][] {
  const fromTarget = bfs(FLOOR, TARGET);
  const path: [number, number][] = [START];
  let current = START;
  while (current.join() !== TARGET.join()) {
    const d = fromTarget.get(current.join(","))!;
    const [x, y] = current;
    current = ([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]).find((cell) => fromTarget.get(cell.join(",")) === d - 1)!;
    path.push(current);
  }
  return path;
}

describe("data-structures 算法", () => {
  it("排序都正确，只有插入和归并是稳定的", () => {
    const items = [3, 1, 2, 1, 3, 2].map((key, tag) => ({ key, tag }));
    for (const sort of Object.values(SORTS)) expect(sort(items).sorted.map((item) => item.key)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(isStable(SORTS.insertion(items).sorted)).toBe(true);
    expect(isStable(SORTS.merge(items).sorted)).toBe(true);
  });

  it("栈后进先出，队列先进先出；BFS 给出最短距离", () => {
    expect(drain(["a", "b", "c"], "stack")).toEqual(["c", "b", "a"]);
    expect(drain(["a", "b", "c"], "queue")).toEqual(["a", "b", "c"]);
    expect(SHORTEST).toBe(16);
  });
});

describe("data-structures 服务端验证器", () => {
  it("查找：二分查找在步数之内；挨个找会超", () => {
    expect(validateSearchLab({ present: binary(PRESENT), absent: binary(ABSENT) }).passed).toBe(true);
    expect(binary(PRESENT).length).toBeLessThanOrEqual(6);
    expect(validateSearchLab({ present: [0, 1, 2, 3, 4, 5, 6, 7], absent: binary(ABSENT) }).passed).toBe(false);
    expect(validateSearchLab({ present: binary(PRESENT), absent: [16] }).passed).toBe(false);
  });

  it("数组和链表：各有擅长", () => {
    expect(validateStructureLab({ choice: { "new-books": "list", "spot-check": "array", queue: "list" } }).passed).toBe(true);
    expect(validateStructureLab({ choice: { "new-books": "array", "spot-check": "array", queue: "array" } }).passed).toBe(false);
    expect(validateStructureLab({ choice: { "new-books": "list", "spot-check": "list", queue: "list" } }).passed).toBe(false);
  });

  it("栈和队列", () => {
    expect(validateQueueLab({ choice: { window: "queue", undo: "stack", back: "stack", print: "queue" } }).passed).toBe(true);
    expect(validateQueueLab({ choice: { window: "stack", undo: "stack", back: "stack", print: "queue" } }).passed).toBe(false);
  });

  it("哈希：号码末位都一样，只有对质数取余能分散开", () => {
    expect(validateHashLab({ choice: HASH_INITIAL }).passed).toBe(false);
    expect(validateHashLab({ choice: { fn: "modulo", buckets: 97 } }).passed).toBe(true);
    expect(validateHashLab({ choice: { fn: "modulo", buckets: 100 } }).passed).toBe(false);
    expect(validateHashLab({ choice: { fn: "first-two", buckets: 97 } }).passed).toBe(false);
  });

  it("排序：几乎有序用插入；要稳定用归并；快排在有序数据上退化", () => {
    expect(validateSortLab({ choice: { nearly: "insertion", random: "merge", stable: "merge" } }).passed).toBe(true);
    expect(validateSortLab({ choice: { nearly: "insertion", random: "quick", stable: "merge" } }).passed).toBe(true);
    expect(validateSortLab({ choice: { nearly: "quick", random: "merge", stable: "merge" } }).passed).toBe(false);
    expect(validateSortLab({ choice: { nearly: "insertion", random: "merge", stable: "quick" } }).passed).toBe(false);
    expect(validateSortLab({ choice: { nearly: "merge", random: "merge", stable: "merge" } }).passed).toBe(false);
  });

  it("最短路线：要走到、要相邻、要最短", () => {
    const path = shortestPath();
    expect(validateRouteLab({ path }).passed).toBe(true);
    expect(validateRouteLab({ path: path.slice(0, -1) }).passed).toBe(false);
    expect(validateRouteLab({ path: [path[0], path[2]] }).passed).toBe(false);
    const detour = [...path.slice(0, 2), path[0]!, ...path.slice(1)];
    expect(String(validateRouteLab({ path: detour }).feedback.message)).toContain("更短");
  });

  it("拒绝格式错误的输入", () => {
    expect(validateSearchLab({ present: [99], absent: [] }).passed).toBe(false);
    expect(validateRouteLab({ path: "S" }).passed).toBe(false);
    expect(validateSortLab({ choice: { nearly: "bogo" } }).passed).toBe(false);
  });
});
