import { describe, expect, it } from "vitest";

import { LATEST, LATEST_BROKEN, OVERDUE, OVER_LIMIT, REPORT, REPORT_BROKEN } from "@/content/courses/sql-basics/simulation/labs";
import { INCIDENT_SQL, libraryDb } from "@/content/courses/sql-basics/simulation/library";
import { execute, newSession, query, replay } from "@/content/courses/sql-basics/simulation/sql";
import {
  validateIncidentLab,
  validateLatestLab,
  validateLimitLab,
  validateModifyLab,
  validateOverdueLab,
  validateReportLab,
  validateTransactionLab,
} from "@/content/courses/sql-basics/validators";

const run = (sql: string) => query(libraryDb(), sql);

describe("sql-basics 模拟数据库", () => {
  it("查询、排序、分组、连接与子查询", () => {
    expect(run("SELECT title FROM books WHERE author = '东野圭吾' ORDER BY added DESC").result!.rows).toEqual([["解忧杂货店"], ["白夜行"]]);
    expect(run("SELECT COUNT(*) FROM loans WHERE returned IS NULL").result!.rows[0]![0]).toBe(27);
    expect(run("SELECT category, COUNT(*) AS n FROM books GROUP BY category HAVING COUNT(*) >= 5 ORDER BY n DESC").result!.rows[0]).toEqual(["文学", 10]);
    expect(run("SELECT r.name FROM readers r LEFT JOIN loans l ON l.reader_id = r.id WHERE l.id IS NULL ORDER BY r.id").result!.rows).toEqual([["冯雪"], ["何平"]]);
    expect(run("SELECT title FROM books WHERE id IN (SELECT book_id FROM loans WHERE reader_id = 6)").result!.rows).toEqual([["解忧杂货店"]]);
    expect(run("SELECT title FROM books WHERE title LIKE '三体%'").result!.rows).toHaveLength(2);
  });

  it("NULL 是三值逻辑：= NULL 什么都查不到，NOT IN 遇到 NULL 也是", () => {
    expect(run("SELECT * FROM loans WHERE returned = NULL").result!.rows).toHaveLength(0);
    expect(run("SELECT * FROM readers WHERE email NOT IN ('x', NULL)").result!.rows).toHaveLength(0);
    expect(run("SELECT COUNT(email), COUNT(*) FROM readers").result!.rows[0]).toEqual([13, 14]);
  });

  it("报错与 PostgreSQL 一致", () => {
    expect(run("SELECT titel FROM books").error).toBe('ERROR:  column "titel" does not exist');
    expect(run("SELECT * FORM books").error).toContain('syntax error at or near "FORM"');
    expect(run("SELECT id FROM books b JOIN loans l ON l.book_id = b.id").error).toContain("ambiguous");
    expect(run("SELECT name, COUNT(*) FROM readers r JOIN loans l ON l.reader_id = r.id GROUP BY r.id").result).toBeDefined();
    expect(run("SELECT l.borrowed, COUNT(*) FROM readers r JOIN loans l ON l.reader_id = r.id GROUP BY r.id").error).toContain("must appear in the GROUP BY clause");
    expect(run("SELECT * FROM readers WHERE COUNT(*) > 1").error).toContain("aggregate functions are not allowed in WHERE");
    expect(run("DELETE FROM books").error).toContain("只运行查询");
    expect(run("SELECT * FROM books, loans, readers, loans l2").error).toContain("查询太大");
  });

  it("约束：外键、非空、检查，以及每条语句的原子性", () => {
    const session = newSession(libraryDb());
    expect(execute(session, "DELETE FROM readers WHERE id = 14")).toMatchObject({ kind: "error" });
    expect(execute(session, "INSERT INTO loans (book_id, reader_id, borrowed, due) VALUES (1, 99, CURRENT_DATE, CURRENT_DATE + 14)")).toMatchObject({ kind: "error" });
    expect(execute(session, "UPDATE books SET copies = copies - 2")).toMatchObject({ kind: "error" });
    expect(session.db.tables.books!.rows.every((row) => (row.copies as number) >= 1)).toBe(true);
    expect(execute(session, "INSERT INTO books (title, author, added) VALUES ('雪国', '川端康成', CURRENT_DATE)")).toEqual({ kind: "message", text: "INSERT 0 1" });
    expect(session.db.tables.books!.rows.at(-1)).toMatchObject({ id: 25, copies: 1, status: "available" });
  });

  it("事务：出错后中止，ROLLBACK 恢复；没提交的修改别人看不到", () => {
    const { session, transcript } = replay(libraryDb, ["BEGIN", "UPDATE books SET copies = 0 WHERE id = 1", "SELECT * FROM nope", "SELECT 1", "COMMIT"]);
    expect(transcript[3]!.outcome).toMatchObject({ kind: "error", text: expect.stringContaining("current transaction is aborted") });
    expect(transcript[4]!.outcome).toEqual({ kind: "message", text: "ROLLBACK" });
    expect(session.db.tables.books!.rows[0]!.copies).toBe(3);
  });
});

