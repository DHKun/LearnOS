"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import { Chip, Segmented } from "@/components/education/scene-kit";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

import { SORTS, bfs, distribute } from "../simulation/algorithms";
import { SORT_JOBS } from "../simulation/labs";

const PREFIX = "data-structures/";
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

function Boxes({ items, highlight = [], dim = [], label }: { items: (string | number)[]; highlight?: number[]; dim?: number[]; label?: string }) {
  return (
    <div className="space-y-1">
      {label && <p className="text-[11px] text-muted-foreground">{label}</p>}
      <div className="flex flex-wrap gap-1">
        {items.map((item, index) => (
          <span
            key={index}
            className={cn(
              "flex min-w-9 items-center justify-center rounded-md border px-1.5 py-1 font-mono text-xs motion-safe:transition-colors",
              highlight.includes(index) ? "border-primary bg-primary/15" : "border-border bg-card",
              dim.includes(index) && "opacity-30",
            )}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch1 · how steps grow
// ---------------------------------------------------------------------------

export function GrowthConcept() {
  const sizes = [10, 100, 1000, 10_000];
  const rows = [
    { name: "一步到位（按编号直接取）", f: () => 1 },
    { name: "对半找（二分查找）", f: (n: number) => Math.ceil(Math.log2(n)) },
    { name: "挨个看一遍", f: (n: number) => n },
    { name: "两两比一遍", f: (n: number) => (n * (n - 1)) / 2 },
  ];
  const steps: ConceptStep[] = [
    { title: "10 本书时，差别不大", description: "数据少的时候，什么方法都很快。" },
    { title: "100 本", description: "挨个看要 100 步，对半找只要 7 步。" },
    { title: "1000 本", description: "两两比一遍已经要五十万步。" },
    { title: "10000 本", description: "数据每多 10 倍，有的方法多 10 倍步数，有的多 100 倍，有的几乎不变。比的是“步数怎么随数据量增长”。" },
  ];
  return (
    <Concept
      id="growth"
      title="同样的结果，不同的步数"
      analogy="找一本书：知道编号直接去拿；在排好序的书架上对半找；或者从第一本开始一本本看。书少的时候都差不多，馆藏一多，差别就是几秒和几天。"
      steps={steps}
      scene={(step) => (
        <div className="overflow-x-auto">
          <table className="m-0 w-full min-w-[24rem] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-1.5">方法</th>
                {sizes.slice(0, step + 1).map((n) => (
                  <th key={n} className="p-1.5 text-right font-mono">
                    n = {n.toLocaleString("zh-CN")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.name} className="border-b border-border">
                  <td className="p-1.5">{row.name}</td>
                  {sizes.slice(0, step + 1).map((n) => (
                    <td key={n} className={cn("p-1.5 text-right font-mono", index === 3 && n >= 1000 && "text-destructive")}>
                      {row.f(n).toLocaleString("zh-CN")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      rows={mapping(
        ["按编号直接去拿", "O(1)", "和数据量无关"],
        ["对半找", "O(log n)", "数据翻倍只多一步"],
        ["一本本看", "O(n)", "数据翻倍步数翻倍"],
        ["两两比一遍", "O(n²)", "数据翻倍步数翻四倍"],
      )}
      insight="判断一个方法快不快，看它的步数怎么随数据量增长。数据量大的时候，选对方法比换更快的电脑有用得多。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch2 · binary search
// ---------------------------------------------------------------------------

const SORTED = [3, 8, 12, 17, 21, 26, 30, 34, 39, 45, 51, 58, 63, 70, 77, 85];

export function BinaryConcept() {
  const target = 63;
  const ranges: [number, number, number][] = [];
  let lo = 0;
  let hi = SORTED.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ranges.push([lo, hi, mid]);
    if (SORTED[mid] === target) break;
    if (SORTED[mid]! < target) lo = mid + 1;
    else hi = mid - 1;
  }
  const steps: ConceptStep[] = ranges.map(([, , mid], index) => ({
    title: `第 ${index + 1} 次：看中间那本（${SORTED[mid]}）`,
    description: SORTED[mid] === target ? `找到了 ${target}。16 本书只看了 ${index + 1} 次。` : SORTED[mid]! < target ? `${SORTED[mid]} 比 ${target} 小，左边一半全都不用看了。` : `${SORTED[mid]} 比 ${target} 大，右边一半全都不用看了。`,
  }));
  return (
    <Concept
      id="binary"
      title="二分查找：每次排除一半"
      analogy="翻字典找“书”字：不会从第一页翻起，而是先翻到中间，看看是在前面还是后面，再在剩下的一半里翻中间。"
      steps={steps}
      scene={(step) => {
        const [from, to, mid] = ranges[step]!;
        const dim = SORTED.map((_, index) => index).filter((index) => index < from || index > to);
        return (
          <div className="space-y-2">
            <Chip>要找 {target}</Chip>
            <Boxes items={SORTED} highlight={[mid]} dim={dim} />
            <p className="text-xs text-muted-foreground">还剩 {to - from + 1} 本要考虑</p>
          </div>
        );
      }}
      rows={mapping(
        ["翻到中间", "看中间的元素", "一次比较"],
        ["只在一半里接着翻", "缩小一半范围", "所以只要 log₂n 次"],
        ["字典是按顺序排好的", "前提：数据已经排序", "没排序就不能这样找"],
      )}
      insight="在排好序的数据里，每看一次就能排除一半。64 本最多 6 次，一百万本也只要 20 次。前提是数据已经排好了序。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch3 · array vs linked list
// ---------------------------------------------------------------------------

export function ArrayListConcept() {
  const [kind, setKind] = React.useState<"array" | "list">("array");
  const books = ["基地", "沙丘", "三体", "活着"];
  const steps: ConceptStep[] =
    kind === "array"
      ? [
          { title: "数组：一个挨一个", description: "4 本书占着连续的 4 个格子。要第 3 本，直接去第 3 格：一步。" },
          { title: "在最前面插入《雪国》", description: "为了腾出第 1 格，后面每一本都要往后挪一格：书越多，挪得越多。" },
          { title: "插入完成", description: "挪了 4 次，再放 1 次。1000 本书就要挪 1000 次。" },
        ]
      : [
          { title: "链表：每本书记着下一本在哪", description: "书可以放在任何地方，每本里夹着一张纸条：“下一本在……”。要第 3 本，得从第 1 本开始顺着纸条数过去。" },
          { title: "在最前面插入《雪国》", description: "把《雪国》的纸条指向原来的第一本，再把“第一本”改成《雪国》。谁都不用挪。" },
          { title: "插入完成", description: "只改了两张纸条。不管有多少本书，都是这么几步。" },
        ];
  return (
    <Concept
      id="array-list"
      title="数组与链表"
      analogy="数组像一排编了号的书架格子，按号码直接拿，可在最前面塞一本就得把后面的全挪一格；链表像寻宝游戏，每本书里夹着“下一本在哪”的纸条，插一本只要改两张纸条，可想找第 500 本就得一路顺着纸条找过去。"
      steps={steps}
      controls={<Segmented label="存法" value={kind} options={[{ value: "array" as const, label: "数组" }, { value: "list" as const, label: "链表" }]} onChange={setKind} />}
      scene={(step) => {
        const after = step >= 2 ? ["雪国", ...books] : books;
        if (kind === "array") return <Boxes items={after} highlight={step === 0 ? [2] : step === 1 ? [0, 1, 2, 3] : [0]} label={step === 1 ? "每一本都往后挪一格" : undefined} />;
        return (
          <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
            {(step >= 1 ? ["雪国", ...books] : books).map((name, index, all) => (
              <React.Fragment key={name}>
                <span className={cn("rounded-md border px-2 py-1", index === 0 && step >= 1 ? "border-primary bg-primary/15" : "border-border bg-card")}>{name}</span>
                {index < all.length - 1 && <span className="text-muted-foreground">→</span>}
              </React.Fragment>
            ))}
          </div>
        );
      }}
      rows={mapping(
        ["编了号的连续格子", "数组", "按位置读一步到位，中间插入要挪"],
        ["夹着纸条的书", "链表", "插入删除只改指针，按位置读要数过去"],
        ["纸条", "指针（下一个节点的地址）", "上一门课的格子机里讲过"],
      )}
      insight="没有哪种存法处处都好。按位置读得多就用数组，在头尾频繁插入删除就用链表。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · stack and queue
// ---------------------------------------------------------------------------

export function StackQueueConcept() {
  const [kind, setKind] = React.useState<"stack" | "queue">("queue");
  const items = ["张伟", "李娜", "王芳"];
  const steps: ConceptStep[] = [
    { title: "依次放进去", description: `${items.join("、")} 依次进来。` },
    { title: "取出第一个", description: kind === "queue" ? "队列从最前面取：最先来的张伟先办。" : "栈从最上面取：最后放上去的王芳先拿走。" },
    { title: "全部取完", description: kind === "queue" ? "取出的顺序和放进去的顺序一样：先进先出。" : "取出的顺序和放进去的正好相反：后进先出。" },
  ];
  const out = kind === "queue" ? items : [...items].reverse();
  return (
    <Concept
      id="stack-queue"
      title="栈与队列"
      analogy="队列是借书窗口前排的队，先来的先办；栈是还书车，后放上去的书压在最上面，最先被拿走。"
      steps={steps}
      controls={<Segmented label="结构" value={kind} options={[{ value: "queue" as const, label: "队列" }, { value: "stack" as const, label: "栈" }]} onChange={setKind} />}
      scene={(step) => {
        const taken = step === 0 ? 0 : step === 1 ? 1 : 3;
        return (
          <div className="space-y-2">
            <Boxes items={items} label="放进去的顺序" />
            <Boxes items={out.slice(0, taken)} label="取出来的顺序" highlight={[0]} />
          </div>
        );
      }}
      rows={mapping(
        ["窗口前的队", "队列（FIFO）", "叫号、打印、消息排队"],
        ["还书车", "栈（LIFO）", "撤销、后退、函数调用"],
        ["上一门课的栈", "函数调用栈", "CALL 和 RET 就是这样记住回去的路"],
      )}
      insight="先来先服务用队列，最近的先处理用栈。选错了，结果的顺序就整个反过来。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch5 · hash buckets
// ---------------------------------------------------------------------------

export function HashConcept() {
  const [rule, setRule] = React.useState<"last" | "mod">("mod");
  const keys = [120, 130, 140, 150, 160, 170, 180, 190, 200, 210];
  const counts = rule === "last" ? distribute(keys, "last-digit", 7) : distribute(keys, "modulo", 7);
  const steps: ConceptStep[] = [
    { title: "按规则直接算出放哪一格", description: "查的时候按同样的规则算一下，直接去那一格找，不用一格格翻。" },
    { title: rule === "last" ? "规则：看最后一位" : "规则：除以格子数取余", description: rule === "last" ? "这批号码最后一位全是 0，全部挤进了同一格。" : "余数各不相同，号码均匀地分到了 7 个格子里。" },
    { title: "挤在一格就退化成挨个找", description: rule === "last" ? "一格里有 10 张卡片，查一个号码还是要一张张翻。" : "每格最多两张，查任何号码都只翻一两下。" },
  ];
  return (
    <Concept
      id="hash"
      title="哈希表：算出放在哪一格"
      analogy="前台的卡片柜：不按办证顺序放，而是按号码算出该放第几格。规则选得好，每格只有一两张；选得不好，所有卡片挤在一格里。"
      steps={steps}
      controls={<Segmented label="分格规则" value={rule} options={[{ value: "mod" as const, label: "号码 ÷ 7 取余" }, { value: "last" as const, label: "看最后一位" }]} onChange={setRule} />}
      scene={(step) => (
        <div className="space-y-2">
          <p className="font-mono text-xs">号码：{keys.join("、")}</p>
          {step >= 1 && (
            <div className="grid grid-cols-7 gap-1">
              {counts.map((count, index) => (
                <div key={index} className={cn("flex h-20 flex-col items-center justify-end rounded-md border p-1 text-[10px]", count > 2 ? "border-destructive bg-destructive/10" : "border-border")}>
                  <div className="w-full rounded-sm bg-primary/60" style={{ height: `${count * 8}px` }} />
                  <span>第 {index} 格</span>
                </div>
              ))}
            </div>
          )}
          {step === 2 && <Chip tone={Math.max(...counts) > 2 ? "danger" : "success"}>最多的一格：{Math.max(...counts)} 张</Chip>}
        </div>
      )}
      rows={mapping(
        ["分格的规则", "哈希函数", "同一个键永远算出同一格"],
        ["卡片柜的格子", "桶（bucket）", "桶数常取质数"],
        ["两张卡片落进同一格", "冲突", "冲突多了就变慢"],
      )}
      insight="哈希表平均一步就能找到，前提是哈希函数能把数据均匀地分开。数据有规律时（比如末位都一样），规则要用上整个键。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · sorting
// ---------------------------------------------------------------------------

export function SortConcept() {
  const [data, setData] = React.useState<"nearly" | "random">("nearly");
  const steps: ConceptStep[] = [
    { title: "插入排序：一本本插回该在的位置", description: "从左往右，每拿到一本，就往左比，插到比它小的那本后面。" },
    { title: data === "nearly" ? "几乎有序时" : "完全打乱时", description: data === "nearly" ? "大部分书往左比一次就停了，总共只比了一千多次。" : "每本书平均要往左比一半的距离，1000 本要比二十多万次。" },
    { title: "归并排序：拆开再合并", description: "不管数据什么样子，都是对半拆开、各自排好、再合并，大约 n × log₂n 次：1000 本一万次左右。" },
    { title: "没有永远最好的排序", description: "数据几乎有序时插入排序最快；数据乱的时候归并排序稳定地快。要保持相同元素原来的顺序，还得选“稳定”的排序。" },
  ];
  const counts = React.useMemo(() => {
    const items = SORT_JOBS.find((job) => job.id === data)!.items;
    return { insertion: SORTS.insertion(items).comparisons, merge: SORTS.merge(items).comparisons };
  }, [data]);
  return (
    <Concept
      id="sort"
      title="排序：看数据选方法"
      analogy="理书：书架上只有几本放错了，挑出来插回去就行；一大堆书完全打乱了，先分成几小堆各自理好，再一堆堆合并起来更快。"
      steps={steps}
      controls={<Segmented label="数据" value={data} options={[{ value: "nearly" as const, label: "几乎有序" }, { value: "random" as const, label: "完全打乱" }]} onChange={setData} />}
      scene={(step) => (
        <div className="space-y-2 text-xs">
          {[
            ["插入排序", counts.insertion],
            ["归并排序", counts.merge],
          ].map(([name, count]) => (
            <div key={name as string} className="space-y-1">
              <p>
                {name}：比较 {Number(count).toLocaleString("zh-CN")} 次
              </p>
              <div className="h-3 rounded-full bg-muted">
                <div className={cn("h-3 rounded-full", name === "插入排序" ? "bg-primary/70" : "bg-success/70")} style={{ width: `${Math.max(2, (Number(count) / Math.max(counts.insertion, counts.merge)) * 100)}%`, opacity: step === 0 && name === "归并排序" ? 0.2 : 1 }} />
              </div>
            </div>
          ))}
          {step === 3 && <Chip tone="success">{data === "nearly" ? "几乎有序：插入排序更快" : "完全打乱：归并排序快得多"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["挑出放错的插回去", "插入排序", "几乎有序时接近 n 次"],
        ["分堆理好再合并", "归并排序", "总是 n log n，稳定"],
        ["同年的书保持原来的先后", "稳定性", "多次按不同条件排序时很重要"],
      )}
      insight="选排序算法要看数据：几乎有序、完全打乱、要不要稳定。这些比较次数都是真的把书排一遍数出来的。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch7 · breadth-first search
// ---------------------------------------------------------------------------

const MINI = ["#######", "#S..#.#", "#.#.#.#", "#.#...#", "#...#T#", "#######"];

export function BfsConcept() {
  const distance = bfs(MINI, [1, 1]);
  const max = Math.max(...distance.values());
  const steps: ConceptStep[] = [
    { title: "从入口出发", description: "入口是第 0 步。" },
    { title: "一圈一圈往外扩", description: "先把走 1 步能到的格子都标上 1，再从这些格子出发标 2，像水波一样往外扩。" },
    { title: "第一次碰到目标就是最短", description: "因为是一圈圈扩出去的，第一次到达目标时的圈数，就是最少的步数。" },
  ];
  return (
    <Concept
      id="bfs"
      title="广度优先搜索：找最短路线"
      analogy="往池塘里扔一颗石子，水波一圈圈往外扩。哪个位置最先被水波碰到，就说明它离石子落点最近。"
      steps={steps}
      scene={(step) => {
        const shown = step === 0 ? 0 : step === 1 ? Math.floor(max / 2) : max;
        return (
          <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${MINI[0]!.length}, minmax(0, 1fr))` }}>
            {MINI.flatMap((row, y) =>
              [...row].map((cell, x) => {
                const d = distance.get(`${x},${y}`);
                const visible = d !== undefined && d <= shown;
                return (
                  <span key={`${x}-${y}`} className={cn("flex size-8 items-center justify-center rounded-sm font-mono text-[11px]", cell === "#" ? "bg-muted-foreground/40" : visible ? (cell === "T" && step === 2 ? "bg-success/40 font-bold" : "bg-primary/20") : "border border-border bg-card")}>
                    {cell === "#" ? "" : visible ? d : cell === "T" ? "T" : ""}
                  </span>
                );
              }),
            )}
          </div>
        );
      }}
      rows={mapping(
        ["水波一圈圈扩", "广度优先搜索（BFS）", "用队列保存下一圈要看的格子"],
        ["格子和相邻关系", "图的节点和边", "地图、社交关系、网络路由都是图"],
        ["第一次碰到", "最短路径", "每一步代价相同时成立"],
      )}
      insight="BFS 用队列一圈圈往外扩，第一次到达目标时就是最短路线。直奔目标的走法，遇到墙就可能绕远路甚至走进死胡同。"
    />
  );
}
