/**
 * Lab programs and grading rules. Pure functions shared by the browser
 * (live feedback) and validators.ts (the only source of `passed`).
 */
import { LIMITS, type Program, assemble, run, simulateCache, trace } from "./machine";
import { type Algorithm, type Policy, QUANTA, evaluateSchedule } from "./scheduler";

export type Graded = { passed: boolean; message: string };
export type TestResult = { label: string; ok: boolean; detail: string };

function compile(source: string): { program: Program } | { message: string } {
  const result = assemble(source);
  if ("error" in result) return { message: `${result.error.line ? `第 ${result.error.line} 行：` : ""}${result.error.message}` };
  return result;
}

// ---------------------------------------------------------------------------
// Ch2 · trace a program by hand
// ---------------------------------------------------------------------------

export const TRACE_PROGRAM = `; 结账：单价在 [10]，数量在 [11]
      LOAD R0, [10]   ; 单价
      LOAD R1, [11]   ; 数量
      MUL R0, R1      ; 小计
      STORE R0, [20]  ; 记下小计
      SUB R1, 1
      JZ done         ; 只买 1 件就跳过包装费
      ADD R0, 5       ; 多于 1 件，加 5 元包装费
done: STORE R0, [21]  ; 记下应付
      OUT R0
      HALT`;
export const TRACE_INPUT = { 10: 8, 11: 4 };

export const TRACE_QUESTIONS = [
  { id: "subtotal", question: "程序结束时，地址 [20] 里是多少？" },
  { id: "total", question: "程序结束时，地址 [21] 里是多少？" },
  { id: "steps", question: "从开始到停下，一共执行了几条指令（HALT 也算）？" },
  { id: "single", question: "如果把 [11] 改成 1（只买 1 件），[21] 会是多少？" },
] as const;
export type TraceQuestionId = (typeof TRACE_QUESTIONS)[number]["id"];

const traceProgram = (assemble(TRACE_PROGRAM) as { program: Program }).program;

export function traceAnswers(): Record<TraceQuestionId, number> {
  const main = run(traceProgram, TRACE_INPUT).state;
  const single = run(traceProgram, { ...TRACE_INPUT, 11: 1 }).state;
  return { subtotal: main.memory[20]!, total: main.memory[21]!, steps: main.steps, single: single.memory[21]! };
}

export function gradeTrace(answers: Partial<Record<TraceQuestionId, string>>) {
  const expected = traceAnswers();
  const results = TRACE_QUESTIONS.map((item) => ({ id: item.id, ok: (answers[item.id] ?? "").trim() === String(expected[item.id]) }));
  const correct = results.filter((item) => item.ok).length;
  const hints: string[] = [];
  if ((answers.subtotal ?? "").trim() === String(expected.total)) hints.push("[20] 是在加包装费之前写进去的：寄存器后来变了，内存里的值不会跟着变。");
  if ((answers.steps ?? "").trim() === String(expected.steps - 1)) hints.push("HALT 也算一条。");
  return { passed: correct === results.length, correct, total: results.length, hints };
}

// ---------------------------------------------------------------------------
// Ch3 · fix the 1 + … + N loop
// ---------------------------------------------------------------------------

export const SUM_BROKEN = `; 计算 1 + 2 + … + N。N 在 [21]，结果存到 [20]
      LOAD R0, [21]   ; N
      SET R1, 1       ; i
      SET R2, 0       ; sum
loop: ADD R2, R1      ; sum = sum + i
      ADD R1, 1       ; i = i + 1
      CMP R1, R0
      JLT loop        ; i < N 就继续
      STORE R2, [20]
      HALT`;
export const SUM_CASES = [10, 1, 0, 7];

export function testSum(source: string): { tests: TestResult[]; error?: string } {
  const compiled = compile(source);
  if ("message" in compiled) return { tests: [], error: compiled.message };
  return {
    tests: SUM_CASES.map((n) => {
      const result = run(compiled.program, { 21: n });
      const want = (n * (n + 1)) / 2;
      const got = result.state.memory[20]!;
      return {
        label: `N = ${n} 时 [20] 应该是 ${want}`,
        ok: result.reason === "halted" && got === want,
        detail: result.reason === "halted" ? `得到 ${got}` : (result.state.fault ?? "没有停下"),
      };
    }),
  };
}

export function gradeSum(source: string): Graded {
  const { tests, error } = testSum(source);
  if (error) return { passed: false, message: error };
  const failed = tests.filter((test) => !test.ok);
  if (!failed.length) return { passed: true, message: "四个测试都通过了：包括 N = 0 和 N = 1 这两个边界。" };
  const hints = [`还有 ${failed.length} 个测试没通过：${failed.map((test) => `${test.label}，${test.detail}`).join("；")}。`];
  if (failed.some((test) => test.label.startsWith("N = 0"))) hints.push("N = 0 时一个数都不该加：想想循环是先判断还是先做。");
  return { passed: false, message: hints.join("") };
}

