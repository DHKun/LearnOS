"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import { Chip, Node, Segmented } from "@/components/education/scene-kit";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

import { KEYS, fingerprint, groupHex, sign, verify, withPrivate, withPublic } from "../simulation/crypto";
import { LOGO, encryptBlocks, logoBlocks } from "../simulation/labs";

const PREFIX = "crypto-basics/";
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

function Hex({ children, tone }: { children: React.ReactNode; tone?: "success" | "danger" }) {
  return <code className={cn("break-all rounded px-1.5 py-0.5 font-mono text-xs", tone === "success" ? "bg-success/15" : tone === "danger" ? "bg-destructive/15" : "bg-muted")}>{children}</code>;
}

// ---------------------------------------------------------------------------
// Ch1 · three goals; encoding is not encryption
// ---------------------------------------------------------------------------

export function GoalsConcept() {
  const steps: ConceptStep[] = [
    { title: "机密性：别人看不懂", description: "借书证密码在路上被人截获，对方也看不出写的是什么。" },
    { title: "完整性：被改过能发现", description: "公告里的“周二闭馆”被人改成“周三”，收到的人能发现内容不对。" },
    { title: "真实性：确认是谁发的", description: "收到一条“请重新输入密码”的通知，能确认它真的来自图书馆，而不是冒充的。" },
    { title: "编码不是加密", description: "Base64 之类的编码只是换一种写法，谁都能按公开的规则还原，不提供任何保密。" },
  ];
  return (
    <Concept
      id="goals"
      title="密码学要解决的三件事"
      analogy="寄一份重要文件：装进上了锁的箱子（机密性），封口贴上一碰就破的封条（完整性），再盖上只有你有的印章（真实性）。"
      steps={steps}
      scene={(step) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["机密性", "上锁的箱子", "加密"],
            ["完整性", "一碰就破的封条", "哈希、签名"],
            ["真实性", "只有你有的印章", "签名、证书"],
          ].map(([name, thing, tool], index) => (
            <Node key={name} title={name} subtitle={tool} active={step === index} tone={step === 3 && index === 0 ? "danger" : "default"}>
              <p>{thing}</p>
            </Node>
          ))}
          {step === 3 && (
            <div className="space-y-1 sm:col-span-3">
              <p className="text-xs">
                “mima123” 的 Base64 编码是 <Hex>bWltYTEyMw==</Hex>：看着像密文，任何人用公开的规则都能变回去。
              </p>
              <Chip tone="danger">编码 ≠ 加密</Chip>
            </div>
          )}
        </div>
      )}
      rows={mapping(
        ["上锁的箱子", "加密", "没有钥匙看不懂"],
        ["一碰就破的封条", "哈希、消息认证", "被改过能发现"],
        ["印章", "数字签名", "确认是谁发的"],
        ["换一种字体写", "编码（Base64 等）", "没有钥匙，不保密"],
      )}
      insight="先想清楚要保护的是哪一件事：看不懂、改不了、认得出是谁。不同的问题用不同的工具。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch2 · fingerprints
// ---------------------------------------------------------------------------

