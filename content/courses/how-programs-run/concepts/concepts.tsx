"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import { Chip, Node, Segmented } from "@/components/education/scene-kit";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

const PREFIX = "how-programs-run/";
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

function Code({ lines, active }: { lines: string[]; active?: number }) {
  return (
    <ol className="m-0 list-none rounded-lg bg-slate-950 p-2 font-mono text-xs leading-relaxed text-slate-100">
      {lines.map((line, index) => (
        <li key={index} className={cn("whitespace-pre rounded px-1 motion-safe:transition-colors", index === active && "bg-sky-500/25 ring-1 ring-sky-400/60")}>
          {line}
        </li>
      ))}
    </ol>
  );
}

function Cells({ cells, highlight = [], danger = [], start = 0, labels = {} }: { cells: (number | string)[]; highlight?: number[]; danger?: number[]; start?: number; labels?: Record<number, string> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {cells.map((value, index) => {
        const addr = start + index;
        return (
          <div
            key={addr}
            className={cn(
              "flex w-12 flex-col items-center rounded-md border px-1 py-1 font-mono motion-safe:transition-colors",
              highlight.includes(addr) ? "border-primary bg-primary/10" : "border-border",
              danger.includes(addr) && "border-destructive bg-destructive/10",
            )}
          >
            <span className="text-[9px] text-muted-foreground">[{addr}]</span>
            <span className="text-xs">{value}</span>
            {labels[addr] && <span className="text-[9px] text-muted-foreground">{labels[addr]}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch1 · CPU, memory, storage
// ---------------------------------------------------------------------------

export function PartsConcept() {
  const steps: ConceptStep[] = [
    { title: "程序平时躺在硬盘里", description: "关机也不会丢，但离 CPU 很远：读一次要几毫秒，对 CPU 来说是很久很久。" },
    { title: "打开程序：搬进内存", description: "操作系统把程序和它要用的数据从硬盘搬到内存里。内存快得多，但一断电就清空。" },
    { title: "CPU 一条一条地执行", description: "CPU 从内存里取一条指令，做完，再取下一条。正在算的数放在 CPU 里的寄存器上，那里最快。" },
    { title: "结果写回去", description: "算好的结果写回内存；要保存成文件，再由操作系统写回硬盘。" },
  ];
  return (
    <Concept
      id="parts"
      title="CPU、内存与硬盘"
      analogy="一间厨房：菜谱和食材平时放在楼下的仓库（硬盘）；要做菜了，先搬到厨房的储物架上（内存）；厨师（CPU）照着菜谱一步一步做，手边的砧板（寄存器）上只放正在切的那几样。"
      steps={steps}
      scene={(step) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Node title="CPU" subtitle="寄存器 R0～R3 · 约 1 纳秒" active={step === 2}>
            <p>{step >= 2 ? "正在执行：ADD R0, R1" : "等待中"}</p>
          </Node>
          <Node title="内存" subtitle="约 100 纳秒 · 断电清空" active={step === 1 || step === 3}>
            <p>{step >= 1 ? (step === 3 ? "程序 + 数据 + 结果" : "程序 + 数据") : "（空）"}</p>
          </Node>
          <Node title="硬盘" subtitle="约 1 毫秒 · 断电不丢" active={step === 0}>
            <p>结账程序.exe、订单数据</p>
          </Node>
          <div className="sm:col-span-3">
            <Chip tone={step === 2 ? "success" : "default"}>{["程序在硬盘里", "硬盘 → 内存", "内存 ⇄ CPU：一条一条执行", "CPU → 内存（→ 硬盘）"][step]}</Chip>
          </div>
        </div>
      )}
      rows={mapping(
        ["厨师", "CPU", "一次只做一步"],
        ["砧板", "寄存器", "最快，但只有几格"],
        ["储物架", "内存", "放正在用的程序和数据"],
        ["楼下仓库", "硬盘 / SSD", "存得多、存得久，但慢"],
      )}
      insight="越靠近 CPU 越快、越小、越贵。程序要先搬进内存才能运行，CPU 只和寄存器、内存直接打交道。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch2 · fetch, decode, execute
// ---------------------------------------------------------------------------

const CYCLE_CODE = ["LOAD R0, [10]", "ADD R0, 5", "STORE R0, [20]", "HALT"];

export function CycleConcept() {
  const steps: ConceptStep[] = [
    { title: "取指：PC 指着第 0 条", description: "程序计数器 PC 记着下一条要执行的指令在哪。CPU 把它取进来：LOAD R0, [10]。" },
    { title: "译码 + 执行：LOAD", description: "看懂这是“从内存读到寄存器”，于是把 [10] 里的 8 放进 R0。PC 加 1。" },
    { title: "下一条：ADD R0, 5", description: "R0 变成 13。注意：内存里的 [10] 还是 8，什么都没变。" },
    { title: "STORE R0, [20]", description: "把 R0 的值写进内存 [20]。只有这一步，结果才真正落到内存里。" },
    { title: "HALT", description: "停下。这四步每一步都是同一个循环：取指、译码、执行，PC 前进。" },
  ];
  const r0 = [0, 8, 13, 13, 13];
  const m20 = [0, 0, 0, 13, 13];
  const pc = [0, 1, 2, 3, 4];
  return (
    <Concept
      id="cycle"
      title="一条指令是怎么执行的"
      analogy="厨师照着菜谱做菜：手指按在当前这一步（PC），读一遍（取指），弄明白要切还是要炒（译码），动手做（执行），手指挪到下一步。"
      steps={steps}
      scene={(step) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Code lines={CYCLE_CODE} active={Math.min(pc[step]!, 3)} />
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1 font-mono text-xs">
              <div className={cn("rounded-md border px-2 py-1", step === 1 || step === 2 ? "border-success bg-success/10" : "border-border")}>R0 = {r0[step]}</div>
              <div className="rounded-md border border-border px-2 py-1">PC = {pc[step]}</div>
            </div>
            <Cells start={10} cells={[8]} highlight={step === 1 ? [10] : []} labels={{ 10: "单价" }} />
            <Cells start={20} cells={[m20[step]!]} highlight={step === 3 ? [20] : []} labels={{ 20: "结果" }} />
          </div>
        </div>
      )}
      rows={mapping(
        ["手指按着的那一步", "程序计数器 PC", "下一条指令的位置"],
        ["读懂这一步", "译码", "弄清是哪种指令、用哪些格子"],
        ["动手做", "执行", "改寄存器、读写内存或者跳转"],
        ["把菜端上桌", "STORE", "结果写回内存"],
      )}
      insight="CPU 一直在重复同一件事：按 PC 取一条指令，执行它，PC 前进。寄存器里的值变了，内存不会自动跟着变，要 STORE 才会写进去。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch3 · compare and jump
// ---------------------------------------------------------------------------

export function JumpConcept() {
  const [n, setN] = React.useState<"3" | "0">("3");
  const limit = Number(n);
  const rows: { i: number; sum: number; jump: boolean }[] = [];
  let sum = 0;
  for (let i = 1; i <= Math.max(limit, 0) + 1 && rows.length < 5; i += 1) {
    const jump = limit < i;
    rows.push({ i, sum, jump });
    if (jump) break;
    sum += i;
  }
  const steps: ConceptStep[] = [
    { title: "循环就是往回跳", description: "机器里没有“循环”这种指令，只有比较和跳转：比较一下，条件成立就跳回前面。" },
    { title: "先判断，再做", description: "CMP R0, R1 比较 N 和 i，结果记在标志位里。JLT done：N < i 就跳出循环。" },
    { title: "一圈一圈地走", description: `N = ${limit} 时，下面每一行是一圈开始时的样子。` },
    { title: "边界最容易错", description: limit === 0 ? "N = 0：第一次判断就跳出去了，一个数都没加，结果是 0。先判断再做，才能处理这种情况。" : "最后一圈 i = N 也要加进去：条件写成“i < N 才继续”就会少加最后一个数。" },
  ];
  return (
    <Concept
      id="jump"
      title="比较、跳转与循环"
      analogy="菜谱上写着：“尝一下，不够咸就回到第 3 步再加盐。”厨师每次走到这一步都要判断一次，判断的条件写错一点，就会多加一次或者少加一次。"
      steps={steps}
      controls={<Segmented label="N" value={n} options={[{ value: "3" as const, label: "N = 3" }, { value: "0" as const, label: "N = 0" }]} onChange={setN} />}
      scene={(step) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Code lines={["loop: CMP R0, R1   ; 比较 N 和 i", "      JLT done      ; N < i 就结束", "      ADD R2, R1    ; sum += i", "      ADD R1, 1     ; i += 1", "      JMP loop      ; 回到开头", "done: STORE R2, [20]"]} active={step === 1 ? 1 : step === 0 ? 4 : undefined} />
          <div className="space-y-1">
            {step >= 2 &&
              rows.map((row) => (
                <div key={row.i} className={cn("flex items-center justify-between rounded-md border px-2 py-1 font-mono text-xs", row.jump ? "border-success bg-success/10" : "border-border")}>
                  <span>i = {row.i}, sum = {row.sum}</span>
                  <span className="font-sans text-[11px]">{row.jump ? `N < i：跳出，结果 ${row.sum}` : "继续"}</span>
                </div>
              ))}
            {step === 3 && <Chip tone="success">结果：{rows[rows.length - 1]!.sum}</Chip>}
          </div>
        </div>
      )}
      rows={mapping(
        ["尝一下", "CMP", "比较两个数，结果放在标志位里"],
        ["不够咸就回去", "JLT / JGE / JZ / JNZ", "按标志位决定跳不跳"],
        ["“回到第 3 步”", "JMP 标签", "无条件跳转"],
        ["多加或少加一次", "差一错误（off-by-one）", "最常见的循环 bug"],
      )}
      insight="循环 = 比较 + 条件跳转。写循环时，专门想一想第一圈、最后一圈和一圈都不该走的情况。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · addresses and arrays
// ---------------------------------------------------------------------------

export function MemoryConcept() {
  const [bound, setBound] = React.useState<"35" | "36">("36");
  const steps: ConceptStep[] = [
    { title: "数组就是一排挨着的格子", description: "5 个成绩放在 [30]～[34]。紧挨着的 [35] 放的是别的东西：人数。" },
    { title: "用寄存器当“指针”", description: "R1 = 30 指向第一个成绩。LOAD R0, [R1] 读它指着的那一格，R1 加 1 就指向下一格。" },
    { title: `循环条件：R1 < ${bound}`, description: bound === "35" ? "R1 走到 35 就停：正好处理完 [30]～[34]。" : "R1 走到 35 时还会再进一次循环：把 [35] 当成第 6 个成绩加了 10 分。" },
    { title: "结果", description: bound === "35" ? "旁边的人数完好无损。" : "人数从 5 变成了 15。机器不知道哪几格属于数组，越界写入不会报错，只会悄悄写坏旁边的数据。" },
  ];
  const overflow = bound === "36";
  return (
    <Concept
      id="memory"
      title="地址、数组与越界"
      analogy="储物架上一排格子：前五格放五个人的成绩，第六格放着“全班几个人”的便签。挨个往成绩上加分时多走了一格，便签上的数字也被改了。"
      steps={steps}
      controls={<Segmented label="循环条件" value={bound} options={[{ value: "35" as const, label: "R1 < 35" }, { value: "36" as const, label: "R1 < 36" }]} onChange={setBound} />}
      scene={(step) => {
        const after = step >= 3;
        const cells = [62, 75, 58, 90, 81].map((score) => (after ? score + 10 : score));
        const count = after && overflow ? 15 : 5;
        return (
          <div className="space-y-2">
            <Cells start={30} cells={[...cells, count]} labels={{ 30: "成绩", 35: "人数" }} highlight={step === 1 ? [30] : step === 2 ? [30, 31, 32, 33, 34] : []} danger={step >= 2 && overflow ? [35] : []} />
            {step >= 1 && <p className="font-mono text-xs">R1 = {step === 1 ? 30 : step === 2 ? (overflow ? "30 → 35" : "30 → 34") : overflow ? 36 : 35}</p>}
            {step === 3 && <Chip tone={overflow ? "danger" : "success"}>{overflow ? "[35] 被写坏：人数变成 15" : "只动了 [30]～[34]"}</Chip>}
          </div>
        );
      }}
      rows={mapping(
        ["储物架上的格子编号", "内存地址", "每格一个编号"],
        ["一排挨着的格子", "数组", "第 i 个在 起点 + i"],
        ["指着某一格的手指", "指针（这里是 R1）", "存的是地址，不是值"],
        ["多走了一格", "越界写入（缓冲区溢出）", "不会报错，会写坏别的数据"],
      )}
      insight="内存只是一排编了号的格子，数组的边界只存在于程序员的脑子里。循环的终止条件差一，就会写到不属于它的格子上。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch5 · the call stack
// ---------------------------------------------------------------------------

export function StackConcept() {
  const [balanced, setBalanced] = React.useState<"yes" | "no">("no");
  const steps: ConceptStep[] = [
    { title: "CALL double", description: "跳去函数之前，先把“回来后接着执行哪一条”（返回地址 2）压进栈。" },
    { title: "PUSH R1", description: "函数要用 R1，先把原来的值 4 压进栈保存起来。" },
    { title: balanced === "yes" ? "POP R1" : "（忘了 POP）", description: balanced === "yes" ? "用完了，把 4 弹出来还给 R1。栈顶又是返回地址了。" : "直接走到了 RET，栈顶放的还是 R1 的旧值 4。" },
    { title: "RET", description: balanced === "yes" ? "弹出栈顶的 2，回到 CALL 的下一条。栈空了，一切如初。" : "RET 把栈顶的 4 当成返回地址，跳到了第 4 条指令：程序跑飞了。" },
  ];
  const stack = (step: number): string[] => {
    if (step === 0) return ["返回地址 2"];
    if (step === 1) return ["返回地址 2", "R1 的旧值 4"];
    if (step === 2) return balanced === "yes" ? ["返回地址 2"] : ["返回地址 2", "R1 的旧值 4"];
    return balanced === "yes" ? [] : ["返回地址 2"];
  };
  return (
    <Concept
      id="stack"
      title="函数调用与栈"
      analogy="一摞盘子：只能从最上面放、从最上面拿。出门办事前在最上面放一张“回来后接着做第几步”的纸条；中途又压了一张别的，就得先把它拿走，才能拿到那张纸条。"
      steps={steps}
      controls={<Segmented label="函数里" value={balanced} options={[{ value: "no" as const, label: "PUSH 后没有 POP" }, { value: "yes" as const, label: "PUSH 和 POP 配对" }]} onChange={setBalanced} />}
      scene={(step) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Code lines={["0  SET R1, 4", "1  CALL double", "2  OUT R0", "3  SET R1, 7", "4  CALL double", "…", "double: PUSH R1", "        MOV R0, R1", "        ADD R0, R1", ...(balanced === "yes" ? ["        POP R1"] : []), "        RET"]} active={step === 0 ? 1 : step === 1 ? 6 : step === 2 ? (balanced === "yes" ? 9 : undefined) : balanced === "yes" ? 10 : 9} />
          <div className="space-y-1">
            <p className="text-xs font-semibold">栈（上面是栈顶）</p>
            <div className="flex min-h-24 flex-col-reverse gap-1 rounded-lg border border-dashed border-border p-2">
              {stack(step).map((item, index, all) => (
                <div key={index} className={cn("rounded-md border px-2 py-1 text-xs", index === all.length - 1 ? "border-primary bg-primary/10" : "border-border")}>
                  {item}
                </div>
              ))}
            </div>
            {step === 3 && <Chip tone={balanced === "yes" ? "success" : "danger"}>{balanced === "yes" ? "回到第 2 条" : "跳到了第 4 条：跑飞"}</Chip>}
          </div>
        </div>
      )}
      rows={mapping(
        ["一摞盘子", "栈", "后放的先拿"],
        ["“回来后做第几步”的纸条", "返回地址", "CALL 压进去，RET 取出来"],
        ["临时压上去的东西", "PUSH / POP 保存的寄存器", "必须一一配对"],
        ["拿错了纸条", "栈不平衡", "RET 跳到错误的位置"],
      )}
      insight="CALL 和 RET 靠栈记住回去的路。函数里每一个 PUSH 都要有对应的 POP，否则 RET 取到的就不是返回地址。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · cache
// ---------------------------------------------------------------------------

export function CacheConcept() {
  const [order, setOrder] = React.useState<"row" | "column">("row");
  const visits = Array.from({ length: 16 }, (_, index) => (order === "row" ? index : (index % 4) * 4 + Math.floor(index / 4)));
  const steps: ConceptStep[] = [
    { title: "离 CPU 越远越慢", description: "寄存器 1 个周期，缓存 1～4 个，内存约 20 个（真实机器上是一两百个）。" },
    { title: "缓存一次搬一整行", description: "读一个格子没命中，缓存会把它所在的一整行（这里是 4 个挨着的格子）都搬过来。" },
    { title: order === "row" ? "按行读：挨着读" : "按列读：跳着读", description: order === "row" ? "读 [0] 没命中，搬来 [0]～[3]；接下来三次都命中。" : "读 [0]、[4]、[8]、[12]：每次都在不同的行，几乎每次都要重新搬。" },
    { title: "结果", description: order === "row" ? "16 次读取，4 次未命中。" : "16 次读取里，命中的少得多，时间是按行读的好几倍。" },
  ];
  const tags = new Array<number>(2).fill(-1);
  const marks = visits.map((addr) => {
    const block = Math.floor(addr / 4);
    const hit = tags[block % 2] === block;
    tags[block % 2] = block;
    return { addr, hit };
  });
  return (
    <Concept
      id="cache"
      title="缓存：挨着读最快"
      analogy="厨师旁边有个小台面（缓存）。去储物架拿一样东西，干脆把旁边几样一起抱过来。下一步要的正好在台面上，就不用再跑一趟。"
      steps={steps}
      controls={<Segmented label="读取顺序" value={order} options={[{ value: "row" as const, label: "按行" }, { value: "column" as const, label: "按列" }]} onChange={setOrder} />}
      scene={(step) => (
        <div className="space-y-3">
          {step === 0 ? (
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[["寄存器", "1"], ["缓存", "1～4"], ["内存", "约 20"], ["硬盘", "百万以上"]].map(([name, cost]) => (
                <Node key={name} title={name} subtitle={`${cost} 个周期`} />
              ))}
            </div>
          ) : (
            <>
              <div className="grid w-fit grid-cols-4 gap-1">
                {Array.from({ length: 16 }, (_, addr) => {
                  const position = visits.indexOf(addr);
                  const mark = marks[position]!;
                  return (
                    <div key={addr} className={cn("flex size-10 flex-col items-center justify-center rounded-md border font-mono text-[10px]", step >= 2 ? (mark.hit ? "border-success bg-success/15" : "border-destructive bg-destructive/10") : step === 1 && addr < 4 ? "border-primary bg-primary/10" : "border-border")}>
                      <span>[{addr}]</span>
                      {step >= 2 && <span>第 {position + 1}</span>}
                    </div>
                  );
                })}
              </div>
              {step >= 2 && <Chip tone={order === "row" ? "success" : "danger"}>未命中 {marks.filter((mark) => !mark.hit).length} / 16 次</Chip>}
            </>
          )}
        </div>
      )}
      rows={mapping(
        ["手边的小台面", "缓存", "很小，但很快"],
        ["顺手抱过来的几样", "缓存行", "一次搬一整行挨着的数据"],
        ["要的东西正好在台面上", "命中", "省掉一次慢的内存访问"],
        ["挨着用", "局部性", "顺序访问、数据紧凑都更快"],
      )}
      insight="结果一样的两段程序，访问内存的顺序不同，速度可以差好几倍。让要一起用的数据挨在一起，按顺序访问。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch7 · scheduling
// ---------------------------------------------------------------------------

export function ScheduleConcept() {
  const [policy, setPolicy] = React.useState<"fcfs" | "rr">("rr");
  const blocks = policy === "fcfs" ? [["编译", 12], ["键盘", 1]] : [["编译", 3], ["键盘", 1], ["编译", 3], ["编译", 3], ["编译", 3]];
  const steps: ConceptStep[] = [
    { title: "一个 CPU，好几个程序", description: "同一时刻 CPU 只能执行一个程序。感觉像同时在跑，是因为操作系统在飞快地轮换。" },
    { title: policy === "fcfs" ? "先来先服务" : "轮转：每人一个时间片", description: policy === "fcfs" ? "编译先来，就一直跑到底；键盘只能干等。" : "每个程序跑一小段就让出来，排到队尾。键盘一来，很快就轮到它。" },
    { title: "切换不是免费的", description: "每换一次程序，操作系统要保存旧程序的寄存器、换上新程序的，这段时间谁的活都没干。时间片太小，时间就都花在切换上了。" },
  ];
  return (
    <Concept
      id="schedule"
      title="操作系统怎么分配 CPU"
      analogy="一个厨师，好几桌客人。经理（操作系统）安排先做哪桌：一桌做完再做下一桌，后来的小桌要等很久；每桌轮流做几分钟，大家都不会等太久，但厨师来回换锅也要花时间。"
      steps={steps}
      controls={<Segmented label="调度" value={policy} options={[{ value: "fcfs" as const, label: "先来先服务" }, { value: "rr" as const, label: "轮转" }]} onChange={setPolicy} />}
      scene={(step) => (
        <div className="space-y-2">
          <div className="flex h-8 w-full overflow-hidden rounded-md border border-border">
            {(step === 0 ? [["？", 13]] : blocks).map(([name, width], index) => (
              <React.Fragment key={index}>
                {step >= 2 && index > 0 && <span className="w-1.5 bg-destructive/70" title="切换" />}
                <span className={cn("flex items-center justify-center text-xs", name === "键盘" ? "bg-primary/30" : name === "编译" ? "bg-warning/30" : "bg-muted")} style={{ flexGrow: width as number }}>
                  {name}
                </span>
              </React.Fragment>
            ))}
          </div>
          {step >= 1 && <Chip tone={policy === "rr" ? "success" : "danger"}>{policy === "rr" ? "键盘很快得到响应" : "键盘等编译跑完才有反应"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["经理", "操作系统的调度器", "决定下一刻谁用 CPU"],
        ["一桌客人", "进程", "一个正在运行的程序"],
        ["每桌做几分钟", "时间片", "轮转调度的一小段时间"],
        ["换锅", "上下文切换", "保存和恢复寄存器的开销"],
      )}
      insight="交互程序要快响应，后台任务要高吞吐。时间片太大，交互程序要等；太小，时间都花在切换上。"
    />
  );
}
