/**
 * The library.test database: books, readers and loans. Every lab starts
 * from a copy of the same data; some chapters start from a moment where
 * something has already gone wrong.
 */
import { type Db, type Row, type TableDef, cloneDb } from "./sql";

export const TODAY = "2026-10-28";
export const LOAN_DAYS = 14;
export const MAX_LOANS = 5;

const BOOKS_DEF: TableDef = {
  name: "books",
  primaryKey: "id",
  columns: [
    { name: "id", type: "int", serial: true },
    { name: "title", type: "text", notNull: true },
    { name: "author", type: "text", notNull: true },
    { name: "category", type: "text" },
    { name: "added", type: "date", notNull: true },
    { name: "copies", type: "int", notNull: true, defaultValue: 1 },
    { name: "status", type: "text", notNull: true, defaultValue: "available" },
  ],
  checks: [
    { name: "books_copies_check", test: (row) => row.copies === null || (row.copies as number) >= 0 },
    { name: "books_status_check", test: (row) => row.status === "available" || row.status === "withdrawn" },
  ],
};

const READERS_DEF: TableDef = {
  name: "readers",
  primaryKey: "id",
  columns: [
    { name: "id", type: "int", serial: true },
    { name: "name", type: "text", notNull: true },
    { name: "email", type: "text", unique: true },
    { name: "joined", type: "date" },
    { name: "blocked", type: "bool", notNull: true, defaultValue: false },
  ],
};

const LOANS_DEF: TableDef = {
  name: "loans",
  primaryKey: "id",
  columns: [
    { name: "id", type: "int", serial: true },
    { name: "book_id", type: "int", notNull: true },
    { name: "reader_id", type: "int", notNull: true },
    { name: "borrowed", type: "date", notNull: true },
    { name: "due", type: "date", notNull: true },
    { name: "returned", type: "date" },
  ],
  foreignKeys: [
    { column: "book_id", table: "books", name: "loans_book_id_fkey" },
    { column: "reader_id", table: "readers", name: "loans_reader_id_fkey" },
  ],
};

export const SCHEMA: { table: string; columns: string }[] = [
  { table: "books", columns: "id, title, author, category, added（上架日期）, copies（馆藏册数）, status（available / withdrawn）" },
  { table: "readers", columns: "id, name, email, joined（注册日期）, blocked" },
  { table: "loans", columns: "id, book_id → books.id, reader_id → readers.id, borrowed, due（应还日期）, returned（归还日期，没还是 NULL）" },
];

const BOOKS: [string, string, string, string, number, string?][] = [
  ["三体", "刘慈欣", "科幻", "2026-01-08", 3],
  ["活着", "余华", "文学", "2026-01-15", 2],
  ["百年孤独", "加西亚·马尔克斯", "文学", "2026-01-22", 2],
  ["人类简史", "尤瓦尔·赫拉利", "历史", "2026-02-03", 2],
  ["围城", "钱锺书", "文学", "2026-02-11", 1],
  ["平凡的世界", "路遥", "文学", "2026-02-26", 3],
  ["红楼梦", "曹雪芹", "文学", "2026-03-05", 2],
  ["月亮与六便士", "毛姆", "文学", "2026-03-19", 1],
  ["沙丘", "弗兰克·赫伯特", "科幻", "2026-04-02", 2],
  ["时间简史", "史蒂芬·霍金", "科普", "2026-04-16", 1, "withdrawn"],
  ["万历十五年", "黄仁宇", "历史", "2026-05-07", 2],
  ["小王子", "圣埃克苏佩里", "文学", "2026-05-21", 3],
  ["球状闪电", "刘慈欣", "科幻", "2026-06-04", 1],
  ["枪炮、病菌与钢铁", "贾雷德·戴蒙德", "历史", "2026-06-18", 1],
  ["白夜行", "东野圭吾", "推理", "2026-07-02", 2],
  ["解忧杂货店", "东野圭吾", "文学", "2026-07-16", 2],
  ["基地", "阿西莫夫", "科幻", "2026-08-06", 1],
  ["长安的荔枝", "马伯庸", "历史", "2026-08-20", 2],
  ["置身事内", "兰小欢", "经济", "2026-09-03", 1],
  ["你当像鸟飞往你的山", "塔拉·韦斯特弗", "传记", "2026-09-17", 1],
  ["三体（旧版）", "刘慈欣", "科幻", "2026-10-01", 1, "withdrawn"],
  ["被讨厌的勇气", "岸见一郎", "心理", "2026-10-08", 2],
  ["额尔古纳河右岸", "迟子建", "文学", "2026-10-15", 1],
  ["我与地坛", "史铁生", "文学", "2026-10-22", 2],
];

