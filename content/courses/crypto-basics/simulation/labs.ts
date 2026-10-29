/**
 * Lab data and grading rules. Pure functions shared by the browser (live
 * feedback) and validators.ts (the only source of `passed`). Outcomes are
 * computed with the toy primitives in crypto.ts, not looked up.
 */
import { type KeyId, KEYS, digest, fingerprint, keyFingerprint, sign, verify, withPrivate, withPublic } from "./crypto";

export type Goal = { id: string; label: string; ok: boolean; detail?: string };
export type Graded = { passed: boolean; message: string };

export const TODAY = "2026-10-29";

// ---------------------------------------------------------------------------
// Ch2 · which mirror is safe to download from
// ---------------------------------------------------------------------------

const RELEASE = "library-app 2.4 安装包：借还书客户端，2026-10-20 发布。";
const OLD_RELEASE = "library-app 2.3 安装包：借还书客户端，2026-08-02 发布。";
const TAMPERED = `${RELEASE}（附带了一段会偷偷上传密码的代码）`;

export const OFFICIAL_FINGERPRINT = fingerprint(RELEASE);

export const MIRRORS = [
  { id: "a", site: "mirror.campus.example", file: RELEASE, listed: OFFICIAL_FINGERPRINT },
  { id: "b", site: "fast-download.example", file: TAMPERED, listed: fingerprint(TAMPERED) },
  { id: "c", site: "cdn.reading.example", file: RELEASE, listed: fingerprint(OLD_RELEASE) },
  { id: "d", site: "old-mirror.example", file: OLD_RELEASE, listed: fingerprint(OLD_RELEASE) },
] as const;
export type MirrorId = (typeof MIRRORS)[number]["id"];

export const SAFE_MIRRORS = MIRRORS.filter((mirror) => fingerprint(mirror.file) === OFFICIAL_FINGERPRINT).map((mirror) => mirror.id);

export const WHY_OPTIONS = [
  { id: "same-page", label: "那个指纹和文件放在同一个页面上，篡改文件的人也能顺手改掉指纹，只能和可信来源公布的指纹比" },
  { id: "collision", label: "两个不同的文件经常会算出相同的指纹" },
  { id: "format", label: "指纹的格式不对" },
] as const;

export function gradeMirrors(input: { safe: string[]; why: string }): Graded & { correct: boolean[] } {
  const chosen = [...new Set(input.safe)].sort();
  const pickOk = chosen.join() === [...SAFE_MIRRORS].sort().join();
  const whyOk = input.why === "same-page";
  if (pickOk && whyOk) return { passed: true, message: "只信官网公布的指纹：A 和 C 下载的文件和官方的一模一样。", correct: [pickOk, whyOk] };
  const hints: string[] = [];
  if (chosen.includes("b")) hints.push("B 的文件和它自己页面上的指纹对得上，但和官网公布的对不上。");
  if (!chosen.includes("c") && chosen.includes("a")) hints.push("C 页面上的指纹是旧版的，可它的文件本身呢？");
  if (chosen.includes("d")) hints.push("D 的文件不是 2.4 版。");
  if (!whyOk) hints.push("第二题再想想：指纹应该和谁比？");
  return { passed: false, message: hints.join("") || "再对照一遍官网公布的指纹。", correct: [pickOk, whyOk] };
}

// ---------------------------------------------------------------------------
// Ch3 · how to store passwords
// ---------------------------------------------------------------------------

export type Storage = "plain" | "fast" | "fast-salt" | "slow-salt";
export type Cost = 1 | 100 | 3000;
export type PasswordChoice = { storage: Storage; cost: Cost };
export const PASSWORD_INITIAL: PasswordChoice = { storage: "fast", cost: 1 };

export const STORAGES: { id: Storage; label: string }[] = [
  { id: "plain", label: "直接存密码" },
  { id: "fast", label: "存密码的指纹（快速哈希）" },
  { id: "fast-salt", label: "每人一段随机的“盐”，存“盐 + 密码”的指纹（快速哈希）" },
  { id: "slow-salt", label: "每人一段随机的盐，用专门设计得很慢的密码哈希" },
];

