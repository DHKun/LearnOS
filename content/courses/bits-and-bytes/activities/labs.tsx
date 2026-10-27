"use client";

import * as React from "react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import {
  CODEBOOKS,
  type Codebook,
  INT_TYPES,
  type IntType,
  decode,
  gbkEncode,
  parseColor,
  parseHex,
  sumMod256,
  toBits,
  toHex,
  utf8Encode,
} from "../simulation/bytes";
import {
  CAT_BROKEN_HEAD,
  COLOR_INITIAL,
  COLOR_ROLES,
  type ColorConfig,
  type ColorRole,
  DARK_BG,
  DOUBLE_OPTIONS,
  FILE_STATUSES,
  FILE_TYPES,
  IMAGES,
  IMAGE_FORMATS,
  IMAGE_INITIAL,
  INT_BUDGET,
  INT_FIELDS,
  INT_INITIAL,
  type ImageConfig,
  type ImageId,
  type IntConfig,
  JPEG_QUALITIES,
  LED_TASKS,
  LIGHT_BG,
  type LedTaskId,
  MOJIBAKE_CAUSES,
  MOJIBAKE_RECORDS,
  MONEY_INITIAL,
  type MoneyConfig,
  PARITY_RECEIVED,
  PARITY_RECEIVED_DOUBLE,
  PARITY_SENT,
  PNG_SIGNATURE,
  RECOVERY_OPTIONS,
  SCORE_BROKEN,
  SCORE_SPEC,
  SIZE_CASES,
  type SizeCaseId,
  USB_FILES,
  UTF8_DUMP,
  UTF8_QUESTIONS,
  type Utf8QuestionId,
  bitAt,
  describeType,
  evaluateColors,
  evaluateImages,
  flipBit,
  gradeLedTask,
  inspectScoreFile,
  mismatches,
  parityOf,
  parseLedValue,
  simulateInts,
  simulateMoney,
} from "../simulation/labs";
import { HexDump, Readout, inputClass, selectClass } from "./hex";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string, max = 200): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function GoalList({ goals }: { goals: { id: string; label: string; ok: boolean }[] }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
      {goals.map((goal) => (
        <li key={goal.id} className="rounded-md border border-border px-3 py-2" data-goal={goal.id} data-ok={goal.ok}>
          <Verdict ok={goal.ok}>{goal.label}</Verdict>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Ch2 · LED strip
// ---------------------------------------------------------------------------

function LedStrip({ value, label, small = false }: { value: number | null; label: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={label}>
      {Array.from({ length: 8 }, (_, i) => {
        const on = value !== null && ((value >> (7 - i)) & 1) === 1;
        return (
          <span
            key={i}
            className={cn(
              "inline-block rounded-full border motion-safe:transition-colors",
              small ? "size-3.5" : "size-6",
              on ? "border-warning bg-warning shadow-[0_0_10px_var(--warning)]" : "border-border bg-muted",
            )}
          />
        );
      })}
    </div>
  );
}

type LedState = { values: Record<LedTaskId, string>; passed: boolean };
const LED_INITIAL: LedState = {
  values: Object.fromEntries(LED_TASKS.map((task) => [task.id, task.initial])) as Record<LedTaskId, string>,
  passed: false,
};
function normalizeLed(value: unknown): LedState {
  const record = asRecord(value);
  const values = asRecord(record.values);
  return {
    values: Object.fromEntries(LED_TASKS.map((task) => [task.id, text(values[task.id], task.initial, 8)])) as Record<LedTaskId, string>,
    passed: record.passed === true,
  };
}

export function LedLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<LedState>(LED_INITIAL, normalizeLed);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-led">
      <Ticket goal="让三条灯带都亮成目标的样子。灯从左到右依次对应这个字节的最高位到最低位。">
        店门口的灯带由一个字节控制：8 颗灯对应 8 个位，1 亮 0 灭。配置框里要填这个字节的十六进制值，可店员填的值总是亮错。
      </Ticket>
      {LED_TASKS.map((task, index) => {
        const value = parseLedValue(state.values[task.id]);
        const graded = gradeLedTask(task.id, state.values[task.id]);
        return (
          <section key={task.id} className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-sm">
              <strong>灯带 {index + 1}：</strong>
              {task.ticket}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                目标 <LedStrip value={task.target} small label={`灯带 ${index + 1} 目标`} />
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-xs font-medium">
                配置值（十六进制）
                <input
                  aria-label={`灯带 ${index + 1} 配置值`}
                  disabled={locked}
                  value={state.values[task.id]}
                  maxLength={4}
                  spellCheck={false}
                  onChange={(event) => setState((current) => ({ ...current, values: { ...current.values, [task.id]: event.target.value } }))}
                  className={cn(inputClass, "w-24 uppercase")}
                />
              </label>
              <LedStrip value={value} label={`灯带 ${index + 1} 当前亮法`} />
              <span className="font-mono text-xs text-muted-foreground">{value === null ? "—" : `二进制 ${toBits(value)}`}</span>
            </div>
            <Verdict ok={graded.passed}>{graded.message}</Verdict>
          </section>
        );
      })}
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交三条灯带的配置"
        last={last}
        onSubmit={() =>
          void submit({ values: state.values }, "bits_led_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch3 · Sizes and byte order
// ---------------------------------------------------------------------------

type SizeState = { answers: Partial<Record<SizeCaseId, string>>; passed: boolean };
const SIZE_INITIAL: SizeState = { answers: {}, passed: false };
function normalizeSize(value: unknown): SizeState {
  const record = asRecord(value);
  const answers = asRecord(record.answers);
  return {
    answers: Object.fromEntries(SIZE_CASES.filter(({ id }) => typeof answers[id] === "string").map(({ id }) => [id, text(answers[id], "", 30)])),
    passed: record.passed === true,
  };
}

export function SizeLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<SizeState>(SIZE_INITIAL, normalizeSize);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const set = (id: SizeCaseId, value: string) => setState((current) => ({ ...current, answers: { ...current.answers, [id]: value } }));
  return (
    <div className="space-y-4" data-testid="bits-and-bytes-size">
      <Ticket goal="回答这五个问题。每一题的线索都在给出的规格里，需要的是换算，不是背诵。">
        客服每天都会收到这几类投诉：硬盘“缩水”、网速“虚标”、设备读数莫名其妙。帮他们查清楚。
      </Ticket>
      {SIZE_CASES.map((item, index) => (
        <section key={item.id} className="space-y-2 rounded-xl border border-border p-4">
          <p className="text-sm">
            <strong>{index + 1}. </strong>
            {item.context}
          </p>
          <pre className="m-0 overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-100">{item.artifact}</pre>
          <p className="text-sm font-medium">{item.question}</p>
          {item.kind === "choice" ? (
            <div className="grid gap-2">
              {item.options.map((option) => (
                <label key={option.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`size-${item.id}`}
                    disabled={locked}
                    checked={state.answers[item.id] === option.id}
                    onChange={() => set(item.id, option.id)}
                    className="mt-1"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          ) : (
            <input
              aria-label={item.question}
              disabled={locked}
              inputMode="decimal"
              value={state.answers[item.id] ?? ""}
              maxLength={30}
              onChange={(event) => set(item.id, event.target.value)}
              className={cn(inputClass, "max-w-xs")}
              placeholder="填一个数字"
            />
          )}
        </section>
      ))}
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交答案"
        last={last}
        onSubmit={() =>
          void submit({ answers: state.answers }, "bits_size_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch4 · Integer types
// ---------------------------------------------------------------------------

type IntState = { config: IntConfig; passed: boolean };
const INT_STATE_INITIAL: IntState = { config: { ...INT_INITIAL }, passed: false };
function normalizeInt(value: unknown): IntState {
  const record = asRecord(value);
  const config = asRecord(record.config);
  const types = INT_TYPES.map((item) => item.id);
  return {
    config: Object.fromEntries(
      INT_FIELDS.map(({ id }) => [id, types.includes(config[id] as IntType) ? (config[id] as IntType) : INT_INITIAL[id]]),
    ) as IntConfig,
    passed: record.passed === true,
  };
}

export function IntLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<IntState>(INT_STATE_INITIAL, normalizeInt);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = simulateInts(state.config);
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-int">
      <Ticket goal="为四个字段选择整数类型，让一年里每个时间点都存对，同时每条记录不超过预算。">
        玩家投诉：金币攒到一定数量后突然变成负数，有人的玩家编号和别人重复了。下面按当前的类型配置，回放了游戏上线后一年的数据。
      </Ticket>
      <div className="grid gap-3 sm:grid-cols-2">
        {INT_FIELDS.map((field) => (
          <label key={field.id} className="text-xs font-medium">
            {field.label}
            <span className="ml-1 font-normal text-muted-foreground">（{field.note}）</span>
            <select
              aria-label={`${field.label} 类型`}
              disabled={locked}
              value={state.config[field.id]}
              onChange={(event) =>
                setState((current) => ({ ...current, config: { ...current.config, [field.id]: event.target.value as IntType } }))
              }
              className={cn(selectClass, "font-mono")}
            >
              {INT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.id}（{type.bytes} 字节，{describeType(type.id)}）
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <GoalList goals={result.goals} />
      <p className="text-xs text-muted-foreground">
        当前每条记录 {result.size} 个字节（预算 {INT_BUDGET}）。
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="m-0 w-full min-w-[34rem] text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">时间</th>
              {INT_FIELDS.map((field) => (
                <th key={field.id} className="px-3 py-2 font-medium">
                  {field.label}：实际值 → 存下来的值
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.label} className="border-t border-border/70">
                <td className="px-3 py-2">{row.label}</td>
                {INT_FIELDS.map((field) => {
                  const cell = row.cells[field.id];
                  return (
                    <td key={field.id} className="px-3 py-2 font-mono">
                      {cell.truth.toLocaleString("en-US")} →{" "}
                      <span className={cell.ok ? "text-success" : "font-semibold text-destructive"}>{cell.stored.toLocaleString("en-US")}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交类型配置"
        last={last}
        onSubmit={() =>
          void submit({ ...state.config }, "bits_int_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch5 · Money
// ---------------------------------------------------------------------------

type MoneyState = { config: MoneyConfig; passed: boolean };
const MONEY_STATE_INITIAL: MoneyState = { config: { ...MONEY_INITIAL }, passed: false };
function normalizeMoney(value: unknown): MoneyState {
  const record = asRecord(value);
  const config = asRecord(record.config);
  return {
    config: {
      storage: config.storage === "cents" ? "cents" : config.storage === "float" ? "float" : MONEY_INITIAL.storage,
      rounding: config.rounding === "line" ? "line" : config.rounding === "end" ? "end" : MONEY_INITIAL.rounding,
      display: config.display === "fixed" ? "fixed" : config.display === "raw" ? "raw" : MONEY_INITIAL.display,
    },
    passed: record.passed === true,
  };
}

const MONEY_OPTIONS: { key: keyof MoneyConfig; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: "storage",
    label: "金额怎么存",
    options: [
      { value: "float", label: "小数（以元为单位的浮点数）" },
      { value: "cents", label: "整数（以分为单位）" },
    ],
  },
  {
    key: "rounding",
    label: "什么时候四舍五入到分",
    options: [
      { value: "end", label: "月底算总账时才舍入" },
      { value: "line", label: "每一笔扣款都先舍入" },
    ],
  },
  {
    key: "display",
    label: "界面怎么显示",
    options: [
      { value: "raw", label: "直接显示数字" },
      { value: "fixed", label: "固定两位小数" },
    ],
  },
];

export function MoneyLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<MoneyState>(MONEY_STATE_INITIAL, normalizeMoney);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = simulateMoney(state.config);
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-money">
      <Ticket goal="调整钱包的三项设置，让下面三个目标全部达成。">
        图书馆钱包上线一周，客服接到三类投诉：“余额正好够却提示不足”“账单合计和发票对不上”“余额显示成一长串小数”。下面用当前设置回放了一位读者的全部操作。
      </Ticket>
      <div className="grid gap-3 md:grid-cols-3">
        {MONEY_OPTIONS.map((group) => (
          <label key={group.key} className="text-xs font-medium">
            {group.label}
            <select
              aria-label={group.label}
              disabled={locked}
              value={state.config[group.key]}
              onChange={(event) =>
                setState((current) => ({ ...current, config: { ...current.config, [group.key]: event.target.value } as MoneyConfig }))
              }
              className={selectClass}
            >
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <GoalList goals={result.goals} />
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="m-0 w-full min-w-[32rem] text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">操作</th>
              <th className="px-3 py-2 font-medium">钱包显示的余额</th>
              <th className="px-3 py-2 font-medium">真实余额</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => {
              const wrong = row.shown !== row.truth;
              return (
                <tr key={row.label} className="border-t border-border/70">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className={cn("px-3 py-2 font-mono", wrong ? "font-semibold text-destructive" : "text-success")}>{row.shown}</td>
                  <td className="px-3 py-2 font-mono">{row.truth}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        本月实际扣款合计 {result.charged} 元；发票逐笔金额之和 {result.invoiceTotal} 元。
      </p>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交钱包设置"
        last={last}
        onSubmit={() =>
          void submit({ ...state.config }, "bits_money_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch6 · UTF-8 hex dump
// ---------------------------------------------------------------------------

type Utf8State = { answers: Partial<Record<Utf8QuestionId, string>>; passed: boolean };
const UTF8_INITIAL: Utf8State = { answers: {}, passed: false };
function normalizeUtf8(value: unknown): Utf8State {
  const record = asRecord(value);
  const answers = asRecord(record.answers);
  return {
    answers: Object.fromEntries(UTF8_QUESTIONS.filter(({ id }) => typeof answers[id] === "string").map(({ id }) => [id, text(answers[id], "", 20)])),
    passed: record.passed === true,
  };
}

export function Utf8Lab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<Utf8State>(UTF8_INITIAL, normalizeUtf8);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const set = (id: Utf8QuestionId, value: string) => setState((current) => ({ ...current, answers: { ...current.answers, [id]: value } }));
  return (
    <div className="space-y-4" data-testid="bits-and-bytes-utf8">
      <Ticket goal="只看字节，回答下面四个问题。">
        推送服务限制标题最多 6 个字节。运营发来一个标题，这是它按 UTF-8 编码后的全部字节。先别解码，用每个字节开头的几位判断它属于几字节的字符。
      </Ticket>
      <HexDump bytes={UTF8_DUMP} columns={6} label="标题的 UTF-8 字节" />
      {UTF8_QUESTIONS.map((item, index) => (
        <section key={item.id} className="space-y-2 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">
            {index + 1}. {item.question}
          </p>
          {item.kind === "choice" ? (
            <div className="grid gap-2">
              {item.options.map((option) => (
                <label key={option.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`utf8-${item.id}`}
                    disabled={locked}
                    checked={state.answers[item.id] === option.id}
                    onChange={() => set(item.id, option.id)}
                    className="mt-1"
                  />
                  <span className="font-mono">{option.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <input
              aria-label={item.question}
              disabled={locked}
              inputMode="numeric"
              value={state.answers[item.id] ?? ""}
              maxLength={20}
              onChange={(event) => set(item.id, event.target.value)}
              className={cn(inputClass, "max-w-[10rem]")}
            />
          )}
        </section>
      ))}
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交答案"
        last={last}
        onSubmit={() =>
          void submit({ answers: state.answers }, "bits_utf8_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch7 · Mojibake diagnosis
// ---------------------------------------------------------------------------

type MojibakeState = { causes: Record<string, string>; recovery: Record<string, string>; probe: string; codebook: Codebook; passed: boolean };
const MOJIBAKE_INITIAL: MojibakeState = { causes: {}, recovery: {}, probe: MOJIBAKE_RECORDS[0].id, codebook: "utf-8", passed: false };
function normalizeMojibake(value: unknown): MojibakeState {
  const record = asRecord(value);
  const ids = new Set(MOJIBAKE_RECORDS.map((item) => item.id));
  const pick = (source: unknown, allowed: readonly string[]) =>
    Object.fromEntries(Object.entries(asRecord(source)).filter(([key, entry]) => ids.has(key) && allowed.includes(entry as string))) as Record<string, string>;
  return {
    causes: pick(record.causes, MOJIBAKE_CAUSES.map((item) => item.id)),
    recovery: pick(record.recovery, RECOVERY_OPTIONS.map((item) => item.id)),
    probe: typeof record.probe === "string" && ids.has(record.probe) ? record.probe : MOJIBAKE_INITIAL.probe,
    codebook: CODEBOOKS.some((item) => item.id === record.codebook) ? (record.codebook as Codebook) : "utf-8",
    passed: record.passed === true,
  };
}

export function MojibakeLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<MojibakeState>(MOJIBAKE_INITIAL, normalizeMojibake);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const probe = MOJIBAKE_RECORDS.find((item) => item.id === state.probe) ?? MOJIBAKE_RECORDS[0];
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-mojibake">
      <Ticket goal="为每条记录判断乱码的原因，以及原文还能不能恢复。">
        客服收集了一批“显示成乱码”的反馈，每条都附上了系统里实际存着的字节。有的能救回来，有的已经救不回来了。
      </Ticket>
      <div className="space-y-3">
        {MOJIBAKE_RECORDS.map((record) => (
          <section key={record.id} className="grid gap-3 rounded-xl border border-border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-medium">{record.source}</p>
              <Readout label="用户看到的" value={decode(record.bytes, record.shownWith)} />
              <Readout label="系统里存着的字节" value={toHex(record.bytes)} />
            </div>
            <div className="grid content-start gap-2">
              <label className="text-xs font-medium">
                原因
                <select
                  aria-label={`${record.source} 的原因`}
                  disabled={locked}
                  value={state.causes[record.id] ?? ""}
                  onChange={(event) => setState((current) => ({ ...current, causes: { ...current.causes, [record.id]: event.target.value } }))}
                  className={selectClass}
                >
                  <option value="">请选择</option>
                  {MOJIBAKE_CAUSES.map((cause) => (
                    <option key={cause.id} value={cause.id}>
                      {cause.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                原文能恢复吗
                <select
                  aria-label={`${record.source} 能否恢复`}
                  disabled={locked}
                  value={state.recovery[record.id] ?? ""}
                  onChange={(event) => setState((current) => ({ ...current, recovery: { ...current.recovery, [record.id]: event.target.value } }))}
                  className={selectClass}
                >
                  <option value="">请选择</option>
                  {RECOVERY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        ))}
      </div>
      <section className="space-y-3 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm font-semibold">解码试验台：拿同一串字节换一本密码本</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium">
            记录
            <select aria-label="试验台记录" value={state.probe} onChange={(event) => setState((current) => ({ ...current, probe: event.target.value }))} className={selectClass}>
              {MOJIBAKE_RECORDS.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.source}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            按什么解码
            <select
              aria-label="试验台解码方式"
              value={state.codebook}
              onChange={(event) => setState((current) => ({ ...current, codebook: event.target.value as Codebook }))}
              className={selectClass}
            >
              {CODEBOOKS.map((codebook) => (
                <option key={codebook.id} value={codebook.id}>
                  {codebook.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Readout label={`${toHex(probe.bytes)} 按 ${state.codebook.toUpperCase()} 解码`} value={decode(probe.bytes, state.codebook)} />
      </section>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交诊断报告"
        last={last}
        onSubmit={() =>
          void submit({ causes: state.causes, recovery: state.recovery }, "bits_mojibake_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch8 · Colors
// ---------------------------------------------------------------------------

type ColorState = { config: ColorConfig; passed: boolean };
const COLOR_STATE_INITIAL: ColorState = { config: { ...COLOR_INITIAL }, passed: false };
function normalizeColor(value: unknown): ColorState {
  const record = asRecord(value);
  const config = asRecord(record.config);
  return {
    config: Object.fromEntries(COLOR_ROLES.map(({ id }) => [id, text(config[id], COLOR_INITIAL[id], 9)])) as ColorConfig,
    passed: record.passed === true,
  };
}

function toColorHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => channel.toString(16).toUpperCase().padStart(2, "0")).join("")}`;
}

export function ColorLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<ColorState>(COLOR_STATE_INITIAL, normalizeColor);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateColors(state.config);
  const setColor = (role: ColorRole, value: string) => setState((current) => ({ ...current, config: { ...current.config, [role]: value } }));
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-color">
      <Ticket goal="调整三种颜色，让四个目标全部达成。">
        网站的品牌色是 <code>#3478D4</code>，现在按钮、亮色模式的链接、暗色模式的链接都直接用它。无障碍检查报告：三处的文字都不够清晰。设计师说可以调深浅，但必须还是这个蓝色。
      </Ticket>
      <div className="grid gap-4 lg:grid-cols-3">
        {COLOR_ROLES.map((role) => {
          const rgb = parseColor(state.config[role.id]);
          const background = role.id === "darkLink" ? DARK_BG : LIGHT_BG;
          const ratio = result.ratios[role.id];
          return (
            <section key={role.id} className="min-w-0 space-y-3 rounded-xl border border-border p-4">
              <p className="text-sm font-medium">
                {role.label}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{role.detail}</span>
              </p>
              <div className="rounded-lg border border-border p-4" style={{ background }}>
                {role.id === "button" ? (
                  <span className="inline-block rounded-md px-4 py-2 text-sm font-medium" style={{ background: rgb ? toColorHex(rgb) : "transparent", color: "#FFFFFF" }}>
                    立即借阅
                  </span>
                ) : (
                  <span className="text-sm underline" style={{ color: rgb ? toColorHex(rgb) : "inherit" }}>
                    查看全部馆藏 →
                  </span>
                )}
              </div>
              <label className="text-xs font-medium">
                颜色值
                <input
                  aria-label={`${role.label} 颜色值`}
                  disabled={locked}
                  value={state.config[role.id]}
                  maxLength={9}
                  spellCheck={false}
                  onChange={(event) => setColor(role.id, event.target.value)}
                  className={cn(inputClass, "uppercase")}
                />
              </label>
              {rgb &&
                (["R", "G", "B"] as const).map((channel, index) => (
                  <label key={channel} className="flex items-center gap-2 text-xs">
                    <span className="w-4 font-mono">{channel}</span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      aria-label={`${role.label} ${channel} 通道`}
                      disabled={locked}
                      value={rgb[index]}
                      onChange={(event) => {
                        const next = [...rgb] as [number, number, number];
                        next[index] = Number(event.target.value);
                        setColor(role.id, toColorHex(next));
                      }}
                      className="min-w-0 flex-1"
                    />
                    <span className="w-16 text-right font-mono">
                      {rgb[index]} · {rgb[index].toString(16).toUpperCase().padStart(2, "0")}
                    </span>
                  </label>
                ))}
              <Readout label="对比度" value={rgb ? `${ratio.toFixed(2)} : 1` : "颜色值无效"} tone={ratio >= 4.5 ? "ok" : "bad"} />
            </section>
          );
        })}
      </div>
      <GoalList goals={result.goals} />
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交配色"
        last={last}
        onSubmit={() =>
          void submit({ ...state.config }, "bits_color_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch9 · Images
// ---------------------------------------------------------------------------

type ImageState = { config: ImageConfig; passed: boolean };
const IMAGE_STATE_INITIAL: ImageState = { config: structuredClone(IMAGE_INITIAL), passed: false };
function normalizeImage(value: unknown): ImageState {
  const record = asRecord(value);
  const config = asRecord(record.config);
  return {
    config: Object.fromEntries(
      IMAGES.map(({ id }) => {
        const choice = asRecord(config[id]);
        const fallback = IMAGE_INITIAL[id];
        return [
          id,
          {
            format: IMAGE_FORMATS.includes(choice.format as never) ? choice.format : fallback.format,
            quality: JPEG_QUALITIES.includes(choice.quality as never) ? choice.quality : fallback.quality,
            scale: choice.scale === "half" || choice.scale === "full" ? choice.scale : fallback.scale,
          },
        ];
      }),
    ) as ImageConfig,
    passed: record.passed === true,
  };
}

export function ImageLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<ImageState>(IMAGE_STATE_INITIAL, normalizeImage);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateImages(state.config);
  const patch = (id: ImageId, part: Partial<ImageConfig[ImageId]>) =>
    setState((current) => ({ ...current, config: { ...current.config, [id]: { ...current.config[id], ...part } } }));
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-image">
      <Ticket goal="为三张图选择格式、质量和尺寸：每张都要在体积上限以内，并且看起来没有问题。">
        图书馆首页加载要 8 秒，Logo 边缘有脏点，图标背景是一块白色。下面三张图的体积按一个简化模型估算（模型的假设写在本章正文里）。
      </Ticket>
      <div className="grid gap-4 lg:grid-cols-3">
        {IMAGES.map((image) => {
          const choice = state.config[image.id];
          const item = result.results.find((entry) => entry.id === image.id)!;
          return (
            <section key={image.id} className="min-w-0 space-y-3 rounded-xl border border-border p-4" data-image={image.id} data-ok={item.ok}>
              <div>
                <p className="text-sm font-medium">{image.label}</p>
                <p className="text-xs text-muted-foreground">
                  原图 {image.width}×{image.height}
                  {image.alpha ? "，带透明通道" : ""}；页面上显示宽度 {image.displayWidth}px；上限 {image.budgetKB} KB
                </p>
              </div>
              <label className="text-xs font-medium">
                格式
                <select aria-label={`${image.label} 格式`} disabled={locked} value={choice.format} onChange={(event) => patch(image.id, { format: event.target.value as ImageConfig[ImageId]["format"] })} className={selectClass}>
                  {IMAGE_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                JPEG 质量
                <select
                  aria-label={`${image.label} 质量`}
                  disabled={locked || choice.format !== "jpeg"}
                  value={choice.quality}
                  onChange={(event) => patch(image.id, { quality: Number(event.target.value) as ImageConfig[ImageId]["quality"] })}
                  className={selectClass}
                >
                  {JPEG_QUALITIES.map((quality) => (
                    <option key={quality} value={quality}>
                      {quality}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                尺寸
                <select aria-label={`${image.label} 尺寸`} disabled={locked} value={choice.scale} onChange={(event) => patch(image.id, { scale: event.target.value as "full" | "half" })} className={selectClass}>
                  <option value="full">原尺寸</option>
                  <option value="half">缩小一半</option>
                </select>
              </label>
              <Readout label={`估算体积（未压缩 ${item.rawKB} KB）`} value={`${item.sizeKB} KB`} tone={item.withinBudget ? "ok" : "bad"} />
              {item.ok ? (
                <Verdict ok>大小和效果都达标</Verdict>
              ) : (
                <ul className="m-0 list-none space-y-1 p-0">
                  {[...(item.withinBudget ? [] : [`超出体积上限（${image.budgetKB} KB）`]), ...item.problems].map((problem) => (
                    <li key={problem}>
                      <Verdict ok={false}>{problem}</Verdict>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交图片方案"
        last={last}
        onSubmit={() =>
          void submit({ ...state.config }, "bits_image_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch10 · File headers
// ---------------------------------------------------------------------------

type HeaderState = { files: Record<string, { type?: string; status?: string }>; width: string; repaired: string; selected: string; passed: boolean };
const HEADER_INITIAL: HeaderState = { files: {}, width: "", repaired: toHex(CAT_BROKEN_HEAD), selected: USB_FILES[0].id, passed: false };
function normalizeHeader(value: unknown): HeaderState {
  const record = asRecord(value);
  const ids = new Set(USB_FILES.map((file) => file.id));
  const files: HeaderState["files"] = {};
  for (const [id, entry] of Object.entries(asRecord(record.files))) {
    if (!ids.has(id)) continue;
    const item = asRecord(entry);
    files[id] = {
      type: FILE_TYPES.some((type) => type.id === item.type) ? (item.type as string) : undefined,
      status: FILE_STATUSES.some((status) => status.id === item.status) ? (item.status as string) : undefined,
    };
  }
  return {
    files,
    width: text(record.width, "", 12),
    repaired: text(record.repaired, HEADER_INITIAL.repaired, 60),
    selected: typeof record.selected === "string" && ids.has(record.selected) ? record.selected : HEADER_INITIAL.selected,
    passed: record.passed === true,
  };
}

export function HeaderLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<HeaderState>(HEADER_INITIAL, normalizeHeader);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const selected = USB_FILES.find((file) => file.id === state.selected) ?? USB_FILES[0];
  const repaired = parseHex(state.repaired, 8);
  const signatureOk = repaired !== null && repaired.length === 8 && repaired.every((byte, i) => byte === PNG_SIGNATURE[i]);
  const setFile = (id: string, part: { type?: string; status?: string }) =>
    setState((current) => ({ ...current, files: { ...current.files, [id]: { ...current.files[id], ...part } } }));
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-header">
      <Ticket goal="认出每个文件的真实类型和状态，读出 holiday.jpg 的图片宽度，再修好 cat.png 的文件头。">
        同事的 U 盘里有 8 个文件：有的打不开，有的打开是一堆乱码，还有一个“发票”看起来不太对劲。下面是每个文件开头的字节。
      </Ticket>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="m-0 w-full min-w-[40rem] text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">文件名</th>
              <th className="px-3 py-2 font-medium">开头 8 个字节</th>
              <th className="px-3 py-2 font-medium">真实类型</th>
              <th className="px-3 py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {USB_FILES.map((file) => (
              <tr key={file.id} className={cn("border-t border-border/70", state.selected === file.id && "bg-primary/10")}>
                <td className="px-3 py-2">
                  <button type="button" className="font-mono underline-offset-2 hover:underline" aria-pressed={state.selected === file.id} onClick={() => setState((current) => ({ ...current, selected: file.id }))}>
                    {file.name}
                  </button>
                  <span className="ml-2 text-muted-foreground">{file.size}</span>
                </td>
                <td className="px-3 py-2 font-mono">{toHex(file.head.slice(0, 8))}</td>
                <td className="px-3 py-2">
                  <select aria-label={`${file.name} 的类型`} disabled={locked} value={state.files[file.id]?.type ?? ""} onChange={(event) => setFile(file.id, { type: event.target.value })} className="w-40 rounded-md border border-border bg-background p-1 text-xs">
                    <option value="">请选择</option>
                    {FILE_TYPES.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select aria-label={`${file.name} 的状态`} disabled={locked} value={state.files[file.id]?.status ?? ""} onChange={(event) => setFile(file.id, { status: event.target.value })} className="w-36 rounded-md border border-border bg-background p-1 text-xs">
                    <option value="">请选择</option>
                    {FILE_STATUSES.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <HexDump bytes={selected.head} label={`${selected.name} 的开头 ${selected.head.length} 个字节`} />
          <p className="text-xs text-muted-foreground">点击文件名可以切换查看。可打印的字节也可以对照 ASCII 表读出来。</p>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            holiday.jpg 这张图片宽多少像素？
            <input aria-label="holiday.jpg 宽度" disabled={locked} inputMode="numeric" value={state.width} maxLength={12} onChange={(event) => setState((current) => ({ ...current, width: event.target.value }))} className={cn(inputClass, "max-w-[12rem]")} />
          </label>
          <label className="block text-sm font-medium">
            修复 cat.png 开头的 8 个字节
            <input aria-label="cat.png 文件头" disabled={locked} value={state.repaired} maxLength={60} spellCheck={false} onChange={(event) => setState((current) => ({ ...current, repaired: event.target.value }))} className={cn(inputClass, "uppercase")} />
          </label>
          <Verdict ok={signatureOk}>{signatureOk ? "现在是合法的 PNG 签名" : "还不是 PNG 签名，看图软件会拒绝打开"}</Verdict>
        </div>
      </div>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交检查结果"
        last={last}
        onSubmit={() =>
          void submit({ files: state.files, width: state.width, repaired: state.repaired }, "bits_header_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch11 · Parity grid
// ---------------------------------------------------------------------------

/**
 * Received bits plus the sender's check bits. Only check bits that disagree
 * with the received data are flagged: finding the bit where the bad row and
 * the bad column cross is the student's job, so no data bit is highlighted.
 */
function ParityGrid({
  bytes,
  onFlip,
  locked,
  label,
}: {
  bytes: number[];
  onFlip?: (row: number, col: number) => void;
  locked: boolean;
  label: string;
}) {
  const sent = parityOf(PARITY_SENT);
  const wrong = mismatches(bytes);
  const check = (bad: boolean) =>
    cn(
      "flex size-8 items-center justify-center rounded border font-mono text-sm",
      bad ? "border-destructive bg-destructive/10 font-semibold text-destructive" : "border-dashed border-border text-muted-foreground",
    );
  return (
    <div className="overflow-x-auto">
      <div role="group" aria-label={label} className="grid w-max gap-1" style={{ gridTemplateColumns: "repeat(9, 2rem) 2rem" }}>
        {bytes.map((byte, row) => (
          <React.Fragment key={row}>
            {Array.from({ length: 8 }, (_, col) => {
              const bit = bitAt(byte, col);
              return (
                <button
                  key={col}
                  type="button"
                  disabled={locked || !onFlip}
                  aria-label={`${label} 第 ${row + 1} 行第 ${col + 1} 列`}
                  onClick={() => onFlip?.(row, col)}
                  className={cn(
                    "size-8 rounded border font-mono text-sm disabled:cursor-default",
                    bit ? "border-primary/50 bg-primary/15 text-foreground" : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {bit}
                </button>
              );
            })}
            <span className={check(wrong.rows[row])} aria-label={`第 ${row + 1} 行校验位${wrong.rows[row] ? "，对不上" : ""}`}>
              {sent.rows[row]}
            </span>
            <span className="flex size-8 items-center justify-center font-mono text-xs text-muted-foreground">{String.fromCharCode(byte)}</span>
          </React.Fragment>
        ))}
        {sent.cols.map((bit, col) => (
          <span key={col} className={check(wrong.cols[col])} aria-label={`第 ${col + 1} 列校验位${wrong.cols[col] ? "，对不上" : ""}`}>
            {bit}
          </span>
        ))}
        <span className="col-span-2 flex items-center text-xs text-muted-foreground">← 校验位</span>
      </div>
    </div>
  );
}

type ParityState = { flips: { row: number; col: number }[]; double: string; passed: boolean };
const PARITY_INITIAL: ParityState = { flips: [], double: "", passed: false };
function normalizeParity(value: unknown): ParityState {
  const record = asRecord(value);
  const flips = Array.isArray(record.flips)
    ? record.flips
        .map(asRecord)
        .filter((flip) => Number.isInteger(flip.row) && Number.isInteger(flip.col) && (flip.row as number) >= 0 && (flip.row as number) < 8 && (flip.col as number) >= 0 && (flip.col as number) < 8)
        .slice(0, 64)
        .map((flip) => ({ row: flip.row as number, col: flip.col as number }))
    : [];
  return { flips, double: DOUBLE_OPTIONS.some((option) => option.id === record.double) ? (record.double as string) : "", passed: record.passed === true };
}

export function ParityLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<ParityState>(PARITY_INITIAL, normalizeParity);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const current = state.flips.reduce((bytes, { row, col }) => flipBit(bytes, row, col), PARITY_RECEIVED);
  const toggle = (row: number, col: number) =>
    setState((value) => {
      const exists = value.flips.findIndex((flip) => flip.row === row && flip.col === col);
      const flips = exists >= 0 ? value.flips.filter((_, i) => i !== exists) : [...value.flips, { row, col }];
      return { ...value, flips };
    });
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-parity">
      <Ticket goal="修好第一组数据；判断第二组能不能直接修。">
        发送方把 8 个字节排成 8 行，每行、每列都附了一个校验位（让 1 的个数凑成偶数）。线路受了干扰，收到的数据和校验位对不上。点一个数据位可以把它翻转。
      </Ticket>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0 space-y-2">
          <p className="text-sm font-semibold">第一组：修好它</p>
          <ParityGrid bytes={current} onFlip={toggle} locked={locked} label="第一组" />
          <Readout label="按 ASCII 读出来" value={String.fromCharCode(...current)} />
        </section>
        <section className="min-w-0 space-y-2">
          <p className="text-sm font-semibold">第二组：只看，不改</p>
          <ParityGrid bytes={PARITY_RECEIVED_DOUBLE} locked label="第二组" />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">第二组能直接修好吗？</legend>
            {DOUBLE_OPTIONS.map((option) => (
              <label key={option.id} className="flex items-start gap-2 text-sm">
                <input type="radio" name="parity-double" disabled={locked} checked={state.double === option.id} onChange={() => setState((value) => ({ ...value, double: option.id }))} className="mt-1" />
                {option.label}
              </label>
            ))}
          </fieldset>
        </section>
      </div>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交修复结果"
        last={last}
        onSubmit={() =>
          void submit({ flips: state.flips, double: state.double }, "bits_parity_lab_submitted").then((ok) => {
            if (ok) setState((value) => ({ ...value, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch12 · Repair the score file
// ---------------------------------------------------------------------------

type RepairState = { hex: string; toolText: string; toolCodebook: "utf-8" | "gbk"; passed: boolean };
const REPAIR_INITIAL: RepairState = { hex: toHex(SCORE_BROKEN), toolText: "", toolCodebook: "utf-8", passed: false };
function normalizeRepair(value: unknown): RepairState {
  const record = asRecord(value);
  return {
    hex: text(record.hex, REPAIR_INITIAL.hex, 400),
    toolText: text(record.toolText, "", 40),
    toolCodebook: record.toolCodebook === "gbk" ? "gbk" : "utf-8",
    passed: record.passed === true,
  };
}

export function RepairLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<RepairState>(REPAIR_INITIAL, normalizeRepair);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const bytes = parseHex(state.hex, 64);
  const report = bytes ? inspectScoreFile(bytes) : null;
  const encoded = state.toolText ? (state.toolCodebook === "utf-8" ? utf8Encode(state.toolText) : gbkEncode(state.toolText)) : [];
  return (
    <div className="space-y-5" data-testid="bits-and-bytes-repair">
      <Ticket goal="编辑字节，直到官方读取器的每一项检查都通过。">
        成绩系统导出的林小满的成绩单打不开。她的三科成绩是语文 98、数学 95、英语 87。你手里只有格式说明、这个坏文件，和右边的两个小工具。
      </Ticket>
      <div className="overflow-x-auto rounded-lg border border-border">
        <p className="border-b border-border px-3 py-2 text-xs font-semibold">成绩单文件格式（.score）</p>
        <table className="m-0 w-full min-w-[30rem] text-left text-xs">
          <tbody>
            {SCORE_SPEC.map((row) => (
              <tr key={row.field} className="border-t border-border/60 first:border-t-0">
                <td className="px-3 py-1.5 font-mono">{row.offset}</td>
                <td className="px-3 py-1.5 font-medium">{row.field}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <label className="block text-xs font-medium">
            文件字节（十六进制，空格可有可无）
            <textarea aria-label="文件字节" disabled={locked} value={state.hex} rows={4} spellCheck={false} onChange={(event) => setState((current) => ({ ...current, hex: event.target.value }))} className={cn(inputClass, "uppercase")} />
          </label>
          {bytes ? <HexDump bytes={bytes} label={`共 ${bytes.length} 个字节`} /> : <p className="text-sm text-destructive">字节必须是成对的十六进制数字，最多 64 个字节。</p>}
          {report && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <p className="border-b border-border px-3 py-2 text-xs font-semibold">官方读取器的解析结果</p>
              <table className="m-0 w-full min-w-[30rem] text-left text-xs">
                <tbody>
                  {report.fields.map((field) => (
                    <tr key={field.field} className="border-t border-border/60 first:border-t-0">
                      <td className="px-3 py-1.5">
                        <Verdict ok={field.ok}>{field.field}</Verdict>
                      </td>
                      <td className="px-3 py-1.5 font-mono">{field.bytes}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-mono">{field.value}</span>
                        {field.problem && <span className="block text-destructive">{field.problem}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <section className="space-y-2 rounded-xl border border-dashed border-border p-4">
            <p className="text-sm font-semibold">工具一：文字 → 字节</p>
            <input aria-label="要编码的文字" value={state.toolText} maxLength={40} onChange={(event) => setState((current) => ({ ...current, toolText: event.target.value }))} className={inputClass} placeholder="输入文字" />
            <select aria-label="编码方式" value={state.toolCodebook} onChange={(event) => setState((current) => ({ ...current, toolCodebook: event.target.value as "utf-8" | "gbk" }))} className={selectClass}>
              <option value="utf-8">UTF-8</option>
              <option value="gbk">GBK</option>
            </select>
            <Readout
              label={encoded ? `${encoded.length} 个字节` : "结果"}
              value={encoded === null ? "这个工具的 GBK 码表里没有这些字" : encoded.length ? toHex(encoded) : "—"}
            />
          </section>
          <section className="space-y-2 rounded-xl border border-dashed border-border p-4">
            <p className="text-sm font-semibold">工具二：求和计算器</p>
            <p className="text-xs text-muted-foreground">把当前文件除最后一个字节以外的所有字节相加，再对 256 取余。</p>
            <Readout label="结果" value={bytes && bytes.length > 1 ? `0x${toHex([sumMod256(bytes.slice(0, -1))])}` : "—"} />
          </section>
        </div>
      </div>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        disabled={!bytes}
        label="提交修好的文件"
        last={last}
        onSubmit={() =>
          void submit({ hex: state.hex }, "bits_repair_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}
