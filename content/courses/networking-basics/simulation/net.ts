/**
 * The course's small town network: IPv4 arithmetic and a few deterministic
 * models (routing, firewall, NAT, a host's network configuration). Shared by
 * browser components and server validators. No real network I/O.
 *
 * Public addresses come from the documentation ranges (RFC 5737) and names
 * use the reserved `.test` TLD, so nothing here collides with real networks.
 */

// ---------------------------------------------------------------------------
// IPv4
// ---------------------------------------------------------------------------

export function parseIp(text: string): number | null {
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

export function formatIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
}

export function prefixMask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** "255.255.255.0" → 24; null for anything that is not a contiguous mask. */
export function maskToPrefix(text: string): number | null {
  const value = parseIp(text);
  if (value === null) return null;
  for (let prefix = 0; prefix <= 32; prefix += 1) if (prefixMask(prefix) === value) return prefix;
  return null;
}

export function networkOf(ip: number, prefix: number): number {
  return (ip & prefixMask(prefix)) >>> 0;
}

export function broadcastOf(ip: number, prefix: number): number {
  return (networkOf(ip, prefix) | (~prefixMask(prefix) >>> 0)) >>> 0;
}

export function inSubnet(ip: number, network: number, prefix: number): boolean {
  return networkOf(ip, prefix) === networkOf(network, prefix);
}

export type Cidr = { network: number; prefix: number };

/** Strict: the address must be the network address itself (no host bits). */
export function parseCidr(text: string): Cidr | null {
  const match = /^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const ip = parseIp(match[1]);
  const prefix = Number(match[2]);
  if (ip === null || prefix > 32) return null;
  if (networkOf(ip, prefix) !== ip) return null;
  return { network: ip, prefix };
}

export function formatCidr(cidr: Cidr): string {
  return `${formatIp(cidr.network)}/${cidr.prefix}`;
}

const PRIVATE: Cidr[] = [
  { network: parseIp("10.0.0.0")!, prefix: 8 },
  { network: parseIp("172.16.0.0")!, prefix: 12 },
  { network: parseIp("192.168.0.0")!, prefix: 16 },
];

export function isPrivate(ip: number): boolean {
  return PRIVATE.some((range) => inSubnet(ip, range.network, range.prefix));
}

export function toBinary(ip: number): string {
  return [24, 16, 8, 0].map((shift) => (Math.floor(ip / 2 ** shift) % 256).toString(2).padStart(8, "0")).join(".");
}

// ---------------------------------------------------------------------------
// The home network (chapters 2, 3, 8, 10)
// ---------------------------------------------------------------------------

export const HOME = {
  subnet: "192.168.1.0/24",
  router: "192.168.1.1",
  publicIp: "203.0.113.45",
  isp: "203.0.113.1",
  ispDns: "203.0.113.53",
  dhcpFrom: 100,
  dhcpTo: 199,
  devices: [
    { name: "家里的路由器", ip: "192.168.1.1", mac: "f4:6a:dd:00:00:01" },
    { name: "NAS 存储", ip: "192.168.1.20", mac: "00:11:32:aa:bb:20" },
    { name: "旧笔记本", ip: "192.168.1.23", mac: "3c:22:fb:12:34:23" },
    { name: "手机", ip: "192.168.1.31", mac: "8a:7e:1c:55:66:31" },
  ],
} as const;

export const LIBRARY = { name: "library.test", ip: "198.51.100.10", gateway: "198.51.100.1" } as const;

export type HostProblem = "invalid" | "outside" | "network" | "broadcast" | "conflict" | "pool";

/** Why a static address on the home network would be a problem (empty = fine). */
export function homeAddressProblems(ipText: string, taken: readonly string[] = HOME.devices.map((d) => d.ip)): HostProblem[] {
  const ip = parseIp(ipText);
  if (ip === null) return ["invalid"];
  const net = parseCidr(HOME.subnet)!;
  const problems: HostProblem[] = [];
  if (!inSubnet(ip, net.network, net.prefix)) problems.push("outside");
  else {
    if (ip === networkOf(ip, net.prefix)) problems.push("network");
    if (ip === broadcastOf(ip, net.prefix)) problems.push("broadcast");
    const last = ip % 256;
    if (last >= HOME.dhcpFrom && last <= HOME.dhcpTo) problems.push("pool");
  }
  if (taken.includes(formatIp(ip))) problems.push("conflict");
  return problems;
}

// ---------------------------------------------------------------------------
// Office routing (chapter 4)
// ---------------------------------------------------------------------------

