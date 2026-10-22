"use client";

import * as React from "react";
import { Braces, CheckCircle2, Database, ShieldCheck, XCircle } from "lucide-react";

import { ConceptFrame } from "@/components/education/concept-frame";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning/context";

type Mode = "concat" | "bound";
type InputKind = "normal" | "injected";

export function SqlParameterBinding() {
  const [mode, setMode] = React.useState<Mode>("concat");
  const [inputKind, setInputKind] = React.useState<InputKind>("injected");
  const { sdk } = useLearning();
  const input = inputKind === "normal" ? "alice@example.com" : "' OR '1'='1' --";
  const safe = mode === "bound";

  const steps = [
    {
      title: "数据库先收到语句结构",
      description: safe
        ? "SQL 模板先固定：WHERE email = $1。此时数据库已经把「查询结构」确定下来。"
        : "SQL 文本由代码和用户输入拼成，数据库只有到执行时才第一次看到完整字符串。",
    },
    {
      title: "用户输入作为独立值传输",
      description: safe
        ? "输入值单独发送给数据库，只能填入 $1 这个数据槽位，不能改写 SQL 关键字。"
        : "输入值被直接插入引号之间；其中的引号、OR、注释符都会成为 SQL 文本的一部分。",
    },
    {
      title: "数据库解析并执行",
      description: safe
        ? "解析器先按模板确定语法树，再把参数绑定为值。即使值里包含 ' OR 1=1 --，也只是普通字符串。"
        : "解析器看到被拼接后的完整文本，OR '1'='1' 成为合法条件，-- 注释掉后续内容。",
    },
    {
      title: "结果对比",
      description: safe
        ? "查询只匹配真实存在的邮箱，注入字符串不会返回任何用户。"
        : "查询返回 users 表第一行，登录逻辑可能被绕过。",
    },
  ];

  const scenes = [
    <div key="structure" className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Braces className="size-4" /> {safe ? "固定模板" : "拼接后的 SQL"}
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
{safe
  ? `SELECT id, password_hash\nFROM users\nWHERE email = $1;`
  : `SELECT id, password_hash\nFROM users\nWHERE email = '${input}';`}
        </pre>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">结构 / 值</p>
        <div className="mt-3 space-y-2 font-mono text-xs">
          <div className={safe ? "rounded border border-success/40 bg-success/5 p-2" : "rounded border border-destructive/30 bg-destructive/5 p-2"}>
            {safe ? "structure: SELECT ... WHERE email = $1" : "structure: 与输入混在一起"}
          </div>
          <div className={safe ? "rounded border border-primary/30 bg-primary/5 p-2" : "rounded border border-border bg-muted/40 p-2"}>
            value: {input}
          </div>
        </div>
      </div>
    </div>,
    <div key="value" className="mx-auto max-w-2xl space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">应用发送给数据库</p>
        {safe ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-3 font-mono text-xs">
              <p className="mb-2 text-muted-foreground">SQL</p>
              SELECT ... WHERE email = $1;
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 font-mono text-xs">
              <p className="mb-2 text-muted-foreground">参数数组</p>
              [ {JSON.stringify(input)} ]
            </div>
          </div>
        ) : (
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
{`SELECT id, password_hash\nFROM users\nWHERE email = '${input}';`}
          </pre>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {safe
          ? "结构先到、值后到。数据库不需要从字符串里猜测哪部分是代码、哪部分是数据。"
          : "值和结构在同一条字符串里，数据库无法区分「用户输入的引号」和「SQL 自己的引号」。"}
      </p>
    </div>,
    <div key="parse" className="grid gap-4 sm:grid-cols-2">
      <div className={safe ? "rounded-xl border border-success/40 bg-success/5 p-4" : "rounded-xl border border-destructive/40 bg-destructive/5 p-4"}>
        <p className="flex items-center gap-2 text-sm font-medium">
          {safe ? <ShieldCheck className="size-4" /> : <XCircle className="size-4" />}
          {safe ? "参数绑定" : "字符串拼接"}
        </p>
        <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
          <li>{safe ? "语法树在绑定前已确定" : "语法树根据完整输入构建"}</li>
          <li>{safe ? "输入只能占据数据槽位" : "输入可以产生新的关键字/条件"}</li>
          <li>{safe ? "不依赖转义或黑名单" : "需要不断追赶攻击者的写法"}</li>
        </ul>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Database className="size-4" /> 解析后的查询
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          {safe
            ? "email 的值是一个完整字符串，即使包含引号，也不会结束 SQL 字符串或增加 OR 条件。"
            : "OR '1'='1' 成为查询条件，-- 注释掉后面的引号，用户的输入改变了语句结构。"}
        </p>
      </div>
    </div>,
    <div key="result" className="mx-auto max-w-xl space-y-3">
      <div className={safe ? "rounded-xl border border-success/40 bg-card p-5" : "rounded-xl border border-destructive/40 bg-card p-5"}>
        <p className="flex items-center gap-2 font-medium">
          {safe ? <CheckCircle2 className="size-5 text-success" /> : <XCircle className="size-5 text-destructive" />}
          {safe ? "返回 0 行（安全）" : "返回 users 第一行（可能绕过登录）"}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {safe
            ? "用户输入被当作值，不会命中任何真实邮箱。正常邮箱仍然可以匹配。"
            : "用户输入被当作语法，查询条件恒真。"}
        </p>
      </div>
      <p className="rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
        参数化的本质是<span className="font-medium">结构与值分离</span>，不是「过滤危险字符」。
        结构在绑定参数前就已经固定，输入无法再改变语法。
      </p>
    </div>,
  ];

  function change(nextMode: Mode, nextInput = inputKind) {
    setMode(nextMode);
    setInputKind(nextInput);
    sdk.track("concept_variant_changed", {
      conceptId: "sql.parameter-binding",
      mode: nextMode,
      input: nextInput,
    });
  }

  return (
    <ConceptFrame
      conceptId="sql.parameter-binding"
      blockId="sql-parameter-binding"
      title="参数化查询：固定表格与填空"
      analogy={
        <>
          想象一张结构固定的表格：表头、字段和计算规则都不能改，学生只能把内容填进数据格。
          这对应 SQL 模板先固定结构，用户输入只作为参数填入槽位。类比解释「结构/值分离」，
          不覆盖数据库驱动、预编译协议等实现细节。
        </>
      }
      steps={steps}
      scenes={scenes}
      insight="参数化不是把危险字符过滤掉，而是让用户输入根本没有机会进入 SQL 语法层。"
      mapping={[
        { analogy: "固定表头", real: "SQL 模板 / 语法结构", covers: "查询逻辑由代码决定" },
        { analogy: "填空格", real: "绑定参数（$1）", covers: "用户输入只能作为值" },
        { analogy: "填错内容只影响格子", real: "参数无法改变 SQL 关键字", covers: "结构与值分离" },
        { analogy: "表格设计", real: "数据库解析器/执行计划", covers: "真实解析细节不在类比范围内" },
      ]}
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">处理方式</span>
            <Button type="button" size="sm" variant={mode === "concat" ? "destructive" : "outline"} onClick={() => change("concat")}>
              字符串拼接
            </Button>
            <Button type="button" size="sm" variant={mode === "bound" ? "default" : "outline"} onClick={() => change("bound")}>
              参数化查询
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">输入</span>
            <Button type="button" size="sm" variant={inputKind === "normal" ? "default" : "outline"} onClick={() => change(mode, "normal")}>
              正常邮箱
            </Button>
            <Button type="button" size="sm" variant={inputKind === "injected" ? "destructive" : "outline"} onClick={() => change(mode, "injected")}>
              注入载荷
            </Button>
          </div>
        </div>
      }
    />
  );
}