// ---------------------------------------------------------------------------
// Ch4 · an array write that runs past the end
// ---------------------------------------------------------------------------

export const SCORES = [62, 75, 58, 90, 81];
export const SCORES_START = 30;
export const COUNT_ADDR = 35;
export const MEMORY_INPUT: Record<number, number> = { ...Object.fromEntries(SCORES.map((score, index) => [SCORES_START + index, score])), [COUNT_ADDR]: SCORES.length };

export const ARRAY_BROKEN = `; [30]～[34] 是 5 个成绩，[35] 是人数。每人加 10 分，再逐个打印成绩单
      SET R1, 30        ; R1 指向当前成绩
bonus: LOAD R0, [R1]
      ADD R0, 10
      STORE R0, [R1]
      ADD R1, 1
      CMP R1, 36
      JLT bonus
      SET R1, 30        ; 打印：从 [30] 开始，打印 [35] 个
      LOAD R2, [35]
print: LOAD R0, [R1]
      OUT R0
      ADD R1, 1
      SUB R2, 1
      JNZ print
      HALT`;

export function testArray(source: string): { tests: TestResult[]; error?: string; writes: number[] } {
  const compiled = compile(source);
  if ("message" in compiled) return { tests: [], error: compiled.message, writes: [] };
  const states = trace(compiled.program, MEMORY_INPUT, LIMITS.steps);
  const end = states[states.length - 1]!;
  const writes = states.flatMap((state) => state.writes);
  const want = SCORES.map((score) => score + 10);
  const halted = end.halted;
  return {
    writes,
    tests: [
      { label: "5 个成绩都加了 10 分", ok: halted && want.every((score, index) => end.memory[SCORES_START + index] === score), detail: `[30]～[34] = ${end.memory.slice(30, 35).join("、")}` },
      { label: "成绩单正好打印 5 个成绩", ok: halted && end.output.length === want.length && end.output.every((value, index) => value === want[index]), detail: halted ? `打印了 ${end.output.length} 个：${end.output.slice(0, 8).join("、")}${end.output.length > 8 ? "…" : ""}` : (end.fault ?? "没有停下") },
      { label: "人数 [35] 从头到尾没被写坏", ok: halted && !writes.includes(COUNT_ADDR) && end.memory[COUNT_ADDR] === SCORES.length, detail: writes.includes(COUNT_ADDR) ? `[35] 被写过，现在是 ${end.memory[COUNT_ADDR]}` : "没被写过" },
    ],
  };
}

export function gradeArray(source: string): Graded {
  const { tests, error, writes } = testArray(source);
  if (error) return { passed: false, message: error };
  const failed = tests.filter((test) => !test.ok);
  if (!failed.length) return { passed: true, message: "循环只碰了数组里的 5 格，旁边的人数完好无损。" };
  if (writes.includes(COUNT_ADDR)) return { passed: false, message: "程序往 [35] 写过东西：数组只有 [30]～[34] 这 5 格，循环多走了一格，写到了旁边的人数上。之后再把它改回来也不行，要让循环别越界。" };
  return { passed: false, message: `还没完成：${failed.map((test) => `${test.label}（${test.detail}）`).join("；")}。` };
}

// ---------------------------------------------------------------------------
// Ch5 · a function that leaves the stack unbalanced
// ---------------------------------------------------------------------------

export const STACK_BROKEN = `; 打印 4 和 7 的两倍：应该输出 8、14
      SET R1, 4
      CALL double
      OUT R0
      SET R1, 7
      CALL double
      OUT R0
      HALT

; double：R0 = R1 × 2。要用到 R1，先存起来
double: PUSH R1
      MOV R0, R1
      ADD R0, R1
      RET`;

export function testStack(source: string): { tests: TestResult[]; error?: string } {
  const compiled = compile(source);
  if ("message" in compiled) return { tests: [], error: compiled.message };
  const result = run(compiled.program);
  const state = result.state;
  const outputOk = state.output.length === 2 && state.output[0] === 8 && state.output[1] === 14;
  return {
    tests: [
      { label: "程序正常停下，没有出错", ok: result.reason === "halted", detail: result.reason === "halted" ? "正常停下" : (state.fault ?? "没有停下") },
      { label: "输出 8、14", ok: result.reason === "halted" && outputOk, detail: `输出了 ${state.output.length ? state.output.join("、") : "（没有）"}` },
      { label: "结束时栈是空的（PUSH 和 POP 配对）", ok: result.reason === "halted" && state.sp === 64, detail: `栈里还剩 ${64 - state.sp} 格` },
    ],
  };
}

