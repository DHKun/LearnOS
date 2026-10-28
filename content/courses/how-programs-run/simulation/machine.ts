/**
 * 格子机: a tiny teaching computer. Four registers (R0–R3), a program
 * counter, two flags, a stack pointer and 64 memory cells that each hold a
 * whole number. Programs are written in a small assembly language and run
 * by a deterministic interpreter with a step limit.
 *
 * Nothing real is executed: the only "instructions" are the ones below.
 * The browser labs and the server-side validators run the same code.
 */

export const MEMORY_SIZE = 64;
export const REGISTERS = ["R0", "R1", "R2", "R3"] as const;
export type Register = (typeof REGISTERS)[number];
export const LIMITS = { lines: 60, lineLength: 80, steps: 2000, source: 3000 };

type Operand = { kind: "reg"; reg: Register } | { kind: "imm"; value: number } | { kind: "addr"; addr: number } | { kind: "ind"; reg: Register } | { kind: "label"; name: string };

export type Instruction = { op: Op; args: Operand[]; line: number; text: string };

const OPS = {
  SET: ["reg", "imm"],
  MOV: ["reg", "reg"],
  LOAD: ["reg", "mem"],
  STORE: ["reg", "mem"],
  ADD: ["reg", "val"],
  SUB: ["reg", "val"],
  MUL: ["reg", "val"],
  CMP: ["reg", "val"],
  JMP: ["label"],
  JZ: ["label"],
  JNZ: ["label"],
  JLT: ["label"],
  JGE: ["label"],
  CALL: ["label"],
  RET: [],
  PUSH: ["reg"],
  POP: ["reg"],
  OUT: ["reg"],
  HALT: [],
} as const satisfies Record<string, readonly string[]>;

export type Op = keyof typeof OPS;
export const OP_NAMES = Object.keys(OPS) as Op[];

export type Program = { instructions: Instruction[]; labels: Record<string, number> };
export type ParseError = { line: number; message: string };