const READERS: [string, string | null, string][] = [
  ["张伟", "zhangwei@mail.test", "2025-11-02"],
  ["李娜", "lina@mail.test", "2025-12-14"],
  ["王芳", "wangfang@mail.test", "2026-01-09"],
  ["李雷", "lilei@mail.test", "2026-01-20"],
  ["刘洋", "liuyang@mail.test", "2026-02-07"],
  ["赵敏", "zhaomin@mail.test", "2026-03-01"],
  ["孙浩", "sunhao@mail.test", "2026-03-22"],
  ["周婷", "zhouting@mail.test", "2026-04-11"],
  ["陈晓", "chenxiao@old-mail.test", "2026-05-05"],
  ["吴磊", "wulei@mail.test", "2026-06-13"],
  ["王芳", "wangfang2@mail.test", "2026-07-08"],
  ["冯雪", "fengxue@mail.test", "2026-08-30"],
  ["何平", null, "2026-09-26"],
  ["测试用户", "test@library.test", "2026-10-02"],
];

/** [reader, book, borrowed, returned]; due is always borrowed + 14 days. */
const LOANS: [number, number, string, string | null][] = [
  // 张伟：借得多，但大多还了
  [1, 2, "2026-06-01", "2026-06-12"],
  [1, 4, "2026-06-15", "2026-06-25"],
  [1, 7, "2026-07-01", "2026-07-20"],
  [1, 11, "2026-07-10", "2026-07-22"],
  [1, 3, "2026-07-28", "2026-08-08"],
  [1, 15, "2026-08-12", "2026-08-30"],
  [1, 18, "2026-09-01", "2026-09-10"],
  [1, 12, "2026-09-15", "2026-09-26"],
  [1, 19, "2026-09-28", "2026-10-09"],
  [1, 22, "2026-10-12", null],
  [1, 24, "2026-10-23", null],
  // 李娜：同时借了 6 本
  [2, 1, "2026-10-02", null],
  [2, 9, "2026-10-05", null],
  [2, 13, "2026-10-16", null],
  [2, 17, "2026-10-18", null],
  [2, 6, "2026-10-20", null],
  [2, 16, "2026-10-21", null],
  // 王芳（3 号）
  [3, 5, "2026-07-03", "2026-07-15"],
  [3, 8, "2026-08-02", "2026-08-25"],
  [3, 12, "2026-09-06", "2026-09-18"],
  [3, 20, "2026-10-19", null],
  // 李雷
  [4, 6, "2026-08-14", "2026-08-27"],
  [4, 11, "2026-09-20", "2026-10-01"],
  // 刘洋：正好 5 本
  [5, 3, "2026-10-06", null],
  [5, 14, "2026-10-09", null],
  [5, 18, "2026-10-17", null],
  [5, 23, "2026-10-24", null],
  [5, 2, "2026-10-26", null],
  // 赵敏
  [6, 16, "2026-10-11", null],
  // 孙浩：同时借了 7 本
  [7, 4, "2026-09-25", null],
  [7, 7, "2026-10-01", null],
  [7, 15, "2026-10-04", null],
  [7, 19, "2026-10-13", null],
  [7, 22, "2026-10-22", null],
  [7, 12, "2026-10-25", null],
  [7, 24, "2026-10-27", null],
  // 周婷：都还了
  [8, 1, "2026-06-20", "2026-07-02"],
  [8, 9, "2026-08-08", "2026-08-30"],
  [8, 15, "2026-09-12", "2026-09-24"],
  // 陈晓
  [9, 11, "2026-09-02", "2026-09-29"],
  [9, 6, "2026-10-14", null],
  // 吴磊
  [10, 2, "2026-10-14", null],
  [10, 20, "2026-10-21", null],
  // 王芳（11 号）
  [11, 8, "2026-09-10", "2026-09-20"],
  [11, 1, "2026-10-08", null],
  [11, 14, "2026-10-23", null],
  // 测试用户
  [14, 3, "2026-10-02", "2026-10-02"],
];

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function booksRows(): Row[] {
  return BOOKS.map(([title, author, category, added, copies, status], index) => ({ id: index + 1, title, author, category, added, copies, status: status ?? "available" }));
}

