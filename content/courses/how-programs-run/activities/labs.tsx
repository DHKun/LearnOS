"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, FastForward, Play, RotateCcw } from "lucide-react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { Button } from "@/components/ui/button";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import {
  ALGORITHMS,
  ARRAY_BROKEN,
  CACHE_INITIAL,
  type CacheChoice,
  MEMORY_INPUT,
  SCHEDULE_INITIAL,
  STACK_BROKEN,
  SUM_BROKEN,
  type TestResult,
  TRACE_INPUT,
  TRACE_PROGRAM,
  TRACE_QUESTIONS,
  type TraceQuestionId,
  evaluateCache,
  testArray,
  testStack,
  testSum,
} from "../simulation/labs";
import { LIMITS, REGISTERS, type State, assemble, trace } from "../simulation/machine";
import { JOBS, type Policy, QUANTA, evaluateSchedule } from "../simulation/scheduler";

const inputClass = "block w-full rounded-md border border-border bg-background p-2 font-mono text-sm";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

type Region = { from: number; to: number; label: string };

/** Regions alternate between two tints so neighbours are easy to tell apart. */
const REGION_TONES = ["border-primary/50 bg-primary/10", "border-success/60 bg-success/15"];

// ---------------------------------------------------------------------------
// The debugger: code, registers, memory, stack, output
// ---------------------------------------------------------------------------

