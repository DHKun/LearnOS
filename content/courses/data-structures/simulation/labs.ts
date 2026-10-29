/**
 * Lab data and grading rules. Pure functions shared by the browser (live
 * feedback) and validators.ts (the only source of `passed`). Every step
 * count comes from running the instrumented algorithms in algorithms.ts.
 */
import {
  type Cell,
  type HashFunction,
  type Item,
  type Operation,
  type SortName,
  SORTS,
  arraySteps,
  bfs,
  distribute,
  drain,
  find,
  isStable,
  listSteps,
  mulberry32,
  neighbours,
} from "./algorithms";

export type Goal = { id: string; label: string; ok: boolean; detail?: string };
export type Graded = { passed: boolean; message: string };

const summary = (goals: Goal[], success: string): Graded => {
  const failed = goals.filter((goal) => !goal.ok);
  return { passed: failed.length === 0, message: failed.length ? `还没满足：${failed.map((goal) => goal.label).join("；")}。` : success };
};

// ---------------------------------------------------------------------------
// Ch2 · binary search on a sorted shelf
// ---------------------------------------------------------------------------

export const SHELF: number[] = (() => {
  const random = mulberry32(64);
  const out: number[] = [];
  let value = 1003;
  for (let index = 0; index < 64; index += 1) {
    out.push(value);
    value += 2 + Math.floor(random() * 17);
  }
  return out;
})();
export const PRESENT = SHELF[41]!;
export const ABSENT = SHELF[17]! + 1;
export const FIND_LIMIT = 6;
export const ABSENT_LIMIT = 7;
export const PROBE_MAX = 20;

export type Probe = { index: number; value: number; result: "found" | "smaller" | "larger" };

/** What the shelf tells you when you look at one position. */
export function probe(index: number, target: number): Probe {
  const value = SHELF[index]!;
  return { index, value, result: value === target ? "found" : target < value ? "smaller" : "larger" };
}

export function evaluateSearch(present: number[], absent: number[]) {
  const foundAt = present.findIndex((index) => SHELF[index] === PRESENT);
  const found = foundAt >= 0 && foundAt + 1 <= FIND_LIMIT;
  const seen = new Set(absent);
  const lower = SHELF.findIndex((value) => value > ABSENT) - 1;
  const bracketed = (lower < 0 || seen.has(lower)) && (lower + 1 >= SHELF.length || seen.has(lower + 1));
  const goals: Goal[] = [
    { id: "found", label: `在 ${FIND_LIMIT} 次之内找到 ${PRESENT} 号书`, ok: found, detail: foundAt >= 0 ? `第 ${foundAt + 1} 次找到` : `已经看了 ${present.length} 次` },
    {
      id: "absent",
      label: `在 ${ABSENT_LIMIT} 次之内确认 ${ABSENT} 号书不在架上`,
      ok: bracketed && absent.length <= ABSENT_LIMIT,
      detail: bracketed ? `看了 ${absent.length} 次，已经找到了夹住它的两本相邻的书` : `已经看了 ${absent.length} 次，还没找到夹住它的两本相邻的书`,
    },
  ];
  return { goals, passed: goals.every((goal) => goal.ok) };
}

// ---------------------------------------------------------------------------
// Ch3 · array or linked list
// ---------------------------------------------------------------------------

export type Structure = "array" | "list";
export const SIZE = 1000;
export const STEP_BUDGET = 10_000;

const randomReads: Operation[] = (() => {
  const random = mulberry32(500);
  return Array.from({ length: 500 }, () => ({ kind: "read" as const, at: Math.floor(random() * SIZE) }));
})();

export const WORKLOADS: { id: string; label: string; operations: Operation[] }[] = [
  { id: "new-books", label: "新书登记：每天把 200 本新书插到最前面，很少按位置读", operations: Array.from({ length: 200 }, () => ({ kind: "insert-front" as const })) },
  { id: "spot-check", label: "随机抽查：每天按“第几本”读取 500 次", operations: randomReads },
  {
    id: "queue",
    label: "预约排队：新预约加到末尾 300 次，从最前面叫走 300 次",
    operations: [...Array.from({ length: 300 }, () => ({ kind: "append" as const })), ...Array.from({ length: 300 }, () => ({ kind: "remove-front" as const }))],
  },
];

