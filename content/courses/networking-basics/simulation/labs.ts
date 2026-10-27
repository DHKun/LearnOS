/**
 * Lab data and grading rules. Components call them for live feedback;
 * validators.ts re-runs them on the server, which alone decides `passed`.
 */
import {
  type FirewallRule,
  type Forward,
  HOME,
  type HostConfig,
  type HostProblem,
  LIBRARY,
  type Reservation,
  type Route,
  diagnoseHost,
  firewallAllows,
  homeAddressProblems,
  hostWorks,
  inbound,
  maskToPrefix,
  parseCidr,
  parseIp,
  traceOffice,
} from "./net";

type Goal = { id: string; label: string; ok: boolean };

export const PROBLEM_TEXT: Record<HostProblem, string> = {
  invalid: "不是合法的 IPv4 地址",
  outside: "不在 192.168.1.0/24 这个网段里",
  network: "这是网段的网络地址，不能分给设备",
  broadcast: "这是网段的广播地址，不能分给设备",
  conflict: "已经有设备在用这个地址",
  pool: "在路由器的 DHCP 地址池（.100～.199）里，以后可能被分给别的设备",
};

// ---------------------------------------------------------------------------
// Ch2 · A printer on the wrong subnet
// ---------------------------------------------------------------------------

export type PrinterConfig = { ip: string; mask: string; gateway: string };
export const PRINTER_INITIAL: PrinterConfig = { ip: "192.168.2.50", mask: "255.255.255.0", gateway: "192.168.2.1" };
export const LAPTOP = { ip: "192.168.1.23", prefix: 24 };

export function evaluatePrinter(config: PrinterConfig) {
  const ip = parseIp(config.ip);
  const prefix = maskToPrefix(config.mask);
  const problems = homeAddressProblems(config.ip);
  const laptopSees = ip !== null && !problems.includes("outside");
  const goals: Goal[] = [
    { id: "subnet", label: "打印机的地址在笔记本所在的 192.168.1.0/24 里", ok: laptopSees },
    { id: "mask", label: "子网掩码和路由器的局域网设置一致", ok: prefix === 24 },
    {
      id: "usable",
      label: "地址可以分给设备：不是网络地址或广播地址",
      ok: ip !== null && !problems.includes("network") && !problems.includes("broadcast") && !problems.includes("invalid"),
    },
    { id: "free", label: "不和现有设备冲突，也不在 DHCP 地址池里", ok: ip !== null && !problems.includes("conflict") && !problems.includes("pool") },
    { id: "gateway", label: "默认网关是家里的路由器", ok: config.gateway.trim() === HOME.router },
  ];
  let story: string;
  if (ip === null) story = "打印机的地址写错了，网络上没有人能联系它。";
  else if (!laptopSees)
    story = `笔记本算出 ${config.ip} 不在自己的网段 192.168.1.0/24 里，于是把打印任务交给网关 ${HOME.router}。路由器只认识 192.168.1.0/24，不知道该往哪送，任务丢失了。`;
  else if (problems.includes("conflict")) story = `${config.ip} 已经被别的设备占用，打印任务时而送到打印机、时而送到那台设备。`;
  else story = `笔记本算出 ${config.ip} 和自己在同一个网段，直接在局域网里把任务交给打印机。`;
  return { goals, problems, story, passed: goals.every((goal) => goal.ok) };
}

// ---------------------------------------------------------------------------
// Ch3 · Read an ARP capture
// ---------------------------------------------------------------------------

export const ARP_CAPTURE = [
  { no: 1, time: "0.000", src: "3c:22:fb:12:34:23", dst: "ff:ff:ff:ff:ff:ff", info: "Who has 192.168.1.60? Tell 192.168.1.23" },
  { no: 2, time: "0.002", src: "5c:f3:70:9e:44:60", dst: "3c:22:fb:12:34:23", info: "192.168.1.60 is at 5c:f3:70:9e:44:60" },
  { no: 3, time: "0.004", src: "b8:27:eb:3d:21:0a", dst: "3c:22:fb:12:34:23", info: "192.168.1.60 is at b8:27:eb:3d:21:0a" },
];

