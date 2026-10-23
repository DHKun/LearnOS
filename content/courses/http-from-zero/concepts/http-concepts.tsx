"use client";

import * as React from "react";
import { ArrowRight, Cookie, Globe2, Server, Smartphone } from "lucide-react";

import { ConceptFrame } from "@/components/education/concept-frame";
import type { ConceptId } from "@/lib/education/concepts";

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

export function RequestFlow() {
  const steps = [
    {
      title: "浏览器解析地址",
      description: "浏览器把 https://example.test/users/1 拆成协议、主机和路径，准备发起请求。",
    },
    {
      title: "建立连接并发送请求",
      description: "请求行加上 Host 等 Header 被发送到服务器；方法、路径和 Header 共同描述意图。",
    },
    {
      title: "服务器路由与处理",
      description: "服务器根据方法和路径找到处理逻辑，读取数据并组装状态码、Header 和响应体。",
    },
    {
      title: "浏览器接收响应",
      description: "浏览器根据状态码和 Content-Type 决定如何展示；200 表示请求成功。",
    },
  ];
  const scenes = [
    <div key="url" className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <Box title="地址栏">
        <span className="font-mono text-sm">https://example.test/users/1</span>
        <p className="mt-2 text-xs text-muted-foreground">协议 / 主机 / 路径</p>
      </Box>
      <ArrowRight className="mx-auto size-6 text-muted-foreground" />
      <Box title="请求目标">
        <span className="font-mono text-sm">GET /users/1 HTTP/1.1</span>
        <p className="mt-2 text-xs text-muted-foreground">方法 + 路径 + 协议版本</p>
      </Box>
    </div>,
    <div key="send" className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <Box title="浏览器">
        <Smartphone className="mb-2 size-5 text-primary" />
        构造请求并发送
      </Box>
      <ArrowRight className="mx-auto size-6 text-muted-foreground" />
      <Box title="网络">
        <span className="font-mono text-xs">Host: example.test</span>
        <br />
        <span className="font-mono text-xs">Accept: application/json</span>
      </Box>
    </div>,
    <div key="server" className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <Box title="请求">
        <span className="font-mono text-xs">GET /users/1</span>
      </Box>
      <ArrowRight className="mx-auto size-6 text-muted-foreground" />
      <Box title="服务器">
        <Server className="mb-2 size-5 text-primary" />
        匹配路由 → 查询用户 → 组装响应
      </Box>
    </div>,
    <div key="response" className="mx-auto max-w-xl space-y-2">
      <Box title="响应">
        <span className="font-mono text-xs">HTTP/1.1 200 OK</span>
        <br />
        <span className="font-mono text-xs">Content-Type: application/json</span>
        <pre className="mt-2 overflow-x-auto rounded bg-muted/60 p-2 text-xs">{`{"id":1,"name":"小明"}`}</pre>
      </Box>
      <p className="text-xs text-muted-foreground">
        状态码描述结果类别，Header 描述元信息，Body 才是资源本身。
      </p>
    </div>,
  ];
  return (
    <ConceptFrame
      conceptId={"http-from-zero/request-flow" as ConceptId}
      blockId="http-request-flow"
      title="一次 HTTP 请求的旅程"
      analogy={
        <>
          把 HTTP 想成寄信：地址是 URL，信封上的格式（方法/Header）告诉对方要做什么，
          回信里的状态码告诉你是成功、找不到还是别的问题。
        </>
      }
      steps={steps}
      scenes={scenes}
      insight="请求 = 方法 + 目标 + Header（+ 可选 Body）；响应 = 状态码 + Header + Body。"
      mapping={[
        { analogy: "收件地址", real: "URL / 主机 / 路径", covers: "请求要送到哪里" },
        { analogy: "信封格式", real: "方法与 Header", covers: "希望服务器做什么、如何理解 Body" },
        { analogy: "回信", real: "状态码 + Header + Body", covers: "结果、元信息与资源内容" },
      ]}
    />
  );
}