export function evaluateStructures(choice: Record<string, Structure>) {
  const goals: Goal[] = WORKLOADS.map((work) => {
    const structure = choice[work.id] ?? "array";
    const steps = structure === "array" ? arraySteps(SIZE, work.operations) : listSteps(SIZE, work.operations);
    return { id: work.id, label: work.label, ok: steps <= STEP_BUDGET, detail: `${structure === "array" ? "数组" : "链表"}：${steps.toLocaleString("zh-CN")} 步（预算 ${STEP_BUDGET.toLocaleString("zh-CN")}）` };
  });
  return { goals, passed: goals.every((goal) => goal.ok) };
}

// ---------------------------------------------------------------------------
// Ch4 · stack or queue
// ---------------------------------------------------------------------------

export const TASKS: { id: string; label: string; input: string[]; want: string[]; describe: string }[] = [
  { id: "window", label: "借书窗口叫号", input: ["张伟", "李娜", "王芳", "刘洋"], want: ["张伟", "李娜", "王芳", "刘洋"], describe: "先来的先办" },
  { id: "undo", label: "编辑公告时的“撤销”", input: ["输入“闭馆”", "加粗", "改成红色", "加下划线"], want: ["加下划线", "改成红色", "加粗", "输入“闭馆”"], describe: "最后做的那一步最先撤销" },
  { id: "back", label: "浏览器的“后退”", input: ["首页", "新书", "《三体》", "我的借阅"], want: ["我的借阅", "《三体》", "新书", "首页"], describe: "最近看的那页最先退回去" },
  { id: "print", label: "打印借阅单", input: ["借阅单 1", "催还通知", "月度报表"], want: ["借阅单 1", "催还通知", "月度报表"], describe: "按提交的顺序打印" },
];

export function evaluateQueues(choice: Record<string, "stack" | "queue">) {
  const goals: Goal[] = TASKS.map((task) => {
    const out = drain(task.input, choice[task.id] ?? "stack");
    return { id: task.id, label: `${task.label}：${task.describe}`, ok: out.join() === task.want.join(), detail: `处理顺序：${out.join(" → ")}` };
  });
  return { goals, passed: goals.every((goal) => goal.ok) };
}

// ---------------------------------------------------------------------------
// Ch5 · hash function for card numbers
// ---------------------------------------------------------------------------

export const CARDS = Array.from({ length: 200 }, (_, index) => 20_260_000 + index * 10);
export const BUCKET_OPTIONS = [10, 97, 100] as const;
export type HashChoice = { fn: HashFunction; buckets: (typeof BUCKET_OPTIONS)[number] };
export const HASH_INITIAL: HashChoice = { fn: "last-digit", buckets: 100 };
export const CHAIN_LIMIT = 3;

export function evaluateHash(choice: HashChoice) {
  const counts = distribute(CARDS, choice.fn, choice.buckets);
  const longest = Math.max(...counts);
  const used = counts.filter((count) => count > 0).length;
  const goals: Goal[] = [
    { id: "chain", label: `查任何一个借书证号，最多翻 ${CHAIN_LIMIT} 张卡片`, ok: longest <= CHAIN_LIMIT, detail: `最长的一串有 ${longest} 个` },
    { id: "spread", label: "至少一半的格子用上了", ok: used * 2 >= choice.buckets, detail: `${choice.buckets} 个格子用了 ${used} 个` },
  ];
  return { goals, passed: goals.every((goal) => goal.ok), counts };
}

// ---------------------------------------------------------------------------
// Ch6 · which sort for which job
// ---------------------------------------------------------------------------

function shuffled(count: number, seed: number, keyOf: (index: number) => number): Item[] {
  const random = mulberry32(seed);
  const items = Array.from({ length: count }, (_, index) => ({ key: keyOf(index), tag: index }));
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap]!, items[index]!];
  }
  return items.map((item, index) => ({ key: item.key, tag: index }));
}

const nearlySorted: Item[] = (() => {
  const items = Array.from({ length: 1000 }, (_, index) => ({ key: index, tag: index }));
  const random = mulberry32(5);
  for (let swap = 0; swap < 5; swap += 1) {
    const at = 50 + Math.floor(random() * 900);
    [items[at], items[at + 2]] = [items[at + 2]!, items[at]!];
  }
  return items.map((item, index) => ({ key: item.key, tag: index }));
})();

