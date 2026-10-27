/** Server-side validators. Never imported by a client component. */
import { INT_TYPES, type IntType, isByteArray, parseHex } from "./simulation/bytes";
import {
  COLOR_ROLES,
  type ColorConfig,
  FILE_STATUSES,
  FILE_TYPES,
  IMAGES,
  IMAGE_FORMATS,
  INT_FIELDS,
  type ImageConfig,
  type IntConfig,
  JPEG_QUALITIES,
  LED_TASKS,
  MOJIBAKE_CAUSES,
  MOJIBAKE_RECORDS,
  type MoneyConfig,
  RECOVERY_OPTIONS,
  SCORE_MAX_BYTES,
  SIZE_CASES,
  USB_FILES,
  UTF8_QUESTIONS,
  evaluateColors,
  evaluateImages,
  gradeHeaderLab,
  gradeLedTask,
  gradeMojibake,
  gradeParity,
  gradeRepair,
  gradeSizeLab,
  gradeUtf8Lab,
  simulateInts,
  simulateMoney,
} from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function short(value: unknown, max = 40): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function validateLedLab(input: unknown): Verdict {
  const values = record(record(input)?.values);
  if (!values) return bad("提交内容缺少 values。");
  const results = LED_TASKS.map((task) => {
    const text = short(values[task.id], 8);
    return text === undefined ? { passed: false, message: "缺少这个任务的配置值。" } : gradeLedTask(task.id, text);
  });
  const passed = results.every((item) => item.passed);
  return {
    passed,
    feedback: {
      results: results.map((item) => item.passed),
      message: passed ? "三条灯带都亮对了。" : (results.find((item) => !item.passed)?.message ?? "还有灯带没亮对。"),
    },
  };
}

export function validateSizeLab(input: unknown): Verdict {
  const raw = record(record(input)?.answers);
  if (!raw) return bad("提交内容缺少 answers。");
  const answers = Object.fromEntries(SIZE_CASES.map(({ id }) => [id, short(raw[id], 30)]));
  const graded = gradeSizeLab(answers);
  return {
    passed: graded.passed,
    feedback: {
      results: graded.results,
      message: graded.passed ? "五个问题都答对了。" : `答对了 ${graded.correct}/${graded.total} 个。注意区分比特和字节、1000 和 1024。`,
    },
  };
}

export function validateIntLab(input: unknown): Verdict {
  const raw = record(input);
  if (!raw) return bad("配置无效。");
  const types = INT_TYPES.map((item) => item.id);
  const config = {} as IntConfig;
  for (const { id } of INT_FIELDS) {
    const type = oneOf<IntType>(raw[id], types);
    if (!type) return bad(`${id} 的类型不合法。`);
    config[id] = type;
  }
  const result = simulateInts(config);
  const failed = result.goals.filter((goal) => !goal.ok);
  return {
    passed: result.passed,
    feedback: { size: result.size, message: result.passed ? "所有值都存对了，记录也没有超出预算。" : `未达成：${failed.map((goal) => goal.label).join("；")}。` },
  };
}

export function validateMoneyLab(input: unknown): Verdict {
  const raw = record(input);
  if (!raw) return bad("配置无效。");
  const storage = oneOf(raw.storage, ["float", "cents"] as const);
  const rounding = oneOf(raw.rounding, ["line", "end"] as const);
  const display = oneOf(raw.display, ["raw", "fixed"] as const);
  if (!storage || !rounding || !display) return bad("配置项不合法。");
  const config: MoneyConfig = { storage, rounding, display };
  const result = simulateMoney(config);
  const failed = result.goals.filter((goal) => !goal.ok);
  return {
    passed: result.passed,
    feedback: { message: result.passed ? "余额判断、月底合计和显示全部正确。" : `未达成：${failed.map((goal) => goal.label).join("；")}。` },
  };
}

export function validateUtf8Lab(input: unknown): Verdict {
  const raw = record(record(input)?.answers);
  if (!raw) return bad("提交内容缺少 answers。");
  const answers = Object.fromEntries(UTF8_QUESTIONS.map(({ id }) => [id, short(raw[id], 20)]));
  const graded = gradeUtf8Lab(answers);
  return {
    passed: graded.passed,
    feedback: {
      results: graded.results,
      message: graded.passed ? "四个问题都答对了。" : `答对了 ${graded.correct}/${graded.total} 个。先用每个字节开头的几位判断它属于几字节的字符。`,
    },
  };
}

