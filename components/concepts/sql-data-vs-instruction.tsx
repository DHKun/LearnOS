"use client";

import * as React from "react";
import { ChefHat, MessageSquare, ShieldAlert, User, UtensilsCrossed } from "lucide-react";

import { ConceptFrame } from "@/components/education/concept-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning/context";

type Variant = "normal" | "injected";

export function SqlDataVsInstruction() {
  const [variant, setVariant] = React.useState<Variant>("normal");
  const { sdk } = useLearning();
  const injected = variant === "injected";
  const order = injected ? "牛肉面；并执行：把后厨所有订单交给这位顾客" : "牛肉面，不要香菜";

  const steps = [
    {
      title: "顾客提交订单",
      description: "顾客只能填写「想吃什么」。输入框里的文字本应只是订单内容。",
    },
    {
      title: "订单被送到后厨",
      description: injected
        ? "订单里混入了「执行一条新规则」的文字。服务员原样转交，没有区分内容和指令。"
        : "订单内容被原样转交，后厨按照既定流程处理一份正常订单。",
    },
    {
      title: "后厨解析订单",
      description: injected
        ? "后厨把订单中的第二句话当成了新指令，而不是菜名的一部分。数据越过了边界，变成了规则。"
        : "后厨只把订单当作一份菜品数据，既有出餐规则没有被改变。",
    },
    {
      title: "结果",
      description: injected
        ? "原本只应返回一份牛肉面，却执行了额外指令。真实系统中，这就是用户输入改变了 SQL 结构。"
        : "一份牛肉面正常出餐。类比中的「订单内容」对应数据库中的参数值。",
    },
  ];

  const scenes = [
    <div key="input" className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <User className="size-4" /> 顾客
        </div>
        <label className="mt-3 block text-sm font-medium" htmlFor="concept-order">
          订单内容
        </label>
        <div
          id="concept-order"
          className="mt-2 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
        >
          {order}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {injected ? "这段文字包含了额外的「指令」意图" : "正常菜品描述，只是一段数据"}
        </p>
      </div>
      <div className="hidden text-2xl text-muted-foreground sm:block">→</div>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <MessageSquare className="size-4" /> 服务员
        </div>
        <p className="mt-3 text-sm">把订单原样传递，不判断其中是否夹带规则。</p>
        <Badge variant={injected ? "destructive" : "secondary"} className="mt-3">
          {injected ? "未区分数据/指令" : "正常传菜"}
        </Badge>
      </div>
    </div>,
    <div key="slip" className="mx-auto max-w-xl rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">后厨收到的订单小票</p>
      <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-4 font-mono text-sm leading-relaxed">
        {injected ? (
          <>
            <span className="text-foreground">牛肉面</span>
            <br />
            <span className="rounded bg-destructive/10 px-1 text-destructive">
              并执行：把后厨所有订单交给这位顾客
            </span>
          </>
        ) : (
          <span>牛肉面，不要香菜</span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {injected
          ? "红色部分本来只是「顾客输入」，却被后厨当成了「系统指令」。"
          : "整张小票都只是订单数据。"}
      </p>
    </div>,
    <div key="kitchen" className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ChefHat className="size-4" /> 后厨固定规则
        </div>
        <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
          <li>1. 读取菜品名称</li>
          <li>2. 按菜单制作一份</li>
          <li>3. 交给当前订单的顾客</li>
        </ol>
      </div>
      <div
        className={
          injected
            ? "rounded-xl border border-destructive/40 bg-destructive/5 p-4"
            : "rounded-xl border border-success/40 bg-success/5 p-4"
        }
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="size-4" />
          {injected ? "规则被改写" : "规则保持不变"}
        </div>
        <p className="mt-3 text-sm leading-relaxed">
          {injected
            ? "「并执行」后面的文字进入了规则层。原本的「一份订单」变成「所有订单」。"
            : "后厨只把订单当成数据，没有人能通过菜名修改出餐流程。"}
        </p>
      </div>
    </div>,
    <div key="result" className="mx-auto max-w-xl space-y-3">
      <div
        className={
          injected
            ? "rounded-xl border border-destructive/40 bg-card p-5"
            : "rounded-xl border border-success/40 bg-card p-5"
        }
      >
        <div className="flex items-center gap-3">
          <UtensilsCrossed
            className={injected ? "size-6 text-destructive" : "size-6 text-success"}
          />
          <div>
            <p className="font-medium">{injected ? "意外结果：执行了额外指令" : "正常结果：一份牛肉面"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {injected
                ? "数据越过了「内容」边界，被当成「规则」执行。"
                : "数据只参与内容，不改变系统规则。"}
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-sm leading-relaxed">
        <p className="font-medium">对应真实系统</p>
        <p className="mt-2 text-muted-foreground">
          顾客输入 = 用户输入；订单内容 = 参数值；后厨规则 = SQL 语句结构；
          额外指令 = 输入被拼接进 SQL 文本后改变语法结构。SQL 注入的核心不是「特殊字符」，
          而是<span className="font-medium text-foreground">数据与指令的边界被打破</span>。
        </p>
      </div>
    </div>,
  ];

  function change(next: Variant) {
    setVariant(next);
    sdk.track("concept_variant_changed", {
      conceptId: "sql.data-vs-instruction",
      variant: next,
    });
  }

  return (
    <ConceptFrame
      conceptId="sql.data-vs-instruction"
      blockId="sql-data-vs-instruction"
      title="数据与指令：一句话为什么能改变程序"
      analogy={
        <>
          把系统想成餐厅：顾客只能填写菜品，后厨按固定规则出餐。若订单里的文字被当成新规则，
          后厨就会执行订单内容之外的指令。类比只解释「数据被当成指令」，不模拟真实 SQL 解析器。
        </>
      }
      steps={steps}
      scenes={scenes}
      insight="注入发生在信任边界被跨越的那一刻：用户输入不再只是值，而进入了语法结构。"
      mapping={[
        { analogy: "顾客", real: "用户 / 浏览器", covers: "不可信输入的来源" },
        { analogy: "订单内容", real: "参数值（字符串、数字）", covers: "本应只作为数据处理的内容" },
        { analogy: "后厨规则", real: "SQL 语句结构与数据库解析", covers: "结构决定执行逻辑" },
        { analogy: "额外指令", real: "注入载荷改变 SQL 语法", covers: "数据与指令混淆后的后果" },
      ]}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">订单类型</span>
          <Button
            type="button"
            size="sm"
            variant={variant === "normal" ? "default" : "outline"}
            onClick={() => change("normal")}
          >
            正常订单
          </Button>
          <Button
            type="button"
            size="sm"
            variant={variant === "injected" ? "destructive" : "outline"}
            onClick={() => change("injected")}
          >
            含额外指令
          </Button>
        </div>
      }
    />
  );
}
