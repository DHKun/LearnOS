"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Server, WifiOff } from "lucide-react";

import { ConceptFrame } from "@/components/education/concept-frame";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning/context";

type Fault = "lost" | "timeout" | "success";

export function IdempotencyLostResponse() {
  const [fault, setFault] = React.useState<Fault>("lost");
  const { sdk } = useLearning();
  const lost = fault === "lost";
  const timeout = fault === "timeout";
  const charges = lost ? 2 : 1;
  const receipt = fault === "success" ? "支付成功，订单 #42 已完成" : "客户端没有收到回执";

  const steps = [
    {
      title: "用户点击支付",
      description: "浏览器发送「支付 ¥99」请求。此时业务操作只发生了一次。",
    },
    {
      title: "服务器处理并扣款",
      description: "请求到达支付服务器，服务器完成扣款，并把订单标记为已支付。",
    },
    {
      title: lost ? "回执在网络中丢失" : timeout ? "网关等待回执超时" : "回执成功返回",
      description: lost
        ? "服务器已经扣款，但响应消息丢失。客户端无法区分「没执行」和「执行了但没收到结果」。"
        : timeout
          ? "网关在超时时间内没有拿到响应，向客户端返回超时；服务器侧可能已经成功。"
          : "客户端收到成功回执，用户知道操作已完成，不会盲目重试。",
    },
    {
      title: "用户再次点击支付",
      description: lost || timeout
        ? "用户没有看到结果，重新点击。若没有幂等控制，服务器会把这当作一次全新的业务操作。"
        : "用户看到成功反馈，不会再发起第二次支付。",
    },
    {
      title: "最终扣款结果",
      description: lost
        ? "同一笔业务被扣款两次。问题不在网络「不可靠」本身，而在重复请求没有业务级去重。"
        : timeout
          ? "客户端可能重试，服务器若未去重仍可能重复扣款；超时只能说明结果未知。"
          : "一次业务操作对应一次扣款。",
    },
  ];

  const timeline = [
    { label: "请求 1 → 服务器", status: "已处理" },
    { label: "服务器扣款 ¥99", status: "已执行" },
    {
      label: "响应 1 → 客户端",
      status: fault === "success" ? "已收到" : fault === "lost" ? "丢失" : "超时",
    },
    {
      label: "用户重新点击",
      status: fault === "success" ? "不需要" : "发生",
    },
    {
      label: "请求 2 → 服务器",
      status: fault === "success" ? "—" : "作为新操作处理",
    },
  ];

  const scenes = [
    <div key="pay" className="mx-auto max-w-md rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <CreditCard className="size-6 text-primary" />
        <div>
          <p className="font-medium">订单 #42</p>
          <p className="text-xs text-muted-foreground">商品合计 ¥99</p>
        </div>
      </div>
      <Button className="mt-5 w-full" type="button">支付 ¥99</Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">一次业务操作只应扣款一次</p>
    </div>,
    <div key="server" className="mx-auto max-w-lg rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <Server className="size-6 text-primary" />
        <p className="font-medium">支付服务器</p>
      </div>
      <div className="mt-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
        扣款成功：¥99
        <span className="ml-2 text-xs text-muted-foreground">订单 #42 → paid</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">业务操作已经完成，但客户端还不知道。</p>
    </div>,
    <div key="network" className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">服务器</p>
        <p className="mt-2 text-sm">扣款成功，准备返回回执</p>
      </div>
      <div className="flex flex-col items-center gap-2 text-destructive">
        <WifiOff className="size-6" />
        <ArrowRight className="size-5" />
        <span className="text-xs">{fault === "success" ? "正常返回" : "消息未送达"}</span>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">浏览器</p>
        <p className="mt-2 text-sm">{receipt}</p>
      </div>
    </div>,
    <div key="retry" className="mx-auto max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-6 text-destructive" />
        <p className="font-medium">用户只看到「失败/超时」</p>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        客户端无法知道服务器是否已经扣款。重新点击是合理行为，但服务器必须能识别它和第一次是同一笔业务操作。
      </p>
      <Button className="mt-4" type="button" variant="outline">再次支付</Button>
    </div>,
    <div key="result" className="mx-auto max-w-xl space-y-4">
      <div className={charges === 1 ? "rounded-xl border border-success/40 bg-success/10 p-5" : "rounded-xl border border-destructive/40 bg-destructive/5 p-5"}>
        <p className="flex items-center gap-2 font-medium">
          {charges === 1 ? <CheckCircle2 className="size-5 text-success" /> : <AlertTriangle className="size-5 text-destructive" />}
          实际扣款 {charges} 次
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {charges === 1
            ? "回执成功返回，用户不会重试。"
            : "同一笔业务操作被执行了两次；网络重试放大了未去重的问题。"}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">请求时间线</p>
        <ol className="mt-3 space-y-2 text-xs">
          {timeline.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
              <span>{item.label}</span>
              <span className="text-muted-foreground">{item.status}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>,
  ];

  function change(next: Fault) {
    setFault(next);
    sdk.track("concept_variant_changed", {
      conceptId: "idempotency.lost-response",
      fault: next,
    });
  }

  return (
    <ConceptFrame
      conceptId="idempotency.lost-response"
      blockId="idempotency-lost-response"
      title="支付回执丢失：一次请求为什么扣了两次"
      analogy={
        <>
          付款成功但小票没有打印出来，顾客以为没付成功，又付了一次。类比解释「结果未知导致重试」，
          但真实支付还涉及网关、超时、对账和业务订单状态；这里只确定性地演示重复请求问题。
        </>
      }
      steps={steps}
      scenes={scenes}
      insight="网络超时不等于请求没执行。客户端看不到结果时，重试是合理行为；服务端必须用业务幂等键识别重复。"
      mapping={[
        { analogy: "顾客", real: "用户 / 浏览器", covers: "发起业务操作的一方" },
        { analogy: "付款请求", real: "HTTP 请求", covers: "可能重试、超时、丢失" },
        { analogy: "小票", real: "响应消息", covers: "客户端获知结果的渠道" },
        { analogy: "重复付款", real: "重复副作用（重复扣款）", covers: "没有业务去重时的后果" },
      ]}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">网络结果</span>
          {[
            ["lost", "响应丢失"],
            ["timeout", "网关超时"],
            ["success", "正常回执"],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={fault === value ? "default" : "outline"}
              onClick={() => change(value as Fault)}
            >
              {label}
            </Button>
          ))}
        </div>
      }
    />
  );
}
