"use client";

import * as React from "react";

import { ConceptFrame, type ConceptMapping, type ConceptStep } from "@/components/education/concept-frame";
import { Chip, Node, Segmented } from "@/components/education/scene-kit";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";

const PREFIX = "sql-basics/";
const mapping = (...rows: [string, string, string][]): ConceptMapping[] => rows.map(([analogy, real, covers]) => ({ analogy, real, covers }));

function Concept({
  id,
  title,
  analogy,
  steps,
  scene,
  rows,
  insight,
  controls,
}: {
  id: string;
  title: string;
  analogy: string;
  steps: ConceptStep[];
  scene: (step: number) => React.ReactNode;
  rows: ConceptMapping[];
  insight: string;
  controls?: React.ReactNode;
}) {
  return (
    <ConceptFrame
      conceptId={`${PREFIX}${id}` as ConceptId}
      blockId={`concept-${id}`}
      title={title}
      analogy={analogy}
      steps={steps}
      scenes={steps.map((_, index) => (
        <React.Fragment key="scene">{scene(index)}</React.Fragment>
      ))}
      mapping={rows}
      insight={insight}
      controls={controls}
    />
  );
}

type Tone = "keep" | "drop" | "unknown" | "new" | "changed" | "focus" | undefined;

/** A small table whose rows can be marked kept, dropped, new or changed. */
function Grid({ columns, rows, tones = [], focusColumn, caption }: { columns: string[]; rows: (string | number | null)[][]; tones?: Tone[]; focusColumn?: number; caption?: string }) {
  return (
    <div className="min-w-0 space-y-1">
      {caption && <p className="text-[11px] font-medium text-muted-foreground">{caption}</p>}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="m-0 w-full border-collapse font-mono text-[11px]">
          <thead className="bg-muted">
            <tr>
              {columns.map((name, index) => (
                <th key={name} className={cn("whitespace-nowrap px-2 py-1 text-left font-semibold", index === focusColumn && "bg-primary/15 text-primary")}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className={cn(
                  "border-t border-border/60 motion-safe:transition-colors motion-safe:duration-300",
                  tones[index] === "keep" && "bg-success/10",
                  tones[index] === "drop" && "text-muted-foreground line-through opacity-60",
                  tones[index] === "unknown" && "bg-warning/10 text-muted-foreground",
                  tones[index] === "new" && "bg-success/15",
                  tones[index] === "changed" && "bg-warning/15",
                  tones[index] === "focus" && "bg-primary/10",
                )}
              >
                {row.map((value, column) => (
                  <td key={column} className={cn("whitespace-nowrap px-2 py-1", column === focusColumn && "font-semibold")}>
                    {value === null ? <span className="italic text-muted-foreground">NULL</span> : value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch1 · tables, rows, keys
// ---------------------------------------------------------------------------

export function TableConcept() {
  const steps: ConceptStep[] = [
    { title: "一张表就是一本登记簿", description: "readers 表记读者，每一行是一位读者，每一列是一个栏目：编号、姓名、邮箱。" },
    { title: "主键：每行一个独一无二的编号", description: "id 是主键：不能重复、不能为空。两位读者都叫王芳，靠编号 3 和 11 分清。" },
    { title: "另一本登记簿：loans", description: "借阅表的每一行是一次借书。它不重复抄读者的姓名，只写读者编号 reader_id。" },
    { title: "外键：写着“见读者登记簿第几号”", description: "reader_id 是外键：它必须是 readers 里真实存在的某个 id。数据库会拒绝写一个不存在的编号。" },
  ];
  return (
    <Concept
      id="table"
      title="表、行、列与键"
      analogy="图书馆前台的登记簿：一本记读者，一本记借书。借书登记簿上不抄读者的地址电话，只写“读者编号 3”，要查时翻到读者登记簿第 3 号。"
      steps={steps}
      scene={(step) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Grid
            caption="readers"
            columns={["id", "name", "email"]}
            rows={[
              [1, "张伟", "zhangwei@mail.test"],
              [3, "王芳", "wangfang@mail.test"],
              [11, "王芳", "wangfang2@mail.test"],
            ]}
            focusColumn={step === 1 || step === 3 ? 0 : undefined}
            tones={step === 3 ? [undefined, "focus", undefined] : []}
          />
          {step >= 2 && (
            <Grid
              caption="loans"
              columns={["id", "book_id", "reader_id", "borrowed"]}
              rows={[
                [18, 5, 3, "2026-07-03"],
                [21, 20, 3, "2026-10-19"],
                [45, 1, 11, "2026-10-08"],
              ]}
              focusColumn={step === 3 ? 2 : undefined}
              tones={step === 3 ? ["focus", "focus", undefined] : []}
            />
          )}
          {step === 3 && (
            <div className="sm:col-span-2">
              <Chip tone="success">loans.reader_id = 3 → readers.id = 3：王芳（3 号）的两次借阅</Chip>
            </div>
          )}
        </div>
      )}
      rows={mapping(
        ["一本登记簿", "表（table）", "books、readers、loans"],
        ["一条登记", "行（row）", "一本书、一位读者、一次借阅"],
        ["登记编号", "主键（primary key）", "唯一、不为空"],
        ["“见读者登记簿第 3 号”", "外键（foreign key）", "必须指向真实存在的行"],
      )}
      insight="每样东西只记一次，别处用编号引用它。改读者邮箱只需要改 readers 里的一行，所有借阅记录自动跟着对上。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch2 · WHERE and NULL
// ---------------------------------------------------------------------------

const FILTER_ROWS: (string | null)[][] = [
  ["10", "2026-10-26", null],
  ["11", "2026-11-06", null],
  ["19", "2026-09-24", "2026-09-26"],
  ["41", "2026-10-28", null],
  ["12", "2026-10-16", null],
];

export function WhereConcept() {
  const [condition, setCondition] = React.useState<"isnull" | "eqnull">("isnull");
  const steps: ConceptStep[] = [
    { title: "WHERE 一行一行地问", description: "数据库拿着条件，挨个问每一行：符合吗？" },
    { title: condition === "isnull" ? "returned IS NULL" : "returned = NULL", description: condition === "isnull" ? "IS NULL 专门判断“是不是空”，答案只有是或否。" : "NULL 表示“不知道”。拿任何值和“不知道”比，答案也是“不知道”，连 NULL = NULL 也是。" },
    { title: "AND due < CURRENT_DATE", description: "再看应还日期是不是早于今天（2026-10-28）。今天到期的还不算逾期。" },
    { title: "只留下答案是“是”的行", description: condition === "isnull" ? "两个条件都为“是”的两行留下：这就是逾期未还。" : "“不知道”不算“是”，所以一行都没留下。" },
  ];
  const verdict = (row: (string | null)[], step: number): Tone => {
    const nullOk = condition === "isnull" ? row[2] === null : null;
    if (step === 0) return undefined;
    if (step === 1) return nullOk === null ? "unknown" : nullOk ? "keep" : "drop";
    const dueOk = (row[1] as string) < "2026-10-28";
    if (nullOk === null) return step === 2 ? (dueOk ? "unknown" : "drop") : "drop";
    const result = nullOk && dueOk;
    return result ? "keep" : "drop";
  };
  return (
    <Concept
      id="where"
      title="WHERE 筛选，以及 NULL 的陷阱"
      analogy="请管理员翻登记簿，把“还没还、而且已经过了应还日期”的登记抄一份。还书那一栏是空着的，意思是“还没还”；问“这一栏等于空白吗”，管理员只会说“空白没法比”。"
      steps={steps}
      controls={<Segmented label="条件" value={condition} options={[{ value: "isnull" as const, label: "returned IS NULL" }, { value: "eqnull" as const, label: "returned = NULL" }]} onChange={setCondition} />}
      scene={(step) => (
        <div className="space-y-2">
          <Grid columns={["id", "due", "returned"]} rows={FILTER_ROWS} focusColumn={step === 1 ? 2 : step === 2 ? 1 : undefined} tones={FILTER_ROWS.map((row) => verdict(row, step))} />
          <p className="text-xs text-muted-foreground">
            <span className="mr-2 inline-block size-2.5 rounded-sm bg-success/30 align-middle" /> 是
            <span className="mx-2 inline-block size-2.5 rounded-sm bg-warning/40 align-middle" /> 不知道（NULL）
            <span className="ml-2">划掉：否</span>
          </p>
          {step === 3 && <Chip tone={condition === "isnull" ? "success" : "danger"}>{condition === "isnull" ? "2 行：逾期未还" : "0 行：一条都没查出来"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["抄一份清单", "SELECT … FROM …", "不会改动原登记簿"],
        ["筛选条件", "WHERE", "只留下条件为真的行"],
        ["空着的栏", "NULL", "表示未知或没有，不是 0 也不是空字符串"],
        ["“这栏是空的吗”", "IS NULL / IS NOT NULL", "判断 NULL 只能这么写"],
      )}
      insight="WHERE 只留下条件为“真”的行。NULL 参与的比较结果是“未知”，所以判断空值要用 IS NULL，不能用 = NULL。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch3 · ORDER BY then LIMIT
// ---------------------------------------------------------------------------

const SHELF: [string, string, string][] = [
  ["三体", "2026-01-08", "available"],
  ["基地", "2026-08-06", "available"],
  ["三体（旧版）", "2026-10-01", "withdrawn"],
  ["我与地坛", "2026-10-22", "available"],
  ["被讨厌的勇气", "2026-10-08", "available"],
  ["活着", "2026-01-15", "available"],
];

export function OrderConcept() {
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc");
  const steps: ConceptStep[] = [
    { title: "表里的行没有顺序", description: "不写 ORDER BY，数据库按它方便的顺序给你，今天和明天可能不一样。" },
    { title: "WHERE status = 'available'", description: "先把已经下架的书去掉。" },
    { title: `ORDER BY added${direction === "desc" ? " DESC" : ""}`, description: direction === "desc" ? "DESC 从大到小：日期越新越靠前。" : "不写方向就是 ASC，从小到大：最旧的排在最前面。" },
    { title: "LIMIT 3", description: "排好之后只取前 3 行。顺序决定了留下谁。" },
  ];
  return (
    <Concept
      id="order"
      title="先排序，再截取"
      analogy="新书展示架只放 3 本：先把下架的书拿出去，再按上架日期排好队，最后从队头取 3 本。排队的方向反了，展示架上就全是老书。"
      steps={steps}
      controls={<Segmented label="排序方向" value={direction} options={[{ value: "desc" as const, label: "DESC（新 → 旧）" }, { value: "asc" as const, label: "ASC（默认，旧 → 新）" }]} onChange={setDirection} />}
      scene={(step) => {
        let list = SHELF.map((row) => ({ row, kept: true }));
        if (step >= 1) list = list.map((item) => ({ ...item, kept: item.row[2] === "available" }));
        let ordered = list;
        if (step >= 2) ordered = [...list.filter((item) => item.kept)].sort((a, b) => (direction === "desc" ? (a.row[1] < b.row[1] ? 1 : -1) : a.row[1] < b.row[1] ? -1 : 1));
        const tones: Tone[] = ordered.map((item, index) => (!item.kept ? "drop" : step >= 3 ? (index < 3 ? "keep" : "drop") : undefined));
        return (
          <div className="space-y-2">
            <Grid columns={["title", "added", "status"]} rows={ordered.map((item) => item.row)} tones={tones} focusColumn={step === 1 ? 2 : step >= 2 ? 1 : undefined} />
            {step === 3 && <Chip tone={direction === "desc" ? "success" : "danger"}>{direction === "desc" ? "展示架：最新上架的 3 本" : "展示架：最早上架的 3 本"}</Chip>}
          </div>
        );
      }}
      rows={mapping(
        ["先挑出能上架的", "WHERE", "最先执行"],
        ["排队", "ORDER BY 列 [ASC | DESC]", "默认 ASC，从小到大"],
        ["只取队头几本", "LIMIT n", "排完序之后才截取"],
        ["相同的只要一本", "DISTINCT", "去掉完全重复的行"],
      )}
      insight="LIMIT 取的是排序之后的前几行。想要“最新的”，一定要写 ORDER BY … DESC。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch4 · GROUP BY and HAVING
// ---------------------------------------------------------------------------

const GROUP_LOANS: [string, string | null][] = [
  ["李娜", null],
  ["张伟", "2026-09-10"],
  ["李娜", null],
  ["张伟", null],
  ["刘洋", null],
  ["张伟", "2026-10-09"],
  ["李娜", null],
  ["张伟", "2026-09-26"],
];

export function GroupConcept() {
  const [current, setCurrent] = React.useState<"yes" | "no">("yes");
  const rows = current === "yes" ? GROUP_LOANS.filter((row) => row[1] === null) : GROUP_LOANS;
  const counts = rows.reduce<Record<string, number>>((all, row) => ({ ...all, [row[0]]: (all[row[0]] ?? 0) + 1 }), {});
  const steps: ConceptStep[] = [
    { title: current === "yes" ? "WHERE returned IS NULL" : "不加 WHERE", description: current === "yes" ? "先只留下还没还的借阅。" : "所有借阅都算进去，包括早就还了的。" },
    { title: "GROUP BY 读者", description: "同一位读者的行放进同一个筐。" },
    { title: "COUNT(*)：数一数每个筐", description: "每个筐变成一行：读者，和筐里有几行。" },
    { title: "HAVING COUNT(*) > 2", description: "分好组之后再筛选：只留下数字大于 2 的筐。WHERE 在分组之前执行，用不了 COUNT。" },
  ];
  return (
    <Concept
      id="group"
      title="分组与聚合"
      analogy="把借书登记按读者分进不同的筐，数一数每个筐里有几张，再把“超过 2 张”的筐挑出来。分筐之前挑登记用 WHERE，分好之后挑筐用 HAVING。"
      steps={steps}
      controls={<Segmented label="只算没还的" value={current} options={[{ value: "yes" as const, label: "是" }, { value: "no" as const, label: "否（算上已还的）" }]} onChange={setCurrent} />}
      scene={(step) => (
        <div className="space-y-3">
          {step === 0 && <Grid columns={["读者", "returned"]} rows={GROUP_LOANS} tones={GROUP_LOANS.map((row) => (current === "yes" && row[1] !== null ? "drop" : "keep"))} />}
          {step >= 1 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {Object.entries(counts).map(([name, count]) => {
                const passes = count > 2;
                return (
                  <Node key={name} title={name} tone={step >= 3 ? (passes ? "success" : "danger") : "default"}>
                    {step === 1 ? <p>{Array.from({ length: count }, () => "▮").join(" ")}</p> : <p className="font-mono">COUNT(*) = {count}</p>}
                  </Node>
                );
              })}
            </div>
          )}
          {step === 3 && <Chip tone="success">留下：{Object.entries(counts).filter(([, count]) => count > 2).map(([name]) => name).join("、") || "（没有）"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["分筐", "GROUP BY", "按一列或几列分组"],
        ["数一数、加一加", "COUNT、SUM、AVG、MIN、MAX", "每组算出一个值"],
        ["分筐前挑登记", "WHERE", "不能用聚合函数"],
        ["分筐后挑筐", "HAVING", "可以用聚合函数"],
      )}
      insight="分组之前的筛选写 WHERE，分组之后的筛选写 HAVING。条件写错位置，数出来的就是另一件事。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch5 · JOIN and LEFT JOIN
// ---------------------------------------------------------------------------

export function JoinConcept() {
  const [kind, setKind] = React.useState<"inner" | "left">("left");
  const readers: [number, string][] = [
    [4, "李雷"],
    [6, "赵敏"],
    [12, "冯雪"],
  ];
  const loans: [number, number][] = [
    [22, 4],
    [23, 4],
    [29, 6],
  ];
  const joined: (string | number | null)[][] = readers.flatMap(([id, name]) => {
    const hits = loans.filter((loan) => loan[1] === id);
    if (hits.length) return hits.map((loan) => [id, name, loan[0]]);
    return kind === "left" ? [[id, name, null]] : [];
  });
  const steps: ConceptStep[] = [
    { title: "两本登记簿", description: "readers 里有 3 位读者，loans 里有 3 次借阅。冯雪还没借过书。" },
    { title: `${kind === "left" ? "LEFT JOIN" : "JOIN"} loans ON l.reader_id = r.id`, description: "拿每位读者的编号，去借阅表里找 reader_id 相同的行，每找到一行就拼出一行。李雷借了两次，所以拼出两行。" },
    { title: kind === "left" ? "找不到的也留下" : "找不到的就丢掉", description: kind === "left" ? "LEFT JOIN 保证左边的每一行都在：冯雪拼上一行全是 NULL 的借阅。" : "普通 JOIN 只留下两边都对得上的行：冯雪不见了。" },
    { title: "COUNT(l.id) 还是 COUNT(*)", description: kind === "left" ? "COUNT(*) 数行数，冯雪那一行也算 1；COUNT(l.id) 只数借阅编号不为 NULL 的，冯雪才是 0。" : "冯雪已经不在结果里，再怎么数也数不到她。" },
  ];
  const zero = joined.find((row) => row[2] === null);
  return (
    <Concept
      id="join"
      title="连接两张表"
      analogy="拿着读者登记簿，一个个去借书登记簿里找同一个编号的登记，找到一张就抄一行。JOIN 只抄找到的；LEFT JOIN 连一张都没找到的读者也抄上，借书那几栏空着。"
      steps={steps}
      controls={<Segmented label="连接方式" value={kind} options={[{ value: "left" as const, label: "LEFT JOIN" }, { value: "inner" as const, label: "JOIN" }]} onChange={setKind} />}
      scene={(step) => (
        <div className="space-y-3">
          {step === 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Grid caption="readers r" columns={["id", "name"]} rows={readers} />
              <Grid caption="loans l" columns={["id", "reader_id"]} rows={loans} />
            </div>
          ) : (
            <Grid caption="连接之后" columns={["r.id", "r.name", "l.id"]} rows={joined} tones={joined.map((row) => (row[2] === null ? "unknown" : step >= 1 ? "keep" : undefined))} />
          )}
          {step === 2 && kind === "inner" && <Chip tone="danger">冯雪没有出现在结果里</Chip>}
          {step === 3 && kind === "left" && zero && <Chip tone="warning">冯雪：COUNT(*) = 1，COUNT(l.id) = 0</Chip>}
        </div>
      )}
      rows={mapping(
        ["按编号去另一本里找", "JOIN … ON 条件", "ON 写清楚怎么对应"],
        ["找不到就不抄", "JOIN（INNER JOIN）", "只留两边都匹配的行"],
        ["找不到也抄上", "LEFT JOIN", "右边的列补 NULL"],
        ["数“有几张借书登记”", "COUNT(l.id)", "NULL 不计数"],
      )}
      insight="想要“每一位都在、没有的算 0”，用 LEFT JOIN 加 COUNT(右表的列)。同名的人要按编号分组，不能按姓名。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch6 · UPDATE with and without WHERE
// ---------------------------------------------------------------------------

export function WriteConcept() {
  const [where, setWhere] = React.useState<"yes" | "no">("yes");
  const rows: [number, string, string][] = [
    [8, "周婷", "zhouting@mail.test"],
    [9, "陈晓", "chenxiao@old-mail.test"],
    [10, "吴磊", "wulei@mail.test"],
  ];
  const after = rows.map(([id, name, email]) => [id, name, where === "no" || id === 9 ? "chenxiao@mail.test" : email]);
  const steps: ConceptStep[] = [
    { title: "UPDATE readers SET email = '…'", description: "SET 说要改成什么，WHERE 说改哪几行。" },
    { title: where === "yes" ? "WHERE id = 9" : "（没写 WHERE）", description: where === "yes" ? "只有 id 为 9 的那一行符合条件。" : "没有 WHERE 就是“每一行都改”。" },
    { title: where === "yes" ? "UPDATE 1" : `UPDATE ${rows.length}`, description: where === "yes" ? "数据库回报改了 1 行，正是陈晓。" : "数据库回报改了 3 行：所有读者的邮箱都成了陈晓的。真实的表里是全部读者。" },
  ];
  return (
    <Concept
      id="write"
      title="UPDATE 之前先想好 WHERE"
      analogy="拿修正液改登记簿：“把第 9 号的邮箱改成……”。要是只说“把邮箱改成……”，管理员会把整本登记簿的邮箱栏全改一遍。"
      steps={steps}
      controls={<Segmented label="WHERE" value={where} options={[{ value: "yes" as const, label: "WHERE id = 9" }, { value: "no" as const, label: "忘了写" }]} onChange={setWhere} />}
      scene={(step) => (
        <div className="space-y-2">
          <Grid
            columns={["id", "name", "email"]}
            rows={step >= 2 ? after : rows}
            focusColumn={2}
            tones={rows.map(([id]) => (step === 0 ? undefined : where === "no" || id === 9 ? (step >= 2 ? "changed" : "focus") : undefined))}
          />
          {step === 2 && <Chip tone={where === "yes" ? "success" : "danger"}>{where === "yes" ? "UPDATE 1" : "UPDATE 3：所有人的邮箱都被改了"}</Chip>}
        </div>
      )}
      rows={mapping(
        ["添一条登记", "INSERT INTO … VALUES …", "没写的列用默认值"],
        ["用修正液改", "UPDATE … SET … WHERE …", "WHERE 决定改哪几行"],
        ["撕掉一条登记", "DELETE FROM … WHERE …", "被别的表引用时会被外键拦住"],
        ["先看看会改到谁", "先跑同样 WHERE 的 SELECT", "确认行数再动手"],
      )}
      insight="UPDATE 和 DELETE 不写 WHERE，作用的就是整张表。动手之前，先用同样的 WHERE 跑一次 SELECT，看看会改到哪几行。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch7 · transactions
// ---------------------------------------------------------------------------

export function TransactionConcept() {
  const [second, setSecond] = React.useState<"ok" | "fail">("fail");
  const steps: ConceptStep[] = [
    { title: "BEGIN", description: "开始一个事务：接下来的修改先记在草稿上，别人还看不到。" },
    { title: "UPDATE books SET copies = copies - 1", description: "库存从 3 变成 2，只在你的草稿上。" },
    { title: second === "ok" ? "INSERT INTO loans …（成功）" : "INSERT INTO loans …（出错）", description: second === "ok" ? "借阅记录也写进了草稿。" : "读者编号不存在，插入被外键拒绝。事务进入中止状态，之后的语句都会被拒绝。" },
    { title: second === "ok" ? "COMMIT" : "ROLLBACK", description: second === "ok" ? "两步一起生效：库存少一册，多一条借阅，所有人都看得到。" : "整个草稿作废：库存回到 3，好像什么都没发生。不会留下“扣了库存却没有借阅”的半截数据。" },
  ];
  return (
    <Concept
      id="transaction"
      title="事务：要么都做，要么都不做"
      analogy="办借书手续：先在库存簿上划掉一册，再在借阅簿上登记。手续办到一半出了岔子，就把这一整套手续作废，库存簿上划掉的那一册也恢复，而不是留下一半。"
      steps={steps}
      controls={<Segmented label="第二步" value={second} options={[{ value: "fail" as const, label: "出错" }, { value: "ok" as const, label: "成功" }]} onChange={setSecond} />}
      scene={(step) => {
        const copies = step === 0 ? 3 : step === 3 && second === "fail" ? 3 : 2;
        const loan = step >= 2 && second === "ok";
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Node title="books：《三体》 copies" tone={step === 3 ? (second === "ok" ? "success" : "default") : "default"} active={step === 1}>
              <p className="font-mono text-base">{copies}</p>
              {step >= 1 && step < 3 && <p className="text-muted-foreground">草稿，别人看到的仍是 3</p>}
            </Node>
            <Node title="loans：新的借阅" tone={step === 2 && second === "fail" ? "danger" : step === 3 && second === "ok" ? "success" : "default"} active={step === 2}>
              <p>{loan ? "(1, 4, 2026-10-28, 2026-11-11)" : step >= 2 && second === "fail" ? "ERROR: violates foreign key constraint" : "—"}</p>
            </Node>
            <div className="sm:col-span-2">
              <Chip tone={step === 3 ? "success" : step === 2 && second === "fail" ? "danger" : "default"}>
                {step === 0 ? "事务开始" : step === 3 ? (second === "ok" ? "COMMIT：两步一起生效" : "ROLLBACK：两步一起撤销") : step === 2 && second === "fail" ? "事务已中止：只能 ROLLBACK" : "事务进行中"}
              </Chip>
            </div>
          </div>
        );
      }}
      rows={mapping(
        ["开始办一套手续", "BEGIN", "之后的修改先不对外"],
        ["手续办完，盖章生效", "COMMIT", "所有修改一起生效"],
        ["手续作废", "ROLLBACK", "所有修改一起撤销"],
        ["不开事务", "自动提交", "每条语句各自生效"],
      )}
      insight="几条语句必须一起成功时，放进同一个事务：成功就 COMMIT，出错就 ROLLBACK。忘了 COMMIT，别人永远看不到你的修改。"
    />
  );
}

// ---------------------------------------------------------------------------
// Ch8 · backup plus log
// ---------------------------------------------------------------------------

const TIMELINE = [
  { time: "10-27 03:00", label: "自动备份 loans_backup" },
  { time: "10-27 09:30", label: "新借出第 48 笔（备份里没有）" },
  { time: "10-27 10:12", label: "第 13 笔真的还了（记入 returns_log）" },
  { time: "10-27 17:02", label: "事故：UPDATE 没写 WHERE" },
  { time: "10-28 09:05", label: "第 29 笔真的还了（记入 returns_log）" },
];

export function RestoreConcept() {
  const [how, setHow] = React.useState<"backup" | "both">("both");
  const truth: [number, string | null][] = [
    [7, "2026-07-20"],
    [13, "2026-10-27"],
    [29, "2026-10-28"],
    [30, null],
    [48, null],
  ];
  const backup: Record<number, string | null> = { 7: "2026-07-20", 13: null, 29: null, 30: null };
  const logged: Record<number, string> = { 13: "2026-10-27", 29: "2026-10-28" };
  const restored = truth.map(([id]) => [id, how === "both" && logged[id] ? logged[id]! : (backup[id] ?? null)] as [number, string | null]);
  const steps: ConceptStep[] = [
    { title: "备份是 03:00 的一张快照", description: "备份之后发生的事，备份里都没有：新借出的第 48 笔、两次真实的还书。" },
    { title: "17:02 的事故", description: "所有借阅的 returned 都被写成了 2026-10-27，包括从没还过的。" },
    { title: how === "both" ? "备份 + 日志" : "直接用备份覆盖", description: how === "both" ? "日志里登记过的还书，按日志来；其余的按备份来；备份里没有的，就是还没还。" : "备份之后真实发生的两次还书被抹掉了：第 13、29 笔又变成了“没还”。" },
  ];
  return (
    <Concept
      id="restore"
      title="用备份恢复，别丢掉备份之后的事"
      analogy="登记簿被人一笔划花了。抽屉里有一份今早复印的副本，但复印之后又有人来还过书。只照副本抄回去，这几位读者又会被当成没还书。"
      steps={steps}
      controls={<Segmented label="恢复方式" value={how} options={[{ value: "both" as const, label: "备份 + 日志" }, { value: "backup" as const, label: "只用备份" }]} onChange={setHow} />}
      scene={(step) => (
        <div className="space-y-3">
          <ol className="m-0 grid list-none gap-1 p-0 text-xs">
            {TIMELINE.map((item, index) => (
              <li key={item.time} className={cn("flex gap-2 rounded-md border px-2 py-1", index === 3 && step >= 1 ? "border-destructive/50 bg-destructive/10" : index === 0 ? "border-primary/50 bg-primary/5" : "border-border")}>
                <span className="font-mono text-muted-foreground">{item.time}</span>
                {item.label}
              </li>
            ))}
          </ol>
          {step === 1 && <Grid caption="现在的 loans" columns={["id", "returned"]} rows={truth.map(([id]) => [id, id === 29 ? "2026-10-28" : "2026-10-27"])} tones={truth.map(() => "changed")} />}
          {step === 2 && (
            <Grid
              caption="恢复之后（绿色是对的）"
              columns={["id", "returned", "应该是"]}
              rows={restored.map(([id, value], index) => [id, value, truth[index]![1]])}
              tones={restored.map(([, value], index) => (value === truth[index]![1] ? "keep" : "unknown"))}
            />
          )}
        </div>
      )}
      rows={mapping(
        ["今早的复印件", "备份（loans_backup）", "只到备份那一刻"],
        ["还书登记本", "日志（returns_log）", "记下备份之后发生的事"],
        ["先比对再抄", "先 SELECT 出要改的行", "确认范围再 UPDATE"],
      )}
      insight="备份只能把数据带回备份那一刻。备份之后真实发生的事要从日志里找回来，恢复前先弄清每一行的来源。"
    />
  );
}
