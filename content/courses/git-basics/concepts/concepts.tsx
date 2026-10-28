"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import { Chip, Node, Segmented } from "@/components/education/scene-kit";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

const PREFIX = "git-basics/";
const mapping = (...rows: [string, string, string][]): ConceptMapping[] => rows.map(([analogy, real, covers]) => ({ analogy, real, covers }));

function Concept({
  id,
  title,
  analogy,
  steps,
  scene,
  rows,
  insight,
  controls,
}: {
  id: string;
  title: string;
  analogy: string;
  steps: ConceptStep[];
  scene: (step: number) => React.ReactNode;
  rows: ConceptMapping[];
  insight: string;
  controls?: React.ReactNode;
}) {
  return (
    <ConceptFrame
      conceptId={`${PREFIX}${id}` as ConceptId}
      blockId={`concept-${id}`}
      title={title}
      analogy={analogy}
      steps={steps}
      scenes={steps.map((_, index) => (
        <React.Fragment key="scene">{scene(index)}</React.Fragment>
      ))}
      mapping={rows}
      insight={insight}
      controls={controls}
    />
  );
}

type Dot = { id: string; label: string; tone?: "primary" | "success" | "danger" | "muted" | "warning"; refs?: string[] };

/** A horizontal chain of commits, oldest on the left. */
function Chain({ dots, caption }: { dots: Dot[]; caption?: string }) {
  return (
    <div className="space-y-1">
      {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
      <ol className="m-0 flex list-none flex-wrap items-start gap-1 p-0">
        {dots.map((dot, index) => (
          <li key={dot.id} className="flex items-start gap-1">
            {index > 0 && <span className="mt-1.5 text-muted-foreground">←</span>}
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[11px] motion-safe:transition-colors motion-safe:duration-300",
                  dot.tone === "primary" && "border-primary bg-primary/15",
                  dot.tone === "success" && "border-success/60 bg-success/10",
                  dot.tone === "danger" && "border-destructive/60 bg-destructive/10 line-through",
                  dot.tone === "warning" && "border-warning/60 bg-warning/15",
                  dot.tone === "muted" && "border-dashed border-border text-muted-foreground",
                  !dot.tone && "border-border bg-card",
                )}
              >
                {dot.label}
              </span>
              {dot.refs?.map((ref) => (
                <span key={ref} className={cn("rounded border px-1 font-mono text-[10px]", ref.startsWith("HEAD") ? "border-primary text-primary" : ref.startsWith("origin") ? "border-warning/60" : "border-border")}>
                  {ref}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Lines({ rows, tone }: { rows: string[]; tone?: "success" | "danger" }) {
  return (
    <pre
      className={cn(
        "m-0 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100",
        tone === "success" && "ring-2 ring-success/60",
        tone === "danger" && "ring-2 ring-destructive/60",
      )}
    >
      {rows.join("\n")}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Ch1 · commits are snapshots
// ---------------------------------------------------------------------------

export function SnapshotConcept() {
  const steps: ConceptStep[] = [
    { title: "改了几个文件", description: "你在编辑器里改了 index.html。在保存这一刻之前，旧版本已经找不回来了。" },
    { title: "拍一张快照", description: "提交（commit）把这一刻所有文件的样子记下来，配上一句说明、作者和时间。" },
    { title: "每张都记着上一张", description: "新的提交记着它的上一个提交是谁，一张张串成一条历史。" },
    { title: "随时翻回去看", description: "想知道上周的首页长什么样、哪一次改坏了借阅页，都能翻到对应的那一张。" },
  ];
  const photos = [
    { id: "a", label: "初始化网站", who: "陈静" },
    { id: "b", label: "添加借阅页", who: "陈静" },
    { id: "c", label: "首页加上开馆时间", who: "王磊" },
  ];
  return (
    <Concept
      id="snapshot"
      title="提交是一张张快照"
      analogy="照片档案：每次觉得“这一版可以了”，就把整个项目拍一张照片存进档案，背面写上日期、谁拍的、这张拍了什么。"
      steps={steps}
      scene={(step) => {
        const shown = step === 0 ? photos.slice(0, 2) : photos;
        return (
          <div className="space-y-3">
            <Chain dots={shown.map((photo, index) => ({ id: photo.id, label: `${photo.label} · ${photo.who}`, tone: step >= 1 && index === 2 ? "primary" : step === 3 && index === 0 ? "success" : undefined }))} />
            {step === 0 && <Chip tone="warning">工作区：index.html 已修改，还没拍照</Chip>}
            {step >= 1 && (
              <Node title="第 3 张快照" subtitle="2b25c82" active={step === 1}>
                <p>说明：首页加上开馆时间 · 作者：王磊 · 上一张：857a3ab</p>
                <p className="mt-1 text-muted-foreground">内容：README.md、index.html、style.css、loans.html、loans.js、config.js 此刻的全部样子</p>
              </Node>
            )}
            {step === 3 && <Chip tone="success">git show 857a3ab：翻回第 2 张，看当时的样子</Chip>}
          </div>
        );
      }}
      rows={mapping(
        ["一张照片", "一次提交（commit）", "记下所有文件此刻的样子"],
        ["照片背面的字", "提交说明、作者、时间", "说明写给以后的人看"],
        ["照片的编号", "提交号（如 2b25c82）", "由内容算出来，独一无二"],
        ["档案册", "仓库（repository）", "藏在项目里的 .git 目录"],
      )}
      insight="提交不是“保存一下”，而是给整个项目拍一张有说明的快照。历史就是这些快照串成的链。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch2 · working tree, staging area, repository
// ---------------------------------------------------------------------------

export function AreasConcept() {
  const [how, setHow] = React.useState<"pick" | "all">("pick");
  const files = ["loans.js", "loans.html", "config.js", ".env"];
  const staged = how === "pick" ? ["loans.js", "loans.html"] : files;
  const steps: ConceptStep[] = [
    { title: "工作区：你正在改的文件", description: "四个文件有变化：两处修复、一个调试开关，还有新建的 .env。" },
    { title: how === "pick" ? "git add loans.js loans.html" : "git add .", description: how === "pick" ? "只把两处修复放进暂存区，其余的留在工作区。" : "把所有变化都放进了暂存区，包括调试开关和密码。" },
    { title: "git commit", description: "提交只拍暂存区里的东西。" },
    { title: "结果", description: how === "pick" ? "这次提交干干净净；调试开关还在工作区里，.env 一直没进历史。" : "密码进了历史。哪怕下一次提交把它删掉，以前那张快照里也还有它。" },
  ];
  return (
    <Concept
      id="areas"
      title="工作区、暂存区、仓库"
      analogy="拍照前先摆取景框：想拍进照片的东西挪进框里（暂存），不想拍的留在框外；按下快门（提交）只拍框里的。"
      steps={steps}
      controls={<Segmented label="怎么暂存" value={how} options={[{ value: "pick" as const, label: "git add 两个文件" }, { value: "all" as const, label: "git add ." }]} onChange={setHow} />}
      scene={(step) => {
        const inIndex = step >= 1 ? staged : [];
        const committed = step >= 2 ? staged : [];
        const tone = (file: string) => (file === ".env" || file === "config.js" ? "danger" : "success");
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Node title="工作区" subtitle="你看到、编辑的文件" active={step === 0}>
              <div className="flex flex-wrap gap-1">
                {files.filter((file) => !inIndex.includes(file)).map((file) => (
                  <Chip key={file}>{file}</Chip>
                ))}
              </div>
            </Node>
            <Node title="暂存区" subtitle="下一张照片的取景框" active={step === 1}>
              <div className="flex flex-wrap gap-1">
                {(step === 1 ? inIndex : []).map((file) => (
                  <Chip key={file} tone={tone(file) === "danger" ? "danger" : "default"}>
                    {file}
                  </Chip>
                ))}
              </div>
            </Node>
            <Node title="仓库" subtitle="已经拍好的照片" tone={step >= 3 ? (how === "pick" ? "success" : "danger") : "default"} active={step === 2}>
              <div className="flex flex-wrap gap-1">
                {committed.map((file) => (
                  <Chip key={file} tone={tone(file) === "danger" ? "danger" : "success"}>
                    {file}
                  </Chip>
                ))}
              </div>
            </Node>
          </div>
        );
      }}
      rows={mapping(
        ["桌上摆着的东西", "工作区", "git status 列出有哪些变化"],
        ["取景框", "暂存区（index）", "git add 放进去，git restore --staged 拿出来"],
        ["按快门", "git commit", "只拍暂存区"],
        ["“永远别拍”的清单", ".gitignore", "git add . 也会跳过它们"],
      )}
      insight="暂存区让你决定这次提交包括什么。一次提交只做一件事；密码和临时改动不要进历史。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch3 · the message is not the change
// ---------------------------------------------------------------------------

const LOG = [
  { id: "40be817", message: "借阅页标题改为“我的借阅”", files: "loans.html" },
  { id: "ad8c7fa", message: "修正 README 错别字", files: "README.md" },
  { id: "c18c39c", message: "调整样式", files: "style.css、config.js" },
  { id: "7b0b830", message: "借阅页显示到期日期", files: "loans.html" },
];

export function LogConcept() {
  const steps: ConceptStep[] = [
    { title: "git log --oneline", description: "一行一个提交：提交号和说明的第一行。" },
    { title: "按说明找“借阅”", description: "说明里带“借阅”的有两次，可它们都只改了 loans.html。" },
    { title: "按文件找：git log -- config.js", description: "只列出改过 config.js 的提交，冒出来一次“调整样式”。" },
    { title: "看实际改动：git log -p", description: "“调整样式”除了改颜色，还把 LOAN_DAYS 从 30 改成了 14。" },
  ];
  return (
    <Concept
      id="log"
      title="说明不等于改动"
      analogy="翻相册找“去年借书证换新”那张：照片背面写的是“调整样式”，光看背面永远找不到，得把照片翻过来看画面。"
      steps={steps}
      scene={(step) => (
        <div className="space-y-2">
          {LOG.map((row) => {
            const byMessage = step === 1 && row.message.includes("借阅");
            const byFile = step >= 2 && row.files.includes("config.js");
            return (
              <div
                key={row.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 font-mono text-xs motion-safe:transition-colors",
                  byMessage && "border-warning/60 bg-warning/10",
                  byFile && "border-primary bg-primary/10",
                  step >= 2 && !byFile && "border-dashed border-border text-muted-foreground",
                  !byMessage && step < 2 && "border-border",
                )}
              >
                <span>{row.id}</span>
                <span className="font-sans">{row.message}</span>
                {(step === 1 || step >= 2) && <span className="font-sans text-[11px] text-muted-foreground">改了 {row.files}</span>}
              </div>
            );
          })}
          {step === 3 && <Lines rows={["diff --git a/config.js b/config.js", "-export const LOAN_DAYS = 30;", "+export const LOAN_DAYS = 14;"]} tone="success" />}
        </div>
      )}
      rows={mapping(
        ["照片背面的字", "提交说明", "可能写得不准"],
        ["照片画面", "实际改动（diff）", "git show、git log -p"],
        ["只看某个人的照片", "git log --author", "按作者筛选"],
        ["这一笔是谁画的", "git blame 文件", "每一行最后被哪次提交改过"],
      )}
      insight="查历史时，说明只是线索；要确认就看改动本身。反过来，自己写提交说明要写清楚改了什么。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · four ways to undo
// ---------------------------------------------------------------------------

const UNDO = {
  restore: { label: "git restore 文件", work: "回到暂存区里的样子", index: "不变", repo: "不变", danger: "工作区里没保存的改动直接丢掉" },
  unstage: { label: "git restore --staged 文件", work: "不变", index: "拿出取景框（回到上次提交的样子）", repo: "不变", danger: "" },
  amend: { label: "git commit --amend", work: "不变", index: "不变", repo: "最后一张照片换成新的一张", danger: "只能改还没推送的提交" },
  hard: { label: "git reset --hard", work: "全部回到上次提交的样子", index: "全部回到上次提交的样子", repo: "不变（或退回到指定的提交）", danger: "所有没提交的改动一起丢掉" },
} as const;

export function UndoConcept() {
  const [which, setWhich] = React.useState<keyof typeof UNDO>("restore");
  const item = UNDO[which];
  const steps: ConceptStep[] = [
    { title: "撤销之前", description: "三个地方各有东西：工作区里改了 index.html，暂存区里放着 style.css，仓库里最后一次提交是“添加搜素框”。" },
    { title: item.label, description: "看看它动了哪一层。" },
    { title: "后果", description: item.danger ? "被替换掉的那一层，原来的内容回不来了。" : "改动只是从取景框里拿了出来，还在工作区。" },
  ];
  const cell = (value: string, step: number) => (step >= 1 && value !== "不变" ? (item.danger && value.includes("全部") ? "danger" : "primary") : undefined);
  return (
    <Concept
      id="undo"
      title="四种“撤销”，各动哪一层"
      analogy="照片档案里的后悔药：把桌上的东西摆回照片里的样子（restore）；把东西挪出取景框（restore --staged）；重拍最后一张（amend）；把桌面和取景框一把清空（reset --hard）。"
      steps={steps}
      controls={<Segmented label="命令" value={which} options={(Object.keys(UNDO) as (keyof typeof UNDO)[]).map((value) => ({ value, label: UNDO[value].label }))} onChange={setWhich} />}
      scene={(step) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["工作区", "index.html 改坏了一行", item.work],
              ["暂存区", "style.css（调了一半）", item.index],
              ["仓库", "最后一次：添加搜素框", item.repo],
            ] as const
          ).map(([title, before, after]) => (
            <Node key={title} title={title} tone={cell(after, step) === "danger" ? "danger" : "default"} active={cell(after, step) === "primary"}>
              <p className={cn(step >= 1 && after !== "不变" && "line-through text-muted-foreground")}>{before}</p>
              {step >= 1 && after !== "不变" && <p className="mt-1">→ {after}</p>}
            </Node>
          ))}
          {step >= 2 && (
            <div className="sm:col-span-3">
              <Chip tone={item.danger ? "warning" : "success"}>{item.danger || "不会丢失任何改动"}</Chip>
            </div>
          )}
        </div>
      )}
      rows={mapping(
        ["把桌面摆回照片里的样子", "git restore 文件", "丢掉工作区的修改"],
        ["挪出取景框", "git restore --staged 文件", "改动还在工作区"],
        ["重拍最后一张", "git commit --amend", "替换最后一次提交"],
        ["清空桌面和取景框", "git reset --hard", "最危险，改动找不回来"],
      )}
      insight="撤销之前先想清楚要撤哪一层：工作区、暂存区还是提交。动工作区的命令会直接覆盖文件，没提交的改动没有后悔药。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch5 · branches are movable labels
// ---------------------------------------------------------------------------

export function BranchConcept() {
  const steps: ConceptStep[] = [
    { title: "分支只是一张标签", description: "main 贴在最新的提交上，HEAD 指着你现在所在的分支。" },
    { title: "git switch -c feature/search", description: "新建一张标签贴在同一个提交上，HEAD 换到它。什么文件都没复制。" },
    { title: "在 feature/search 上提交", description: "新提交接在后面，只有 HEAD 指着的那张标签跟着往前走，main 原地不动。" },
    { title: "git switch main，提交修复", description: "回到 main，工作区变回 main 的样子；修复提交接在 main 后面。两条线各走各的。" },
  ];
  return (
    <Concept
      id="branch"
      title="分支是会移动的书签"
      analogy="照片档案里的书签：一张书签夹在“最新的正式版”那页，另一张夹在你的“试验版”那页。往哪条线上拍新照片，那张书签就挪到新照片上。"
      steps={steps}
      scene={(step) => {
        const mainRefs = step === 0 ? ["HEAD -> main"] : step >= 3 ? ["HEAD -> main"] : ["main"];
        const featureRefs = step === 1 ? ["HEAD -> feature/search"] : step === 2 ? ["HEAD -> feature/search"] : ["feature/search"];
        return (
          <div className="space-y-3">
            <Chain
              caption="main"
              dots={[
                { id: "a", label: "…" },
                { id: "b", label: "40be817", refs: step >= 3 ? [] : step >= 1 ? [...mainRefs, ...(step === 1 ? featureRefs : [])] : mainRefs },
                ...(step >= 3 ? [{ id: "fix", label: "修正开馆时间", tone: "success" as const, refs: mainRefs }] : []),
              ]}
            />
            {step >= 2 && <Chain caption="feature/search（从 40be817 分出来）" dots={[{ id: "b2", label: "40be817", tone: "muted" }, { id: "s", label: "搜索功能雏形", tone: "primary", refs: featureRefs }]} />}
          </div>
        );
      }}
      rows={mapping(
        ["书签", "分支（branch）", "只记着一个提交号"],
        ["“你在这里”的箭头", "HEAD", "新提交接在它后面"],
        ["翻到另一张书签那页", "git switch 分支", "工作区换成那个分支的样子"],
        ["新做一张书签", "git switch -c 名字", "从当前提交分出去"],
      )}
      insight="分支几乎不占空间，只是一张能移动的书签。没做完的功能放在自己的分支上，main 随时可以发布。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · merging and conflicts
// ---------------------------------------------------------------------------

export function MergeConcept() {
  const [kind, setKind] = React.useState<"clean" | "conflict">("conflict");
  const base = "开馆时间：周一至周五 9:00–17:00";
  const ours = "开馆时间：周一至周五 9:00–21:00";
  const theirs = kind === "conflict" ? "开馆时间：周一至周五 9:00–17:00，周末 10:00–16:00" : base;
  const steps: ConceptStep[] = [
    { title: "找到共同的起点", description: "两条线分开之前的最后一个提交叫合并基础。Git 拿两边分别和它比。" },
    { title: "各自改了什么", description: kind === "conflict" ? "main 改了这一行的工作日时间；feature/weekend 在同一行加了周末时间。" : "main 改了开馆时间；feature/weekend 只改了 loans.js，没碰这一行。" },
    { title: kind === "conflict" ? "同一行两边都改了：冲突" : "只有一边改：自动合并", description: kind === "conflict" ? "Git 不知道该听谁的，把两个版本都写进文件，用标记圈起来，等你决定。" : "谁改了就用谁的，Git 自动生成合并提交。" },
    { title: kind === "conflict" ? "你来决定最终内容" : "合并完成", description: kind === "conflict" ? "把这一段改成最终想要的样子，删掉三行标记，git add，再 git commit。" : "合并提交有两个上一张：两条线又汇到了一起。" },
  ];
  return (
    <Concept
      id="merge"
      title="合并：自动合并与冲突"
      analogy="两个人各自拿着同一张底稿修改：一个改了标题，另一个改了正文，合起来毫无问题；两个人改了同一句话，就得坐下来商量这句最终怎么写。"
      steps={steps}
      controls={<Segmented label="小王改了什么" value={kind} options={[{ value: "conflict" as const, label: "同一行" }, { value: "clean" as const, label: "别的文件" }]} onChange={setKind} />}
      scene={(step) => (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Node title="合并基础" active={step === 0}>
              <p className="font-mono text-[11px]">{base}</p>
            </Node>
            <Node title="main（HEAD）" active={step === 1}>
              <p className="font-mono text-[11px]">{step >= 1 ? ours : base}</p>
            </Node>
            <Node title="feature/weekend" active={step === 1}>
              <p className="font-mono text-[11px]">{step >= 1 ? theirs : base}</p>
              {kind === "clean" && step >= 1 && <p className="mt-1 text-muted-foreground">另外改了 loans.js</p>}
            </Node>
          </div>
          {step === 2 && kind === "conflict" && <Lines rows={["<<<<<<< HEAD", ours, "=======", theirs, ">>>>>>> feature/weekend"]} tone="danger" />}
          {step >= 2 && kind === "clean" && <Lines rows={[ours]} tone="success" />}
          {step === 3 && kind === "conflict" && <Lines rows={["开馆时间：周一至周五 9:00–21:00，周末 10:00–16:00"]} tone="success" />}
        </div>
      )}
      rows={mapping(
        ["共同的底稿", "合并基础（merge base）", "两条线分开前的最后一个提交"],
        ["改的地方不一样", "自动合并", "Git 直接生成合并提交"],
        ["改了同一句话", "冲突（conflict）", "<<<<<<< 和 >>>>>>> 之间两个版本都在"],
        ["商量好之后", "编辑文件 → git add → git commit", "标记一定要删干净"],
      )}
      insight="冲突不是出错，而是 Git 把决定权交给你。解决冲突时要读懂两边各自想改什么，通常两边的意图都要保留。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch7 · push, rejection, pull
// ---------------------------------------------------------------------------

export function RemoteConcept() {
  const [fix, setFix] = React.useState<"pull" | "force">("pull");
  const steps: ConceptStep[] = [
    { title: "你和小王从同一处出发", description: "两个人都克隆了远程仓库，都在 40be817 上。" },
    { title: "小王先推送了", description: "小王的“README 补充部署说明”已经在远程 main 上了。你本地还看不到它。" },
    { title: "你的推送被拒绝", description: "远程 main 不是你这条线的祖先：直接推上去会把小王的提交挤掉，所以 Git 拒绝了。" },
    {
      title: fix === "pull" ? "git pull，再 git push" : "git push --force",
      description: fix === "pull" ? "pull 先把小王的提交取下来、和你的合并，再推送：两个人的提交都在。" : "强制推送用你的历史覆盖远程：小王的提交从远程上消失了，他下次拉取时会一团乱。",
    },
  ];
  return (
    <Concept
      id="remote"
      title="推送被拒绝之后"
      analogy="共享相册：你想把新照片放进大家的相册，却发现小王刚放进去一张你没见过的。正确做法是先把他那张拿回来一起整理；把整本相册换成你手里的版本，他那张就没了。"
      steps={steps}
      controls={<Segmented label="被拒绝后" value={fix} options={[{ value: "pull" as const, label: "git pull 再 push" }, { value: "force" as const, label: "git push --force" }]} onChange={setFix} />}
      scene={(step) => {
        const remote: { id: string; label: string; tone?: "success" | "danger" | "primary" | "muted" }[] = [{ id: "b", label: "40be817" }];
        if (step >= 1) remote.push({ id: "w", label: "小王：README", tone: step === 3 && fix === "force" ? "danger" : undefined });
        if (step === 3) remote.push(fix === "pull" ? { id: "m", label: "你：剩余天数 + 合并", tone: "success" } : { id: "y", label: "你：剩余天数", tone: "primary" });
        return (
          <div className="space-y-3">
            <Chain caption="远程仓库 main" dots={remote} />
            <Chain caption="你的电脑 main" dots={[{ id: "b", label: "40be817" }, { id: "y", label: "你：剩余天数", tone: "primary" }, ...(step === 3 && fix === "pull" ? [{ id: "m", label: "合并小王的提交", tone: "success" as const }] : [])]} />
            {step === 2 && <Chip tone="danger">! [rejected] main -&gt; main (fetch first)</Chip>}
            {step === 3 && <Chip tone={fix === "pull" ? "success" : "danger"}>{fix === "pull" ? "两个人的提交都在远程 main 上" : "小王的提交被覆盖掉了"}</Chip>}
          </div>
        );
      }}
      rows={mapping(
        ["共享相册", "远程仓库（origin）", "大家都从这里拉取、往这里推送"],
        ["把新照片放进去", "git push", "只能在别人的照片后面接着放"],
        ["先把别人新放的拿回来", "git fetch / git pull", "pull = fetch + merge"],
        ["整本换成你的版本", "git push --force", "会抹掉别人的提交"],
      )}
      insight="推送被拒绝说明远程有你没见过的提交。先 pull 合并，再 push；共享分支上不要强制推送。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch8 · revert vs reset on shared history
// ---------------------------------------------------------------------------

export function RevertConcept() {
  const [how, setHow] = React.useState<"revert" | "reset">("revert");
  const steps: ConceptStep[] = [
    { title: "坏提交已经推送出去了", description: "“改用自己的日期函数”引入了 bug，之后陈静和小王又各推了一次提交。" },
    {
      title: how === "revert" ? "git revert 坏提交" : "git reset --hard 坏提交的上一个",
      description: how === "revert" ? "revert 新增一次“反向”提交，把那次改动原样撤回，前面的历史一个字不动。" : "reset 把 main 退回到坏提交之前，后面三次提交从你的历史里消失，没提交的改动也被清空。",
    },
    {
      title: how === "revert" ? "git push" : "git push --force",
      description: how === "revert" ? "新提交接在后面，正常推送就行，别人 pull 一下就同步了。" : "普通推送会被拒绝，只能强推：陈静和小王的提交从远程上没了。",
    },
  ];
  return (
    <Concept
      id="revert"
      title="撤销已经推送的提交"
      analogy="相册里已经放进一张拍错的照片，后面大家又放了几张。正确的做法是再放一张“更正”；把那张之后的都撕掉，连别人的照片也一起撕了。"
      steps={steps}
      controls={<Segmented label="用哪个" value={how} options={[{ value: "revert" as const, label: "git revert" }, { value: "reset" as const, label: "git reset --hard + 强推" }]} onChange={setHow} />}
      scene={(step) => {
        const later = [
          { id: "r", label: "陈静：README" },
          { id: "w", label: "王磊：周末时间" },
        ];
        const removed = how === "reset" && step >= 1;
        return (
          <div className="space-y-3">
            <Chain
              dots={[
                { id: "b", label: "40be817" },
                { id: "x", label: "王磊：日期函数（有 bug）", tone: step === 0 ? "warning" : removed ? "danger" : "warning" },
                ...later.map((item) => ({ ...item, tone: removed ? ("danger" as const) : undefined })),
                ...(how === "revert" && step >= 1 ? [{ id: "v", label: "Revert “日期函数”", tone: "success" as const, refs: step >= 2 ? ["HEAD -> main", "origin/main"] : ["HEAD -> main"] }] : []),
              ]}
            />
            {step >= 2 && <Chip tone={how === "revert" ? "success" : "danger"}>{how === "revert" ? "bug 修好了，所有人的提交都在" : "bug 没了，陈静和小王的提交也没了"}</Chip>}
          </div>
        );
      }}
      rows={mapping(
        ["再放一张更正照片", "git revert", "新增提交，不改历史"],
        ["撕掉后面的照片", "git reset + git push --force", "改写别人已经拿到的历史"],
        ["还没放进共享相册的照片", "还没推送的提交", "这时 reset、amend 都没问题"],
      )}
      insight="已经推送的提交用 revert 撤销；只有还没推送的提交，才用 reset 或 amend 改写。"
    />
  );
}
