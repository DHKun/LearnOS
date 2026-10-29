/**
 * Lab data and grading rules. Pure functions shared by the browser (live
 * feedback where a lab has it) and validators.ts (the only source of
 * `passed`). Expected answers are computed from the data, not hard-coded.
 */
import { BASE, LILEI, MAX_LOANS, SANTI, TODAY, correctLoans, halfBorrowDb, incidentDb, libraryDb } from "./library";
import { type Db, LIMITS, type ResultSet, type Row, type Session, committed, query, replay } from "./sql";

export type Goal = { id: string; label: string; ok: boolean; detail?: string };
export type Graded = { passed: boolean; message: string; goals?: Goal[] };

export const STATEMENT_MAX = 1200;
export const HISTORY_MAX = 40;

const loans = BASE.tables.loans!.rows;
const readers = BASE.tables.readers!.rows;
const books = BASE.tables.books!.rows;

function column(result: ResultSet, ...names: string[]): number {
  return result.columns.findIndex((name) => names.includes(name.toLowerCase()));
}

function numbers(result: ResultSet): number[] {
  return result.columns.map((_, index) => index).filter((index) => result.rows.length > 0 && result.rows.every((row) => typeof row[index] === "number"));
}

export type QueryLabId = "overdue" | "latest" | "overLimit" | "report";

// ---------------------------------------------------------------------------
// Ch2 · overdue loans
// ---------------------------------------------------------------------------

export const OVERDUE = loans.filter((row) => row.returned === null && (row.due as string) < TODAY).map((row) => row.id as number);
const DUE_TODAY = loans.filter((row) => row.returned === null && row.due === TODAY).map((row) => row.id as number);

function gradeOverdue(result: ResultSet, sql: string): Graded {
  const idIndex = column(result, "id");
  if (idIndex < 0) return { passed: false, message: "结果里要有借阅记录的编号这一列（id），才能核对是哪几条。" };
  const ids = result.rows.map((row) => row[idIndex]);
  const got = new Set(ids);
  const missing = OVERDUE.filter((id) => !got.has(id));
  const extra = [...got].filter((id) => !OVERDUE.includes(id as number));
  if (!missing.length && !extra.length && ids.length === OVERDUE.length) return { passed: true, message: `找到了全部 ${OVERDUE.length} 条逾期未还的借阅。` };
  if (ids.length === 0 && /=\s*null/i.test(sql)) return { passed: false, message: "一条都没查出来。和 NULL 比较不能用 =：任何值 = NULL 的结果都是“未知”，要写 IS NULL。" };
  const hints = [`查出 ${ids.length} 条，应该是 ${OVERDUE.length} 条。`];
  if (extra.some((id) => DUE_TODAY.includes(id as number))) hints.push("今天到期的还不算逾期。");
  if (extra.some((id) => loans.find((row) => row.id === id)?.returned !== null)) hints.push("已经还了的不算未还。");
  if (missing.length && !extra.length) hints.push("还漏了几条。");
  return { passed: false, message: hints.join("") };
}

// ---------------------------------------------------------------------------
// Ch3 · newest books on the home page
// ---------------------------------------------------------------------------

export const LATEST = [...books]
  .filter((row) => row.status === "available")
  .sort((a, b) => ((a.added as string) < (b.added as string) ? 1 : -1))
  .slice(0, 5)
  .map((row) => row.title as string);
export const LATEST_BROKEN = "SELECT title, added\nFROM books\nORDER BY added\nLIMIT 5;";

function gradeLatest(result: ResultSet): Graded {
  const index = column(result, "title");
  if (index < 0) return { passed: false, message: "结果里要有书名这一列（title）。" };
  const titles = result.rows.map((row) => row[index] as string);
  if (titles.length === LATEST.length && titles.every((title, position) => title === LATEST[position])) return { passed: true, message: "首页现在按上架时间从新到旧显示 5 本在架的书。" };
  const hints: string[] = [];
  if (titles.length !== 5) hints.push(`结果有 ${titles.length} 行，首页只放 5 本。`);
  if (titles.some((title) => books.find((row) => row.title === title)?.status === "withdrawn")) hints.push("里面有已经下架（withdrawn）的书。");
  if (titles.length === 5 && [...titles].sort().join() === [...LATEST].sort().join()) hints.push("是这 5 本，但顺序不对：要从新到旧。");
  else if (!hints.length) hints.push("不是最新上架的那 5 本。ORDER BY 默认是从小到大。");
  return { passed: false, message: hints.join("") };
}

