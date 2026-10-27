/** Server-side validators. Never imported by a client component. */
import type { FirewallRule, Forward, HostConfig, NextHop, Protocol, Reservation, Route, Source } from "./simulation/net";
import {
  ARP_QUESTIONS,
  DNS_CAUSES,
  DNS_RECORDS,
  FIREWALL_MAX,
  HOSTS_LINES,
  NAT_MAX,
  ROUTE_MAX,
  TCP_QUESTIONS,
  TRACE_QUESTIONS,
  evaluateFirewall,
  evaluateNat,
  evaluatePrinter,
  evaluateRoutes,
  gradeArp,
  gradeDns,
  gradeLaptop,
  gradeTcp,
  gradeTrace,
} from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function short(value: unknown, max = 40): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function port(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65535 ? (value as number) : undefined;
}

function answers<T extends string>(input: unknown, ids: readonly T[]): Partial<Record<T, string>> | null {
  const raw = record(record(input)?.answers);
  if (!raw) return null;
  return Object.fromEntries(ids.map((id) => [id, short(raw[id], 40)])) as Partial<Record<T, string>>;
}

export function validateSubnetLab(input: unknown): Verdict {
  const raw = record(input);
  const ip = short(raw?.ip);
  const mask = short(raw?.mask);
  const gateway = short(raw?.gateway);
  if (ip === undefined || mask === undefined || gateway === undefined) return bad("配置不完整。");
  const result = evaluatePrinter({ ip, mask, gateway });
  const failed = result.goals.filter((goal) => !goal.ok);
  return {
    passed: result.passed,
    feedback: { message: result.passed ? "笔记本能直接把打印任务送到打印机了。" : `未达成：${failed.map((goal) => goal.label).join("；")}。` },
  };
}

export function validateArpLab(input: unknown): Verdict {
  const parsed = answers(input, ARP_QUESTIONS.map((item) => item.id));
  if (!parsed) return bad("提交内容缺少 answers。");
  const graded = gradeArp(parsed);
  return {
    passed: graded.passed,
    feedback: { message: graded.passed ? "四个问题都答对了。" : `答对了 ${graded.correct}/${graded.total} 个。每一行抓包都写明了谁发给谁、说了什么。` },
  };
}

export function validateRouteLab(input: unknown): Verdict {
  const raw = record(input);
  if (!raw || !Array.isArray(raw.routes) || raw.routes.length > ROUTE_MAX) return bad("路由表格式不正确。");
  const routes: Route[] = [];
  for (const item of raw.routes) {
    const row = record(item);
    const destination = short(row?.destination, 20);
    const via = oneOf<NextHop>(row?.via, ["direct", "vpn", "isp"]);
    if (destination === undefined || !via) return bad("路由表格式不正确。");
    routes.push({ destination, via });
  }
  const result = evaluateRoutes(routes);
  if (result.problems.length) return bad(result.problems[0]);
  const failed = result.results.filter((item) => item.trace.outcome !== "delivered");
  return {
    passed: result.passed,
    feedback: {
      message: result.passed ? "三个目的地都能送达，没有环路。" : `${failed[0].label}：${failed[0].trace.summary}`,
    },
  };
}

export function validateDnsLab(input: unknown): Verdict {
  const raw = record(input);
  const causesRaw = record(raw?.causes);
  if (!raw || !causesRaw) return bad("诊断报告格式不正确。");
  const causeIds = DNS_CAUSES.map((item) => item.id);
  const causes: Record<string, string> = {};
  for (const { id } of DNS_RECORDS) {
    const cause = oneOf(causesRaw[id], causeIds);
    if (cause) causes[id] = cause;
  }
  const removeLine = oneOf(raw.removeLine, HOSTS_LINES);
  const graded = gradeDns(causes, removeLine);
  return {
    passed: graded.passed,
    feedback: {
      message: graded.passed
        ? "六条记录都判断对了，hosts 文件也修好了。"
        : `判断对了 ${graded.correct}/${graded.total} 条${graded.fixOk ? "" : "，hosts 文件还没修好"}。${graded.hint}`,
    },
  };
}

