"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

import { Chip, Lane, MessageLines, Node, Segmented } from "@/components/education/scene-kit";

const PREFIX = "http-hands-on/";
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

// ---------------------------------------------------------------------------
// 1 · Journey: what happens after pressing Enter
// ---------------------------------------------------------------------------

const JOURNEY_STEPS: ConceptStep[] = [
  { title: "输入网址", description: "浏览器先把 https://library.test/ 拆开：用 HTTPS，主机是 library.test，路径是 /。" },
  { title: "问路：DNS 查询", description: "浏览器只知道名字，不知道地址，于是问 DNS：library.test 在哪？" },
  { title: "DNS 回答", description: "DNS 给出一个 IP 地址。这一步还不是 HTTP。" },
  { title: "建立连接", description: "浏览器连上服务器的 443 端口，并完成 TLS 握手，得到一条加密通道。" },
  { title: "发出 HTTP 请求", description: "终于轮到 HTTP：浏览器发出「GET / HTTP/1.1」。" },
  { title: "收到 HTML", description: "服务器回复 200 和一份 HTML。但页面还远没完成。" },
  { title: "继续请求更多资源", description: "HTML 里引用了样式、脚本、图片；脚本还会再调用 API。每一个都是独立的 HTTP 请求。" },
  { title: "页面画出来了", description: "注意 /api/loans 返回了 401：页面能打开，不代表每个请求都成功了。" },
];

const WATERFALL = [
  { name: "/", status: "200", at: 5 },
  { name: "/app.css", status: "200", at: 6 },
  { name: "/app.js", status: "200", at: 6 },
  { name: "/logo.svg", status: "200", at: 6 },
  { name: "/api/loans", status: "401", at: 7 },
];

