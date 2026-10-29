import { describe, expect, it } from "vitest";

import { KEYS, fingerprint, sign, verify, withPrivate, withPublic } from "@/content/courses/crypto-basics/simulation/crypto";
import { CERTIFICATES, PASSWORD_INITIAL, PUBLIC_INITIAL, SYMMETRIC_INITIAL, expectedCert, nameMatches } from "@/content/courses/crypto-basics/simulation/labs";
import {
  validateCertificateLab,
  validateMirrorLab,
  validatePasswordLab,
  validatePublicLab,
  validateSignatureLab,
  validateSymmetricLab,
} from "@/content/courses/crypto-basics/validators";

describe("crypto-basics 玩具密码学", () => {
  it("指纹：相同输入相同输出，改一个字大部分位都变", () => {
    expect(fingerprint("library")).toBe(fingerprint("library"));
    const a = fingerprint("开馆时间 9:00");
    const b = fingerprint("开馆时间 8:00");
    expect([...a].filter((char, index) => char !== b[index]).length).toBeGreaterThan(10);
    expect(fingerprint("")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("RSA：公钥加密私钥解密，私钥签名公钥验证", () => {
    const key = KEYS.director;
    expect(withPrivate(key, withPublic(key, 42))).toBe(42);
    const signature = sign(KEYS.library, "通知");
    expect(verify(KEYS.library, "通知", signature)).toBe(true);
    expect(verify(KEYS.library, "通知！", signature)).toBe(false);
    expect(verify(KEYS.impostor, "通知", signature)).toBe(false);
  });

  it("通配符证书只覆盖一层子域名", () => {
    expect(nameMatches("*.library.test", "api.library.test")).toBe(true);
    expect(nameMatches("*.library.test", "library.test")).toBe(false);
    expect(nameMatches("*.library.test", "a.b.library.test")).toBe(false);
  });
});

describe("crypto-basics 服务端验证器", () => {
  it("镜像：只和官网公布的指纹比", () => {
    expect(validateMirrorLab({ safe: ["a", "c"], why: "same-page" }).passed).toBe(true);
    expect(String(validateMirrorLab({ safe: ["a", "b"], why: "same-page" }).feedback.message)).toContain("B");
    expect(validateMirrorLab({ safe: ["a"], why: "same-page" }).passed).toBe(false);
    expect(validateMirrorLab({ safe: ["a", "c"], why: "collision" }).passed).toBe(false);
  });

  it("存密码：只有加盐的慢哈希、而且强度合适才行", () => {
    expect(validatePasswordLab({ choice: PASSWORD_INITIAL }).passed).toBe(false);
    expect(validatePasswordLab({ choice: { storage: "slow-salt", cost: 100 } }).passed).toBe(true);
    for (const choice of [{ storage: "fast-salt", cost: 100 }, { storage: "slow-salt", cost: 1 }, { storage: "slow-salt", cost: 3000 }, { storage: "plain", cost: 100 }]) {
      expect(validatePasswordLab({ choice }).passed).toBe(false);
    }
  });

  it("对称加密：要换模式、每次用新的随机数、事先交换密钥", () => {
    expect(validateSymmetricLab({ choice: SYMMETRIC_INITIAL }).passed).toBe(false);
    const good = { mode: "ctr", nonce: "random", key: "beforehand" };
    expect(validateSymmetricLab({ choice: good }).passed).toBe(true);
    for (const change of [{ mode: "ecb" }, { nonce: "fixed" }, { key: "attached" }]) expect(validateSymmetricLab({ choice: { ...good, ...change } }).passed).toBe(false);
  });

  it("公钥：用对方的公钥加密，用自己的私钥签名", () => {
    expect(validatePublicLab({ choice: PUBLIC_INITIAL }).passed).toBe(false);
    expect(validatePublicLab({ choice: { encrypt: "director-public", sign: "you-private" } }).passed).toBe(true);
    for (const choice of [{ encrypt: "you-private", sign: "you-private" }, { encrypt: "director-public", sign: "you-public" }, { encrypt: "none", sign: "you-private" }]) {
      expect(validatePublicLab({ choice }).passed).toBe(false);
    }
  });

  it("签名：验证通过还要看是谁的钥匙", () => {
    expect(validateSignatureLab({ answers: { a: "trust", b: "wrong-key", c: "tampered", d: "unsigned" } }).passed).toBe(true);
    expect(String(validateSignatureLab({ answers: { a: "trust", b: "trust", c: "tampered", d: "unsigned" } }).feedback.message)).toContain("指纹");
  });

  it("证书：过期、域名、签发者和“根本不是这个网站”", () => {
    const answers = Object.fromEntries(CERTIFICATES.map((cert) => [cert.id, expectedCert(cert)]));
    expect(answers).toMatchObject({ home: "ok", api: "ok", cafe: "untrusted", old: "expired", apex: "name", lookalike: "elsewhere" });
    expect(validateCertificateLab({ answers }).passed).toBe(true);
    expect(String(validateCertificateLab({ answers: { ...answers, apex: "ok" } }).feedback.message)).toContain("library.test 本身");
  });

  it("拒绝格式错误的输入", () => {
    expect(validatePasswordLab({ choice: { storage: "rot13", cost: 1 } }).passed).toBe(false);
    expect(validateMirrorLab({ safe: "a" }).passed).toBe(false);
    expect(validateSignatureLab(null).passed).toBe(false);
  });
});
