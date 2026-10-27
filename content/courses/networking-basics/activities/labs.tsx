"use client";

import * as React from "react";
import { Plus, Terminal, Trash2 } from "lucide-react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { Button } from "@/components/ui/button";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import {
  ARP_CAPTURE,
  ARP_DEVICES,
  ARP_QUESTIONS,
  type ArpQuestionId,
  DNS_CAUSES,
  DNS_RECORDS,
  FIREWALL_INITIAL,
  FIREWALL_MAX,
  HOSTS_LINES,
  LAPTOP,
  LAPTOP_INITIAL,
  NAT_DEVICES_LABEL,
  NAT_INITIAL,
  NAT_MAX,
  PRINTER_INITIAL,
  type PrinterConfig,
  ROUTE_INITIAL,
  ROUTE_MAX,
  TCP_CAPTURE,
  TCP_QUESTIONS,
  TRACE_BROKEN,
  TRACE_OK,
  TRACE_PINGS,
  TRACE_QUESTIONS,
  type TcpQuestionId,
  type TraceQuestionId,
  evaluateFirewall,
  evaluateNat,
  evaluatePrinter,
  evaluateRoutes,
} from "../simulation/labs";
import {
  type FirewallRule,
  type Forward,
  HOME,
  type HostConfig,
  NEXT_HOPS,
  type NextHop,
  type Protocol,
  type Reservation,
  type Route,
  type Source,
  formatIp,
  maskToPrefix,
  networkOf,
  parseIp,
  runCommand,
} from "../simulation/net";

const selectClass = "mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm";
const inputClass = "mt-1 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm";
const cellInput = "w-full min-w-0 rounded-md border border-border bg-background p-1.5 font-mono text-xs";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string, max = 60): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function Code({ children }: { children: React.ReactNode }) {
  return <pre className="m-0 overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">{children}</pre>;
}

function GoalList({ goals }: { goals: { id: string; label: string; ok: boolean }[] }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
      {goals.map((goal) => (
        <li key={goal.id} className="rounded-md border border-border px-3 py-2" data-goal={goal.id} data-ok={goal.ok}>
          <Verdict ok={goal.ok}>{goal.label}</Verdict>
        </li>
      ))}
    </ul>
  );
}

/** Radio and free-text questions with answers kept in one record. */
function Questions<T extends string>({
  questions,
  answers,
  onChange,
  locked,
}: {
  questions: readonly { id: T; question: string; kind?: string; options?: readonly { id: string; label: string }[] }[];
  answers: Partial<Record<T, string>>;
  onChange: (id: T, value: string) => void;
  locked: boolean;
}) {
  return (
    <div className="space-y-3">
      {questions.map((item, index) => (
        <section key={item.id} className="space-y-2 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">
            {index + 1}. {item.question}
          </p>
          {item.options ? (
            <div className="grid gap-2">
              {item.options.map((option) => (
                <label key={option.id} className="flex items-start gap-2 text-sm">
                  <input type="radio" name={`q-${item.id}`} disabled={locked} checked={answers[item.id] === option.id} onChange={() => onChange(item.id, option.id)} className="mt-1" />
                  {option.label}
                </label>
              ))}
            </div>
          ) : (
            <input aria-label={item.question} disabled={locked} value={answers[item.id] ?? ""} maxLength={40} spellCheck={false} onChange={(event) => onChange(item.id, event.target.value)} className={cn(inputClass, "max-w-xs")} />
          )}
        </section>
      ))}
    </div>
  );
}

function normalizeAnswers<T extends string>(value: unknown, ids: readonly T[]): Partial<Record<T, string>> {
  const raw = asRecord(value);
  return Object.fromEntries(ids.filter((id) => typeof raw[id] === "string").map((id) => [id, text(raw[id], "", 40)])) as Partial<Record<T, string>>;
}

// ---------------------------------------------------------------------------
// Ch2 · Printer on the wrong subnet
// ---------------------------------------------------------------------------