export function HashConcept() {
  const [text, setText] = React.useState<"a" | "b">("b");
  const original = "开馆时间 9:00";
  const changed = text === "a" ? original : "开馆时间 8:00";
  const a = fingerprint(original);
  const b = fingerprint(changed);
  const steps: ConceptStep[] = [
    { title: "任何内容都能算出指纹", description: "一篇文章、一个安装包，都能算出一串固定长度的指纹。真实世界用 SHA-256，这里用一个缩小的玩具版本。" },
    { title: "同样的内容，同样的指纹", description: "谁来算、什么时候算，结果都一样，所以可以拿来比对。" },
    { title: text === "a" ? "内容没变" : "只改了一个字", description: text === "a" ? "两次的指纹完全相同。" : "9 改成了 8，指纹几乎每一位都变了：从指纹上看不出“只改了一点”。" },
    { title: "不能倒推", description: "拿着指纹算不回原文。指纹只能用来核对：你手里的东西，和别人说的那份是不是同一份。" },
  ];
  return (
    <Concept
      id="hash"
      title="哈希：数据的指纹"
      analogy="按手印：同一根手指每次按出来都一样，换一根手指就完全不同；可只看手印，你没法把那个人还原出来。"
      steps={steps}
      controls={<Segmented label="第二份内容" value={text} options={[{ value: "a" as const, label: "一模一样" }, { value: "b" as const, label: "改一个字" }]} onChange={setText} />}
      scene={(step) => (
        <div className="space-y-2 text-xs">
          <p>
            “{original}” → <Hex>{groupHex(a)}</Hex>
          </p>
          {step >= 1 && (
            <p>
              “{step >= 2 ? changed : original}” → <Hex tone={step >= 2 ? (a === b ? "success" : "danger") : undefined}>{groupHex(step >= 2 ? b : a)}</Hex>
            </p>
          )}
          {step >= 2 && <Chip tone={a === b ? "success" : "danger"}>{a === b ? "指纹相同：同一份内容" : `${[...a].filter((char, index) => char !== b[index]).length} / 16 位不同`}</Chip>}
          {step === 3 && <p className="text-muted-foreground">指纹 → 原文：做不到。</p>}
        </div>
      )}
      rows={mapping(
        ["手印", "哈希值（指纹）", "固定长度"],
        ["同一根手指", "相同的输入", "得到相同的输出"],
        ["从手印认不出人长什么样", "单向", "不能从指纹算回原文"],
        ["核对手印", "比较哈希", "确认是不是同一份"],
      )}
      insight="哈希让你用一小串字核对一大份内容。但指纹本身必须来自可信的渠道，否则对方连指纹一起改了。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch3 · salt
// ---------------------------------------------------------------------------

export function SaltConcept() {
  const [salted, setSalted] = React.useState<"no" | "yes">("yes");
  const rows = [
    ["张伟", "k3P9"],
    ["李娜", "Qz71"],
  ];
  const steps: ConceptStep[] = [
    { title: "两个人用了同一个密码", description: "张伟和李娜的密码都是 library2026。" },
    { title: salted === "yes" ? "每人一段随机的盐" : "直接算指纹", description: salted === "yes" ? "注册时给每个人生成一段随机字符（盐），把“盐 + 密码”一起算指纹，盐和指纹都存进库里。" : "两个人的指纹完全一样：泄露后一眼就能看出他们用了同一个密码。" },
    { title: "预先算好的表", description: salted === "yes" ? "攻击者事先把常见密码的指纹都算好了，可每个人的盐不同，这张表对谁都用不上，只能一个人一个人地试。" : "攻击者事先算好“常见密码 → 指纹”的大表，查一下就出来了，所有用常见密码的人一次全部暴露。" },
  ];
  return (
    <Concept
      id="salt"
      title="为什么存密码要加盐"
      analogy="给每位读者的手印前面加一个随机的花纹再按：同样的手指，按出来的图案也不一样。事先收集好的手印图谱就对不上了。"
      steps={steps}
      controls={<Segmented label="加盐" value={salted} options={[{ value: "yes" as const, label: "加盐" }, { value: "no" as const, label: "不加盐" }]} onChange={setSalted} />}
      scene={(step) => (
        <div className="space-y-2 text-xs">
          {rows.map(([name, salt]) => {
            const value = step === 0 ? "library2026" : salted === "yes" ? `${salt}$${groupHex(fingerprint(`${salt}library2026`)).slice(0, 14)}` : groupHex(fingerprint("library2026")).slice(0, 14);
            return (
              <p key={name} className="flex flex-wrap items-center gap-2">
                <span className="w-10">{name}</span>
                <Hex tone={step >= 1 ? (salted === "yes" ? "success" : "danger") : undefined}>{value}</Hex>
              </p>
            );
          })}
          {step === 2 && <Chip tone={salted === "yes" ? "success" : "danger"}>{salted === "yes" ? "查表没用，只能逐个慢慢试" : "查一次表，两人一起暴露"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["随机的花纹", "盐（salt）", "每人不同，可以公开存放"],
        ["收集好的手印图谱", "预先算好的指纹表", "加盐之后失效"],
        ["按得很慢的手印机", "慢哈希（bcrypt、Argon2 等）", "让每次尝试都变贵"],
      )}
      insight="存密码：每人一段随机的盐，加上专门设计得很慢的哈希。慢到攻击者试不起，又快到读者登录感觉不到。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · block modes
// ---------------------------------------------------------------------------

function Logo({ cipher }: { cipher?: string[] }) {
  const shades = ["bg-slate-900", "bg-slate-700", "bg-slate-500", "bg-slate-300", "bg-sky-900", "bg-sky-700", "bg-sky-500", "bg-sky-300"];
  return (
    <div className="inline-grid gap-px rounded border border-border bg-border p-px" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
      {LOGO.flatMap((row, y) =>
        [...row].map((cell, x) => {
          const shade = cipher ? shades[parseInt(cipher[y * 4 + Math.floor(x / 4)]!, 16) % shades.length] : cell === "1" ? "bg-primary" : "bg-card";
          return <span key={`${x}-${y}`} className={cn("size-3", shade)} />;
        }),
      )}
    </div>
  );
}

export function ModeConcept() {
  const [mode, setMode] = React.useState<"ecb" | "ctr">("ecb");
  const cipher = encryptBlocks(logoBlocks(), { mode, nonce: "random", key: "beforehand" }, 1);
  const steps: ConceptStep[] = [
    { title: "对称加密：同一把钥匙", description: "加密和解密用同一把密钥。快，适合加密大量数据；难处在于怎么把钥匙安全地交给对方。" },
    { title: "数据被切成一块一块", description: "图片被切成每 4 个像素一块，逐块加密。" },
    { title: mode === "ecb" ? "每块单独加密" : "每块混入随机数和位置", description: mode === "ecb" ? "相同的明文块，加密出来也是相同的密文块。" : "同样内容的块，在不同位置、不同消息里加密出来都不一样。" },
    { title: "看看结果", description: mode === "ecb" ? "密文图里，馆徽的轮廓还清清楚楚：内容没泄露，结构泄露了。" : "密文图里看不出任何规律。" },
  ];
  return (
    <Concept
      id="mode"
      title="对称加密与加密模式"
      analogy="用同一套暗号本给一封信逐字替换：同一个字永远换成同一个符号，信的格式、哪里重复，别人一眼就看得出来。"
      steps={steps}
      controls={<Segmented label="模式" value={mode} options={[{ value: "ecb" as const, label: "逐块单独加密" }, { value: "ctr" as const, label: "计数器模式" }]} onChange={setMode} />}
      scene={(step) => (
        <div className="flex flex-wrap items-start gap-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold">明文</p>
            <Logo />
          </div>
          {step >= 2 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold">密文</p>
              <Logo cipher={cipher} />
            </div>
          )}
          {step === 3 && <Chip tone={mode === "ecb" ? "danger" : "success"}>{mode === "ecb" ? "轮廓泄露" : "看不出规律"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["同一套暗号本", "对称密钥", "双方要事先共享"],
        ["逐字替换", "ECB（逐块加密）", "相同块 → 相同密文"],
        ["每次换一页暗号", "带随机数的模式（CTR、GCM 等）", "随机数每次都要新的"],
      )}
      insight="光有好的加密算法不够，用法也要对：不要逐块单独加密，随机数每条消息都要重新生成，钥匙不要和密文放在一起。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch5 · the padlock
// ---------------------------------------------------------------------------

export function PadlockConcept() {
  const [lock, setLock] = React.useState<"director" | "you">("director");
  const key = lock === "director" ? KEYS.director : KEYS.you;
  const cipher = withPublic(key, 42);
  const directorOpens = withPrivate(KEYS.director, cipher) === 42;
  const steps: ConceptStep[] = [
    { title: "每人两把钥匙", description: "公钥公开给所有人，私钥只有自己有。用公钥锁上的，只有对应的私钥能打开。" },
    { title: `用${lock === "director" ? "馆长" : "你"}的公钥加密`, description: `42 → ${cipher}。谁都能做这一步，因为公钥是公开的。` },
    { title: "馆长用自己的私钥打开", description: directorOpens ? `${cipher} → 42。只有她能打开。` : `用馆长的私钥打不开：锁是你的，只有你的私钥能开。` },
  ];
  return (
    <Concept
      id="padlock"
      title="公钥加密：谁都能锁、只有主人能开"
      analogy="馆长在门口放了一堆开着口的挂锁，谁都可以拿一把，锁上箱子寄给她；钥匙只有她有。你和她从没见过面，也能安全地寄东西。"
      steps={steps}
      controls={<Segmented label="用谁的挂锁" value={lock} options={[{ value: "director" as const, label: "馆长的公钥" }, { value: "you" as const, label: "你的公钥" }]} onChange={setLock} />}
      scene={(step) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Node title="你" active={step === 1}>
            <p>明文 42</p>
          </Node>
          <Node title="路上" active={step === 1}>
            <p className="font-mono">{step >= 1 ? cipher : "—"}</p>
          </Node>
          <Node title="周馆长" tone={step === 2 ? (directorOpens ? "success" : "danger") : "default"} active={step === 2}>
            <p>{step === 2 ? (directorOpens ? "打开了：42" : "打不开") : "等着收信"}</p>
          </Node>
        </div>
      )}
      rows={mapping(
        ["开着口的挂锁", "公钥", "公开，用来加密、验证签名"],
        ["挂锁的钥匙", "私钥", "只有主人有，用来解密、签名"],
        ["门口那堆挂锁", "公钥证书 / 公钥目录", "怎么确定挂锁真是馆长的？第 7 章"],
      )}
      insight="给谁寄密信，就用谁的公钥加密。公钥加密很慢，实际中常用它来安全地交换一把对称密钥，再用对称加密传数据。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · signatures
// ---------------------------------------------------------------------------

export function SealConcept() {
  const [altered, setAltered] = React.useState<"no" | "yes">("yes");
  const original = "下周二闭馆一天";
  const received = altered === "yes" ? "下周三闭馆一天" : original;
  const signature = sign(KEYS.library, original);
  const ok = verify(KEYS.library, received, signature);
  const steps: ConceptStep[] = [
    { title: "图书馆用私钥签名", description: `算出公告的指纹，再用图书馆的私钥处理，得到签名 ${signature}。只有图书馆能做这一步。` },
    { title: "公告和签名一起发出", description: altered === "yes" ? "路上有人把“周二”改成了“周三”，签名没法跟着改：他没有图书馆的私钥。" : "一路上没人动过。" },
    { title: "读者用图书馆的公钥验证", description: ok ? "签名还原出的指纹和公告的指纹对得上：内容没被改过，而且确实是图书馆签的。" : "对不上：要么内容被改过，要么根本不是图书馆签的。" },
  ];
  return (
    <Concept
      id="seal"
      title="数字签名"
      analogy="图书馆的公章：只有图书馆有这枚章，谁都能拿着印模核对。盖完章再改一个字，章和内容就对不上了。"
      steps={steps}
      controls={<Segmented label="路上" value={altered} options={[{ value: "yes" as const, label: "被人改了一个字" }, { value: "no" as const, label: "没人动过" }]} onChange={setAltered} />}
      scene={(step) => (
        <div className="space-y-2 text-xs">
          <p>
            原文：“{original}”，签名 <Hex>{signature}</Hex>
          </p>
          {step >= 1 && <p>收到：“{received}”，签名 <Hex>{signature}</Hex></p>}
          {step === 2 && <Chip tone={ok ? "success" : "danger"}>{ok ? "验证通过" : "验证失败"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["盖章", "用私钥签名", "只有私钥的主人能做"],
        ["核对印模", "用公钥验证", "谁都能做"],
        ["印模从哪来", "公钥要来自可信渠道", "否则对方用自己的章冒充"],
      )}
      insight="签名同时证明两件事：内容没被改过，是持有私钥的人签的。但验证时用的公钥必须真是对方的。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch7 · certificate chain
// ---------------------------------------------------------------------------

export function ChainConcept() {
  const [site, setSite] = React.useState<"real" | "cafe">("real");
  const chain = site === "real" ? ["library.test", "小城证书 R3", "小城根证书机构"] : ["library.test", "FreeWiFi Portal CA"];
  const trusted = site === "real";
  const steps: ConceptStep[] = [
    { title: "网站出示证书", description: "证书上写着：这把公钥属于 library.test，由谁担保，在什么时间内有效。" },
    { title: "一级一级往上找担保人", description: "每一级证书都由上一级签名担保，一直找到最上面的根证书。" },
    { title: trusted ? "落在预装的根上" : "落在一个不认识的担保人上", description: trusted ? "根证书机构预装在浏览器和系统里，可信：这把公钥确实属于 library.test。" : "这个“担保人”自己给自己签名，浏览器不认识它。很可能有人在中间冒充 library.test。" },
    { title: "再核对域名和有效期", description: "证书上的域名要和地址栏一致，当天要在有效期内。三样都对上，浏览器才显示安全。" },
  ];
  return (
    <Concept
      id="chain"
      title="HTTPS 证书链"
      analogy="一张身份证明：上面盖着区公证处的章，区公证处的章又有市公证处担保，市公证处是大家都认的。要是担保人是一个谁都没听说过的“自己给自己盖章”的机构，这张证明就不能信。"
      steps={steps}
      controls={<Segmented label="网络" value={site} options={[{ value: "real" as const, label: "家里的网络" }, { value: "cafe" as const, label: "咖啡馆免费 Wi-Fi" }]} onChange={setSite} />}
      scene={(step) => (
        <div className="space-y-2">
          <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
            {chain.slice(0, step === 0 ? 1 : chain.length).map((name, index) => (
              <li key={name} className="flex items-center gap-2">
                {index > 0 && <span className="text-muted-foreground">←</span>}
                <span className={cn("rounded-md border px-2 py-1 text-xs", index === chain.length - 1 && step >= 2 ? (trusted ? "border-success bg-success/10" : "border-destructive bg-destructive/10") : "border-border bg-card")}>{name}</span>
              </li>
            ))}
          </ol>
          {step >= 2 && <Chip tone={trusted ? "success" : "danger"}>{trusted ? "根证书受信任" : "根证书不受信任：浏览器会拦下来"}</Chip>}
          {step === 3 && <p className="text-xs text-muted-foreground">域名：library.test ✓　有效期：2026-03-01 ～ 2027-03-01 ✓</p>}
        </div>
      )}
      rows={mapping(
        ["身份证明", "证书", "把公钥和域名绑在一起"],
        ["公证处的章", "证书机构（CA）的签名", "一级担保一级"],
        ["大家都认的市公证处", "预装的根证书", "信任的起点"],
        ["证明上写的名字", "证书的域名", "要和地址栏一致"],
      )}
      insight="HTTPS 的锁头保证你在和证书上写的那个域名通信。它不保证那个域名是好人：仿冒的网站也能有合法的证书。"
    />
  );
}