export const SORT_JOBS: { id: string; label: string; items: Item[]; budget: number; stable: boolean }[] = [
  { id: "nearly", label: "书架上 1000 本书，只有 5 本放错了位置", items: nearlySorted, budget: 2000, stable: false },
  { id: "random", label: "刚还回来的 1000 本书，顺序完全打乱", items: shuffled(1000, 42, (index) => index), budget: 20_000, stable: false },
  { id: "stable", label: "1000 本书已按书名排好，现在按出版年份排，同一年的要保持书名顺序", items: shuffled(1000, 7, (index) => 1990 + (index % 35)).map((item, index) => ({ key: item.key, tag: index })), budget: 20_000, stable: true },
];

export const SORT_NAMES: { id: SortName; label: string }[] = [
  { id: "insertion", label: "插入排序" },
  { id: "selection", label: "选择排序" },
  { id: "merge", label: "归并排序" },
  { id: "quick", label: "快速排序（取第一个当基准）" },
];

export function evaluateSorts(choice: Record<string, SortName>) {
  const goals: Goal[] = SORT_JOBS.map((job) => {
    const name = choice[job.id] ?? "selection";
    const { sorted, comparisons } = SORTS[name](job.items);
    const stable = isStable(sorted);
    const fast = comparisons <= job.budget;
    const label = SORT_NAMES.find((item) => item.id === name)!.label;
    return {
      id: job.id,
      label: job.label,
      ok: fast && (!job.stable || stable),
      detail: `${label}：比较 ${comparisons.toLocaleString("zh-CN")} 次（预算 ${job.budget.toLocaleString("zh-CN")}）${job.stable ? `，${stable ? "同年的顺序没乱" : "同年的书名顺序被打乱了"}` : ""}`,
    };
  });
  return { goals, passed: goals.every((goal) => goal.ok) };
}

// ---------------------------------------------------------------------------
// Ch7 · shortest route through the library
// ---------------------------------------------------------------------------

export const FLOOR = [
  "##########",
  "#S...#...#",
  "#.##.#.#.#",
  "#.#....#.#",
  "#.#.####.#",
  "#...#..T.#",
  "##########",
];
export const START = find(FLOOR, "S");
export const TARGET = find(FLOOR, "T");
export const SHORTEST = bfs(FLOOR, START).get(TARGET.join(","))!;
export const PATH_MAX = 60;

export function checkPath(path: Cell[]): { valid: boolean; reached: boolean; moves: number; problem?: string } {
  if (!path.length || path[0]!.join() !== START.join()) return { valid: false, reached: false, moves: 0, problem: "路线要从入口出发" };
  for (let index = 1; index < path.length; index += 1) {
    const ok = neighbours(FLOOR, path[index - 1]!).some((cell) => cell.join() === path[index]!.join());
    if (!ok) return { valid: false, reached: false, moves: index - 1, problem: `第 ${index} 步不是走到相邻的空地上` };
  }
  return { valid: true, reached: path[path.length - 1]!.join() === TARGET.join(), moves: path.length - 1 };
}

export function gradePath(path: Cell[]): Graded {
  const check = checkPath(path);
  if (!check.valid) return { passed: false, message: check.problem ?? "路线不对。" };
  if (!check.reached) return { passed: false, message: "还没走到科幻区。" };
  if (check.moves > SHORTEST) return { passed: false, message: `走到了，用了 ${check.moves} 步。还有更短的路线。` };
  return { passed: true, message: `${check.moves} 步，这就是最短的路线。` };
}

// ---------------------------------------------------------------------------
// Input parsing for validators
// ---------------------------------------------------------------------------

export function parseIndexes(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > PROBE_MAX) return null;
  if (!value.every((item) => Number.isInteger(item) && item >= 0 && item < SHELF.length)) return null;
  return value as number[];
}

export function parseChoice<T extends string>(value: unknown, ids: string[], allowed: readonly T[]): Record<string, T> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, T> = {};
  for (const id of ids) {
    const item = (value as Record<string, unknown>)[id];
    if (!allowed.includes(item as T)) return null;
    out[id] = item as T;
  }
  return out;
}

export function parsePath(value: unknown): Cell[] | null {
  if (!Array.isArray(value) || value.length > PATH_MAX) return null;
  const out: Cell[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || !item.every((n) => Number.isInteger(n) && n >= 0 && n < 20)) return null;
    out.push([item[0], item[1]]);
  }
  return out;
}

export { summary };
