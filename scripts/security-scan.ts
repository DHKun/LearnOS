import "./env";

import fs from "node:fs";
import path from "node:path";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");
const CONTENT_DIR = path.join(process.cwd(), "content", "courses");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

if (!fs.existsSync(STATIC_DIR)) {
  console.error("找不到 .next/static，请先执行 pnpm build");
  process.exit(1);
}

const staticFiles = walk(STATIC_DIR);
const contents = new Map<string, string>();

for (const file of staticFiles) {
  const text = fs.readFileSync(file, "utf8");
  contents.set(file, text);
}

const forbidden: { label: string; needle: string }[] = [];

const secret = process.env.BETTER_AUTH_SECRET;
if (secret) forbidden.push({ label: "Better Auth secret", needle: secret });
forbidden.push({ label: "secret key prefix", needle: "sb_secret_" });

// Server-only quiz answer explanations must never reach the browser bundle.
for (const dir of fs.readdirSync(CONTENT_DIR)) {
  const quizPath = path.join(CONTENT_DIR, dir, "quiz.server.json");
  if (!fs.existsSync(quizPath)) continue;
  const quiz = JSON.parse(fs.readFileSync(quizPath, "utf8")) as {
    questions: { explanation?: string; answer?: unknown }[];
  };
  for (const question of quiz.questions) {
    if (question.explanation && question.explanation.length >= 16) {
      forbidden.push({
        label: `quiz explanation in ${dir}`,
        needle: question.explanation.slice(0, 24),
      });
    }
  }
}

let failures = 0;
for (const { label, needle } of forbidden) {
  if (!needle) continue;
  for (const [file, text] of contents) {
    if (text.includes(needle)) {
      failures += 1;
      console.error(`✗ ${label} 出现在客户端资源: ${path.relative(process.cwd(), file)}`);
    }
  }
}

// The service role key variable name may appear in server code, but the value
// must never be in the client bundle.
if (failures === 0) {
  console.log(`✓ 已扫描 ${staticFiles.length} 个客户端资源：未发现服务端密钥或测验答案解析。`);
  process.exit(0);
}

process.exit(1);