export function validateFirewallLab(input: unknown): Verdict {
  const raw = record(input);
  if (!raw || !Array.isArray(raw.rules) || raw.rules.length > FIREWALL_MAX) return bad("规则格式不正确。");
  const rules: FirewallRule[] = [];
  for (const item of raw.rules) {
    const row = record(item);
    const protocol = oneOf<Protocol>(row?.protocol, ["tcp", "udp"]);
    const value = port(row?.port);
    const source = oneOf<Source>(row?.source, ["any", "office"]);
    if (!protocol || value === undefined || !source) return bad("规则格式不正确：协议、端口（1～65535）、来源都要填。");
    rules.push({ protocol, port: value, source });
  }
  const result = evaluateFirewall(rules);
  const failed = result.results.filter((item) => !item.ok);
  return {
    passed: result.passed,
    feedback: {
      message: result.passed
        ? "该通的都通了，不该通的都挡住了。"
        : `还有 ${failed.length} 个场景不对：${failed.map((item) => `${item.label}（${item.want ? "应该放行" : "应该拦截"}）`).join("；")}。`,
    },
  };
}

export function validateTcpLab(input: unknown): Verdict {
  const parsed = answers(input, TCP_QUESTIONS.map((item) => item.id));
  if (!parsed) return bad("提交内容缺少 answers。");
  const graded = gradeTcp(parsed);
  return {
    passed: graded.passed,
    feedback: { message: graded.passed ? "五个问题都答对了。" : `答对了 ${graded.correct}/${graded.total} 个。确认号表示“下一个想要的字节序号”。` },
  };
}

export function validateNatLab(input: unknown): Verdict {
  const raw = record(input);
  if (!raw || !Array.isArray(raw.forwards) || !Array.isArray(raw.reservations)) return bad("配置格式不正确。");
  if (raw.forwards.length > NAT_MAX || raw.reservations.length > 2) return bad("规则太多了。");
  const forwards: Forward[] = [];
  for (const item of raw.forwards) {
    const row = record(item);
    const externalPort = port(row?.externalPort);
    const internalPort = port(row?.internalPort);
    const protocol = oneOf<Protocol>(row?.protocol, ["tcp", "udp"]);
    const internalIp = short(row?.internalIp, 15);
    if (externalPort === undefined || internalPort === undefined || !protocol || internalIp === undefined) return bad("转发规则格式不正确。");
    forwards.push({ externalPort, protocol, internalIp, internalPort });
  }
  const reservations: Reservation[] = [];
  for (const item of raw.reservations) {
    const row = record(item);
    const device = oneOf(row?.device, ["nas", "console"] as const);
    const ip = short(row?.ip, 15);
    if (!device || ip === undefined) return bad("地址保留格式不正确。");
    if (reservations.some((existing) => existing.device === device)) return bad("同一台设备只能保留一个地址。");
    reservations.push({ device, ip });
  }
  const result = evaluateNat(forwards, reservations);
  if (result.reservationProblems.length) return bad(`地址保留有问题：${result.reservationProblems[0]}`);
  const failed = result.results.filter((item) => !item.ok);
  return {
    passed: result.passed,
    feedback: {
      message: result.passed
        ? "朋友能看相册，游戏机能联机，路由器管理页没有暴露，重启之后也一样。"
        : `还有 ${failed.length} 个场景不对：${failed.map((item) => item.label).join("；")}。`,
    },
  };
}

export function validateTraceLab(input: unknown): Verdict {
  const parsed = answers(input, TRACE_QUESTIONS.map((item) => item.id));
  if (!parsed) return bad("提交内容缺少 answers。");
  const graded = gradeTrace(parsed);
  return {
    passed: graded.passed,
    feedback: { message: graded.passed ? "三个判断都对。" : `判断对了 ${graded.correct}/${graded.total} 个。看看后面的跳还通不通。` },
  };
}

export function validateLaptopLab(input: unknown): Verdict {
  const raw = record(record(input)?.config);
  const config: Partial<HostConfig> = {
    ip: short(raw?.ip, 15),
    mask: short(raw?.mask, 15),
    gateway: short(raw?.gateway, 15),
    dns: short(raw?.dns, 15),
  };
  if (!config.ip || !config.mask || !config.gateway || !config.dns) return bad("网络设置不完整。");
  const graded = gradeLaptop(config as HostConfig);
  return { passed: graded.passed, feedback: { message: graded.message } };
}