type SubnetState = { config: PrinterConfig; passed: boolean };
const SUBNET_INITIAL: SubnetState = { config: { ...PRINTER_INITIAL }, passed: false };
function normalizeSubnet(value: unknown): SubnetState {
  const record = asRecord(value);
  const config = asRecord(record.config);
  return {
    config: { ip: text(config.ip, PRINTER_INITIAL.ip, 20), mask: text(config.mask, PRINTER_INITIAL.mask, 20), gateway: text(config.gateway, PRINTER_INITIAL.gateway, 20) },
    passed: record.passed === true,
  };
}

export function SubnetLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<SubnetState>(SUBNET_INITIAL, normalizeSubnet);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluatePrinter(state.config);
  const ip = parseIp(state.config.ip);
  const prefix = maskToPrefix(state.config.mask);
  const set = (key: keyof PrinterConfig, value: string) => setState((current) => ({ ...current, config: { ...current.config, [key]: value } }));
  return (
    <div className="space-y-5" data-testid="networking-basics-subnet">
      <Ticket goal="改打印机的网络设置，让下面五个条件都满足。">
        刚买的打印机按说明书设了一个固定地址，可家里的笔记本怎么也找不到它。下面是路由器的局域网设置和家里现有的设备。
      </Ticket>
      <div className="grid gap-4 lg:grid-cols-2">
        <Code>{`路由器 · 局域网设置
地址       192.168.1.1
子网掩码   255.255.255.0
DHCP 地址池 192.168.1.100 ～ 192.168.1.199`}</Code>
        <Code>{HOME.devices.map((device) => `${device.ip.padEnd(15)} ${device.name}`).join("\n")}</Code>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["ip", "打印机 IP 地址"],
            ["mask", "子网掩码"],
            ["gateway", "默认网关"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-xs font-medium">
            {label}
            <input aria-label={label} disabled={locked} value={state.config[key]} maxLength={20} spellCheck={false} onChange={(event) => set(key, event.target.value)} className={inputClass} />
          </label>
        ))}
      </div>
      <Code>{`笔记本：${LAPTOP.ip}/${LAPTOP.prefix} → 所在网段 192.168.1.0/24
打印机：${state.config.ip} / ${state.config.mask} → ${
        ip !== null && prefix !== null ? `所在网段 ${formatIp(networkOf(ip, prefix))}/${prefix}` : "地址或掩码无效"
      }`}</Code>
      <p className="text-sm leading-relaxed">{result.story}</p>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交打印机设置" last={last}
        onSubmit={() => void submit({ ...state.config }, "net_subnet_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch3 · ARP capture
// ---------------------------------------------------------------------------

type AnswerState<T extends string> = { answers: Partial<Record<T, string>>; passed: boolean };

function useAnswerLab<T extends string>(ids: readonly T[]) {
  const initial = React.useMemo(() => ({ answers: {}, passed: false }) as AnswerState<T>, []);
  const normalize = React.useCallback(
    (value: unknown): AnswerState<T> => {
      const record = asRecord(value);
      return { answers: normalizeAnswers(record.answers, ids), passed: record.passed === true };
    },
    [ids],
  );
  return useActivityState<AnswerState<T>>(initial, normalize);
}

const ARP_IDS = ARP_QUESTIONS.map((item) => item.id);

export function ArpLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useAnswerLab<ArpQuestionId>(ARP_IDS);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-5" data-testid="networking-basics-arp">
      <Ticket goal="读懂这段抓包，回答下面四个问题。">
        上周买的扫描仪（192.168.1.60）时好时坏：有时扫描件能传到笔记本，有时笔记本说“找不到设备”。下面是笔记本上抓到的 ARP 包。
      </Ticket>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="m-0 w-full min-w-[36rem] text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {["No.", "时间", "源 MAC", "目的 MAC", "内容"].map((head) => (
                <th key={head} className="px-3 py-2 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ARP_CAPTURE.map((packet) => (
              <tr key={packet.no} className="border-t border-border/70 font-mono">
                <td className="px-3 py-2">{packet.no}</td>
                <td className="px-3 py-2">{packet.time}</td>
                <td className="px-3 py-2">{packet.src}</td>
                <td className="px-3 py-2">{packet.dst}</td>
                <td className="px-3 py-2 font-sans">{packet.info}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Code>{["家里设备的 MAC 地址", ...ARP_DEVICES.map((device) => `${device.mac}  ${device.name}`)].join("\n")}</Code>
      <Questions questions={ARP_QUESTIONS} answers={state.answers} locked={locked} onChange={(id, value) => setState((current) => ({ ...current, answers: { ...current.answers, [id]: value } }))} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交答案" last={last}
        onSubmit={() => void submit({ answers: state.answers }, "net_arp_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch4 · Routing table
// ---------------------------------------------------------------------------

type RouteState = { routes: Route[]; passed: boolean };
const ROUTE_STATE_INITIAL: RouteState = { routes: ROUTE_INITIAL.map((route) => ({ ...route })), passed: false };
function normalizeRoute(value: unknown): RouteState {
  const record = asRecord(value);
  const routes = Array.isArray(record.routes)
    ? record.routes.slice(0, ROUTE_MAX).map((item) => {
        const row = asRecord(item);
        const via = NEXT_HOPS.some((hop) => hop.id === row.via) ? (row.via as NextHop) : "direct";
        return { destination: text(row.destination, "", 20), via };
      })
    : ROUTE_STATE_INITIAL.routes;
  return { routes, passed: record.passed === true };
}

export function RouteLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<RouteState>(ROUTE_STATE_INITIAL, normalizeRoute);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateRoutes(state.routes);
  const patch = (index: number, part: Partial<Route>) =>
    setState((current) => ({ ...current, routes: current.routes.map((route, i) => (i === index ? { ...route, ...part } : route)) }));
  return (
    <div className="space-y-5" data-testid="networking-basics-route">
      <Ticket goal="修改办公室路由器的路由表，让下面三个目的地都能送达。">
        分公司的网管调整过路由器之后，同事反映外网全都打不开，访问总部的文件服务器倒是正常。办公室网络是 10.8.1.0/24，总部的服务器在 10.8.20.0/24。
      </Ticket>
      <div className="space-y-2">
        <p className="text-xs font-semibold">办公室路由器的路由表（按最长前缀匹配）</p>
        {state.routes.map((route, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <input aria-label={`第 ${index + 1} 条路由 目的网段`} disabled={locked} value={route.destination} maxLength={20} spellCheck={false} placeholder="例如 10.8.0.0/16"
              onChange={(event) => patch(index, { destination: event.target.value })} className={cellInput} />
            <select aria-label={`第 ${index + 1} 条路由 下一跳`} disabled={locked} value={route.via} onChange={(event) => patch(index, { via: event.target.value as NextHop })} className={cellInput}>
              {NEXT_HOPS.map((hop) => (
                <option key={hop.id} value={hop.id}>{hop.label}</option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="sm" disabled={locked} aria-label={`删除第 ${index + 1} 条路由`}
              onClick={() => setState((current) => ({ ...current, routes: current.routes.filter((_, i) => i !== index) }))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={locked || state.routes.length >= ROUTE_MAX}
          onClick={() => setState((current) => ({ ...current, routes: [...current.routes, { destination: "", via: "direct" }] }))}>
          <Plus className="size-4" /> 添加路由
        </Button>
        {result.problems.map((problem) => (
          <p key={problem} className="text-xs text-destructive">{problem}</p>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {result.results.map((item) => (
          <section key={item.id} className="min-w-0 space-y-2 rounded-xl border border-border p-3" data-scenario={item.id} data-ok={item.trace.outcome === "delivered"}>
            <Verdict ok={item.trace.outcome === "delivered"}>{item.label}</Verdict>
            <ol className="m-0 list-none space-y-1 p-0 text-xs">
              {item.trace.hops.map((hop, i) => (
                <li key={i} className="font-mono">
                  {i + 1}. {hop.node}：<span className="font-sans text-muted-foreground">{hop.note}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs">{item.trace.summary}</p>
          </section>
        ))}
      </div>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交路由表" last={last}
        onSubmit={() => void submit({ routes: state.routes }, "net_route_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch5 · DNS diagnosis
// ---------------------------------------------------------------------------

type DnsState = { causes: Record<string, string>; removeLine: string; passed: boolean };
const DNS_INITIAL: DnsState = { causes: {}, removeLine: "", passed: false };
function normalizeDns(value: unknown): DnsState {
  const record = asRecord(value);
  const ids = new Set(DNS_RECORDS.map((item) => item.id));
  const allowed = DNS_CAUSES.map((item) => item.id) as string[];
  const causes = Object.fromEntries(Object.entries(asRecord(record.causes)).filter(([key, entry]) => ids.has(key) && allowed.includes(entry as string))) as Record<string, string>;
  return { causes, removeLine: HOSTS_LINES.includes(record.removeLine as string) ? (record.removeLine as string) : "", passed: record.passed === true };
}

export function DnsLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<DnsState>(DNS_INITIAL, normalizeDns);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-5" data-testid="networking-basics-dns">
      <Ticket goal="为每条记录判断原因；再修好馆员电脑的 hosts 文件。">
        昨晚 library.test 搬到了新服务器（198.51.100.10，旧地址是 198.51.100.7）。今天上午陆续收到几条投诉，每条都附上了用户机器上的命令输出。
      </Ticket>
      <div className="space-y-3">
        {DNS_RECORDS.map((record) => (
          <section key={record.id} className="grid gap-3 rounded-xl border border-border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-medium">{record.who}</p>
              <p className="text-xs text-muted-foreground">{record.symptom}</p>
              <Code>{record.output}</Code>
            </div>
            <label className="text-xs font-medium">
              原因
              <select aria-label={`${record.who} 的原因`} disabled={locked} value={state.causes[record.id] ?? ""}
                onChange={(event) => setState((current) => ({ ...current, causes: { ...current.causes, [record.id]: event.target.value } }))} className={selectClass}>
                <option value="">请选择</option>
                {DNS_CAUSES.map((cause) => (
                  <option key={cause.id} value={cause.id}>{cause.label}</option>
                ))}
              </select>
            </label>
          </section>
        ))}
      </div>
      <fieldset className="space-y-2 rounded-xl border border-dashed border-border p-4">
        <legend className="px-1 text-sm font-semibold">馆员电脑的 hosts 文件：删掉哪一行？</legend>
        {HOSTS_LINES.map((line) => (
          <label key={line} className="flex items-center gap-2 font-mono text-sm">
            <input type="radio" name="hosts-line" disabled={locked} checked={state.removeLine === line} onChange={() => setState((current) => ({ ...current, removeLine: line }))} />
            {line}
          </label>
        ))}
      </fieldset>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交诊断报告" last={last}
        onSubmit={() => void submit({ causes: state.causes, removeLine: state.removeLine }, "net_dns_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch6 · Firewall
// ---------------------------------------------------------------------------

type FirewallState = { rules: FirewallRule[]; passed: boolean };
const FIREWALL_STATE_INITIAL: FirewallState = { rules: FIREWALL_INITIAL.map((rule) => ({ ...rule })), passed: false };
function normalizeFirewall(value: unknown): FirewallState {
  const record = asRecord(value);
  const rules = Array.isArray(record.rules)
    ? record.rules.slice(0, FIREWALL_MAX).map((item) => {
        const row = asRecord(item);
        return {
          protocol: row.protocol === "udp" ? "udp" : "tcp",
          port: Number.isInteger(row.port) ? (row.port as number) : 0,
          source: row.source === "office" ? "office" : "any",
        } as FirewallRule;
      })
    : FIREWALL_STATE_INITIAL.rules;
  return { rules, passed: record.passed === true };
}

export function FirewallLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<FirewallState>(FIREWALL_STATE_INITIAL, normalizeFirewall);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateFirewall(state.rules);
  const patch = (index: number, part: Partial<FirewallRule>) =>
    setState((current) => ({ ...current, rules: current.rules.map((rule, i) => (i === index ? { ...rule, ...part } : rule)) }));
  return (
    <div className="space-y-5" data-testid="networking-basics-firewall">
      <Ticket goal="调整服务器的防火墙放行规则（没写的一律拦截），让六个场景都符合预期。">
        library.test 的新服务器上线后：网站打不开、读书会的语音连不上，安全扫描还报告“SSH 和数据库端口对整个互联网开放”。办公室的出口地址段是 203.0.113.0/24。
      </Ticket>
      <Code>{`$ ss -lntup   # 服务器上正在监听的端口
tcp  0.0.0.0:80     nginx
tcp  0.0.0.0:443    nginx
tcp  0.0.0.0:22     sshd
tcp  0.0.0.0:5432   postgres（网站程序在本机访问它）
udp  0.0.0.0:3478   语音通话中继`}</Code>
      <div className="space-y-2">
        <p className="text-xs font-semibold">放行规则</p>
        <div className="grid grid-cols-[5rem_6rem_minmax(0,1fr)_auto] gap-2 text-[11px] text-muted-foreground" aria-hidden>
          <span>协议</span>
          <span>端口</span>
          <span>允许的来源</span>
          <span className="w-9" />
        </div>
        {state.rules.map((rule, index) => (
          <div key={index} className="grid grid-cols-[5rem_6rem_minmax(0,1fr)_auto] gap-2">
            <select aria-label={`第 ${index + 1} 条规则 协议`} disabled={locked} value={rule.protocol} onChange={(event) => patch(index, { protocol: event.target.value as Protocol })} className={cellInput}>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
            <input aria-label={`第 ${index + 1} 条规则 端口`} disabled={locked} inputMode="numeric" value={rule.port || ""} maxLength={5}
              onChange={(event) => patch(index, { port: Number.parseInt(event.target.value, 10) || 0 })} className={cellInput} />
            <select aria-label={`第 ${index + 1} 条规则 来源`} disabled={locked} value={rule.source} onChange={(event) => patch(index, { source: event.target.value as Source })} className={cellInput}>
              <option value="any">任何地址</option>
              <option value="office">只允许办公室 203.0.113.0/24</option>
            </select>
            <Button type="button" variant="ghost" size="sm" disabled={locked} aria-label={`删除第 ${index + 1} 条规则`}
              onClick={() => setState((current) => ({ ...current, rules: current.rules.filter((_, i) => i !== index) }))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={locked || state.rules.length >= FIREWALL_MAX}
          onClick={() => setState((current) => ({ ...current, rules: [...current.rules, { protocol: "tcp", port: 0, source: "any" }] }))}>
          <Plus className="size-4" /> 添加规则
        </Button>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {result.results.map((item) => (
          <li key={item.id} className="rounded-md border border-border px-3 py-2" data-scenario={item.id} data-ok={item.ok}>
            <Verdict ok={item.ok}>{item.label}</Verdict>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.protocol.toUpperCase()} {item.port}，来自{item.from === "office" ? "办公室" : "互联网"}：{item.allowed ? "被放行" : "被拦截"}（应该{item.want ? "放行" : "拦截"}）
            </p>
          </li>
        ))}
      </ul>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交防火墙规则" last={last}
        onSubmit={() => void submit({ rules: state.rules }, "net_firewall_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch7 · TCP capture
// ---------------------------------------------------------------------------

const TCP_IDS = TCP_QUESTIONS.map((item) => item.id);

export function TcpLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useAnswerLab<TcpQuestionId>(TCP_IDS);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-5" data-testid="networking-basics-tcp">
      <Ticket goal="读懂这段抓包，回答五个问题。">
        读者往图书馆上传一个 4000 字节的文件时网络抖了一下，可服务器最后收到的文件完好无损。这是在读者电脑上抓到的包。
      </Ticket>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="m-0 w-full min-w-[34rem] text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {["No.", "方向", "标志", "seq", "ack", "数据长度", ""].map((head, i) => (
                <th key={i} className="px-3 py-2 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TCP_CAPTURE.map((packet) => (
              <tr key={packet.no} className="border-t border-border/70 font-mono">
                <td className="px-3 py-1.5">{packet.no}</td>
                <td className="px-3 py-1.5">{packet.dir === "→" ? "电脑 → 服务器" : "服务器 → 电脑"}</td>
                <td className="px-3 py-1.5">{packet.flags}</td>
                <td className="px-3 py-1.5">{packet.seq}</td>
                <td className="px-3 py-1.5">{packet.ack ?? ""}</td>
                <td className="px-3 py-1.5">{packet.len}</td>
                <td className="px-3 py-1.5 font-sans text-muted-foreground">{packet.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">为了好读，序号从 0 开始计，和抓包软件里的“相对序号”一样。</p>
      <Questions questions={TCP_QUESTIONS} answers={state.answers} locked={locked} onChange={(id, value) => setState((current) => ({ ...current, answers: { ...current.answers, [id]: value } }))} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交答案" last={last}
        onSubmit={() => void submit({ answers: state.answers }, "net_tcp_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch8 · NAT and DHCP reservations
// ---------------------------------------------------------------------------

type NatState = { forwards: Forward[]; reservations: Record<"nas" | "console", string>; passed: boolean };
const NAT_STATE_INITIAL: NatState = { forwards: NAT_INITIAL.forwards.map((rule) => ({ ...rule })), reservations: { nas: "", console: "" }, passed: false };
function normalizeNat(value: unknown): NatState {
  const record = asRecord(value);
  const forwards = Array.isArray(record.forwards)
    ? record.forwards.slice(0, NAT_MAX).map((item) => {
        const row = asRecord(item);
        return {
          externalPort: Number.isInteger(row.externalPort) ? (row.externalPort as number) : 0,
          protocol: row.protocol === "udp" ? "udp" : "tcp",
          internalIp: text(row.internalIp, "", 15),
          internalPort: Number.isInteger(row.internalPort) ? (row.internalPort as number) : 0,
        } as Forward;
      })
    : NAT_STATE_INITIAL.forwards;
  const reservations = asRecord(record.reservations);
  return { forwards, reservations: { nas: text(reservations.nas, "", 15), console: text(reservations.console, "", 15) }, passed: record.passed === true };
}

function toReservations(value: Record<"nas" | "console", string>): Reservation[] {
  return (["nas", "console"] as const).filter((device) => value[device].trim()).map((device) => ({ device, ip: value[device].trim() }));
}

export function NatLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<NatState>(NAT_STATE_INITIAL, normalizeNat);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const reservations = toReservations(state.reservations);
  const result = evaluateNat(state.forwards, reservations);
  const patch = (index: number, part: Partial<Forward>) =>
    setState((current) => ({ ...current, forwards: current.forwards.map((rule, i) => (i === index ? { ...rule, ...part } : rule)) }));
  return (
    <div className="space-y-5" data-testid="networking-basics-nat">
      <Ticket goal="调整端口转发和地址保留：三个场景在“现在”和“路由器重启之后”都要符合预期。">
        家里的公网地址是 203.0.113.45。朋友说相册有时能打开有时打不开，游戏机一直提示“NAT 类型严格”，而且上周路由器重启过一次。
      </Ticket>
      <Code>{`路由器 · DHCP 当前分配
${NAT_DEVICES_LABEL}`}</Code>
      <div className="space-y-2">
        <p className="text-xs font-semibold">端口转发</p>
        <div className="grid grid-cols-[5rem_4.5rem_minmax(0,1fr)_5rem_auto] gap-2 text-[11px] text-muted-foreground" aria-hidden>
          <span>外部端口</span>
          <span>协议</span>
          <span>转发到内部地址</span>
          <span>内部端口</span>
          <span className="w-9" />
        </div>
        {state.forwards.map((rule, index) => (
          <div key={index} className="grid grid-cols-[5rem_4.5rem_minmax(0,1fr)_5rem_auto] gap-2">
            <input aria-label={`第 ${index + 1} 条转发 外部端口`} disabled={locked} inputMode="numeric" value={rule.externalPort || ""} maxLength={5}
              onChange={(event) => patch(index, { externalPort: Number.parseInt(event.target.value, 10) || 0 })} className={cellInput} />
            <select aria-label={`第 ${index + 1} 条转发 协议`} disabled={locked} value={rule.protocol} onChange={(event) => patch(index, { protocol: event.target.value as Protocol })} className={cellInput}>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
            <input aria-label={`第 ${index + 1} 条转发 内部地址`} disabled={locked} value={rule.internalIp} maxLength={15} spellCheck={false}
              onChange={(event) => patch(index, { internalIp: event.target.value })} className={cellInput} />
            <input aria-label={`第 ${index + 1} 条转发 内部端口`} disabled={locked} inputMode="numeric" value={rule.internalPort || ""} maxLength={5}
              onChange={(event) => patch(index, { internalPort: Number.parseInt(event.target.value, 10) || 0 })} className={cellInput} />
            <Button type="button" variant="ghost" size="sm" disabled={locked} aria-label={`删除第 ${index + 1} 条转发`}
              onClick={() => setState((current) => ({ ...current, forwards: current.forwards.filter((_, i) => i !== index) }))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={locked || state.forwards.length >= NAT_MAX}
          onClick={() => setState((current) => ({ ...current, forwards: [...current.forwards, { externalPort: 0, protocol: "tcp", internalIp: "", internalPort: 0 }] }))}>
          <Plus className="size-4" /> 添加转发
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["nas", "console"] as const).map((device) => (
          <label key={device} className="text-xs font-medium">
            DHCP 地址保留：{device === "nas" ? "NAS 存储" : "游戏机"}（留空表示不保留）
            <input aria-label={`${device === "nas" ? "NAS" : "游戏机"} 保留地址`} disabled={locked} value={state.reservations[device]} maxLength={15} spellCheck={false}
              onChange={(event) => setState((current) => ({ ...current, reservations: { ...current.reservations, [device]: event.target.value } }))} className={inputClass} />
          </label>
        ))}
      </div>
      {result.reservationProblems.map((problem) => (
        <p key={problem} className="text-xs text-destructive">{problem}</p>
      ))}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="m-0 w-full min-w-[36rem] text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">场景</th>
              <th className="px-3 py-2 font-medium">现在</th>
              <th className="px-3 py-2 font-medium">路由器重启之后</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((item) => (
              <tr key={item.id} className="border-t border-border/70 align-top" data-scenario={item.id} data-ok={item.ok}>
                <td className="px-3 py-2">{item.label}</td>
                {item.outcomes.map((outcome) => (
                  <td key={outcome.time} className="px-3 py-2">
                    <Verdict ok={outcome.ok}>{outcome.ok ? "符合预期" : "不符合"}</Verdict>
                    <p className="mt-1 text-muted-foreground">{outcome.note}</p>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交路由器设置" last={last}
        onSubmit={() => void submit({ forwards: state.forwards, reservations }, "net_nat_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch9 · Traceroute
// ---------------------------------------------------------------------------

const TRACE_IDS = TRACE_QUESTIONS.map((item) => item.id);

function traceText(rows: { hop: number; host: string; times: string }[]) {
  return ["$ traceroute library.test", ...rows.map((row) => `${String(row.hop).padStart(2)}  ${row.times.padEnd(22)} ${row.host === "*" ? "" : row.host}`)].join("\n");
}

export function TraceLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useAnswerLab<TraceQuestionId>(TRACE_IDS);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-5" data-testid="networking-basics-trace">
      <Ticket goal="读懂两份 traceroute 和一组 ping 结果，回答三个问题。">
        上周网站一切正常，你顺手存了一份 traceroute；今天读者说网站打不开，你又跑了一份，还 ping 了几个关键节点。
      </Ticket>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold">上周（正常时）</p>
          <Code>{traceText(TRACE_OK)}</Code>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold">今天（打不开时）</p>
          <Code>{traceText(TRACE_BROKEN)}</Code>
        </div>
      </div>
      <Code>{["今天的 ping 结果", ...TRACE_PINGS.map((item) => `${item.target.padEnd(30)} ${item.result}`)].join("\n")}</Code>
      <Questions questions={TRACE_QUESTIONS} answers={state.answers} locked={locked} onChange={(id, value) => setState((current) => ({ ...current, answers: { ...current.answers, [id]: value } }))} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交判断" last={last}
        onSubmit={() => void submit({ answers: state.answers }, "net_trace_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch10 · Get a new laptop online
// ---------------------------------------------------------------------------

type LaptopState = { config: HostConfig; history: { command: string; output: string }[]; draft: string; passed: boolean };
const LAPTOP_STATE_INITIAL: LaptopState = { config: { ...LAPTOP_INITIAL }, history: [], draft: "ipconfig", passed: false };
function normalizeLaptop(value: unknown): LaptopState {
  const record = asRecord(value);
  const config = asRecord(record.config);
  const history = Array.isArray(record.history)
    ? record.history.slice(-12).map((item) => {
        const row = asRecord(item);
        return { command: text(row.command, "", 80), output: text(row.output, "", 600) };
      })
    : [];
  return {
    config: {
      ip: text(config.ip, LAPTOP_INITIAL.ip, 15),
      mask: text(config.mask, LAPTOP_INITIAL.mask, 15),
      gateway: text(config.gateway, LAPTOP_INITIAL.gateway, 15),
      dns: text(config.dns, LAPTOP_INITIAL.dns, 15),
    },
    history,
    draft: text(record.draft, "ipconfig", 80),
    passed: record.passed === true,
  };
}

export function LaptopLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<LaptopState>(LAPTOP_STATE_INITIAL, normalizeLaptop);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const run = () =>
    setState((current) => {
      const command = current.draft.trim();
      if (!command) return current;
      return { ...current, history: [...current.history, { command, output: runCommand(current.config, command) }].slice(-12) };
    });
  return (
    <div className="space-y-5" data-testid="networking-basics-laptop">
      <Ticket goal="用命令查清问题，改好网络设置，让新笔记本能打开 https://library.test。">
        家里新买的笔记本是亲戚帮忙“设置好”的，连上 Wi-Fi 却什么网页都打不开。你手里有它的网络设置面板和一个命令行。
      </Ticket>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          <p className="text-xs font-semibold">网络设置（手动）</p>
          {(
            [
              ["ip", "IP 地址"],
              ["mask", "子网掩码"],
              ["gateway", "默认网关"],
              ["dns", "DNS 服务器"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs font-medium">
              {label}
              <input aria-label={label} disabled={locked} value={state.config[key]} maxLength={15} spellCheck={false}
                onChange={(event) => setState((current) => ({ ...current, config: { ...current.config, [key]: event.target.value } }))} className={inputClass} />
            </label>
          ))}
          <p className="text-xs text-muted-foreground">改完后用命令验证：能打开网页才算真的好了。</p>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <Terminal className="size-4" aria-hidden /> 命令行（可用：ipconfig、ping、nslookup、arp -a、curl）
          </p>
          <div className="max-h-80 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100" aria-live="polite">
            {state.history.length === 0 ? (
              <p className="m-0 text-slate-400">还没有运行过命令。</p>
            ) : (
              state.history.map((entry, index) => (
                <div key={index} className="mb-2">
                  <p className="m-0 text-sky-300">C:\&gt; {entry.command}</p>
                  <pre className="m-0 whitespace-pre-wrap">{entry.output}</pre>
                </div>
              ))
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              run();
            }}
          >
            <input aria-label="命令" disabled={readOnly} value={state.draft} maxLength={80} spellCheck={false}
              onChange={(event) => setState((current) => ({ ...current, draft: event.target.value }))} className={cn(inputClass, "mt-0")} />
            <Button type="submit" disabled={readOnly}>运行</Button>
          </form>
        </div>
      </div>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交网络设置" last={last}
        onSubmit={() => void submit({ config: state.config }, "net_laptop_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}