/** Parses assembly. Errors carry the 1-based source line. */
export function assemble(source: string): { program: Program } | { error: ParseError } {
  if (source.length > LIMITS.source) return { error: { line: 0, message: `程序太长（最多 ${LIMITS.source} 个字符）` } };
  const rows = source.split("\n");
  if (rows.length > LIMITS.lines) return { error: { line: 0, message: `程序太长（最多 ${LIMITS.lines} 行）` } };
  const instructions: Instruction[] = [];
  const labels: Record<string, number> = {};
  const pending: { name: string; line: number }[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 1;
    const raw = rows[index]!;
    if (raw.length > LIMITS.lineLength) return { error: { line, message: `这一行太长（最多 ${LIMITS.lineLength} 个字符）` } };
    let text = raw.replace(/[;#].*$/, "").trim();
    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*/.exec(text);
    if (labelMatch) {
      const name = labelMatch[1]!.toLowerCase();
      if (labels[name] !== undefined) return { error: { line, message: `标签 ${labelMatch[1]} 重复定义了` } };
      labels[name] = instructions.length;
      text = text.slice(labelMatch[0].length).trim();
    }
    if (!text) continue;
    const [head, ...rest] = text.split(/\s+/);
    const op = head!.toUpperCase() as Op;
    if (!(op in OPS)) return { error: { line, message: `不认识的指令 ${head}` } };
    const parts = rest.join(" ").split(",").map((part) => part.trim()).filter(Boolean);
    const shape = OPS[op] as readonly string[];
    if (parts.length !== shape.length) return { error: { line, message: `${op} 需要 ${shape.length} 个操作数，这里写了 ${parts.length} 个` } };
    const args: Operand[] = [];
    for (let position = 0; position < shape.length; position += 1) {
      const parsed = operand(parts[position]!, shape[position]!);
      if ("error" in parsed) return { error: { line, message: `${op} 的第 ${position + 1} 个操作数${parsed.error}` } };
      if (parsed.kind === "label") pending.push({ name: parsed.name, line });
      args.push(parsed);
    }
    instructions.push({ op, args, line, text: raw.trim() });
  }
  for (const item of pending) if (labels[item.name] === undefined) return { error: { line: item.line, message: `找不到标签 ${item.name}` } };
  return { program: { instructions, labels } };
}

function operand(text: string, shape: string): Operand | { error: string } {
  const upper = text.toUpperCase();
  const reg = (REGISTERS as readonly string[]).includes(upper) ? (upper as Register) : null;
  const number = /^-?\d+$/.test(text) ? Number(text) : null;
  const memory = /^\[(.+)\]$/.exec(text);
  switch (shape) {
    case "reg":
      return reg ? { kind: "reg", reg } : { error: "应该是寄存器（R0～R3）" };
    case "imm":
      return number !== null && Math.abs(number) <= 1_000_000 ? { kind: "imm", value: number } : { error: "应该是一个整数" };
    case "val":
      if (reg) return { kind: "reg", reg };
      return number !== null && Math.abs(number) <= 1_000_000 ? { kind: "imm", value: number } : { error: "应该是寄存器或整数" };
    case "mem": {
      if (!memory) return { error: "应该是内存地址，写成 [20] 或 [R1]" };
      const inner = memory[1]!.trim();
      const innerReg = (REGISTERS as readonly string[]).includes(inner.toUpperCase()) ? (inner.toUpperCase() as Register) : null;
      if (innerReg) return { kind: "ind", reg: innerReg };
      if (/^\d+$/.test(inner) && Number(inner) < MEMORY_SIZE) return { kind: "addr", addr: Number(inner) };
      return { error: `的地址要在 0～${MEMORY_SIZE - 1} 之间` };
    }
    case "label":
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? { kind: "label", name: text.toLowerCase() } : { error: "应该是标签名" };
    default:
      return { error: "格式不对" };
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export type State = {
  regs: Record<Register, number>;
  pc: number;
  zero: boolean;
  negative: boolean;
  sp: number;
  memory: number[];
  output: number[];
  steps: number;
  halted: boolean;
  fault: string | null;
  /** Memory cells written, in order, for highlighting. */
  writes: number[];
  reads: number[];
};

export function initialState(memory: Record<number, number> = {}): State {
  const cells = new Array<number>(MEMORY_SIZE).fill(0);
  for (const [addr, value] of Object.entries(memory)) cells[Number(addr)] = value;
  return { regs: { R0: 0, R1: 0, R2: 0, R3: 0 }, pc: 0, zero: false, negative: false, sp: MEMORY_SIZE, memory: cells, output: [], steps: 0, halted: false, fault: null, writes: [], reads: [] };
}

function value(state: State, arg: Operand): number {
  return arg.kind === "reg" ? state.regs[arg.reg] : arg.kind === "imm" ? arg.value : 0;
}

function address(state: State, arg: Operand): number | null {
  const addr = arg.kind === "addr" ? arg.addr : arg.kind === "ind" ? state.regs[arg.reg] : -1;
  return addr >= 0 && addr < MEMORY_SIZE ? addr : null;
}

/** Executes one instruction in place. */
export function step(program: Program, state: State): void {
  if (state.halted || state.fault) return;
  const instruction = program.instructions[state.pc];
  if (!instruction) {
    state.fault = "程序走到了最后一行之后：忘了写 HALT，或者跳到了不该去的地方";
    return;
  }
  state.steps += 1;
  const [a, b] = instruction.args;
  const fault = (message: string) => {
    state.fault = `第 ${instruction.line} 行：${message}`;
  };
  let next = state.pc + 1;
  const target = (arg: Operand) => program.labels[(arg as { name: string }).name]!;
  switch (instruction.op) {
    case "SET":
      state.regs[(a as { reg: Register }).reg] = value(state, b!);
      break;
    case "MOV":
      state.regs[(a as { reg: Register }).reg] = value(state, b!);
      break;
    case "LOAD": {
      const addr = address(state, b!);
      if (addr === null) return fault(`读取的地址 ${state.regs[(b as { reg: Register }).reg] ?? "?"} 超出了内存范围（0～${MEMORY_SIZE - 1}）`);
      state.regs[(a as { reg: Register }).reg] = state.memory[addr]!;
      state.reads.push(addr);
      break;
    }
    case "STORE": {
      const addr = address(state, b!);
      if (addr === null) return fault(`写入的地址 ${state.regs[(b as { reg: Register }).reg] ?? "?"} 超出了内存范围（0～${MEMORY_SIZE - 1}）`);
      if (addr >= state.sp) return fault(`写入的地址 ${addr} 在栈的区域里，会写坏栈`);
      state.memory[addr] = state.regs[(a as { reg: Register }).reg];
      state.writes.push(addr);
      break;
    }
    case "ADD":
    case "SUB":
    case "MUL": {
      const reg = (a as { reg: Register }).reg;
      const result = instruction.op === "ADD" ? state.regs[reg] + value(state, b!) : instruction.op === "SUB" ? state.regs[reg] - value(state, b!) : state.regs[reg] * value(state, b!);
      state.regs[reg] = result;
      state.zero = result === 0;
      state.negative = result < 0;
      break;
    }
    case "CMP": {
      const diff = state.regs[(a as { reg: Register }).reg] - value(state, b!);
      state.zero = diff === 0;
      state.negative = diff < 0;
      break;
    }
    case "JMP":
      next = target(a!);
      break;
    case "JZ":
      if (state.zero) next = target(a!);
      break;
    case "JNZ":
      if (!state.zero) next = target(a!);
      break;
    case "JLT":
      if (state.negative) next = target(a!);
      break;
    case "JGE":
      if (!state.negative) next = target(a!);
      break;
    case "PUSH":
    case "CALL": {
      if (state.sp <= 40) return fault("栈满了（栈从地址 63 往下长，最多用到 40）：可能是 PUSH 和 POP 不配对，或者函数一直在调用自己");
      state.sp -= 1;
      state.memory[state.sp] = instruction.op === "PUSH" ? state.regs[(a as { reg: Register }).reg] : state.pc + 1;
      state.writes.push(state.sp);
      if (instruction.op === "CALL") next = target(a!);
      break;
    }
    case "POP":
    case "RET": {
      if (state.sp >= MEMORY_SIZE) return fault(instruction.op === "RET" ? "RET 时栈是空的：没有可以返回的地方" : "POP 时栈是空的");
      const top = state.memory[state.sp]!;
      state.sp += 1;
      if (instruction.op === "POP") state.regs[(a as { reg: Register }).reg] = top;
      else {
        if (top < 0 || top > program.instructions.length) return fault(`RET 从栈顶取出的返回位置是 ${top}，那里不是一条指令：栈顶放的不是返回地址`);
        next = top;
      }
      break;
    }
    case "OUT":
      if (state.output.length >= 100) return fault("输出太多了");
      state.output.push(state.regs[(a as { reg: Register }).reg]);
      break;
    case "HALT":
      state.halted = true;
      return;
  }
  state.pc = next;
}

export type RunResult = { state: State; reason: "halted" | "fault" | "limit" };

export function run(program: Program, memory: Record<number, number> = {}, limit = LIMITS.steps): RunResult {
  const state = initialState(memory);
  while (!state.halted && !state.fault && state.steps < limit) step(program, state);
  if (!state.halted && !state.fault) state.fault = `运行超过 ${limit} 步还没停下：可能陷入了死循环`;
  return { state, reason: state.halted ? "halted" : state.steps >= limit ? "limit" : "fault" };
}

/** Every state from the start to the end, for the step-by-step debugger. */
export function trace(program: Program, memory: Record<number, number> = {}, limit = 400): State[] {
  const states = [initialState(memory)];
  let current = states[0]!;
  while (!current.halted && !current.fault && states.length <= limit) {
    const next: State = { ...current, regs: { ...current.regs }, memory: [...current.memory], output: [...current.output], writes: [], reads: [] };
    step(program, next);
    states.push(next);
    current = next;
  }
  return states;
}

// ---------------------------------------------------------------------------
// Cache model (chapter 6)
// ---------------------------------------------------------------------------

export type CacheStats = { hits: number; misses: number; cycles: number };

/**
 * A direct-mapped cache: `lines` lines of `lineSize` cells. A hit costs 1
 * cycle, a miss costs `missCost` cycles (fetching the whole line).
 */
export function simulateCache(addresses: number[], lines = 4, lineSize = 4, missCost = 20): CacheStats {
  const tags = new Array<number>(lines).fill(-1);
  let hits = 0;
  let misses = 0;
  for (const addr of addresses) {
    const block = Math.floor(addr / lineSize);
    const index = block % lines;
    if (tags[index] === block) hits += 1;
    else {
      misses += 1;
      tags[index] = block;
    }
  }
  return { hits, misses, cycles: hits + misses * missCost };
}
