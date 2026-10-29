"use client";

import * as React from "react";
import { Database, Play, RotateCcw, Table2 } from "lucide-react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { Button } from "@/components/ui/button";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import {
  type ConsoleLabId,
  type Goal,
  HISTORY_MAX,
  QUERY_LABS,
  type QueryLabId,
  STATEMENT_MAX,
  gradeModify,
  gradeTransaction,
  replayConsole,
} from "../simulation/labs";
import { INCIDENT_SCHEMA, SCHEMA, halfBorrowDb, incidentDb, libraryDb } from "../simulation/library";
import { type Db, LIMITS, type Outcome, type ResultSet, type Row, type Value, display, query } from "../simulation/sql";

const editorClass = "block w-full rounded-md border border-border bg-background p-3 font-mono text-sm leading-relaxed";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function Cell({ value }: { value: Value }) {
  if (value === null) return <span className="italic text-muted-foreground">NULL</span>;
  return <>{display(value)}</>;
}

function ResultTable({ result, truncated = 0, highlight }: { result: ResultSet; truncated?: number; highlight?: (index: number) => "new" | "changed" | null }) {
  const shown = result.rows.slice(0, LIMITS.display);
  return (
    <div className="space-y-1">
      <div className="max-h-80 overflow-auto rounded-lg border border-border">
        <table className="m-0 w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {result.columns.map((name, index) => (
                <th key={`${name}-${index}`} className="whitespace-nowrap border-b border-border px-2 py-1.5 text-left font-mono font-semibold">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => {
              const mark = highlight?.(index);
              return (
                <tr key={index} className={cn("border-b border-border/60 last:border-0", mark === "new" && "bg-success/10", mark === "changed" && "bg-warning/15")}>
                  {row.map((value, column) => (
                    <td key={column} className="whitespace-nowrap px-2 py-1 font-mono">
                      <Cell value={value} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        ({result.rows.length} 行{truncated > 0 || result.rows.length > LIMITS.display ? `，只显示前 ${LIMITS.display} 行` : ""})
      </p>
    </div>
  );
}

function SchemaPanel({ schema }: { schema: { table: string; columns: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <Database className="size-3.5" aria-hidden /> 表结构
      </p>
      <ul className="m-0 list-none space-y-0.5 p-0">
        {schema.map((item) => (
          <li key={item.table}>
            <code className="font-semibold">{item.table}</code>
            <span className="text-muted-foreground">：{item.columns}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Query labs: one SELECT, graded on its result
// ---------------------------------------------------------------------------

type QueryState = { sql: string; ran: string | null; passed: boolean };

function QueryLab({ id, readOnly, ticket, goal, label, event }: { id: QueryLabId; readOnly: boolean; ticket: React.ReactNode; goal: React.ReactNode; label: string; event: string }) {
  const initial = React.useMemo<QueryState>(() => ({ sql: QUERY_LABS[id].initial, ran: null, passed: false }), [id]);
  const normalize = React.useCallback(
    (value: unknown): QueryState => {
      const record = asRecord(value);
      return { sql: text(record.sql, QUERY_LABS[id].initial, LIMITS.sql), ran: typeof record.ran === "string" ? record.ran.slice(0, LIMITS.sql) : null, passed: record.passed === true };
    },
    [id],
  );
  const { state, setState, ...save } = useActivityState<QueryState>(initial, normalize);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const output = React.useMemo(() => (state.ran === null ? null : query(libraryDb(), state.ran)), [state.ran]);
  const run = () => setState((current) => ({ ...current, ran: current.sql }));
  return (
    <div className="space-y-4" data-testid={`sql-basics-${id}`}>
      <Ticket goal={goal}>{ticket}</Ticket>
      <SchemaPanel schema={SCHEMA} />
      <div className="space-y-2">
        <textarea
          aria-label="SQL"
          disabled={locked}
          value={state.sql}
          maxLength={LIMITS.sql}
          rows={6}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(event) => setState((current) => ({ ...current, sql: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              run();
            }
          }}
          className={editorClass}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={run} disabled={readOnly || state.sql.trim() === ""}>
            <Play className="size-4" aria-hidden /> 运行查询
          </Button>
          <span className="text-xs text-muted-foreground">Ctrl + Enter 也可以运行</span>
          <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={locked} onClick={() => setState((current) => ({ ...current, sql: QUERY_LABS[id].initial, ran: null }))}>
            <RotateCcw className="size-4" aria-hidden /> 恢复初始查询
          </Button>
        </div>
      </div>
      <div data-testid="query-output" aria-live="polite">
        {output === null ? (
          <p className="text-sm text-muted-foreground">运行之后，结果会显示在这里。</p>
        ) : output.error ? (
          <pre className="m-0 whitespace-pre-wrap rounded-lg border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">{output.error}</pre>
        ) : (
          <ResultTable result={output.result!} />
        )}
      </div>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label={label} last={last}
        onSubmit={() => void submit({ sql: state.sql }, event).then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

export function OverdueLab({ readOnly }: ActivityComponentProps) {
  return (
    <QueryLab
      id="overdue"
      readOnly={readOnly}
      label="提交查询"
      event="sql_overdue_lab_submitted"
      ticket={<>馆长要给逾期没还书的读者发提醒短信，请你从数据库里把这些借阅记录查出来。今天是 2026-10-28，数据库里的 <code>CURRENT_DATE</code> 就是今天。</>}
      goal="查出所有逾期未还的借阅记录：已经过了应还日期、到今天还没还。结果里要有借阅编号 id。"
    />
  );
}

export function LatestLab({ readOnly }: ActivityComponentProps) {
  return (
    <QueryLab
      id="latest"
      readOnly={readOnly}
      label="提交查询"
      event="sql_latest_lab_submitted"
      ticket={<>首页的“最新上架”栏目用的是下面这条查询。读者反映：上面摆的全是年初的老书，有一本还是已经下架、借不到的。</>}
      goal="改好这条查询：按上架时间从新到旧，列出 5 本还在架上的书。结果里要有书名 title。"
    />
  );
}

export function LimitLab({ readOnly }: ActivityComponentProps) {
  return (
    <QueryLab
      id="overLimit"
      readOnly={readOnly}
      label="提交查询"
      event="sql_limit_lab_submitted"
      ticket={<>借书规则是每人同时最多借 5 本，可系统的检查上个月出过问题。馆长想知道：现在有哪些读者手上借着的书超过了 5 本。</>}
      goal="查出手上借着超过 5 本书的读者，结果里要有姓名 name 和他手上借着几本。"
    />
  );
}

export function ReportLab({ readOnly }: ActivityComponentProps) {
  return (
    <QueryLab
      id="report"
      readOnly={readOnly}
      label="提交查询"
      event="sql_report_lab_submitted"
      ticket={<>年度报表里“每位读者借过几本书”这一页用的是下面这条查询。核对时发现：读者名单不全，有的人数字还对不上。</>}
      goal="改好报表：每位读者一行（一个都不能少），列出读者编号 id、姓名和一共借过几本，没借过的显示 0。"
    />
  );
}

// ---------------------------------------------------------------------------
// Console labs: a session, replayed from the statement history
// ---------------------------------------------------------------------------

type ConsoleState = { statements: string[]; draft: string; table: string; passed: boolean };

const STARTS: Record<ConsoleLabId, () => Db> = { modify: libraryDb, transaction: halfBorrowDb, incident: incidentDb };

function rowKey(row: Row): string {
  return JSON.stringify(row);
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "rows") return <ResultTable result={outcome.result} truncated={outcome.truncated} />;
  if (outcome.kind === "error") return <pre className="m-0 whitespace-pre-wrap rounded-none border-0 bg-transparent p-0 font-mono text-xs text-destructive">{outcome.text}</pre>;
  return <pre className="m-0 whitespace-pre-wrap rounded-none border-0 bg-transparent p-0 font-mono text-xs text-muted-foreground">{outcome.text}</pre>;
}

function ConsoleLab({
  id,
  readOnly,
  ticket,
  goal,
  label,
  event,
  live,
  aside,
  table: firstTable,
}: {
  id: ConsoleLabId;
  readOnly: boolean;
  ticket: React.ReactNode;
  goal: React.ReactNode;
  label: string;
  event: string;
  live?: (session: ReturnType<typeof replayConsole>["session"]) => Goal[];
  aside?: React.ReactNode;
  table?: string;
}) {
  const start = React.useMemo(() => STARTS[id](), [id]);
  const tables = React.useMemo(() => Object.keys(start.tables), [start]);
  const defaultTable = firstTable && tables.includes(firstTable) ? firstTable : tables[0]!;
  const initial = React.useMemo<ConsoleState>(() => ({ statements: [], draft: "", table: defaultTable, passed: false }), [defaultTable]);
  const normalize = React.useCallback(
    (value: unknown): ConsoleState => {
      const record = asRecord(value);
      const statements = Array.isArray(record.statements) ? record.statements.filter((item): item is string => typeof item === "string").slice(0, HISTORY_MAX).map((item) => item.slice(0, STATEMENT_MAX)) : [];
      const table = typeof record.table === "string" && tables.includes(record.table) ? record.table : defaultTable;
      return { statements, draft: text(record.draft, "", STATEMENT_MAX), table, passed: record.passed === true };
    },
    [tables, defaultTable],
  );
  const { state, setState, ...save } = useActivityState<ConsoleState>(initial, normalize);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const { session, transcript } = React.useMemo(() => replayConsole(id, state.statements), [id, state.statements]);
  const screen = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (screen.current) screen.current.scrollTop = screen.current.scrollHeight;
  }, [transcript.length]);
  const full = state.statements.length >= HISTORY_MAX;
  const run = () =>
    setState((current) => {
      const sql = current.draft.trim();
      if (!sql || current.statements.length >= HISTORY_MAX) return current;
      return { ...current, statements: [...current.statements, sql], draft: "" };
    });
  const viewed = session.db.tables[state.table];
  const before = new Map((start.tables[state.table]?.rows ?? []).map((row) => [row[start.tables[state.table]!.def.primaryKey] as Value, rowKey(row)]));
  const viewRows = viewed?.rows ?? [];
  const pk = viewed?.def.primaryKey ?? "id";
  return (
    <div className="space-y-4" data-testid={`sql-basics-${id}`}>
      <Ticket goal={goal}>{ticket}</Ticket>
      <SchemaPanel schema={id === "incident" ? INCIDENT_SCHEMA : SCHEMA} />
      {aside}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="查看数据表">
          <Table2 className="mr-1 size-4 text-muted-foreground" aria-hidden />
          {tables.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={state.table === name}
              onClick={() => setState((current) => ({ ...current, table: name }))}
              className={cn("rounded-md border px-2.5 py-1 font-mono text-xs", state.table === name ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted")}
            >
              {name}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            <span className="mr-2 inline-block size-2.5 rounded-sm bg-success/30 align-middle" aria-hidden /> 新增
            <span className="mx-2 inline-block size-2.5 rounded-sm bg-warning/40 align-middle" aria-hidden /> 有改动
          </span>
        </div>
        {viewed && (
          <ResultTable
            result={{ columns: viewed.def.columns.map((column) => column.name), rows: viewRows.map((row) => viewed.def.columns.map((column) => row[column.name] ?? null)) }}
            highlight={(index) => {
              const row = viewRows[index]!;
              const old = before.get(row[pk] as Value);
              return old === undefined ? "new" : old !== rowKey(row) ? "changed" : null;
            }}
          />
        )}
        {session.snapshot && (
          <p className={cn("rounded-md border px-3 py-2 text-xs", session.aborted ? "border-destructive/50 bg-destructive/10" : "border-warning/60 bg-warning/10")} data-testid="tx-banner">
            {session.aborted ? "事务已经出错中止：之后的语句都会被拒绝，先 ROLLBACK。" : "事务进行中（BEGIN 之后还没有 COMMIT）：上面显示的是你这个连接看到的数据，别人还看不到这些修改。"}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold">
          数据库控制台 · library=&gt; <span className="font-normal text-muted-foreground">（已运行 {state.statements.length} / {HISTORY_MAX} 条）</span>
        </p>
        <div ref={screen} className="max-h-96 min-h-28 space-y-3 overflow-y-auto rounded-lg border border-border bg-card p-3" aria-live="polite" data-testid="console-output">
          {transcript.length === 0 ? (
            <p className="m-0 text-xs text-muted-foreground">还没有运行过语句。</p>
          ) : (
            transcript.map((entry, index) => (
              <div key={index} className="space-y-1">
                <pre className="m-0 whitespace-pre-wrap break-all rounded-none border-0 bg-transparent p-0 font-mono text-xs text-primary">
                  library{entry.inTx ? "*" : ""}=&gt; {entry.sql}
                </pre>
                <OutcomeView outcome={entry.outcome} />
              </div>
            ))
          )}
        </div>
        <textarea
          aria-label="SQL"
          disabled={locked || full}
          value={state.draft}
          maxLength={STATEMENT_MAX}
          rows={3}
          spellCheck={false}
          autoCapitalize="off"
          placeholder={full ? "记录已满，请重置数据库" : "输入一条 SQL 语句，Ctrl + Enter 运行"}
          onChange={(event) => setState((current) => ({ ...current, draft: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              run();
            }
          }}
          className={editorClass}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={run} disabled={locked || full || state.draft.trim() === ""}>
            <Play className="size-4" aria-hidden /> 运行
          </Button>
          <Button type="button" variant="outline" disabled={locked || state.statements.length === 0} onClick={() => setState((current) => ({ ...current, statements: [], draft: "" }))}>
            <RotateCcw className="size-4" aria-hidden /> 重置数据库
          </Button>
        </div>
      </div>
      {live && (
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {live(session).map((item) => (
            <li key={item.id} className="rounded-md border border-border px-3 py-2" data-goal={item.id} data-ok={item.ok}>
              <Verdict ok={item.ok}>{item.label}</Verdict>
            </li>
          ))}
        </ul>
      )}
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label={label} last={last} disabled={state.statements.length === 0}
        onSubmit={() => void submit({ statements: state.statements }, event).then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

export function ModifyLab({ readOnly }: ActivityComponentProps) {
  return (
    <ConsoleLab
      id="modify"
      readOnly={readOnly}
      label="提交检查"
      event="sql_modify_lab_submitted"
      ticket={
        <ul className="m-0 list-none space-y-1 p-0">
          <li>1. 新到一本《雪国》（川端康成，文学类），一共 2 册，今天上架。</li>
          <li>2. 读者陈晓（9 号）换了邮箱，新邮箱是 chenxiao@mail.test。</li>
          <li>3. 系统上线时建的“测试用户”要删掉，连同他名下的测试借阅。</li>
        </ul>
      }
      goal="完成这三件事，其他数据一行都不能动。下面的检查只看已经提交的数据。"
      live={(session) => gradeModify(session).goals!}
    />
  );
}

export function TransactionLab({ readOnly }: ActivityComponentProps) {
  return (
    <ConsoleLab
      id="transaction"
      table="books"
      readOnly={readOnly}
      label="提交检查"
      event="sql_transaction_lab_submitted"
      ticket={
        <>
          刚才李雷（4 号）来借《三体》（1 号书），借书程序执行了两条语句：先把《三体》的册数减 1，再插入借阅记录。第二条语句的读者编号写错成了 44，插入失败，可第一条已经生效了：库存少了一册，借阅记录却没有。
        </>
      }
      goal="把数据修正过来，然后正确地完成这次借书：今天借，14 天后应还。这次让两步“要么都成功、要么都不做”。"
      aside={
        <pre className="m-0 overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">{`-- 借书程序的两条语句（读者编号写对的版本）
UPDATE books SET copies = copies - 1 WHERE id = 1;
INSERT INTO loans (book_id, reader_id, borrowed, due)
VALUES (1, 4, CURRENT_DATE, CURRENT_DATE + 14);`}</pre>
      }
      live={(session) => gradeTransaction(session).goals!}
    />
  );
}

export function IncidentLab({ readOnly }: ActivityComponentProps) {
  return (
    <ConsoleLab
      id="incident"
      table="loans"
      readOnly={readOnly}
      label="提交修复结果"
      event="sql_incident_lab_submitted"
      ticket={
        <>
          昨天 17:02，有人在生产库上执行了 <code>UPDATE loans SET returned = &#39;2026-10-27&#39;;</code> 本来只想改一条，忘了写 WHERE：所有借阅都变成了“已在昨天归还”。库里有一份每天 03:00 自动备份的 <code>loans_backup</code>，还有借还系统写的 <code>returns_log</code>。
        </>
      }
      goal="把 loans 的归还日期恢复成真实情况。没有实时提示，提交后由服务端检查。"
    />
  );
}