const READERS = 2000;
const GUESSES = 1_000_000;
const FAST_SECONDS = 0.000001;

function formatDuration(seconds: number): string {
  if (seconds < 0.001) return "不到 1 毫秒";
  if (seconds < 1) return `${Math.round(seconds * 1000)} 毫秒`;
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  if (seconds < 86_400 * 2) return `${Math.round(seconds / 3600)} 小时`;
  if (seconds < 86_400 * 365) return `${Math.round(seconds / 86_400)} 天`;
  return `${Math.round(seconds / (86_400 * 365))} 年`;
}

export function evaluatePasswords(choice: PasswordChoice) {
  const perGuess = choice.storage === "slow-salt" ? choice.cost / 1000 : FAST_SECONDS;
  const salted = choice.storage === "fast-salt" || choice.storage === "slow-salt";
  const hashed = choice.storage !== "plain";
  // Without salt one pass over the guess list covers every reader; with salt each reader needs their own pass.
  const attack = hashed ? perGuess * GUESSES * (salted ? READERS : 1) : 0;
  const login = choice.storage === "slow-salt" ? choice.cost / 1000 : FAST_SECONDS;
  const goals: Goal[] = [
    { id: "readable", label: "数据库泄露后，看不到任何人的密码原文", ok: hashed, detail: hashed ? "库里只有指纹" : "密码就在库里" },
    { id: "same", label: "两位读者用了同一个密码，在库里看起来也不一样", ok: salted, detail: salted ? "盐不同，指纹不同" : "相同密码，相同指纹" },
    { id: "table", label: "没法用一张预先算好的“常见密码 → 指纹”表一次查出所有人", ok: salted, detail: salted ? "每人的盐不同，表用不上" : "查一次表就全出来了" },
    { id: "slow", label: `把 ${GUESSES.toLocaleString("zh-CN")} 个常见密码挨个试遍所有 ${READERS} 位读者，至少要花一年`, ok: hashed && attack >= 86_400 * 365, detail: hashed ? `大约 ${formatDuration(attack)}` : "不用试，直接看" },
    { id: "login", label: "读者登录时，验证一次密码不超过 0.5 秒", ok: login <= 0.5, detail: `每次 ${formatDuration(login)}` },
  ];
  return { goals, passed: goals.every((goal) => goal.ok) };
}

// ---------------------------------------------------------------------------
// Ch4 · symmetric encryption: modes, nonces and key delivery
// ---------------------------------------------------------------------------

export type Mode = "ecb" | "ctr";
export type SymmetricChoice = { mode: Mode; nonce: "fixed" | "random"; key: "attached" | "beforehand" };
export const SYMMETRIC_INITIAL: SymmetricChoice = { mode: "ecb", nonce: "fixed", key: "attached" };
const KEY = "馆内共享密钥";

/** The library logo, 16 × 8 pixels; blocks are 4 pixels wide. */
export const LOGO = [
  "0000000000000000",
  "0011111001111100",
  "0010000110000100",
  "0010000110000100",
  "0010000110000100",
  "0011111001111100",
  "0000000110000000",
  "0000000000000000",
];

export function encryptBlocks(blocks: string[], choice: SymmetricChoice, message: number): string[] {
  const nonce = choice.nonce === "fixed" ? "0000" : `nonce-${message}`;
  return blocks.map((block, index) => (choice.mode === "ecb" ? fingerprint(`${KEY}|${block}`) : fingerprint(`${KEY}|${nonce}|${index}|${block}`)).slice(0, 4));
}

export function logoBlocks(): string[] {
  return LOGO.flatMap((row) => row.match(/.{4}/g)!);
}

export const NOTICE = "今晚十八点提前闭馆";

export function noticeBlocks(): string[] {
  return NOTICE.match(/.{1,2}/g)!;
}

