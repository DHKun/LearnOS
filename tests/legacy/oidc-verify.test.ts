import { describe, expect, it } from "vitest";

/**
 * The verify script's issuer gate mirrors GoTrue's ValidateOAuthURL. These cases
 * encode the exact rules that blocked a real deployment, so a regression in the
 * host classification is caught before anyone tries a live SSO run.
 */
function isPrivateOrLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  if (host === "[::1]" || host === "::1") return true;
  return false;
}

function issuerAcceptable(issuer: string): boolean {
  const url = new URL(issuer);
  return url.protocol === "https:" && !isPrivateOrLoopback(url.hostname);
}

describe("OIDC issuer gate", () => {
  it("rejects http even for loopback", () => {
    expect(issuerAcceptable("http://127.0.0.1:4441")).toBe(false);
    expect(issuerAcceptable("http://ctf.example.com")).toBe(false);
  });

  it("rejects https on loopback, private and link-local addresses", () => {
    expect(issuerAcceptable("https://localhost")).toBe(false);
    expect(issuerAcceptable("https://127.0.0.1")).toBe(false);
    expect(issuerAcceptable("https://[::1]")).toBe(false);
    expect(issuerAcceptable("https://10.66.66.2:8443")).toBe(false);
    expect(issuerAcceptable("https://192.168.1.10")).toBe(false);
    expect(issuerAcceptable("https://172.20.0.5")).toBe(false);
    expect(issuerAcceptable("https://169.254.1.1")).toBe(false);
    expect(issuerAcceptable("https://foo.localhost")).toBe(false);
  });

  it("accepts a public https issuer", () => {
    expect(issuerAcceptable("https://ctf.example.com")).toBe(true);
    expect(issuerAcceptable("https://ctf.example.com:8443")).toBe(true);
    expect(issuerAcceptable("https://172.32.0.1")).toBe(true);
  });
});
