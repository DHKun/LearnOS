import { describe, expect, it } from "vitest";

import {
  ARP_QUESTIONS,
  DNS_RECORDS,
  FIREWALL_INITIAL,
  HOSTS_LINES,
  LAPTOP_INITIAL,
  NAT_INITIAL,
  PRINTER_INITIAL,
  ROUTE_INITIAL,
} from "@/content/courses/networking-basics/simulation/labs";
import {
  broadcastOf,
  formatIp,
  inSubnet,
  maskToPrefix,
  networkOf,
  parseCidr,
  parseIp,
  runCommand,
  traceOffice,
} from "@/content/courses/networking-basics/simulation/net";
import {
  validateArpLab,
  validateDnsLab,
  validateFirewallLab,
  validateLaptopLab,
  validateNatLab,
  validateRouteLab,
  validateSubnetLab,
  validateTcpLab,
  validateTraceLab,
} from "@/content/courses/networking-basics/validators";

describe("networking-basics 小城网络", () => {
  it("IPv4 与子网计算", () => {
    const ip = parseIp("192.168.1.130")!;
    expect(formatIp(networkOf(ip, 25))).toBe("192.168.1.128");
    expect(formatIp(broadcastOf(ip, 25))).toBe("192.168.1.255");
    expect(maskToPrefix("255.255.255.0")).toBe(24);
    expect(maskToPrefix("255.255.0.255")).toBeNull();
    expect(inSubnet(parseIp("10.8.20.5")!, parseIp("10.8.0.0")!, 16)).toBe(true);
    expect(parseCidr("10.8.1.5/24")).toBeNull();
    expect(parseIp("256.1.1.1")).toBeNull();
  });

  it("初始路由表：去 library.test 的包在两台路由器之间打转", () => {
    expect(traceOffice(ROUTE_INITIAL, "198.51.100.10").outcome).toBe("loop");
    expect(traceOffice(ROUTE_INITIAL, "10.8.20.5").outcome).toBe("delivered");
    // 只改默认路由会让总部不通：私有地址被运营商丢弃
    const onlyDefault = [ROUTE_INITIAL[0], { destination: "0.0.0.0/0", via: "isp" as const }];
    expect(traceOffice(onlyDefault, "10.8.20.5").outcome).toBe("dropped");
  });

  it("模拟命令行如实反映配置问题", () => {
    expect(runCommand(LAPTOP_INITIAL, "ipconfig")).toContain("另一台设备正在使用此 IP 地址");
    expect(runCommand(LAPTOP_INITIAL, "nslookup library.test")).toContain("DNS 请求超时");
    expect(runCommand(LAPTOP_INITIAL, "ping 198.51.100.10")).toContain("请求超时");
    const good = { ip: "192.168.1.60", mask: "255.255.255.0", gateway: "192.168.1.1", dns: "192.168.1.1" };
    expect(runCommand(good, "curl https://library.test")).toContain("200 OK");
    expect(runCommand(good, "rm -rf /")).toContain("不支持的命令");
  });
});