export function evaluateSymmetric(choice: SymmetricChoice) {
  const plain = logoBlocks();
  const cipher = encryptBlocks(plain, choice, 1);
  const groups = new Map<string, Set<string>>();
  plain.forEach((block, index) => groups.set(block, (groups.get(block) ?? new Set()).add(cipher[index]!)));
  const leaks = [...groups.values()].every((set) => set.size === 1) && groups.size < plain.length;
  const first = encryptBlocks(noticeBlocks(), choice, 1).join("");
  const second = encryptBlocks(noticeBlocks(), choice, 2).join("");
  const goals: Goal[] = [
    { id: "pattern", label: "加密后的图片里看不出图书馆标志的轮廓", ok: !leaks, detail: leaks ? "相同的像素块加密成了相同的密文块" : "每个位置的密文都不一样" },
    { id: "repeat", label: "同一条通知发两次，两次的密文不一样", ok: first !== second, detail: first === second ? "两次密文完全相同：别人能看出你又发了同样的内容" : "两次密文不同" },
    { id: "key", label: "截获了密文的人解不开", ok: choice.key === "beforehand", detail: choice.key === "beforehand" ? "密钥事先当面交给了对方" : "密钥和密文一起寄出去了" },
  ];
  return { goals, passed: goals.every((goal) => goal.ok), cipher };
}

// ---------------------------------------------------------------------------
// Ch5 · public-key encryption and signing
// ---------------------------------------------------------------------------

export type EncryptWith = "none" | "director-public" | "you-public" | "you-private";
export type SignWith = "none" | "you-private" | "you-public" | "director-public";
export type PublicChoice = { encrypt: EncryptWith; sign: SignWith };
export const PUBLIC_INITIAL: PublicChoice = { encrypt: "you-public", sign: "director-public" };
export const MESSAGE = 42;
export const MESSAGE_TEXT = "借书证 42 号的挂失申请";

function encryptMessage(choice: EncryptWith): number {
  if (choice === "director-public") return withPublic(KEYS.director, MESSAGE);
  if (choice === "you-public") return withPublic(KEYS.you, MESSAGE);
  if (choice === "you-private") return withPrivate(KEYS.you, MESSAGE);
  return MESSAGE;
}

/** Everything someone can do to a number with the keys they hold. */
function readers(holder: "director" | "outsider"): ((value: number) => number)[] {
  const publics = (Object.keys(KEYS) as KeyId[]).map((id) => (value: number) => withPublic(KEYS[id], value));
  return holder === "director" ? [(value) => value, (value) => withPrivate(KEYS.director, value), ...publics] : [(value) => value, ...publics];
}

function signMessage(choice: SignWith): number | null {
  const hash = digest(MESSAGE_TEXT, KEYS.you.n);
  if (choice === "you-private") return withPrivate(KEYS.you, hash);
  if (choice === "you-public") return withPublic(KEYS.you, hash);
  if (choice === "director-public") return withPublic(KEYS.director, hash) % KEYS.you.n;
  return null;
}

export function evaluatePublic(choice: PublicChoice) {
  const ciphertext = encryptMessage(choice.encrypt);
  const signature = signMessage(choice.sign);
  const directorReads = readers("director").some((open) => open(ciphertext) === MESSAGE);
  const outsiderReads = readers("outsider").some((open) => open(ciphertext) === MESSAGE);
  const verified = signature !== null && verify(KEYS.you, MESSAGE_TEXT, signature);
  const goals: Goal[] = [
    { id: "director", label: "周馆长能读到内容", ok: directorReads, detail: `密文 ${ciphertext}` },
    { id: "outsider", label: "路上截获信件的人读不到内容", ok: !outsiderReads, detail: outsiderReads ? "用公开的钥匙就能还原出 42" : "只有馆长的私钥能还原" },
    { id: "signed", label: "馆长用你的公钥验证签名，能确认是你寄的", ok: verified, detail: signature === null ? "没有签名" : `签名 ${signature}，验证${verified ? "通过" : "失败"}` },
  ];
  return { goals, passed: goals.every((goal) => goal.ok), ciphertext, signature };
}

// ---------------------------------------------------------------------------
// Ch6 · which announcements to trust
// ---------------------------------------------------------------------------

