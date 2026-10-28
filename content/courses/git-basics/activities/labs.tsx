"use client";

import * as React from "react";
import { FilePlus2, RotateCcw, Save, Terminal, X } from "lucide-react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { Button } from "@/components/ui/button";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import { type Action, type Commit, LIMITS, type Repo, type Transcript, fileStates, history, localTips, refsAt, short } from "../simulation/git";
import {
  type Goal,
  HISTORY_QUESTIONS,
  type HistoryQuestionId,
  type RepoId,
  gradeBranch,
  gradeCommit,
  gradeMerge,
  gradeRemote,
  gradeUndo,
  replayLab,
} from "../simulation/labs";
import { name } from "../simulation/site";

const inputClass = "block w-full rounded-md border border-border bg-background p-2 font-mono text-sm";
const OUTPUT_LINES = 60;
const GRAPH_ROWS = 14;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string, max = 80): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function normalizeActions(value: unknown): Action[] {
  if (!Array.isArray(value)) return [];
  const actions: Action[] = [];
  for (const item of value.slice(0, LIMITS.history)) {
    if (typeof item === "string") actions.push(item.slice(0, LIMITS.command));
    else {
      const record = asRecord(item);
      if (typeof record.edit === "string" && typeof record.content === "string") actions.push({ edit: record.edit.slice(0, LIMITS.path), content: record.content.slice(0, LIMITS.content) });
    }
  }
  return actions;
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

const plainPre = "m-0 whitespace-pre-wrap break-all rounded-none border-0 bg-transparent p-0 font-mono text-xs";

function clip(output: string): string {
  const rows = output.replace(/\n$/, "").split("\n");
  if (rows.length <= OUTPUT_LINES) return output.replace(/\n$/, "");
  return `${rows.slice(0, OUTPUT_LINES).join("\n")}\n……（还有 ${rows.length - OUTPUT_LINES} 行没有显示。可以加 -n 3、--oneline 或文件名缩小范围）`;
}

// ---------------------------------------------------------------------------
// Commit graph
// ---------------------------------------------------------------------------

const LANE = 16;
const ROW = 28;

function layout(rows: Commit[]) {
  let lanes: (string | null)[] = [];
  const at: Record<string, { row: number; lane: number }> = {};
  rows.forEach((commit, row) => {
    let lane = lanes.indexOf(commit.id);
    if (lane === -1) {
      lane = lanes.indexOf(null);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(null);
      }
    }
    lanes = lanes.map((id, index) => (id === commit.id && index !== lane ? null : id));
    at[commit.id] = { row, lane };
    lanes[lane] = commit.parents[0] ?? null;
    for (const parent of commit.parents.slice(1)) {
      if (lanes.includes(parent)) continue;
      const free = lanes.indexOf(null);
      if (free === -1) lanes.push(parent);
      else lanes[free] = parent;
    }
  });
  const width = Math.max(1, ...Object.values(at).map((item) => item.lane + 1));
  return { at, width };
}

