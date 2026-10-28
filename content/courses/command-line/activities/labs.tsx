"use client";

import * as React from "react";
import { RotateCcw, Terminal } from "lucide-react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { Button } from "@/components/ui/button";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import {
  COMMAND_MAX,
  type Goal,
  HISTORY_MAX,
  LOG_QUESTIONS,
  type LogQuestionId,
  type MachineId,
  PATH_CONTEXTS,
  PATH_SETTINGS,
  PATHS_INITIAL,
  PERM_ITEMS,
  PERMS_INITIAL,
  type PathKey,
  type PermKey,
  evaluateEnv,
  evaluatePaths,
  evaluatePerms,
  gradeFiles,
  gradePipes,
  gradeProcesses,
  replayLab,
} from "../simulation/labs";
import { DEPLOY_CONF, REPORT_PATH, UPLOADS } from "../simulation/server";
import { type Fs, type Transcript, childrenOf, join, modeString, promptPath } from "../simulation/shell";

const inputClass = "mt-1 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm";
const OUTPUT_LINES = 60;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string, max = 80): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function normalizeHistory(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, HISTORY_MAX).map((item) => item.slice(0, COMMAND_MAX)) : [];
}

function Code({ children }: { children: React.ReactNode }) {
  return <pre className="m-0 overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">{children}</pre>;
}