export const LIBRARY_KEY_PRINT = keyFingerprint(KEYS.library);

type Announcement = { id: string; text: string; signer: KeyId | null; signature: number | null };

const ORIGINAL_C = "下周二（11 月 3 日）设备检修，闭馆一天。";

export const ANNOUNCEMENTS: Announcement[] = [
  { id: "a", text: "11 月 1 日起，工作日开馆时间改为 9:00–21:00。", signer: "library", signature: sign(KEYS.library, "11 月 1 日起，工作日开馆时间改为 9:00–21:00。") },
  { id: "b", text: "系统升级，请在 48 小时内到 library-test.example 重新输入借书证密码。", signer: "impostor", signature: sign(KEYS.impostor, "系统升级，请在 48 小时内到 library-test.example 重新输入借书证密码。") },
  { id: "c", text: "下周三（11 月 4 日）设备检修，闭馆一天。", signer: "library", signature: sign(KEYS.library, ORIGINAL_C) },
  { id: "d", text: "本月新书推荐：《额尔古纳河右岸》《我与地坛》。", signer: null, signature: null },
];

export const VERDICTS = [
  { id: "trust", label: "可信：图书馆的签名，验证通过" },
  { id: "tampered", label: "不可信：签名对不上，内容被改过" },
  { id: "wrong-key", label: "不可信：签名验证通过，但签名的不是图书馆的钥匙" },
  { id: "unsigned", label: "无法确认：没有签名" },
] as const;
export type Verdict = (typeof VERDICTS)[number]["id"];

export function verifyAnnouncement(item: Announcement): { valid: boolean; keyPrint: string | null } {
  if (!item.signer || item.signature === null) return { valid: false, keyPrint: null };
  const key = KEYS[item.signer];
  return { valid: verify(key, item.text, item.signature), keyPrint: keyFingerprint(key) };
}

export function expectedVerdict(item: Announcement): Verdict {
  const check = verifyAnnouncement(item);
  if (check.keyPrint === null) return "unsigned";
  if (!check.valid) return "tampered";
  return check.keyPrint === LIBRARY_KEY_PRINT ? "trust" : "wrong-key";
}

export function gradeAnnouncements(answers: Partial<Record<string, string>>) {
  const results = ANNOUNCEMENTS.map((item) => ({ id: item.id, ok: answers[item.id] === expectedVerdict(item) }));
  const correct = results.filter((item) => item.ok).length;
  const hints: string[] = [];
  if (answers.b === "trust") hints.push("B 的签名确实验证通过了，可是用来验证的那把公钥，指纹和借书证背面印的一样吗？");
  if (answers.c === "trust") hints.push("C 用图书馆的公钥验证一下。");
  return { passed: correct === results.length, correct, total: results.length, hints };
}

// ---------------------------------------------------------------------------
// Ch7 · certificates
// ---------------------------------------------------------------------------

export const TRUSTED_ROOTS = ["小城根证书机构", "全国数字证书中心"];

export type Certificate = { id: string; url: string; subject: string; issuer: string; chain: string[]; from: string; to: string; note?: string };

export const CERTIFICATES: Certificate[] = [
  { id: "home", url: "https://library.test", subject: "library.test", issuer: "小城证书 R3", chain: ["小城证书 R3", "小城根证书机构"], from: "2026-03-01", to: "2027-03-01" },
  { id: "api", url: "https://api.library.test", subject: "*.library.test", issuer: "小城证书 R3", chain: ["小城证书 R3", "小城根证书机构"], from: "2026-05-10", to: "2027-05-10" },
  { id: "cafe", url: "https://library.test（在咖啡馆的免费 Wi-Fi 上打开）", subject: "library.test", issuer: "FreeWiFi Portal CA", chain: ["FreeWiFi Portal CA"], from: "2026-10-29", to: "2027-10-29", note: "签发者给自己签名" },
  { id: "old", url: "https://old.library.test", subject: "old.library.test", issuer: "小城证书 R3", chain: ["小城证书 R3", "小城根证书机构"], from: "2025-09-30", to: "2026-09-30" },
  { id: "apex", url: "https://library.test（新换的证书）", subject: "*.library.test", issuer: "全国数字证书中心 G2", chain: ["全国数字证书中心 G2", "全国数字证书中心"], from: "2026-10-01", to: "2027-10-01" },
  { id: "lookalike", url: "https://library.test.login-check.example", subject: "library.test.login-check.example", issuer: "全国数字证书中心 G2", chain: ["全国数字证书中心 G2", "全国数字证书中心"], from: "2026-10-20", to: "2027-01-20" },
];

