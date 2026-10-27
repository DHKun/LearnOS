"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import { Chip, Lane, MessageLines, Node, Segmented } from "@/components/education/scene-kit";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

import { formatIp, inSubnet, networkOf, parseCidr, parseIp, prefixMask, toBinary } from "../simulation/net";

const PREFIX = "networking-basics/";
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

const ROW = "grid grid-cols-1 items-center gap-2 sm:grid-cols-[8rem_1fr_8rem]";

// ---------------------------------------------------------------------------
// Ch1 · Packets hop by hop
// ---------------------------------------------------------------------------

const PATH = ["你的电脑", "家里的路由器", "运营商", "骨干网", "library.test"];

export function PacketsConcept() {
  const steps: ConceptStep[] = [
    { title: "拆成小包", description: "一张 3 MB 的图片不会整块发出去，而是拆成两千多个小包，每个包都写着编号。" },
    { title: "一层层贴标签", description: "数据外面依次套上：端口（给哪个程序）、IP 地址（给哪台机器）、MAC 地址（这一段路交给谁）。" },
    { title: "第一站：家门口", description: "电脑只知道“不在本地的都交给路由器”，把包交给了家里的路由器。" },
    { title: "逐站转发", description: "每一站只看 IP 地址决定下一站，然后换上新的 MAC 标签。没有哪一站知道完整路线。" },
    { title: "签收、拼回", description: "收件方按编号把包拼回原样；缺了哪个，就请对方重发。" },
  ];
  return (
    <Concept
      id="packets"
      title="一张图片怎么从服务器来到你电脑上"
      analogy="寄一套书：拆成几个包裹分别寄，每个包裹都写上收件地址和“第几箱”。沿途的分拣站只看地址决定下一站，收件人按编号收齐。"
      steps={steps}
      scene={(step) => (
        <div className="space-y-4">
          {step <= 1 && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-xs">
                  第 {i + 1} 包
                </span>
              ))}
              <span className="self-center text-xs text-muted-foreground">…… 共 2148 包</span>
            </div>
          )}
          {step === 1 && (
            <div className="w-fit space-y-1 font-mono text-xs">
              {[
                ["MAC：交给 f4:6a:dd:00:00:01（这一段路）", "bg-warning/15"],
                ["IP：198.51.100.10 → 192.168.1.23", "bg-primary/15"],
                ["端口：443 → 51234", "bg-success/15"],
                ["数据：图片的第 1 段", "bg-muted"],
              ].map(([label, tone]) => (
                <div key={label} className={cn("rounded border border-border px-3 py-1.5", tone)}>
                  {label}
                </div>
              ))}
            </div>
          )}
          {step >= 2 && (
            <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
              {PATH.map((node, i) => {
                const reached = step === 2 ? i <= 1 : true;
                const current = step === 2 ? i === 1 : step === 3 ? i === 3 : i === 4;
                return (
                  <li key={node} className="flex items-center gap-2">
                    <span className={cn("rounded-lg border px-2.5 py-1.5 text-xs motion-safe:transition-colors", current ? "border-primary bg-primary/15 font-medium" : reached ? "border-border bg-card" : "border-dashed border-border text-muted-foreground")}>
                      {node}
                    </span>
                    {i < PATH.length - 1 && <span className="text-muted-foreground">→</span>}
                  </li>
                );
              })}
            </ol>
          )}
          {step === 4 && <Chip tone="success">2148 / 2148 包到齐，按编号拼回原图</Chip>}
        </div>
      )}
      rows={mapping(
        ["拆成几个包裹", "数据包", "每个包独立传送"],
        ["收件地址", "IP 地址", "决定送到哪台机器"],
        ["这一段由哪位快递员送", "MAC 地址", "每经过一站换一次"],
        ["房间号", "端口", "决定交给哪个程序"],
      )}
      insight="互联网没有一条从你到服务器的“专线”。数据被拆成小包，每个路口只看地址决定下一站，到了再拼回去。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch2 · Subnet masks
// ---------------------------------------------------------------------------