export const ARP_DEVICES = [
  { mac: "3c:22:fb:12:34:23", name: "旧笔记本" },
  { mac: "5c:f3:70:9e:44:60", name: "上周买的扫描仪" },
  { mac: "b8:27:eb:3d:21:0a", name: "孩子的旧平板（手动设过 IP）" },
];

export const ARP_QUESTIONS = [
  { id: "asker", question: "是哪个 IP 地址在问？", kind: "text" },
  { id: "broadcast", question: "第 1 个包发给了谁？", kind: "choice", options: [
    { id: "scanner", label: "只发给扫描仪" },
    { id: "all", label: "发给局域网里的所有设备（广播）" },
    { id: "router", label: "发给路由器" },
  ] },
  { id: "why", question: "为什么会收到两个回答？", kind: "choice", options: [
    { id: "retry", label: "扫描仪回答了两次" },
    { id: "conflict", label: "两台设备用了同一个 IP 地址" },
    { id: "normal", label: "ARP 总会收到两个回答" },
  ] },
  { id: "who", question: "要改 IP 的是哪台设备？", kind: "choice", options: ARP_DEVICES.map((device) => ({ id: device.mac, label: `${device.name}（${device.mac}）` })) },
] as const;
export type ArpQuestionId = (typeof ARP_QUESTIONS)[number]["id"];

export function gradeArp(answers: Partial<Record<ArpQuestionId, string>>) {
  const expected: Record<ArpQuestionId, string> = { asker: "192.168.1.23", broadcast: "all", why: "conflict", who: "b8:27:eb:3d:21:0a" };
  const results = ARP_QUESTIONS.map((item) => (answers[item.id] ?? "").trim().toLowerCase() === expected[item.id]);
  return { results, correct: results.filter(Boolean).length, total: results.length, passed: results.every(Boolean) };
}

// ---------------------------------------------------------------------------
// Ch4 · Fix the office routing table
// ---------------------------------------------------------------------------

export const ROUTE_INITIAL: Route[] = [
  { destination: "10.8.1.0/24", via: "direct" },
  { destination: "0.0.0.0/0", via: "vpn" },
];
export const ROUTE_MAX = 8;

export const ROUTE_SCENARIOS = [
  { id: "library", label: "访问 library.test（198.51.100.10）", destination: LIBRARY.ip },
  { id: "hq", label: "访问总部的文件服务器（10.8.20.5）", destination: "10.8.20.5" },
  { id: "printer", label: "访问本办公室的打印机（10.8.1.40）", destination: "10.8.1.40" },
] as const;