export const CERT_VERDICTS = [
  { id: "ok", label: "没问题，是 library.test 自己的网站" },
  { id: "expired", label: "证书过期了" },
  { id: "name", label: "证书上的域名和网址对不上" },
  { id: "untrusted", label: "签发者不受信任（可能有人在中间冒充）" },
  { id: "elsewhere", label: "证书本身没问题，但这根本不是 library.test 的网站" },
] as const;
export type CertVerdict = (typeof CERT_VERDICTS)[number]["id"];

function hostOf(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/（.*$/, "").split("/")[0]!;
}

export function nameMatches(subject: string, host: string): boolean {
  if (subject.startsWith("*.")) {
    const base = subject.slice(2);
    return host.endsWith(`.${base}`) && !host.slice(0, -base.length - 1).includes(".");
  }
  return subject === host;
}

export function expectedCert(cert: Certificate): CertVerdict {
  if (!TRUSTED_ROOTS.includes(cert.chain[cert.chain.length - 1]!)) return "untrusted";
  if (cert.to < TODAY || cert.from > TODAY) return "expired";
  const host = hostOf(cert.url);
  if (!nameMatches(cert.subject, host)) return "name";
  return host === "library.test" || host.endsWith(".library.test") ? "ok" : "elsewhere";
}

export function gradeCertificates(answers: Partial<Record<string, string>>) {
  const results = CERTIFICATES.map((cert) => ({ id: cert.id, ok: answers[cert.id] === expectedCert(cert) }));
  const correct = results.filter((item) => item.ok).length;
  const hints: string[] = [];
  if (answers.apex === "ok") hints.push("*.library.test 只覆盖再多一层的子域名，比如 api.library.test，不包括 library.test 本身。");
  if (answers.lookalike === "ok") hints.push("看网址的最后两段：这个网站属于谁？");
  if (answers.cafe === "ok") hints.push("咖啡馆那张证书，一路往上找，最后落到了谁身上？");
  return { passed: correct === results.length, correct, total: results.length, hints };
}

// ---------------------------------------------------------------------------
// Input parsing for validators
// ---------------------------------------------------------------------------

export function parsePasswordChoice(value: unknown): PasswordChoice | null {
  if (!value || typeof value !== "object") return null;
  const { storage, cost } = value as Record<string, unknown>;
  if (!STORAGES.some((item) => item.id === storage) || ![1, 100, 3000].includes(cost as number)) return null;
  return { storage: storage as Storage, cost: cost as Cost };
}

export function parseSymmetricChoice(value: unknown): SymmetricChoice | null {
  if (!value || typeof value !== "object") return null;
  const { mode, nonce, key } = value as Record<string, unknown>;
  if ((mode !== "ecb" && mode !== "ctr") || (nonce !== "fixed" && nonce !== "random") || (key !== "attached" && key !== "beforehand")) return null;
  return { mode, nonce, key };
}

export function parsePublicChoice(value: unknown): PublicChoice | null {
  if (!value || typeof value !== "object") return null;
  const { encrypt, sign: signWith } = value as Record<string, unknown>;
  const encrypts: EncryptWith[] = ["none", "director-public", "you-public", "you-private"];
  const signs: SignWith[] = ["none", "you-private", "you-public", "director-public"];
  if (!encrypts.includes(encrypt as EncryptWith) || !signs.includes(signWith as SignWith)) return null;
  return { encrypt: encrypt as EncryptWith, sign: signWith as SignWith };
}