export type NextHop = "direct" | "vpn" | "isp";
export type Route = { destination: string; via: NextHop };

export const NEXT_HOPS: { id: NextHop; label: string }[] = [
  { id: "direct", label: "直连（本办公室网络 eth0）" },
  { id: "vpn", label: "172.16.0.2（到总部的 VPN 路由器）" },
  { id: "isp", label: "203.0.113.1（运营商）" },
];

export const OFFICE = {
  lan: "10.8.1.0/24",
  hosts: ["10.8.1.40"],
  hq: "10.8.20.0/24",
  hqHosts: ["10.8.20.5"],
};

/** The VPN router's own table (fixed): HQ is local to it; everything else goes back to the office router. */
const VPN_TABLE: { destination: Cidr; via: "local" | "office" }[] = [
  { destination: parseCidr("10.8.20.0/24")!, via: "local" },
  { destination: parseCidr("0.0.0.0/0")!, via: "office" },
];

export function lookup<T extends { destination: Cidr }>(table: T[], ip: number): T | null {
  let best: T | null = null;
  for (const route of table) {
    if (!inSubnet(ip, route.destination.network, route.destination.prefix)) continue;
    if (!best || route.destination.prefix > best.destination.prefix) best = route;
  }
  return best;
}

export type Hop = { node: string; note: string };
export type TraceResult = { hops: Hop[]; outcome: "delivered" | "dropped" | "loop"; summary: string };

export function traceOffice(routes: Route[], destinationText: string, ttl = 8): TraceResult {
  const destination = parseIp(destinationText)!;
  const table = routes
    .map((route) => ({ destination: parseCidr(route.destination), via: route.via }))
    .filter((route): route is { destination: Cidr; via: NextHop } => route.destination !== null);
  const hops: Hop[] = [];
  let at: "office" | "vpn" = "office";
  for (let step = 0; step < ttl; step += 1) {
    if (at === "office") {
      const route = lookup(table, destination);
      if (!route) {
        hops.push({ node: "办公室路由器", note: "路由表里没有匹配的条目" });
        return { hops, outcome: "dropped", summary: "办公室路由器不知道往哪发，丢弃了数据包。" };
      }
      hops.push({ node: "办公室路由器", note: `匹配 ${formatCidr(route.destination)} → ${NEXT_HOPS.find((hop) => hop.id === route.via)!.label}` });
      if (route.via === "direct") {
        const lan = parseCidr(OFFICE.lan)!;
        if (inSubnet(destination, lan.network, lan.prefix) && OFFICE.hosts.includes(destinationText)) {
          return { hops, outcome: "delivered", summary: "在本办公室网络里直接送达。" };
        }
        return { hops, outcome: "dropped", summary: "按“直连”发出，但本办公室网络里根本没有这个地址。" };
      }
      if (route.via === "isp") {
        hops.push({ node: "运营商路由器", note: isPrivate(destination) ? "目的地址是私有地址" : "转发到互联网" });
        if (isPrivate(destination)) return { hops, outcome: "dropped", summary: "私有地址在互联网上不可路由，运营商把它丢弃了。" };
        return { hops, outcome: "delivered", summary: "经运营商送达互联网上的目的地。" };
      }
      at = "vpn";
      continue;
    }
    const route = lookup(VPN_TABLE, destination)!;
    hops.push({ node: "VPN 路由器", note: route.via === "local" ? "目的地在总部网络" : "不认识这个地址，发回办公室路由器" });
    if (route.via === "local") {
      if (OFFICE.hqHosts.includes(destinationText)) return { hops, outcome: "delivered", summary: "经 VPN 送达总部。" };
      return { hops, outcome: "dropped", summary: "总部网络里没有这个地址。" };
    }
    at = "office";
  }
  return { hops, outcome: "loop", summary: `数据包在两台路由器之间来回转，跳数用完（TTL=${ttl}）后被丢弃：路由环路。` };
}

// ---------------------------------------------------------------------------
// Server firewall (chapter 6)
// ---------------------------------------------------------------------------

export type Protocol = "tcp" | "udp";
export type Source = "any" | "office";
export type FirewallRule = { protocol: Protocol; port: number; source: Source };

export const OFFICE_RANGE = "203.0.113.0/24";

export function firewallAllows(rules: FirewallRule[], protocol: Protocol, port: number, from: "internet" | "office"): FirewallRule | null {
  return rules.find((rule) => rule.protocol === protocol && rule.port === port && (rule.source === "any" || from === "office")) ?? null;
}

