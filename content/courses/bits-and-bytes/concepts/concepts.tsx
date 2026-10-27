"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import { Chip, Node, Segmented } from "@/components/education/scene-kit";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

import {
  type Codebook,
  contrast,
  decode,
  luminance,
  readUint,
  toBits,
  toHex,
  utf8Encode,
  wrap,
} from "../simulation/bytes";

const PREFIX = "bits-and-bytes/";
const mapping = (...rows: [string, string, string][]): ConceptMapping[] =>
  rows.map(([analogy, real, covers]) => ({ analogy, real, covers }));

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

/** A row of switches; lit = 1. */
function Switches({ bits, weights = false, onToggle, highlight }: { bits: number[]; weights?: boolean; onToggle?: (i: number) => void; highlight?: (i: number) => boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bits.map((bit, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <button
            type="button"
            disabled={!onToggle}
            onClick={() => onToggle?.(i)}
            aria-label={`第 ${i + 1} 个开关：${bit ? "开" : "关"}`}
            className={cn(
              "flex h-10 w-8 items-center justify-center rounded-md border font-mono text-sm motion-safe:transition-colors disabled:cursor-default",
              bit ? "border-warning bg-warning/25 text-foreground" : "border-border bg-muted text-muted-foreground",
              highlight?.(i) && "ring-2 ring-primary",
            )}
          >
            {bit}
          </button>
          {weights && <span className="font-mono text-[10px] text-muted-foreground">{2 ** (bits.length - 1 - i)}</span>}
        </div>
      ))}
    </div>
  );
}