// ---------------------------------------------------------------------------
// Ch4 · readers over the borrowing limit
// ---------------------------------------------------------------------------

const currentCounts = new Map<number, number>();
for (const row of loans) if (row.returned === null) currentCounts.set(row.reader_id as number, (currentCounts.get(row.reader_id as number) ?? 0) + 1);
export const OVER_LIMIT = [...currentCounts.entries()].filter(([, count]) => count > MAX_LOANS).map(([id, count]) => ({ id, name: readers.find((row) => row.id === id)!.name as string, count }));

function gradeOverLimit(result: ResultSet): Graded {
  const nameIndex = column(result, "name");
  const countIndex = numbers(result).find((index) => index !== column(result, "id"));
  if (nameIndex < 0 || countIndex === undefined) return { passed: false, message: "结果里要有读者姓名（name）和他手上借着几本（一个数字）这两列。" };
  const got = result.rows.map((row) => ({ name: row[nameIndex], count: row[countIndex] }));
  const ok = got.length === OVER_LIMIT.length && OVER_LIMIT.every((want) => got.some((row) => row.name === want.name && row.count === want.count));
  if (ok) return { passed: true, message: `找到了：${OVER_LIMIT.map((row) => `${row.name}（${row.count} 本）`).join("、")}。` };
  const hints = [`查出 ${got.length} 位，应该是 ${OVER_LIMIT.length} 位。`];
  if (got.some((row) => row.count === MAX_LOANS)) hints.push(`正好 ${MAX_LOANS} 本没有超过上限。`);
  if (got.some((row) => typeof row.count === "number" && row.count > (currentCounts.get(readers.find((reader) => reader.name === row.name)?.id as number) ?? 0))) hints.push("有人的数字偏大：已经还了的书不该算在“手上借着”里。");
  return { passed: false, message: hints.join("") };
}

// ---------------------------------------------------------------------------
// Ch5 · the reader report
// ---------------------------------------------------------------------------

export const REPORT_BROKEN = "SELECT r.name, COUNT(*) AS loans\nFROM readers r\nJOIN loans l ON l.reader_id = r.id\nGROUP BY r.name;";
export const REPORT = readers.map((row) => ({ id: row.id as number, name: row.name as string, count: loans.filter((loan) => loan.reader_id === row.id).length }));

function gradeReport(result: ResultSet): Graded {
  const idIndex = column(result, "id", "reader_id");
  const countIndex = numbers(result).find((index) => index !== idIndex);
  if (idIndex < 0 || countIndex === undefined) return { passed: false, message: "结果里要有读者编号（id）和借过几本（一个数字）两列：有两位读者同名，只看姓名分不清。" };
  const got = new Map(result.rows.map((row) => [row[idIndex], row[countIndex]]));
  const wrong = REPORT.filter((want) => got.get(want.id) !== want.count);
  if (!wrong.length && result.rows.length === REPORT.length) return { passed: true, message: `${REPORT.length} 位读者一个不少，没借过书的显示 0。` };
  const hints: string[] = [];
  if (result.rows.length < REPORT.length) hints.push(`只有 ${result.rows.length} 行，读者一共 ${REPORT.length} 位：没借过书的读者不见了。`);
  const zero = REPORT.filter((row) => row.count === 0);
  if (zero.some((row) => got.get(row.id) === 1)) hints.push("没借过书的读者显示成了 1：COUNT(*) 数的是行，LEFT JOIN 补出来的那一行也算一行。");
  if (result.rows.length > REPORT.length) hints.push("行数比读者还多：每位读者应该只有一行。");
  if (!hints.length) hints.push(`有 ${wrong.length} 位读者的数字不对。`);
  return { passed: false, message: hints.join("") };
}

export const QUERY_LABS: Record<QueryLabId, { initial: string; grade: (result: ResultSet, sql: string) => Graded }> = {
  overdue: { initial: "SELECT *\nFROM loans\nLIMIT 10;", grade: gradeOverdue },
  latest: { initial: LATEST_BROKEN, grade: (result) => gradeLatest(result) },
  overLimit: { initial: "SELECT *\nFROM readers;", grade: (result) => gradeOverLimit(result) },
  report: { initial: REPORT_BROKEN, grade: (result) => gradeReport(result) },
};