function JourneyScene({ step }: { step: number }) {
  const dns = step === 1 ? { at: 15, label: "library.test 在哪？" } : step === 2 ? { at: 85, label: "203.0.113.7" } : null;
  const http =
    step === 3
      ? { at: 50, label: "TCP + TLS 握手", tone: "muted" as const }
      : step === 4
        ? { at: 80, label: "GET / HTTP/1.1", tone: "default" as const }
        : step >= 5
          ? { at: 20, label: step === 5 ? "200 OK · text/html" : "更多请求…", tone: "success" as const }
          : { at: 15, label: "", tone: "muted" as const };
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs">
        <span className={cn(step === 0 && "rounded bg-primary/15 px-1 text-primary")}>https://library.test/</span>
      </div>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[8rem_1fr_8rem] sm:grid-rows-2">
        <Node title="浏览器" subtitle="你的电脑" active={step === 0 || step >= 6} className="sm:row-span-2 sm:flex sm:h-full sm:flex-col sm:justify-center" />
        <Lane at={dns?.at ?? 50} label={dns?.label ?? ""} visible={Boolean(dns)} caption="DNS 查询（不是 HTTP）" />
        <Node title="DNS" subtitle="地址簿" active={step === 1 || step === 2} />
        <Lane at={http.at} label={http.label} visible={step >= 3} tone={http.tone} caption={step >= 3 ? "加密连接 · 443 端口" : undefined} />
        <Node title="服务器" subtitle="library.test" active={step >= 3 && step <= 5} />
      </div>
      <div className="rounded-lg border border-border bg-card p-2">
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Network（这次打开页面的全部 HTTP 请求）</p>
        <ul className="m-0 list-none p-0 space-y-1 font-mono text-[11px]">
          {WATERFALL.map((item, index) => (
            <li key={item.name} className={cn("flex items-center gap-2 motion-safe:transition-opacity motion-safe:duration-500", step >= item.at ? "opacity-100" : "opacity-0")}>
              <span className="w-24 truncate">{item.name}</span>
              <span className="h-2 rounded bg-primary/40" style={{ width: `${20 + index * 12}%`, marginLeft: `${index * 4}%` }} />
              <Chip tone={item.status === "200" ? "success" : "warning"}>{item.status}</Chip>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function JourneyConcept() {
  return (
    <Concept
      id="journey"
      title="按下回车之后"
      analogy="去图书馆借书：先查地址找到图书馆（DNS），走进大门（连接），再在借阅台递上借阅单（HTTP 请求）。拿到书单后，你可能还要为每一本书单独去取。"
      steps={JOURNEY_STEPS}
      scene={(step) => <JourneyScene step={step} />}
      rows={mapping(
        ["查图书馆地址", "DNS", "把域名换成 IP，不属于 HTTP"],
        ["走进大门", "TCP/QUIC + TLS 连接", "建立可靠、加密的通道"],
        ["递借阅单 / 拿回执", "HTTP 请求 / 响应", "表达要什么、结果如何"],
        ["为每本书分别取书", "页面里的多个子请求", "一个网页通常有几十个请求"],
      )}
      insight="HTTP 只负责「请求什么、结果如何」。找地址是 DNS 的事，安全通道是 TLS 的事。一个页面由很多次 HTTP 请求拼成。"
    />
  );
}

// ---------------------------------------------------------------------------
// 2 · URL anatomy and what reaches the server
// ---------------------------------------------------------------------------

const URL_PARTS = [
  { text: "https://", name: "方案 scheme", goes: "决定用 HTTPS，以及默认端口 443" },
  { text: "library.test", name: "主机 host", goes: "用于 DNS 查询，并写进 Host 请求头" },
  { text: ":443", name: "端口 port", goes: "连到服务器的哪个「门」；默认值通常省略" },
  { text: "/api/books", name: "路径 path", goes: "写进请求行，告诉服务器要哪个资源" },
  { text: "?q=实战&page=2", name: "查询 query", goes: "也写进请求行，由服务器解释" },
  { text: "#top", name: "片段 fragment", goes: "不发给服务器！浏览器自己用来定位页面位置" },
];

function UrlScene({ step }: { step: number }) {
  const requestLine = "GET /api/books?q=%E5%AE%9E%E6%88%98&page=2 HTTP/1.1";
  const sent = (index: number) => index === 3 || index === 4;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 font-mono text-sm">
        {URL_PARTS.map((part, index) => (
          <span
            key={part.text}
            className={cn(
              "rounded px-1 py-0.5 motion-safe:transition-colors motion-safe:duration-300",
              index === step ? (index === 5 ? "bg-destructive/15 text-destructive ring-1 ring-destructive/40" : "bg-primary/15 text-primary ring-1 ring-primary/40") : "text-muted-foreground",
            )}
          >
            {part.text}
          </span>
        ))}
      </div>
      <p className="text-sm">
        <strong>{URL_PARTS[step].name}</strong>：{URL_PARTS[step].goes}
      </p>
      <MessageLines
        lines={[requestLine, "Host: library.test", "Accept: application/json"]}
        shown={3}
        focus={step === 1 ? 1 : sent(step) ? 0 : undefined}
        notes={step === 5 ? { 0: "这里没有 #top" } : step === 4 ? { 0: "中文被百分号编码" } : {}}
      />
      {step === 5 && <Chip tone="danger">#top 只存在于浏览器里</Chip>}
    </div>
  );
}

export function UrlConcept() {
  return (
    <Concept
      id="url"
      title="一个 URL 的哪些部分会到达服务器"
      analogy="借阅单上写着：去哪家图书馆、哪个窗口、要哪本书、附加要求。而你夹在自己笔记本里的书签，图书馆员根本看不到——它就是 #片段。"
      steps={URL_PARTS.map((part) => ({ title: part.name, description: part.goes }))}
      scene={(step) => <UrlScene step={step} />}
      rows={mapping(
        ["哪家图书馆", "scheme + host + port", "确定连到哪台服务器"],
        ["要哪本书", "path", "确定资源"],
        ["附加要求", "query", "筛选、分页等参数"],
        ["自己笔记本里的书签", "fragment", "只在浏览器内部使用"],
      )}
      insight="请求行里只有路径和查询。主机进 Host 头。片段从不离开浏览器，所以服务器无法根据 # 后面的内容返回不同数据。"
    />
  );
}

// ---------------------------------------------------------------------------
// 3 · Anatomy of a request and its response
// ---------------------------------------------------------------------------

const MESSAGE_LINES = [
  "GET /api/books/2 HTTP/1.1",
  "Host: library.test",
  "Accept: application/json",
  "",
  "HTTP/1.1 200 OK",
  "Content-Type: application/json; charset=utf-8",
  "ETag: \"b2-v1\"",
  "",
  '{"id":2,"title":"HTTP 从入门到排错","author":"李明"}',
];

const MESSAGE_STEPS: { title: string; description: string; shown: number; focus: number; note: string }[] = [
  { title: "请求行", description: "方法 GET、请求目标 /api/books/2、协议版本。这一行说清「对哪个资源做什么」。", shown: 1, focus: 0, note: "方法 · 目标 · 版本" },
  { title: "Host 头", description: "同一台服务器可能托管很多网站，Host 说明要找哪一个。", shown: 2, focus: 1, note: "必需" },
  { title: "Accept 头", description: "告诉服务器「我希望拿到 JSON」。请求头是附加说明，名字不区分大小写。", shown: 3, focus: 2, note: "我想要的格式" },
  { title: "空行：头部结束", description: "一个空行表示头部结束。GET 一般没有正文，所以请求到此为止。", shown: 4, focus: 3, note: "头部到此结束" },
  { title: "状态行", description: "响应第一行：200 OK，表示请求成功。", shown: 5, focus: 4, note: "结果" },
  { title: "响应头", description: "Content-Type 说明正文是什么格式；ETag 是这一版内容的版本号，缓存章节会用到。", shown: 7, focus: 5, note: "正文的格式" },
  { title: "响应正文", description: "空行之后才是真正的数据。", shown: 9, focus: 8, note: "数据本身" },
];

export function MessageConcept() {
  return (
    <Concept
      id="message"
      title="一条请求和它的响应，逐行拆开"
      analogy="借阅单：第一行写「借 / 2 号书」，下面是附加说明（我要中文版），然后空一行。回执：第一行盖着「已办理」，下面是说明，最后附上书本身。"
      steps={MESSAGE_STEPS}
      scene={(step) => (
        <MessageLines lines={MESSAGE_LINES} shown={MESSAGE_STEPS[step].shown} focus={MESSAGE_STEPS[step].focus} notes={{ [MESSAGE_STEPS[step].focus]: MESSAGE_STEPS[step].note }} />
      )}
      rows={mapping(
        ["借阅单第一行", "请求行", "方法 + 目标 + 版本"],
        ["附加说明", "Header", "元数据：格式、身份、缓存……"],
        ["回执上的章", "状态行", "处理结果"],
        ["书本身", "Body", "可选的数据"],
      )}
      insight="请求和响应的结构相同：起始行 → 头部 → 空行 → 可选的正文。读懂这个结构，所有 HTTP 问题都有了下手的地方。"
    />
  );
}

// ---------------------------------------------------------------------------
// 4 · Redirect: the browser follows Location by itself
// ---------------------------------------------------------------------------

const REDIRECT_STEPS: ConceptStep[] = [
  { title: "请求旧地址", description: "读者点开了一个旧书签：/old-catalog。" },
  { title: "301 + Location", description: "服务器不返回数据，而是回答「搬家了」，并在 Location 头里写新地址。" },
  { title: "浏览器自动再请求", description: "看到 3xx + Location，浏览器自己发出第二个请求，你什么都不用做。" },
  { title: "200 拿到数据", description: "第二个请求成功。地址栏也变成了新地址。Network 面板里能看到两条记录。" },
];

const FAMILIES = [
  { code: "2xx", label: "成功" },
  { code: "3xx", label: "去别处 / 用缓存" },
  { code: "4xx", label: "请求这边要改" },
  { code: "5xx", label: "服务器出错" },
];

function RedirectScene({ step }: { step: number }) {
  const family = step <= 1 ? (step === 1 ? 1 : -1) : step === 3 ? 0 : -1;
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs">
        https://library.test{step >= 3 ? "/api/books?page=1" : "/old-catalog"}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <MessageLines lines={["GET /old-catalog HTTP/1.1", "", "HTTP/1.1 301 Moved Permanently", "Location: /api/books?page=1"]} shown={step >= 1 ? 4 : 1} focus={step === 1 ? 3 : 0} />
        <div className={cn("motion-safe:transition-opacity motion-safe:duration-500", step >= 2 ? "opacity-100" : "opacity-20")}>
          <MessageLines lines={["GET /api/books?page=1 HTTP/1.1", "", "HTTP/1.1 200 OK", "Content-Type: application/json"]} shown={step >= 3 ? 4 : step >= 2 ? 1 : 0} focus={step === 2 ? 0 : step === 3 ? 2 : undefined} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FAMILIES.map((item, index) => (
          <div key={item.code} className={cn("rounded-lg border p-2 text-center motion-safe:transition-colors", index === family ? "border-primary bg-primary/10" : "border-border")}>
            <p className="font-mono text-lg font-bold">{item.code}</p>
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RedirectConcept() {
  return (
    <Concept
      id="redirect"
      title="301 重定向：浏览器替你跑第二趟"
      analogy="你去旧窗口借书，工作人员说「搬到 3 号窗口了」，并给你一张写着新窗口的纸条。你拿着纸条再去一次。"
      steps={REDIRECT_STEPS}
      scene={(step) => <RedirectScene step={step} />}
      rows={mapping(
        ["「搬到 3 号窗口了」", "301 / 302 状态码", "资源在别处"],
        ["写着新窗口的纸条", "Location 头", "新地址"],
        ["你再跑一趟", "浏览器自动发第二个请求", "对页面脚本几乎透明"],
      )}
      insight="状态码首位数字说明谁该行动：3xx 让客户端去别处，4xx 让客户端改请求，5xx 是服务器的问题。具体怎么做，要看头部（如 Location、Retry-After、Allow）。"
    />
  );
}

// ---------------------------------------------------------------------------
// 5 · Retrying POST vs PUT
// ---------------------------------------------------------------------------

type RetryMethod = "POST" | "PUT";
const RETRY_STEPS: ConceptStep[] = [
  { title: "发送请求", description: "客户端发出请求，要下一笔订单。" },
  { title: "服务器执行", description: "服务器处理成功，数据库里多了一条记录。" },
  { title: "响应丢了", description: "回程网络断了一下，客户端没收到响应，不知道成功没有。" },
  { title: "客户端重试", description: "客户端只能再发一遍同样的请求。" },
  { title: "服务器再次执行", description: "关键时刻：重复执行同一个请求，服务器状态会怎样？" },
  { title: "对比结果", description: "幂等的请求重复多少次，效果都和一次相同。切换上方的方法看区别。" },
];

function RetryScene({ step, method }: { step: number; method: RetryMethod }) {
  const line = method === "POST" ? "POST /api/orders" : "PUT /api/orders/101";
  const orders = method === "POST" ? (step >= 4 ? ["#101", "#102"] : step >= 1 ? ["#101"] : []) : step >= 1 ? ["#101"] : [];
  const lane =
    step === 0 || step === 3
      ? { at: 80, label: step === 3 ? `${line}（重试）` : line, tone: "default" as const }
      : step === 2
        ? { at: 50, label: "201 Created", tone: "danger" as const }
        : step >= 4
          ? { at: 20, label: "201 Created", tone: "success" as const }
          : { at: 80, label: line, tone: "default" as const };
  const duplicated = method === "POST" && step >= 4;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[8rem_1fr_11rem]">
        <Node title="客户端" subtitle="借书 App" active={step === 0 || step === 3} />
        <Lane at={lane.at} label={lane.label} tone={lane.tone} caption={step === 2 ? "响应在网络中丢失" : undefined} />
        <Node title="服务器数据库" subtitle="orders 表" active={step === 1 || step === 4} tone={duplicated ? "danger" : step >= 4 ? "success" : "default"}>
          {orders.length === 0 ? (
            <span className="text-muted-foreground">（空）</span>
          ) : (
            <ul className="m-0 list-none p-0 space-y-0.5 font-mono">
              {orders.map((order) => (
                <li key={order}>{order} · 借《缓存的艺术》</li>
              ))}
            </ul>
          )}
        </Node>
      </div>
      {step === 5 && (
        <p className={cn("rounded-md px-3 py-2 text-sm", duplicated ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
          {duplicated ? "POST 不幂等：重试造成了重复订单。" : "PUT 幂等：把 101 号订单设置成同样的内容，做两次和做一次一样。"}
        </p>
      )}
    </div>
  );
}

export function RetryConcept() {
  const [method, setMethod] = React.useState<RetryMethod>("POST");
  return (
    <Concept
      id="retry"
      title="网络出错时重试，会不会重复下单？"
      analogy="「再借一本」交两次就是借两本；「把我的 101 号借阅改成《缓存的艺术》」说两遍，结果还是一本。"
      steps={RETRY_STEPS}
      scene={(step) => <RetryScene step={step} method={method} />}
      controls={<Segmented label="请求方法" value={method} options={[{ value: "POST", label: "POST" }, { value: "PUT", label: "PUT" }]} onChange={setMethod} />}
      rows={mapping(
        ["「再借一本」", "POST 到集合", "每次都新建，不幂等"],
        ["「把 101 号改成这样」", "PUT 到具体资源", "设置为同一状态，幂等"],
        ["没听清又说一遍", "超时重试", "只有幂等请求可以放心重试"],
      )}
      insight="幂等说的是对服务器状态的效果，不是响应必须一样。POST 想安全重试，要靠业务层的幂等键或唯一约束。"
    />
  );
}

// ---------------------------------------------------------------------------
// 6 · Accept vs Content-Type
// ---------------------------------------------------------------------------

type AcceptChoice = "application/json" | "text/html" | "image/png";
type BodyChoice = "application/json" | "text/plain";

function NegotiationScene({ step, accept, contentType }: { step: number; accept: AcceptChoice; contentType: BodyChoice }) {
  const reps: { type: AcceptChoice; label: string }[] = [
    { type: "application/json", label: "JSON 表示" },
    { type: "text/html", label: "HTML 页面" },
  ];
  const chosen = reps.find((rep) => rep.type === accept);
  if (step <= 1) {
    return (
      <div className="space-y-3">
        <MessageLines lines={["GET /api/books/2 HTTP/1.1", `Accept: ${accept}`]} shown={2} focus={1} notes={{ 1: "我想要这种格式" }} />
        <div className={cn("grid gap-2 sm:grid-cols-2 motion-safe:transition-opacity", step === 1 ? "opacity-100" : "opacity-30")}>
          {reps.map((rep) => (
            <Node key={rep.type} title={rep.label} subtitle={rep.type} active={step === 1 && rep.type === accept} />
          ))}
        </div>
        {step === 1 && (
          <p className="text-sm">{chosen ? `服务器挑出了 ${chosen.label}。` : "服务器没有 PNG 版本 → 406 Not Acceptable。"}</p>
        )}
      </div>
    );
  }
  if (step === 2) {
    return (
      <MessageLines
        lines={chosen ? ["HTTP/1.1 200 OK", `Content-Type: ${accept}`, "", accept === "text/html" ? "<h1>HTTP 从入门到排错</h1>" : '{"id":2,"title":"HTTP 从入门到排错"}'] : ["HTTP/1.1 406 Not Acceptable", "Content-Type: application/json", "", '{"available":["application/json","text/html"]}']}
        shown={4}
        focus={1}
        notes={{ 1: "正文实际是什么" }}
      />
    );
  }
  const ok = contentType === "application/json";
  return (
    <div className="space-y-3">
      <MessageLines lines={["POST /api/notes HTTP/1.1", `Content-Type: ${contentType}`, "", '{"title":"周末读完第三章"}']} shown={4} focus={1} notes={{ 1: "我发的正文是什么" }} />
      <p className={cn("rounded-md px-3 py-2 text-sm", ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
        {ok ? "服务器用 JSON 解析器读正文 → 201 Created" : "正文明明是 JSON，标签却写 text/plain，服务器拒绝猜测 → 415 Unsupported Media Type"}
      </p>
    </div>
  );
}

export function NegotiationConcept() {
  const [accept, setAccept] = React.useState<AcceptChoice>("application/json");
  const [contentType, setContentType] = React.useState<BodyChoice>("text/plain");
  return (
    <Concept
      id="negotiation"
      title="Accept 和 Content-Type：一个问，一个答"
      analogy="借书时说「我要电子版」是 Accept；还书时在袋子上贴标签「里面是光盘」是 Content-Type。标签贴错，馆员就不知道怎么处理。"
      steps={[
        { title: "Accept：我想要什么", description: "客户端在请求里声明能接受的格式。" },
        { title: "服务器挑选表示", description: "同一本书可以有 JSON、HTML 等不同表示。服务器按 Accept 挑一个；一个都不合适就是 406。" },
        { title: "Content-Type：我给的是什么", description: "响应用 Content-Type 标明正文的真实格式，客户端据此解析。" },
        { title: "反过来：请求正文也要标签", description: "客户端提交数据时，同样要用 Content-Type 说明正文格式。标签不对就是 415。" },
      ]}
      scene={(step) => <NegotiationScene step={step} accept={accept} contentType={contentType} />}
      controls={
        <div className="space-y-2">
          <Segmented
            label="Accept"
            value={accept}
            options={[
              { value: "application/json", label: "application/json" },
              { value: "text/html", label: "text/html" },
              { value: "image/png", label: "image/png" },
            ]}
            onChange={setAccept}
          />
          <Segmented
            label="请求的 Content-Type（第 4 步）"
            value={contentType}
            options={[
              { value: "text/plain", label: "text/plain" },
              { value: "application/json", label: "application/json" },
            ]}
            onChange={setContentType}
          />
        </div>
      }
      rows={mapping(
        ["「我要电子版」", "Accept", "客户端希望收到的格式"],
        ["袋子上的标签", "Content-Type", "这条消息正文的实际格式"],
        ["馆员不收没贴对标签的袋子", "415 Unsupported Media Type", "请求正文格式不被接受"],
        ["没有电子版", "406 Not Acceptable", "无法给出客户端想要的格式"],
      )}
      insight="Accept 只出现在请求里，问的是「想要什么」；Content-Type 跟着正文走，说的是「这是什么」。请求和响应都可以有 Content-Type。"
    />
  );
}

// ---------------------------------------------------------------------------
// 7 · Cookie jar and server session
// ---------------------------------------------------------------------------

const COOKIE_STEPS: ConceptStep[] = [
  { title: "登录请求", description: "浏览器把用户名和密码 POST 给 /api/session。" },
  { title: "服务器建会话", description: "密码正确。服务器在会话表里记下「sid-7 → xiaolin」，并用 Set-Cookie 把 sid-7 交给浏览器。" },
  { title: "浏览器存进 Cookie 罐", description: "浏览器按 Set-Cookie 的属性保存它。页面脚本不需要做任何事。" },
  { title: "下一次请求：自动附上", description: "请求 /api/loans 时，浏览器逐项检查：域名对吗？Path 覆盖吗？是 HTTPS 吗？是否跨站？全部满足才附上 Cookie。" },
  { title: "服务器查表认人", description: "服务器拿 sid-7 去会话表查到 xiaolin，再检查他能不能看这些数据。Cookie 本身只是一个编号。" },
];

function CookieScene({ step }: { step: number }) {
  const lane =
    step === 0
      ? { at: 80, label: "POST /api/session", tone: "default" as const }
      : step === 1 || step === 2
        ? { at: 20, label: "Set-Cookie: sid=sid-7", tone: "success" as const }
        : { at: 80, label: "Cookie: sid=sid-7", tone: "default" as const };
  const checks = ["域名 library.test ✓", "Path=/ 覆盖 /api/loans ✓", "HTTPS（Secure）✓", "同站请求（SameSite）✓"];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_1fr_10rem]">
        <Node title="浏览器" subtitle="Cookie 罐" active={step === 2 || step === 3}>
          {step >= 2 ? <span className="font-mono">sid=sid-7</span> : <span className="text-muted-foreground">（空）</span>}
        </Node>
        <Lane at={lane.at} label={lane.label} tone={lane.tone} />
        <Node title="服务器" subtitle="会话表" active={step === 1 || step === 4} tone={step === 4 ? "success" : "default"}>
          {step >= 1 ? <span className="font-mono">sid-7 → xiaolin</span> : <span className="text-muted-foreground">（空）</span>}
        </Node>
      </div>
      {step === 3 && (
        <div className="flex flex-wrap gap-1.5">
          {checks.map((check) => (
            <Chip key={check} tone="success">
              {check}
            </Chip>
          ))}
        </div>
      )}
      {step === 4 && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">200 OK：服务器通过查表认出了 xiaolin，返回他的借阅。</p>}
    </div>
  );
}

export function CookieConcept() {
  return (
    <Concept
      id="cookie"
      title="Cookie：浏览器替你出示借书证"
      analogy="办好借书证后，每次借书都要出示。证上只有一个编号，馆员要拿编号去系统里查是谁、有没有欠书。"
      steps={COOKIE_STEPS}
      scene={(step) => <CookieScene step={step} />}
      rows={mapping(
        ["办借书证", "登录 + Set-Cookie", "服务器发一个会话编号"],
        ["证放在钱包里", "浏览器 Cookie 罐", "按属性保存"],
        ["每次自动出示", "Cookie 请求头", "满足条件才自动附上"],
        ["馆员查系统", "服务端会话表", "编号本身不代表权限"],
      )}
      insight="HTTP 本身不记得你是谁。Cookie 让浏览器在每个请求里自动带上编号，由服务器查表认人。哪些请求会带上它，由 Path、Secure、SameSite 决定；HttpOnly 决定页面脚本能不能读到它。"
    />
  );
}

// ---------------------------------------------------------------------------
// 8 · Authentication gate, authorisation gate
// ---------------------------------------------------------------------------

type Credential = "none" | "expired" | "reader" | "librarian";
type Resource = "catalog" | "loans" | "reports";
const CREDENTIALS: { value: Credential; label: string }[] = [
  { value: "none", label: "没带 Cookie" },
  { value: "expired", label: "过期的会话" },
  { value: "reader", label: "读者 xiaolin" },
  { value: "librarian", label: "馆员" },
];
const RESOURCES: { value: Resource; label: string; path: string; needs: "public" | "login" | "librarian" }[] = [
  { value: "catalog", label: "公开书目", path: "/api/books", needs: "public" },
  { value: "loans", label: "我的借阅", path: "/api/loans", needs: "login" },
  { value: "reports", label: "馆员报表", path: "/api/admin/reports", needs: "librarian" },
];

function authOutcome(credential: Credential, resource: Resource) {
  const needs = RESOURCES.find((item) => item.value === resource)!.needs;
  if (needs === "public") return { gate: 0, status: 200, text: "公开资源，不需要知道你是谁。" };
  if (credential === "none" || credential === "expired") {
    return { gate: 1, status: 401, text: credential === "none" ? "没有凭据：服务器不知道你是谁。" : "会话编号查不到（已过期）：等同于没登录。" };
  }
  if (needs === "librarian" && credential !== "librarian") return { gate: 2, status: 403, text: "认出了你是 xiaolin，但读者无权查看报表。重新登录也没用。" };
  return { gate: 0, status: 200, text: "认证通过，权限也足够。" };
}

function AuthScene({ step, credential, resource }: { step: number; credential: Credential; resource: Resource }) {
  const outcome = authOutcome(credential, resource);
  const res = RESOURCES.find((item) => item.value === resource)!;
  const gateState = (gate: 1 | 2) => {
    if (step < gate) return "default" as const;
    if (outcome.gate === gate) return "danger" as const;
    if (outcome.gate !== 0 && outcome.gate < gate) return "default" as const;
    return "success" as const;
  };
  const skipped = res.needs === "public";
  return (
    <div className="space-y-3">
      <MessageLines lines={[`GET ${res.path} HTTP/1.1`, credential === "none" ? "（没有 Cookie）" : `Cookie: sid=${credential === "expired" ? "sid-old" : credential === "reader" ? "sid-7" : "sid-9"}`]} shown={2} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Node title="门 1 · 认证" subtitle="你是谁？" active={step === 1} tone={skipped ? "default" : gateState(1)}>
          {skipped ? "公开资源，跳过" : step >= 1 ? (outcome.gate === 1 ? "✗ 不认识 → 401" : "✓ 认出身份") : "等待中"}
        </Node>
        <Node title="门 2 · 授权" subtitle="你能做这件事吗？" active={step === 2} tone={skipped ? "default" : gateState(2)}>
          {skipped ? "公开资源，跳过" : step >= 2 ? (outcome.gate === 1 ? "（没走到这里）" : outcome.gate === 2 ? "✗ 权限不足 → 403" : "✓ 允许") : "等待中"}
        </Node>
        <Node title="结果" active={step === 3} tone={step >= 3 ? (outcome.status === 200 ? "success" : "danger") : "default"}>
          {step >= 3 ? (
            <>
              <span className="font-mono text-base font-bold">{outcome.status}</span>
              <p className="mt-1">{outcome.text}</p>
            </>
          ) : (
            "等待中"
          )}
        </Node>
      </div>
    </div>
  );
}

export function AuthConcept() {
  const [credential, setCredential] = React.useState<Credential>("reader");
  const [resource, setResource] = React.useState<Resource>("reports");
  return (
    <Concept
      id="auth"
      title="两道门：先认人（401），再看权限（403）"
      analogy="进图书馆先刷借书证：刷不出来，门卫说「请先办证」（401）。刷出来是普通读者，想进馆员办公室，就会被拦下：「你没有权限」（403）。"
      steps={[
        { title: "请求到达", description: "请求带着（或没带）会话 Cookie 到达服务器。先在上方选择凭据和资源。" },
        { title: "门 1：认证", description: "服务器根据 Cookie 查会话表，确认你是谁。失败返回 401：请重新登录。" },
        { title: "门 2：授权", description: "知道你是谁之后，检查你能不能访问这个资源。失败返回 403：换个账号或申请权限。" },
        { title: "结果", description: "换几种组合试试：401 和 403 出现在不同的门，修法也不同。" },
      ]}
      scene={(step) => <AuthScene step={step} credential={credential} resource={resource} />}
      controls={
        <div className="space-y-2">
          <Segmented label="凭据" value={credential} options={CREDENTIALS} onChange={setCredential} />
          <Segmented label="资源" value={resource} options={RESOURCES.map(({ value, label }) => ({ value, label }))} onChange={setResource} />
        </div>
      }
      rows={mapping(
        ["刷借书证", "认证 Authentication", "确认身份；失败是 401"],
        ["查能不能进办公室", "授权 Authorization", "确认权限；失败是 403"],
        ["证过期了", "会话失效", "表现和没登录一样"],
      )}
      insight="401 说「我不知道你是谁」，修法是登录或刷新凭据；403 说「我知道你是谁，但不行」，再登录一次也没用。"
    />
  );
}

// ---------------------------------------------------------------------------
// 9 · What an on-path observer can see and do
// ---------------------------------------------------------------------------

type Scheme = "http" | "https";

function TlsScene({ step, scheme }: { step: number; scheme: Scheme }) {
  const secure = scheme === "https";
  const observerView =
    step === 0
      ? secure
        ? ["连接到 203.0.113.7:443", "SNI：library.test", "加密数据 1.2 kB"]
        : ["POST /api/session HTTP/1.1", "Host: library.test", '{"username":"xiaolin","password":"read-more"}']
      : step === 1
        ? secure
          ? ["加密数据 4.8 kB（无法读懂）"]
          : ["HTTP/1.1 201 Created", "Set-Cookie: sid=sid-7"]
        : step === 2
          ? secure
            ? ["尝试修改密文 → 校验失败", "浏览器丢弃数据并断开"]
            : ['偷偷在 HTML 里插入 <script src="//ad.evil">', "浏览器照单全收"]
          : step === 3
            ? secure
              ? ["冒充 library.test", "但拿不出可信证书", "浏览器显示「连接不是私密连接」"]
              : ["冒充 library.test", "浏览器无从分辨"]
            : ["服务器本身的漏洞、越权", "HTTPS 管不了"];
  const bad = !secure && step < 4;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[8rem_1fr_8rem]">
        <Node title="读者" subtitle={`${scheme}://library.test`} />
        <Lane at={step === 1 ? 25 : 70} label={secure ? "加密数据（读不懂）" : step === 1 ? "201 + Set-Cookie" : "POST /api/session"} tone={secure ? "success" : "danger"} />
        <Node title="服务器" subtitle="library.test" />
      </div>
      <Node title="咖啡馆 Wi-Fi 上的旁观者" subtitle={["能看到什么（请求）", "能看到什么（响应）", "能否篡改", "能否冒充", "HTTPS 的边界"][step]} tone={step === 4 ? "default" : bad ? "danger" : "success"}>
        <ul className="m-0 list-none p-0 space-y-0.5 font-mono">
          {observerView.map((line) => (
            <li key={line} className="break-all">
              {line}
            </li>
          ))}
        </ul>
      </Node>
    </div>
  );
}

export function TlsConcept() {
  const [scheme, setScheme] = React.useState<Scheme>("http");
  return (
    <Concept
      id="tls"
      title="同一个网络里的旁观者，能看到什么？"
      analogy="明文 HTTP 像寄明信片：经手的人都能读、能改。HTTPS 像装进只有图书馆能开的保险袋，袋子上还有图书馆的防伪印章。"
      steps={[
        { title: "登录请求经过网络", description: "在公共 Wi-Fi 上，同一网络的人能看到经过的数据。切换上方的 HTTP / HTTPS 对比。" },
        { title: "响应经过网络", description: "会话 Cookie 在响应里回到浏览器。" },
        { title: "旁观者想篡改", description: "TLS 不仅加密，还会校验完整性：被改过的数据会被发现。" },
        { title: "旁观者想冒充服务器", description: "证书证明「我真的是 library.test」。没有可信证书，浏览器会拦下。" },
        { title: "HTTPS 不管什么", description: "TLS 只保护路上。服务器自己的 bug、越权、XSS，加密也挡不住。" },
      ]}
      scene={(step) => <TlsScene step={step} scheme={scheme} />}
      controls={<Segmented label="协议" value={scheme} options={[{ value: "http", label: "http://" }, { value: "https", label: "https://" }]} onChange={setScheme} />}
      rows={mapping(
        ["只有图书馆能打开的保险袋", "加密（机密性）", "路上的人读不懂"],
        ["袋子被拆过就看得出", "完整性校验", "篡改会被发现"],
        ["防伪印章", "证书 + 主机名校验", "确认对方真是这个网站"],
        ["保险袋管不了馆员办错事", "应用层安全", "权限、漏洞仍要服务器自己保证"],
      )}
      insight="HTTPS = HTTP + TLS。它让路上的人看不懂、改不了、冒充不了，但旁观者仍能看到你连接的是哪个网站，而且服务器本身的安全问题它管不了。"
    />
  );
}

// ---------------------------------------------------------------------------
// 10 · Cache freshness and revalidation
// ---------------------------------------------------------------------------

const CACHE_STEPS: { title: string; description: string; clock: string }[] = [
  { title: "第一次请求", description: "服务器返回 200、完整正文、ETag 版本号，以及 Cache-Control: max-age=60（60 秒内可直接用）。", clock: "0 秒" },
  { title: "新鲜期内：不发请求", description: "30 秒后再要这本书：缓存还新鲜，浏览器直接用副本，网络上什么都没发生。", clock: "30 秒" },
  { title: "过期了：带着版本号去问", description: "90 秒后副本过期，但不一定变了。浏览器发条件请求：If-None-Match: \"b2-v1\"。", clock: "90 秒" },
  { title: "304：没变，继续用", description: "服务器发现版本号没变，只回 304，不带正文。缓存重新计时。", clock: "90 秒" },
  { title: "内容更新后", description: "书的信息改了，版本变成 b2-v2。条件请求收到 200 和新正文，缓存被替换。", clock: "200 秒" },
];

function CacheScene({ step }: { step: number }) {
  const lane =
    step === 0
      ? { at: 25, label: "200 · ETag \"b2-v1\" · 1.8 kB", tone: "success" as const, visible: true }
      : step === 1
        ? { at: 50, label: "", tone: "muted" as const, visible: false }
        : step === 2
          ? { at: 75, label: 'If-None-Match: "b2-v1"', tone: "default" as const, visible: true }
          : step === 3
            ? { at: 25, label: "304 · 0 字节正文", tone: "success" as const, visible: true }
            : { at: 25, label: '200 · ETag "b2-v2" · 1.8 kB', tone: "success" as const, visible: true };
  const version = step >= 4 ? "b2-v2" : "b2-v1";
  const fresh = step === 1 ? "新鲜（还剩 30 秒）" : step === 2 ? "已过期，待验证" : step === 3 ? "新鲜（重新计时）" : "新鲜（60 秒）";
  return (
    <div className="space-y-3">
      <Chip>时钟：{CACHE_STEPS[step].clock}</Chip>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_1fr_9rem]">
        <Node title="浏览器缓存" subtitle="/api/books/2" active={step === 1} tone={step === 2 ? "default" : "success"}>
          <p className="font-mono">ETag {version}</p>
          <p>{fresh}</p>
        </Node>
        <Lane at={lane.at} label={lane.label} tone={lane.tone} visible={lane.visible} caption={step === 1 ? "没有网络请求" : undefined} />
        <Node title="服务器" subtitle={`当前版本 ${version}`} active={step !== 1} />
      </div>
    </div>
  );
}

export function CacheConcept() {
  return (
    <Concept
      id="cache"
      title="缓存：什么时候不问、什么时候带着版本号问"
      analogy="书借回家后，在到期日前直接看（新鲜期）。过了日子，你带着版本号去问：「还是这一版吗？」没变就继续看手里这本（304），变了就换新的（200）。"
      steps={CACHE_STEPS}
      scene={(step) => <CacheScene step={step} />}
      rows={mapping(
        ["到期日", "Cache-Control: max-age", "多久内不用问"],
        ["版本号", "ETag", "标识这一版内容"],
        ["「还是这一版吗？」", "If-None-Match 条件请求", "让服务器判断有没有变"],
        ["「没变，继续看」", "304 Not Modified", "不重传正文"],
      )}
      insight="max-age 决定多久内连问都不问，ETag + 304 决定问了之后要不要重传。no-cache 不是「不缓存」，而是「每次都先验证」；真正不存的是 no-store。"
    />
  );
}