function ByteBoxes({ bytes, label, tone }: { bytes: number[]; label?: string; tone?: (i: number) => string | undefined }) {
  return (
    <div className="space-y-1">
      {label && <p className="text-[11px] text-muted-foreground">{label}</p>}
      <div className="flex flex-wrap gap-1">
        {bytes.map((byte, i) => (
          <span key={i} className={cn("rounded border border-border bg-card px-1.5 py-1 font-mono text-xs", tone?.(i))}>
            {toHex([byte])}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch1 · Switches
// ---------------------------------------------------------------------------

export function SwitchesConcept() {
  const [bits, setBits] = React.useState([0, 1, 0, 0, 1, 0, 1, 1]);
  const value = bits.reduce((sum, bit) => sum * 2 + bit, 0);
  const toggle = (i: number) => setBits((current) => current.map((bit, j) => (j === i ? 1 - bit : bit)));
  const steps: ConceptStep[] = [
    { title: "一个开关", description: "一个开关只有开、关两种状态，写成 1 和 0。这就是一个比特（bit）。" },
    { title: "两个开关", description: "两个开关能组合出 4 种状态：00、01、10、11。每多一个开关，组合数翻一倍。" },
    { title: "八个开关", description: "8 个开关是一个字节（byte），能表示 2⁸ = 256 种状态。在上方点开关试试。" },
    { title: "每一位的分量", description: "从右往左，每一位代表 1、2、4、8……128。把亮着的位的分量加起来，就是这个字节表示的数。" },
    { title: "为什么不用十档", description: "电路里的电压总有波动。只分高低两档，波动再大也不会认错；分成十档，一点干扰就会把 7 读成 8。" },
  ];
  return (
    <Concept
      id="switches"
      title="一排开关能记住什么"
      analogy="一排电灯开关，每个只能开或关。事先约定好“哪几个亮表示什么”，这排开关就能记住数字、文字、颜色。"
      steps={steps}
      controls={<p className="text-xs text-muted-foreground">第 3、4 步可以直接点下面的开关。</p>}
      scene={(step) => (
        <div className="space-y-4">
          {step === 0 && <Switches bits={[1]} />}
          {step === 1 && (
            <div className="flex flex-wrap gap-4">
              {[[0, 0], [0, 1], [1, 0], [1, 1]].map((pair) => (
                <Switches key={pair.join("")} bits={pair} />
              ))}
            </div>
          )}
          {(step === 2 || step === 3) && (
            <>
              <Switches bits={bits} weights={step === 3} onToggle={toggle} />
              <p className="font-mono text-sm">
                {step === 3
                  ? `${bits.map((bit, i) => (bit ? 2 ** (7 - i) : null)).filter((x) => x !== null).join(" + ") || "0"} = ${value}`
                  : `二进制 ${bits.join("")}`}
              </p>
            </>
          )}
          {step === 4 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "两档：高 / 低", bands: 2 },
                { label: "十档：0～9", bands: 10 },
              ].map((option) => (
                <Node key={option.label} title={option.label} tone={option.bands === 2 ? "success" : "danger"}>
                  <div className="mt-1 flex h-24 flex-col-reverse overflow-hidden rounded border border-border">
                    {Array.from({ length: option.bands }, (_, i) => (
                      <div key={i} className={cn("flex flex-1 items-center justify-center border-t border-border/60 text-[10px]", i === Math.floor(option.bands * 0.7) && "bg-warning/25")}>
                        {option.bands === 2 ? (i ? "1" : "0") : i}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1">{option.bands === 2 ? "同样的干扰，仍落在“高”这一档" : "同样的干扰，越过了相邻的档位"}</p>
                </Node>
              ))}
            </div>
          )}
        </div>
      )}
      rows={mapping(
        ["一个开关", "比特（bit）", "最小的信息单位"],
        ["八个一组的开关", "字节（byte）", "存储和传输的基本单位"],
        ["“哪几个亮表示什么”的约定", "编码、格式", "让字节有意义"],
      )}
      insight="计算机里的一切最终都是一排开关的状态。开关本身没有意义，意义来自事先约定的读法，这门课讲的就是各种读法。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch2 · Hex
// ---------------------------------------------------------------------------

const HEX_DIGITS = "0123456789ABCDEF";

export function HexConcept() {
  const [value, setValue] = React.useState(0xd6);
  const bits = toBits(value).split("").map(Number);
  const high = value >> 4;
  const low = value & 0xf;
  const steps: ConceptStep[] = [
    { title: "一个字节 = 8 位", description: "直接写二进制太长，人眼也容易数错位。" },
    { title: "每 4 位分一组", description: "从中间切开，左边 4 位、右边 4 位各成一组。" },
    { title: "每组正好是 0～15", description: "4 位能表示 16 种状态，正好对应一个十六进制数字：0～9 加上 A～F。" },
    { title: "拼起来", description: "两组各换成一个十六进制数字，一个字节就写成两位，比如 D6。" },
    { title: "同一个数的三种写法", description: "十进制适合人算账，二进制是机器的真实样子，十六进制是两者之间的速记。" },
  ];
  return (
    <Concept
      id="hex"
      title="为什么程序员爱用十六进制"
      analogy="电话号码分段写成 138-0013-8000 更好认。十六进制就是把二进制每 4 位分一段的写法。"
      steps={steps}
      controls={
        <Segmented
          label="换一个字节"
          value={String(value)}
          options={[0xd6, 0x18, 0xff, 0x2a].map((item) => ({ value: String(item), label: toHex([item]) }))}
          onChange={(next) => setValue(Number(next))}
        />
      }
      scene={(step) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Switches bits={bits} />
          </div>
          {step >= 1 && (
            <div className="flex flex-wrap gap-3 font-mono text-sm">
              <Chip>{bits.slice(0, 4).join("")}</Chip>
              <Chip>{bits.slice(4).join("")}</Chip>
            </div>
          )}
          {step >= 2 && (
            <div className="flex flex-wrap gap-1 font-mono text-[11px]">
              {HEX_DIGITS.split("").map((digit, i) => (
                <span key={digit} className={cn("w-7 rounded border px-1 py-0.5 text-center", i === high || i === low ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                  {digit}
                  <span className="block text-[9px]">{i}</span>
                </span>
              ))}
            </div>
          )}
          {step >= 3 && <p className="font-mono text-lg font-semibold">{toHex([value])}</p>}
          {step === 4 && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Node title="十进制" subtitle={String(value)} />
              <Node title="二进制" subtitle={toBits(value)} />
              <Node title="十六进制" subtitle={`0x${toHex([value])}`} active />
            </div>
          )}
        </div>
      )}
      rows={mapping(
        ["电话号码分段", "每 4 位一组", "方便人读写"],
        ["一段数字", "一个十六进制数字", "0～F 共 16 种"],
      )}
      insight="一个字节总是两位十六进制，这让“第几个字节是多少”一眼可读。看到 0x 前缀或成对出现的 0～F，就要想到它在描述字节。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch3 · Byte order
// ---------------------------------------------------------------------------

type Order = "be" | "le";

export function EndianConcept() {
  const [writer, setWriter] = React.useState<Order>("be");
  const [reader, setReader] = React.useState<Order>("le");
  const value = 258;
  const stored = writer === "be" ? [0x01, 0x02] : [0x02, 0x01];
  const read = readUint(stored, 0, 2, reader)!;
  const steps: ConceptStep[] = [
    { title: "一个数放不进一个字节", description: "258 超过 255，需要两个字节：01 和 02（0x0102）。" },
    { title: "写入：哪个字节先放", description: "大端序先放高位字节（01 02），小端序先放低位字节（02 01）。在上方切换写入方式。" },
    { title: "读取：按另一种顺序读", description: "读取方按自己的约定把两个字节拼回去。在上方切换读取方式。" },
    { title: "结果", description: "两边约定一致才能读对。一边大端、一边小端，258 就会变成 513。" },
  ];
  return (
    <Concept
      id="endian"
      title="同样两个字节，先写哪个"
      analogy="写日期时，有人写“年-月-日”，有人写“日/月/年”。只要双方约定一致就没问题；对方按另一种顺序读，就会把 3 月 4 日读成 4 月 3 日。"
      steps={steps}
      controls={
        <div className="space-y-2">
          <Segmented label="写入方" value={writer} options={[{ value: "be", label: "大端" }, { value: "le", label: "小端" }]} onChange={setWriter} />
          <Segmented label="读取方" value={reader} options={[{ value: "be", label: "大端" }, { value: "le", label: "小端" }]} onChange={setReader} />
        </div>
      }
      scene={(step) => (
        <div className="space-y-4">
          <p className="font-mono text-sm">
            {value} = 0x0102 → 高位字节 01，低位字节 02
          </p>
          {step >= 1 && <ByteBoxes bytes={stored} label={`内存（${writer === "be" ? "大端写入" : "小端写入"}）：地址 0、地址 1`} tone={(i) => (i === 0 ? "ring-1 ring-primary" : undefined)} />}
          {step >= 2 && <p className="font-mono text-sm">按{reader === "be" ? "大端" : "小端"}读：0x{(reader === "be" ? stored : [...stored].reverse()).map((b) => toHex([b])).join("")} = {read}</p>}
          {step >= 3 && (
            <p className={cn("rounded-md px-3 py-2 text-sm", read === value ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
              {read === value ? "约定一致，读对了。" : `约定不一致：写的是 ${value}，读成了 ${read}。`}
            </p>
          )}
        </div>
      )}
      rows={mapping(
        ["年-月-日 / 日/月/年", "大端 / 小端", "多字节数的存放顺序"],
        ["双方约定", "文件格式或协议的规定", "决定读法"],
      )}
      insight="单个字节没有顺序问题；两个及以上字节组成的数，必须约定先放哪个。网络协议和多数文件格式用大端，常见的电脑芯片在内存里用小端。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · Overflow
// ---------------------------------------------------------------------------

export function OverflowConcept() {
  const [type, setType] = React.useState<"uint8" | "int8">("int8");
  const values = [125, 126, 127, 128, 129];
  const steps: ConceptStep[] = [
    { title: "125", description: "8 位寄存器里存着 125：01111101。" },
    { title: "126", description: "加一：01111110。" },
    { title: "127", description: "再加一：01111111。最高位之外的位全满了。" },
    { title: "再加一", description: "进位进到最高位：10000000。无符号读法是 128；有符号读法里最高位表示负号，于是变成 -128。在上方切换读法对比。" },
    { title: "负数怎么存", description: "有符号数用补码：-1 存成 11111111，-128 存成 10000000。加一时，-1 会回绕成 0，就像里程表从 999999 跳回 000000。" },
  ];
  return (
    <Concept
      id="overflow"
      title="数满了会怎样"
      analogy="老式汽车里程表只有 6 位，开到 999999 再走一公里，就回到 000000。计算机里的整数也只有固定的位数。"
      steps={steps}
      controls={<Segmented label="读法" value={type} options={[{ value: "int8", label: "int8（有符号）" }, { value: "uint8", label: "uint8（无符号）" }]} onChange={setType} />}
      scene={(step) => {
        const truth = step < 4 ? values[step] : 255;
        const stored = wrap(truth, type);
        const bits = toBits(((truth % 256) + 256) % 256).split("").map(Number);
        return (
          <div className="space-y-4">
            <Switches bits={bits} highlight={(i) => i === 0 && step >= 3} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Node title="想存的值" subtitle={step < 4 ? String(truth) : "-1（以补码存储）"} />
              <Node title={`按 ${type} 读出来`} subtitle={String(step < 4 ? stored : wrap(-1, type))} tone={step === 3 && stored !== truth ? "danger" : "default"} />
            </div>
            {step === 4 && <p className="text-sm">补码让加法电路不用区分正负：11111111 + 1 = 1 00000000，溢出的那一位被丢掉，正好得到 0。</p>}
          </div>
        );
      }}
      rows={mapping(
        ["里程表的 6 位", "整数的位数（8/16/32/64）", "决定能表示的范围"],
        ["从 999999 跳回 000000", "溢出 / 回绕", "超出范围后的结果"],
      )}
      insight="每种整数类型都有上下限。选类型时先估计数据一年后会涨到多大、会不会出现负数；超了不会报错，只会悄悄变成一个错误的值。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch5 · Floating point
// ---------------------------------------------------------------------------

function binaryFraction(value: number, digits: number): string {
  let out = "";
  let rest = value;
  for (let i = 0; i < digits; i += 1) {
    rest *= 2;
    out += rest >= 1 ? "1" : "0";
    if (rest >= 1) rest -= 1;
  }
  return out;
}

export function FloatConcept() {
  const steps: ConceptStep[] = [
    { title: "十进制也有写不完的小数", description: "1/3 = 0.3333…，写到哪一位都只是近似值。" },
    { title: "0.1 在二进制里写不完", description: "0.1 换成二进制是 0.000110011001100…，“0011”无限循环。" },
    { title: "只能存有限位", description: "64 位浮点数只保留 52 位有效数字，后面的被截掉。存下来的其实是 0.1000000000000000055511…" },
    { title: "误差会叠加", description: "0.1 和 0.2 各带一点误差，相加后是 0.30000000000000004，和 0.3 不相等。" },
    { title: "用整数分就没有误差", description: "10 分 + 20 分 = 30 分，整数在二进制里永远是精确的。和钱有关的计算，用最小单位的整数来存。" },
  ];
  return (
    <Concept
      id="float"
      title="0.1 + 0.2 为什么不等于 0.3"
      analogy="用一把只有厘米刻度的尺子量 1/3 米，只能读成 33 厘米。量三次加起来是 99 厘米，而不是 1 米。"
      steps={steps}
      scene={(step) => (
        <div className="space-y-3 font-mono text-sm">
          {step === 0 && <p>1 ÷ 3 = 0.33333333333333333…</p>}
          {step >= 1 && step <= 2 && (
            <p className="break-all">
              0.1 = 0.<span className="text-primary">{binaryFraction(0.1, step === 1 ? 24 : 52)}</span>
              {step === 1 ? "…" : <span className="text-destructive">（截断）</span>}
            </p>
          )}
          {step === 2 && <p>实际存下：{(0.1).toPrecision(20)}</p>}
          {step === 3 && (
            <div className="space-y-1">
              <p>0.1 + 0.2 = {String(0.1 + 0.2)}</p>
              <p className="text-destructive">0.1 + 0.2 === 0.3 → {String(0.1 + 0.2 === 0.3)}</p>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-1">
              <p>10 + 20 = {10 + 20}（分）</p>
              <p className="text-success">(10 + 20) === 30 → true</p>
            </div>
          )}
        </div>
      )}
      rows={mapping(
        ["只有厘米刻度的尺子", "有限位数的浮点数", "只能存近似值"],
        ["三次读数的误差叠加", "浮点运算误差累积", "比较和合计会出错"],
        ["改用毫米为单位的整数", "以分为单位的整数", "金额计算不再有误差"],
      )}
      insight="浮点数适合科学计算和图形，不适合要求“精确到分”的场景。和钱有关时，用整数存最小单位，只在显示时格式化成小数。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · UTF-8
// ---------------------------------------------------------------------------

const UTF8_SAMPLES = ["A", "é", "你", "😀"];
const TEMPLATES = ["0xxxxxxx", "110xxxxx 10xxxxxx", "1110xxxx 10xxxxxx 10xxxxxx", "11110xxx 10xxxxxx 10xxxxxx 10xxxxxx"];

function fillTemplate(template: string, bits: string): string {
  let index = bits.length - 1;
  return template
    .split("")
    .reverse()
    .map((char) => (char === "x" ? (index >= 0 ? bits[index--] : "0") : char))
    .reverse()
    .join("");
}

export function Utf8Concept() {
  const [sample, setSample] = React.useState("你");
  const code = sample.codePointAt(0)!;
  const bytes = utf8Encode(sample);
  const template = TEMPLATES[bytes.length - 1];
  const payload = template.replace(/[^x]/g, "").length;
  const bits = code.toString(2).padStart(payload, "0");
  const steps: ConceptStep[] = [
    { title: "字符", description: "先确定要存的字符。在上方换一个试试。" },
    { title: "查码点", description: "Unicode 给世界上每个字符编了号，叫码点。" },
    { title: "写成二进制", description: "把码点写成二进制，看看需要多少位。" },
    { title: "选模板、倒进去", description: "UTF-8 按位数选模板：越大的码点用越多字节。模板开头的 1 的个数告诉读取方“这个字符占几个字节”，后续字节都以 10 开头。" },
    { title: "得到字节", description: "这些字节就是文件里真正存着的东西。英文 1 个字节，常用汉字 3 个，表情符号 4 个。" },
  ];
  return (
    <Concept
      id="utf8"
      title="一个字符变成几个字节"
      analogy="寄包裹：先查到收件人的编号，再按编号长短选一个大小合适的盒子；盒子上印着“本件共几箱”，收件方据此把箱子拼回去。"
      steps={steps}
      controls={<Segmented label="字符" value={sample} options={UTF8_SAMPLES.map((item) => ({ value: item, label: item }))} onChange={setSample} />}
      scene={(step) => (
        <div className="space-y-3 font-mono text-sm">
          <p className="text-2xl">{sample}</p>
          {step >= 1 && <p>码点 U+{code.toString(16).toUpperCase().padStart(4, "0")}（十进制 {code}）</p>}
          {step >= 2 && <p className="break-all">二进制 {code.toString(2)}（{code.toString(2).length} 位）</p>}
          {step >= 3 && (
            <div className="space-y-1">
              <p className="text-muted-foreground">模板：{template}</p>
              <p className="break-all text-primary">填入：{fillTemplate(template, bits)}</p>
            </div>
          )}
          {step >= 4 && <ByteBoxes bytes={bytes} label={`${bytes.length} 个字节`} />}
        </div>
      )}
      rows={mapping(
        ["收件人编号", "Unicode 码点", "每个字符唯一的编号"],
        ["大小不同的盒子", "1～4 字节的 UTF-8 模板", "常用字符占的空间更少"],
        ["“本件共几箱”", "首字节开头的 1 的个数", "读取方据此分组"],
      )}
      insight="UTF-8 的好处是英文只占 1 个字节、和老的 ASCII 完全兼容；代价是字符和字节数不再一一对应，按字节截断就可能切坏一个字符。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch7 · Codebooks
// ---------------------------------------------------------------------------

const CODEBOOK_BYTES = [0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd];

export function CodebookConcept() {
  const [codebook, setCodebook] = React.useState<Codebook>("gbk");
  const group = codebook === "utf-8" ? 3 : codebook === "gbk" ? 2 : 1;
  const groups: number[][] = [];
  for (let i = 0; i < CODEBOOK_BYTES.length; i += group) groups.push(CODEBOOK_BYTES.slice(i, i + group));
  const steps: ConceptStep[] = [
    { title: "存着的字节", description: "文件里存着 6 个字节。它们是用 UTF-8 写下“你好”时产生的。" },
    { title: "按密码本分组", description: "UTF-8 按首字节判断每 3 个一组；GBK 把每 2 个当成一个汉字；Latin-1 一个字节就是一个字符。在上方换一本密码本。" },
    { title: "逐组查表", description: "每一组在密码本里查出一个字符。" },
    { title: "字节没变，读法变了", description: "同样 6 个字节，按 UTF-8 是“你好”，按 GBK 是“浣犲ソ”，按 Latin-1 是“ä½ å¥½”。只要字节还在，换回正确的读法就能恢复。" },
  ];
  return (
    <Concept
      id="codebook"
      title="乱码：拿错了密码本"
      analogy="同一串电报码，用中文电码本翻出来是一句话，用另一本密码本翻就是一堆怪字。电报本身没坏。"
      steps={steps}
      controls={
        <Segmented
          label="用哪本密码本读"
          value={codebook}
          options={[
            { value: "utf-8", label: "UTF-8" },
            { value: "gbk", label: "GBK" },
            { value: "latin-1", label: "Latin-1" },
          ]}
          onChange={(next) => setCodebook(next as Codebook)}
        />
      }
      scene={(step) => (
        <div className="space-y-4">
          <ByteBoxes bytes={CODEBOOK_BYTES} label="存着的字节（始终不变）" />
          {step >= 1 && (
            <div className="flex flex-wrap gap-2">
              {groups.map((bytes, i) => (
                <div key={i} className="rounded-lg border border-primary/40 bg-primary/5 p-1.5">
                  <ByteBoxes bytes={bytes} />
                  {step >= 2 && <p className="mt-1 text-center text-lg">{decode(bytes, codebook)}</p>}
                </div>
              ))}
            </div>
          )}
          {step >= 3 && (
            <p className={cn("rounded-md px-3 py-2 text-sm", codebook === "utf-8" ? "bg-success/10 text-success" : "bg-warning/15")}>
              按 {codebook.toUpperCase()} 读出：{decode(CODEBOOK_BYTES, codebook)}
            </p>
          )}
        </div>
      )}
      rows={mapping(
        ["电报码", "字节", "本身不带意义"],
        ["密码本", "字符编码（UTF-8、GBK……）", "字节到字符的对照表"],
        ["拿错密码本", "按错误的编码解码", "产生乱码，但字节还在"],
      )}
      insight="大多数乱码都能救回来：字节还在，换对编码即可。救不回来的是字节已经被改掉的情况，比如被替换成了问号或 �。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch8 · Color
// ---------------------------------------------------------------------------

export function ColorConcept() {
  const [rgb, setRgb] = React.useState<[number, number, number]>([52, 120, 212]);
  const hex = `#${toHex(rgb).replace(/ /g, "")}`;
  const lum = luminance(rgb);
  const steps: ConceptStep[] = [
    { title: "三束光", description: "屏幕上的每个像素由红、绿、蓝三个小灯组成，三束光叠加出各种颜色。拖动上方滑块试试。" },
    { title: "每束光 1 个字节", description: "每个通道的亮度是 0～255，正好一个字节。" },
    { title: "写成 #RRGGBB", description: "三个字节各写成两位十六进制，连在一起就是网页里常见的颜色值。" },
    { title: "亮度不是平均数", description: "人眼对绿色最敏感：同样的数值，绿光看起来比蓝光亮得多。计算亮度时，绿色的权重约是蓝色的 10 倍。" },
    { title: "对比度", description: "文字和背景的亮度差越大越清晰。无障碍标准要求正文对比度至少 4.5 : 1。" },
  ];
  return (
    <Concept
      id="color"
      title="颜色就是三个字节"
      analogy="舞台上三盏彩色追光灯，红、绿、蓝各一盏，调节每盏灯的亮度就能打出任何颜色。"
      steps={steps}
      controls={
        <div className="grid gap-2 sm:grid-cols-3">
          {(["R", "G", "B"] as const).map((channel, i) => (
            <label key={channel} className="flex items-center gap-2 text-xs">
              <span className="w-4 font-mono">{channel}</span>
              <input
                type="range"
                min={0}
                max={255}
                value={rgb[i]}
                aria-label={`${channel} 通道`}
                onChange={(event) => setRgb((current) => current.map((v, j) => (j === i ? Number(event.target.value) : v)) as [number, number, number])}
                className="min-w-0 flex-1"
              />
              <span className="w-8 text-right font-mono">{rgb[i]}</span>
            </label>
          ))}
        </div>
      }
      scene={(step) => (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-block size-16 rounded-lg border border-border" style={{ background: hex }} />
            {step >= 1 && <ByteBoxes bytes={rgb} label="R、G、B 三个字节" />}
            {step >= 2 && <p className="font-mono text-lg">{hex}</p>}
          </div>
          {step >= 3 && (
            <div className="space-y-1 text-xs">
              {(["R", "G", "B"] as const).map((channel, i) => {
                const weight = [0.2126, 0.7152, 0.0722][i];
                return (
                  <div key={channel} className="flex items-center gap-2">
                    <span className="w-4 font-mono">{channel}</span>
                    <span className="h-2 rounded bg-primary/50" style={{ width: `${weight * 200}px` }} />
                    <span className="font-mono">权重 {weight}</span>
                  </div>
                );
              })}
              <p className="font-mono">相对亮度 {lum.toFixed(3)}</p>
            </div>
          )}
          {step >= 4 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {["#FFFFFF", "#121212"].map((bg) => {
                const ratio = contrast(rgb, bg === "#FFFFFF" ? [255, 255, 255] : [18, 18, 18]);
                return (
                  <div key={bg} className="rounded-lg border border-border p-3" style={{ background: bg }}>
                    <span style={{ color: hex }} className="text-sm font-medium">
                      示例文字
                    </span>
                    <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[11px]", ratio >= 4.5 ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive")}>
                      {ratio.toFixed(2)} : 1
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      rows={mapping(
        ["三盏追光灯", "R、G、B 三个通道", "叠加出颜色"],
        ["每盏灯的亮度旋钮", "0～255 的一个字节", "#RRGGBB 中的两位"],
        ["观众觉得绿灯最亮", "亮度计算中绿色权重最大", "决定对比度"],
      )}
      insight="调颜色时，改变亮度最有效的是绿色通道。要同时适配亮色和暗色背景，往往需要同一色相的一深一浅两个变体。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch9 · Compression
// ---------------------------------------------------------------------------

const FLAT = ["#FFFFFF", "#FFFFFF", "#1F5FAD", "#1F5FAD", "#1F5FAD", "#1F5FAD", "#FFFFFF", "#FFFFFF"];
const PHOTO = ["#8A6F55", "#93785C", "#9B7F63", "#A38766", "#9A8064", "#8E7559", "#83694F", "#7A6249"];

function PixelRow({ colors, label }: { colors: string[]; label: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex">
        {colors.map((color, i) => (
          <span key={i} className="size-7 border border-border/40" style={{ background: color }} />
        ))}
      </div>
    </div>
  );
}

export function CompressionConcept() {
  const steps: ConceptStep[] = [
    { title: "像素 × 位深 = 大小", description: "一张 1920×1080 的图有 207 万个像素，每个像素 3 个字节，不压缩就是约 6 MB。" },
    { title: "无损：重复的就数一数", description: "Logo 里一整行都是同一种颜色，可以记成“2 个白、4 个蓝、2 个白”，一点信息都不丢。PNG、GIF 就是这类思路。" },
    { title: "照片没什么可数的", description: "照片里几乎每个像素都略有不同，无损压缩省不了多少。" },
    { title: "有损：丢掉看不出的差别", description: "JPEG 把相近的颜色合并、去掉细微变化。照片看起来几乎一样，体积却小了十几倍。" },
    { title: "有损的代价", description: "对文字和锐利边缘，被“合并”掉的恰恰是重要的细节，于是出现脏点和模糊。JPEG 也不支持透明。" },
  ];
  return (
    <Concept
      id="compression"
      title="图片为什么能变小"
      analogy="抄一份名单：如果连着 50 个人都姓王，写“王 × 50”就行（无损）。如果是一幅风景画，只能“大致描下来”，细节就丢了（有损）。"
      steps={steps}
      scene={(step) => (
        <div className="space-y-4">
          {step === 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Node title="像素" subtitle="1920 × 1080 = 2,073,600" />
              <Node title="每像素" subtitle="3 字节（R、G、B）" />
              <Node title="未压缩" subtitle="约 6.2 MB" active />
            </div>
          )}
          {step >= 1 && step <= 2 && (
            <div className="space-y-3">
              <PixelRow colors={FLAT} label="Logo 的一行像素" />
              <p className="font-mono text-sm">记作：2×白，4×蓝，2×白（8 个像素 → 3 条记录）</p>
              {step === 2 && (
                <>
                  <PixelRow colors={PHOTO} label="照片的一行像素" />
                  <p className="font-mono text-sm text-destructive">记作：1×A，1×B，1×C……（8 个像素 → 8 条记录，没省下来）</p>
                </>
              )}
            </div>
          )}
          {step >= 3 && (
            <div className="space-y-3">
              <PixelRow colors={PHOTO} label="原始照片" />
              <PixelRow colors={["#93785C", "#93785C", "#9B7F63", "#9B7F63", "#9B7F63", "#8E7559", "#83694F", "#83694F"]} label="JPEG 之后：相近的颜色被合并" />
              {step === 4 && <PixelRow colors={["#FFFFFF", "#C7D3E6", "#5A80BE", "#1F5FAD", "#2A66B1", "#5A80BE", "#C7D3E6", "#FFFFFF"]} label="Logo 用 JPEG 之后：边缘出现了中间色（脏点）" />}
            </div>
          )}
        </div>
      )}
      rows={mapping(
        ["“王 × 50”", "无损压缩（PNG、GIF）", "适合大块纯色、文字"],
        ["大致描下来", "有损压缩（JPEG）", "适合照片，体积小得多"],
      )}
      insight="选格式先看内容：照片用 JPEG，Logo、截图、文字用 PNG，需要透明用 PNG。尺寸比显示需要的大得多时，先缩小，省下的体积往往比调质量更多。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch10 · File signatures
// ---------------------------------------------------------------------------

const SIGNATURES = [
  { name: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "JPEG", bytes: [0xff, 0xd8, 0xff] },
  { name: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] },
  { name: "ZIP / docx", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "Windows 程序", bytes: [0x4d, 0x5a] },
];
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x07, 0x80, 0x00, 0x00, 0x04, 0x38];

export function SignatureConcept() {
  const steps: ConceptStep[] = [
    { title: "扩展名只是名字", description: "把 photo.png 改名成 photo.jpg，文件里的字节一个都没变。" },
    { title: "读开头几个字节", description: "大多数格式在文件开头放一段固定的字节，叫文件签名（魔数）。" },
    { title: "查签名表", description: "拿开头的字节和已知签名逐个比对。这里匹配上的是 PNG：89 50 4E 47，后三个字节正好是 ASCII 的“PNG”。" },
    { title: "签名后面是文件头", description: "PNG 的签名之后是 IHDR 数据块：4 字节长度、4 字节类型，然后是 4 字节宽度和 4 字节高度，都是大端序。这张图宽 0x780 = 1920，高 0x438 = 1080。" },
    { title: "以内容为准", description: "看图软件、浏览器和杀毒软件都会看签名，而不是只信扩展名。签名坏了，文件就打不开。" },
  ];
  return (
    <Concept
      id="signature"
      title="计算机怎么认出一个文件"
      analogy="快递盒上贴的标签可能被撕错，但打开盒子，里面的说明书第一页写着“这是一台咖啡机”。"
      steps={steps}
      scene={(step) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
            <Chip>photo.png</Chip>
            {step >= 0 && <span className="text-muted-foreground">→ 改名 →</span>}
            <Chip tone="warning">photo.jpg</Chip>
          </div>
          {step >= 1 && (
            <ByteBoxes
              bytes={PNG_HEAD}
              label="文件开头的字节"
              tone={(i) => (step >= 2 && i < 8 ? "bg-primary/15 border-primary/40" : step >= 3 && i >= 16 && i < 24 ? "bg-warning/20 border-warning/50" : undefined)}
            />
          )}
          {step >= 2 && (
            <div className="grid gap-1 sm:grid-cols-2">
              {SIGNATURES.map((signature) => (
                <div key={signature.name} className={cn("flex items-center justify-between gap-2 rounded border px-2 py-1 font-mono text-xs", signature.name === "PNG" ? "border-success/50 bg-success/10" : "border-border")}>
                  <span>{signature.name}</span>
                  <span>{toHex(signature.bytes)}</span>
                </div>
              ))}
            </div>
          )}
          {step >= 3 && (
            <p className="font-mono text-sm">
              宽 {toHex(PNG_HEAD.slice(16, 20))} = {readUint(PNG_HEAD, 16, 4, "be")}，高 {toHex(PNG_HEAD.slice(20, 24))} = {readUint(PNG_HEAD, 20, 4, "be")}
            </p>
          )}
          {step >= 4 && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">结论：这是一张 1920×1080 的 PNG，不管它叫什么名字。</p>}
        </div>
      )}
      rows={mapping(
        ["快递盒上的标签", "扩展名", "方便人看，可能是错的"],
        ["说明书第一页", "文件签名（魔数）", "文件真正的身份"],
        ["说明书里的规格表", "文件头字段", "宽高、长度、版本等信息"],
      )}
      insight="判断文件类型以开头的字节为准。看到扩展名和签名不符要警惕，尤其是“文档”的开头却是 4D 5A（Windows 可执行程序）。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch11 · Parity
// ---------------------------------------------------------------------------

export function ParityConcept() {
  const row = [1, 0, 1, 1, 0, 0, 1];
  const parity = row.reduce((a, b) => a + b, 0) % 2;
  const steps: ConceptStep[] = [
    { title: "发送：附上校验位", description: "7 位数据里有 4 个 1。发送方再附上一位，让 1 的总数变成偶数：这一位是 0。" },
    { title: "线路干扰", description: "传输途中，第 3 位从 1 被干扰成了 0。" },
    { title: "接收：重新数一遍", description: "接收方数出 1 的个数是 3，是奇数，和“应该是偶数”的约定不符，于是知道出错了。但只靠这一位，不知道是哪一位错的。" },
    { title: "排成方阵：行和列都校验", description: "把数据排成方阵，每行每列各一个校验位。出错的那一位所在的行和列都会对不上，交叉点就是它。" },
    { title: "两位同时出错", description: "两行两列对不上，交叉点有 4 个，无法确定是哪两个。这时只能请对方重发。" },
  ];
  return (
    <Concept
      id="parity"
      title="怎么发现传错了一位"
      analogy="点名时每排报一次人数，每列也报一次。某个座位空了，它所在的那一排和那一列人数都会少一个。"
      steps={steps}
      scene={(step) => {
        const received = step >= 1 ? row.map((bit, i) => (i === 2 ? 0 : bit)) : row;
        const count = received.reduce((a, b) => a + b, 0);
        return (
          <div className="space-y-3">
            {step <= 2 && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Switches bits={received} highlight={(i) => step >= 1 && i === 2} />
                  <span className="rounded-md border border-dashed border-primary px-2 py-2 font-mono text-sm">{parity}</span>
                </div>
                {step === 2 && (
                  <p className={cn("rounded-md px-3 py-2 text-sm", count % 2 === parity ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                    数据里 1 的个数 {count}，加上校验位是 {count + parity}：奇数，出错了。
                  </p>
                )}
              </>
            )}
            {step >= 3 && (
              <div className="grid w-max grid-cols-5 gap-1 font-mono text-xs">
                {Array.from({ length: 4 }, (_, r) =>
                  Array.from({ length: 5 }, (_, c) => {
                    const errors = step === 3 ? [[1, 2]] : [[0, 1], [2, 3]];
                    const rowBad = c < 4 && errors.some(([er]) => er === r);
                    const colBad = errors.some(([, ec]) => ec === c);
                    const hit = errors.some(([er, ec]) => er === r && ec === c);
                    const candidate = step === 4 && errors.some(([er]) => er === r) && errors.some(([, ec]) => ec === c);
                    if (c === 4) {
                      return (
                        <span key={`${r}-${c}`} className={cn("flex size-7 items-center justify-center rounded border", errors.some(([er]) => er === r) ? "border-destructive text-destructive" : "border-dashed border-border")}>
                          ✓
                        </span>
                      );
                    }
                    return (
                      <span
                        key={`${r}-${c}`}
                        className={cn(
                          "flex size-7 items-center justify-center rounded border border-border",
                          (rowBad || colBad) && "bg-warning/15",
                          (step === 3 ? hit : candidate) && "ring-2 ring-destructive",
                        )}
                      >
                        {(r + c) % 2}
                      </span>
                    );
                  }),
                )}
              </div>
            )}
            {step === 4 && <p className="text-sm">4 个候选位置，只有 2 个真的错了，无法确定是哪两个。</p>}
          </div>
        );
      }}
      rows={mapping(
        ["每排报人数", "行校验位", "发现这一行有错"],
        ["每列也报人数", "列校验位", "和行交叉定位出错的位"],
        ["两个座位同时空", "两位同时出错", "只能发现，无法定位"],
      )}
      insight="校验能发现错误，有时还能定位并纠正；但能力有限。真实系统用更强的 CRC 校验，PNG 的每个数据块和 ZIP 里的每个文件都带着它。"
    />
  );
}