export function gradeStack(source: string): Graded {
  const { tests, error } = testStack(source);
  if (error) return { passed: false, message: error };
  const failed = tests.filter((test) => !test.ok);
  if (!failed.length) return { passed: true, message: "函数存进栈里的东西都取了回来，RET 拿到的正好是返回地址。" };
  return { passed: false, message: `还没完成：${failed.map((test) => `${test.label}（${test.detail}）`).join("；")}。` };
}

// ---------------------------------------------------------------------------
// Ch6 · make three loops fit the cycle budget
// ---------------------------------------------------------------------------

export type CacheChoice = { order: "row" | "column"; layout: "records" | "columns"; offset: 16 | 24 };
export const CACHE_INITIAL: CacheChoice = { order: "column", layout: "records", offset: 16 };

function gridAddresses(order: CacheChoice["order"]): number[] {
  const out: number[] = [];
  for (let outer = 0; outer < 8; outer += 1) for (let inner = 0; inner < 8; inner += 1) out.push(order === "row" ? outer * 8 + inner : inner * 8 + outer);
  return out;
}

function fineAddresses(layout: CacheChoice["layout"]): number[] {
  return Array.from({ length: 32 }, (_, index) => (layout === "records" ? index * 2 + 1 : 32 + index));
}

function pairAddresses(offset: number): number[] {
  return Array.from({ length: 8 }, (_, index) => [index, offset + index]).flat();
}

export function evaluateCache(choice: CacheChoice) {
  const tasks = [
    { id: "grid", label: "把 8×8 表格的 64 个格子加起来", budget: 400, stats: simulateCache(gridAddresses(choice.order)), addresses: gridAddresses(choice.order) },
    { id: "fines", label: "把 32 位读者的罚金加起来", budget: 200, stats: simulateCache(fineAddresses(choice.layout)), addresses: fineAddresses(choice.layout) },
    { id: "pairs", label: "把数组 a 和 b 对应位置相加（各 8 个数）", budget: 150, stats: simulateCache(pairAddresses(choice.offset)), addresses: pairAddresses(choice.offset) },
  ];
  return { tasks: tasks.map((task) => ({ ...task, ok: task.stats.cycles <= task.budget })), passed: tasks.every((task) => task.stats.cycles <= task.budget) };
}

export function gradeCache(choice: CacheChoice): Graded {
  const result = evaluateCache(choice);
  const slow = result.tasks.filter((task) => !task.ok);
  if (!slow.length) return { passed: true, message: "三段程序都在预算内：访问挨着的地址，缓存行里一次取来的数据都用上了。" };
  return { passed: false, message: `还有 ${slow.length} 段超出预算：${slow.map((task) => `${task.label}用了 ${task.stats.cycles} 个周期（预算 ${task.budget}）`).join("；")}。` };
}

// ---------------------------------------------------------------------------
// Ch7 · scheduling
// ---------------------------------------------------------------------------

export const SCHEDULE_INITIAL: Policy = { algorithm: "fcfs", quantum: 30 };
export const ALGORITHMS: { id: Algorithm; label: string }[] = [
  { id: "fcfs", label: "先来先服务：谁先到谁先跑，跑完为止" },
  { id: "sjf", label: "短作业优先：挑剩余时间最短的，跑完为止" },
  { id: "rr", label: "轮转：每个程序轮流跑一个时间片" },
];

export function gradeSchedule(policy: Policy): Graded {
  const { goals, passed } = evaluateSchedule(policy);
  if (passed) return { passed: true, message: "键盘、视频、编译都照顾到了，切换的开销也不大。" };
  const failed = goals.filter((goal) => !goal.ok);
  return { passed: false, message: `还没满足：${failed.map((goal) => `${goal.label}（${goal.detail}）`).join("；")}。` };
}

export function parsePolicy(value: unknown): Policy | null {
  if (!value || typeof value !== "object") return null;
  const { algorithm, quantum } = value as Record<string, unknown>;
  if (algorithm !== "fcfs" && algorithm !== "sjf" && algorithm !== "rr") return null;
  if (!QUANTA.includes(quantum as (typeof QUANTA)[number])) return null;
  return { algorithm, quantum: quantum as number };
}

export function parseCacheChoice(value: unknown): CacheChoice | null {
  if (!value || typeof value !== "object") return null;
  const { order, layout, offset } = value as Record<string, unknown>;
  if ((order !== "row" && order !== "column") || (layout !== "records" && layout !== "columns") || (offset !== 16 && offset !== 24)) return null;
  return { order, layout, offset };
}

export function parseSource(value: unknown): string | null {
  return typeof value === "string" && value.length <= LIMITS.source ? value : null;
}
