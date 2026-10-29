/**
 * A small, deterministic SQL database for the SQL course: typed tables with
 * primary keys, foreign keys and checks; SELECT with joins, grouping,
 * subqueries, ordering and limits; INSERT / UPDATE / DELETE; and
 * transactions. Errors follow PostgreSQL's wording.
 *
 * Nothing is sent to a real database. The browser labs and the server-side
 * validators run the same code on a fresh copy of the data.
 */

export type Value = number | string | boolean | null;
export type Row = Record<string, Value>;
export type ColumnType = "int" | "text" | "date" | "bool";

export type Column = { name: string; type: ColumnType; notNull?: boolean; serial?: boolean; defaultValue?: Value; unique?: boolean };
export type ForeignKey = { column: string; table: string; name: string };
export type Check = { name: string; test: (row: Row) => boolean };
export type TableDef = { name: string; columns: Column[]; primaryKey: string; foreignKeys?: ForeignKey[]; checks?: Check[] };

export type Table = { def: TableDef; rows: Row[] };
export type Db = { tables: Record<string, Table>; today: string };

export type Session = { db: Db; snapshot: Db | null; aborted: boolean; events: string[] };

export type ResultSet = { columns: string[]; rows: Value[][] };
export type Outcome = { kind: "rows"; result: ResultSet; truncated: number } | { kind: "message"; text: string } | { kind: "error"; text: string };

export const LIMITS = { sql: 2000, tokens: 600, depth: 24, work: 40_000, display: 100 };

export class SqlError extends Error {}
const err = (message: string): never => {
  throw new SqlError(message);
};

export function cloneDb(db: Db): Db {
  return { today: db.today, tables: Object.fromEntries(Object.entries(db.tables).map(([name, table]) => [name, { def: table.def, rows: table.rows.map((row) => ({ ...row })) }])) };
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Tok = { t: "word" | "qid" | "num" | "str" | "op" | "end"; v: string; up: string; raw?: string };

const OPS = ["<>", "!=", "<=", ">=", "||", "=", "<", ">", "(", ")", ",", ".", "*", "+", "-", "/", ";", "%"];

function tokenize(sql: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    if (/\s/.test(c)) {
      i += 1;
    } else if (sql.startsWith("--", i)) {
      while (i < sql.length && sql[i] !== "\n") i += 1;
    } else if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (c === "'") {
      let value = "";
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) err("unterminated quoted string at or near \"'\"");
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            value += "'";
            j += 2;
            continue;
          }
          break;
        }
        value += sql[j];
        j += 1;
      }
      toks.push({ t: "str", v: value, up: value });
      i = j + 1;
    } else if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      if (end === -1) err('unterminated quoted identifier at or near "\\""');
      const v = sql.slice(i + 1, end);
      toks.push({ t: "qid", v, up: v.toUpperCase() });
      i = end + 1;
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      const match = /^[0-9]*\.?[0-9]+/.exec(sql.slice(i))!;
      toks.push({ t: "num", v: match[0], up: match[0] });
      i += match[0].length;
    } else if (/[A-Za-z_一-鿿]/.test(c)) {
      const match = /^[A-Za-z_一-鿿][A-Za-z0-9_一-鿿]*/.exec(sql.slice(i))!;
      toks.push({ t: "word", v: match[0].toLowerCase(), up: match[0].toUpperCase(), raw: match[0] });
      i += match[0].length;
    } else {
      const op = OPS.find((candidate) => sql.startsWith(candidate, i));
      if (!op) err(`syntax error at or near "${c}"`);
      toks.push({ t: "op", v: op!, up: op! });
      i += op!.length;
    }
    if (toks.length > LIMITS.tokens) err("语句太长（练习库限制）");
  }
  toks.push({ t: "end", v: "", up: "" });
  return toks;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type Expr =
  | { k: "lit"; v: Value }
  | { k: "col"; table?: string; name: string }
  | { k: "star"; table?: string }
  | { k: "not"; e: Expr }
  | { k: "neg"; e: Expr }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "isnull"; e: Expr; not: boolean }
  | { k: "like"; e: Expr; p: Expr; not: boolean; ci: boolean }
  | { k: "in"; e: Expr; list?: Expr[]; sub?: Select; not: boolean }
  | { k: "between"; e: Expr; lo: Expr; hi: Expr; not: boolean }
  | { k: "fn"; name: string; args: Expr[]; distinct: boolean; star: boolean }
  | { k: "sub"; q: Select }
  | { k: "exists"; q: Select; not: boolean }
  | { k: "today" };

type Source = { table: string; alias: string };
type Join = Source & { type: "inner" | "left" | "cross"; on?: Expr };
export type Select = {
  k: "select";
  distinct: boolean;
  cols: { e: Expr; alias?: string }[];
  from: Source | null;
  joins: Join[];
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: { e: Expr; desc: boolean }[];
  limit?: number;
  offset?: number;
};
type Insert = { k: "insert"; table: string; cols?: string[]; rows?: Expr[][]; select?: Select };
type Update = { k: "update"; table: string; alias: string; sets: [string, Expr][]; where?: Expr };
type Delete = { k: "delete"; table: string; alias: string; where?: Expr };
type Tx = { k: "begin" | "commit" | "rollback" };
export type Stmt = Select | Insert | Update | Delete | Tx;

const RESERVED = new Set(
  "SELECT FROM WHERE AND OR NOT AS JOIN INNER LEFT OUTER CROSS ON GROUP BY HAVING ORDER ASC DESC LIMIT OFFSET DISTINCT INSERT INTO VALUES UPDATE SET DELETE NULL IS IN LIKE ILIKE BETWEEN TRUE FALSE BEGIN COMMIT ROLLBACK EXISTS CURRENT_DATE UNION".split(" "),
);
const AGGREGATES = new Set(["count", "sum", "avg", "min", "max"]);
const FUNCTIONS = new Set([...AGGREGATES, "lower", "upper", "length", "coalesce", "round", "abs"]);

class Parser {
  private i = 0;
  private depth = 0;
  constructor(private toks: Tok[]) {}

