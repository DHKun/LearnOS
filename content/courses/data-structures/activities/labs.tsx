"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { Button } from "@/components/ui/button";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import type { Cell, SortName } from "../simulation/algorithms";
import {
  ABSENT,
  ABSENT_LIMIT,
  BUCKET_OPTIONS,
  CARDS,
  FIND_LIMIT,
  FLOOR,
  type Goal,
  HASH_INITIAL,
  type HashChoice,
  PATH_MAX,
  PRESENT,
  PROBE_MAX,
  SHELF,
  SORT_JOBS,
  SORT_NAMES,
  START,
  STEP_BUDGET,
  type Structure,
  TASKS,
  WORKLOADS,
  checkPath,
  evaluateHash,
  evaluateQueues,
  evaluateSearch,
  evaluateSorts,
  evaluateStructures,
  probe,
} from "../simulation/labs";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function GoalList({ goals }: { goals: Goal[] }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
      {goals.map((goal) => (
        <li key={goal.id} className="rounded-md border border-border px-3 py-2" data-goal={goal.id} data-ok={goal.ok}>
          <Verdict ok={goal.ok}>{goal.label}</Verdict>
          {goal.detail && <p className="mt-0.5 text-xs text-muted-foreground">{goal.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

function Radios<T extends string | number>({ label, name, value, options, onChange, disabled }: { label: string; name: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled: boolean }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((option) => (
          <label key={String(option.value)} className="flex items-center gap-1.5 text-sm">
            <input type="radio" name={name} disabled={disabled} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function normalizeChoice<T extends string>(ids: string[], allowed: readonly T[], fallback: T) {
  return (value: unknown): { choice: Record<string, T>; passed: boolean } => {
    const choice = asRecord(asRecord(value).choice);
    return { choice: Object.fromEntries(ids.map((id) => [id, allowed.includes(choice[id] as T) ? (choice[id] as T) : fallback])), passed: asRecord(value).passed === true };
  };
}

// ---------------------------------------------------------------------------
// Ch2 · binary search
// ---------------------------------------------------------------------------

type SearchState = { task: "present" | "absent"; present: number[]; absent: number[]; passed: boolean };
function normalizeSearch(value: unknown): SearchState {
  const record = asRecord(value);
  const list = (items: unknown) => (Array.isArray(items) ? items.filter((item): item is number => Number.isInteger(item) && item >= 0 && item < SHELF.length).slice(0, PROBE_MAX) : []);
  return { task: record.task === "absent" ? "absent" : "present", present: list(record.present), absent: list(record.absent), passed: record.passed === true };
}

export function SearchLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<SearchState>({ task: "present", present: [], absent: [], passed: false }, normalizeSearch);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const target = state.task === "present" ? PRESENT : ABSENT;
  const probes = state[state.task];
  const results = probes.map((index) => probe(index, target));
  const result = evaluateSearch(state.present, state.absent);
  const limit = state.task === "present" ? FIND_LIMIT : ABSENT_LIMIT;
  return (
    <div className="space-y-4" data-testid="data-structures-search">
      <Ticket goal="完成两件事：找到一本书，确认另一本书不在架上。每件事看书的次数有限。">
        一排书架上有 64 本书，按书号从小到大排好了。书脊朝里，要知道某个位置是几号书，只能抽出来看一眼。
      </Ticket>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="任务">
        {(["present", "absent"] as const).map((task) => (
          <Button key={task} type="button" size="sm" variant={state.task === task ? "default" : "outline"} role="tab" aria-selected={state.task === task} onClick={() => setState((current) => ({ ...current, task }))}>
            {task === "present" ? `找 ${PRESENT} 号书（${FIND_LIMIT} 次内）` : `确认 ${ABSENT} 号书不在（${ABSENT_LIMIT} 次内）`}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1 sm:grid-cols-[repeat(16,minmax(0,1fr))]" data-testid="shelf">
        {SHELF.map((_, index) => {
          const seen = results.find((item) => item.index === index);
          return (
            <button
              key={index}
              type="button"
              aria-label={`第 ${index + 1} 本`}
              disabled={locked || Boolean(seen) || probes.length >= PROBE_MAX}
              onClick={() => setState((current) => ({ ...current, [current.task]: [...current[current.task], index] }))}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded border font-mono text-[10px] motion-safe:transition-colors",
                seen ? (seen.result === "found" ? "border-success bg-success/15" : "border-primary/50 bg-primary/10") : "border-border bg-card hover:bg-muted",
              )}
            >
              <span className="text-muted-foreground">{index + 1}</span>
              {seen && <span className="text-xs font-semibold">{seen.value}</span>}
            </button>
          );
        })}
      </div>
      <div className="space-y-1 text-sm" aria-live="polite">
        <p className="text-xs text-muted-foreground">
          已经看了 {probes.length} 次（这件事最多 {limit} 次）。
        </p>
        <ol className="m-0 list-none space-y-0.5 p-0 font-mono text-xs">
          {results.map((item, order) => (
            <li key={order}>
              第 {order + 1} 次：第 {item.index + 1} 本是 {item.value} 号 → {item.result === "found" ? "找到了" : item.result === "smaller" ? `${target} 在它左边` : `${target} 在它右边`}
            </li>
          ))}
        </ol>
        <Button type="button" size="sm" variant="outline" disabled={locked || probes.length === 0} onClick={() => setState((current) => ({ ...current, [current.task]: [] }))}>
          <RotateCcw className="size-4" aria-hidden /> 重新开始这件事
        </Button>
      </div>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交查找记录" last={last}
        onSubmit={() => void submit({ present: state.present, absent: state.absent }, "ds_search_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch3 · array or list
// ---------------------------------------------------------------------------

const normalizeStructure = normalizeChoice<Structure>(WORKLOADS.map((item) => item.id), ["array", "list"], "array");

export function StructureLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState(normalizeStructure({}), normalizeStructure);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateStructures(state.choice);
  return (
    <div className="space-y-4" data-testid="data-structures-structure">
      <Ticket goal={`为三项日常工作各选一种存法，让每项每天都不超过 ${STEP_BUDGET.toLocaleString("zh-CN")} 步。`}>
        馆里的书目系统要存 1000 本书的记录，有三项每天都要做的工作。数组把记录一个挨一个地排在连续的格子里；链表的每条记录都记着下一条在哪。
      </Ticket>
      <div className="space-y-3">
        {WORKLOADS.map((work) => (
          <Radios key={work.id} label={work.label} name={work.id} value={state.choice[work.id]!} disabled={locked} onChange={(value) => setState((current) => ({ ...current, choice: { ...current.choice, [work.id]: value } }))} options={[{ value: "array" as const, label: "数组" }, { value: "list" as const, label: "链表" }]} />
        ))}
      </div>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交选择" last={last}
        onSubmit={() => void submit({ choice: state.choice }, "ds_structure_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch4 · stack or queue
// ---------------------------------------------------------------------------

const normalizeQueue = normalizeChoice<"stack" | "queue">(TASKS.map((item) => item.id), ["stack", "queue"], "stack");

export function QueueLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState(normalizeQueue({}), normalizeQueue);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateQueues(state.choice);
  return (
    <div className="space-y-4" data-testid="data-structures-queue">
      <Ticket goal="为四个功能各选栈或队列，让处理的顺序符合要求。">馆里的系统有四个功能都要“先存起来，再一个个拿出来处理”。拿出来的顺序，取决于用栈还是队列。</Ticket>
      <ul className="m-0 grid list-none gap-3 p-0">
        {TASKS.map((task) => (
          <li key={task.id} className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">
              {task.label}
              <span className="ml-2 text-xs font-normal text-muted-foreground">存进去的顺序：{task.input.join(" → ")}</span>
            </p>
            <Radios label={`${task.label}用`} name={task.id} value={state.choice[task.id]!} disabled={locked} onChange={(value) => setState((current) => ({ ...current, choice: { ...current.choice, [task.id]: value } }))} options={[{ value: "stack" as const, label: "栈（后进先出）" }, { value: "queue" as const, label: "队列（先进先出）" }]} />
          </li>
        ))}
      </ul>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交选择" last={last}
        onSubmit={() => void submit({ choice: state.choice }, "ds_queue_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch5 · hash
// ---------------------------------------------------------------------------

type HashState = { choice: HashChoice; passed: boolean };
function normalizeHash(value: unknown): HashState {
  const choice = asRecord(asRecord(value).choice);
  return {
    choice: {
      fn: choice.fn === "last-digit" || choice.fn === "first-two" || choice.fn === "modulo" ? choice.fn : HASH_INITIAL.fn,
      buckets: BUCKET_OPTIONS.includes(choice.buckets as (typeof BUCKET_OPTIONS)[number]) ? (choice.buckets as (typeof BUCKET_OPTIONS)[number]) : HASH_INITIAL.buckets,
    },
    passed: asRecord(value).passed === true,
  };
}

export function HashLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<HashState>({ choice: HASH_INITIAL, passed: false }, normalizeHash);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateHash(state.choice);
  const peak = Math.max(...result.counts);
  return (
    <div className="space-y-4" data-testid="data-structures-hash">
      <Ticket goal="选一种分格子的规则和格子数，让查任何一个借书证号都很快。">
        前台有一排卡片柜，要按借书证号把 200 位读者的卡片分进格子里，查的时候只翻对应的那一格。今年办的借书证号是 {CARDS[0]}、{CARDS[1]}、{CARDS[2]}……一直到 {CARDS[CARDS.length - 1]}。
      </Ticket>
      <div className="grid gap-4 md:grid-cols-2">
        <Radios label="怎么决定放哪一格" name="fn" value={state.choice.fn} disabled={locked} onChange={(fn) => setState((current) => ({ ...current, choice: { ...current.choice, fn } }))} options={[{ value: "last-digit" as const, label: "看号码的最后一位" }, { value: "first-two" as const, label: "看号码的前两位" }, { value: "modulo" as const, label: "整个号码除以格子数，看余数" }]} />
        <Radios label="一共几个格子" name="buckets" value={state.choice.buckets} disabled={locked} onChange={(buckets) => setState((current) => ({ ...current, choice: { ...current.choice, buckets } }))} options={BUCKET_OPTIONS.map((value) => ({ value, label: `${value} 个` }))} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold">每个格子里有几张卡片</p>
        <div className="flex h-24 items-end gap-px rounded border border-border p-1" data-testid="buckets">
          {result.counts.map((count, index) => (
            <span key={index} title={`第 ${index} 格：${count} 张`} className={cn("min-w-px flex-1 rounded-t-sm", count > 3 ? "bg-destructive/70" : "bg-primary/70")} style={{ height: `${peak ? Math.max(2, (count / peak) * 100) : 2}%` }} />
          ))}
        </div>
      </div>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交方案" last={last}
        onSubmit={() => void submit({ choice: state.choice }, "ds_hash_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch6 · sorting
// ---------------------------------------------------------------------------

const normalizeSort = normalizeChoice<SortName>(SORT_JOBS.map((item) => item.id), SORT_NAMES.map((item) => item.id), "selection");

export function SortLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState(normalizeSort({}), normalizeSort);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateSorts(state.choice);
  return (
    <div className="space-y-4" data-testid="data-structures-sort">
      <Ticket goal="为三批书各选一种排序方法，让每一批都在比较次数的预算内排好，有要求的还要排得稳。">
        管理员要给三批书排序。下面每选一种方法，系统就真的用它把这批书排一遍，数出比较了多少次。
      </Ticket>
      <ul className="m-0 grid list-none gap-3 p-0">
        {SORT_JOBS.map((job) => (
          <li key={job.id} className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">{job.label}</p>
            <label className="block text-xs font-medium">
              排序方法
              <select aria-label={`${job.label} 的排序方法`} disabled={locked} value={state.choice[job.id]} onChange={(event) => setState((current) => ({ ...current, choice: { ...current.choice, [job.id]: event.target.value as SortName } }))} className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm">
                {SORT_NAMES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交选择" last={last}
        onSubmit={() => void submit({ choice: state.choice }, "ds_sort_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch7 · shortest route
// ---------------------------------------------------------------------------

type RouteState = { path: Cell[]; passed: boolean };
function normalizeRoute(value: unknown): RouteState {
  const record = asRecord(value);
  const path = Array.isArray(record.path)
    ? record.path.filter((item): item is Cell => Array.isArray(item) && item.length === 2 && item.every((n) => Number.isInteger(n) && n >= 0 && n < 20)).slice(0, PATH_MAX)
    : [];
  return { path: path.length ? path : [START], passed: record.passed === true };
}

export function RouteLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<RouteState>({ path: [START], passed: false }, normalizeRoute);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const check = checkPath(state.path);
  const tail = state.path[state.path.length - 1]!;
  const onPath = (x: number, y: number) => state.path.findIndex(([px, py]) => px === x && py === y);
  const click = (x: number, y: number) =>
    setState((current) => {
      const end = current.path[current.path.length - 1]!;
      if (current.path.length > 1 && end[0] === x && end[1] === y) return { ...current, path: current.path.slice(0, -1) };
      const adjacent = Math.abs(end[0] - x) + Math.abs(end[1] - y) === 1;
      if (!adjacent || FLOOR[y]![x] === "#" || current.path.length >= PATH_MAX) return current;
      return { ...current, path: [...current.path, [x, y]] };
    });
  return (
    <div className="space-y-4" data-testid="data-structures-route">
      <Ticket goal="从入口 S 走到科幻区 T，走最短的路线。">
        读者问前台怎么去科幻区。灰色是书架，走不过去。点和路线末端相邻的空地往前走一步，点末端那一格退回一步。
      </Ticket>
      <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${FLOOR[0]!.length}, minmax(0, 1fr))` }} data-testid="floor">
        {FLOOR.flatMap((row, y) =>
          [...row].map((cell, x) => {
            const position = onPath(x, y);
            const isTail = tail[0] === x && tail[1] === y;
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                aria-label={cell === "#" ? `书架 ${x},${y}` : `${x},${y}${cell === "S" ? " 入口" : cell === "T" ? " 科幻区" : ""}`}
                disabled={locked || cell === "#"}
                onClick={() => click(x, y)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-sm text-[10px] font-semibold sm:size-9",
                  cell === "#" ? "bg-muted-foreground/40" : position >= 0 ? (isTail ? "bg-primary text-primary-foreground" : "bg-primary/30") : "border border-border bg-card hover:bg-muted",
                  cell === "T" && position < 0 && "border-success bg-success/15",
                )}
              >
                {cell === "S" ? "S" : cell === "T" ? "T" : position > 0 ? position : ""}
              </button>
            );
          }),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
        <span data-testid="route-moves">
          已走 {check.moves} 步{check.reached ? "，到达科幻区" : ""}
        </span>
        <Button type="button" size="sm" variant="outline" disabled={locked || state.path.length <= 1} onClick={() => setState((current) => ({ ...current, path: [START] }))}>
          <RotateCcw className="size-4" aria-hidden /> 回到入口
        </Button>
      </div>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交路线" last={last} disabled={!check.reached}
        onSubmit={() => void submit({ path: state.path }, "ds_route_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}
