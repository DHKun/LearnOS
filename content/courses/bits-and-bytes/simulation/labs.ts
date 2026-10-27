/**
 * Lab data and grading rules. Components call them for live feedback;
 * validators.ts re-runs them on the server, which alone decides `passed`.
 */
import {
  type Bytes,
  type Codebook,
  type IntType,
  INT_TYPES,
  REPLACEMENT,
  contrast,
  hsl,
  intRange,
  parseColor,
  parseHex,
  readUint,
  sumMod256,
  utf8Decode,
  wrap,
} from "./bytes";

type Graded = { passed: boolean; message: string };

// ---------------------------------------------------------------------------
// Ch2 · LED strip: one byte drives eight lights, leftmost = highest bit.
// ---------------------------------------------------------------------------

export const LED_TASKS = [
  {
    id: "middle",
    ticket: "店员想点亮正中间的两颗灯，在配置框里填了「24」，结果亮的却是第 3 和第 6 颗。",
    initial: "24",
    target: 0b00011000,
  },
  {
    id: "left",
    ticket: "想点亮左边四颗灯，填了「0F」，亮的却是右边四颗。",
    initial: "0F",
    target: 0b11110000,
  },
  {
    id: "add",
    ticket: "现在的配置是「5A」。要在其他灯保持不变的前提下，再点亮最左边那颗。",
    initial: "5A",
    target: 0b11011010,
  },
] as const;
export type LedTaskId = (typeof LED_TASKS)[number]["id"];

/** The configuration box takes 1–2 hex digits, optionally prefixed with 0x. */
export function parseLedValue(text: string): number | null {
  const match = /^(?:0x)?([0-9a-f]{1,2})$/i.exec(text.trim());
  return match ? Number.parseInt(match[1], 16) : null;
}

export function litPositions(value: number): number[] {
  return Array.from({ length: 8 }, (_, i) => i).filter((i) => (value >> (7 - i)) & 1).map((i) => i + 1);
}

export function gradeLedTask(id: LedTaskId, text: string): Graded {
  const task = LED_TASKS.find((item) => item.id === id)!;
  const value = parseLedValue(text);
  if (value === null) return { passed: false, message: "配置框只接受 1～2 位十六进制数字，比如 3C。" };
  if (value === task.target) return { passed: true, message: "灯带亮法和目标一致。" };
  const lit = litPositions(value);
  return {
    passed: false,
    message: `现在亮的是第 ${lit.length ? lit.join("、") : "（无）"} 颗，和目标不一致。`,
  };
}

// ---------------------------------------------------------------------------
// Ch3 · Read the answers off the spec sheets.
// ---------------------------------------------------------------------------

export const SIZE_CASES = [
  {
    id: "disk",
    context: "新买的移动硬盘，包装上写着 1 TB。磁盘属性显示：",
    artifact: "容量：1,000,000,000,000 字节\n系统换算：1 GB = 1024 × 1024 × 1024 字节",
    question: "系统会把容量显示为约多少 GB？（取整数）",
    kind: "number",
  },
  {
    id: "speed",
    context: "宽带合同上写着：",
    artifact: "下行带宽：100 Mbps（兆比特每秒）",
    question: "理想情况下，下载速度最多每秒多少 MB（兆字节）？",
    kind: "number",
  },
  {
    id: "value",
    context: "传感器发来两个字节，协议文档写着「16 位无符号整数，大端序（高位字节在前）」：",
    artifact: "01 02",
    question: "这个数是多少？",
    kind: "number",
  },
  {
    id: "order",
    context: "接收程序把上面这两个字节读成了 513。",
    artifact: "01 02  →  513",
    question: "接收程序用的是哪种字节序？",
    kind: "choice",
    options: [
      { id: "be", label: "大端序（高位字节在前）" },
      { id: "le", label: "小端序（低位字节在前）" },
      { id: "none", label: "字节序和这个结果无关" },
    ],
  },
  {
    id: "max",
    context: "一个计数器只占 2 个字节，而且不存负数：",
    artifact: "类型：uint16（16 位无符号整数）",
    question: "它最大能存到多少？",
    kind: "number",
  },
] as const;
export type SizeCaseId = (typeof SIZE_CASES)[number]["id"];