function GoalList({ goals }: { goals: Goal[] }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
      {goals.map((goal) => (
        <li key={goal.id} className="rounded-md border border-border px-3 py-2" data-goal={goal.id} data-ok={goal.ok}>
          <Verdict ok={goal.ok}>{goal.label}</Verdict>
          {goal.detail && !goal.ok && <p className="mt-1 text-xs text-muted-foreground">{goal.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// The terminal
// ---------------------------------------------------------------------------

type TerminalState = { history: string[]; draft: string; passed: boolean };

function normalizeTerminal(value: unknown): TerminalState {
  const record = asRecord(value);
  return { history: normalizeHistory(record.history), draft: text(record.draft, "", COMMAND_MAX), passed: record.passed === true };
}

function clip(output: string): string {
  const rows = output.replace(/\n$/, "").split("\n");
  if (rows.length <= OUTPUT_LINES) return output.replace(/\n$/, "");
  return `${rows.slice(0, OUTPUT_LINES).join("\n")}\n……（还有 ${rows.length - OUTPUT_LINES} 行没有显示。可以用 head、tail、grep 或 wc -l 缩小范围）`;
}

/** A replayed shell: output is derived from the command history, never stored. */
function TerminalView({
  cwd,
  transcript,
  draft,
  onDraft,
  onRun,
  onReset,
  disabled,
  count,
}: {
  cwd: string;
  transcript: Transcript;
  draft: string;
  onDraft: (value: string) => void;
  onRun: () => void;
  onReset: () => void;
  disabled: boolean;
  count: number;
}) {
  const screen = React.useRef<HTMLDivElement>(null);
  const [recall, setRecall] = React.useState<number | null>(null);
  const start = transcript.reduce((last, entry, index) => (entry.clear ? index + 1 : last), 0);
  const visible = transcript.slice(start);
  const home = { env: { HOME: "/home/ops" }, user: "ops" as const };
  React.useEffect(() => {
    if (screen.current) screen.current.scrollTop = screen.current.scrollHeight;
  }, [transcript.length]);
  const full = count >= HISTORY_MAX;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold">
          <Terminal className="size-4" aria-hidden /> 终端 · 输入 help 查看支持的命令
        </p>
        <span className="text-xs text-muted-foreground">
          已运行 {count} / {HISTORY_MAX} 条
        </span>
      </div>
      <div ref={screen} className="max-h-96 min-h-40 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100" aria-live="polite" data-testid="terminal-output">
        {visible.length === 0 ? (
          <p className="m-0 text-slate-400">{transcript.length === 0 ? "还没有运行过命令。" : "（屏幕已清空）"}</p>
        ) : (
          visible.map((entry, index) => (
            <div key={start + index} className="mb-2">
              <p className="m-0 break-all text-slate-100">
                <span className="text-emerald-300">ops@library</span>
                <span className="text-slate-400">:</span>
                <span className="text-sky-300">{promptPath(home, entry.cwd)}</span>
                <span className="text-slate-400">$ </span>
                {entry.command}
              </p>
              {entry.out && <pre className="m-0 whitespace-pre-wrap break-all rounded-none border-0 bg-transparent p-0 text-xs">{clip(entry.out)}</pre>}
              {entry.err && <pre className="m-0 whitespace-pre-wrap break-all rounded-none border-0 bg-transparent p-0 text-xs text-rose-300">{clip(entry.err)}</pre>}
            </div>
          ))
        )}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setRecall(null);
          onRun();
        }}
      >
        <label className="flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 font-mono text-sm sm:w-auto sm:flex-1">
          <span className="shrink-0 text-xs text-muted-foreground"><span className="hidden sm:inline">{promptPath(home, cwd)}</span>$</span>
          <input
            aria-label="命令"
            disabled={disabled || full}
            value={draft}
            maxLength={COMMAND_MAX}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            placeholder={full ? "记录已满，请清空记录并重置" : "输入命令，按回车运行"}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              const commands = transcript.map((entry) => entry.command);
              if (event.key === "ArrowUp" && commands.length) {
                event.preventDefault();
                const next = recall === null ? commands.length - 1 : Math.max(0, recall - 1);
                setRecall(next);
                onDraft(commands[next]!);
              } else if (event.key === "ArrowDown" && recall !== null) {
                event.preventDefault();
                const next = recall + 1;
                setRecall(next >= commands.length ? null : next);
                onDraft(next >= commands.length ? "" : commands[next]!);
              }
            }}
            className="min-w-0 flex-1 bg-transparent py-2 outline-none"
          />
        </label>
        <Button type="submit" disabled={disabled || full || draft.trim() === ""}>
          运行
        </Button>
        <Button type="button" variant="outline" disabled={disabled || count === 0} onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden /> 清空记录并重置
        </Button>
      </form>
    </div>
  );
}

type WithHistory = { history: string[]; draft: string };

/** Draft, run and reset for any state that carries a command history. */
function historyHandlers<T extends WithHistory>(setState: (update: (current: T) => T) => void) {
  return {
    onDraft: (draft: string) => setState((current) => ({ ...current, draft })),
    onRun: () =>
      setState((current) => {
        const command = current.draft.trim();
        if (!command || current.history.length >= HISTORY_MAX) return current;
        return { ...current, history: [...current.history, command], draft: "" };
      }),
    onReset: () => setState((current) => ({ ...current, history: [], draft: "" })),
  };
}

function useTerminal(machine: MachineId, readOnly: boolean, lockOnPass: boolean) {
  const initial = React.useMemo<TerminalState>(() => ({ history: [], draft: "", passed: false }), []);
  const { state, setState, ...save } = useActivityState<TerminalState>(initial, normalizeTerminal);
  const replayed = React.useMemo(() => replayLab(machine, state.history), [machine, state.history]);
  const disabled = readOnly || (lockOnPass && state.passed);
  const view = (
    <TerminalView cwd={replayed.machine.cwd} transcript={replayed.transcript} draft={state.draft} count={state.history.length} disabled={disabled} {...historyHandlers(setState)} />
  );
  return { state, setState, save, machine: replayed.machine, view };
}

/** Labs graded by replaying the command history on the server. */
function TerminalLab({
  id,
  machine,
  readOnly,
  ticket,
  goal,
  label,
  event,
  aside,
  live,
}: {
  id: string;
  machine: MachineId;
  readOnly: boolean;
  ticket: React.ReactNode;
  goal: React.ReactNode;
  label: string;
  event: string;
  aside?: (m: ReturnType<typeof replayLab>["machine"]) => React.ReactNode;
  live?: (m: ReturnType<typeof replayLab>["machine"]) => Goal[];
}) {
  const { state, setState, save, machine: m, view } = useTerminal(machine, readOnly, true);
  const { submit, pending, last } = useLabSubmit();
  return (
    <div className="space-y-5" data-testid={`command-line-${id}`}>
      <Ticket goal={goal}>{ticket}</Ticket>
      {aside?.(m)}
      {view}
      {live && <GoalList goals={live(m)} />}
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label={label}
        last={last}
        disabled={state.history.length === 0}
        onSubmit={() => void submit({ history: state.history }, event).then((ok) => ok && setState((current) => ({ ...current, passed: true })))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch2 · deploy paths
// ---------------------------------------------------------------------------

type PathsState = { values: Record<PathKey, string>; history: string[]; draft: string; passed: boolean };
const PATHS_STATE: PathsState = { values: { ...PATHS_INITIAL }, history: [], draft: "", passed: false };
function normalizePaths(value: unknown): PathsState {
  const record = asRecord(value);
  const values = asRecord(record.values);
  return {
    values: Object.fromEntries(PATH_SETTINGS.map((item) => [item.key, text(values[item.key], item.initial)])) as Record<PathKey, string>,
    history: normalizeHistory(record.history),
    draft: text(record.draft, "", COMMAND_MAX),
    passed: record.passed === true,
  };
}

export function PathsLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<PathsState>(PATHS_STATE, normalizePaths);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluatePaths(state.values);
  const replayed = React.useMemo(() => replayLab("paths", state.history), [state.history]);
  const conf = DEPLOY_CONF.split("\n")
    .map((row) => {
      const match = /^(\w+)(\s+)= /.exec(row);
      return match ? `${match[1]}${match[2]}= ${state.values[match[1] as PathKey] ?? ""}` : row;
    })
    .join("\n");
  return (
    <div className="space-y-5" data-testid="command-line-paths">
      <Ticket goal="改好这四个路径，让它们在两种运行方式下都指向要找的目录。">
        部署脚本读取 <code>/srv/library/deploy.conf</code> 里的四个路径。以前一直是小王登录后在 <code>/srv/library</code> 里手动运行；现在改由 deploy 账号的定时任务运行，它从自己的家目录启动。日志里冒出了一串“找不到目录”。下面的终端可以用来四处看看。
      </Ticket>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <Code>{conf}</Code>
          <ul className="m-0 grid list-none gap-1 p-0 text-xs text-muted-foreground">
            {PATH_CONTEXTS.map((context) => (
              <li key={context.id}>
                <strong className="text-foreground">{context.label}</strong>：用户 {context.user}，当前目录 <code>{context.cwd}</code>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 space-y-3">
          {PATH_SETTINGS.map((setting) => (
            <label key={setting.key} className="block text-xs font-medium">
              {setting.label}：<span className="font-normal text-muted-foreground">{setting.want}</span>
              <input
                aria-label={`${setting.label} 的路径`}
                disabled={locked}
                value={state.values[setting.key]}
                maxLength={80}
                spellCheck={false}
                autoCapitalize="off"
                onChange={(event) => setState((current) => ({ ...current, values: { ...current.values, [setting.key]: event.target.value } }))}
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="m-0 w-full min-w-[34rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-2 font-semibold">设置</th>
              {PATH_CONTEXTS.map((context) => (
                <th key={context.id} className="p-2 font-semibold">
                  {context.label}时实际指向
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.key} className="border-b border-border align-top" data-setting={row.key} data-ok={row.ok}>
                <td className="p-2 font-mono">{row.key}</td>
                {row.cells.map((cell) => (
                  <td key={cell.context} className="p-2" data-context={cell.context} data-ok={cell.ok}>
                    <span className="block break-all font-mono">{cell.path || "—"}</span>
                    <Verdict ok={cell.ok}>{cell.note}</Verdict>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TerminalView cwd={replayed.machine.cwd} transcript={replayed.transcript} draft={state.draft} count={state.history.length} disabled={readOnly} {...historyHandlers(setState)} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交部署设置" last={last}
        onSubmit={() => void submit({ values: state.values }, "cli_paths_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch3 · tidy the upload inbox
// ---------------------------------------------------------------------------

function tree(fs: Fs, dir: string, depth = 0): string[] {
  return childrenOf(fs, dir).flatMap((name) => {
    const path = join(dir, name);
    const entry = fs[path]!;
    const row = `${"  ".repeat(depth)}${name}${entry.type === "dir" ? "/" : ""}`;
    return entry.type === "dir" ? [row, ...tree(fs, path, depth + 1)] : [row];
  });
}

export function FilesLab({ readOnly }: ActivityComponentProps) {
  return (
    <TerminalLab
      id="files"
      machine="files"
      readOnly={readOnly}
      label="提交整理结果"
      event="cli_files_lab_submitted"
      ticket={
        <>
          读者上传的文件全堆在 <code>uploads/inbox/</code> 里：封面图、PDF、上传失败留下的临时文件，还有一个去年的旧文件夹。网站要求图片放进 <code>uploads/images/</code>，PDF 放进 <code>uploads/docs/</code>。inbox 里有一个保护上传目录的配置文件，必须留在原处。
        </>
      }
      goal="用命令整理好上传目录，让下面五项全部变绿。"
      aside={(m) => <Code>{[`${UPLOADS}/  （实时，含隐藏文件）`, ...tree(m.fs, UPLOADS).map((row) => `  ${row}`)].join("\n")}</Code>}
      live={(m) => gradeFiles(m).goals}
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · read the logs
// ---------------------------------------------------------------------------

type LogsState = { answers: Partial<Record<LogQuestionId, string>>; history: string[]; draft: string; passed: boolean };
const LOGS_STATE: LogsState = { answers: {}, history: [], draft: "", passed: false };
function normalizeLogs(value: unknown): LogsState {
  const record = asRecord(value);
  const answers = asRecord(record.answers);
  return {
    answers: Object.fromEntries(LOG_QUESTIONS.filter((item) => typeof answers[item.id] === "string").map((item) => [item.id, text(answers[item.id], "", 40)])),
    history: normalizeHistory(record.history),
    draft: text(record.draft, "", COMMAND_MAX),
    passed: record.passed === true,
  };
}

export function LogsLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<LogsState>(LOGS_STATE, normalizeLogs);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const replayed = React.useMemo(() => replayLab("logs", state.history), [state.history]);
  const setAnswer = (id: LogQuestionId, value: string) => setState((current) => ({ ...current, answers: { ...current.answers, [id]: value } }));
  return (
    <div className="space-y-5" data-testid="command-line-logs">
      <Ticket goal="从日志里查出下面四个问题的答案。">
        早上九点多，有读者反映“借书一直失败”。网站的访问日志 <code>access.log</code> 每行是一次请求，错误日志 <code>error.log</code> 记录出错的原因，都在 <code>/var/log/library</code>。终端已经在这个目录里了。
      </Ticket>
      <TerminalView cwd={replayed.machine.cwd} transcript={replayed.transcript} draft={state.draft} count={state.history.length} disabled={readOnly} {...historyHandlers(setState)} />
      <div className="space-y-3">
        {LOG_QUESTIONS.map((item, index) => (
          <section key={item.id} className="space-y-2 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">
              {index + 1}. {item.question}
            </p>
            {"options" in item ? (
              <div className="grid gap-2">
                {item.options.map((option) => (
                  <label key={option.id} className="flex items-start gap-2 text-sm">
                    <input type="radio" name={`q-${item.id}`} disabled={locked} checked={state.answers[item.id] === option.id} onChange={() => setAnswer(item.id, option.id)} className="mt-1" />
                    {option.label}
                  </label>
                ))}
              </div>
            ) : (
              <input aria-label={item.question} disabled={locked} value={state.answers[item.id] ?? ""} maxLength={40} spellCheck={false} onChange={(event) => setAnswer(item.id, event.target.value)} className={cn(inputClass, "max-w-xs")} />
            )}
          </section>
        ))}
      </div>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交答案" last={last}
        onSubmit={() => void submit({ answers: state.answers }, "cli_logs_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch5 · pipes
// ---------------------------------------------------------------------------

export function PipesLab({ readOnly }: ActivityComponentProps) {
  return (
    <TerminalLab
      id="pipes"
      machine="pipes"
      readOnly={readOnly}
      label="提交周报"
      event="cli_pipes_lab_submitted"
      ticket={
        <>
          周报 <code>~/weekly-report.txt</code> 的最后一节还空着：今天访问次数最多的 3 个 IP。访问日志还是 <code>/var/log/library/access.log</code>，两千多行，一行一次请求，每行的第一列是访问者的 IP。
        </>
      }
      goal="把今天访问次数最多的 3 个 IP 和各自的次数，按从多到少的顺序写到周报末尾，每行一个。"
      aside={(m) => <Code>{`${REPORT_PATH}（实时）\n────────\n${m.fs[REPORT_PATH]?.content ?? "（文件不存在）"}`}</Code>}
      live={(m) => gradePipes(m).goals}
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · permissions
// ---------------------------------------------------------------------------

type PermsState = { modes: Record<PermKey, string>; passed: boolean };
const PERMS_STATE: PermsState = { modes: { ...PERMS_INITIAL }, passed: false };
function normalizePerms(value: unknown): PermsState {
  const record = asRecord(value);
  const modes = asRecord(record.modes);
  return { modes: Object.fromEntries(PERM_ITEMS.map((item) => [item.key, text(modes[item.key], item.initial, 4)])) as Record<PermKey, string>, passed: record.passed === true };
}

export function PermsLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<PermsState>(PERMS_STATE, normalizePerms);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluatePerms(state.modes);
  return (
    <div className="space-y-5" data-testid="command-line-perms">
      <Ticket goal="改这六处的权限，让下面八个场景全部变绿。">
        网站上线前检查：首页打不开，上传总失败，部署脚本运行不了；而且实习生 guest 说他能看到数据库密码。所有文件的主人都是 ops，所属组都是 web。
      </Ticket>
      <Code>{`用户       所属的组
ops        ops, web      ← 你
www-data   www-data, web ← 网站进程
guest      guest         ← 实习生`}</Code>
      <div className="grid gap-3 sm:grid-cols-2">
        {PERM_ITEMS.map((item) => {
          const mode = parseOctal(state.modes[item.key]);
          return (
            <label key={item.key} className="block rounded-lg border border-border p-3 text-xs font-medium">
              <span className="break-all font-mono">{item.path}{item.type === "dir" ? "/" : ""}</span>
              <span className="mt-1 flex items-center gap-2">
                <input
                  aria-label={`${item.path} 的权限`}
                  disabled={locked}
                  value={state.modes[item.key]}
                  maxLength={4}
                  inputMode="numeric"
                  spellCheck={false}
                  onChange={(event) => setState((current) => ({ ...current, modes: { ...current.modes, [item.key]: event.target.value } }))}
                  className={cn(inputClass, "mt-0 w-20")}
                />
                <code className={cn("font-mono text-sm", mode === null && "text-destructive")}>
                  {mode === null ? "不是三位八进制数" : modeString({ type: item.type, mode, owner: "ops", group: "web", content: "", time: "" })}
                </code>
              </span>
            </label>
          );
        })}
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {result.scenarios.map((scenario) => (
          <li key={scenario.id} className="rounded-md border border-border px-3 py-2" data-scenario={scenario.id} data-ok={scenario.ok}>
            <Verdict ok={scenario.ok}>{scenario.label}</Verdict>
            <p className="mt-1 text-xs text-muted-foreground">{scenario.why}</p>
          </li>
        ))}
      </ul>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交权限设置" last={last}
        onSubmit={() => void submit({ modes: state.modes }, "cli_perms_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

function parseOctal(value: string): number | null {
  return /^[0-7]{3}$/.test(value.trim()) ? parseInt(value.trim(), 8) : null;
}

// ---------------------------------------------------------------------------
// Ch7 · processes
// ---------------------------------------------------------------------------

export function ProcessLab({ readOnly }: ActivityComponentProps) {
  return (
    <TerminalLab
      id="processes"
      machine="processes"
      readOnly={readOnly}
      label="提交处理结果"
      event="cli_process_lab_submitted"
      ticket={
        <>
          早上发布了新版本 1.4.0，可 <code>sudo systemctl restart library-web</code> 报错，网站还是旧版。同事说昨晚排查问题时“手动开过一个网站进程”。现在还有读者在上传文件。
        </>
      }
      goal="让网站由 systemd 管理、跑上新版本，同时不影响其他服务，也不弄坏正在上传的文件。"
      live={(m) => gradeProcesses(m).goals}
    />
  );
}

// ---------------------------------------------------------------------------
// Ch8 · PATH
// ---------------------------------------------------------------------------

export function EnvLab({ readOnly }: ActivityComponentProps) {
  return (
    <TerminalLab
      id="env"
      machine="env"
      readOnly={readOnly}
      label="提交环境设置"
      event="cli_env_lab_submitted"
      ticket={
        <>
          同事在 <code>/opt</code> 下装好了新版 Node.js 和运维工具 libctl。可是 <code>node --version</code> 还是 v12，敲 <code>libctl</code> 说找不到命令。
        </>
      }
      goal="让下面四项在现在和下次登录后都成立。"
      aside={(m) => {
        const result = evaluateEnv(m);
        return (
          <div className="overflow-x-auto">
            <table className="m-0 w-full min-w-[28rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-2 font-semibold">检查</th>
                  <th className="p-2 font-semibold">现在</th>
                  <th className="p-2 font-semibold">下次登录后</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border" data-check={row.id}>
                    <td className="p-2">{row.label}</td>
                    <td className="p-2" data-when="now" data-ok={row.now}>
                      <Verdict ok={row.now}>{row.now ? "是" : "否"}</Verdict>
                    </td>
                    <td className="p-2" data-when="later" data-ok={row.later}>
                      <Verdict ok={row.later}>{row.later ? "是" : "否"}</Verdict>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Ch9 · the disk is full
// ---------------------------------------------------------------------------

export function DiskLab({ readOnly }: ActivityComponentProps) {
  return (
    <TerminalLab
      id="disk"
      machine="disk"
      readOnly={readOnly}
      label="提交处理结果"
      event="cli_disk_lab_submitted"
      ticket={
        <>
          凌晨 3:20，监控告警：library.test 打开就报 500。你登录到服务器上，手边只有这个终端。备份和日志对排查都有用，删之前想清楚。
        </>
      }
      goal="让网站恢复正常，磁盘使用率降到 80% 以下。没有实时提示，提交后由服务端检查。"
    />
  );
}