// ---------------------------------------------------------------------------
// Home router NAT and DHCP (chapter 8)
// ---------------------------------------------------------------------------

export type Forward = { externalPort: number; protocol: Protocol; internalIp: string; internalPort: number };
export type Reservation = { device: "nas" | "console"; ip: string };

export const NAT_DEVICES = [
  { id: "nas", name: "NAS 存储", mac: "00:11:32:aa:bb:20", listens: [{ protocol: "tcp", port: 443 }] },
  { id: "console", name: "游戏机", mac: "7c:bb:8a:01:02:37", listens: [{ protocol: "udp", port: 3074 }] },
] as const;

export const ROUTER_LISTENS = [{ protocol: "tcp", port: 80 }] as const;

/** DHCP leases before and after the router restarts, when nothing is reserved. */
const LEASES = {
  before: { nas: "192.168.1.20", console: "192.168.1.37" },
  after: { nas: "192.168.1.37", console: "192.168.1.20" },
} as const;

export function leasesAt(time: "before" | "after", reservations: Reservation[]): Record<"nas" | "console", string> {
  const result = { ...LEASES[time] } as Record<"nas" | "console", string>;
  for (const reservation of reservations) result[reservation.device] = reservation.ip;
  // A device whose usual lease is now reserved for another one gets the next free address.
  const devices: ("nas" | "console")[] = ["nas", "console"];
  for (const device of devices) {
    if (reservations.some((r) => r.device === device)) continue;
    if (devices.some((other) => other !== device && result[other] === result[device])) result[device] = "192.168.1.38";
  }
  return result;
}

export type InboundResult = { reached: string | null; note: string };

/** Where a connection to the public address lands, at a given point in time. */
export function inbound(
  forwards: Forward[],
  reservations: Reservation[],
  time: "before" | "after",
  protocol: Protocol,
  externalPort: number,
): InboundResult {
  const rule = forwards.find((forward) => forward.protocol === protocol && forward.externalPort === externalPort);
  if (!rule) return { reached: null, note: `路由器没有 ${protocol.toUpperCase()} ${externalPort} 的转发规则，连接被丢弃。` };
  if (rule.internalIp === HOME.router) {
    const listening = ROUTER_LISTENS.some((item) => item.protocol === protocol && item.port === rule.internalPort);
    return listening
      ? { reached: "router", note: `转发到了路由器自己的 ${rule.internalPort} 端口：管理页面暴露在了互联网上。` }
      : { reached: null, note: "转发到路由器的一个没有服务的端口。" };
  }
  const leases = leasesAt(time, reservations);
  const device = NAT_DEVICES.find((item) => leases[item.id] === rule.internalIp);
  if (!device) return { reached: null, note: `转发目标 ${rule.internalIp} 上此时没有设备。` };
  const listening = device.listens.some((item) => item.protocol === protocol && item.port === rule.internalPort);
  return listening
    ? { reached: device.id, note: `转发到 ${rule.internalIp}:${rule.internalPort}，此时是${device.name}，连上了。` }
    : { reached: null, note: `转发到 ${rule.internalIp}:${rule.internalPort}，此时是${device.name}，但它没有在这个端口上提供服务。` };
}

// ---------------------------------------------------------------------------
// A laptop's network settings and a tiny shell (chapter 10)
// ---------------------------------------------------------------------------

export type HostConfig = { ip: string; mask: string; gateway: string; dns: string };

export const DNS_SERVERS_THAT_ANSWER = [HOME.router, HOME.ispDns];

export type Diagnosis = {
  prefix: number | null;
  conflict: boolean;
  gatewayOk: boolean;
  dnsOk: boolean;
  problems: HostProblem[];
};

export function diagnoseHost(config: HostConfig): Diagnosis {
  const prefix = maskToPrefix(config.mask);
  const problems = homeAddressProblems(config.ip);
  const ip = parseIp(config.ip);
  const gateway = parseIp(config.gateway);
  const sameNet = (other: number | null) => ip !== null && other !== null && prefix !== null && inSubnet(other, ip, prefix);
  const localOk = ip !== null && prefix === 24 && !problems.includes("outside") && !problems.includes("network") && !problems.includes("broadcast");
  const gatewayOk = localOk && config.gateway.trim() === HOME.router && sameNet(gateway);
  const dns = config.dns.trim();
  const dnsReachable = dns === HOME.router ? localOk : dns === HOME.ispDns ? gatewayOk : false;
  return {
    prefix,
    conflict: problems.includes("conflict"),
    gatewayOk,
    dnsOk: dnsReachable && !problems.includes("conflict"),
    problems,
  };
}