export function UrlAnatomy() {
  const steps = [
    { title: "协议 scheme", description: "http 或 https 决定传输方式与默认端口。" },
    { title: "主机 host", description: "example.test 是服务器地址，浏览器据此建立连接。" },
    { title: "端口 port", description: "http 默认 80，https 默认 443；显式端口会覆盖默认值。" },
    { title: "路径 path", description: "/users/1 标识服务器上的资源。" },
    { title: "查询 query", description: "?page=2&sort=name 是筛选、分页等非层级参数。" },
  ];
  const scenes = [
    <Box key="scheme" title="scheme">
      <span className="font-mono text-sm text-primary">https</span>
      <span className="font-mono text-sm">://example.test/users/1?page=2</span>
    </Box>,
    <Box key="host" title="host">
      <span className="font-mono text-sm">https://</span>
      <span className="rounded bg-primary/10 px-1 font-mono text-sm text-primary">example.test</span>
      <span className="font-mono text-sm">/users/1?page=2</span>
    </Box>,
    <Box key="port" title="port">
      <span className="font-mono text-sm">https://example.test</span>
      <span className="rounded bg-primary/10 px-1 font-mono text-sm text-primary">:8443</span>
      <span className="font-mono text-sm">/users/1</span>
    </Box>,
    <Box key="path" title="path">
      <span className="font-mono text-sm">https://example.test</span>
      <span className="rounded bg-primary/10 px-1 font-mono text-sm text-primary">/users/1</span>
      <span className="font-mono text-sm">?page=2</span>
    </Box>,
    <Box key="query" title="query">
      <span className="font-mono text-sm">https://example.test/users</span>
      <span className="rounded bg-primary/10 px-1 font-mono text-sm text-primary">?page=2&amp;sort=name</span>
    </Box>,
  ];
  return (
    <ConceptFrame
      conceptId={"http-from-zero/url-anatomy" as ConceptId}
      blockId="http-url-anatomy"
      title="URL 的五个部分"
      analogy={
        <>
          URL 像快递面单：运输方式（协议）、收件地址（主机/端口）、房间号（路径）和备注（查询参数）
          各司其职。
        </>
      }
      steps={steps}
      scenes={scenes}
      insight="路径定位资源，查询参数调整表示；它们不是同一种东西。"
      mapping={[
        { analogy: "运输方式", real: "scheme", covers: "协议与默认端口" },
        { analogy: "收件地址", real: "host + port", covers: "服务器定位" },
        { analogy: "房间号", real: "path", covers: "资源层级" },
        { analogy: "备注", real: "query", covers: "筛选/分页等参数" },
      ]}
    />
  );
}

export function HeadersCookies() {
  const steps = [
    {
      title: "登录响应返回 Set-Cookie",
      description: "服务器在响应 Header 中要求浏览器保存会话标识。",
    },
    {
      title: "浏览器保存 Cookie",
      description: "浏览器按 Domain/Path/Expires 等属性保存；HttpOnly 禁止 JS 读取。",
    },
    {
      title: "后续请求自动携带 Cookie",
      description: "请求符合 Domain/Path 时，浏览器自动加上 Cookie Header，服务器据此识别会话。",
    },
    {
      title: "属性决定边界",
      description: "SameSite 限制跨站发送，Secure 只允许 HTTPS，Path 决定哪些请求会带上它。",
    },
  ];
  const scenes = [
    <Box key="set" title="响应 Header">
      <Cookie className="mb-2 size-5 text-primary" />
      <span className="font-mono text-xs">Set-Cookie: session=abc; HttpOnly; SameSite=Lax</span>
    </Box>,
    <Box key="store" title="浏览器 Cookie 存储">
      <span className="font-mono text-xs">session=abc</span>
      <p className="mt-2 text-xs text-muted-foreground">JS 不能读取 HttpOnly Cookie</p>
    </Box>,
    <Box key="send" title="下一次请求">
      <span className="font-mono text-xs">Cookie: session=abc</span>
      <p className="mt-2 text-xs text-muted-foreground">服务器识别同一会话</p>
    </Box>,
    <Box key="scope" title="作用域与安全属性">
      <Globe2 className="mb-2 size-5 text-primary" />
      <p className="text-xs">Path=/account 只匹配该路径；SameSite 控制跨站发送。</p>
    </Box>,
  ];
  return (
    <ConceptFrame
      conceptId={"http-from-zero/headers-cookies" as ConceptId}
      blockId="http-headers-cookies"
      title="Header 与 Cookie：服务器如何记住你"
      analogy={
        <>
          第一次进店拿到会员卡（Set-Cookie），之后每次进店出示会员卡（Cookie Header）。
          HttpOnly 像卡片正面只给店员看，JS 不能翻看。
        </>
      }
      steps={steps}
      scenes={scenes}
      insight="Cookie 是 Header 的一种状态延续；它是否被发送由浏览器按属性与目标 URL 决定。"
      mapping={[
        { analogy: "会员卡", real: "Cookie 值", covers: "会话标识" },
        { analogy: "第一次办卡", real: "Set-Cookie", covers: "服务器下发状态" },
        { analogy: "每次出示", real: "Cookie 请求头", covers: "浏览器自动携带" },
        { analogy: "卡片使用范围", real: "Domain/Path/SameSite/Secure", covers: "发送边界与安全" },
      ]}
    />
  );
}