  private peek(offset = 0) {
    return this.toks[Math.min(this.i + offset, this.toks.length - 1)]!;
  }
  private next() {
    return this.toks[this.i++]!;
  }
  private isKw(word: string, offset = 0) {
    const tok = this.peek(offset);
    return tok.t === "word" && tok.up === word;
  }
  private isOp(op: string) {
    const tok = this.peek();
    return tok.t === "op" && tok.v === op;
  }
  private acceptKw(word: string) {
    if (!this.isKw(word)) return false;
    this.i += 1;
    return true;
  }
  private acceptOp(op: string) {
    if (!this.isOp(op)) return false;
    this.i += 1;
    return true;
  }
  private fail(): never {
    const tok = this.peek();
    return err(tok.t === "end" ? "syntax error at end of input" : `syntax error at or near "${tok.t === "str" ? `'${tok.v}'` : (tok.raw ?? tok.v)}"`);
  }
  private expectKw(word: string) {
    if (!this.acceptKw(word)) this.fail();
  }
  private expectOp(op: string) {
    if (!this.acceptOp(op)) this.fail();
  }
  private ident(): string {
    const tok = this.peek();
    if (tok.t === "qid") {
      this.i += 1;
      return tok.v;
    }
    if (tok.t === "word" && !RESERVED.has(tok.up)) {
      this.i += 1;
      return tok.v;
    }
    return this.fail();
  }
  private guard<T>(fn: () => T): T {
    this.depth += 1;
    if (this.depth > LIMITS.depth) err("表达式嵌套太深（练习库限制）");
    try {
      return fn();
    } finally {
      this.depth -= 1;
    }
  }

  statement(): Stmt {
    let stmt: Stmt;
    if (this.isKw("SELECT")) stmt = this.select();
    else if (this.isKw("INSERT")) stmt = this.insert();
    else if (this.isKw("UPDATE")) stmt = this.update();
    else if (this.isKw("DELETE")) stmt = this.delete();
    else if (this.acceptKw("BEGIN")) {
      this.acceptKw("TRANSACTION");
      stmt = { k: "begin" };
    } else if (this.acceptKw("START")) {
      this.expectKw("TRANSACTION");
      stmt = { k: "begin" };
    } else if (this.acceptKw("COMMIT") || this.acceptKw("END")) stmt = { k: "commit" };
    else if (this.acceptKw("ROLLBACK")) stmt = { k: "rollback" };
    else if (this.peek().t === "word" && ["CREATE", "DROP", "ALTER", "TRUNCATE", "GRANT", "COPY"].includes(this.peek().up)) {
      return err(`这门课的练习库不支持 ${this.peek().up}：表结构已经建好了。`);
    } else return this.fail();
    if (!this.acceptOp(";")) {
      if (this.peek().t !== "end") this.fail();
    } else if (this.peek().t !== "end") err("一次只能运行一条语句：请分开运行。");
    return stmt;
  }

  select(): Select {
    return this.guard(() => {
      this.expectKw("SELECT");
      const distinct = this.acceptKw("DISTINCT");
      this.acceptKw("ALL");
      const cols: Select["cols"] = [];
      do {
        if (this.isOp("*")) {
          this.next();
          cols.push({ e: { k: "star" } });
        } else if (this.peek().t !== "end" && (this.peek(1).t === "op" && this.peek(1).v === ".") && this.peek(2).t === "op" && this.peek(2).v === "*") {
          const table = this.ident();
          this.next();
          this.next();
          cols.push({ e: { k: "star", table } });
        } else {
          const e = this.expr();
          let alias: string | undefined;
          if (this.acceptKw("AS")) alias = this.ident();
          else if (this.peek().t === "qid" || (this.peek().t === "word" && !RESERVED.has(this.peek().up))) alias = this.ident();
          cols.push({ e, alias });
        }
      } while (this.acceptOp(","));
      let from: Source | null = null;
      const joins: Join[] = [];
      if (this.acceptKw("FROM")) {
        from = this.source();
        for (;;) {
          if (this.acceptOp(",")) {
            joins.push({ ...this.source(), type: "cross" });
            continue;
          }
          let type: Join["type"] | null = null;
          if (this.acceptKw("JOIN")) type = "inner";
          else if (this.acceptKw("INNER")) {
            this.expectKw("JOIN");
            type = "inner";
          } else if (this.acceptKw("LEFT")) {
            this.acceptKw("OUTER");
            this.expectKw("JOIN");
            type = "left";
          } else if (this.acceptKw("CROSS")) {
            this.expectKw("JOIN");
            type = "cross";
          } else if (this.isKw("RIGHT") || this.isKw("FULL")) return err(`这门课的练习库不支持 ${this.peek().up} JOIN：可以交换表的顺序，改用 LEFT JOIN。`);
          if (!type) break;
          const source = this.source();
          let on: Expr | undefined;
          if (type !== "cross") {
            this.expectKw("ON");
            on = this.expr();
          }
          joins.push({ ...source, type, on });
        }
      }
      const where = this.acceptKw("WHERE") ? this.expr() : undefined;
      const groupBy: Expr[] = [];
      if (this.acceptKw("GROUP")) {
        this.expectKw("BY");
        do groupBy.push(this.expr());
        while (this.acceptOp(","));
      }
      const having = this.acceptKw("HAVING") ? this.expr() : undefined;
      const orderBy: Select["orderBy"] = [];
      if (this.acceptKw("ORDER")) {
        this.expectKw("BY");
        do {
          const e = this.expr();
          const desc = this.acceptKw("DESC") ? true : (this.acceptKw("ASC"), false);
          orderBy.push({ e, desc });
        } while (this.acceptOp(","));
      }
      let limit: number | undefined;
      let offset: number | undefined;
      for (;;) {
        if (this.acceptKw("LIMIT")) limit = this.integer();
        else if (this.acceptKw("OFFSET")) offset = this.integer();
        else break;
      }
      if (this.isKw("UNION")) err("这门课的练习库不支持 UNION。");
      return { k: "select", distinct, cols, from, joins, where, groupBy, having, orderBy, limit, offset };
    });
  }

