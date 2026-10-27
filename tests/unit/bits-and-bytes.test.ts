import { describe, expect, it } from "vitest";

import {
  REPLACEMENT,
  contrast,
  gbkDecode,
  gbkEncode,
  latin1Decode,
  parseColor,
  parseHex,
  readUint,
  toHex,
  utf8Decode,
  utf8Encode,
  wrap,
} from "@/content/courses/bits-and-bytes/simulation/bytes";
import {
  CAT_BROKEN_HEAD,
  COLOR_INITIAL,
  IMAGE_INITIAL,
  INT_INITIAL,
  LED_TASKS,
  MOJIBAKE_RECORDS,
  MONEY_INITIAL,
  PARITY_DOUBLE,
  PARITY_ERROR,
  PARITY_RECEIVED_DOUBLE,
  SCORE_BROKEN,
  USB_FILES,
  mismatches,
} from "@/content/courses/bits-and-bytes/simulation/labs";
import {
  validateColorLab,
  validateHeaderLab,
  validateImageLab,
  validateIntLab,
  validateLedLab,
  validateMojibakeLab,
  validateMoneyLab,
  validateParityLab,
  validateRepairLab,
  validateSizeLab,
  validateUtf8Lab,
} from "@/content/courses/bits-and-bytes/validators";

describe("bits-and-bytes 字节机", () => {
  it("UTF-8 编解码与 Python 结果一致，坏序列变成替换符", () => {
    expect(toHex(utf8Encode("Hi你好😀"))).toBe("48 69 E4 BD A0 E5 A5 BD F0 9F 98 80");
    expect(utf8Decode(parseHex("E4 BD A0 E5 A5")!)).toBe(`你${REPLACEMENT}`);
    expect(utf8Decode(parseHex("D6 D0 CE C4")!)).toBe(REPLACEMENT.repeat(4));
  });

  it("同一串字节换一本密码本就是另一样东西", () => {
    const bytes = utf8Encode("你好");
    expect(gbkDecode(bytes)).toBe("浣犲ソ");
    expect(latin1Decode(utf8Encode("café"))).toBe("cafÃ©");
    expect(gbkDecode(parseHex("EF BF BD EF BF BD")!)).toBe("锟斤拷");
    expect(toHex(gbkEncode("林小满")!)).toBe("C1 D6 D0 A1 C2 FA");
  });

  it("定宽整数会回绕，字节序决定读出的值", () => {
    expect(wrap(40_000, "int16")).toBe(-25_536);
    expect(wrap(-1, "uint8")).toBe(255);
    expect(readUint([0x01, 0x02], 0, 2, "be")).toBe(258);
    expect(readUint([0x01, 0x02], 0, 2, "le")).toBe(513);
  });

  it("对比度符合 WCAG 公式", () => {
    expect(contrast(parseColor("#000000")!, parseColor("#FFFFFF")!)).toBeCloseTo(21, 5);
    expect(parseColor("#12345")).toBeNull();
  });
});