export function SubnetConcept() {
  const [other, setOther] = React.useState("192.168.2.50");
  const laptop = parseIp("192.168.1.23")!;
  const target = parseIp(other)!;
  const prefix = 24;
  const same = inSubnet(target, laptop, prefix);
  const steps: ConceptStep[] = [
    { title: "IP 地址是 32 个比特", description: "192.168.1.23 其实是 4 个字节，写成二进制就是 32 个 0 和 1。" },
    { title: "掩码划出“网段号”", description: "子网掩码 255.255.255.0 的前 24 位是 1：前 24 位是网段号（哪个小区），后 8 位是主机号（几号楼）。" },
    { title: "算出网段", description: "地址和掩码按位“与”，主机号被清零，得到网段 192.168.1.0/24。" },
    { title: "比较两个网段", description: "目标地址也算一遍网段。在上方换一个目标试试。" },
    { title: "同网段直接送，不同网段交网关", description: "同一个网段：在局域网里直接送达。不同网段：交给默认网关（路由器），由它往外送。" },
  ];
  return (
    <Concept
      id="subnet"
      title="电脑怎么判断对方“在不在本地”"
      analogy="地址“幸福小区 3 号楼”：前半段是小区，后半段是楼号。同一个小区的邻居可以直接送；别的小区，就得交给小区门口的快递站。"
      steps={steps}
      controls={
        <Segmented
          label="目标地址"
          value={other}
          options={[
            { value: "192.168.2.50", label: "192.168.2.50" },
            { value: "192.168.1.60", label: "192.168.1.60" },
            { value: "198.51.100.10", label: "198.51.100.10" },
          ]}
          onChange={setOther}
        />
      }
      scene={(step) => (
        <div className="space-y-2 overflow-x-auto font-mono text-xs">
          <p>笔记本 192.168.1.23 = {toBinary(laptop)}</p>
          {step >= 1 && <p>掩码 255.255.255.0 = {toBinary(prefixMask(prefix))}</p>}
          {step >= 2 && <p className="text-primary">网段 = {toBinary(networkOf(laptop, prefix))} → {formatIp(networkOf(laptop, prefix))}/24</p>}
          {step >= 3 && (
            <p className={same ? "text-success" : "text-destructive"}>
              目标 {other} 的网段 → {formatIp(networkOf(target, prefix))}/24（{same ? "相同" : "不同"}）
            </p>
          )}
          {step >= 4 && (
            <p className={cn("rounded-md px-3 py-2 font-sans text-sm", same ? "bg-success/10 text-success" : "bg-warning/15")}>
              {same ? "同一个网段：直接在局域网里送达。" : "不同网段：交给默认网关 192.168.1.1。"}
            </p>
          )}
        </div>
      )}
      rows={mapping(
        ["小区名", "网段号（网络部分）", "由掩码决定有多长"],
        ["楼号", "主机号", "网段内每台设备不同"],
        ["小区门口的快递站", "默认网关", "送往其他网段的出口"],
      )}
      insight="子网掩码决定“多少位算网段号”。两台设备只有算出相同的网段，才会直接通信；否则一律交给网关。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch3 · ARP
// ---------------------------------------------------------------------------

export function ArpConcept() {
  const steps: ConceptStep[] = [
    { title: "只知道 IP", description: "笔记本要把数据交给同一网段的 192.168.1.60，可局域网里送东西靠的是 MAC 地址，它还不知道。" },
    { title: "广播一问", description: "笔记本向全网喊话：“谁是 192.168.1.60？请告诉 192.168.1.23。”目的 MAC 是 ff:ff:ff:ff:ff:ff，所有设备都会收到。" },
    { title: "对的人回答", description: "扫描仪单独回复：“192.168.1.60 在 5c:f3:70:9e:44:60。”" },
    { title: "记进 ARP 缓存", description: "笔记本把这个对应关系记下来，接下来一段时间不必再问。" },
    { title: "两个人都说是自己", description: "如果另一台设备也被设成了同一个 IP，它也会回答。后到的回答覆盖前一个，数据时而送到这台、时而送到那台：IP 冲突。" },
  ];
  return (
    <Concept
      id="arp"
      title="知道 IP，怎么找到那台机器"
      analogy="在小区群里问：“3 号楼 601 是哪位？”业主私信回你：“是我，手机尾号 4460。”你记下号码。要是有两个人都说是自己，快递就乱了。"
      steps={steps}
      scene={(step) => (
        <div className="space-y-3">
          <div className={ROW}>
            <Node title="笔记本" subtitle="192.168.1.23" active={step <= 1 || step === 3} />
            <Lane
              at={step === 1 ? 70 : 25}
              label={step === 1 ? "谁是 192.168.1.60？" : step === 4 ? "是我！b8:27:eb…" : "是我：5c:f3:70…"}
              visible={step >= 1 && step !== 3}
              tone={step === 4 ? "danger" : step === 1 ? "default" : "success"}
              caption={step === 1 ? "广播：所有设备都收到" : undefined}
            />
            <Node title={step === 4 ? "旧平板" : "扫描仪"} subtitle="192.168.1.60" active={step === 2 || step === 4} tone={step === 4 ? "danger" : "default"} />
          </div>
          {step >= 3 && (
            <MessageLines
              lines={["ARP 缓存", `192.168.1.60  →  ${step === 4 ? "b8:27:eb:3d:21:0a（被覆盖了）" : "5c:f3:70:9e:44:60"}`]}
              shown={2}
              focus={1}
            />
          )}
        </div>
      )}
      rows={mapping(
        ["门牌号", "IP 地址", "逻辑上的位置"],
        ["手机号", "MAC 地址", "网卡出厂自带"],
        ["在群里问一声", "ARP 广播请求", "整个局域网都收到"],
        ["两人都说是自己", "IP 地址冲突", "通信时好时坏"],
      )}
      insight="ARP 只在同一个局域网里工作，负责把 IP 换成 MAC。手动设置固定 IP 时要避开别人在用的地址，否则就是 IP 冲突。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · Longest prefix match
// ---------------------------------------------------------------------------

const DEMO_TABLE = [
  { destination: "10.8.1.0/24", via: "直连 eth0" },
  { destination: "10.8.0.0/16", via: "VPN 路由器" },
  { destination: "0.0.0.0/0", via: "运营商（默认路由）" },
];

export function RoutingConcept() {
  const [target, setTarget] = React.useState("10.8.20.5");
  const ip = parseIp(target)!;
  const matches = DEMO_TABLE.map((row) => {
    const cidr = parseCidr(row.destination)!;
    return { ...row, prefix: cidr.prefix, match: inSubnet(ip, cidr.network, cidr.prefix) };
  });
  const best = matches.filter((row) => row.match).sort((a, b) => b.prefix - a.prefix)[0];
  const steps: ConceptStep[] = [
    { title: "数据包到了路由器", description: "路由器只关心一件事：目的地址是多少。在上方换一个目的地址。" },
    { title: "逐条比对", description: "把目的地址和每一条路由的网段比一比，看它落在哪些网段里。" },
    { title: "可能同时命中好几条", description: "0.0.0.0/0 能匹配任何地址；10.8.0.0/16 和 10.8.1.0/24 也可能同时命中。" },
    { title: "最长前缀胜出", description: "前缀越长，说明网段越具体。路由器选最具体的那一条。" },
    { title: "交给下一跳", description: "按选中那条路由的下一跳发出去。默认路由只在别的都不匹配时才用得上。" },
  ];
  return (
    <Concept
      id="routing"
      title="路由器怎么决定下一站"
      analogy="分拣站的规则表：“北京海淀 → 3 号口”“北京 → 2 号口”“其他 → 1 号口”。一件寄往海淀的包裹三条都符合，按最具体的那条走 3 号口。"
      steps={steps}
      controls={
        <Segmented
          label="目的地址"
          value={target}
          options={["10.8.20.5", "10.8.1.40", "198.51.100.10"].map((value) => ({ value, label: value }))}
          onChange={setTarget}
        />
      }
      scene={(step) => (
        <div className="space-y-3">
          <Chip>目的地址 {target}</Chip>
          <div className="space-y-1">
            {matches.map((row) => {
              const chosen = step >= 3 && best?.destination === row.destination;
              return (
                <div
                  key={row.destination}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-1.5 font-mono text-xs motion-safe:transition-colors",
                    chosen ? "border-primary bg-primary/15" : step >= 1 && row.match ? "border-success/50 bg-success/10" : "border-border",
                  )}
                >
                  <span>{row.destination}</span>
                  <span className="font-sans">{row.via}</span>
                  {step >= 1 && <span className="font-sans text-muted-foreground">{row.match ? `命中（/${row.prefix}）` : "不匹配"}</span>}
                </div>
              );
            })}
          </div>
          {step >= 4 && best && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm">交给：{best.via}</p>}
        </div>
      )}
      rows={mapping(
        ["分拣站的规则表", "路由表", "每台路由器各有一张"],
        ["最具体的那条规则", "最长前缀匹配", "/24 优先于 /16"],
        ["“其他 → 1 号口”", "默认路由 0.0.0.0/0", "兜底"],
      )}
      insight="每台路由器只决定下一站，不知道完整路线。两台路由器互相把对方当作默认路由时，没有出口的包就会在它们之间来回转，直到 TTL 耗尽。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch5 · DNS resolution
// ---------------------------------------------------------------------------

const DNS_CHAIN = ["浏览器 / 本机缓存", "运营商的递归 DNS", "根服务器", ".test 服务器", "library.test 的权威服务器"];

export function DnsConcept() {
  const steps: ConceptStep[] = [
    { title: "先查本机", description: "浏览器和系统先看自己有没有记着；hosts 文件里写死的条目也在这一步生效。" },
    { title: "问递归 DNS", description: "本机没有，就问运营商（或公司、公共）的递归 DNS 服务器，让它代为查找。" },
    { title: "从根开始问路", description: "递归 DNS 问根服务器：“.test 归谁管？”再问 .test 服务器：“library.test 归谁管？”" },
    { title: "权威回答", description: "library.test 的权威服务器给出最终答案：A 记录 198.51.100.10，有效期（TTL）300 秒。" },
    { title: "层层缓存", description: "答案沿路被缓存，有效期内再问就直接返回。代价是：记录改了之后，旧答案还会在缓存里留一阵。" },
  ];
  return (
    <Concept
      id="dns"
      title="从 library.test 到 198.51.100.10"
      analogy="打 114 查号台：先翻自己的通讯录，没有就问查号台；查号台再一级级问到这家单位，告诉你号码，并说“这个号码一周内有效”。"
      steps={steps}
      scene={(step) => (
        <div className="space-y-3">
          <ol className="m-0 list-none space-y-1.5 p-0">
            {DNS_CHAIN.map((node, i) => {
              const reached = step === 0 ? i === 0 : step === 1 ? i <= 1 : step === 2 ? i <= 3 : true;
              const active = (step === 0 && i === 0) || (step === 1 && i === 1) || (step === 2 && (i === 2 || i === 3)) || (step === 3 && i === 4);
              return (
                <li key={node} className={cn("rounded-md border px-3 py-1.5 text-sm motion-safe:transition-colors", active ? "border-primary bg-primary/10" : reached ? "border-border" : "border-dashed border-border text-muted-foreground")}>
                  {node}
                  {step >= 4 && i <= 1 && <span className="ml-2 text-xs text-success">已缓存：198.51.100.10（还剩 300 秒）</span>}
                </li>
              );
            })}
          </ol>
          {step >= 3 && <MessageLines lines={["library.test.  300  IN  A  198.51.100.10"]} shown={1} focus={0} notes={{ 0: "名字 · 有效期 · 类型 · 地址" }} />}
        </div>
      )}
      rows={mapping(
        ["自己的通讯录", "本机缓存和 hosts 文件", "最先查，也最容易藏着旧答案"],
        ["查号台", "递归 DNS 服务器", "替你一级级去问"],
        ["那家单位自己", "权威 DNS 服务器", "答案的源头"],
        ["“一周内有效”", "TTL", "缓存多久"],
      )}
      insight="DNS 出问题时，先对照权威服务器的答案：它对了而你拿到的不对，问题在缓存或 hosts；它也错了，就是记录本身填错了。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · Ports and the firewall
// ---------------------------------------------------------------------------

type PortCase = "open" | "blocked" | "closed";

export function PortsConcept() {
  const [kind, setKind] = React.useState<PortCase>("open");
  const steps: ConceptStep[] = [
    { title: "IP 找机器，端口找程序", description: "一台服务器上同时跑着网站、SSH、数据库，靠端口号区分：443 给网站，22 给 SSH。" },
    { title: "TCP 和 UDP 各有一套端口", description: "TCP 443 和 UDP 443 是两扇不同的门。放行了 TCP 3478，UDP 3478 照样进不来。" },
    { title: "防火墙站在门口", description: "连接先经过防火墙：在放行名单上才能进。在上方切换三种情况。" },
    { title: "三种结局", description: "被防火墙拦下：对方毫无回应，最后超时。放行了但没有程序在听：立刻收到“连接被拒绝”。放行且有程序在听：连上了。" },
  ];
  const result =
    kind === "blocked"
      ? { text: "防火墙拦下：没有任何回应，等到超时", tone: "danger" as const }
      : kind === "closed"
        ? { text: "防火墙放行，但没有程序监听：立刻“连接被拒绝”", tone: "danger" as const }
        : { text: "防火墙放行，nginx 在监听：连接成功", tone: "success" as const };
  return (
    <Concept
      id="ports"
      title="端口、防火墙和“连接被拒绝”"
      analogy="一栋写字楼：门牌号找到这栋楼（IP），房间号找到公司（端口）。门卫（防火墙）按名单放人；就算放进来了，房间里没人，敲门也没人应。"
      steps={steps}
      controls={
        <Segmented
          label="情况"
          value={kind}
          options={[
            { value: "open", label: "放行 + 有人听" },
            { value: "blocked", label: "防火墙拦截" },
            { value: "closed", label: "放行 + 没人听" },
          ]}
          onChange={setKind}
        />
      }
      scene={(step) => (
        <div className="space-y-3">
          <div className={ROW}>
            <Node title="读者" subtitle="→ TCP 443" />
            <Lane at={step <= 1 ? 40 : kind === "blocked" ? 55 : 80} label="SYN → 443" tone={step >= 3 && kind !== "open" ? "danger" : "default"} visible={step >= 2} caption={step >= 2 ? "防火墙" : undefined} />
            <Node title="服务器" subtitle="198.51.100.10" tone={step >= 3 ? (kind === "open" ? "success" : "danger") : "default"}>
              <ul className="m-0 list-none space-y-0.5 p-0 font-mono">
                <li>tcp 443 {kind === "closed" ? "（无）" : "nginx"}</li>
                <li>tcp 22 sshd</li>
                {step >= 1 && <li>udp 3478 语音</li>}
              </ul>
            </Node>
          </div>
          {step >= 3 && <Chip tone={result.tone}>{result.text}</Chip>}
        </div>
      )}
      rows={mapping(
        ["写字楼门牌号", "IP 地址", "找到机器"],
        ["房间号", "端口号", "找到程序"],
        ["门卫的名单", "防火墙规则", "决定谁能进"],
        ["敲门没人应", "连接被拒绝（RST）", "端口没有程序在听"],
      )}
      insight="排查“连不上”先看现象：超时多半是被挡了或路不通；立刻“拒绝”说明路是通的，只是那个端口上没有程序。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch7 · TCP reliability
// ---------------------------------------------------------------------------

export function TcpConcept() {
  const [loss, setLoss] = React.useState<"none" | "lost">("lost");
  const lines =
    loss === "none"
      ? ["→ SYN", "← SYN, ACK", "→ ACK", "→ 数据 seq=1   (1000 字节)", "← ACK 1001", "→ 数据 seq=1001 (1000 字节)", "← ACK 2001", "→ 数据 seq=2001 (1000 字节)", "← ACK 3001"]
      : ["→ SYN", "← SYN, ACK", "→ ACK", "→ 数据 seq=1   (1000 字节)", "← ACK 1001", "→ 数据 seq=1001 ✗ 丢了", "→ 数据 seq=2001 (1000 字节)", "← ACK 1001（还在等 1001）", "→ 重传 seq=1001", "← ACK 3001（一下子全收齐）"];
  const steps: ConceptStep[] = [
    { title: "三次握手", description: "先问一句“在吗”（SYN），对方回“在，你呢”（SYN, ACK），再答“我也在”（ACK），连接就建好了。" },
    { title: "按序号发送", description: "每个数据段都标着序号（seq），表示这是第几个字节开始的数据。" },
    { title: "确认号：下一个想要的字节", description: "接收方回复 ACK 1001，意思是“1000 以前都收到了，下一个请发 1001”。" },
    { title: "丢包与重复确认", description: "中间一段丢了，后面的先到了。接收方先把它们存起来，但确认号停在 1001 不动，相当于一遍遍提醒“我还缺 1001”。在上方切换有无丢包。" },
    { title: "重传后一下子补齐", description: "发送方补发 1001 那段。缺口补上，接收方的确认号直接跳到 3001。应用程序读到的始终是完整、按顺序的数据。" },
  ];
  return (
    <Concept
      id="tcp"
      title="TCP 怎么保证一个字节都不丢"
      analogy="寄一套编了号的书，每收到一本，就告诉对方“下一本请寄第几号”。中间一本寄丢了，就一直回“请寄第 2 号”，直到它补寄过来。"
      steps={steps}
      controls={<Segmented label="网络情况" value={loss} options={[{ value: "lost", label: "中途丢一个包" }, { value: "none", label: "一切顺利" }]} onChange={setLoss} />}
      scene={(step) => {
        const count = step === 0 ? 3 : step === 1 ? 4 : step === 2 ? 5 : step === 3 ? Math.min(lines.length, 8) : lines.length;
        return <MessageLines lines={lines} shown={count} focus={count - 1} />;
      }}
      rows={mapping(
        ["书的编号", "序号 seq", "数据在整体中的位置"],
        ["“下一本请寄第几号”", "确认号 ack", "累计确认"],
        ["补寄丢失的那本", "重传", "超时或收到重复确认后触发"],
      )}
      insight="TCP 用序号、确认和重传，在不可靠的网络上做出“不丢、不重、按顺序”的字节流。UDP 不做这些，适合宁可丢一点也不要等待的语音和游戏。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch8 · NAT
// ---------------------------------------------------------------------------

export function NatConcept() {
  const steps: ConceptStep[] = [
    { title: "家里用的是私有地址", description: "192.168.x.x 只在家里有效，互联网上不认。全家设备共用路由器的一个公网地址 203.0.113.45。" },
    { title: "出门时换地址、记一笔", description: "手机访问 library.test：路由器把来源改成 203.0.113.45:40001，并在 NAT 表里记下“40001 ↔ 手机 192.168.1.31:51234”。" },
    { title: "回来时按表换回", description: "服务器回复发到 203.0.113.45:40001，路由器查表，转回手机。" },
    { title: "外面主动来的连接", description: "外面有人直接连 203.0.113.45:8443：表里没有这一笔，路由器不知道该给谁，直接丢弃。这也是家用网络天然的一层保护。" },
    { title: "端口转发：事先写好一笔", description: "想让朋友访问家里的 NAS，就要事先写一条：“8443 → 192.168.1.20:443”。前提是 NAS 的地址不能变。" },
  ];
  return (
    <Concept
      id="nat"
      title="一个公网地址，全家都能上网"
      analogy="公司前台：员工寄出的信都用公司地址，前台登记“这封是谁寄的”；回信到了按登记本转给本人。没人登记过的陌生来信，前台不知道给谁。"
      steps={steps}
      scene={(step) => {
        const rows = [
          step >= 1 ? "40001  ↔  192.168.1.31:51234（手机，访问 library.test）" : "（空）",
          ...(step >= 4 ? ["8443   →  192.168.1.20:443（端口转发：NAS）"] : []),
        ];
        return (
          <div className="space-y-3">
            <div className={ROW}>
              <Node title="家里的设备" subtitle="192.168.1.x" active={step <= 1} />
              <Lane
                at={step === 2 ? 25 : step === 3 ? 60 : 75}
                label={step === 1 ? "源 203.0.113.45:40001" : step === 2 ? "→ 回给手机" : step === 3 ? "陌生连接 :8443 ✗" : step === 4 ? ":8443 → NAS" : "192.168.1.31"}
                tone={step === 3 ? "danger" : step === 4 ? "success" : "default"}
                visible={step >= 1}
                caption="家里的路由器"
              />
              <Node title="互联网" subtitle="只认 203.0.113.45" active={step === 2 || step === 3} />
            </div>
            <MessageLines lines={["NAT 表", ...rows]} shown={rows.length + 1} focus={step === 4 ? rows.length : step >= 1 ? 1 : undefined} />
          </div>
        );
      }}
      rows={mapping(
        ["公司地址", "公网 IP", "互联网上可见的地址"],
        ["前台的登记本", "NAT 表", "记录谁发出了哪条连接"],
        ["“寄给 A 的信直接转给 A”", "端口转发", "让外面主动连进来"],
      )}
      insight="NAT 让多台设备共用一个公网地址，也挡住了外面主动发起的连接。要对外提供服务，就得配端口转发，并让内部设备的地址固定下来。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch9 · Traceroute
// ---------------------------------------------------------------------------

const HOPS = [
  { host: "192.168.1.1", time: "1 ms" },
  { host: "203.0.113.1", time: "8 ms" },
  { host: "*", time: "*" },
  { host: "192.0.2.17", time: "12 ms" },
  { host: "198.51.100.10", time: "19 ms" },
];

export function TracerouteConcept() {
  const steps: ConceptStep[] = [
    { title: "TTL：每过一站减一", description: "每个包带着一个“剩余跳数”TTL，每经过一台路由器减 1，减到 0 就被丢弃，丢弃它的路由器会回一条“超时”消息。" },
    { title: "TTL = 1", description: "traceroute 先发 TTL=1 的包，第一台路由器把它丢弃并回话，于是知道了第 1 跳是谁、多久回话。" },
    { title: "TTL = 2、3……", description: "再发 TTL=2、3……每次多走一站，一跳一跳地把路线“探”出来。" },
    { title: "有的路由器不回话", description: "第 3 跳显示 * * *：这台路由器配置成不回“超时”消息，但它照常转发，后面的跳依然有回应。" },
    { title: "到达终点", description: "终于有一个包到达了 library.test 本身，路线探测完毕。" },
  ];
  return (
    <Concept
      id="traceroute"
      title="traceroute 是怎么一站一站探路的"
      analogy="给包裹限定“最多经过 1 个分拣站”，第一个分拣站退回时盖了章，你就知道了第一站；再限定 2 站、3 站……把整条路线问出来。"
      steps={steps}
      scene={(step) => {
        const shownHops = step === 0 ? 0 : step === 1 ? 1 : step === 2 ? 2 : step === 3 ? 4 : 5;
        return (
          <div className="space-y-3">
            <Chip>TTL = {Math.max(1, shownHops)}</Chip>
            <ol className="m-0 list-none space-y-1 p-0 font-mono text-xs">
              {HOPS.map((hop, i) => (
                <li key={i} className={cn("rounded border border-border px-3 py-1 motion-safe:transition-opacity", i < shownHops ? "opacity-100" : "opacity-0", hop.host === "*" && "text-muted-foreground")}>
                  {i + 1}. {hop.host === "*" ? "* * *（不回话，但照常转发）" : `${hop.host}  ${hop.time}`}
                </li>
              ))}
            </ol>
          </div>
        );
      }}
      rows={mapping(
        ["“最多经过几个分拣站”", "TTL", "防止包在环路中永远打转"],
        ["分拣站盖章退回", "ICMP 超时消息", "让我们知道这一跳是谁"],
        ["有的分拣站不盖章", "* * *", "不回应探测不等于断网"],
      )}
      insight="判断哪里断了，要看“从哪一跳开始，后面全都没有回应”。中间某一跳没回话或者回得慢，只要后面的跳正常，就不是故障。"
    />
  );
}