export function gradeQueryLab(id: QueryLabId, sql: string): Graded & { error?: string } {
  const { result, error } = query(libraryDb(), sql);
  if (!result) return { passed: false, message: error ?? "查询出错了。", error };
  return QUERY_LABS[id].grade(result, sql);
}

// ---------------------------------------------------------------------------
// Console labs: statements replayed on a fresh database
// ---------------------------------------------------------------------------

export type ConsoleLabId = "modify" | "transaction" | "incident";

const CONSOLES: Record<ConsoleLabId, () => Db> = { modify: libraryDb, transaction: halfBorrowDb, incident: incidentDb };

export function replayConsole(id: ConsoleLabId, statements: readonly string[]) {
  return replay(CONSOLES[id], statements, HISTORY_MAX);
}

function rows(db: Db, table: string): Row[] {
  return db.tables[table]?.rows ?? [];
}

function sameRows(a: Row[], b: Row[]): boolean {
  const key = (row: Row) => JSON.stringify(Object.keys(row).sort().map((name) => [name, row[name]]));
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

// Ch6 · insert, update, delete ------------------------------------------------

export const NEW_BOOK = { title: "雪国", author: "川端康成", category: "文学", copies: 2 };
export const EMAIL_READER = 9;
export const NEW_EMAIL = "chenxiao@mail.test";
export const TEST_READER = 14;

export function gradeModify(session: Session): Graded {
  const db = committed(session);
  const base = libraryDb();
  const booksNow = rows(db, "books");
  const added = booksNow.filter((row) => !rows(base, "books").some((old) => old.id === row.id));
  const bookOk = added.length === 1 && added[0]!.title === NEW_BOOK.title && added[0]!.author === NEW_BOOK.author && added[0]!.copies === NEW_BOOK.copies && added[0]!.added === TODAY && added[0]!.status === "available";
  const readersNow = rows(db, "readers");
  const emailOk = readersNow.find((row) => row.id === EMAIL_READER)?.email === NEW_EMAIL;
  const othersReaders = readersNow.filter((row) => row.id !== EMAIL_READER && row.id !== TEST_READER);
  const othersOk = sameRows(othersReaders, rows(base, "readers").filter((row) => row.id !== EMAIL_READER && row.id !== TEST_READER));
  const testGone = !readersNow.some((row) => row.id === TEST_READER) && !rows(db, "loans").some((row) => row.reader_id === TEST_READER);
  const loansOk = sameRows(rows(db, "loans").filter((row) => row.reader_id !== TEST_READER), rows(base, "loans").filter((row) => row.reader_id !== TEST_READER));
  const booksOk = sameRows(booksNow.filter((row) => !added.includes(row)), rows(base, "books"));
  const goals: Goal[] = [
    { id: "book", label: "《雪国》上架了：川端康成，文学，2 册，今天上架", ok: bookOk },
    { id: "email", label: "陈晓（9 号）的邮箱改成了新的", ok: emailOk },
    { id: "test", label: "测试用户和他的借阅记录都删掉了", ok: testGone },
    { id: "intact", label: "其他读者、借阅和图书都没被改动", ok: emailOk && testGone && bookOk && othersOk && loansOk && booksOk },
  ];
  const missing = goals.filter((goal) => !goal.ok);
  let message = missing.length ? `还没完成：${missing.map((goal) => goal.label).join("；")}。` : "三件事都做完了，别的数据一行没动。";
  if (!othersOk) message = "别的读者的数据也被改了：UPDATE 或 DELETE 没有写 WHERE，就会作用在整张表上。点“重置数据库”重来一次吧。";
  else if (!loansOk || !booksOk) message = "其他借阅记录或图书被改动了。点“重置数据库”重来一次吧。";
  if (session.snapshot) message += "（还有一个没提交的事务：别人看不到里面的修改，记得 COMMIT。）";
  return { passed: missing.length === 0, message, goals };
}

// Ch7 · transaction ------------------------------------------------------------

export function gradeTransaction(session: Session): Graded {
  const db = committed(session);
  const base = libraryDb();
  const original = rows(base, "books").find((row) => row.id === SANTI)!.copies as number;
  const copies = rows(db, "books").find((row) => row.id === SANTI)?.copies;
  const fresh = rows(db, "loans").filter((row) => !rows(base, "loans").some((old) => old.id === row.id));
  const loanOk = fresh.length === 1 && fresh[0]!.book_id === SANTI && fresh[0]!.reader_id === LILEI && fresh[0]!.borrowed === TODAY && fresh[0]!.due === "2026-11-11" && fresh[0]!.returned === null;
  const othersOk = sameRows(rows(db, "books").filter((row) => row.id !== SANTI), rows(base, "books").filter((row) => row.id !== SANTI)) && sameRows(rows(db, "loans").filter((row) => !fresh.includes(row)), rows(base, "loans"));
  const goals: Goal[] = [
    { id: "loan", label: "李雷借《三体》的记录有了，而且只有一条", ok: loanOk },
    { id: "copies", label: "《三体》的库存对得上：上次失败扣掉的补回来，这次借走的扣掉", ok: loanOk && copies === original - 1 },
    { id: "others", label: "借书完成后，别的书和借阅记录没被改动", ok: loanOk && othersOk },
  ];
  const missing = goals.filter((goal) => !goal.ok);
  let message = missing.length ? `还没完成：${missing.map((goal) => goal.label).join("；")}。` : "数据对上了：一条借阅、少一册库存。";
  if (fresh.length > 1) message = "借阅记录多了：同一次借书插入了不止一行。点“重置数据库”重来一次吧。";
  else if (typeof copies === "number" && copies < original - 1) message = "库存扣多了：失败的那次已经扣过一次，再扣就少了。";
  if (session.snapshot) message = `${session.aborted ? "事务出错后已经中止，" : ""}还有一个没结束的事务：${session.aborted ? "先 ROLLBACK，再重新来" : "COMMIT 之前，别人看不到里面的修改"}。`;
  return { passed: missing.length === 0 && !session.snapshot, message, goals };
}

// Ch8 · repair yesterday's UPDATE ---------------------------------------------

export function gradeIncident(session: Session): Graded {
  const db = committed(session);
  const want = correctLoans();
  const now = rows(db, "loans");
  const sameSet = now.length === want.length && want.every((row) => now.some((other) => other.id === row.id));
  const wrong = want.filter((row) => {
    const other = now.find((item) => item.id === row.id);
    return !other || other.returned !== row.returned;
  });
  const otherColumns = sameSet && want.every((row) => {
    const other = now.find((item) => item.id === row.id)!;
    return ["book_id", "reader_id", "borrowed", "due"].every((name) => other[name] === row[name]);
  });
  const logIntact = sameRows(rows(db, "returns_log"), rows(incidentDb(), "returns_log"));
  const passed = sameSet && wrong.length === 0 && otherColumns && logIntact && !session.snapshot;
  let message = "借阅记录恢复正确了：备份里的都回到了备份时的样子，备份之后真实发生的还书也保住了。";
  if (!sameSet) message = "借阅记录的条数不对：有记录被删掉或多出来了。备份之后新借出的那一笔，备份里是没有的。";
  else if (!otherColumns) message = "借阅记录里除了归还日期，别的列也被改了。";
  else if (!logIntact) message = "returns_log 被改动了：它是排查用的证据，不该动。";
  else if (wrong.length) {
    const realReturns = want.filter((row) => row.returned !== null && wrong.includes(row) && rows(incidentDb(), "returns_log").some((log) => log.loan_id === row.id));
    message = realReturns.length
      ? `还有 ${wrong.length} 条的归还日期不对，其中有备份之后真实发生的还书：备份里它们还没还，直接用备份覆盖就丢了。`
      : `还有 ${wrong.length} 条借阅的归还日期不对。`;
  }
  if (session.snapshot) message = "修复还在一个没提交的事务里：其他连接看不到，记得 COMMIT。";
  return { passed, message };
}

export type ConsoleGrade = (session: Session) => Graded;
export const CONSOLE_GRADERS: Record<ConsoleLabId, ConsoleGrade> = { modify: gradeModify, transaction: gradeTransaction, incident: gradeIncident };

/** Bounds-checked statement history from untrusted input, or null. */
export function parseStatements(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > HISTORY_MAX) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > STATEMENT_MAX) return null;
    out.push(item);
  }
  return out;
}

export function parseSql(value: unknown): string | null {
  return typeof value === "string" && value.length <= LIMITS.sql && value.trim() !== "" ? value : null;
}
