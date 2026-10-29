# 数据库与 SQL：读懂网站背后的数据（`sql-basics`）

**版本**：`1.0.0` · **格式**：Manifest `schemaVersion: 3` · **学习路线**：《Web 安全入门》第 1 门（后一门《密码学入门》）

## 设计思路

**一个世界**：library.test 背后的数据库，三张表 `books`（24 本书）、`readers`（14 位读者，其中两位同名）、`loans`（47 次借阅）。今天固定为 2026-10-28，每次借书 14 天后到期，每人同时最多借 5 本。学生以开发的身份查数据、修数据。

**一个比喻**：图书馆的登记簿。表是一本登记簿，行是一条登记，主键是登记编号，外键是“见读者登记簿第几号”，WHERE 是请管理员按条件抄一份清单，UPDATE 是用修正液改，事务是一整套借书手续。

**在路线中的位置**：《Web 安全入门》的地基。《HTTP 实战》里请求的 `/books/7`、《命令行与文件系统》里的 `db.env`，背后都是这个数据库；路线后面的《注入》会回到这里讲 SQL 注入。

## 模拟数据库

`simulation/sql.ts` 是一个确定性的 SQL 子集，前端和服务端校验器共用：

- 类型化的表（整数、文字、日期、真假），主键、外键、非空、唯一和检查约束；自动编号。
- `SELECT`：列与别名、`*` 与 `表.*`、`DISTINCT`、`JOIN` / `LEFT JOIN` / `CROSS JOIN` / 逗号连接、`WHERE`、`GROUP BY` / `HAVING`（按主键分组时同表其他列可直接选）、`ORDER BY`（列、别名、位置，NULL 排序同 PostgreSQL）、`LIMIT` / `OFFSET`、标量子查询与相关子查询、`IN` / `NOT IN` / `EXISTS`。
- 表达式：比较、`AND` / `OR` / `NOT` 的三值逻辑、`IS [NOT] NULL`、`LIKE` / `ILIKE`、`BETWEEN`、算术、`||`、`CURRENT_DATE` 与日期加减天数；函数 `COUNT SUM AVG MIN MAX LOWER UPPER LENGTH COALESCE ROUND ABS`。
- `INSERT`（含 `INSERT … SELECT`）、`UPDATE`（SET 里可以用子查询）、`DELETE`；每条语句原子执行，出错整条撤销。
- `BEGIN` / `COMMIT` / `ROLLBACK`：事务里出错后进入中止状态，`COMMIT` 会变成回滚；判分看的是**已提交**的数据。
- 报错沿用 PostgreSQL 的原文（`column "x" does not exist`、`must appear in the GROUP BY clause`、`violates foreign key constraint`、`current transaction is aborted` 等）。
- 不支持 DDL、`UNION`、`RIGHT` / `FULL JOIN`、`UPDATE … FROM`，遇到时给出中文说明。上限：语句 2000 字符、600 个词法单元、嵌套 24 层、一次查询最多处理 4 万行组合，LIKE 用线性动态规划匹配。

`simulation/library.ts` 是表结构和数据，以及第 7、8 章“出过事”的数据库；`simulation/labs.ts` 是实验和判分规则，期望结果都从数据算出来，不写死。

## 章节

| # | slug | 内容 | 实验工单 | 实验类型 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 01 | `tables` | 表、行、列、类型、NULL、主键、外键 | — | — | 手动 |
| 02 | `select-where` | SELECT、WHERE、比较、LIKE、BETWEEN、NULL 与 IS NULL | 查出逾期未还的借阅 | 写查询，按结果判分 | 实验 + 检查 |
| 03 | `order-limit` | ORDER BY、LIMIT / OFFSET、DISTINCT | 首页“最新上架”显示的是最旧的书 | 修好坏掉的查询 | 实验 |
| 04 | `group-by` | 聚合函数、GROUP BY、HAVING | 找出手上借着超过 5 本的读者 | 写查询，按结果判分 | 实验 + 检查 |
| 05 | `join` | JOIN、LEFT JOIN、别名、COUNT(列) 与 COUNT(*) | 年度读者报表漏人又算错 | 修好坏掉的查询 | 实验 + 检查 |
| 06 | `modify` | INSERT、UPDATE、DELETE、外键约束 | 上新书、改邮箱、删测试账号 | 控制台 + 服务端重放 | 实验 |
| 07 | `transactions` | BEGIN、COMMIT、ROLLBACK、中止、自动提交 | 只成功了一半的借书 | 控制台 + 服务端重放 | 实验 + 检查 |
| 08 | `incident` | 子查询、用备份和日志恢复数据 | 一条漏了 WHERE 的 UPDATE | 综合任务（无实时提示） | 实验 |
| 09 | `final` | 结业测验 | 20 道情景题，80 分及格 | — | 结业测验 |

规模：9 章、8 个概念动画、7 个实验、36 道服务端计分题（结业 20 道）。积分：9 × 10 + 50 = 140。

## 几处刻意的设计

- **第 2 章**：两笔借阅正好今天到期（不算逾期）；`returned = NULL` 一行都查不出来，反馈会点明 IS NULL。
- **第 3 章**：初始查询按上架日期升序；最新上架的书里有一本已下架（`三体（旧版）`）。
- **第 4 章**：张伟历史上借了 11 本但手上只有 2 本；刘洋正好 5 本，不算超过；`WHERE COUNT(*) > 5` 会报错。
- **第 5 章**：初始查询用内连接、`COUNT(*)`、按姓名分组：没借过书的冯雪、何平消失，两位王芳被合成一行 7 本。三处都要改对。
- **第 6 章**：删除测试用户会先被外键拦住；`UPDATE` 漏了 WHERE 会改掉所有人，检查会指出“其他读者的数据也被改了”。
- **第 7 章**：库存已经被失败的那次扣过一次。照着程序再跑一遍会扣两次；事务里插入出错后，事务中止、`COMMIT` 变成回滚；没有 COMMIT 的修改不算数。
- **第 8 章**：备份之后又有一笔新借阅、两次真实还书（记在 `returns_log`），事故之后还有一次真实还书。直接用备份覆盖会把三次还书都抹掉；`DELETE` 再 `INSERT … SELECT` 备份会丢掉新借阅。`returns_log` 被改动也判不通过。

## 判分

| 实验 | 提交内容 | 服务端怎么判 |
| --- | --- | --- |
| 第 2～5 章 | 一条 SELECT | 在全新数据上运行，按要求的列核对结果（第 3 章还核对顺序），失败时针对常见误区给提示 |
| 第 6～8 章 | 语句记录（最多 40 条，每条 1200 字符） | 在全新数据库上重放，只看已提交的数据，逐表核对 |

## 目录

```text
simulation/sql.ts      模拟数据库：词法、语法、求值、约束、事务
simulation/library.ts  表结构、数据和第 7、8 章的事故现场
simulation/labs.ts     各实验的期望结果与判分规则
validators.ts          服务端校验器
activities/labs.tsx    查询实验与控制台实验
concepts/concepts.tsx  八个概念动画
assessments/*.server.json
```

## 测试

```bash
pnpm vitest run tests/unit/sql-basics.test.ts
pnpm test:e2e tests/e2e/sql-basics.spec.ts    # 9 章真实界面闭环，结课并核对 140 积分
```

## 修改须知

判分规则和期望结果写在 `simulation/` 里，平台的冻结检查只看 `validators.ts`，发现不了对它们的修改；改动 `library.ts` 里的任何数据都会改变各章的答案。课程有学习记录后，这些都要按结构性变更处理，发布新 slug。