describe("networking-basics 服务端验证器", () => {
  it("打印机：初始配置不通过；改进同一网段、避开占用和地址池才通过", () => {
    expect(validateSubnetLab(PRINTER_INITIAL).passed).toBe(false);
    const good = { ip: "192.168.1.60", mask: "255.255.255.0", gateway: "192.168.1.1" };
    expect(validateSubnetLab(good).passed).toBe(true);
    for (const change of [
      { ip: "192.168.1.20" },
      { ip: "192.168.1.150" },
      { ip: "192.168.1.255" },
      { mask: "255.255.0.0" },
      { gateway: "192.168.2.1" },
      { ip: "192.168.1.300" },
    ]) {
      expect(validateSubnetLab({ ...good, ...change }).passed).toBe(false);
    }
  });

  it("ARP 抓包", () => {
    const good = { asker: "192.168.1.23", broadcast: "all", why: "conflict", who: "b8:27:eb:3d:21:0a" };
    expect(validateArpLab({ answers: good }).passed).toBe(true);
    expect(validateArpLab({ answers: { ...good, who: "5c:f3:70:9e:44:60" } }).passed).toBe(false);
    expect(ARP_QUESTIONS).toHaveLength(4);
  });

  it("路由表：默认路由走运营商，总部走 VPN；用更具体的网段也可以", () => {
    expect(validateRouteLab({ routes: ROUTE_INITIAL }).passed).toBe(false);
    const good = [
      { destination: "10.8.1.0/24", via: "direct" },
      { destination: "10.8.0.0/16", via: "vpn" },
      { destination: "0.0.0.0/0", via: "isp" },
    ];
    expect(validateRouteLab({ routes: good }).passed).toBe(true);
    expect(validateRouteLab({ routes: [good[0], { destination: "10.8.20.0/24", via: "vpn" }, good[2]] }).passed).toBe(true);
    expect(validateRouteLab({ routes: [good[0], good[2]] }).passed).toBe(false);
    expect(validateRouteLab({ routes: [good[0], { destination: "10.8.20.1/16", via: "vpn" }, good[2]] }).passed).toBe(false);
    expect(validateRouteLab({ routes: [{ destination: "10.8.0.0/16", via: "vpn" }, good[2]] }).passed).toBe(false);
  });

  it("DNS 诊断：原因与 hosts 修复都要对", () => {
    const causes = Object.fromEntries(DNS_RECORDS.map((item) => [item.id, item.cause]));
    expect(validateDnsLab({ causes, removeLine: HOSTS_LINES[1] }).passed).toBe(true);
    expect(validateDnsLab({ causes, removeLine: HOSTS_LINES[0] }).passed).toBe(false);
    expect(validateDnsLab({ causes: { ...causes, alice: "record" }, removeLine: HOSTS_LINES[1] }).feedback.message).toContain("权威");
  });

  it("防火墙：开够、但不多开", () => {
    expect(validateFirewallLab({ rules: FIREWALL_INITIAL }).passed).toBe(false);
    const good = [
      { protocol: "tcp", port: 443, source: "any" },
      { protocol: "tcp", port: 80, source: "any" },
      { protocol: "udp", port: 3478, source: "any" },
      { protocol: "tcp", port: 22, source: "office" },
    ];
    expect(validateFirewallLab({ rules: good }).passed).toBe(true);
    expect(validateFirewallLab({ rules: [...good, { protocol: "tcp", port: 5432, source: "any" }] }).passed).toBe(false);
    expect(validateFirewallLab({ rules: good.map((rule) => (rule.port === 22 ? { ...rule, source: "any" } : rule)) }).passed).toBe(false);
    expect(validateFirewallLab({ rules: good.map((rule) => (rule.port === 3478 ? { ...rule, protocol: "tcp" } : rule)) }).passed).toBe(false);
    expect(validateFirewallLab({ rules: [{ protocol: "tcp", port: 70000, source: "any" }] }).passed).toBe(false);
  });

  it("TCP 抓包", () => {
    const good = { handshake: "3", dupack: "1001", resend: "1001", jump: "4001", app: "ordered" };
    expect(validateTcpLab({ answers: good }).passed).toBe(true);
    for (const change of [{ dupack: "2001" }, { jump: "2001" }, { app: "gap" }]) {
      expect(validateTcpLab({ answers: { ...good, ...change } }).passed).toBe(false);
    }
  });

  it("端口转发：协议要对，危险转发要删，还要经得起路由器重启", () => {
    expect(validateNatLab(NAT_INITIAL).passed).toBe(false);
    const forwards = [
      { externalPort: 8443, protocol: "tcp", internalIp: "192.168.1.20", internalPort: 443 },
      { externalPort: 3074, protocol: "udp", internalIp: "192.168.1.37", internalPort: 3074 },
    ];
    const reservations = [
      { device: "nas", ip: "192.168.1.20" },
      { device: "console", ip: "192.168.1.37" },
    ];
    expect(validateNatLab({ forwards, reservations }).passed).toBe(true);
    // 不做地址保留：重启后两台设备的地址对调
    expect(validateNatLab({ forwards, reservations: [] }).passed).toBe(false);
    expect(validateNatLab({ forwards, reservations: [reservations[0]] }).passed).toBe(false);
    expect(validateNatLab({ forwards: [...forwards, NAT_INITIAL.forwards[2]], reservations }).passed).toBe(false);
    expect(validateNatLab({ forwards, reservations: [{ device: "nas", ip: "192.168.1.1" }, reservations[1]] }).passed).toBe(false);
  });

  it("traceroute：认出“看起来吓人但正常”的跳", () => {
    const good = { hop3: "silent", hop5: "busy", where: "transit" };
    expect(validateTraceLab({ answers: good }).passed).toBe(true);
    expect(validateTraceLab({ answers: { ...good, hop3: "broken" } }).passed).toBe(false);
    expect(validateTraceLab({ answers: { ...good, where: "isp" } }).passed).toBe(false);
  });

  it("新笔记本：三处配置都修好才通过", () => {
    expect(validateLaptopLab({ config: LAPTOP_INITIAL }).passed).toBe(false);
    const good = { ip: "192.168.1.60", mask: "255.255.255.0", gateway: "192.168.1.1", dns: "192.168.1.1" };
    expect(validateLaptopLab({ config: good }).passed).toBe(true);
    expect(validateLaptopLab({ config: { ...good, dns: "203.0.113.53" } }).passed).toBe(true);
    for (const change of [{ ip: "192.168.1.20" }, { gateway: "192.168.1.254" }, { dns: "192.168.1.53" }, { mask: "255.255.0.0" }]) {
      expect(validateLaptopLab({ config: { ...good, ...change } }).passed).toBe(false);
    }
    expect(validateLaptopLab({ config: good, passed: true }).passed).toBe(true);
    expect(validateLaptopLab({ config: LAPTOP_INITIAL, passed: true }).passed).toBe(false);
  });
});