  private integer(): number {
    const tok = this.next();
    if (tok.t !== "num" || !/^\d+$/.test(tok.v)) {
      this.i -= 1;
      return this.fail();
    }
    return Number(tok.v);
  }

  private source(): Source {
    const table = this.ident();
    let alias = table;
    if (this.acceptKw("AS")) alias = this.ident();
    else if (this.peek().t === "qid" || (this.peek().t === "word" && !RESERVED.has(this.peek().up) && !["RIGHT", "FULL", "NATURAL"].includes(this.peek().up))) alias = this.ident();
    return { table, alias };
  }

  private insert(): Insert {
    this.expectKw("INSERT");
    this.expectKw("INTO");
    const table = this.ident();
    let cols: string[] | undefined;
    if (this.acceptOp("(")) {
      cols = [];
      do cols.push(this.ident());
      while (this.acceptOp(","));
      this.expectOp(")");
    }
    if (this.isKw("SELECT")) return { k: "insert", table, cols, select: this.select() };
    this.expectKw("VALUES");
    const rows: Expr[][] = [];
    do {
      this.expectOp("(");
      const row: Expr[] = [];
      do row.push(this.expr());
      while (this.acceptOp(","));
      this.expectOp(")");
      rows.push(row);
    } while (this.acceptOp(","));
    return { k: "insert", table, cols, rows };
  }

  private update(): Update {
    this.expectKw("UPDATE");
    const { table, alias } = this.source();
    this.expectKw("SET");
    const sets: [string, Expr][] = [];
    do {
      let col = this.ident();
      if (this.acceptOp(".")) col = this.ident();
      this.expectOp("=");
      sets.push([col, this.expr()]);
    } while (this.acceptOp(","));
    if (this.isKw("FROM")) err("这门课的练习库不支持 UPDATE … FROM：可以在 SET 里用子查询。");
    const where = this.acceptKw("WHERE") ? this.expr() : undefined;
    return { k: "update", table, alias, sets, where };
  }

  private delete(): Delete {
    this.expectKw("DELETE");
    this.expectKw("FROM");
    const { table, alias } = this.source();
    const where = this.acceptKw("WHERE") ? this.expr() : undefined;
    return { k: "delete", table, alias, where };
  }

  expr(): Expr {
    return this.guard(() => this.or());
  }
  private or(): Expr {
    let l = this.and();
    while (this.acceptKw("OR")) l = { k: "bin", op: "or", l, r: this.and() };
    return l;
  }
  private and(): Expr {
    let l = this.not();
    while (this.acceptKw("AND")) l = { k: "bin", op: "and", l, r: this.not() };
    return l;
  }
  private not(): Expr {
    if (this.acceptKw("NOT")) return { k: "not", e: this.guard(() => this.not()) };
    return this.comparison();
  }
  private comparison(): Expr {
    const l = this.additive();
    if (this.acceptKw("IS")) {
      const not = this.acceptKw("NOT");
      if (this.acceptKw("NULL")) return { k: "isnull", e: l, not };
      if (this.acceptKw("TRUE")) return not ? { k: "not", e: { k: "bin", op: "=", l, r: { k: "lit", v: true } } } : { k: "bin", op: "=", l, r: { k: "lit", v: true } };
      if (this.acceptKw("FALSE")) return { k: "bin", op: "=", l, r: { k: "lit", v: !not ? false : true } };
      return this.fail();
    }
    const not = this.isKw("NOT") && ["IN", "LIKE", "ILIKE", "BETWEEN"].includes(this.peek(1).up) ? (this.next(), true) : false;
    if (this.acceptKw("IN")) {
      this.expectOp("(");
      if (this.isKw("SELECT")) {
        const sub = this.select();
        this.expectOp(")");
        return { k: "in", e: l, sub, not };
      }
      const list: Expr[] = [];
      do list.push(this.expr());
      while (this.acceptOp(","));
      this.expectOp(")");
      return { k: "in", e: l, list, not };
    }
    if (this.isKw("LIKE") || this.isKw("ILIKE")) {
      const ci = this.next().up === "ILIKE";
      return { k: "like", e: l, p: this.additive(), not, ci };
    }
    if (this.acceptKw("BETWEEN")) {
      const lo = this.additive();
      this.expectKw("AND");
      return { k: "between", e: l, lo, hi: this.additive(), not };
    }
    if (not) this.fail();
    const tok = this.peek();
    if (tok.t === "op" && ["=", "<>", "!=", "<", ">", "<=", ">="].includes(tok.v)) {
      this.next();
      return { k: "bin", op: tok.v === "!=" ? "<>" : tok.v, l, r: this.additive() };
    }
    return l;
  }
  private additive(): Expr {
    let l = this.multiplicative();
    for (;;) {
      const tok = this.peek();
      if (tok.t === "op" && ["+", "-", "||"].includes(tok.v)) {
        this.next();
        l = { k: "bin", op: tok.v, l, r: this.multiplicative() };
      } else return l;
    }
  }
  private multiplicative(): Expr {
    let l = this.unary();
    for (;;) {
      const tok = this.peek();
      if (tok.t === "op" && ["*", "/", "%"].includes(tok.v)) {
        this.next();
        l = { k: "bin", op: tok.v, l, r: this.unary() };
      } else return l;
    }
  }
  private unary(): Expr {
    if (this.acceptOp("-")) return { k: "neg", e: this.guard(() => this.unary()) };
    if (this.acceptOp("+")) return this.unary();
    return this.primary();
  }
  private primary(): Expr {
    const tok = this.peek();
    if (tok.t === "num") {
      this.next();
      return { k: "lit", v: Number(tok.v) };
    }
    if (tok.t === "str") {
      this.next();
      return { k: "lit", v: tok.v };
    }
    if (this.acceptKw("NULL")) return { k: "lit", v: null };
    if (this.acceptKw("TRUE")) return { k: "lit", v: true };
    if (this.acceptKw("FALSE")) return { k: "lit", v: false };
    if (this.acceptKw("CURRENT_DATE")) return { k: "today" };
    if (this.isKw("DATE") && this.peek(1).t === "str") {
      this.next();
      return { k: "lit", v: this.next().v };
    }
    if (this.acceptKw("EXISTS")) {
      this.expectOp("(");
      const q = this.select();
      this.expectOp(")");
      return { k: "exists", q, not: false };
    }
    if (this.acceptOp("(")) {
      if (this.isKw("SELECT")) {
        const q = this.select();
        this.expectOp(")");
        return { k: "sub", q };
      }
      const e = this.expr();
      this.expectOp(")");
      return e;
    }
    if (tok.t === "word" && this.peek(1).t === "op" && this.peek(1).v === "(" && !RESERVED.has(tok.up)) {
      const name = this.next().v;
      if (!FUNCTIONS.has(name)) err(`function ${name}() does not exist`);
      this.next();
      if (this.acceptOp("*")) {
        this.expectOp(")");
        if (name !== "count") err(`syntax error at or near "*"`);
        return { k: "fn", name, args: [], distinct: false, star: true };
      }
      const distinct = this.acceptKw("DISTINCT");
      const args: Expr[] = [];
      if (!this.isOp(")")) {
        do args.push(this.expr());
        while (this.acceptOp(","));
      }
      this.expectOp(")");
      return { k: "fn", name, args, distinct, star: false };
    }
    if (tok.t === "word" || tok.t === "qid") {
      const first = this.ident();
      if (this.acceptOp(".")) {
        if (this.acceptOp("*")) return { k: "star", table: first };
        return { k: "col", table: first, name: this.ident() };
      }
      return { k: "col", name: first };
    }
    return this.fail();
  }
}