describe("bits-and-bytes 服务端验证器", () => {
  it("灯带：初始值不通过，算对的十六进制通过", () => {
    const initial = Object.fromEntries(LED_TASKS.map((task) => [task.id, task.initial]));
    expect(validateLedLab({ values: initial }).passed).toBe(false);
    expect(validateLedLab({ values: { middle: "18", left: "F0", add: "DA" } }).passed).toBe(true);
    expect(validateLedLab({ values: { middle: "0x18", left: "f0", add: "da" } }).passed).toBe(true);
    // 十进制 24 被当成十六进制，正是工单里的症状
    expect(validateLedLab({ values: { middle: "24", left: "F0", add: "DA" } }).passed).toBe(false);
    expect(validateLedLab({ values: { middle: "18", left: "F0", add: "5A" }, passed: true }).passed).toBe(false);
  });

  it("容量与字节序：1000 与 1024、比特与字节、大端与小端", () => {
    const good = { disk: "931", speed: "12.5", value: "258", order: "le", max: "65535" };
    expect(validateSizeLab({ answers: good }).passed).toBe(true);
    for (const change of [{ disk: "1000" }, { speed: "100" }, { value: "513" }, { order: "be" }, { max: "65536" }]) {
      expect(validateSizeLab({ answers: { ...good, ...change } }).passed).toBe(false);
    }
  });

  it("整数类型：初始配置溢出；每个字段换小一号或换大一号都不行", () => {
    expect(validateIntLab(INT_INITIAL).passed).toBe(false);
    const good = { coins: "uint32", level: "uint8", playerId: "uint32", hpDelta: "int16" };
    expect(validateIntLab(good).passed).toBe(true);
    expect(validateIntLab({ ...good, coins: "int32", level: "int8", playerId: "int32" }).passed).toBe(true);
    for (const change of [{ coins: "uint16" }, { playerId: "uint16" }, { hpDelta: "uint16" }, { hpDelta: "int32" }, { level: "uint16" }]) {
      expect(validateIntLab({ ...good, ...change }).passed).toBe(false);
    }
    expect(validateIntLab({ ...good, coins: "int64" }).passed).toBe(false);
  });

  it("钱包：只有整数分 + 逐笔舍入 + 两位小数显示能全部达标", () => {
    expect(validateMoneyLab(MONEY_INITIAL).passed).toBe(false);
    const good = { storage: "cents", rounding: "line", display: "fixed" };
    expect(validateMoneyLab(good).passed).toBe(true);
    for (const change of [{ storage: "float" }, { rounding: "end" }, { display: "raw" }]) {
      expect(validateMoneyLab({ ...good, ...change }).passed).toBe(false);
    }
  });

  it("UTF-8 转储：字符数、字节数、偏移和截断", () => {
    const good = { chars: "5", bytes: "12", offset: "8", cut: "broken" };
    expect(validateUtf8Lab({ answers: good }).passed).toBe(true);
    for (const change of [{ chars: "12" }, { bytes: "5" }, { offset: "4" }, { cut: "clean" }]) {
      expect(validateUtf8Lab({ answers: { ...good, ...change } }).passed).toBe(false);
    }
  });

  it("乱码诊断：原因和能否恢复都要对", () => {
    const causes = Object.fromEntries(MOJIBAKE_RECORDS.map((item) => [item.id, item.cause]));
    const recovery = Object.fromEntries(MOJIBAKE_RECORDS.map((item) => [item.id, item.recoverable]));
    expect(validateMojibakeLab({ causes, recovery }).passed).toBe(true);
    expect(validateMojibakeLab({ causes, recovery: { ...recovery, db: "yes" } }).feedback.message).toContain("3F");
    expect(validateMojibakeLab({ causes: { ...causes, forum: "utf8-as-gbk" }, recovery }).passed).toBe(false);
    expect(validateMojibakeLab({ causes: {}, recovery: {} }).passed).toBe(false);
  });

  it("配色：品牌色在两种模式下都不达标；需要一深一浅两个变体", () => {
    expect(validateColorLab(COLOR_INITIAL).passed).toBe(false);
    const good = { button: "#1F5FAD", lightLink: "#1F5FAD", darkLink: "#6AA6F0" };
    expect(validateColorLab(good).passed).toBe(true);
    expect(validateColorLab({ ...good, darkLink: "#1F5FAD" }).passed).toBe(false);
    expect(validateColorLab({ ...good, button: "#333333" }).passed).toBe(false);
    expect(validateColorLab({ ...good, button: "#AD1F1F" }).passed).toBe(false);
    expect(validateColorLab({ ...good, button: "blue" }).passed).toBe(false);
  });

  it("图片：初始配置三张都有问题；合理选择全部达标", () => {
    expect(validateImageLab(IMAGE_INITIAL).passed).toBe(false);
    const good = {
      photo: { format: "jpeg", quality: 80, scale: "half" },
      logo: { format: "png", quality: 80, scale: "full" },
      icon: { format: "png", quality: 80, scale: "full" },
    };
    expect(validateImageLab(good).passed).toBe(true);
    for (const change of [
      { photo: { format: "jpeg", quality: 80, scale: "full" } },
      { photo: { format: "gif", quality: 80, scale: "half" } },
      { logo: { format: "jpeg", quality: 95, scale: "full" } },
      { logo: { format: "png", quality: 80, scale: "half" } },
      { icon: { format: "gif", quality: 80, scale: "full" } },
      { icon: { format: "jpeg", quality: 95, scale: "full" } },
    ]) {
      expect(validateImageLab({ ...good, ...change }).passed).toBe(false);
    }
  });

  it("文件头：认对类型与状态、读出宽度、修好签名", () => {
    const files = Object.fromEntries(USB_FILES.map((file) => [file.id, { type: file.type, status: file.status }]));
    const good = { files, width: "1920", repaired: "89 50 4E 47 0D 0A 1A 0A" };
    expect(validateHeaderLab(good).passed).toBe(true);
    expect(validateHeaderLab({ ...good, repaired: toHex(CAT_BROKEN_HEAD) }).passed).toBe(false);
    expect(validateHeaderLab({ ...good, width: "2147483648" }).passed).toBe(false);
    expect(validateHeaderLab({ ...good, files: { ...files, invoice: { type: "pdf", status: "ok" } } }).passed).toBe(false);
  });

  it("奇偶校验：翻对那一位并判断两处错误只能重发", () => {
    expect(validateParityLab({ flips: [], double: "retry" }).passed).toBe(false);
    expect(validateParityLab({ flips: [PARITY_ERROR], double: "retry" }).passed).toBe(true);
    expect(validateParityLab({ flips: [PARITY_ERROR], double: "fix" }).passed).toBe(false);
    expect(validateParityLab({ flips: [PARITY_ERROR, { row: 0, col: 0 }], double: "retry" }).passed).toBe(false);
    expect(validateParityLab({ flips: [{ row: 9, col: 0 }], double: "retry" }).passed).toBe(false);
    const two = mismatches(PARITY_RECEIVED_DOUBLE);
    expect(two.rows.filter(Boolean)).toHaveLength(2);
    expect(two.cols.filter(Boolean)).toHaveLength(PARITY_DOUBLE.length);
  });

  it("修复成绩文件：坏文件不通过，五处都修好才通过", () => {
    expect(validateRepairLab({ hex: toHex(SCORE_BROKEN) }).passed).toBe(false);
    const fixed = "53 43 4F 52 00 17 01 09 E6 9E 97 E5 B0 8F E6 BB A1 62 5F 57 01 18 0A";
    expect(validateRepairLab({ hex: fixed }).passed).toBe(true);
    // 改了名字却忘了更新长度或校验和
    expect(validateRepairLab({ hex: fixed.replace("00 17", "00 14") }).passed).toBe(false);
    expect(validateRepairLab({ hex: `${fixed.slice(0, -2)}0B` }).passed).toBe(false);
    expect(validateRepairLab({ hex: fixed.replace("01 18 0A", "00 18 09") }).passed).toBe(false);
    expect(validateRepairLab({ hex: "GG" }).passed).toBe(false);
    expect(validateRepairLab({ hex: "00 ".repeat(100) }).passed).toBe(false);
  });
});