function numeric(text: string | undefined): number | null {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/[,\s，]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function gradeSizeCase(id: SizeCaseId, answer: string | undefined): boolean {
  const value = numeric(answer);
  switch (id) {
    case "disk":
      return value !== null && value >= 931 && value <= 931.33;
    case "speed":
      return value === 12.5;
    case "value":
      return value === 258;
    case "order":
      return answer === "le";
    case "max":
      return value === 65535;
  }
}

export function gradeSizeLab(answers: Partial<Record<SizeCaseId, string>>) {
  const results = SIZE_CASES.map((item) => gradeSizeCase(item.id, answers[item.id]));
  return { results, correct: results.filter(Boolean).length, total: results.length, passed: results.every(Boolean) };
}

// ---------------------------------------------------------------------------
// Ch4 · Pick integer types for a game's player record.
// ---------------------------------------------------------------------------

export const INT_FIELDS = [
  { id: "coins", label: "金币", note: "只增不减，越玩越多" },
  { id: "level", label: "等级", note: "最高 120 级" },
  { id: "playerId", label: "玩家编号", note: "新玩家注册就加一" },
  { id: "hpDelta", label: "生命值变化", note: "受伤为负，回血为正" },
] as const;
export type IntFieldId = (typeof INT_FIELDS)[number]["id"];
export type IntConfig = Record<IntFieldId, IntType>;

export const INT_TIMELINE: { label: string; values: Record<IntFieldId, number> }[] = [
  { label: "开服第 1 天", values: { coins: 1_200, level: 3, playerId: 1_001, hpDelta: 300 } },
  { label: "第 30 天", values: { coins: 45_000, level: 35, playerId: 70_000, hpDelta: -1_500 } },
  { label: "第 90 天", values: { coins: 180_000, level: 80, playerId: 5_000_000, hpDelta: 1_200 } },
  { label: "第 365 天", values: { coins: 3_000_000, level: 120, playerId: 50_000_000, hpDelta: -2_000 } },
];

export const INT_BUDGET = 11;
export const INT_INITIAL: IntConfig = { coins: "int16", level: "uint8", playerId: "uint16", hpDelta: "uint16" };

export function simulateInts(config: IntConfig) {
  const rows = INT_TIMELINE.map((row) => ({
    label: row.label,
    cells: Object.fromEntries(
      INT_FIELDS.map(({ id }) => {
        const stored = wrap(row.values[id], config[id]);
        return [id, { truth: row.values[id], stored, ok: stored === row.values[id] }];
      }),
    ) as Record<IntFieldId, { truth: number; stored: number; ok: boolean }>,
  }));
  const size = INT_FIELDS.reduce((sum, { id }) => sum + INT_TYPES.find((t) => t.id === config[id])!.bytes, 0);
  const goals = [
    { id: "correct", label: "每个时间点存下来的值都和真实值一致", ok: rows.every((row) => INT_FIELDS.every(({ id }) => row.cells[id].ok)) },
    { id: "budget", label: `每条玩家记录不超过 ${INT_BUDGET} 个字节（服务器要存几千万条）`, ok: size <= INT_BUDGET },
  ];
  return { rows, size, goals, passed: goals.every((goal) => goal.ok) };
}

export function describeType(type: IntType): string {
  const { min, max } = intRange(type);
  return `${min.toLocaleString("en-US")} ～ ${max.toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Ch5 · A wallet that keeps losing cents.
// ---------------------------------------------------------------------------

export type MoneyConfig = { storage: "float" | "cents"; rounding: "line" | "end"; display: "raw" | "fixed" };
export const MONEY_INITIAL: MoneyConfig = { storage: "float", rounding: "end", display: "raw" };

type MoneyEvent =
  | { kind: "deposit"; label: string; cents: number }
  | { kind: "purchase"; label: string; lines: { priceCents: number; qty: number; feePct: number }[] };

export const MONEY_EVENTS: MoneyEvent[] = [
  { kind: "deposit", label: "充值 0.70 元", cents: 70 },
  { kind: "deposit", label: "充值 0.10 元", cents: 10 },
  { kind: "purchase", label: "支付 0.80 元借书押金", lines: [{ priceCents: 80, qty: 1, feePct: 0 }] },
  { kind: "deposit", label: "充值 10.00 元", cents: 1000 },
  { kind: "purchase", label: "彩色打印 3 页，每页 1.99 元，另收 6% 服务费", lines: [{ priceCents: 199, qty: 3, feePct: 6 }] },
  {
    kind: "purchase",
    label: "续借 10 本书，每本 0.10 元，每笔另收 6% 服务费",
    lines: Array.from({ length: 10 }, () => ({ priceCents: 10, qty: 1, feePct: 6 })),
  },
];

/** The invoice is the source of truth: every line rounded to whole cents, half up. */
function invoiceLineCents(line: { priceCents: number; qty: number; feePct: number }): number {
  const exact = (line.priceCents * line.qty * (100 + line.feePct)) / 100;
  return Math.floor(exact + 0.5);
}

export function simulateMoney(config: MoneyConfig) {
  let balance = 0; // yuan as a float, or cents (possibly fractional when rounding at the end)
  let truth = 0; // integer cents
  let charged = 0;
  const rows: { label: string; shown: string; truth: string; decision?: { app: boolean; truth: boolean } }[] = [];
  const show = (value: number) => {
    const yuan = config.storage === "float" ? value : value / 100;
    return config.display === "fixed" ? yuan.toFixed(2) : String(yuan);
  };

  for (const event of MONEY_EVENTS) {
    if (event.kind === "deposit") {
      balance = config.storage === "float" ? balance + event.cents / 100 : balance + event.cents;
      truth += event.cents;
      rows.push({ label: event.label, shown: show(balance), truth: (truth / 100).toFixed(2) });
      continue;
    }
    const truthCost = event.lines.reduce((sum, line) => sum + invoiceLineCents(line), 0);
    let cost = 0;
    for (const line of event.lines) {
      if (config.storage === "float") {
        const exact = (line.priceCents / 100) * line.qty * (1 + line.feePct / 100);
        cost += config.rounding === "line" ? Math.round(exact * 100) / 100 : exact;
      } else {
        const exact = (line.priceCents * line.qty * (100 + line.feePct)) / 100;
        cost += config.rounding === "line" ? Math.round(exact) : exact;
      }
    }
    const appAllows = balance >= cost;
    const truthAllows = truth >= truthCost;
    if (appAllows) {
      balance -= cost;
      charged += cost;
    }
    if (truthAllows) truth -= truthCost;
    rows.push({
      label: event.label,
      shown: appAllows ? show(balance) : `余额不足（${show(balance)}）`,
      truth: truthAllows ? (truth / 100).toFixed(2) : "余额不足",
      decision: { app: appAllows, truth: truthAllows },
    });
  }

  const invoiceTotal = MONEY_EVENTS.filter((event) => event.kind === "purchase").reduce(
    (sum, event) => sum + (event.kind === "purchase" ? event.lines.reduce((s, line) => s + invoiceLineCents(line), 0) : 0),
    0,
  );
  const chargedCents = config.storage === "float" ? Math.round(charged * 100) : Math.round(charged);
  const goals = [
    {
      id: "decision",
      label: "每次判断“余额够不够”都和真实情况一致",
      ok: rows.every((row) => !row.decision || row.decision.app === row.decision.truth),
    },
    { id: "total", label: "本月扣款合计 = 发票上逐笔金额之和（精确到分）", ok: chargedCents === invoiceTotal },
    {
      id: "display",
      label: "界面上的每个余额都显示为两位小数，并且和真实余额一致",
      ok: rows.every((row) => /^\d+\.\d{2}$/.test(row.shown) && row.shown === row.truth),
    },
  ];
  return {
    rows,
    goals,
    invoiceTotal: (invoiceTotal / 100).toFixed(2),
    charged: (chargedCents / 100).toFixed(2),
    passed: goals.every((goal) => goal.ok),
  };
}

// ---------------------------------------------------------------------------
// Ch6 · Read a UTF-8 hex dump.
// ---------------------------------------------------------------------------

export const UTF8_DUMP: Bytes = [0x48, 0x69, 0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd, 0xf0, 0x9f, 0x98, 0x80];

export const UTF8_QUESTIONS = [
  { id: "chars", question: "这段文本一共有几个字符？", kind: "number" },
  { id: "bytes", question: "一共占多少个字节？", kind: "number" },
  { id: "offset", question: "最后一个字符从第几个字节开始？（从 0 开始数）", kind: "number" },
  {
    id: "cut",
    question: "如果只保留前 6 个字节再按 UTF-8 解码，会看到什么？",
    kind: "choice",
    options: [
      { id: "full", label: "Hi你好" },
      { id: "broken", label: `Hi你${REPLACEMENT}（最后一个字符坏了）` },
      { id: "clean", label: "Hi你（干净地少了一个字）" },
      { id: "ascii", label: "Hi" },
    ],
  },
] as const;
export type Utf8QuestionId = (typeof UTF8_QUESTIONS)[number]["id"];

export function gradeUtf8Lab(answers: Partial<Record<Utf8QuestionId, string>>) {
  const expected: Record<Utf8QuestionId, string> = {
    chars: String([...utf8Decode(UTF8_DUMP)].length),
    bytes: String(UTF8_DUMP.length),
    offset: "8",
    cut: utf8Decode(UTF8_DUMP.slice(0, 6)) === `Hi你${REPLACEMENT}` ? "broken" : "?",
  };
  const results = UTF8_QUESTIONS.map((item) => {
    const answer = answers[item.id];
    if (item.kind === "number") return numeric(answer) === Number(expected[item.id]);
    return answer === expected[item.id];
  });
  return { results, correct: results.filter(Boolean).length, total: results.length, passed: results.every(Boolean) };
}

// ---------------------------------------------------------------------------
// Ch7 · Diagnose a batch of garbled records.
// ---------------------------------------------------------------------------

export const MOJIBAKE_CAUSES = [
  { id: "ok", label: "没有问题，显示正确" },
  { id: "utf8-as-gbk", label: "UTF-8 的字节被当成 GBK 解码" },
  { id: "gbk-as-utf8", label: "GBK 的字节被当成 UTF-8 解码" },
  { id: "utf8-as-latin1", label: "UTF-8 的字节被当成 Latin-1 解码" },
  { id: "replaced", label: "原文早已被替换成 �，又被当成 GBK 显示" },
  { id: "lossy", label: "存进不支持中文的编码时，被换成了问号" },
  { id: "truncated", label: "字节被截断，最后一个字符不完整" },
] as const;
export type MojibakeCause = (typeof MOJIBAKE_CAUSES)[number]["id"];

export const RECOVERY_OPTIONS = [
  { id: "yes", label: "能，字节还在，换对解码方式即可" },
  { id: "no", label: "不能，原始信息已经丢了" },
  { id: "na", label: "不需要恢复" },
] as const;
export type RecoveryOption = (typeof RECOVERY_OPTIONS)[number]["id"];

export type MojibakeRecord = {
  id: string;
  source: string;
  shownWith: Codebook;
  bytes: Bytes;
  cause: MojibakeCause;
  recoverable: RecoveryOption;
};

export const MOJIBAKE_RECORDS: MojibakeRecord[] = [
  { id: "csv", source: "导出的 CSV，用旧版 Excel 打开", shownWith: "gbk", bytes: [0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd], cause: "utf8-as-gbk", recoverable: "yes" },
  { id: "menu", source: "网页上的法语菜单", shownWith: "latin-1", bytes: [0x63, 0x61, 0x66, 0xc3, 0xa9], cause: "utf8-as-latin1", recoverable: "yes" },
  { id: "sms", source: "老系统发来的短信", shownWith: "utf-8", bytes: [0xd6, 0xd0, 0xce, 0xc4], cause: "gbk-as-utf8", recoverable: "yes" },
  {
    id: "forum",
    source: "转了好几手的论坛帖子",
    shownWith: "gbk",
    bytes: [0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd],
    cause: "replaced",
    recoverable: "no",
  },
  { id: "db", source: "数据库里的客户姓名", shownWith: "utf-8", bytes: [0x3f, 0x3f], cause: "lossy", recoverable: "no" },
  { id: "push", source: "被截成 5 个字节的推送标题", shownWith: "utf-8", bytes: [0xe4, 0xbd, 0xa0, 0xe5, 0xa5], cause: "truncated", recoverable: "no" },
  {
    id: "group",
    source: "带表情的群名",
    shownWith: "utf-8",
    bytes: [0xe8, 0xaf, 0xbb, 0xe4, 0xb9, 0xa6, 0xe4, 0xbc, 0x9a, 0xf0, 0x9f, 0x98, 0x80],
    cause: "ok",
    recoverable: "na",
  },
];

export function gradeMojibake(
  causes: Record<string, string>,
  recovery: Record<string, string>,
) {
  const results = MOJIBAKE_RECORDS.map(
    (record) => causes[record.id] === record.cause && recovery[record.id] === record.recoverable,
  );
  const correct = results.filter(Boolean).length;
  let hint = "";
  if (causes.forum && causes.forum !== "replaced") hint = "「锟斤拷」的字节是 EF BF BD 反复出现。EF BF BD 是哪个字符的 UTF-8 编码？";
  else if (recovery.db === "yes") hint = "3F 就是问号本身的编码，原来的汉字已经不在字节里了。";
  else if (causes.group && causes.group !== "ok") hint = "表情符号也是字符，按 UTF-8 解码完全正确就不是乱码。";
  return { results, correct, total: results.length, passed: correct === results.length, hint };
}

// ---------------------------------------------------------------------------
// Ch8 · Theme colors that pass contrast in light and dark mode.
// ---------------------------------------------------------------------------

export const BRAND = "#3478D4";
export const LIGHT_BG = "#FFFFFF";
export const DARK_BG = "#121212";
export const COLOR_ROLES = [
  { id: "button", label: "按钮底色", detail: "上面是白色文字" },
  { id: "lightLink", label: "亮色模式的链接色", detail: "页面背景 #FFFFFF" },
  { id: "darkLink", label: "暗色模式的链接色", detail: "页面背景 #121212" },
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number]["id"];
export type ColorConfig = Record<ColorRole, string>;
export const COLOR_INITIAL: ColorConfig = { button: BRAND, lightLink: BRAND, darkLink: BRAND };
export const MIN_CONTRAST = 4.5;
export const HUE_TOLERANCE = 10;

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function evaluateColors(config: ColorConfig) {
  const white = parseColor(LIGHT_BG)!;
  const dark = parseColor(DARK_BG)!;
  const brandHue = hsl(parseColor(BRAND)!).h;
  const parsed = Object.fromEntries(COLOR_ROLES.map(({ id }) => [id, parseColor(config[id])])) as Record<
    ColorRole,
    [number, number, number] | null
  >;
  const ratio = (color: [number, number, number] | null, against: [number, number, number]) =>
    color ? contrast(color, against) : 0;
  const ratios = {
    button: ratio(parsed.button, white),
    lightLink: ratio(parsed.lightLink, white),
    darkLink: ratio(parsed.darkLink, dark),
  };
  const sameFamily = COLOR_ROLES.every(({ id }) => {
    const color = parsed[id];
    if (!color) return false;
    const { h, s } = hsl(color);
    return hueDistance(h, brandHue) <= HUE_TOLERANCE && s >= 0.4;
  });
  const goals = [
    { id: "button", label: `按钮上的白字对比度 ≥ ${MIN_CONTRAST}`, ok: ratios.button >= MIN_CONTRAST },
    { id: "lightLink", label: `亮色模式下链接对比度 ≥ ${MIN_CONTRAST}`, ok: ratios.lightLink >= MIN_CONTRAST },
    { id: "darkLink", label: `暗色模式下链接对比度 ≥ ${MIN_CONTRAST}`, ok: ratios.darkLink >= MIN_CONTRAST },
    { id: "family", label: `三种颜色都和品牌色同一色系（色相相差 ≤ ${HUE_TOLERANCE}°，饱和度 ≥ 40%）`, ok: sameFamily },
  ];
  return { valid: COLOR_ROLES.every(({ id }) => parsed[id] !== null), ratios, goals, passed: goals.every((goal) => goal.ok) };
}

// ---------------------------------------------------------------------------
// Ch9 · Choose formats for three images (a stated teaching model, not a codec).
// ---------------------------------------------------------------------------

export const IMAGE_FORMATS = ["png", "jpeg", "gif"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export const JPEG_QUALITIES = [95, 80, 60, 30] as const;
export type JpegQuality = (typeof JPEG_QUALITIES)[number];
export type ImageChoice = { format: ImageFormat; quality: JpegQuality; scale: "full" | "half" };

export const IMAGES = [
  { id: "photo", label: "首页大图（照片）", width: 2400, height: 1600, alpha: false, displayWidth: 1200, budgetKB: 600, png: 0.55, gif: 0.35 },
  { id: "logo", label: "Logo（纯色块 + 文字）", width: 800, height: 400, alpha: false, displayWidth: 800, budgetKB: 60, png: 0.05, gif: 0.06 },
  { id: "icon", label: "应用图标（透明背景、柔和阴影）", width: 256, height: 256, alpha: true, displayWidth: 256, budgetKB: 40, png: 0.15, gif: 0.12 },
] as const;
export type ImageId = (typeof IMAGES)[number]["id"];
export type ImageConfig = Record<ImageId, ImageChoice>;

export const IMAGE_INITIAL: ImageConfig = {
  photo: { format: "png", quality: 80, scale: "full" },
  logo: { format: "jpeg", quality: 60, scale: "full" },
  icon: { format: "jpeg", quality: 80, scale: "full" },
};

const JPEG_RATIO: Record<JpegQuality, number> = { 95: 0.15, 80: 0.08, 60: 0.05, 30: 0.03 };

export function evaluateImages(config: ImageConfig) {
  const results = IMAGES.map((image) => {
    const choice = config[image.id];
    const factor = choice.scale === "half" ? 0.5 : 1;
    const width = image.width * factor;
    const height = image.height * factor;
    const raw = width * height * (image.alpha ? 4 : 3);
    const ratio = choice.format === "png" ? image.png : choice.format === "gif" ? image.gif : JPEG_RATIO[choice.quality];
    const sizeKB = Math.round((raw * ratio) / 100) / 10;
    const problems: string[] = [];
    if (width < image.displayWidth) problems.push(`宽度只有 ${width}px，要放大到 ${image.displayWidth}px 显示，会发糊`);
    if (image.alpha && choice.format === "jpeg") problems.push("JPEG 不支持透明，背景变成了白底");
    if (image.alpha && choice.format === "gif") problems.push("GIF 只有全透明和不透明两档，柔和阴影变成了锯齿");
    if (image.id === "photo" && choice.format === "gif") problems.push("GIF 最多 256 色，照片上的渐变出现色带");
    if (image.id === "photo" && choice.format === "jpeg" && choice.quality <= 30) problems.push("压缩太狠，出现明显色块");
    if (image.id === "logo" && choice.format === "jpeg" && choice.quality < 95) problems.push("JPEG 擅长照片，文字和色块边缘出现噪点");
    const withinBudget = sizeKB <= image.budgetKB;
    return { id: image.id, sizeKB, rawKB: Math.round(raw / 100) / 10, problems, withinBudget, ok: withinBudget && problems.length === 0 };
  });
  return { results, passed: results.every((item) => item.ok) };
}

// ---------------------------------------------------------------------------
// Ch10 · Identify files by their first bytes; repair a broken signature.
// ---------------------------------------------------------------------------

export const FILE_TYPES = [
  { id: "png", label: "PNG 图片" },
  { id: "jpeg", label: "JPEG 图片" },
  { id: "gif", label: "GIF 图片" },
  { id: "pdf", label: "PDF 文档" },
  { id: "zip", label: "ZIP 压缩包（docx/xlsx 也是）" },
  { id: "mp3", label: "MP3 音频" },
  { id: "exe", label: "Windows 可执行程序" },
  { id: "text-bom", label: "带 BOM 的 UTF-8 文本" },
] as const;
export const FILE_STATUSES = [
  { id: "ok", label: "扩展名和内容一致" },
  { id: "mismatch", label: "扩展名和内容不符" },
  { id: "broken", label: "文件头已损坏" },
] as const;
export type FileType = (typeof FILE_TYPES)[number]["id"];
export type FileStatus = (typeof FILE_STATUSES)[number]["id"];

export const PNG_SIGNATURE: Bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type UsbFile = { id: string; name: string; size: string; head: Bytes; type: FileType; status: FileStatus };

const IHDR_1920x1080: Bytes = [0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x07, 0x80, 0x00, 0x00, 0x04, 0x38];

export const USB_FILES: UsbFile[] = [
  { id: "holiday", name: "holiday.jpg", size: "2.1 MB", head: [...PNG_SIGNATURE, ...IHDR_1920x1080], type: "png", status: "mismatch" },
  { id: "report", name: "report.pdf", size: "384 KB", head: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x31], type: "pdf", status: "ok" },
  { id: "homework", name: "homework.docx", size: "56 KB", head: [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00, 0xdf, 0xa4], type: "zip", status: "ok" },
  { id: "song", name: "song.mp3", size: "4.6 MB", head: [0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x23, 0x76, 0x54, 0x49, 0x54, 0x32, 0x00, 0x00], type: "mp3", status: "ok" },
  { id: "cat", name: "cat.png", size: "820 KB", head: [0x00, ...PNG_SIGNATURE.slice(1), 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x03, 0x20], type: "png", status: "broken" },
  { id: "contacts", name: "contacts.csv", size: "3 KB", head: [0xef, 0xbb, 0xbf, 0xe5, 0xa7, 0x93, 0xe5, 0x90, 0x8d, 0x2c, 0xe7, 0x94, 0xb5, 0xe8, 0xaf, 0x9d], type: "text-bom", status: "ok" },
  { id: "invoice", name: "invoice.pdf", size: "212 KB", head: [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00], type: "exe", status: "mismatch" },
  { id: "scan", name: "scan.png", size: "1.3 MB", head: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x48], type: "jpeg", status: "mismatch" },
];

export const CAT_BROKEN_HEAD = USB_FILES.find((file) => file.id === "cat")!.head.slice(0, 8);

export function gradeHeaderLab(input: {
  files: Record<string, { type?: string; status?: string }>;
  width: string | undefined;
  repaired: string | undefined;
}) {
  const results = USB_FILES.map(
    (file) => input.files[file.id]?.type === file.type && input.files[file.id]?.status === file.status,
  );
  const widthOk = numeric(input.width) === readUint(USB_FILES[0].head, 16, 4, "be");
  const repaired = input.repaired === undefined ? null : parseHex(input.repaired, 8);
  const repairOk = repaired !== null && repaired.length === 8 && repaired.every((byte, i) => byte === PNG_SIGNATURE[i]);
  const correct = results.filter(Boolean).length;
  const parts: string[] = [];
  if (correct < results.length) parts.push(`文件判断对了 ${correct}/${results.length} 个`);
  if (!widthOk) parts.push("图片宽度不对（宽高是 4 字节大端整数）");
  if (!repairOk) parts.push("cat.png 的文件头还没修好");
  return {
    results,
    widthOk,
    repairOk,
    passed: correct === results.length && widthOk && repairOk,
    message: parts.length ? `${parts.join("；")}。` : "八个文件都认对了，宽度读对了，文件头也修好了。",
  };
}

// ---------------------------------------------------------------------------
// Ch11 · Two-dimensional parity: locate and fix a flipped bit.
// ---------------------------------------------------------------------------

/** "LearnOS!" as sent. Each row is one byte, bit 0 = leftmost column. */
export const PARITY_SENT: Bytes = [0x4c, 0x65, 0x61, 0x72, 0x6e, 0x4f, 0x53, 0x21];
export const PARITY_ERROR = { row: 3, col: 5 };
export const PARITY_DOUBLE = [
  { row: 1, col: 2 },
  { row: 6, col: 6 },
];

export function bitAt(byte: number, col: number): number {
  return (byte >> (7 - col)) & 1;
}

export function flipBit(bytes: Bytes, row: number, col: number): Bytes {
  return bytes.map((byte, r) => (r === row ? byte ^ (1 << (7 - col)) : byte));
}

/** Parity bits as computed by the sender, transmitted alongside the data. */
export function parityOf(bytes: Bytes) {
  const rows = bytes.map((byte) => (Array.from({ length: 8 }, (_, c) => bitAt(byte, c)).reduce((a, b) => a + b, 0) % 2));
  const cols = Array.from({ length: 8 }, (_, c) => bytes.reduce((sum, byte) => sum + bitAt(byte, c), 0) % 2);
  return { rows, cols };
}

export const PARITY_RECEIVED = flipBit(PARITY_SENT, PARITY_ERROR.row, PARITY_ERROR.col);
export const PARITY_RECEIVED_DOUBLE = PARITY_DOUBLE.reduce((bytes, { row, col }) => flipBit(bytes, row, col), PARITY_SENT);

export function mismatches(received: Bytes) {
  const expected = parityOf(PARITY_SENT);
  const actual = parityOf(received);
  return {
    rows: actual.rows.map((bit, i) => bit !== expected.rows[i]),
    cols: actual.cols.map((bit, i) => bit !== expected.cols[i]),
  };
}

export const DOUBLE_OPTIONS = [
  { id: "fix", label: "能，把两个交叉点上的位翻回来就行" },
  { id: "retry", label: "不能确定是哪两位，有 4 个候选位置，只能要求重发" },
  { id: "fine", label: "没有出错" },
] as const;

export function gradeParity(flips: { row: number; col: number }[], double: string | undefined) {
  const repaired = flips.reduce((bytes, { row, col }) => flipBit(bytes, row, col), PARITY_RECEIVED);
  const fixed = repaired.every((byte, i) => byte === PARITY_SENT[i]);
  const doubleOk = double === "retry";
  return {
    fixed,
    doubleOk,
    passed: fixed && doubleOk,
    message:
      fixed && doubleOk
        ? "第一组修好了；第二组正确地判断为只能重发。"
        : !fixed
          ? flips.length === 0
            ? "第一组还没有修。找出校验对不上的那一行和那一列。"
            : "第一组的数据还不对：翻转的位置不在出错的行列交叉点上，或者多翻了。"
          : "第二组：两处出错时，对不上的有两行两列，交叉点有几个？",
  };
}

// ---------------------------------------------------------------------------
// Ch12 · Repair a "score sheet" binary file.
// ---------------------------------------------------------------------------

export const SCORE_SPEC = [
  { offset: "0–3", field: "签名", detail: "ASCII 字符 SCOR（53 43 4F 52）" },
  { offset: "4–5", field: "文件总长度", detail: "uint16，大端序，单位是字节，包含校验和本身" },
  { offset: "6", field: "版本", detail: "uint8，固定为 1" },
  { offset: "7", field: "名字长度 n", detail: "uint8，名字的 UTF-8 字节数" },
  { offset: "8 起", field: "名字", detail: "n 个字节，UTF-8 编码" },
  { offset: "之后 3 字节", field: "语文、数学、英语", detail: "各一个 uint8" },
  { offset: "之后 2 字节", field: "总分", detail: "uint16，大端序，等于三科之和" },
  { offset: "最后 1 字节", field: "校验和", detail: "前面所有字节之和 mod 256" },
];

export const SCORE_TRUTH = { name: "林小满", scores: [98, 95, 87] };
export const SCORE_BROKEN = parseHex("00 00 00 00 14 00 01 06 C1 D6 D0 A1 C2 FA 62 5F 57 00 18 0F")!;
export const SCORE_MAX_BYTES = 64;

export type ScoreField = { field: string; bytes: string; value: string; ok: boolean; problem?: string };

/** Parse a score file the way the official reader does, reporting each field. */
export function inspectScoreFile(bytes: Bytes): { fields: ScoreField[]; valid: boolean } {
  const fields: ScoreField[] = [];
  const slice = (from: number, to: number) =>
    bytes.slice(from, to).map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  const push = (field: ScoreField) => fields.push(field);

  if (bytes.length < 9) {
    push({ field: "文件", bytes: slice(0, bytes.length), value: `${bytes.length} 字节`, ok: false, problem: "文件太短，连文件头都放不下" });
    return { fields, valid: false };
  }
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  push({
    field: "签名",
    bytes: slice(0, 4),
    value: /^[\x20-\x7e]{4}$/.test(magic) ? magic : "（不可见字符）",
    ok: magic === "SCOR",
    problem: magic === "SCOR" ? undefined : "签名不是 SCOR，官方读取器不认这个文件",
  });
  const length = readUint(bytes, 4, 2, "be")!;
  push({
    field: "文件总长度",
    bytes: slice(4, 6),
    value: `${length} 字节`,
    ok: length === bytes.length,
    problem: length === bytes.length ? undefined : `长度字段说 ${length} 字节，但文件实际有 ${bytes.length} 字节`,
  });
  push({ field: "版本", bytes: slice(6, 7), value: String(bytes[6]), ok: bytes[6] === 1, problem: bytes[6] === 1 ? undefined : "版本应为 1" });
  const n = bytes[7];
  push({ field: "名字长度", bytes: slice(7, 8), value: `${n} 字节`, ok: 8 + n + 6 <= bytes.length, problem: 8 + n + 6 <= bytes.length ? undefined : "名字长度超出了文件范围" });
  if (8 + n + 6 > bytes.length) return { fields, valid: false };
  const nameBytes = bytes.slice(8, 8 + n);
  const name = utf8Decode(nameBytes);
  const nameOk = !name.includes(REPLACEMENT) && name.length > 0;
  push({
    field: "名字（按 UTF-8 解码）",
    bytes: slice(8, 8 + n),
    value: name,
    ok: nameOk,
    problem: nameOk ? undefined : "这些字节不是合法的 UTF-8",
  });
  const scoreAt = 8 + n;
  const scores = bytes.slice(scoreAt, scoreAt + 3);
  push({ field: "三科成绩", bytes: slice(scoreAt, scoreAt + 3), value: scores.join(" / "), ok: true });
  const total = readUint(bytes, scoreAt + 3, 2, "be")!;
  const sum = scores.reduce((a, b) => a + b, 0);
  push({
    field: "总分",
    bytes: slice(scoreAt + 3, scoreAt + 5),
    value: String(total),
    ok: total === sum,
    problem: total === sum ? undefined : `三科加起来是 ${sum}，总分字段却是 ${total}`,
  });
  const checksumAt = scoreAt + 5;
  const tail = bytes.length - checksumAt;
  if (tail !== 1) {
    push({ field: "校验和", bytes: slice(checksumAt, bytes.length), value: "—", ok: false, problem: tail < 1 ? "缺少校验和字节" : `总分后面应该只剩 1 个校验和字节，实际有 ${tail} 个` });
    return { fields, valid: false };
  }
  const checksum = bytes[checksumAt];
  const expected = sumMod256(bytes.slice(0, checksumAt));
  push({
    field: "校验和",
    bytes: slice(checksumAt, checksumAt + 1),
    value: `0x${checksum.toString(16).toUpperCase().padStart(2, "0")}`,
    ok: checksum === expected,
    problem: checksum === expected ? undefined : "校验和对不上：前面的字节改过之后，校验和要重新计算",
  });
  return { fields, valid: fields.every((field) => field.ok) };
}

export function gradeRepair(bytes: Bytes): Graded {
  const report = inspectScoreFile(bytes);
  const firstProblem = report.fields.find((field) => !field.ok);
  if (firstProblem) return { passed: false, message: `${firstProblem.field}：${firstProblem.problem}` };
  const n = bytes[7];
  const name = utf8Decode(bytes.slice(8, 8 + n));
  const scores = bytes.slice(8 + n, 8 + n + 3);
  if (name !== SCORE_TRUTH.name) return { passed: false, message: `文件能读了，但名字是「${name}」，不是「${SCORE_TRUTH.name}」。` };
  if (scores.join(",") !== SCORE_TRUTH.scores.join(",")) return { passed: false, message: "文件能读了，但三科成绩被改动了。" };
  return { passed: true, message: "官方读取器解析成功：签名、长度、名字、总分和校验和全部正确。" };
}