export function CommitGraph({ repo, title = "提交图（实时）" }: { repo: Repo; title?: string }) {
  const rows = history(repo, localTips(repo)).slice(0, GRAPH_ROWS);
  const refs = refsAt(repo);
  const { at, width } = layout(rows);
  const height = rows.length * ROW;
  const x = (lane: number) => lane * LANE + LANE / 2;
  const y = (row: number) => row * ROW + ROW / 2;
  return (
    <div className="min-w-0 space-y-2" data-testid="commit-graph">
      <p className="text-xs font-semibold">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card p-2">
        <div className="relative" style={{ minHeight: height }}>
          <svg width={width * LANE} height={height} className="absolute left-0 top-0" aria-hidden>
            {rows.flatMap((commit) =>
              commit.parents.map((parent) => {
                const from = at[commit.id]!;
                const to = at[parent];
                return <line key={`${commit.id}-${parent}`} x1={x(from.lane)} y1={y(from.row)} x2={x(to ? to.lane : from.lane)} y2={to ? y(to.row) : height} className="stroke-muted-foreground/60" strokeWidth={2} />;
              }),
            )}
            {rows.map((commit) => {
              const point = at[commit.id]!;
              const isHead = (refs[commit.id] ?? []).some((ref) => ref.startsWith("HEAD"));
              return <circle key={commit.id} cx={x(point.lane)} cy={y(point.row)} r={isHead ? 6 : 4.5} className={isHead ? "fill-primary" : commit.parents.length > 1 ? "fill-warning" : "fill-muted-foreground"} />;
            })}
          </svg>
          <ol className="m-0 list-none p-0" style={{ marginLeft: width * LANE + 8 }}>
            {rows.map((commit) => (
              <li key={commit.id} className="flex min-w-0 items-center gap-2 whitespace-nowrap text-xs" style={{ height: ROW }} data-commit={short(commit.id)}>
                <code className="text-muted-foreground">{short(commit.id)}</code>
                {(refs[commit.id] ?? []).map((ref) => (
                  <span
                    key={ref}
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                      ref.startsWith("HEAD") ? "border-primary bg-primary/10 text-primary" : ref.startsWith("origin/") ? "border-warning/60 bg-warning/10" : "border-border bg-muted",
                    )}
                  >
                    {ref}
                  </span>
                ))}
                <span className="truncate">{commit.message.split("\n")[0]}</span>
                <span className="text-muted-foreground">{name(commit.author)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files and editor
// ---------------------------------------------------------------------------

const BADGE: Record<string, string> = { untracked: "??", conflict: "冲突", staged: "已暂存", unstaged: "已修改" };

function FilesPanel({
  repo,
  selected,
  buffer,
  disabled,
  onSelect,
  onBuffer,
  onSave,
}: {
  repo: Repo;
  selected: string;
  buffer: string | null;
  disabled: boolean;
  onSelect: (path: string) => void;
  onBuffer: (value: string | null) => void;
  onSave: (path: string, content: string) => void;
}) {
  const [creating, setCreating] = React.useState("");
  const states = new Map(fileStates(repo).map((state) => [state.path, state]));
  const files = Object.keys(repo.work).sort();
  const current = repo.work[selected];
  const value = buffer ?? current ?? "";
  const dirty = buffer !== null && buffer !== (current ?? "");
  return (
    <div className="min-w-0 space-y-2" data-testid="files-panel">
      <p className="text-xs font-semibold">工作区里的文件 · 编辑器</p>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {files.map((path) => {
          const state = states.get(path);
          const badge = state?.conflict ? "conflict" : state?.untracked ? "untracked" : state?.unstaged ? "unstaged" : state?.staged ? "staged" : null;
          return (
            <li key={path}>
              <button
                type="button"
                onClick={() => onSelect(path)}
                className={cn("rounded-md border px-2 py-1 font-mono text-xs", path === selected ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted")}
                aria-pressed={path === selected}
              >
                {path}
                {badge && (
                  <span className={cn("ml-1 rounded px-1 font-sans text-[10px]", badge === "conflict" ? "bg-destructive/15 text-destructive" : badge === "untracked" ? "bg-muted text-muted-foreground" : "bg-warning/20")}>{BADGE[badge]}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <textarea
        aria-label="编辑器"
        disabled={disabled || (!selected && buffer === null)}
        value={value}
        spellCheck={false}
        rows={9}
        maxLength={LIMITS.content}
        onChange={(event) => onBuffer(event.target.value)}
        className={cn(inputClass, "min-h-44 resize-y text-xs leading-relaxed")}
        placeholder={selected ? "" : "先在上面选一个文件"}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={disabled || !dirty || !selected || value.trim() === ""} onClick={() => onSave(selected, value)}>
          <Save className="size-4" aria-hidden /> 保存 {selected}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled || !dirty} onClick={() => onBuffer(null)}>
          <X className="size-4" aria-hidden /> 放弃修改
        </Button>
        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            const path = creating.trim();
            if (!/^[\w.\-/]+$/.test(path) || path.includes("..")) return;
            onSelect(path);
            onBuffer("");
            setCreating("");
          }}
        >
          <input aria-label="新文件名" disabled={disabled} value={creating} maxLength={LIMITS.path} placeholder="新文件名" onChange={(event) => setCreating(event.target.value)} className={cn(inputClass, "w-32 p-1.5 text-xs")} />
          <Button type="submit" size="sm" variant="outline" disabled={disabled || !creating.trim()}>
            <FilePlus2 className="size-4" aria-hidden /> 新建
          </Button>
        </form>
      </div>
      {dirty && <p className="text-xs text-warning">有未保存的修改：保存后才会写进工作区。</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

function TerminalView({ transcript, draft, count, disabled, onDraft, onRun, onReset }: { transcript: Transcript; draft: string; count: number; disabled: boolean; onDraft: (value: string) => void; onRun: () => void; onReset: () => void }) {
  const screen = React.useRef<HTMLDivElement>(null);
  const [recall, setRecall] = React.useState<number | null>(null);
  const start = transcript.reduce((last, entry, index) => (entry.clear ? index + 1 : last), 0);
  const visible = transcript.slice(start);
  const commands = transcript.filter((entry) => !entry.edit).map((entry) => entry.command);
  React.useEffect(() => {
    if (screen.current) screen.current.scrollTop = screen.current.scrollHeight;
  }, [transcript.length]);
  const full = count >= LIMITS.history;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold">
          <Terminal className="size-4" aria-hidden /> 终端 · 输入 help 查看支持的命令
        </p>
        <span className="text-xs text-muted-foreground">
          已操作 {count} / {LIMITS.history} 步
        </span>
      </div>
      <div ref={screen} className="max-h-96 min-h-40 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100" aria-live="polite" data-testid="terminal-output">
        {visible.length === 0 ? (
          <p className="m-0 text-slate-400">{transcript.length === 0 ? "还没有运行过命令。" : "（屏幕已清空）"}</p>
        ) : (
          visible.map((entry, index) =>
            entry.edit ? (
              <p key={start + index} className="mb-2 text-amber-300">
                （在编辑器里保存了 {entry.command}）
              </p>
            ) : (
              <div key={start + index} className="mb-2">
                <p className="m-0 break-all text-slate-100">
                  <span className="text-emerald-300">linke@laptop</span>
                  <span className="text-slate-400">:</span>
                  <span className="text-sky-300">~/library-site</span>
                  <span className="text-slate-400">$ </span>
                  {entry.command}
                </p>
                {entry.out && <pre className={plainPre}>{clip(entry.out)}</pre>}
                {entry.err && <pre className={cn(plainPre, "text-rose-300")}>{clip(entry.err)}</pre>}
              </div>
            ),
          )
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
          <span className="shrink-0 text-xs text-muted-foreground">$</span>
          <input
            aria-label="命令"
            disabled={disabled || full}
            value={draft}
            maxLength={LIMITS.command}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            placeholder={full ? "记录已满，请清空记录并重置" : "输入命令，按回车运行"}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
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

// ---------------------------------------------------------------------------
// Workbench: files + terminal + graph, replayed from the action history
// ---------------------------------------------------------------------------

type BenchState = { actions: Action[]; draft: string; selected: string; buffer: string | null; answers: Record<string, string>; passed: boolean };

function normalizeBench(value: unknown): BenchState {
  const record = asRecord(value);
  return {
    actions: normalizeActions(record.actions),
    draft: text(record.draft, "", LIMITS.command),
    selected: text(record.selected, "", LIMITS.path),
    buffer: typeof record.buffer === "string" ? record.buffer.slice(0, LIMITS.content) : null,
    answers: Object.fromEntries(Object.entries(asRecord(record.answers)).filter((entry): entry is [string, string] => typeof entry[1] === "string").slice(0, 8).map(([key, value]) => [key.slice(0, 20), value.slice(0, 40)])),
    passed: record.passed === true,
  };
}

function useBench(repoId: RepoId, readOnly: boolean, lockOnPass: boolean, initialFile: string) {
  const initial = React.useMemo<BenchState>(() => ({ actions: [], draft: "", selected: initialFile, buffer: null, answers: {}, passed: false }), [initialFile]);
  const { state, setState, ...save } = useActivityState<BenchState>(initial, normalizeBench);
  const replayed = React.useMemo(() => replayLab(repoId, state.actions), [repoId, state.actions]);
  const disabled = readOnly || (lockOnPass && state.passed);
  const push = (action: Action) =>
    setState((current) => (current.actions.length >= LIMITS.history ? current : { ...current, actions: [...current.actions, action] }));
  const terminal = (
    <TerminalView
      transcript={replayed.transcript}
      draft={state.draft}
      count={state.actions.length}
      disabled={disabled}
      onDraft={(draft) => setState((current) => ({ ...current, draft }))}
      onRun={() =>
        setState((current) => {
          const command = current.draft.trim();
          if (!command || current.actions.length >= LIMITS.history) return current;
          return { ...current, actions: [...current.actions, command], draft: "" };
        })
      }
      onReset={() => setState((current) => ({ ...current, actions: [], draft: "", buffer: null }))}
    />
  );
  const files = (
    <FilesPanel
      repo={replayed.repo}
      selected={state.selected}
      buffer={state.buffer}
      disabled={disabled}
      onSelect={(selected) => setState((current) => ({ ...current, selected, buffer: null }))}
      onBuffer={(buffer) => setState((current) => ({ ...current, buffer }))}
      onSave={(path, content) => {
        push({ edit: path, content });
        setState((current) => ({ ...current, buffer: null }));
      }}
    />
  );
  return { state, setState, save, repo: replayed.repo, terminal, files, graph: <CommitGraph repo={replayed.repo} /> };
}

function BenchLab({
  id,
  repo: repoId,
  readOnly,
  ticket,
  goal,
  label,
  event,
  file,
  live,
  extra,
}: {
  id: string;
  repo: RepoId;
  readOnly: boolean;
  ticket: React.ReactNode;
  goal: React.ReactNode;
  label: string;
  event: string;
  file: string;
  live?: (repo: Repo) => Goal[];
  extra?: (repo: Repo) => React.ReactNode;
}) {
  const bench = useBench(repoId, readOnly, true, file);
  const { submit, pending, last } = useLabSubmit();
  return (
    <div className="space-y-5" data-testid={`git-basics-${id}`}>
      <Ticket goal={goal}>{ticket}</Ticket>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {bench.files}
        {bench.graph}
      </div>
      {extra?.(bench.repo)}
      {bench.terminal}
      {live && <GoalList goals={live(bench.repo)} />}
      <LabFooter
        save={bench.save}
        passed={bench.state.passed}
        pending={pending}
        readOnly={readOnly}
        label={label}
        last={last}
        disabled={bench.state.actions.length === 0}
        onSubmit={() => void submit({ actions: bench.state.actions }, event).then((ok) => ok && bench.setState((current) => ({ ...current, passed: true })))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

export function CommitLab({ readOnly }: ActivityComponentProps) {
  return (
    <BenchLab
      id="commit"
      repo="commit"
      readOnly={readOnly}
      file="loans.js"
      label="提交检查"
      event="git_commit_lab_submitted"
      ticket={
        <>
          你修好了借阅页的两个问题（<code>loans.js</code> 和 <code>loans.html</code>）。为了排查，你还临时打开了 <code>config.js</code> 里的调试开关，并新建了一个放数据库密码的 <code>.env</code>。调试开关等会儿还要用，先别改回去。
        </>
      }
      goal="把两处修复提交成一次干净的提交，让下面五项全部变绿。"
      live={(repo) => gradeCommit(repo).goals}
    />
  );
}

export function HistoryLab({ readOnly }: ActivityComponentProps) {
  const bench = useBench("history", readOnly, false, "config.js");
  const { submit, pending, last } = useLabSubmit();
  const merged = bench.state.answers as Partial<Record<HistoryQuestionId, string>>;
  const locked = readOnly || bench.state.passed;
  const setAnswer = (id: HistoryQuestionId, value: string) => bench.setState((current) => ({ ...current, answers: { ...current.answers, [id]: value } }));
  return (
    <div className="space-y-5" data-testid="git-basics-history">
      <Ticket goal="从提交历史里查出下面四个问题的答案。">
        读者反映“以前能借 30 天，怎么变成 14 天了”。没人记得是谁、什么时候改的。仓库里记着每一次修改。
      </Ticket>
      {bench.graph}
      {bench.terminal}
      <div className="space-y-3">
        {HISTORY_QUESTIONS.map((item, index) => (
          <section key={item.id} className="space-y-2 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">
              {index + 1}. {item.question}
            </p>
            {"options" in item ? (
              <div className="grid gap-2">
                {item.options.map((option) => (
                  <label key={option.id} className="flex items-start gap-2 text-sm">
                    <input type="radio" name={`q-${item.id}`} disabled={locked} checked={merged[item.id] === option.id} onChange={() => setAnswer(item.id, option.id)} className="mt-1" />
                    {option.label}
                  </label>
                ))}
              </div>
            ) : (
              <input aria-label={item.question} disabled={locked} value={merged[item.id] ?? ""} maxLength={40} spellCheck={false} onChange={(event) => setAnswer(item.id, event.target.value)} className={cn(inputClass, "max-w-xs")} />
            )}
          </section>
        ))}
      </div>
      <LabFooter save={bench.save} passed={bench.state.passed} pending={pending} readOnly={readOnly} label="提交答案" last={last}
        onSubmit={() => void submit({ answers: merged }, "git_history_lab_submitted").then((ok) => ok && bench.setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

export function UndoLab({ readOnly }: ActivityComponentProps) {
  return (
    <BenchLab
      id="undo"
      repo="undo"
      readOnly={readOnly}
      file="index.html"
      label="提交检查"
      event="git_undo_lab_submitted"
      ticket={
        <>
          刚提交的“添加搜素框”有两个问题：说明里有错别字，还漏了 <code>search.js</code>。手忙脚乱中你又误删了 <code>index.html</code> 里的一行，还把调了一半的 <code>style.css</code> 放进了暂存区。这次提交还没有推送。
        </>
      }
      goal="让下面三项全部变绿：该恢复的恢复，该补的补进那次提交，调了一半的样式留在手里。"
      live={(repo) => gradeUndo(repo).goals}
    />
  );
}

export function BranchLab({ readOnly }: ActivityComponentProps) {
  return (
    <BenchLab
      id="branch"
      repo="branch"
      readOnly={readOnly}
      file="index.html"
      label="提交检查"
      event="git_branch_lab_submitted"
      ticket={
        <>
          你要开始做搜索功能，代码会放在新文件 <code>search.js</code> 里，要做好几天。刚开工，馆长打来电话：首页的开馆时间写错了，工作日应该是 <code>9:00–21:00</code>，马上就要改好上线。
        </>
      }
      goal={`在 ${"feature/search"} 分支上提交搜索功能的第一版，在 main 上提交开馆时间的修正，让下面四项全部变绿。`}
      live={(repo) => gradeBranch(repo).goals}
    />
  );
}

export function MergeLab({ readOnly }: ActivityComponentProps) {
  return (
    <BenchLab
      id="merge"
      repo="merge"
      readOnly={readOnly}
      file="index.html"
      label="提交检查"
      event="git_merge_lab_submitted"
      ticket={
        <>
          小王在 <code>feature/weekend</code> 分支上加了周末开馆时间（周末 10:00–16:00），还让周末也能还书。这段时间 main 上也有新提交：工作日的开馆时间改成了 9:00–21:00，链接颜色也改了。现在要把小王的分支合进 main。
        </>
      }
      goal="把 feature/weekend 合并进 main，两边的修改一个都不能丢。"
      live={(repo) => gradeMerge(repo).goals}
    />
  );
}

function RemotePanel({ repo }: { repo: Repo }) {
  const tip = repo.remote.main;
  const rows = tip ? history(repo, [tip]).slice(0, 3) : [];
  return (
    <div className="space-y-1 rounded-lg border border-dashed border-border p-3 text-xs" data-testid="remote-panel">
      <p className="font-semibold">代码托管网站上的 main（最新 3 次提交）</p>
      <ol className="m-0 list-none space-y-0.5 p-0 font-mono">
        {rows.map((commit) => (
          <li key={commit.id}>
            {short(commit.id)} {commit.message.split("\n")[0]} <span className="font-sans text-muted-foreground">· {name(commit.author)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RemoteLab({ readOnly }: ActivityComponentProps) {
  return (
    <BenchLab
      id="remote"
      repo="remote"
      readOnly={readOnly}
      file="loans.js"
      label="提交检查"
      event="git_remote_lab_submitted"
      ticket={
        <>
          你在本地提交了“借阅页显示剩余天数”，准备推送到远程仓库，让它上线。同一时间，小王也在改 README。
        </>
      }
      goal="把你的提交推送到远程 main，让下面四项全部变绿。"
      extra={(repo) => <RemotePanel repo={repo} />}
      live={(repo) => gradeRemote(repo).goals}
    />
  );
}

export function IncidentLab({ readOnly }: ActivityComponentProps) {
  return (
    <BenchLab
      id="incident"
      repo="incident"
      readOnly={readOnly}
      file="README.md"
      label="提交处理结果"
      event="git_incident_lab_submitted"
      ticket={
        <>
          下午的版本上线后，读者截图反馈：借阅页上的到期日期比借书日期还早。今天下午小王和陈静往 main 上推送了好几次提交，大家都已经拉取到了自己电脑上。你手头还有没提交的搜索功能草稿。
        </>
      }
      goal="让线上的到期日期恢复正常。没有实时提示，提交后由服务端检查。"
      extra={(repo) => <RemotePanel repo={repo} />}
    />
  );
}