describe("sql-basics 服务端验证器", () => {
  it("逾期未还：= NULL 和今天到期都是陷阱", () => {
    const good = "SELECT id FROM loans WHERE returned IS NULL AND due < CURRENT_DATE";
    expect(validateOverdueLab({ sql: good }).passed).toBe(true);
    expect(OVERDUE).toHaveLength(11);
    expect(String(validateOverdueLab({ sql: "SELECT * FROM loans WHERE returned = NULL AND due < '2026-10-28'" }).feedback.message)).toContain("IS NULL");
    expect(String(validateOverdueLab({ sql: "SELECT * FROM loans WHERE returned IS NULL AND due <= CURRENT_DATE" }).feedback.message)).toContain("今天到期");
    expect(validateOverdueLab({ sql: "SELECT * FROM loans WHERE due < '2026-10-28'" }).passed).toBe(false);
    expect(validateOverdueLab({ sql: "SELECT book_id FROM loans WHERE returned IS NULL AND due < CURRENT_DATE" }).passed).toBe(false);
  });

  it("最新上架：要倒序、要排除下架", () => {
    expect(validateLatestLab({ sql: LATEST_BROKEN }).passed).toBe(false);
    expect(validateLatestLab({ sql: "SELECT title FROM books WHERE status = 'available' ORDER BY added DESC LIMIT 5" }).passed).toBe(true);
    expect(LATEST[0]).toBe("我与地坛");
    expect(String(validateLatestLab({ sql: "SELECT title FROM books ORDER BY added DESC LIMIT 5" }).feedback.message)).toContain("下架");
  });

  it("超过上限：只算没还的，用 HAVING", () => {
    const good = "SELECT r.name, COUNT(*) AS n FROM loans l JOIN readers r ON r.id = l.reader_id WHERE l.returned IS NULL GROUP BY r.id HAVING COUNT(*) > 5";
    expect(validateLimitLab({ sql: good }).passed).toBe(true);
    expect(OVER_LIMIT.map((row) => row.name).sort()).toEqual(["孙浩", "李娜"]);
    expect(String(validateLimitLab({ sql: good.replace(" WHERE l.returned IS NULL", "") }).feedback.message)).toContain("还了");
    expect(String(validateLimitLab({ sql: good.replace("> 5", ">= 5") }).feedback.message)).toContain("正好 5 本");
  });

  it("读者报表：LEFT JOIN、COUNT(l.id)、按编号分组", () => {
    expect(validateReportLab({ sql: REPORT_BROKEN }).passed).toBe(false);
    const good = "SELECT r.id, r.name, COUNT(l.id) AS loans FROM readers r LEFT JOIN loans l ON l.reader_id = r.id GROUP BY r.id ORDER BY r.id";
    expect(validateReportLab({ sql: good }).passed).toBe(true);
    expect(REPORT.filter((row) => row.count === 0)).toHaveLength(2);
    expect(String(validateReportLab({ sql: good.replace("COUNT(l.id)", "COUNT(*)") }).feedback.message)).toContain("COUNT(*)");
    expect(String(validateReportLab({ sql: good.replace("LEFT JOIN", "JOIN") }).feedback.message)).toContain("不见了");
  });

  const modify = [
    "INSERT INTO books (title, author, category, added, copies) VALUES ('雪国', '川端康成', '文学', CURRENT_DATE, 2)",
    "UPDATE readers SET email = 'chenxiao@mail.test' WHERE id = 9",
    "DELETE FROM loans WHERE reader_id = 14",
    "DELETE FROM readers WHERE id = 14",
  ];

  it("增删改：UPDATE 忘了 WHERE 会改掉所有人", () => {
    expect(validateModifyLab({ statements: modify }).passed).toBe(true);
    expect(validateModifyLab({ statements: ["DELETE FROM readers WHERE id = 14"] }).passed).toBe(false);
    const careless = [modify[0]!, "UPDATE readers SET email = 'chenxiao@mail.test'", ...modify.slice(2)];
    expect(validateModifyLab({ statements: careless }).passed).toBe(false);
    expect(String(validateModifyLab({ statements: [modify[0]!, "UPDATE readers SET blocked = true", ...modify.slice(1)] }).feedback.message)).toContain("WHERE");
    expect(validateModifyLab({ statements: ["BEGIN", ...modify] }).passed).toBe(false);
    expect(validateModifyLab({ statements: ["BEGIN", ...modify, "COMMIT"] }).passed).toBe(true);
  });

  it("事务：补回上次扣掉的库存，再在一个事务里完成借书", () => {
    const borrow = ["UPDATE books SET copies = copies - 1 WHERE id = 1", "INSERT INTO loans (book_id, reader_id, borrowed, due) VALUES (1, 4, CURRENT_DATE, CURRENT_DATE + 14)"];
    expect(validateTransactionLab({ statements: ["UPDATE books SET copies = copies + 1 WHERE id = 1", "BEGIN", ...borrow, "COMMIT"] }).passed).toBe(true);
    expect(validateTransactionLab({ statements: ["BEGIN", ...borrow, "COMMIT"] }).passed).toBe(false);
    expect(validateTransactionLab({ statements: ["UPDATE books SET copies = copies + 1 WHERE id = 1", "BEGIN", ...borrow] }).passed).toBe(false);
    const aborted = validateTransactionLab({ statements: ["UPDATE books SET copies = 3 WHERE id = 1", "BEGIN", borrow[0]!, borrow[1]!.replace("(1, 4,", "(1, 44,"), borrow[1]!] });
    expect(String(aborted.feedback.message)).toContain("ROLLBACK");
  });

  it("数据事故：用备份恢复，但保住备份之后真实的还书", () => {
    const good = "UPDATE loans SET returned = (SELECT b.returned FROM loans_backup b WHERE b.id = loans.id) WHERE id NOT IN (SELECT loan_id FROM returns_log)";
    expect(validateIncidentLab({ statements: [good] }).passed).toBe(true);
    const naive = "UPDATE loans SET returned = (SELECT b.returned FROM loans_backup b WHERE b.id = loans.id)";
    expect(String(validateIncidentLab({ statements: [naive] }).feedback.message)).toContain("备份之后");
    expect(validateIncidentLab({ statements: ["DELETE FROM returns_log", "DELETE FROM loans", "INSERT INTO loans SELECT * FROM loans_backup"] }).passed).toBe(false);
    expect(validateIncidentLab({ statements: [INCIDENT_SQL] }).passed).toBe(false);
    expect(validateIncidentLab({ statements: ["BEGIN", good] }).passed).toBe(false);
  });

  it("拒绝格式错误、超长或超量的输入", () => {
    expect(validateOverdueLab(null).passed).toBe(false);
    expect(validateOverdueLab({ sql: "x".repeat(3000) }).passed).toBe(false);
    expect(validateModifyLab({ statements: "DELETE FROM books" }).passed).toBe(false);
    expect(validateModifyLab({ statements: Array.from({ length: 41 }, () => "SELECT 1") }).passed).toBe(false);
  });
});
