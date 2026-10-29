"use client";

import * as React from "react";
import { Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { Button } from "@/components/ui/button";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import { KEYS, fingerprint, groupHex, keyFingerprint, verify } from "../simulation/crypto";
import {
  ANNOUNCEMENTS,
  CERTIFICATES,
  CERT_VERDICTS,
  type Goal,
  LIBRARY_KEY_PRINT,
  LOGO,
  MESSAGE,
  MESSAGE_TEXT,
  MIRRORS,
  NOTICE,
  OFFICIAL_FINGERPRINT,
  PASSWORD_INITIAL,
  type PasswordChoice,
  PUBLIC_INITIAL,
  type PublicChoice,
  STORAGES,
  SYMMETRIC_INITIAL,
  type SymmetricChoice,
  TODAY,
  TRUSTED_ROOTS,
  VERDICTS,
  WHY_OPTIONS,
  encryptBlocks,
  evaluatePasswords,
  evaluatePublic,
  evaluateSymmetric,
  noticeBlocks,
} from "../simulation/labs";

const inputClass = "block w-full rounded-md border border-border bg-background p-2 text-sm";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function GoalList({ goals }: { goals: Goal[] }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
      {goals.map((goal) => (
        <li key={goal.id} className="rounded-md border border-border px-3 py-2" data-goal={goal.id} data-ok={goal.ok}>
          <Verdict ok={goal.ok}>{goal.label}</Verdict>
          {goal.detail && <p className="mt-0.5 text-xs text-muted-foreground">{goal.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

function Radios<T extends string | number>({ label, name, value, options, onChange, disabled }: { label: string; name: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled: boolean }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold">{label}</legend>
      {options.map((option) => (
        <label key={String(option.value)} className="flex items-start gap-2 text-sm">
          <input type="radio" name={name} disabled={disabled} checked={value === option.value} onChange={() => onChange(option.value)} className="mt-1" />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function Hex({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>;
}

// ---------------------------------------------------------------------------
// Ch2 · mirrors
// ---------------------------------------------------------------------------

type MirrorState = { computed: string[]; safe: string[]; why: string; scratch: string; passed: boolean };
const MIRROR_IDS = MIRRORS.map((mirror) => mirror.id) as string[];
function normalizeMirror(value: unknown): MirrorState {
  const record = asRecord(value);
  const list = (items: unknown) => (Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && MIRROR_IDS.includes(item)) : []);
  return {
    computed: list(record.computed),
    safe: list(record.safe),
    why: typeof record.why === "string" ? record.why.slice(0, 20) : "",
    scratch: typeof record.scratch === "string" ? record.scratch.slice(0, 200) : "图书馆",
    passed: record.passed === true,
  };
}

export function MirrorLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<MirrorState>({ computed: [], safe: [], why: "", scratch: "图书馆", passed: false }, normalizeMirror);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-4" data-testid="crypto-basics-mirror">
      <Ticket goal="找出可以放心下载的镜像站，并说明判断的依据。">
        library.test 的借还书客户端 2.4 版发布了，官网下载太慢，网上有四个镜像站。你要选一个下载，但不能装到被人动过手脚的版本。
      </Ticket>
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden /> 官网 https://library.test/download 公布的 2.4 版指纹
        </p>
        <p className="mt-1">
          <Hex>{groupHex(OFFICIAL_FINGERPRINT)}</Hex>
        </p>
      </div>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
        {MIRRORS.map((mirror) => {
          const computed = state.computed.includes(mirror.id);
          return (
            <li key={mirror.id} className="space-y-2 rounded-xl border border-border p-3" data-mirror={mirror.id}>
              <p className="text-sm font-semibold">
                镜像 {mirror.id.toUpperCase()} · <span className="font-mono text-xs">{mirror.site}</span>
              </p>
              <p className="text-xs">
                页面上写的指纹：<Hex>{groupHex(mirror.listed)}</Hex>
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button type="button" size="sm" variant="outline" disabled={readOnly || computed} onClick={() => setState((current) => ({ ...current, computed: [...current.computed, mirror.id] }))}>
                  <Fingerprint className="size-4" aria-hidden /> 计算下载到的文件的指纹
                </Button>
                {computed && <Hex>{groupHex(fingerprint(mirror.file))}</Hex>}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={locked} checked={state.safe.includes(mirror.id)} onChange={(event) => setState((current) => ({ ...current, safe: event.target.checked ? [...current.safe, mirror.id] : current.safe.filter((id) => id !== mirror.id) }))} />
                可以放心从这里下载
              </label>
            </li>
          );
        })}
      </ul>
      <Radios label="镜像 B 页面上的指纹和它的文件算出来的一模一样，为什么还是不能信？" name="why" value={state.why} disabled={locked} onChange={(why) => setState((current) => ({ ...current, why }))} options={WHY_OPTIONS.map((item) => ({ value: item.id as string, label: item.label }))} />
      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">试一试：改一个字，指纹会变多少？</summary>
        <input aria-label="任意文字" disabled={readOnly} value={state.scratch} maxLength={200} onChange={(event) => setState((current) => ({ ...current, scratch: event.target.value }))} className={cn(inputClass, "mt-2")} />
        <p className="mt-2">
          指纹：<Hex>{groupHex(fingerprint(state.scratch))}</Hex>
        </p>
      </details>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交判断" last={last}
        onSubmit={() => void submit({ safe: state.safe, why: state.why }, "crypto_mirror_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch3 · passwords
// ---------------------------------------------------------------------------

type PasswordState = { choice: PasswordChoice; passed: boolean };
function normalizePassword(value: unknown): PasswordState {
  const choice = asRecord(asRecord(value).choice);
  return {
    choice: { storage: pick(choice.storage, STORAGES.map((item) => item.id), PASSWORD_INITIAL.storage), cost: pick(choice.cost, [1, 100, 3000] as const, PASSWORD_INITIAL.cost) },
    passed: asRecord(value).passed === true,
  };
}

const SAMPLE = [
  { name: "张伟", salt: "k3P9", password: "library2026" },
  { name: "李娜", salt: "Qz71", password: "library2026" },
  { name: "王芳", salt: "m0Xe", password: "Wf!9-shu-shu" },
];

export function PasswordLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<PasswordState>({ choice: PASSWORD_INITIAL, passed: false }, normalizePassword);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluatePasswords(state.choice);
  const stored = (row: (typeof SAMPLE)[number]) => {
    if (state.choice.storage === "plain") return row.password;
    if (state.choice.storage === "fast") return groupHex(fingerprint(row.password)).slice(0, 14);
    return `${row.salt}$${groupHex(fingerprint(`${row.salt}${row.password}${state.choice.storage === "slow-salt" ? `×${state.choice.cost}` : ""}`)).slice(0, 14)}`;
  };
  return (
    <div className="space-y-4" data-testid="crypto-basics-password">
      <Ticket goal="选一种存密码的方式，让下面五项同时成立。">
        library.test 的读者表里存着 2000 位读者的登录密码。隔壁网站上个月整个数据库被人拖走了，馆长让你重新设计：就算库泄露了，也要尽量保住读者的密码。
      </Ticket>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Radios label="怎么存" name="storage" value={state.choice.storage} disabled={locked} onChange={(storage) => setState((current) => ({ ...current, choice: { ...current.choice, storage } }))} options={STORAGES.map((item) => ({ value: item.id, label: item.label }))} />
        <Radios label="慢哈希每验证一次要花（只对最后一种有效）" name="cost" value={state.choice.cost} disabled={locked || state.choice.storage !== "slow-salt"} onChange={(cost) => setState((current) => ({ ...current, choice: { ...current.choice, cost } }))} options={[{ value: 1 as const, label: "1 毫秒" }, { value: 100 as const, label: "100 毫秒" }, { value: 3000 as const, label: "3 秒" }]} />
      </div>
      <div className="overflow-x-auto">
        <table className="m-0 w-full min-w-[26rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-2">读者</th>
              <th className="p-2">库里存的东西（泄露后别人看到的）</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.map((row) => (
              <tr key={row.name} className="border-b border-border">
                <td className="p-2">{row.name}</td>
                <td className="p-2 font-mono">{stored(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted-foreground">张伟和李娜用的是同一个密码。</p>
      </div>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交方案" last={last}
        onSubmit={() => void submit({ choice: state.choice }, "crypto_password_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch4 · symmetric
// ---------------------------------------------------------------------------

type SymmetricState = { choice: SymmetricChoice; passed: boolean };
function normalizeSymmetric(value: unknown): SymmetricState {
  const choice = asRecord(asRecord(value).choice);
  return {
    choice: { mode: pick(choice.mode, ["ecb", "ctr"] as const, SYMMETRIC_INITIAL.mode), nonce: pick(choice.nonce, ["fixed", "random"] as const, SYMMETRIC_INITIAL.nonce), key: pick(choice.key, ["attached", "beforehand"] as const, SYMMETRIC_INITIAL.key) },
    passed: asRecord(value).passed === true,
  };
}

/** One shade per cipher block: identical blocks look identical, which is exactly what leaks. */
const SHADES = ["bg-slate-900", "bg-slate-700", "bg-slate-500", "bg-slate-300", "bg-sky-900", "bg-sky-700", "bg-sky-500", "bg-sky-300"];

function Pixels({ rows, cipher = false }: { rows: string[]; cipher?: boolean }) {
  return (
    <div className="inline-grid gap-px rounded border border-border bg-border p-px" style={{ gridTemplateColumns: `repeat(${rows[0]!.length}, minmax(0, 1fr))` }}>
      {rows.flatMap((row, y) => [...row].map((cell, x) => <span key={`${x}-${y}`} className={cn("size-3 sm:size-4", cipher ? SHADES[parseInt(row.slice(Math.floor(x / 4) * 4, Math.floor(x / 4) * 4 + 4), 16) % SHADES.length] : cell === "1" ? "bg-primary" : "bg-card")} />))}
    </div>
  );
}

export function SymmetricLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<SymmetricState>({ choice: SYMMETRIC_INITIAL, passed: false }, normalizeSymmetric);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluateSymmetric(state.choice);
  const cipherRows = LOGO.map((_, row) => result.cipher.slice(row * 4, row * 4 + 4).join(""));
  const set = (patch: Partial<SymmetricChoice>) => setState((current) => ({ ...current, choice: { ...current.choice, ...patch } }));
  const notices = [1, 2].map((send) => encryptBlocks(noticeBlocks(), state.choice, send).join(" "));
  return (
    <div className="space-y-4" data-testid="crypto-basics-symmetric">
      <Ticket goal="改这三处设置，让下面三项都成立。">
        分馆之间要用同一把密钥加密传送文件：一张馆徽图片，和每天都会发的“{NOTICE}”这类通知。现在的设置是同事随手配的。
      </Ticket>
      <div className="grid gap-4 md:grid-cols-3">
        <Radios label="加密方式" name="mode" value={state.choice.mode} disabled={locked} onChange={(mode) => set({ mode })} options={[{ value: "ecb" as const, label: "逐块加密：每 4 个像素用同一把钥匙单独加密" }, { value: "ctr" as const, label: "计数器模式：每一块混入随机数和位置编号再加密" }]} />
        <Radios label="随机数（只对计数器模式有效）" name="nonce" value={state.choice.nonce} disabled={locked} onChange={(nonce) => set({ nonce })} options={[{ value: "fixed" as const, label: "固定用 0000" }, { value: "random" as const, label: "每条消息重新生成" }]} />
        <Radios label="密钥怎么给对方" name="key" value={state.choice.key} disabled={locked} onChange={(key) => set({ key })} options={[{ value: "attached" as const, label: "和密文放在同一封邮件里" }, { value: "beforehand" as const, label: "事先当面交给对方" }]} />
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold">原图</p>
          <Pixels rows={LOGO} />
        </div>
        <div className="space-y-1" data-testid="cipher-image">
          <p className="text-xs font-semibold">加密后</p>
          <Pixels rows={cipherRows} cipher />
        </div>
      </div>
      <div className="space-y-1 text-xs">
        <p className="font-semibold">“{NOTICE}”发两次的密文</p>
        {notices.map((text, index) => (
          <p key={index} className="font-mono">
            第 {index + 1} 次：{text}
          </p>
        ))}
      </div>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交设置" last={last}
        onSubmit={() => void submit({ choice: state.choice }, "crypto_symmetric_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch5 · public key
// ---------------------------------------------------------------------------

type PublicState = { choice: PublicChoice; passed: boolean };
function normalizePublic(value: unknown): PublicState {
  const choice = asRecord(asRecord(value).choice);
  return {
    choice: {
      encrypt: pick(choice.encrypt, ["none", "director-public", "you-public", "you-private"] as const, PUBLIC_INITIAL.encrypt),
      sign: pick(choice.sign, ["none", "you-private", "you-public", "director-public"] as const, PUBLIC_INITIAL.sign),
    },
    passed: asRecord(value).passed === true,
  };
}

function KeyCard({ title, publicKey, privateNote }: { title: string; publicKey: string; privateNote: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-border p-3 text-xs">
      <p className="font-semibold">{title}</p>
      <p className="flex items-center gap-1.5">
        <Lock className="size-3.5 text-primary" aria-hidden /> 公钥：<Hex>{publicKey}</Hex>（公开，谁都能拿到）
      </p>
      <p className="flex items-center gap-1.5">
        <KeyRound className="size-3.5 text-warning" aria-hidden /> 私钥：{privateNote}
      </p>
    </div>
  );
}

export function PublicLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<PublicState>({ choice: PUBLIC_INITIAL, passed: false }, normalizePublic);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = evaluatePublic(state.choice);
  return (
    <div className="space-y-4" data-testid="crypto-basics-public">
      <Ticket goal="选好用哪把钥匙加密、用哪把钥匙签名，让下面三项都成立。">
        你要给周馆长寄一份“{MESSAGE_TEXT}”，内容就是借书证号 {MESSAGE}。信会经过好几个人的手。你们从没见过面，也没有事先约好密钥，只知道彼此公开的公钥。
      </Ticket>
      <div className="grid gap-3 md:grid-cols-2">
        <KeyCard title="周馆长" publicKey={`n = ${KEYS.director.n}, e = ${KEYS.director.e}`} privateNote="只有馆长自己有" />
        <KeyCard title="你" publicKey={`n = ${KEYS.you.n}, e = ${KEYS.you.e}`} privateNote="只有你自己有" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Radios label="加密：用哪把钥匙处理 42" name="encrypt" value={state.choice.encrypt} disabled={locked} onChange={(encrypt) => setState((current) => ({ ...current, choice: { ...current.choice, encrypt } }))} options={[{ value: "none" as const, label: "不加密" }, { value: "director-public" as const, label: "馆长的公钥" }, { value: "you-public" as const, label: "你的公钥" }, { value: "you-private" as const, label: "你的私钥" }]} />
        <Radios label="签名：用哪把钥匙给内容的指纹签名" name="sign" value={state.choice.sign} disabled={locked} onChange={(sign) => setState((current) => ({ ...current, choice: { ...current.choice, sign } }))} options={[{ value: "none" as const, label: "不签名" }, { value: "you-private" as const, label: "你的私钥" }, { value: "you-public" as const, label: "你的公钥" }, { value: "director-public" as const, label: "馆长的公钥" }]} />
      </div>
      <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs">
        寄出去的：密文 {result.ciphertext}
        {result.signature !== null ? `，签名 ${result.signature}` : "，没有签名"}
      </p>
      <GoalList goals={result.goals} />
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交选择" last={last}
        onSubmit={() => void submit({ choice: state.choice }, "crypto_public_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch6 · signatures
// ---------------------------------------------------------------------------

type AnswerState = { answers: Record<string, string>; checked: string[]; passed: boolean };
function normalizeAnswers(ids: string[]) {
  return (value: unknown): AnswerState => {
    const record = asRecord(value);
    const answers = asRecord(record.answers);
    return {
      answers: Object.fromEntries(ids.filter((id) => typeof answers[id] === "string").map((id) => [id, (answers[id] as string).slice(0, 20)])),
      checked: Array.isArray(record.checked) ? record.checked.filter((item): item is string => typeof item === "string" && ids.includes(item)) : [],
      passed: record.passed === true,
    };
  };
}

const ANNOUNCEMENT_IDS = ANNOUNCEMENTS.map((item) => item.id);
const normalizeSignature = normalizeAnswers(ANNOUNCEMENT_IDS);

export function SignatureLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<AnswerState>({ answers: {}, checked: [], passed: false }, normalizeSignature);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-4" data-testid="crypto-basics-signature">
      <Ticket goal="逐条判断这四条公告能不能信。">
        读者群里转发着四条“图书馆公告”。图书馆的正式公告都会用图书馆的私钥签名；图书馆公钥的指纹印在每张借书证背面：<Hex>{LIBRARY_KEY_PRINT}</Hex>
      </Ticket>
      <ul className="m-0 grid list-none gap-3 p-0">
        {ANNOUNCEMENTS.map((item) => {
          const key = item.signer ? KEYS[item.signer] : null;
          const checked = state.checked.includes(item.id);
          return (
            <li key={item.id} className="space-y-2 rounded-xl border border-border p-3" data-announcement={item.id}>
              <p className="text-sm font-medium">
                公告 {item.id.toUpperCase()}：{item.text}
              </p>
              {key ? (
                <p className="text-xs">
                  附带的签名 <Hex>{item.signature}</Hex>，附带的公钥指纹 <Hex>{keyFingerprint(key)}</Hex>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">没有附带签名。</p>
              )}
              {key && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={readOnly || checked} onClick={() => setState((current) => ({ ...current, checked: [...current.checked, item.id] }))}>
                    用附带的公钥验证签名
                  </Button>
                  {checked && <Verdict ok={verify(key, item.text, item.signature!)}>{verify(key, item.text, item.signature!) ? "签名与内容匹配" : "签名与内容不匹配"}</Verdict>}
                </div>
              )}
              <select aria-label={`公告 ${item.id.toUpperCase()} 的判断`} disabled={locked} value={state.answers[item.id] ?? ""} onChange={(event) => setState((current) => ({ ...current, answers: { ...current.answers, [item.id]: event.target.value } }))} className={inputClass}>
                <option value="">选择判断……</option>
                {VERDICTS.map((verdict) => (
                  <option key={verdict.id} value={verdict.id}>
                    {verdict.label}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交判断" last={last}
        onSubmit={() => void submit({ answers: state.answers }, "crypto_signature_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch7 · certificates
// ---------------------------------------------------------------------------

const CERT_IDS = CERTIFICATES.map((item) => item.id);
const normalizeCertificates = normalizeAnswers(CERT_IDS);

export function CertificateLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<AnswerState>({ answers: {}, checked: [], passed: false }, normalizeCertificates);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-4" data-testid="crypto-basics-certificate">
      <Ticket goal="逐个看这六个网站的证书，判断能不能放心输入借书证密码。">
        今天是 {TODAY}。浏览器里预装了两个受信任的根证书机构：{TRUSTED_ROOTS.join("、")}。下面是你打开六个网址时，浏览器拿到的证书。
      </Ticket>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
        {CERTIFICATES.map((cert) => (
          <li key={cert.id} className="space-y-2 rounded-xl border border-border p-3 text-xs" data-certificate={cert.id}>
            <p className="break-all font-mono text-sm font-semibold">{cert.url}</p>
            <dl className="m-0 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5">
              <dt className="text-muted-foreground">颁发给</dt>
              <dd className="m-0 break-all font-mono">{cert.subject}</dd>
              <dt className="text-muted-foreground">签发者</dt>
              <dd className="m-0">{cert.issuer}</dd>
              <dt className="text-muted-foreground">证书链</dt>
              <dd className="m-0">{[cert.subject, ...cert.chain].join(" ← ")}</dd>
              <dt className="text-muted-foreground">有效期</dt>
              <dd className="m-0 font-mono">
                {cert.from} ～ {cert.to}
              </dd>
              {cert.note && (
                <>
                  <dt className="text-muted-foreground">备注</dt>
                  <dd className="m-0">{cert.note}</dd>
                </>
              )}
            </dl>
            <select aria-label={`${cert.url} 的判断`} disabled={locked} value={state.answers[cert.id] ?? ""} onChange={(event) => setState((current) => ({ ...current, answers: { ...current.answers, [cert.id]: event.target.value } }))} className={inputClass}>
              <option value="">选择判断……</option>
              {CERT_VERDICTS.map((verdict) => (
                <option key={verdict.id} value={verdict.id}>
                  {verdict.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly} label="提交判断" last={last}
        onSubmit={() => void submit({ answers: state.answers }, "crypto_certificate_lab_submitted").then((ok) => ok && setState((current) => ({ ...current, passed: true })))} />
    </div>
  );
}
