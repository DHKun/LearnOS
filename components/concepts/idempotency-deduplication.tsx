"use client";

import * as React from "react";
import { CheckCircle2, Database, KeyRound, RefreshCw, XCircle } from "lucide-react";

import { ConceptFrame } from "@/components/education/concept-frame";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning/context";

type KeyMode = "none" | "new" | "stable";

export function IdempotencyDeduplication() {
  const [keyMode, setKeyMode] = React.useState<KeyMode>("new");
  const [dedupe, setDedupe] = React.useState(false);
  const { sdk } = useLearning();

  const stable = keyMode === "stable";
  const dedupeEffective = stable && dedupe;
  const charges = dedupeEffective ? 1 : 2;
  const suppressed = dedupeEffective ? 1 : 0;
  const key1 = keyMode === "none" ? "—" : stable ? "order-42" : "req-8f31";
  const key2 = keyMode === "stable" ? "order-42" : keyMode === "new" ? "req-b7a2" : "—";

  const steps = [
    {
      title: "创建一次业务操作",
      description: "订单 #42 是业务对象。它需要一个稳定的业务操作标识，而不是每次 HTTP 请求都换一个身份。",
    },
    {
      title: "第一次请求写入去重表",
      description: dedupe
        ? "服务端把幂等键与执行结果写入唯一约束表；重复键会被识别为同一业务操作。"
        : "服务端没有去重表，只执行请求；它无法知道之后的重试是不是同一业务操作。",
    },
    {
      title: "网络重试携带幂等键",
      description: stable
        ? "重试复用同一个键 order-42；请求 ID 可以不同，但业务操作标识不变。"
        : "重试使用新键或没有键，服务端会把它当成新的业务操作。",
    },
    {
      title: "服务端识别并复用结果",
      description: dedupeEffective
        ? "唯一约束命中，第二次请求被抑制，直接返回第一次的结果；实际扣款只有一次。"
        : "没有稳定键 + 去重的组合，第二次请求再次扣款。",
    },
  ];

  const scenes = [
    <div key="op" className="mx-auto max-w-lg rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <KeyRound className="size-6 text-primary" />
        <div>
          <p className="font-medium">业务操作：订单 #42</p>
          <p className="text-xs text-muted-foreground">一次下单，只应产生一次扣款</p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-background p-3 font-mono text-xs">
        幂等键：{key1}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        幂等键标识「这次业务操作」，不是「这次 HTTP 请求」。
      </p>
    </div>,
    <div key="table" className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
        <Database className="size-4" /> 服务端去重表
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2">幂等键</th>
              <th className="px-4 py-2">结果</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="px-4 py-3 font-mono">{key1}</td>
              <td className="px-4 py-3">{dedupe ? "扣款成功，已记录" : "未记录（无去重表）"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        真实实现通常用唯一约束占位，事务内写入结果，避免并发重复执行。
      </p>
    </div>,
    <div key="retry" className="mx-auto max-w-lg space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">客户端重试</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-3 font-mono text-xs">
            request id: req-retry
            <br />
            key: {key2}
          </div>
          <div className="rounded-lg border border-border bg-background p-3 text-xs">
            {stable
              ? "业务操作标识保持不变：服务端能识别为同一操作。"
              : "业务操作标识改变：服务端只能当成新操作。"}
          </div>
        </div>
      </div>
      <div className={dedupeEffective ? "rounded-lg border border-success/40 bg-success/10 p-4 text-sm" : "rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"}>
        {dedupeEffective
          ? "唯一键命中：第二次请求被拦截。"
          : "没有「稳定键 + 去重」组合：第二次请求会再次扣款。"}
      </div>
    </div>,
    <div key="result" className="mx-auto max-w-xl space-y-4">
      <div className={charges === 1 ? "rounded-xl border border-success/40 bg-success/10 p-5" : "rounded-xl border border-destructive/40 bg-destructive/5 p-5"}>
        <p className="flex items-center gap-2 font-medium">
          {charges === 1 ? <CheckCircle2 className="size-5 text-success" /> : <XCircle className="size-5 text-destructive" />}
          实际扣款 {charges} 次 · 抑制 {suppressed} 次
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {charges === 1
            ? "业务操作 ID 稳定，服务端用唯一约束去重，并复用首次结果。"
            : "请求可以重试，但业务操作没有稳定标识，去重无法生效。"}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium">三个概念不要混淆</p>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li>业务操作：订单 #42（只应执行一次）</li>
          <li>请求重试：HTTP 层可能发生多次</li>
          <li>幂等键：把多次重试绑定回同一个业务操作</li>
        </ul>
      </div>
    </div>,
  ];

  function change(nextMode: KeyMode, nextDedupe = dedupe) {
    setKeyMode(nextMode);
    setDedupe(nextDedupe);
    sdk.track("concept_variant_changed", {
      conceptId: "idempotency.deduplication",
      keyMode: nextMode,
      dedupe: nextDedupe,
    });
  }

  return (
    <ConceptFrame
      conceptId="idempotency.deduplication"
      blockId="idempotency-deduplication"
      title="订单号去重：重复请求只执行一次"
      analogy={
        <>
          同一个快递订单号被提交多次，仓库仍然只发货一次；订单号让「多次提交」指向「同一次业务操作」。
          类比解释业务标识与去重，不覆盖数据库约束、并发事务和分布式锁的全部细节。
        </>
      }
      steps={steps}
      scenes={scenes}
      insight="幂等键不是请求 ID，而是业务操作 ID。稳定键 + 服务端唯一约束，才能让重试复用首次结果。"
      mapping={[
        { analogy: "快递订单号", real: "业务幂等键", covers: "标识同一次业务操作" },
        { analogy: "仓库记录表", real: "唯一约束 / 去重表", covers: "识别重复并复用结果" },
        { analogy: "重复提交", real: "网络重试 / 用户重试", covers: "请求可能到达多次" },
        { analogy: "并发入库", real: "事务与唯一约束", covers: "并发时只有一个请求占位" },
      ]}
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">重试键</span>
            {[
              ["none", "不使用键"],
              ["new", "每次新键"],
              ["stable", "复用稳定键"],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={keyMode === value ? "default" : "outline"}
                onClick={() => change(value as KeyMode)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant={dedupe ? "default" : "outline"}
            onClick={() => change(keyMode, !dedupe)}
          >
            <RefreshCw className="size-3.5" />
            {dedupe ? "服务端去重：开" : "服务端去重：关"}
          </Button>
        </div>
      }
    />
  );
}