function MemoryGrid({ state, regions, previous }: { state: State; regions: Region[]; previous?: State }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold">内存（64 格）</p>
      <div className="grid grid-cols-8 gap-0.5" data-testid="memory-grid">
        {state.memory.map((value, addr) => {
          const regionIndex = regions.findIndex((item) => addr >= item.from && addr <= item.to);
          const region = regions[regionIndex];
          const inStack = addr >= state.sp;
          const written = state.writes.includes(addr);
          const read = state.reads.includes(addr);
          const changed = previous && previous.memory[addr] !== value;
          return (
            <div
              key={addr}
              title={`[${addr}]${region ? ` ${region.label}` : ""}`}
              data-addr={addr}
              className={cn(
                "flex min-w-0 flex-col items-center rounded border px-0.5 py-0.5 font-mono motion-safe:transition-colors",
                region ? REGION_TONES[regionIndex % REGION_TONES.length] : "border-border",
                inStack && "border-warning/60 bg-warning/10",
                (written || changed) && "ring-2 ring-success/70",
                read && "ring-2 ring-primary/60",
              )}
            >
              <span className="text-[9px] leading-none text-muted-foreground">{addr}</span>
              <span className="truncate text-[11px] leading-tight">{value}</span>
            </div>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        {regions.map((region, index) => (
          <span key={region.label}>
            <span className={cn("mr-1 inline-block size-2.5 rounded-sm border align-middle", REGION_TONES[index % REGION_TONES.length])} />[{region.from}{region.to > region.from ? `～${region.to}` : ""}] {region.label}
          </span>
        ))}
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-warning/30 align-middle" />栈（从 63 往下长）
        </span>
        <span>绿框：这一步写入 · 蓝框：这一步读取</span>
      </p>
    </div>
  );
}

function Debugger({ source, memory, regions, label = "调试器" }: { source: string; memory: Record<number, number>; regions: Region[]; label?: string }) {
  const compiled = React.useMemo(() => assemble(source), [source]);
  const states = React.useMemo(() => ("program" in compiled ? trace(compiled.program, memory) : []), [compiled, memory]);
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [states]);
  if ("error" in compiled) {
    return <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">{compiled.error.line ? `第 ${compiled.error.line} 行：` : ""}{compiled.error.message}</p>;
  }
  const state = states[Math.min(index, states.length - 1)]!;
  const previous = index > 0 ? states[index - 1] : undefined;
  const current = compiled.program.instructions[state.pc];
  const lines = source.split("\n");
  const last = states.length - 1;
  return (
    <div className="space-y-3 rounded-xl border border-border p-3" data-testid="debugger">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold">{label}</p>
        <span className="text-xs text-muted-foreground" data-testid="debugger-step">
          第 {index} / {last} 步
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setIndex(0)} disabled={index === 0} aria-label="回到开头">
            <RotateCcw className="size-4" aria-hidden />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
            <ChevronLeft className="size-4" aria-hidden /> 上一步
          </Button>
          <Button type="button" size="sm" onClick={() => setIndex((value) => Math.min(last, value + 1))} disabled={index >= last}>
            下一步 <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setIndex(last)} disabled={index >= last}>
            <FastForward className="size-4" aria-hidden /> 运行到底
          </Button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ol className="m-0 max-h-80 list-none overflow-auto rounded-lg bg-slate-950 p-2 font-mono text-xs leading-relaxed text-slate-100">
          {lines.map((text, row) => {
            const active = !state.halted && !state.fault && current?.line === row + 1;
            return (
              <li key={row} className={cn("flex gap-2 whitespace-pre rounded px-1", active && "bg-sky-500/25 ring-1 ring-sky-400/60")} data-active={active}>
                <span className="w-5 shrink-0 select-none text-right text-slate-500">{row + 1}</span>
                <span>{text || " "}</span>
              </li>
            );
          })}
        </ol>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-4 gap-1 text-center font-mono text-xs">
            {REGISTERS.map((reg) => (
              <div key={reg} className={cn("rounded-md border px-1 py-1", previous && previous.regs[reg] !== state.regs[reg] ? "border-success bg-success/10" : "border-border")} data-register={reg}>
                <p className="text-[10px] text-muted-foreground">{reg}</p>
                <p className="text-sm font-semibold">{state.regs[reg]}</p>
              </div>
            ))}
          </div>
          <p className="flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
            <span>PC = {state.pc}</span>
            <span>Z = {state.zero ? 1 : 0}</span>
            <span>N = {state.negative ? 1 : 0}</span>
            <span>SP = {state.sp}</span>
          </p>
          <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs" data-testid="debugger-output">
            输出：{state.output.length ? state.output.join("、") : "（还没有）"}
          </p>
          {(state.halted || state.fault) && (
            <p className={cn("rounded-md px-2 py-1 text-xs", state.fault ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>{state.fault ?? `HALT：程序停下了，一共执行了 ${state.steps} 条指令。`}</p>
          )}
        </div>
      </div>
      <MemoryGrid state={state} previous={previous} regions={regions} />
    </div>
  );
}

function Tests({ tests, error }: { tests: TestResult[]; error?: string }) {
  if (error) return <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">{error}</p>;
  return (
    <ul className="m-0 grid list-none gap-2 p-0" data-testid="tests">
      {tests.map((test) => (
        <li key={test.label} className="rounded-md border border-border px-3 py-2" data-ok={test.ok}>
          <Verdict ok={test.ok}>{test.label}</Verdict>
          <p className="mt-0.5 text-xs text-muted-foreground">{test.detail}</p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Ch2 · trace
// ---------------------------------------------------------------------------

type TraceState = { answers: Partial<Record<TraceQuestionId, string>>; quantity: number; passed: boolean };
const TRACE_STATE: TraceState = { answers: {}, quantity: TRACE_INPUT[11], passed: false };
function normalizeTrace(value: unknown): TraceState {
  const record = asRecord(value);
  const answers = asRecord(record.answers);
  const quantity = typeof record.quantity === "number" && Number.isInteger(record.quantity) && record.quantity >= 0 && record.quantity <= 99 ? record.quantity : TRACE_INPUT[11];
  return {
    answers: Object.fromEntries(TRACE_QUESTIONS.filter((item) => typeof answers[item.id] === "string").map((item) => [item.id, (answers[item.id] as string).slice(0, 20)])),
    quantity,
    passed: record.passed === true,
  };
}

const TRACE_REGIONS: Region[] = [
  { from: 10, to: 10, label: "单价" },
  { from: 11, to: 11, label: "数量" },
  { from: 20, to: 20, label: "小计" },
  { from: 21, to: 21, label: "应付" },
];

export function TraceLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<TraceState>(TRACE_STATE, normalizeTrace);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const memory = React.useMemo(() => ({ ...TRACE_INPUT, 11: state.quantity }), [state.quantity]);
  return (
    <div className="space-y-4" data-testid="how-programs-run-trace">
      <Ticket goal="单步执行这段结账程序，回答下面四个问题。">书店收银台的程序算错了一笔账，你要先弄清楚它每一步到底做了什么。单价 8 元、数量 4 件已经放在内存里。</Ticket>
      <label className="flex flex-wrap items-center gap-2 text-xs font-medium">
        数量 [11] =
        <input aria-label="数量" type="number" min={0} max={99} disabled={readOnly} value={state.quantity} onChange={(event) => setState((current) => ({ ...current, quantity: Math.max(0, Math.min(99, Math.trunc(Number(event.target.value) || 0))) }))} className={cn(inputClass, "w-20")} />
        <span className="font-normal text-muted-foreground">改了之后调试器会从头运行</span>
      </label>
      <Debugger source={TRACE_PROGRAM} memory={memory} regions={TRACE_REGIONS} />
      <div className="space-y-3">
        {TRACE_QUESTIONS.map((item, index) => (
          <label key={item.id} className="block space-y-1 rounded-xl border border-border p-4 text-sm font-medium">
            {index + 1}. {item.question}
            <input aria-label={item.question} disabled={locked} inputMode="numeric" value={state.answers[item.id] ?? ""} maxLength={20} onChange={(event) => setState((current) => ({ ...current, answers: { ...current.answers, [item.id]: event.target.value } }))} className={cn(inputClass, "max-w-40")} />
          </label>
        ))}
      </div>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交答案" last={last}
        onSubmit={() => void submit({ answers: state.answers }, "hpr_trace_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Program labs: edit the program until the tests pass
// ---------------------------------------------------------------------------

type ProgramState = { source: string; tested: string | null; passed: boolean };

function ProgramLab({
  id,
  readOnly,
  initial,
  ticket,
  goal,
  event,
  test,
  memory,
  regions,
}: {
  id: string;
  readOnly: boolean;
  initial: string;
  ticket: React.ReactNode;
  goal: React.ReactNode;
  event: string;
  test: (source: string) => { tests: TestResult[]; error?: string };
  memory: Record<number, number>;
  regions: Region[];
}) {
  const start = React.useMemo<ProgramState>(() => ({ source: initial, tested: null, passed: false }), [initial]);
  const normalize = React.useCallback(
    (value: unknown): ProgramState => {
      const record = asRecord(value);
      return { source: typeof record.source === "string" ? record.source.slice(0, LIMITS.source) : initial, tested: typeof record.tested === "string" ? record.tested.slice(0, LIMITS.source) : null, passed: record.passed === true };
    },
    [initial],
  );
  const { state, setState, ...save } = useActivityState<ProgramState>(start, normalize);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const results = React.useMemo(() => (state.tested === null ? null : test(state.tested)), [state.tested, test]);
  return (
    <div className="space-y-4" data-testid={`how-programs-run-${id}`}>
      <Ticket goal={goal}>{ticket}</Ticket>
      <div className="space-y-2">
        <textarea
          aria-label="程序"
          disabled={locked}
          value={state.source}
          rows={Math.min(22, state.source.split("\n").length + 1)}
          maxLength={LIMITS.source}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(event) => setState((current) => ({ ...current, source: event.target.value }))}
          className={cn(inputClass, "text-xs leading-relaxed")}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setState((current) => ({ ...current, tested: current.source }))} disabled={readOnly}>
            <Play className="size-4" aria-hidden /> 运行测试
          </Button>
          <Button type="button" variant="outline" disabled={locked} onClick={() => setState((current) => ({ ...current, source: initial, tested: null }))}>
            <RotateCcw className="size-4" aria-hidden /> 恢复原来的程序
          </Button>
        </div>
      </div>
      {results ? <Tests tests={results.tests} error={results.error} /> : <p className="text-sm text-muted-foreground">点“运行测试”看看程序现在的表现。</p>}
      {state.tested !== null && <Debugger source={state.tested} memory={memory} regions={regions} label="调试器（最近一次运行测试的程序）" />}
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交程序" last={last}
        onSubmit={() => void submit({ source: state.source }, event).then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

const SUM_MEMORY = { 21: 10 };

export function LoopLab({ readOnly }: ActivityComponentProps) {
  return (
    <ProgramLab
      id="loop"
      readOnly={readOnly}
      initial={SUM_BROKEN}
      memory={SUM_MEMORY}
      regions={[
        { from: 20, to: 20, label: "结果" },
        { from: 21, to: 21, label: "N" },
      ]}
      event="hpr_loop_lab_submitted"
      test={testSum}
      ticket={<>这段程序要算 1 + 2 + … + N。同事说“我试过 N = 10，结果是 45”，可正确答案是 55。服务端会用四个不同的 N 来测试它，调试器里用的是 N = 10。</>}
      goal="改好程序，让四个测试全部通过。"
    />
  );
}

export function ArrayLab({ readOnly }: ActivityComponentProps) {
  return (
    <ProgramLab
      id="array"
      readOnly={readOnly}
      initial={ARRAY_BROKEN}
      memory={MEMORY_INPUT}
      regions={[
        { from: 30, to: 34, label: "成绩" },
        { from: 35, to: 35, label: "人数" },
      ]}
      event="hpr_array_lab_submitted"
      test={testArray}
      ticket={<>补考之后每个人加 10 分，再打印成绩单。可打印出来的成绩单有 15 行，后面一串都是 0；班级人数也从 5 变成了 15。</>}
      goal="改好程序，让三个测试全部通过：成绩加对、成绩单正好 5 行、人数从头到尾没被写坏。"
    />
  );
}

export function StackLab({ readOnly }: ActivityComponentProps) {
  return (
    <ProgramLab
      id="stack"
      readOnly={readOnly}
      initial={STACK_BROKEN}
      memory={{}}
      regions={[]}
      event="hpr_stack_lab_submitted"
      test={testStack}
      ticket={<>这段程序调用两次函数 double，应该打印 8 和 14。可它一个数也没打印，反而报错说栈满了。</>}
      goal="改好程序，让三个测试全部通过。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · cache
// ---------------------------------------------------------------------------

type CacheState = { choice: CacheChoice; passed: boolean };
function normalizeCache(value: unknown): CacheState {
  const record = asRecord(value);
  const choice = asRecord(record.choice);
  return {
    choice: {
      order: choice.order === "row" || choice.order === "column" ? choice.order : CACHE_INITIAL.order,
      layout: choice.layout === "records" || choice.layout === "columns" ? choice.layout : CACHE_INITIAL.layout,
      offset: choice.offset === 16 || choice.offset === 24 ? choice.offset : CACHE_INITIAL.offset,
    },
    passed: record.passed === true,
  };
}

function Options<T extends string | number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled: boolean }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold">{label}</legend>
      {options.map((option) => (
        <label key={String(option.value)} className="flex items-start gap-2 text-sm">
          <input type="radio" name={label} disabled={disabled} checked={value === option.value} onChange={() => onChange(option.value)} className="mt-1" />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function AccessStrip({ addresses }: { addresses: number[] }) {
  const lines = 4;
  const size = 4;
  const tags = new Array<number>(lines).fill(-1);
  const marks = addresses.map((addr) => {
    const block = Math.floor(addr / size);
    const hit = tags[block % lines] === block;
    tags[block % lines] = block;
    return { addr, hit };
  });
  return (
    <div className="flex flex-wrap gap-0.5" aria-hidden>
      {marks.map((mark, index) => (
        <span key={index} title={`[${mark.addr}] ${mark.hit ? "命中" : "未命中"}`} className={cn("size-2.5 rounded-sm", mark.hit ? "bg-success/70" : "bg-destructive/70")} />
      ))}
    </div>
  );
}

export function CacheLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<CacheState>({ choice: CACHE_INITIAL, passed: false }, normalizeCache);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateCache(state.choice);
  const set = (patch: Partial<CacheChoice>) => setState((current) => ({ ...current, choice: { ...current.choice, ...patch } }));
  return (
    <div className="space-y-4" data-testid="how-programs-run-cache">
      <Ticket goal="改这三处写法，让三段程序都在周期预算内跑完。">
        格子机加了一块缓存：4 行，每行装 4 个挨着的格子。数据在缓存里，读一次只要 1 个周期；不在，就要花 20 个周期把那一整行从内存里搬过来。三段程序结果都对，就是太慢。
      </Ticket>
      <div className="grid gap-4 md:grid-cols-3">
        <Options label="① 8×8 表格（按行存放）怎么遍历" value={state.choice.order} disabled={locked} onChange={(order) => set({ order })} options={[{ value: "column" as const, label: "外层按列，内层按行" }, { value: "row" as const, label: "外层按行，内层按列" }]} />
        <Options label="② 32 位读者的借阅数和罚金怎么存" value={state.choice.layout} disabled={locked} onChange={(layout) => set({ layout })} options={[{ value: "records" as const, label: "每位读者两格挨着：借阅数、罚金、借阅数、罚金…" }, { value: "columns" as const, label: "先放 32 个借阅数，再放 32 个罚金" }]} />
        <Options label="③ 数组 b 从哪里开始放（a 从 0 开始）" value={state.choice.offset} disabled={locked} onChange={(offset) => set({ offset })} options={[{ value: 16 as const, label: "从地址 16 开始" }, { value: 24 as const, label: "从地址 24 开始" }]} />
      </div>
      <ul className="m-0 grid list-none gap-3 p-0">
        {result.tasks.map((task) => (
          <li key={task.id} className="space-y-2 rounded-xl border border-border p-3" data-task={task.id} data-ok={task.ok}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Verdict ok={task.ok}>{task.label}</Verdict>
              <span className="font-mono text-xs">
                {task.stats.cycles} / {task.budget} 周期 · 命中 {task.stats.hits} · 未命中 {task.stats.misses}
              </span>
            </div>
            <AccessStrip addresses={task.addresses} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">每个小方块是一次读取：绿色命中缓存，红色未命中。</p>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交选择" last={last}
        onSubmit={() => void submit({ choice: state.choice }, "hpr_cache_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}


// ---------------------------------------------------------------------------
// Ch7 · scheduling
// ---------------------------------------------------------------------------

type ScheduleState = { policy: Policy; passed: boolean };
function normalizeSchedule(value: unknown): ScheduleState {
  const record = asRecord(value);
  const policy = asRecord(record.policy);
  const algorithm = policy.algorithm === "fcfs" || policy.algorithm === "sjf" || policy.algorithm === "rr" ? policy.algorithm : SCHEDULE_INITIAL.algorithm;
  const quantum = QUANTA.includes(policy.quantum as (typeof QUANTA)[number]) ? (policy.quantum as number) : SCHEDULE_INITIAL.quantum;
  return { policy: { algorithm, quantum }, passed: record.passed === true };
}

const PROGRAM_ROWS = [
  { id: "keyboard", label: "键盘", tone: "bg-primary" },
  { id: "video", label: "视频", tone: "bg-success" },
  { id: "compile", label: "编译", tone: "bg-warning" },
] as const;

export function ScheduleLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<ScheduleState>({ policy: SCHEDULE_INITIAL, passed: false }, normalizeSchedule);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const { schedule, goals } = evaluateSchedule(state.policy);
  const span = Math.max(schedule.end, 100);
  const programOf = (job: string | null) => JOBS.find((item) => item.id === job)?.program;
  return (
    <div className="space-y-4" data-testid="how-programs-run-schedule">
      <Ticket goal="选一种调度方式，让下面四个要求同时满足。">
        格子机只有一个 CPU，同时有三个程序要跑：编译一个大项目（要 60 毫秒）；播放视频，每 20 毫秒要花 4 毫秒画一帧；第 33 毫秒你按了一下键盘，处理它要 2 毫秒。操作系统每换一次程序，要花 1 毫秒切换。
      </Ticket>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Options label="调度方式" value={state.policy.algorithm} disabled={locked} onChange={(algorithm) => setState((current) => ({ ...current, policy: { ...current.policy, algorithm } }))} options={ALGORITHMS.map((item) => ({ value: item.id, label: item.label }))} />
        <Options label="时间片（只对轮转有效）" value={state.policy.quantum} disabled={locked || state.policy.algorithm !== "rr"} onChange={(quantum) => setState((current) => ({ ...current, policy: { ...current.policy, quantum } }))} options={QUANTA.map((value) => ({ value, label: `${value} 毫秒` }))} />
      </div>
      <div className="space-y-1 overflow-x-auto" data-testid="timeline">
        <div className="min-w-[36rem] space-y-1">
          {PROGRAM_ROWS.map((row) => (
            <div key={row.id} className="grid grid-cols-[3rem_1fr] items-center gap-2 text-xs">
              <span>{row.label}</span>
              <div className="relative h-5 rounded bg-muted">
                {schedule.segments
                  .filter((segment) => segment.kind === "run" && programOf(segment.job) === row.id)
                  .map((segment, index) => (
                    <span key={index} className={cn("absolute top-0 h-5 rounded-sm opacity-90", row.tone)} style={{ left: `${(segment.start / span) * 100}%`, width: `${((segment.end - segment.start) / span) * 100}%` }} title={`${segment.start}–${segment.end} 毫秒`} />
                  ))}
                {row.id === "video" && JOBS.filter((job) => job.program === "video").map((job) => <span key={job.id} className="absolute top-0 h-5 w-px bg-foreground/50" style={{ left: `${(job.deadline / span) * 100}%` }} title={`第 ${job.arrive} 毫秒的帧要在 ${job.deadline} 毫秒前画完`} />)}
                {row.id === "keyboard" && <span className="absolute top-0 h-5 w-px bg-foreground/60" style={{ left: `${(33 / span) * 100}%` }} title="第 33 毫秒按下键盘" />}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[3rem_1fr] items-center gap-2 text-xs">
            <span className="text-muted-foreground">切换</span>
            <div className="relative h-3 rounded bg-muted">
              {schedule.segments
                .filter((segment) => segment.kind === "switch")
                .map((segment, index) => (
                  <span key={index} className="absolute top-0 h-3 rounded-sm bg-destructive/70" style={{ left: `${(segment.start / span) * 100}%`, width: `${Math.max(0.4, ((segment.end - segment.start) / span) * 100)}%` }} />
                ))}
            </div>
          </div>
          <div className="grid grid-cols-[3rem_1fr] text-[10px] text-muted-foreground">
            <span />
            <div className="flex justify-between">
              <span>0</span>
              <span>{Math.round(span / 2)} 毫秒</span>
              <span>{span} 毫秒</span>
            </div>
          </div>
        </div>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {goals.map((goal) => (
          <li key={goal.id} className="rounded-md border border-border px-3 py-2" data-goal={goal.id} data-ok={goal.ok}>
            <Verdict ok={goal.ok}>{goal.label}</Verdict>
            <p className="mt-0.5 text-xs text-muted-foreground">{goal.detail}</p>
          </li>
        ))}
      </ul>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交调度方式" last={last}
        onSubmit={() => void submit({ policy: state.policy }, "hpr_schedule_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}
