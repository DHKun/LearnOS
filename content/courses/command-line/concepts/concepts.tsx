"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import { Chip, Node, Segmented } from "@/components/education/scene-kit";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

import { normalize } from "../simulation/shell";

const PREFIX = "command-line/";
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

function Term({ children, className }: { children: React.ReactNode; className?: string }) {
  return <pre className={cn("m-0 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100", className)}>{children}</pre>;
}

function Row({ cells, tone }: { cells: React.ReactNode[]; tone?: "primary" | "success" | "danger" | "muted" }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 font-mono text-xs motion-safe:transition-colors motion-safe:duration-300",
        tone === "primary" && "border-primary bg-primary/10",
        tone === "success" && "border-success/50 bg-success/10",
        tone === "danger" && "border-destructive/50 bg-destructive/10",
        tone === "muted" && "border-dashed border-border text-muted-foreground",
        !tone && "border-border",
      )}
    >
      {cells.map((cell, index) => (
        <span key={index}>{cell}</span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch1 · what the shell does with one line
// ---------------------------------------------------------------------------

const SHELL_EXAMPLES = {
  ls: { line: "ls -l ~/*.txt", words: ["ls", "-l", "~/*.txt"], expanded: ["ls", "-l", "/home/ops/notes.txt", "/home/ops/todo.txt"], program: "ls", found: 2 },
  grep: { line: 'grep -c "500 " $LOG', words: ["grep", "-c", '"500 "', "$LOG"], expanded: ["grep", "-c", "500␠", "/var/log/library/access.log"], program: "grep", found: 2 },
} as const;
const SEARCH = ["/usr/local/bin", "/usr/bin", "/bin"];

export function ShellConcept() {
  const [example, setExample] = React.useState<keyof typeof SHELL_EXAMPLES>("ls");
  const current = SHELL_EXAMPLES[example];
  const steps: ConceptStep[] = [
    { title: "你敲下一行字", description: "shell 是前台：它读你输入的这一行，自己并不会列文件、搜文字。" },
    { title: "按空格拆成词", description: "第一个词是命令，以 - 开头的是选项，其余是参数。引号里的空格不拆开。" },
    { title: "替换特殊写法", description: "~ 换成家目录，* 换成匹配的文件名，$变量 换成它的值。程序收到的已经是替换后的结果。" },
    { title: "按 PATH 找程序", description: "shell 按 PATH 里列的目录依次找同名的程序，找到第一个就停。" },
    { title: "运行，显示输出", description: "程序运行完，把结果写到屏幕上；出错信息走另一条通道，也显示在屏幕上。" },
  ];
  return (
    <Concept
      id="shell"
      title="一行命令是怎么被执行的"
      analogy="办公楼的前台：你对前台说一句话，前台把它拆开，弄清楚要找谁、办什么事，再按楼层索引找到那位同事，把事情交给他办。"
      steps={steps}
      controls={<Segmented label="例子" value={example} options={Object.entries(SHELL_EXAMPLES).map(([value, item]) => ({ value: value as keyof typeof SHELL_EXAMPLES, label: item.line }))} onChange={setExample} />}
      scene={(step) => (
        <div className="space-y-3">
          <Term>
            <span className="text-emerald-300">ops@library</span>:<span className="text-sky-300">~</span>$ {current.line}
          </Term>
          {step >= 1 && (
            <div className="flex flex-wrap gap-2">
              {(step >= 2 ? current.expanded : current.words).map((word, index) => (
                <span
                  key={`${step >= 2}-${index}`}
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-xs",
                    index === 0 ? "border-primary bg-primary/10" : word.startsWith("-") ? "border-warning/60 bg-warning/15" : "border-border bg-card",
                  )}
                >
                  {word}
                  <span className="ml-1 font-sans text-[10px] text-muted-foreground">{index === 0 ? "命令" : word.startsWith("-") ? "选项" : "参数"}</span>
                </span>
              ))}
            </div>
          )}
          {step >= 3 && (
            <div className="space-y-1">
              {SEARCH.map((dir, index) => (
                <Row
                  key={dir}
                  tone={index === current.found ? "success" : index < current.found ? "muted" : undefined}
                  cells={[`${dir}/${current.program}`, <span key="note" className="font-sans">{index < current.found ? "没有" : index === current.found ? "找到了" : "不用再找"}</span>]}
                />
              ))}
            </div>
          )}
          {step >= 4 && <Chip tone="success">运行 /bin/{current.program}，结果显示在屏幕上</Chip>}
        </div>
      )}
      rows={mapping(
        ["前台", "shell（这里是 bash）", "读命令、拆词、找程序"],
        ["要找的同事", "程序（命令）", "真正干活的是它"],
        ["楼层索引", "PATH 环境变量", "第 8 章细讲"],
        ["你交代的细节", "选项和参数", "程序自己决定怎么理解"],
      )}
      insight="shell 只负责拆词、替换和找程序。程序收到的参数已经是替换之后的样子，所以 ~ 和 * 对所有命令都有效。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch2 · relative paths depend on where you stand
// ---------------------------------------------------------------------------

const TREE = ["/", "/home", "/home/deploy", "/home/deploy/logs", "/home/ops", "/srv", "/srv/library", "/srv/library/static", "/srv/shared", "/srv/shared/uploads"];

export function PathsConcept() {
  const [start, setStart] = React.useState("/srv/library");
  const pieces = ["..", "shared", "uploads"];
  const trail = pieces.reduce<string[]>((all, piece) => [...all, normalize(`${all[all.length - 1] ?? start}/${piece}`)], []);
  const steps: ConceptStep[] = [
    { title: "先看站在哪里", description: "每个终端都有一个当前目录，pwd 能看到它。相对路径从这里出发。" },
    { title: "..：回到上一层", description: "相对路径 ../shared/uploads 的第一步：从当前目录退回它的上一层。" },
    { title: "进入 shared", description: "在上一层里找名叫 shared 的目录。" },
    { title: "进入 uploads", description: "再进入 uploads。换一个出发点试试，同一个相对路径会走到完全不同的地方。" },
    { title: "绝对路径不看出发点", description: "以 / 开头的路径总是从根目录出发：/srv/shared/uploads 从哪里看都是同一个目录。" },
  ];
  const at = (index: number) => (index === 0 ? start : index <= 3 ? trail[index - 1]! : "/srv/shared/uploads");
  return (
    <Concept
      id="paths"
      title="同一个相对路径，从不同地方出发"
      analogy="在办公楼里问路：“出门左转，上一层”是相对路线，得看你现在站在哪个房间；“从大门进，3 楼 302”是绝对路线，谁拿着都能走到。"
      steps={steps}
      controls={<Segmented label="从哪里出发" value={start} options={["/srv/library", "/home/deploy"].map((value) => ({ value, label: value }))} onChange={setStart} />}
      scene={(index) => {
        const here = at(index);
        const exists = TREE.includes(here);
        return (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-1 font-mono text-xs">
              {TREE.map((path) => {
                const depth = path === "/" ? 0 : path.split("/").length - 1;
                return (
                  <div
                    key={path}
                    style={{ paddingLeft: `${depth * 0.9}rem` }}
                    className={cn("rounded px-1 py-0.5 motion-safe:transition-colors", path === here && "bg-primary/15 font-semibold text-primary", path === start && path !== here && "text-muted-foreground underline")}
                  >
                    {path === "/" ? "/" : `${path.slice(path.lastIndexOf("/") + 1)}/`}
                  </div>
                );
              })}
              {!exists && <div className="rounded bg-destructive/10 px-1 py-0.5 text-destructive">{here}（不存在）</div>}
            </div>
            <div className="space-y-2">
              <Chip>{index === 4 ? "/srv/shared/uploads" : "../shared/uploads"}</Chip>
              <p className="font-mono text-xs">现在在：{here}</p>
              {index === 3 && <Chip tone={exists ? "success" : "danger"}>{exists ? "找到了" : "这个目录不存在"}</Chip>}
            </div>
          </div>
        );
      }}
      rows={mapping(
        ["大门", "根目录 /", "所有路径的起点"],
        ["你站的房间", "当前目录（pwd）", "相对路径的起点"],
        ["“上一层”", "..", "当前目录的上一级"],
        ["自己的办公室", "家目录 ~", "每个用户不一样"],
      )}
      insight="相对路径的意思取决于当前目录，~ 的意思取决于当前用户。脚本会在别的目录、被别的用户运行，所以脚本里要写绝对路径。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch3 · mv and cp overwrite without asking
// ---------------------------------------------------------------------------

export function MoveConcept() {
  const [command, setCommand] = React.useState<"mv" | "cp" | "mv -n">("mv");
  const steps: ConceptStep[] = [
    { title: "两个房间，两份同名文件", description: "inbox/old 里有去年的 report.pdf，docs 里已经有今年的 report.pdf。" },
    { title: `运行 ${command} old/report.pdf docs/`, description: "目标是一个目录，所以文件会放进去，名字不变：docs/report.pdf。" },
    { title: "名字撞上了", description: "docs 里已经有一个 report.pdf。命令不会停下来问你。" },
    {
      title: command === "mv -n" ? "-n：不覆盖" : "直接覆盖",
      description:
        command === "mv -n" ? "加了 -n，遇到同名就跳过：两份都还在，旧的留在 old 里。" : command === "cp" ? "cp 复印一份放过去，覆盖了今年的报告；去年的原件还留在 old 里。" : "mv 把去年的报告挪过去，今年的那份被覆盖、找不回来了。",
    },
  ];
  const overwritten = command !== "mv -n";
  return (
    <Concept
      id="move"
      title="mv 和 cp 遇到同名文件"
      analogy="把一份文件放进同事的文件盒，盒里正好有一份同名的：mv 和 cp 会直接把原来那份扔掉，不会先问一句。"
      steps={steps}
      controls={<Segmented label="命令" value={command} options={(["mv", "cp", "mv -n"] as const).map((value) => ({ value, label: value }))} onChange={setCommand} />}
      scene={(index) => {
        const done = index >= 3;
        const oldHas = !done || command !== "mv";
        const docs = done ? (overwritten ? ["report.pdf（2025）"] : ["report.pdf（2026）"]) : ["report.pdf（2026）"];
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] sm:items-center">
            <Node title="inbox/old/" active={index === 1}>
              {oldHas ? <Row cells={["report.pdf（2025）"]} tone={index >= 1 && !done ? "primary" : undefined} /> : <Row cells={["（空）"]} tone="muted" />}
            </Node>
            <div className="text-center font-mono text-xs text-muted-foreground">{index >= 1 ? `${command} →` : ""}</div>
            <Node title="docs/" tone={done && overwritten ? "danger" : done ? "success" : "default"} active={index === 2}>
              <div className="space-y-1">
                {docs.map((name) => (
                  <Row key={name} cells={[name]} tone={index === 2 ? "danger" : done && overwritten ? "danger" : undefined} />
                ))}
                {done && overwritten && <p className="text-[11px] text-destructive">2026 年的报告被覆盖了</p>}
              </div>
            </Node>
          </div>
        );
      }}
      rows={mapping(
        ["文件盒", "目录", "里面的名字不能重复"],
        ["挪过去", "mv（移动或改名）", "原处不再有"],
        ["复印一份过去", "cp", "原件还在"],
        ["先看看盒子里有没有同名的", "ls，或者 mv -n / cp -n", "命令本身不会问"],
      )}
      insight="mv 和 cp 遇到同名文件会直接覆盖，rm 删掉的文件也没有回收站。动手之前先 ls 看一眼，需要保留两份时就换个名字。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · grep keeps the lines that contain the text
// ---------------------------------------------------------------------------

const GREP_LINES = [
  '203.0.113.7 [00:01:01] "GET /api/ping" 200 500',
  '192.0.2.12 [01:15:20] "GET /books/500" 200 4210',
  '198.51.100.23 [06:12:44] "GET /books" 200 6532',
  '203.0.113.7 [07:42:13] "POST /api/loans" 500 187',
  '192.0.2.8 [07:43:59] "POST /api/loans" 500 187',
];

export function GrepConcept() {
  const [pattern, setPattern] = React.useState<"500" | '" 500 '>("500");
  const steps: ConceptStep[] = [
    { title: "一行一行地读", description: "grep 不懂日志的格式，它只把每一行当作一串字。" },
    { title: "看这一行里有没有这串字", description: `要找的是 ${pattern === "500" ? "500" : '" 500 （引号、空格、500、空格）'}。字出现在哪儿都算。` },
    { title: "留下包含它的行", description: "包含的行原样输出，不包含的丢掉。" },
    { title: "看看留下了什么", description: pattern === "500" ? "响应大小是 500 字节的、书号是 500 的也被留下了：它们根本不是错误。" : "前面加上引号和空格，就只剩状态码那一栏是 500 的行。" },
  ];
  return (
    <Concept
      id="grep"
      title="grep 是怎么筛选的"
      analogy="在一叠来访登记单里找“500”：只要单子上出现这三个数字就抽出来，不管它写在“房间号”还是“人数”那一栏。"
      steps={steps}
      controls={<Segmented label="要找的文字" value={pattern} options={[{ value: "500" as const, label: "500" }, { value: '" 500 ' as const, label: '" 500 ' }]} onChange={setPattern} />}
      scene={(index) => (
        <div className="space-y-1">
          {GREP_LINES.map((line, row) => {
            const hit = line.includes(pattern);
            const real = line.includes('" 500 ');
            const tone = index === 0 ? undefined : index === 1 ? (hit ? "primary" : undefined) : hit ? (index === 3 && !real ? "danger" : "success") : "muted";
            return (
              <Row
                key={row}
                tone={tone}
                cells={[
                  line,
                  index >= 3 && hit ? <span key="tag" className="font-sans text-[11px]">{real ? "真的出错" : "误中"}</span> : null,
                ]}
              />
            );
          })}
          {index >= 3 && <p className="text-xs">留下 {GREP_LINES.filter((line) => line.includes(pattern)).length} 行，其中真正状态码为 500 的有 2 行。</p>}
        </div>
      )}
      rows={mapping(
        ["一叠登记单", "日志文件，每行一条记录", ""],
        ["只看有没有这几个字", "grep 按文字匹配", "不认识“列”"],
        ["把要找的写得更具体", "加上前后的引号和空格", "缩小误中"],
      )}
      insight="grep 只认文字不认含义。要找的文字写得越具体（带上它前后的符号），误中越少。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch5 · a pipeline stage by stage
// ---------------------------------------------------------------------------

const RAW = ["203.0.113.7", "198.51.100.23", "203.0.113.7", "192.0.2.140", "198.51.100.23", "203.0.113.7", "192.0.2.140", "203.0.113.7"];

function uniqCount(rows: string[]): string[] {
  const out: { row: string; count: number }[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.row === row) last.count += 1;
    else out.push({ row, count: 1 });
  }
  return out.map((item) => `${String(item.count).padStart(3)} ${item.row}`);
}

export function PipeConcept() {
  const [sorted, setSorted] = React.useState<"yes" | "no">("yes");
  const stages = sorted === "yes" ? ["cut -d ' ' -f 1", "sort", "uniq -c", "sort -rn", "head -n 3"] : ["cut -d ' ' -f 1", "uniq -c", "sort -rn", "head -n 3"];
  const outputs: string[][] = [];
  let current = RAW;
  for (const stage of stages) {
    if (stage === "sort") current = [...current].sort();
    else if (stage === "uniq -c") current = uniqCount(current);
    else if (stage === "sort -rn") current = [...current].sort((a, b) => parseInt(b, 10) - parseInt(a, 10) || (a < b ? -1 : 1));
    else if (stage === "head -n 3") current = current.slice(0, 3);
    outputs.push(current);
  }
  const steps: ConceptStep[] = stages.map((stage, index) => ({
    title: stage,
    description:
      [
        "从每行里只取第一列（IP），其余扔掉。",
        sorted === "yes" ? "排序：相同的 IP 被排到了一起。" : "没有排序，直接数：uniq -c 只会合并挨在一起的相同行。",
        sorted === "yes" ? "数一数每组挨在一起的有几行。" : "按次数从大到小排。",
        sorted === "yes" ? "按次数从大到小排（-n 按数字，-r 倒序）。" : "取前三行：次数全错了，203.0.113.7 被拆成了好几段。",
        "只要前三行。",
      ][index] ?? "",
  }));
  return (
    <Concept
      id="pipe"
      title="一条管道，一段一段看"
      analogy="办公楼里的流水线：第一位同事把登记单上的姓名剪下来，第二位按字母排好，第三位数一数每个名字有几张，第四位按张数排序，第五位只把前三名交给你。每人只做一件事，用传送带连起来。"
      steps={steps}
      controls={<Segmented label="先排序再计数" value={sorted} options={[{ value: "yes" as const, label: "先 sort" }, { value: "no" as const, label: "不排序" }]} onChange={setSorted} />}
      scene={(index) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">进入这一段的（{index === 0 ? "access.log 的前 8 行，只显示 IP" : stages[index - 1]}）</p>
            <Term>{(index === 0 ? RAW : outputs[index - 1]!).join("\n")}</Term>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              经过 <code>{stages[index]}</code> 之后
            </p>
            <Term className={cn(index === stages.length - 1 && (sorted === "yes" ? "ring-2 ring-success/60" : "ring-2 ring-destructive/60"))}>{outputs[index]!.join("\n")}</Term>
          </div>
        </div>
      )}
      rows={mapping(
        ["一位只做一件事的同事", "一个命令", "cut、sort、uniq 各管一件"],
        ["传送带", "管道 |", "前一个的输出是后一个的输入"],
        ["把结果放进文件盒", "> 覆盖写入，>> 追加到末尾", "> 会先清空原文件"],
      )}
      insight="管道让每个小命令只做一件事。uniq -c 只合并相邻的相同行，所以前面一定要先 sort。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · how the system decides r, w, x
// ---------------------------------------------------------------------------

const PERM_PATH = [
  { path: "/srv", mode: "rwxr-xr-x", owner: "root", group: "root" },
  { path: "/srv/library", mode: "rwxr-xr-x", owner: "ops", group: "web" },
  { path: "/srv/library/config", mode: "rwxr-x---", owner: "ops", group: "web" },
  { path: "/srv/library/config/db.env", mode: "rw-r-----", owner: "ops", group: "web" },
];
const WHO = { ops: { groups: ["ops", "web"] }, "www-data": { groups: ["www-data", "web"] }, guest: { groups: ["guest"] } } as const;

export function PermsConcept() {
  const [user, setUser] = React.useState<keyof typeof WHO>("www-data");
  const triplet = (row: (typeof PERM_PATH)[number]) => (row.owner === user ? 0 : (WHO[user].groups as readonly string[]).includes(row.group) ? 1 : 2);
  const bits = (row: (typeof PERM_PATH)[number]) => row.mode.slice(triplet(row) * 3, triplet(row) * 3 + 3);
  const blocked = PERM_PATH.slice(0, -1).find((row) => !bits(row).includes("x"));
  const file = PERM_PATH[PERM_PATH.length - 1]!;
  const canRead = !blocked && bits(file).includes("r");
  const steps: ConceptStep[] = [
    { title: `${user} 想读 db.env`, description: "每个文件都写着主人、所属组和三组 rwx：给主人的、给组里成员的、给其他所有人的。" },
    { title: "一路上的每层目录都要有 x", description: "进入一个目录需要它的 x 权限。路上任何一层没有 x，就到不了里面的文件。" },
    { title: "你算哪一种人？", description: "是主人就看第一组；不是主人但在所属组里就看第二组；都不是就看第三组。只看一组。" },
    { title: "看那一组里有没有 r", description: canRead ? "有 r，可以读。" : blocked ? `在 ${blocked.path} 就被挡住了。` : "这一组里没有 r，读不了。" },
  ];
  return (
    <Concept
      id="perms"
      title="系统怎么判断你能不能读一个文件"
      analogy="办公楼的门禁：每扇门上贴着三条规则：给房间主人的、给本部门同事的、给其他所有人的。要进到最里面的房间，路过的每一道门都得刷得开。"
      steps={steps}
      controls={<Segmented label="谁在读" value={user} options={(Object.keys(WHO) as (keyof typeof WHO)[]).map((value) => ({ value, label: value }))} onChange={setUser} />}
      scene={(index) => (
        <div className="space-y-3">
          <p className="text-xs">
            <code>{user}</code> 所在的组：{WHO[user].groups.join("、")}
          </p>
          <div className="space-y-1">
            {PERM_PATH.map((row, position) => {
              const isFile = position === PERM_PATH.length - 1;
              const pick = triplet(row);
              const mine = bits(row);
              const ok = isFile ? mine.includes("r") : mine.includes("x");
              const reached = !blocked || PERM_PATH.indexOf(blocked) >= position;
              const show = (index === 1 && !isFile) || index >= 2;
              return (
                <Row
                  key={row.path}
                  tone={!show || !reached ? (reached ? undefined : "muted") : ok ? "success" : "danger"}
                  cells={[
                    <span key="mode">
                      {row.mode.split("").map((char, at) => (
                        <span key={at} className={cn(index >= 2 && Math.floor(at / 3) === pick && "rounded-sm bg-primary/20 font-semibold")}>
                          {char}
                        </span>
                      ))}
                    </span>,
                    `${row.owner} ${row.group}`,
                    row.path,
                    show && reached ? <span key="v" className="font-sans text-[11px]">{isFile ? (ok ? "有 r" : "没有 r") : ok ? "有 x，进得去" : "没有 x，进不去"}</span> : null,
                  ]}
                />
              );
            })}
          </div>
          {index >= 3 && <Chip tone={canRead ? "success" : "danger"}>{canRead ? `${user} 能读 db.env` : `${user} 读不到 db.env`}</Chip>}
        </div>
      )}
      rows={mapping(
        ["门上的三条规则", "rwx 三组：主人 / 组 / 其他人", "只按你的身份看其中一组"],
        ["本部门同事", "所属组的成员", "id 能看到自己在哪些组"],
        ["刷开一道门", "目录的 x 权限", "没有 x 就到不了里面"],
        ["数字写法", "r=4 w=2 x=1，每组相加", "640 = rw- r-- ---"],
      )}
      insight="权限按“主人、组、其他人”只看一组，而且路上每层目录都要有 x。开够即可，777 等于把所有门都敞开。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch7 · TERM and KILL
// ---------------------------------------------------------------------------

export function SignalConcept() {
  const [signal, setSignal] = React.useState<"TERM" | "KILL">("TERM");
  const steps: ConceptStep[] = [
    { title: "进程在干活", description: "812 号进程占着 80 端口，手里还有两份上传到一半的文件。" },
    { title: `kill ${signal === "TERM" ? "" : "-9 "}812`, description: signal === "TERM" ? "默认发送 TERM：请你收尾，然后退出。" : "-9 是 KILL：不通知进程，系统直接把它拿掉。" },
    { title: signal === "TERM" ? "进程收尾" : "立刻消失", description: signal === "TERM" ? "进程把两份文件写完、关掉，再退出。" : "进程来不及做任何事，两份文件停在一半。" },
    { title: "端口空出来", description: "进程一结束，80 端口就释放了，新的网站进程可以接手。" },
  ];
  return (
    <Concept
      id="signal"
      title="kill 发出的两种信号"
      analogy="让一位同事下班：TERM 是递张纸条“手头的事做完就走吧”；KILL 是保安直接把人请出大楼，桌上写到一半的文件就那么摊着。"
      steps={steps}
      controls={<Segmented label="信号" value={signal} options={[{ value: "TERM" as const, label: "kill 812（TERM）" }, { value: "KILL" as const, label: "kill -9 812（KILL）" }]} onChange={setSignal} />}
      scene={(index) => {
        const gone = index >= 2 && (signal === "KILL" || index >= 3);
        const progress = index >= 2 && signal === "TERM" ? 100 : 55;
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Node title="进程 812 · library-web" subtitle="监听 0.0.0.0:80" tone={gone ? (signal === "KILL" ? "danger" : "success") : "default"} active={index === 1}>
              {gone ? <p className="text-muted-foreground">已结束</p> : <p>{index === 1 ? `收到 ${signal}` : "正在处理请求"}</p>}
            </Node>
            <div className="space-y-2">
              {["scan-0091.pdf", "scan-0092.pdf"].map((name) => (
                <div key={name} className="space-y-1">
                  <p className="font-mono text-xs">
                    {name}
                    {progress < 100 && index >= 2 ? ".part" : ""}
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full motion-safe:transition-all motion-safe:duration-700", progress === 100 ? "bg-success" : index >= 2 ? "bg-destructive" : "bg-primary")} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ))}
              {index >= 3 && <Chip tone={signal === "TERM" ? "success" : "danger"}>{signal === "TERM" ? "两份文件完整保存，80 端口已释放" : "80 端口已释放，但两份文件只写了一半"}</Chip>}
            </div>
          </div>
        );
      }}
      rows={mapping(
        ["员工", "进程，有自己的编号（PID）", "ps aux 能看到所有进程"],
        ["纸条：做完就走", "TERM（kill 默认发的）", "进程可以收尾"],
        ["保安请出大楼", "KILL（kill -9）", "进程来不及收尾"],
        ["员工占着的会议室", "进程监听的端口", "ss -ltnp 查谁占着"],
      )}
      insight="结束进程先用默认的 kill（TERM），给它收尾的机会；它不理你，才用 kill -9。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch8 · PATH lookup order
// ---------------------------------------------------------------------------

export function PathLookupConcept() {
  const [order, setOrder] = React.useState<"front" | "back">("back");
  const dirs = order === "front" ? ["/opt/node20/bin", "/usr/local/bin", "/usr/bin", "/bin"] : ["/usr/local/bin", "/usr/bin", "/bin", "/opt/node20/bin"];
  const has = (dir: string) => dir === "/usr/bin" || dir === "/opt/node20/bin";
  const winner = dirs.findIndex(has);
  const steps: ConceptStep[] = [
    { title: "PATH 是一串目录", description: `echo $PATH 显示：${dirs.join(":")}。冒号把它们隔开。` },
    { title: "从左往右找 node", description: "shell 依次在每个目录里找名叫 node 的程序。" },
    { title: "找到第一个就停", description: `在 ${dirs[winner]} 里找到了，后面的目录不再看。` },
    { title: "运行的是哪个版本", description: dirs[winner] === "/usr/bin" ? "运行的是 /usr/bin/node，旧的 v12。新版放在最后，永远轮不到。" : "运行的是 /opt/node20/bin/node，新的 v20。" },
  ];
  return (
    <Concept
      id="path-lookup"
      title="shell 按 PATH 找程序"
      analogy="前台的楼层索引：前台按索引上的顺序一层一层找同名的同事，在哪一层先找到就找那一位。两层都有叫“node”的人时，排在前面的那层赢。"
      steps={steps}
      controls={<Segmented label="新目录放在" value={order} options={[{ value: "back" as const, label: "PATH 末尾" }, { value: "front" as const, label: "PATH 开头" }]} onChange={setOrder} />}
      scene={(index) => (
        <div className="space-y-2">
          <Term>PATH={dirs.join(":")}</Term>
          {index >= 1 &&
            dirs.map((dir, position) => (
              <Row
                key={dir}
                tone={position < winner || index === 1 ? (position < winner ? "muted" : undefined) : position === winner ? "success" : "muted"}
                cells={[`${dir}/node`, <span key="n" className="font-sans text-[11px]">{has(dir) ? (dir === "/usr/bin" ? "有（v12）" : "有（v20）") : "没有"}{index >= 2 && position > winner ? " · 不再查看" : ""}</span>]}
              />
            ))}
          {index >= 3 && <Chip tone={dirs[winner] === "/usr/bin" ? "danger" : "success"}>node --version → {dirs[winner] === "/usr/bin" ? "v12.22.12" : "v20.18.0"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["楼层索引", "PATH 环境变量", "只对当前这次登录有效"],
        ["索引上的顺序", "PATH 里目录的先后", "先找到的赢"],
        ["把索引印在入职手册里", "写进 ~/.bashrc", "每次登录自动生效"],
      )}
      insight="同名程序在多个目录里都有时，PATH 里排在前面的赢。export 只影响这次登录，要长期生效就写进 ~/.bashrc。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch9 · deleting a file that is still open
// ---------------------------------------------------------------------------

export function UnlinkConcept() {
  const [how, setHow] = React.useState<"rm" | "truncate">("rm");
  const steps: ConceptStep[] =
    how === "rm"
      ? [
          { title: "文件 = 名字 + 内容", description: "目录里存的只是名字，名字指向磁盘上的内容。网站进程正开着这个文件，往里写日志。" },
          { title: "rm debug.log", description: "rm 删掉的是名字。ls 看不到它了，du 也不再算它。" },
          { title: "空间还没回来", description: "进程手里还握着内容。只要还有人打开着，系统就不会回收这块空间：df 还是 100%。" },
          { title: "重启进程", description: "进程关掉文件（重启或退出）的那一刻，内容才真正被回收，df 降下来。" },
        ]
      : [
          { title: "文件 = 名字 + 内容", description: "目录里存的只是名字，名字指向磁盘上的内容。网站进程正开着这个文件，往里写日志。" },
          { title: "truncate -s 0 debug.log", description: "不删名字，直接把内容清空。名字还在，进程还能接着往里写。" },
          { title: "空间立刻回来", description: "内容没了，空间马上释放：df 降下来，网站也不用重启。" },
          { title: "以后呢", description: "日志还会继续长。根本的办法是调低日志级别、配置日志轮转。" },
        ];
  return (
    <Concept
      id="unlink"
      title="删掉一个还开着的文件"
      analogy="档案室的抽屉：门上的标签是文件名，抽屉里的纸是内容。撕掉标签（rm），只要还有同事正拉着抽屉在写，抽屉就腾不出来；直接把纸清走（清空文件），抽屉马上空了。"
      steps={steps}
      controls={<Segmented label="怎么处理" value={how} options={[{ value: "rm" as const, label: "rm 删除" }, { value: "truncate" as const, label: "清空内容" }]} onChange={setHow} />}
      scene={(index) => {
        const nameGone = how === "rm" && index >= 1;
        const freed = how === "rm" ? index >= 3 : index >= 2;
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Node title="目录里的名字" tone={nameGone ? "danger" : "default"}>
              <p className={cn("font-mono", nameGone && "line-through text-muted-foreground")}>debug.log</p>
            </Node>
            <Node title="磁盘上的内容" tone={freed ? "success" : "default"}>
              <p className="font-mono">{freed ? (how === "rm" ? "已回收" : "0 字节") : "15.2 GB"}</p>
            </Node>
            <Node title="网站进程" active={index === (how === "rm" ? 3 : 0)}>
              <p>{how === "rm" && index >= 3 ? "已重启，打开了新的 debug.log" : "开着这个文件"}</p>
            </Node>
            <div className="sm:col-span-3">
              <Chip tone={freed ? "success" : "danger"}>df：{freed ? "24%" : "100%"}</Chip>
            </div>
          </div>
        );
      }}
      rows={mapping(
        ["抽屉上的标签", "目录里的文件名", "rm 删的是它"],
        ["抽屉里的纸", "文件内容占的磁盘空间", "没人用了才回收"],
        ["还拉着抽屉的同事", "打开着文件的进程", "重启后才放手"],
      )}
      insight="rm 删的是名字。还有进程开着这个文件时，空间要等进程放手才释放；清空内容则立刻见效。"
    />
  );
}