/** Runs one of a handful of commands against the configuration. */
export function runCommand(config: HostConfig, line: string): string {
  const [command, ...args] = line.trim().split(/\s+/);
  const d = diagnoseHost(config);
  const ip = parseIp(config.ip);
  const prefix = d.prefix;
  const localOk = ip !== null && prefix === 24 && !d.problems.includes("outside");
  switch ((command ?? "").toLowerCase()) {
    case "ipconfig":
    case "ip": {
      const lines = [
        `IPv4 地址 . . . . : ${config.ip}${d.conflict ? "（重复）" : ""}`,
        `子网掩码 . . . . : ${config.mask}${prefix === null ? "（无效）" : ""}`,
        `默认网关 . . . . : ${config.gateway}`,
        `DNS 服务器 . . . : ${config.dns}`,
      ];
      if (d.conflict) lines.push("", "警告：检测到网络上的另一台设备正在使用此 IP 地址。");
      return lines.join("\n");
    }
    case "arp": {
      if (!localOk) return "（ARP 表为空：本机地址不在任何可用的局域网里）";
      const rows = HOME.devices.map((device) => `  ${device.ip.padEnd(15)} ${device.mac}`);
      return ["接口：" + config.ip, "  Internet 地址     物理地址", ...rows].join("\n");
    }
    case "ping": {
      const target = args[0];
      if (!target) return "用法：ping <地址或域名>";
      let targetIp = parseIp(target);
      if (targetIp === null) {
        if (target.toLowerCase() !== LIBRARY.name) return `Ping 请求找不到主机 ${target}。`;
        if (!d.dnsOk) return `Ping 请求找不到主机 ${target}。请检查该名称，然后重试。`;
        targetIp = parseIp(LIBRARY.ip)!;
      }
      const shown = formatIp(targetIp);
      if (!localOk) return `PING ${shown}：传输失败。常见故障：本机地址或子网掩码不对。`;
      const net = parseCidr(HOME.subnet)!;
      if (inSubnet(targetIp, net.network, net.prefix)) {
        const exists = HOME.devices.some((device) => device.ip === shown);
        if (!exists) return `来自 ${config.ip} 的回复：无法访问目标主机。（局域网里没有 ${shown}）`;
        return `来自 ${shown} 的回复：字节=32 时间=1ms TTL=64${d.conflict ? "\n（提示：本机 IP 与其他设备重复，回复可能时有时无）" : ""}`;
      }
      if (!d.gatewayOk) return `PING ${shown}：请求超时。（数据包要交给默认网关 ${config.gateway}，但它不存在）`;
      if (shown === LIBRARY.ip || shown === HOME.isp || shown === HOME.ispDns) return `来自 ${shown} 的回复：字节=32 时间=18ms TTL=56`;
      return `PING ${shown}：请求超时。`;
    }
    case "nslookup": {
      const name = (args[0] ?? "").toLowerCase();
      if (!name) return "用法：nslookup <域名>";
      if (!d.dnsOk) return `DNS 请求超时。\n服务器：${config.dns}\n（这台 DNS 服务器没有回应）`;
      if (name !== LIBRARY.name) return `服务器：${config.dns}\n*** 找不到 ${name}：Non-existent domain`;
      return `服务器：${config.dns}\n名称：${LIBRARY.name}\nAddress：${LIBRARY.ip}`;
    }
    case "curl": {
      const url = args[0] ?? "";
      if (!/^https?:\/\/library\.test\/?$/i.test(url)) return "用法：curl https://library.test";
      if (!d.dnsOk) return "curl: (6) Could not resolve host: library.test";
      if (!d.gatewayOk) return "curl: (7) Failed to connect to library.test port 443: 网络不可达";
      if (d.conflict) return "curl: (28) Connection timed out（本机 IP 与其他设备冲突，回应被送到了另一台机器）";
      return "HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\n\n<!doctype html><title>小城图书馆</title>…";
    }
    default:
      return `不支持的命令：${command ?? ""}。可用：ipconfig、ping、nslookup、arp -a、curl`;
  }
}

export function hostWorks(config: HostConfig): boolean {
  const d = diagnoseHost(config);
  return d.prefix === 24 && d.problems.length === 0 && d.gatewayOk && d.dnsOk;
}