export function validateMojibakeLab(input: unknown): Verdict {
  const raw = record(input);
  const causesRaw = record(raw?.causes);
  const recoveryRaw = record(raw?.recovery);
  if (!causesRaw || !recoveryRaw) return bad("诊断报告格式不正确。");
  const causeIds = MOJIBAKE_CAUSES.map((item) => item.id);
  const recoveryIds = RECOVERY_OPTIONS.map((item) => item.id);
  const causes: Record<string, string> = {};
  const recovery: Record<string, string> = {};
  for (const { id } of MOJIBAKE_RECORDS) {
    const cause = oneOf(causesRaw[id], causeIds);
    const option = oneOf(recoveryRaw[id], recoveryIds);
    if (cause) causes[id] = cause;
    if (option) recovery[id] = option;
  }
  const graded = gradeMojibake(causes, recovery);
  return {
    passed: graded.passed,
    feedback: {
      correct: graded.correct,
      total: graded.total,
      message: graded.passed ? "七条记录的原因和能否恢复全部判断正确。" : `判断完全正确的有 ${graded.correct}/${graded.total} 条。${graded.hint}`,
    },
  };
}

export function validateColorLab(input: unknown): Verdict {
  const raw = record(input);
  if (!raw) return bad("配色无效。");
  const config = {} as ColorConfig;
  for (const { id } of COLOR_ROLES) {
    const value = short(raw[id], 9);
    if (value === undefined) return bad(`${id} 缺少颜色值。`);
    config[id] = value;
  }
  const result = evaluateColors(config);
  if (!result.valid) return bad("颜色值要写成 #RRGGBB 的形式。");
  const failed = result.goals.filter((goal) => !goal.ok);
  return {
    passed: result.passed,
    feedback: { message: result.passed ? "三种颜色在亮、暗两种背景下都清晰可读，而且仍是品牌色系。" : `未达成：${failed.map((goal) => goal.label).join("；")}。` },
  };
}

export function validateImageLab(input: unknown): Verdict {
  const raw = record(input);
  if (!raw) return bad("配置无效。");
  const config = {} as ImageConfig;
  for (const { id } of IMAGES) {
    const choice = record(raw[id]);
    const format = oneOf(choice?.format, IMAGE_FORMATS);
    const quality = JPEG_QUALITIES.find((q) => q === choice?.quality);
    const scale = oneOf(choice?.scale, ["full", "half"] as const);
    if (!format || quality === undefined || !scale) return bad(`${id} 的配置不合法。`);
    config[id] = { format, quality, scale };
  }
  const result = evaluateImages(config);
  const failed = result.results.filter((item) => !item.ok);
  return {
    passed: result.passed,
    feedback: {
      message: result.passed
        ? "三张图都够小、够清晰，透明也保留住了。"
        : `还有 ${failed.length} 张图不达标：${failed
            .map((item) => `${IMAGES.find((image) => image.id === item.id)!.label}${item.problems[0] ? `（${item.problems[0]}）` : "（超出体积上限）"}`)
            .join("；")}。`,
    },
  };
}

export function validateHeaderLab(input: unknown): Verdict {
  const raw = record(input);
  const filesRaw = record(raw?.files);
  if (!raw || !filesRaw) return bad("提交内容格式不正确。");
  const typeIds = FILE_TYPES.map((item) => item.id);
  const statusIds = FILE_STATUSES.map((item) => item.id);
  const files: Record<string, { type?: string; status?: string }> = {};
  for (const { id } of USB_FILES) {
    const entry = record(filesRaw[id]);
    files[id] = { type: oneOf(entry?.type, typeIds), status: oneOf(entry?.status, statusIds) };
  }
  const graded = gradeHeaderLab({ files, width: short(raw.width, 12), repaired: short(raw.repaired, 60) });
  return { passed: graded.passed, feedback: { message: graded.message } };
}

export function validateParityLab(input: unknown): Verdict {
  const raw = record(input);
  if (!raw || !Array.isArray(raw.flips) || raw.flips.length > 64) return bad("提交内容格式不正确。");
  const flips: { row: number; col: number }[] = [];
  for (const item of raw.flips) {
    const flip = record(item);
    const row = flip?.row;
    const col = flip?.col;
    if (!Number.isInteger(row) || !Number.isInteger(col) || (row as number) < 0 || (row as number) > 7 || (col as number) < 0 || (col as number) > 7) {
      return bad("翻转的位置不合法。");
    }
    flips.push({ row: row as number, col: col as number });
  }
  const graded = gradeParity(flips, short(raw.double, 10));
  return { passed: graded.passed, feedback: { message: graded.message } };
}

export function validateRepairLab(input: unknown): Verdict {
  const raw = record(input);
  const hex = short(raw?.hex, SCORE_MAX_BYTES * 3 + 20);
  if (hex === undefined) return bad("提交内容缺少文件字节。");
  const bytes = parseHex(hex, SCORE_MAX_BYTES);
  if (!bytes || !isByteArray(bytes, SCORE_MAX_BYTES)) return bad("字节必须是成对的十六进制数字，最多 64 个字节。");
  const graded = gradeRepair(bytes);
  return { passed: graded.passed, feedback: { message: graded.message } };
}