function readerRows(): Row[] {
  return READERS.map(([name, email, joined], index) => ({ id: index + 1, name, email, joined, blocked: false }));
}

function loanRows(): Row[] {
  return LOANS.map(([reader, book, borrowed, returned], index) => ({ id: index + 1, book_id: book, reader_id: reader, borrowed, due: addDays(borrowed, LOAN_DAYS), returned }));
}

export function libraryDb(): Db {
  return {
    today: TODAY,
    tables: {
      books: { def: BOOKS_DEF, rows: booksRows() },
      readers: { def: READERS_DEF, rows: readerRows() },
      loans: { def: LOANS_DEF, rows: loanRows() },
    },
  };
}

export const BASE = libraryDb();

// Ch7 · a borrow that only half happened ---------------------------------

export const SANTI = 1;
export const LILEI = 4;

export function halfBorrowDb(): Db {
  const db = libraryDb();
  db.tables.books!.rows.find((row) => row.id === SANTI)!.copies = 2;
  return db;
}

// Ch8 · yesterday's UPDATE without WHERE ---------------------------------

const BACKUP_DEF: TableDef = { ...LOANS_DEF, name: "loans_backup", foreignKeys: [] };
const LOG_DEF: TableDef = {
  name: "returns_log",
  primaryKey: "id",
  columns: [
    { name: "id", type: "int", serial: true },
    { name: "loan_id", type: "int", notNull: true },
    { name: "returned", type: "date", notNull: true },
    { name: "logged_at", type: "text", notNull: true },
  ],
  foreignKeys: [{ column: "loan_id", table: "loans", name: "returns_log_loan_id_fkey" }],
};

/** Returns that really happened after the 03:00 backup, oldest first. */
export const REAL_RETURNS: { loan: number; returned: string; at: string }[] = [
  { loan: 13, returned: "2026-10-27", at: "2026-10-27 10:12" },
  { loan: 45, returned: "2026-10-27", at: "2026-10-27 15:40" },
  { loan: 29, returned: "2026-10-28", at: "2026-10-28 09:05" },
];
export const NEW_LOAN = { id: 48, book_id: 11, reader_id: 6, borrowed: "2026-10-27", due: addDays("2026-10-27", LOAN_DAYS), returned: null };
export const INCIDENT_SQL = "UPDATE loans SET returned = '2026-10-27';";

/** What `loans` should look like after a correct repair. */
export function correctLoans(): Row[] {
  const rows = [...loanRows(), { ...NEW_LOAN }];
  for (const item of REAL_RETURNS) rows.find((row) => row.id === item.loan)!.returned = item.returned;
  return rows;
}

export function incidentDb(): Db {
  const db = libraryDb();
  const backup = loanRows();
  const loans: Row[] = [...loanRows(), { ...NEW_LOAN }].map((row) => ({ ...row, returned: "2026-10-27" }));
  loans.find((row) => row.id === 29)!.returned = "2026-10-28";
  db.tables.loans = { def: LOANS_DEF, rows: loans };
  db.tables.loans_backup = { def: BACKUP_DEF, rows: backup };
  db.tables.returns_log = { def: LOG_DEF, rows: REAL_RETURNS.map((item, index) => ({ id: index + 1, loan_id: item.loan, returned: item.returned, logged_at: item.at })) };
  return db;
}

export const INCIDENT_SCHEMA: { table: string; columns: string }[] = [
  ...SCHEMA,
  { table: "loans_backup", columns: "和 loans 一样的列：每天 03:00 自动备份的一份副本" },
  { table: "returns_log", columns: "id, loan_id → loans.id, returned, logged_at：借还系统每次登记还书时写一行" },
];

export { cloneDb };
