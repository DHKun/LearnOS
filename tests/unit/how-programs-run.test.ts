import { describe, expect, it } from "vitest";

import { ARRAY_BROKEN, CACHE_INITIAL, SCHEDULE_INITIAL, STACK_BROKEN, SUM_BROKEN, traceAnswers } from "@/content/courses/how-programs-run/simulation/labs";
import { assemble, run } from "@/content/courses/how-programs-run/simulation/machine";
import {
  validateArrayLab,
  validateCacheLab,
  validateLoopLab,
  validateScheduleLab,
  validateStackLab,
  validateTraceLab,
} from "@/content/courses/how-programs-run/validators";

function exec(source: string, memory: Record<number, number> = {}) {
  const compiled = assemble(source);
  if ("error" in compiled) throw new Error(compiled.error.message);
  return run(compiled.program, memory);
}

describe("how-programs-run 格子机", () => {
  it("取指、执行、跳转与标志位", () => {
    const result = exec("SET R0, 3\nSUB R0, 3\nJZ zero\nSET R1, 1\nzero: OUT R0\nHALT");
    expect(result.state.output).toEqual([0]);
    expect(result.state.regs.R1).toBe(0);
    expect(result.state.steps).toBe(5);
  });

  it("只认识自己的指令：未知指令、越界地址、死循环都会被拦下", () => {
    expect(assemble("rm -rf /")).toMatchObject({ error: { line: 1 } });
    expect(assemble("LOAD R0, [64]")).toMatchObject({ error: { line: 1 } });
    expect(exec("SET R1, 99\nLOAD R0, [R1]\nHALT").state.fault).toContain("超出了内存范围");
    expect(exec("loop: JMP loop").reason).toBe("limit");
    expect(exec("SET R0, 1").state.fault).toContain("HALT");
    expect(assemble("SET R0, 1\n".repeat(61))).toMatchObject({ error: { line: 0 } });
  });

  it("栈：CALL 把返回地址压栈，RET 取回", () => {
    const result = exec("SET R1, 2\nCALL f\nOUT R0\nHALT\nf: MOV R0, R1\nADD R0, 1\nRET");
    expect(result.state.output).toEqual([3]);
    expect(result.state.sp).toBe(64);
  });
});

describe("how-programs-run 服务端验证器", () => {
  it("单步跟踪：小计在加包装费之前写入内存", () => {
    const answers = traceAnswers();
    expect(answers).toEqual({ subtotal: 32, total: 37, steps: 10, single: 8 });
    expect(validateTraceLab({ answers: Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, String(value)])) }).passed).toBe(true);
    expect(String(validateTraceLab({ answers: { subtotal: "37", total: "37", steps: "10", single: "8" } }).feedback.message)).toContain("内存里的值不会跟着变");
  });

  it("循环：初始程序少加了最后一个数，N = 0 时也不对", () => {
    expect(validateLoopLab({ source: SUM_BROKEN }).passed).toBe(false);
    const fixed = SUM_BROKEN.replace("loop: ADD R2, R1      ; sum = sum + i\n      ADD R1, 1       ; i = i + 1\n      CMP R1, R0\n      JLT loop        ; i < N 就继续", "loop: CMP R0, R1\n      JLT done\n      ADD R2, R1\n      ADD R1, 1\n      JMP loop\ndone:").replace("STORE R2, [20]", "STORE R2, [20]");
    expect(validateLoopLab({ source: fixed }).passed).toBe(true);
    const offByOneOnly = SUM_BROKEN.replace("JLT loop", "JLT loop\n      ADD R2, R1");
    expect(validateLoopLab({ source: offByOneOnly }).passed).toBe(false);
    expect(validateLoopLab({ source: "loop: JMP loop" }).passed).toBe(false);
  });

  it("数组越界：要改循环边界，事后把人数改回来不算", () => {
    expect(validateArrayLab({ source: ARRAY_BROKEN }).passed).toBe(false);
    expect(validateArrayLab({ source: ARRAY_BROKEN.replace("CMP R1, 36", "CMP R1, 35") }).passed).toBe(true);
    const patched = ARRAY_BROKEN.replace("      SET R1, 30        ; 打印", "      SET R0, 5\n      STORE R0, [35]\n      SET R1, 30        ; 打印");
    expect(String(validateArrayLab({ source: patched }).feedback.message)).toContain("[35]");
  });

  it("栈不平衡：PUSH 之后要 POP", () => {
    expect(validateStackLab({ source: STACK_BROKEN }).passed).toBe(false);
    expect(validateStackLab({ source: STACK_BROKEN.replace("      RET", "      POP R1\n      RET") }).passed).toBe(true);
    expect(validateStackLab({ source: STACK_BROKEN.replace("double: PUSH R1\n", "double:\n") }).passed).toBe(true);
    expect(validateStackLab({ source: STACK_BROKEN.replace("      RET", "      POP R0\n      RET") }).passed).toBe(false);
  });

  it("缓存：三段程序都要在预算内", () => {
    expect(validateCacheLab({ choice: CACHE_INITIAL }).passed).toBe(false);
    expect(validateCacheLab({ choice: { order: "row", layout: "columns", offset: 24 } }).passed).toBe(true);
    for (const change of [{ order: "column" }, { layout: "records" }, { offset: 16 }]) {
      expect(validateCacheLab({ choice: { order: "row", layout: "columns", offset: 24, ...change } }).passed).toBe(false);
    }
  });

  it("调度：只有合适的时间片能兼顾响应、流畅和开销", () => {
    expect(validateScheduleLab({ policy: SCHEDULE_INITIAL }).passed).toBe(false);
    expect(validateScheduleLab({ policy: { algorithm: "rr", quantum: 5 } }).passed).toBe(true);
    for (const policy of [{ algorithm: "sjf", quantum: 5 }, { algorithm: "rr", quantum: 2 }, { algorithm: "rr", quantum: 10 }, { algorithm: "rr", quantum: 30 }]) {
      expect(validateScheduleLab({ policy }).passed).toBe(false);
    }
    expect(validateScheduleLab({ policy: { algorithm: "rr", quantum: 1 } }).passed).toBe(false);
  });

  it("拒绝格式错误或超长的输入", () => {
    expect(validateLoopLab(null).passed).toBe(false);
    expect(validateLoopLab({ source: "x".repeat(4000) }).passed).toBe(false);
    expect(validateCacheLab({ choice: { order: "diagonal" } }).passed).toBe(false);
  });
});