export function parse(sql: string): Stmt {
  if (sql.length > LIMITS.sql) err(`语句太长（最多 ${LIMITS.sql} 个字符）`);
  const toks = tokenize(sql);
  if (toks.length === 1) err("没有要运行的语句。");
  return new Parser(toks).statement();
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function truthy(v: Value): boolean | null {
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  return err(`argument of WHERE must be type boolean, not type ${typeof v === "number" ? "integer" : "text"}`);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Brings two values to a comparable pair, as PostgreSQL's implicit casts would. */
function coerce(a: Value, b: Value): [Value, Value] {
  if (a === null || b === null) return [a, b];
  if (typeof a === typeof b) return [a, b];
  if (typeof a === "number" && typeof b === "string") {
    if (!/^-?\d+(\.\d+)?$/.test(b.trim())) err(`invalid input syntax for type integer: "${b}"`);
    return [a, Number(b)];
  }
  if (typeof a === "string" && typeof b === "number") return coerce(b, a).reverse() as [Value, Value];
  if (typeof a === "boolean" && typeof b === "string") {
    if (!/^(t|f|true|false)$/i.test(b)) err(`invalid input syntax for type boolean: "${b}"`);
    return [a, /^t/i.test(b)];
  }
  if (typeof a === "string" && typeof b === "boolean") return coerce(b, a).reverse() as [Value, Value];
  return err(`operator does not exist: ${typeName(a)} = ${typeName(b)}`);
}

function typeName(v: Value): string {
  return typeof v === "number" ? "integer" : typeof v === "boolean" ? "boolean" : "text";
}

function compare(a: Value, b: Value): number {
  const [x, y] = coerce(a, b);
  if (x === y) return 0;
  return (x as number | string) < (y as number | string) ? -1 : 1;
}

export function likeMatch(text: string, pattern: string, ci: boolean): boolean {
  const s = ci ? text.toLowerCase() : text;
  const p = ci ? pattern.toLowerCase() : pattern;
  let row = new Array<boolean>(s.length + 1).fill(false);
  row[0] = true;
  for (const ch of p) {
    const next = new Array<boolean>(s.length + 1).fill(false);
    if (ch === "%") {
      next[0] = row[0]!;
      for (let j = 1; j <= s.length; j += 1) next[j] = next[j - 1]! || row[j]!;
    } else for (let j = 1; j <= s.length; j += 1) next[j] = row[j - 1]! && (ch === "_" || ch === s[j - 1]);
    row = next;
  }
  return row[s.length]!;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

type Binding = { alias: string; table: string; row: Row | null; def: TableDef };
type Scope = { bindings: Binding[]; outer?: Scope; group?: Scope[]; grouped?: { keys: Expr[]; pkBindings: Set<string> } };
type Ctx = { db: Db; budget: { left: number } };

function spend(ctx: Ctx, amount = 1) {
  ctx.budget.left -= amount;
  if (ctx.budget.left < 0) err("查询太大了（练习库限制）：检查一下 JOIN 有没有写 ON 条件。");
}

function lookupColumn(scope: Scope | undefined, table: string | undefined, name: string): { binding: Binding; scope: Scope } {
  for (let current = scope; current; current = current.outer) {
    if (table) {
      const binding = current.bindings.find((item) => item.alias === table);
      if (binding) {
        if (!binding.def.columns.some((column) => column.name === name)) err(`column ${table}.${name} does not exist`);
        return { binding, scope: current };
      }
      continue;
    }
    const hits = current.bindings.filter((item) => item.def.columns.some((column) => column.name === name));
    if (hits.length > 1) err(`column reference "${name}" is ambiguous`);
    if (hits.length === 1) return { binding: hits[0]!, scope: current };
  }
  if (table && !findBindingAlias(scope, table)) err(`missing FROM-clause entry for table "${table}"`);
  return err(`column "${table ? `${table}.` : ""}${name}" does not exist`);
}

function findBindingAlias(scope: Scope | undefined, alias: string): boolean {
  for (let current = scope; current; current = current.outer) if (current.bindings.some((item) => item.alias === alias)) return true;
  return false;
}

function sameExpr(a: Expr, b: Expr, scope: Scope): boolean {
  if (a.k === "col" && b.k === "col") {
    try {
      const x = lookupColumn(scope, a.table, a.name);
      const y = lookupColumn(scope, b.table, b.name);
      return x.binding === y.binding && a.name === b.name;
    } catch {
      return false;
    }
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function hasAggregate(e: Expr | undefined): boolean {
  if (!e) return false;
  switch (e.k) {
    case "fn":
      return AGGREGATES.has(e.name) || e.args.some(hasAggregate);
    case "not":
    case "neg":
    case "isnull":
      return hasAggregate(e.e);
    case "bin":
      return hasAggregate(e.l) || hasAggregate(e.r);
    case "like":
      return hasAggregate(e.e) || hasAggregate(e.p);
    case "in":
      return hasAggregate(e.e) || (e.list ?? []).some(hasAggregate);
    case "between":
      return hasAggregate(e.e) || hasAggregate(e.lo) || hasAggregate(e.hi);
    default:
      return false;
  }
}

function evaluate(ctx: Ctx, e: Expr, scope: Scope): Value {
  if (scope.grouped && !(e.k === "fn" && AGGREGATES.has(e.name))) {
    const key = scope.grouped.keys.find((candidate) => sameExpr(candidate, e, scope));
    if (key) return evaluate(ctx, e, { ...scope, grouped: undefined });
  }
  switch (e.k) {
    case "lit":
      return e.v;
    case "today":
      return ctx.db.today;
    case "star":
      return err(`syntax error at or near "*"`);
    case "col": {
      const { binding, scope: owner } = lookupColumn(scope, e.table, e.name);
      if (owner === scope && scope.grouped && !scope.grouped.pkBindings.has(binding.alias)) {
        err(`column "${binding.alias}.${e.name}" must appear in the GROUP BY clause or be used in an aggregate function`);
      }
      return binding.row ? (binding.row[e.name] ?? null) : null;
    }
    case "not": {
      const v = truthy(evaluate(ctx, e.e, scope));
      return v === null ? null : !v;
    }
    case "neg": {
      const v = evaluate(ctx, e.e, scope);
      if (v === null) return null;
      if (typeof v !== "number") err(`operator does not exist: - ${typeName(v)}`);
      return -(v as number);
    }
    case "bin":
      return binary(ctx, e, scope);
    case "isnull": {
      const v = evaluate(ctx, e.e, scope);
      return e.not ? v !== null : v === null;
    }
    case "like": {
      const v = evaluate(ctx, e.e, scope);
      const p = evaluate(ctx, e.p, scope);
      if (v === null || p === null) return null;
      const hit = likeMatch(String(v), String(p), e.ci);
      return e.not ? !hit : hit;
    }
    case "between": {
      const v = evaluate(ctx, e.e, scope);
      const lo = evaluate(ctx, e.lo, scope);
      const hi = evaluate(ctx, e.hi, scope);
      if (v === null || lo === null || hi === null) return null;
      const inside = compare(v, lo) >= 0 && compare(v, hi) <= 0;
      return e.not ? !inside : inside;
    }
    case "in": {
      const v = evaluate(ctx, e.e, scope);
      const candidates = e.sub ? runSelect(ctx, e.sub, scope, true).rows.map((row) => row[0] ?? null) : e.list!.map((item) => evaluate(ctx, item, scope));
      if (v === null) return null;
      let sawNull = false;
      for (const candidate of candidates) {
        if (candidate === null) sawNull = true;
        else if (compare(v, candidate) === 0) return !e.not;
      }
      return sawNull ? null : e.not;
    }
    case "exists": {
      const found = runSelect(ctx, e.q, scope, false).rows.length > 0;
      return e.not ? !found : found;
    }
    case "sub": {
      const result = runSelect(ctx, e.q, scope, true);
      if (result.rows.length > 1) err("more than one row returned by a subquery used as an expression");
      return result.rows[0]?.[0] ?? null;
    }
    case "fn":
      return call(ctx, e, scope);
  }
}

function binary(ctx: Ctx, e: Extract<Expr, { k: "bin" }>, scope: Scope): Value {
  if (e.op === "and" || e.op === "or") {
    const l = truthy(evaluate(ctx, e.l, scope));
    if (e.op === "and" && l === false) return false;
    if (e.op === "or" && l === true) return true;
    const r = truthy(evaluate(ctx, e.r, scope));
    if (e.op === "and") return l === null ? (r === false ? false : null) : r;
    return l === null ? (r === true ? true : null) : r;
  }
  const l = evaluate(ctx, e.l, scope);
  const r = evaluate(ctx, e.r, scope);
  if (l === null || r === null) return null;
  switch (e.op) {
    case "=":
      return compare(l, r) === 0;
    case "<>":
      return compare(l, r) !== 0;
    case "<":
      return compare(l, r) < 0;
    case ">":
      return compare(l, r) > 0;
    case "<=":
      return compare(l, r) <= 0;
    case ">=":
      return compare(l, r) >= 0;
    case "||":
      return `${display(l)}${display(r)}`;
    default: {
      if (typeof l === "string" && DATE.test(l) && typeof r === "number" && (e.op === "+" || e.op === "-")) return addDays(l, e.op === "+" ? r : -r);
      if (typeof l === "string" && DATE.test(l) && typeof r === "string" && DATE.test(r) && e.op === "-") return Math.round((Date.parse(l) - Date.parse(r)) / 86_400_000);
      const [x, y] = coerce(l, r);
      if (typeof x !== "number" || typeof y !== "number") return err(`operator does not exist: ${typeName(l)} ${e.op} ${typeName(r)}`);
      if (e.op === "+") return x + y;
      if (e.op === "-") return x - y;
      if (e.op === "*") return x * y;
      if (y === 0) return err("division by zero");
      if (e.op === "%") return x % y;
      return Number.isInteger(x) && Number.isInteger(y) ? Math.trunc(x / y) : x / y;
    }
  }
}

function call(ctx: Ctx, e: Extract<Expr, { k: "fn" }>, scope: Scope): Value {
  if (AGGREGATES.has(e.name)) {
    const rows = scope.group;
    if (!rows) return err(`aggregate functions are not allowed in ${scope.bindings.length ? "WHERE" : "this context"}`);
    if (e.star) return rows.length;
    if (e.args.length !== 1) err(`function ${e.name}() does not exist`);
    let values = rows.map((row) => evaluate(ctx, e.args[0]!, { ...row, grouped: undefined })).filter((v): v is Exclude<Value, null> => v !== null);
    if (e.distinct) values = values.filter((v, index) => values.findIndex((other) => compare(other, v) === 0) === index);
    if (e.name === "count") return values.length;
    if (values.length === 0) return null;
    if (e.name === "min" || e.name === "max") return values.reduce((best, v) => (compare(v, best) * (e.name === "min" ? -1 : 1) > 0 ? v : best));
    if (values.some((v) => typeof v !== "number")) err(`function ${e.name}(text) does not exist`);
    const total = (values as number[]).reduce((sum, v) => sum + v, 0);
    return e.name === "sum" ? total : Math.round((total / values.length) * 100) / 100;
  }
  const args = e.args.map((arg) => evaluate(ctx, arg, scope));
  switch (e.name) {
    case "lower":
      return args[0] === null || args[0] === undefined ? null : String(args[0]).toLowerCase();
    case "upper":
      return args[0] === null || args[0] === undefined ? null : String(args[0]).toUpperCase();
    case "length":
      return args[0] === null || args[0] === undefined ? null : [...String(args[0])].length;
    case "coalesce":
      return args.find((arg) => arg !== null) ?? null;
    case "abs":
      return typeof args[0] === "number" ? Math.abs(args[0]) : null;
    case "round": {
      if (typeof args[0] !== "number") return null;
      const places = typeof args[1] === "number" ? args[1] : 0;
      return Math.round(args[0] * 10 ** places) / 10 ** places;
    }
    default:
      return err(`function ${e.name}() does not exist`);
  }
}

function tableOf(db: Db, name: string): Table {
  return db.tables[name] ?? err(`relation "${name}" does not exist`);
}

function columnLabel(e: Expr, alias?: string): string {
  if (alias) return alias;
  if (e.k === "col") return e.name;
  if (e.k === "fn") return e.name;
  return "?column?";
}

/** Runs a SELECT; `scalar` subqueries must yield exactly one column. */
function runSelect(ctx: Ctx, q: Select, outer: Scope | undefined, single: boolean): ResultSet {
  let scopes: Scope[];
  if (!q.from) scopes = [{ bindings: [], outer }];
  else {
    const first = tableOf(ctx.db, q.from.table);
    scopes = first.rows.map((row) => ({ bindings: [{ alias: q.from!.alias, table: q.from!.table, row, def: first.def }], outer }));
    spend(ctx, scopes.length);
    const seen = new Set([q.from.alias]);
    for (const join of q.joins) {
      if (seen.has(join.alias)) err(`table name "${join.alias}" specified more than once`);
      seen.add(join.alias);
      const table = tableOf(ctx.db, join.table);
      const next: Scope[] = [];
      for (const scope of scopes) {
        let matched = false;
        for (const row of table.rows) {
          spend(ctx);
          const candidate: Scope = { bindings: [...scope.bindings, { alias: join.alias, table: join.table, row, def: table.def }], outer };
          if (!join.on || truthy(evaluate(ctx, join.on, candidate)) === true) {
            next.push(candidate);
            matched = true;
          }
        }
        if (!matched && join.type === "left") next.push({ bindings: [...scope.bindings, { alias: join.alias, table: join.table, row: null, def: table.def }], outer });
      }
      scopes = next;
    }
  }
  if (q.where) {
    if (hasAggregate(q.where)) err("aggregate functions are not allowed in WHERE");
    scopes = scopes.filter((scope) => truthy(evaluate(ctx, q.where!, scope)) === true);
  }

  const grouped = q.groupBy.length > 0 || q.having !== undefined || q.cols.some((col) => hasAggregate(col.e));
  type Out = { values: Value[]; scope: Scope };
  let outputs: Out[];
  let columns: string[] = [];
  const expand = (scope: Scope): { label: string; value: Value }[] =>
    q.cols.flatMap(({ e, alias }) => {
      if (e.k === "star") {
        const bindings = e.table ? scope.bindings.filter((item) => item.alias === e.table) : scope.bindings;
        if (e.table && !bindings.length) err(`missing FROM-clause entry for table "${e.table}"`);
        if (!scope.bindings.length) err("SELECT * with no tables specified is not valid");
        return bindings.flatMap((binding) => binding.def.columns.map((column) => ({ label: column.name, value: binding.row ? (binding.row[column.name] ?? null) : null })));
      }
      return [{ label: columnLabel(e, alias), value: evaluate(ctx, e, scope) }];
    });

  if (grouped) {
    if (q.cols.some((col) => col.e.k === "star")) err("column must appear in the GROUP BY clause or be used in an aggregate function（SELECT * 不能和 GROUP BY 一起用）");
    const groups = new Map<string, Scope[]>();
    const template = scopes[0] ?? { bindings: q.from ? [{ alias: q.from.alias, table: q.from.table, row: null, def: tableOf(ctx.db, q.from.table).def }] : [], outer };
    for (const scope of scopes) {
      const key = JSON.stringify(q.groupBy.map((e) => evaluate(ctx, e, scope)));
      const list = groups.get(key) ?? [];
      list.push(scope);
      groups.set(key, list);
    }
    if (q.groupBy.length === 0 && groups.size === 0) groups.set("[]", []);
    const pkBindings = new Set(
      template.bindings
        .filter((binding) => q.groupBy.some((key) => key.k === "col" && key.name === binding.def.primaryKey && (() => {
          try {
            return lookupColumn(template, key.table, key.name).binding.alias === binding.alias;
          } catch {
            return false;
          }
        })()))
        .map((binding) => binding.alias),
    );
    outputs = [];
    for (const rows of groups.values()) {
      const base = rows[0] ?? template;
      const scope: Scope = { ...base, group: rows, grouped: { keys: q.groupBy, pkBindings } };
      if (q.having && truthy(evaluate(ctx, q.having, scope)) !== true) continue;
      const cells = expand(scope);
      columns = cells.map((cell) => cell.label);
      outputs.push({ values: cells.map((cell) => cell.value), scope });
    }
    if (!outputs.length) columns = q.cols.map((col) => columnLabel(col.e, col.alias));
  } else {
    outputs = scopes.map((scope) => {
      const cells = expand(scope);
      columns = cells.map((cell) => cell.label);
      return { values: cells.map((cell) => cell.value), scope };
    });
    if (!outputs.length) {
      const template: Scope = { bindings: q.from ? [q.from, ...q.joins].map((source) => ({ alias: source.alias, table: source.table, row: null, def: tableOf(ctx.db, source.table).def })) : [], outer };
      columns = expand(template).map((cell) => cell.label);
    }
  }

  if (q.distinct) {
    const seen = new Set<string>();
    outputs = outputs.filter((out) => {
      const key = JSON.stringify(out.values);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (q.orderBy.length) {
    const keyed = outputs.map((out) => ({
      out,
      keys: q.orderBy.map(({ e }) => {
        if (e.k === "lit" && typeof e.v === "number") {
          if (e.v < 1 || e.v > columns.length) err(`ORDER BY position ${e.v} is not in select list`);
          return out.values[e.v - 1] ?? null;
        }
        if (e.k === "col" && !e.table) {
          const index = q.cols.findIndex((col) => col.alias === e.name);
          if (index >= 0) return out.values[index] ?? null;
        }
        return evaluate(ctx, e, out.scope);
      }),
    }));
    keyed.sort((a, b) => {
      for (let index = 0; index < q.orderBy.length; index += 1) {
        const x = a.keys[index]!;
        const y = b.keys[index]!;
        const desc = q.orderBy[index]!.desc;
        if (x === null && y === null) continue;
        if (x === null) return desc ? -1 : 1;
        if (y === null) return desc ? 1 : -1;
        const c = compare(x, y);
        if (c !== 0) return desc ? -c : c;
      }
      return 0;
    });
    outputs = keyed.map((item) => item.out);
  }
  const start = q.offset ?? 0;
  outputs = outputs.slice(start, q.limit === undefined ? undefined : start + q.limit);
  if (single && columns.length !== 1) err("subquery must return only one column");
  return { columns, rows: outputs.map((out) => out.values) };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function castFor(column: Column, value: Value): Value {
  if (value === null) return null;
  switch (column.type) {
    case "int":
      if (typeof value === "number") {
        if (!Number.isInteger(value)) return Math.round(value);
        return value;
      }
      if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
      return err(`invalid input syntax for type integer: "${display(value)}"`);
    case "bool":
      if (typeof value === "boolean") return value;
      if (typeof value === "string" && /^(t|f|true|false)$/i.test(value)) return /^t/i.test(value);
      return err(`column "${column.name}" is of type boolean but expression is of type ${typeName(value)}`);
    case "date":
      if (typeof value === "string" && DATE.test(value) && !Number.isNaN(Date.parse(value))) return value;
      return err(`invalid input syntax for type date: "${display(value)}"`);
    default:
      return typeof value === "string" ? value : display(value);
  }
}

function validate(db: Db, table: Table, rows: Row[]): void {
  const def = table.def;
  for (const row of rows) {
    for (const column of def.columns) {
      if ((column.notNull || column.name === def.primaryKey) && row[column.name] === null) err(`null value in column "${column.name}" of relation "${def.name}" violates not-null constraint`);
    }
    for (const check of def.checks ?? []) if (!check.test(row)) err(`new row for relation "${def.name}" violates check constraint "${check.name}"`);
    for (const fk of def.foreignKeys ?? []) {
      const value = row[fk.column];
      if (value === null || value === undefined) continue;
      const parent = tableOf(db, fk.table);
      if (!parent.rows.some((candidate) => candidate[parent.def.primaryKey] === value)) err(`insert or update on table "${def.name}" violates foreign key constraint "${fk.name}"\n详细：Key (${fk.column})=(${value}) is not present in table "${fk.table}".`);
    }
  }
  const unique = [def.primaryKey, ...def.columns.filter((column) => column.unique).map((column) => column.name)];
  for (const name of unique) {
    const seen = new Set<string>();
    for (const row of table.rows) {
      const value = row[name];
      if (value === null) continue;
      const key = JSON.stringify(value);
      if (seen.has(key)) err(`duplicate key value violates unique constraint "${def.name}_${name === def.primaryKey ? "pkey" : `${name}_key`}"\n详细：Key (${name})=(${display(value)}) already exists.`);
      seen.add(key);
    }
  }
}

/** Parent rows still referenced by a child after a delete or key change. */
function checkReferences(db: Db, table: Table): void {
  for (const child of Object.values(db.tables)) {
    for (const fk of child.def.foreignKeys ?? []) {
      if (fk.table !== table.def.name) continue;
      const keys = new Set(table.rows.map((row) => row[table.def.primaryKey]));
      const orphan = child.rows.find((row) => row[fk.column] !== null && !keys.has(row[fk.column]!));
      if (orphan) err(`update or delete on table "${table.def.name}" violates foreign key constraint "${fk.name}" on table "${child.def.name}"\n详细：Key (${table.def.primaryKey})=(${orphan[fk.column]}) is still referenced from table "${child.def.name}".`);
    }
  }
}

function runInsert(ctx: Ctx, stmt: Insert): string {
  const table = tableOf(ctx.db, stmt.table);
  const def = table.def;
  const names = stmt.cols ?? def.columns.map((column) => column.name);
  for (const name of names) if (!def.columns.some((column) => column.name === name)) err(`column "${name}" of relation "${def.name}" does not exist`);
  const sources: Value[][] = stmt.select ? runSelect(ctx, stmt.select, undefined, false).rows : stmt.rows!.map((row) => row.map((e) => evaluate(ctx, e, { bindings: [] })));
  const added: Row[] = [];
  for (const values of sources) {
    if (values.length !== names.length) err(values.length > names.length ? "INSERT has more expressions than target columns" : "INSERT has more target columns than expressions");
    const row: Row = {};
    for (const column of def.columns) {
      const index = names.indexOf(column.name);
      if (index >= 0) row[column.name] = castFor(column, values[index]!);
      else if (column.serial) row[column.name] = Math.max(0, ...table.rows.map((existing) => Number(existing[column.name] ?? 0)), ...added.map((existing) => Number(existing[column.name] ?? 0))) + 1;
      else row[column.name] = column.defaultValue ?? null;
    }
    added.push(row);
  }
  table.rows.push(...added);
  validate(ctx.db, table, added);
  return `INSERT 0 ${added.length}`;
}

function runUpdate(ctx: Ctx, stmt: Update): string {
  const table = tableOf(ctx.db, stmt.table);
  const def = table.def;
  for (const [name] of stmt.sets) if (!def.columns.some((column) => column.name === name)) err(`column "${name}" of relation "${def.name}" does not exist`);
  const before = table.rows.map((row) => ({ ...row }));
  const changed: Row[] = [];
  const updates: [Row, Row][] = [];
  for (const row of table.rows) {
    const scope: Scope = { bindings: [{ alias: stmt.alias, table: stmt.table, row: before[table.rows.indexOf(row)]!, def }] };
    if (stmt.where && truthy(evaluate(ctx, stmt.where, scope)) !== true) continue;
    const next = { ...row };
    for (const [name, e] of stmt.sets) next[name] = castFor(def.columns.find((column) => column.name === name)!, evaluate(ctx, e, scope));
    updates.push([row, next]);
  }
  for (const [row, next] of updates) {
    Object.assign(row, next);
    changed.push(row);
  }
  validate(ctx.db, table, changed);
  checkReferences(ctx.db, table);
  return `UPDATE ${changed.length}`;
}

function runDelete(ctx: Ctx, stmt: Delete): string {
  const table = tableOf(ctx.db, stmt.table);
  const keep: Row[] = [];
  let removed = 0;
  for (const row of table.rows) {
    const scope: Scope = { bindings: [{ alias: stmt.alias, table: stmt.table, row, def: table.def }] };
    if (!stmt.where || truthy(evaluate(ctx, stmt.where, scope)) === true) removed += 1;
    else keep.push(row);
  }
  table.rows = keep;
  checkReferences(ctx.db, table);
  return `DELETE ${removed}`;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function newSession(db: Db): Session {
  return { db, snapshot: null, aborted: false, events: [] };
}

/** The data other connections would see: uncommitted changes are invisible. */
export function committed(session: Session): Db {
  return session.snapshot ?? session.db;
}

export function display(v: Value): string {
  if (v === null) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/** Runs one statement in a session, PostgreSQL-style: each statement is atomic. */
export function execute(session: Session, sql: string): Outcome {
  let stmt: Stmt;
  try {
    stmt = parse(sql);
  } catch (error) {
    if (error instanceof SqlError) {
      if (session.snapshot) session.aborted = true;
      return { kind: "error", text: `ERROR:  ${error.message}` };
    }
    throw error;
  }
  if (stmt.k === "begin") {
    if (session.snapshot) return { kind: "message", text: "WARNING:  there is already a transaction in progress\nBEGIN" };
    session.snapshot = cloneDb(session.db);
    session.events.push("begin");
    return { kind: "message", text: "BEGIN" };
  }
  if (stmt.k === "commit" || stmt.k === "rollback") {
    if (!session.snapshot) return { kind: "message", text: `WARNING:  there is no transaction in progress\n${stmt.k.toUpperCase()}` };
    const rollback = stmt.k === "rollback" || session.aborted;
    if (rollback) session.db = session.snapshot;
    session.events.push(rollback ? "rollback" : "commit");
    session.snapshot = null;
    session.aborted = false;
    return { kind: "message", text: rollback ? "ROLLBACK" : "COMMIT" };
  }
  if (session.aborted) return { kind: "error", text: "ERROR:  current transaction is aborted, commands ignored until end of transaction block" };
  const backup = cloneDb(session.db);
  const ctx: Ctx = { db: session.db, budget: { left: LIMITS.work } };
  try {
    if (stmt.k === "select") {
      const result = runSelect(ctx, stmt, undefined, false);
      const truncated = Math.max(0, result.rows.length - LIMITS.display);
      return { kind: "rows", result, truncated };
    }
    const write = stmt as Insert | Update | Delete;
    const text = write.k === "insert" ? runInsert(ctx, write) : write.k === "update" ? runUpdate(ctx, write) : runDelete(ctx, write);
    session.events.push(`${write.k}:${write.table}`);
    return { kind: "message", text };
  } catch (error) {
    if (!(error instanceof SqlError)) throw error;
    session.db.tables = backup.tables;
    if (session.snapshot) session.aborted = true;
    return { kind: "error", text: `ERROR:  ${error.message}` };
  }
}

/** Runs one read-only query on a copy of the data, for query labs. */
export function query(db: Db, sql: string): { result?: ResultSet; error?: string } {
  let stmt: Stmt;
  try {
    stmt = parse(sql);
  } catch (error) {
    if (error instanceof SqlError) return { error: `ERROR:  ${error.message}` };
    throw error;
  }
  if (stmt.k !== "select") return { error: "这个练习只运行查询（SELECT），不会修改数据。" };
  try {
    return { result: runSelect({ db: cloneDb(db), budget: { left: LIMITS.work } }, stmt, undefined, false) };
  } catch (error) {
    if (error instanceof SqlError) return { error: `ERROR:  ${error.message}` };
    throw error;
  }
}

export type Transcript = { sql: string; outcome: Outcome; inTx: boolean }[];

export function replay(create: () => Db, statements: readonly string[], max = 40): { session: Session; transcript: Transcript } {
  const session = newSession(create());
  const transcript: Transcript = [];
  for (const sql of statements.slice(0, max)) {
    const outcome = execute(session, sql);
    transcript.push({ sql, outcome, inTx: session.snapshot !== null });
  }
  return { session, transcript };
}