export function routeTableProblems(routes: Route[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  routes.forEach((route, index) => {
    const cidr = parseCidr(route.destination);
    if (!cidr) problems.push(`第 ${index + 1} 条：「${route.destination}」不是合法的网段（要写成网络地址/前缀长度，比如 10.8.0.0/16）`);
    else if (seen.has(route.destination.trim())) problems.push(`第 ${index + 1} 条：目的网段重复了`);
    seen.add(route.destination.trim());
  });
  return problems;
}

export function evaluateRoutes(routes: Route[]) {
  const problems = routeTableProblems(routes);
  const results = ROUTE_SCENARIOS.map((scenario) => ({ ...scenario, trace: traceOffice(routes, scenario.destination) }));
  const passed = problems.length === 0 && results.every((item) => item.trace.outcome === "delivered");
  return { problems, results, passed };
}

// ---------------------------------------------------------------------------
// Ch5 · DNS complaints
// ---------------------------------------------------------------------------

export const DNS_CAUSES = [
  { id: "ok", label: "DNS 正常，问题在别处" },
  { id: "typo", label: "域名拼错了，权威服务器回答“不存在”" },
  { id: "stale", label: "记录刚改过，缓存里的旧地址还没过期" },
  { id: "hosts", label: "本机 hosts 文件写死了旧地址" },
  { id: "timeout", label: "DNS 服务器没有回应" },
  { id: "record", label: "管理员把记录本身填错了，所有人都解析到错误地址" },
] as const;
export type DnsCause = (typeof DNS_CAUSES)[number]["id"];

export const DNS_RECORDS: { id: string; who: string; symptom: string; output: string; cause: DnsCause }[] = [
  {
    id: "auth",
    who: "运维：直接问 library.test 的权威 DNS 服务器",
    symptom: "（对照用）昨晚网站搬到了新服务器",
    output: "$ dig @ns1.library.test library.test A\nlibrary.test.  300  IN  A  198.51.100.10",
    cause: "ok",
  },
  {
    id: "alice",
    who: "读者小王",
    symptom: "打开网站显示的还是旧页面",
    output: "$ nslookup library.test\n服务器：203.0.113.53\n非权威应答：\n名称：library.test\nAddress：198.51.100.7\n（TTL 剩余 41 分钟）",
    cause: "stale",
  },
  {
    id: "bob",
    who: "读者小李",
    symptom: "浏览器提示“找不到服务器”",
    output: "$ nslookup libary.test\n服务器：203.0.113.53\n*** 找不到 libary.test：Non-existent domain",
    cause: "typo",
  },
  {
    id: "carol",
    who: "馆员的办公电脑",
    symptom: "别人都好了，只有这台还打开旧页面；清了缓存也没用",
    output: "$ ping library.test\n正在 Ping library.test [198.51.100.7]\n\n$ type C:\\Windows\\System32\\drivers\\etc\\hosts\n198.51.100.7  library.test\n\n$ nslookup library.test\n名称：library.test\nAddress：198.51.100.10",
    cause: "hosts",
  },
  {
    id: "dave",
    who: "咖啡馆的访客",
    symptom: "所有网站都打不开，但 QQ 能收消息",
    output: "$ nslookup library.test\nDNS request timed out.\n    timeout was 2 seconds.\n服务器：UnKnown\nAddress：10.0.0.53",
    cause: "timeout",
  },
  {
    id: "erin",
    who: "读者小赵",
    symptom: "网页打不开：“连接被拒绝”",
    output: "$ nslookup library.test\n名称：library.test\nAddress：198.51.100.10\n\n$ curl -I https://library.test\ncurl: (7) Failed to connect to library.test port 443: Connection refused",
    cause: "ok",
  },
];

export const HOSTS_LINES = ["127.0.0.1  localhost", "198.51.100.7  library.test", "10.8.20.5  files.office.test"];

export function gradeDns(causes: Record<string, string>, removeLine: string | undefined) {
  const results = DNS_RECORDS.map((record) => causes[record.id] === record.cause);
  const correct = results.filter(Boolean).length;
  const fixOk = removeLine === HOSTS_LINES[1];
  let hint = "";
  if (causes.alice === "record") hint = "对照第一条：权威服务器已经回答 198.51.100.10 了，记录本身没错。";
  else if (causes.carol && causes.carol !== "hosts") hint = "这台电脑的 nslookup 已经是新地址，ping 却用旧地址。哪里会绕过 DNS？";
  else if (causes.erin && causes.erin !== "ok") hint = "小赵解析出的地址是对的，“连接被拒绝”发生在 DNS 之后。";
  return { results, correct, total: results.length, fixOk, passed: correct === results.length && fixOk, hint };
}

// ---------------------------------------------------------------------------
// Ch6 · Server firewall
// ---------------------------------------------------------------------------

export const FIREWALL_INITIAL: FirewallRule[] = [
  { protocol: "tcp", port: 80, source: "any" },
  { protocol: "tcp", port: 3478, source: "any" },
  { protocol: "tcp", port: 22, source: "any" },
  { protocol: "tcp", port: 5432, source: "any" },
];
export const FIREWALL_MAX = 10;

export const FIREWALL_SCENARIOS = [
  { id: "https", label: "读者用 HTTPS 访问网站", protocol: "tcp", port: 443, from: "internet", want: true },
  { id: "http", label: "读者输入 http:// 地址，再被跳转到 HTTPS", protocol: "tcp", port: 80, from: "internet", want: true },
  { id: "voice", label: "读书会的语音通话（UDP 3478）", protocol: "udp", port: 3478, from: "internet", want: true },
  { id: "ssh-office", label: "运维在办公室用 SSH 登录服务器", protocol: "tcp", port: 22, from: "office", want: true },
  { id: "ssh-scan", label: "互联网上的扫描器尝试 SSH 登录", protocol: "tcp", port: 22, from: "internet", want: false },
  { id: "db-scan", label: "互联网上的扫描器尝试连接数据库（5432）", protocol: "tcp", port: 5432, from: "internet", want: false },
] as const;

export function evaluateFirewall(rules: FirewallRule[]) {
  const results = FIREWALL_SCENARIOS.map((scenario) => {
    const allowed = firewallAllows(rules, scenario.protocol, scenario.port, scenario.from);
    return { ...scenario, allowed: Boolean(allowed), ok: Boolean(allowed) === scenario.want };
  });
  return { results, passed: results.every((item) => item.ok) };
}

// ---------------------------------------------------------------------------
// Ch7 · Read a TCP capture with a lost segment
// ---------------------------------------------------------------------------

export const TCP_CAPTURE = [
  { no: 1, dir: "→", flags: "SYN", seq: 0, ack: null, len: 0, note: "" },
  { no: 2, dir: "←", flags: "SYN, ACK", seq: 0, ack: 1, len: 0, note: "" },
  { no: 3, dir: "→", flags: "ACK", seq: 1, ack: 1, len: 0, note: "" },
  { no: 4, dir: "→", flags: "PSH, ACK", seq: 1, ack: 1, len: 1000, note: "" },
  { no: 5, dir: "←", flags: "ACK", seq: 1, ack: 1001, len: 0, note: "" },
  { no: 6, dir: "→", flags: "PSH, ACK", seq: 1001, ack: 1, len: 1000, note: "（这个包在路上丢了，接收方没收到）" },
  { no: 7, dir: "→", flags: "PSH, ACK", seq: 2001, ack: 1, len: 1000, note: "" },
  { no: 8, dir: "←", flags: "ACK", seq: 1, ack: 1001, len: 0, note: "" },
  { no: 9, dir: "→", flags: "PSH, ACK", seq: 3001, ack: 1, len: 1000, note: "" },
  { no: 10, dir: "←", flags: "ACK", seq: 1, ack: 1001, len: 0, note: "" },
  { no: 11, dir: "→", flags: "PSH, ACK", seq: 1001, ack: 1, len: 1000, note: "（重传）" },
  { no: 12, dir: "←", flags: "ACK", seq: 1, ack: 4001, len: 0, note: "" },
];

export const TCP_QUESTIONS = [
  { id: "handshake", question: "建立连接用了几个包？", kind: "number" },
  { id: "dupack", question: "第 7、9 号包到达后，接收方回复的确认号（ack）都是多少？", kind: "number" },
  { id: "resend", question: "发送方重传的数据从哪个序号（seq）开始？", kind: "number" },
  { id: "jump", question: "重传的包到达后，确认号一下子跳到了多少？", kind: "number" },
  {
    id: "app",
    question: "接收方的应用程序最终读到的数据是什么样的？",
    kind: "choice",
    options: [
      { id: "ordered", label: "完整的 4000 字节，顺序和发送时一样" },
      { id: "gap", label: "缺了 1001～2000 那一段" },
      { id: "shuffled", label: "完整，但顺序被打乱了" },
    ],
  },
] as const;
export type TcpQuestionId = (typeof TCP_QUESTIONS)[number]["id"];

export function gradeTcp(answers: Partial<Record<TcpQuestionId, string>>) {
  const expected: Record<TcpQuestionId, string> = { handshake: "3", dupack: "1001", resend: "1001", jump: "4001", app: "ordered" };
  const results = TCP_QUESTIONS.map((item) => (answers[item.id] ?? "").replace(/[,\s，]/g, "") === expected[item.id]);
  return { results, correct: results.filter(Boolean).length, total: results.length, passed: results.every(Boolean) };
}

// ---------------------------------------------------------------------------
// Ch8 · Port forwarding that survives a router restart
// ---------------------------------------------------------------------------

export const NAT_INITIAL: { forwards: Forward[]; reservations: Reservation[] } = {
  forwards: [
    { externalPort: 8443, protocol: "tcp", internalIp: "192.168.1.20", internalPort: 443 },
    { externalPort: 3074, protocol: "tcp", internalIp: "192.168.1.37", internalPort: 3074 },
    { externalPort: 80, protocol: "tcp", internalIp: "192.168.1.1", internalPort: 80 },
  ],
  reservations: [],
};
export const NAT_MAX = 6;

export const NAT_DEVICES_LABEL = [
  "NAS 存储   00:11:32:aa:bb:20   192.168.1.20",
  "游戏机     7c:bb:8a:01:02:37   192.168.1.37",
  "（不保留的话，重启后会按当时的顺序重新分配）",
].join("\n");

export const NAT_SCENARIOS = [
  { id: "nas", label: "朋友在外面打开 https://203.0.113.45:8443 看你分享的相册", protocol: "tcp", port: 8443, want: "nas" },
  { id: "game", label: "游戏机联机：服务器从外面发来 UDP 3074", protocol: "udp", port: 3074, want: "console" },
  { id: "admin", label: "互联网上的扫描器访问 http://203.0.113.45", protocol: "tcp", port: 80, want: null },
] as const;

export function evaluateNat(forwards: Forward[], reservations: Reservation[]) {
  const reservationProblems: string[] = [];
  const seenIps = new Set<string>();
  for (const reservation of reservations) {
    const problems = homeAddressProblems(reservation.ip, [HOME.router, "192.168.1.23", "192.168.1.31"]).filter((p) => p !== "pool");
    if (problems.length) reservationProblems.push(`${reservation.ip}：${problems.map((p) => PROBLEM_TEXT[p]).join("；")}`);
    if (seenIps.has(reservation.ip)) reservationProblems.push(`${reservation.ip} 被保留了两次`);
    seenIps.add(reservation.ip);
  }
  const times = ["before", "after"] as const;
  const results = NAT_SCENARIOS.map((scenario) => {
    const outcomes = times.map((time) => {
      const result = inbound(forwards, reservations, time, scenario.protocol, scenario.port);
      return { time, ...result, ok: result.reached === scenario.want };
    });
    return { ...scenario, outcomes, ok: outcomes.every((item) => item.ok) };
  });
  return { results, reservationProblems, passed: reservationProblems.length === 0 && results.every((item) => item.ok) };
}

// ---------------------------------------------------------------------------
// Ch9 · Read ping and traceroute output
// ---------------------------------------------------------------------------

export const TRACE_OK = [
  { hop: 1, host: "192.168.1.1", times: "1 ms  1 ms  1 ms" },
  { hop: 2, host: "203.0.113.1", times: "8 ms  7 ms  8 ms" },
  { hop: 3, host: "*", times: "*  *  *" },
  { hop: 4, host: "192.0.2.17", times: "12 ms  11 ms  12 ms" },
  { hop: 5, host: "192.0.2.90", times: "186 ms  190 ms  184 ms" },
  { hop: 6, host: "198.51.100.1", times: "19 ms  18 ms  19 ms" },
  { hop: 7, host: "198.51.100.10", times: "19 ms  19 ms  20 ms" },
];

export const TRACE_BROKEN = [
  { hop: 1, host: "192.168.1.1", times: "1 ms  1 ms  1 ms" },
  { hop: 2, host: "203.0.113.1", times: "8 ms  8 ms  9 ms" },
  { hop: 3, host: "*", times: "*  *  *" },
  { hop: 4, host: "192.0.2.17", times: "12 ms  12 ms  11 ms" },
  { hop: 5, host: "*", times: "*  *  *" },
  { hop: 6, host: "*", times: "*  *  *" },
  { hop: 7, host: "*", times: "*  *  *" },
];

export const TRACE_PINGS = [
  { target: "192.168.1.1（家里的路由器）", result: "回复，1 ms" },
  { target: "203.0.113.1（运营商网关）", result: "回复，8 ms" },
  { target: "198.51.100.1（机房网关）", result: "请求超时" },
  { target: "198.51.100.10（library.test）", result: "请求超时" },
];

export const TRACE_QUESTIONS = [
  {
    id: "hop3",
    question: "第一份记录里，第 3 跳显示 * * *，说明什么？",
    options: [
      { id: "broken", label: "网络在这里断了" },
      { id: "silent", label: "这台路由器不回应探测包，但它照常转发，后面几跳都通了" },
      { id: "slow", label: "这一跳太慢了" },
    ],
  },
  {
    id: "hop5",
    question: "第一份记录里，第 5 跳延迟 186 ms，第 6 跳又回到 19 ms，说明什么？",
    options: [
      { id: "bottleneck", label: "第 5 跳是瓶颈，所有流量都被拖慢了" },
      { id: "busy", label: "这台路由器回应探测包慢，不代表它转发慢" },
      { id: "measure", label: "测量出错了，应该重新测" },
    ],
  },
  {
    id: "where",
    question: "结合第二份记录和下面的 ping 结果，今天的故障最可能出在哪一段？",
    options: [
      { id: "home", label: "家里的网络" },
      { id: "isp", label: "运营商的网关" },
      { id: "transit", label: "运营商网络之外、到机房之间的线路" },
      { id: "dns", label: "DNS 解析" },
    ],
  },
] as const;
export type TraceQuestionId = (typeof TRACE_QUESTIONS)[number]["id"];

export function gradeTrace(answers: Partial<Record<TraceQuestionId, string>>) {
  const expected: Record<TraceQuestionId, string> = { hop3: "silent", hop5: "busy", where: "transit" };
  const results = TRACE_QUESTIONS.map((item) => answers[item.id] === expected[item.id]);
  return { results, correct: results.filter(Boolean).length, total: results.length, passed: results.every(Boolean) };
}

// ---------------------------------------------------------------------------
// Ch10 · Get a new laptop online
// ---------------------------------------------------------------------------

export const LAPTOP_INITIAL: HostConfig = { ip: "192.168.1.20", mask: "255.255.255.0", gateway: "192.168.1.254", dns: "192.168.1.53" };

export function gradeLaptop(config: HostConfig): { passed: boolean; message: string } {
  const d = diagnoseHost(config);
  if (d.prefix !== 24) return { passed: false, message: "子网掩码不对：和路由器的局域网设置不一致。" };
  if (d.problems.length) return { passed: false, message: `本机地址有问题：${d.problems.map((p) => PROBLEM_TEXT[p]).join("；")}。` };
  if (!d.gatewayOk) return { passed: false, message: "默认网关不对：数据包出不了家门。" };
  if (!d.dnsOk) return { passed: false, message: "DNS 服务器不对：名字解析不出来。" };
  return hostWorks(config)
    ? { passed: true, message: "新笔记本能打开 library.test 了：地址、掩码、网关、DNS 全部正确。" }
    : { passed: false, message: "还有地方没配好。" };
}
