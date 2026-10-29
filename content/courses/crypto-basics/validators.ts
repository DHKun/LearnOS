/** Server-side validators. Never imported by a client component. */
import {
  ANNOUNCEMENTS,
  CERTIFICATES,
  evaluatePasswords,
  evaluatePublic,
  evaluateSymmetric,
  gradeAnnouncements,
  gradeCertificates,
  gradeMirrors,
  parsePasswordChoice,
  parsePublicChoice,
  parseSymmetricChoice,
} from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function answers(input: unknown, ids: string[]): Record<string, string> | null {
  const raw = record(record(input)?.answers);
  if (!raw) return null;
  return Object.fromEntries(ids.map((id) => [id, typeof raw[id] === "string" ? (raw[id] as string).slice(0, 20) : ""]));
}

function goals(result: { passed: boolean; goals: { label: string; ok: boolean }[] }, success: string): Verdict {
  const failed = result.goals.filter((goal) => !goal.ok);
  return { passed: result.passed, feedback: { message: result.passed ? success : `还没满足：${failed.map((goal) => goal.label).join("；")}。` } };
}

export function validateMirrorLab(input: unknown): Verdict {
  const raw = record(input);
  const safe = Array.isArray(raw?.safe) ? raw.safe.filter((item): item is string => typeof item === "string" && item.length <= 2).slice(0, 4) : null;
  if (!safe || typeof raw?.why !== "string") return bad("提交内容不完整。");
  const graded = gradeMirrors({ safe, why: raw.why.slice(0, 20) });
  return { passed: graded.passed, feedback: { message: graded.message } };
}

export function validatePasswordLab(input: unknown): Verdict {
  const choice = parsePasswordChoice(record(input)?.choice);
  if (!choice) return bad("选择不完整。");
  return goals(evaluatePasswords(choice), "库就算泄露了，攻击者也只能对每个人慢慢猜，而读者登录几乎感觉不到延迟。");
}

export function validateSymmetricLab(input: unknown): Verdict {
  const choice = parseSymmetricChoice(record(input)?.choice);
  if (!choice) return bad("选择不完整。");
  return goals(evaluateSymmetric(choice), "图案藏住了，重复的通知也看不出来，密钥也没随信寄出。");
}

export function validatePublicLab(input: unknown): Verdict {
  const choice = parsePublicChoice(record(input)?.choice);
  if (!choice) return bad("选择不完整。");
  return goals(evaluatePublic(choice), "用馆长的公钥加密，只有她能读；用你的私钥签名，她能确认是你。");
}

export function validateSignatureLab(input: unknown): Verdict {
  const parsed = answers(input, ANNOUNCEMENTS.map((item) => item.id));
  if (!parsed) return bad("提交内容缺少 answers。");
  const graded = gradeAnnouncements(parsed);
  return { passed: graded.passed, feedback: { message: graded.passed ? "四条公告都判断对了：只信用图书馆的钥匙签过、而且验证通过的那条。" : `判断对了 ${graded.correct}/${graded.total} 条。${graded.hints.join("")}` } };
}

export function validateCertificateLab(input: unknown): Verdict {
  const parsed = answers(input, CERTIFICATES.map((item) => item.id));
  if (!parsed) return bad("提交内容缺少 answers。");
  const graded = gradeCertificates(parsed);
  return { passed: graded.passed, feedback: { message: graded.passed ? "六个网站都判断对了。" : `判断对了 ${graded.correct}/${graded.total} 个。${graded.hints.join("")}` } };
}
