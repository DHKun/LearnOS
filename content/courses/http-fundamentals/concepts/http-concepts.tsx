"use client";

import * as React from "react";
import { ConceptFrame, type ConceptStep, type ConceptMapping } from "@/components/education/concept-frame";
import type { ConceptId } from "@/lib/education/concepts";

const prefix="http-fundamentals/";
function Diagram({labels,active,footer}:{labels:string[];active:number;footer:string}) {
  const width=780;
  const cell=width/labels.length;
  return <div className="space-y-3 overflow-x-auto">
    <svg viewBox={`0 0 ${width} 155`} role="img" aria-label={`${footer}，当前步骤 ${active+1}`} className="min-w-[480px] w-full">
      {labels.map((name,i)=>{
        const x=i*cell+cell/2;
        const chosen=i===active;
        return <g key={i}>
          <rect x={i*cell+10} y="30" width={cell-20} height="78" rx="13"
            fill={chosen?"#dbeafe":"#f1f5f9"} stroke={chosen?"#2563eb":"#94a3b8"} strokeWidth={chosen?3:1.3}/>
          <text x={x} y="61" textAnchor="middle" fill={chosen?"#1d4ed8":"#334155"} fontWeight="600" fontSize="17">{name}</text>
          <text x={x} y="86" textAnchor="middle" fill={chosen?"#1d4ed8":"#64748b"} fontSize="12">{i===active?"当前环节":`${i+1} / ${labels.length}`}</text>
          {i<labels.length-1 && <g stroke="#64748b" fill="none" strokeWidth="2"><path d={`M${i*cell+cell-8} 67 h16`}/><path d={`M${i*cell+cell+2} 60 l7 7 -7 7`}/></g>}
        </g>;
      })}
      <text x="390" y="137" fill="#64748b" textAnchor="middle" fontSize="15">{footer}</text>
    </svg>
  </div>;
}
function UrlScene({active}:{active:number}){
 const parts=[{text:"https://",key:"方案"},{text:"api.example.test",key:"主机"},{text:":8443",key:"端口"},{text:"/books/2",key:"路径"},{text:"?page=2",key:"查询"},{text:"#details",key:"片段"}];
 return <div className="space-y-4">
  <div className="flex flex-wrap gap-2">{parts.map((p,i)=><div key={p.key} className={`rounded-xl border p-3 ${i===active?"border-blue-600 bg-blue-50 text-blue-900":"border-slate-200 bg-slate-50 text-slate-700"}`}><div className="text-xs">{p.key}</div><code className="text-sm break-all">{p.text}</code></div>)}</div>
  <p className="text-xs text-muted-foreground">点击下一步，观察 URL 的不同部分。片段不作为 HTTP 请求目标发送。</p>
 </div>;
}
function StatusScene({active}:{active:number}){
 const items=[{code:"1xx",name:"信息"},{code:"2xx",name:"成功"},{code:"3xx",name:"重定向 / 缓存"},{code:"4xx",name:"请求侧问题"},{code:"5xx",name:"服务端问题"}];
 return <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{items.map((p,i)=><div key={p.code} className={`rounded-xl border p-4 text-center ${i===active?"border-blue-600 bg-blue-50 text-blue-900":"border-slate-200 bg-slate-50 text-slate-800"}`}><p className="text-2xl font-bold">{p.code}</p><p className="mt-2 text-xs">{p.name}</p></div>)}</div>;
}
function Concept({id,title,analogy,steps,labels,mapping,insight,scene}:{id:string;title:string;analogy:string;steps:ConceptStep[];labels?:string[];mapping:ConceptMapping[];insight:string;scene?:(i:number)=>React.ReactNode}){
 const scenes=steps.map((_,i)=><div key={i}>{scene?scene(i):<Diagram labels={labels??steps.map(s=>s.title)} active={i} footer="分步解释 · 可播放 / 暂停 / 单步"/>}</div>);
 return <ConceptFrame conceptId={`${prefix}${id}` as ConceptId} blockId={`concept-${id}`} title={title} analogy={analogy} steps={steps} scenes={scenes} mapping={mapping} insight={insight}/>;
}
const mapping=(...items:[string,string,string][]):ConceptMapping[]=>items.map(([analogy,real,covers])=>({analogy,real,covers}));

export function JourneyConcept(){
 const steps=[
  {title:"输入 URL",description:"浏览器先识别 URL 的方案、主机、路径和查询。"},
  {title:"定位与连接",description:"通过 DNS 或缓存获得地址，并建立可用的网络连接。HTTPS 场景还建立 TLS 保护。"},
  {title:"HTTP 请求",description:"浏览器发送请求方法、目标、Header 和可选 Body。"},
  {title:"HTTP 响应",description:"服务器返回状态码、Header 和表示数据。浏览器还可能继续请求其他资源。"},
 ];
 return <Concept id="journey" title="从地址栏到网页的旅程" analogy="寄信要先写地址、找到路线，再把请求送达，最后收到回信。比喻不代表真实网络只有四个节点。" steps={steps} labels={["URL","定位与连接","请求","响应"]} mapping={mapping(["写收件地址","URL","指出目标"],["找到送达路线","DNS / 连接","建立通信路径"],["发信","HTTP Request","表达请求"],["收回信","HTTP Response","表达结果"])} insight="HTTP 负责请求与响应的语义；DNS、传输与 TLS 解决不同层次的问题。"/>;
}
export function UrlConcept(){
 const steps=[
  {title:"Scheme",description:"https 说明使用 HTTPS；它不是域名的一部分。"},
  {title:"Host",description:"主机名帮助定位目标服务，DNS 常参与解析。"},
  {title:"Port",description:"显式端口覆盖默认端口；HTTPS 默认通常为 443。"},
  {title:"Path",description:"路径表示目标资源的层级。并不必然对应磁盘文件。"},
  {title:"Query",description:"? 后的查询数据通常由服务器解释，用于筛选或分页。"},
  {title:"Fragment",description:"# 后的片段通常由浏览器解释，不进入发给服务器的 HTTP 请求目标。"},
 ];
 return <Concept id="url" title="URL 的六个组成部分" analogy="快递单有运送方式、目的地、房间号和附言；但 URL 的片段往往是浏览器自己的定位信息。" steps={steps} scene={i=><UrlScene active={i}/>} mapping={mapping(["运输方式","scheme","使用 HTTP 还是 HTTPS"],["配送地址","host + port","定位目标服务"],["房间号","path","定位资源"],["附言","query","向服务传递参数"],["读者书签","fragment","通常由客户端解释"])} insight="fragment 不进入 HTTP 请求目标；path 与 query 可能影响服务器选取或处理资源。"/>;
}
export function MessageConcept(){
 const steps=[
  {title:"请求方法",description:"GET 表示希望读取目标资源的表述。"},
  {title:"请求目标",description:"/api/books/2 指定要访问的对象。"},
  {title:"请求 Header",description:"Host、Accept 等字段补充说明。"},
  {title:"服务器处理",description:"服务器在模拟路由中查找目标资源并生成结果。"},
  {title:"响应",description:"状态码、响应头和 JSON 正文告诉浏览器处理结果。"},
 ];
 return <Concept id="request" title="理解一条 HTTP 请求和响应" analogy="交一张表单：操作类型、目标、附加说明写在请求里；处理回执写在响应里。" steps={steps} labels={["方法","目标","Header","处理","响应"]} mapping={mapping(["办理动作","Method","声明请求语义"],["办理对象","Request Target","指定资源"],["补充说明","Header","协商与元数据"],["回执状态","Status Code","标识处理结果"])} insight="请求与响应都可以有 Header 和 Body，但并不是每一条消息都必须带正文。"/>;
}
export function StatusConcept(){
 const steps=[
  {title:"1xx 信息性",description:"请求处理过程中的信息性响应，例如 100 Continue。"},
  {title:"2xx 成功",description:"200、201、204 都表示成功但含义不同。"},
  {title:"3xx 进一步操作",description:"包括重定向与条件请求的 304 Not Modified。"},
  {title:"4xx 请求侧情况",description:"401、403、404、405、415 需要不同的排查方式。"},
  {title:"5xx 服务端失败",description:"500、502、503 常表明服务端或网关处理失败。"},
 ];
 return <Concept id="status" title="状态码家族" analogy="办事窗口的回执：正在处理、办理成功、需要去其他窗口、材料问题、窗口系统故障。" steps={steps} scene={i=><StatusScene active={i}/>} mapping={mapping(["办理成功","2xx","处理成功"],["去另一个窗口","3xx","进一步操作或复用缓存"],["材料不符","4xx","请求存在需检查的条件"],["窗口故障","5xx","服务端处理失败"])} insight="看状态码时要结合具体方法、响应头与正文，不要只看首位数字猜全部原因。"/>;
}
export function CookieConcept(){
 const steps=[
  {title:"服务器下发 Cookie",description:"响应里使用 Set-Cookie；浏览器按属性决定是否保存。"},
  {title:"浏览器存储",description:"Path、Secure、SameSite 等约束后续发送；HttpOnly 限制 JS 读取。"},
  {title:"后续请求携带",description:"如果目标 URL 和上下文满足条件，浏览器自动发送 Cookie 请求头。"},
  {title:"服务端校验会话",description:"服务器查询 Session 并检查身份与权限，而不盲信客户端 Cookie 值。"},
 ];
 return <Concept id="cookie" title="Cookie 如何连接两次请求" analogy="会员卡让店员识别先前登记过的客户；服务端仍需要确认卡片有效且该用户有权限。" steps={steps} labels={["Set-Cookie","浏览器保存","Cookie 请求头","校验 Session"]} mapping={mapping(["领取会员卡","Set-Cookie","下发标识"],["妥善保管卡片","浏览器 Cookie Jar","按属性存储"],["下次出示","Cookie","按适用条件自动携带"],["核对会员资格","服务端 Session","确认身份和权限"])} insight="HttpOnly 不是万能安全措施；Cookie 是否发送由浏览器与站点规则决定，服务器仍须验证身份。"/>;
}
export function TlsConcept(){
 const steps=[
  {title:"确定 HTTPS 目标",description:"浏览器识别 https 方案并定位目标服务。"},
  {title:"建立安全连接",description:"TLS 协商密钥并验证服务端证书及主机名。"},
  {title:"发送 HTTP",description:"连接受到保护后，HTTP 请求与响应经安全通道交换。"},
  {title:"检查应用权限",description:"是否允许读取资源仍取决于服务器认证与授权逻辑。"},
 ];
 return <Concept id="tls" title="HTTPS：先保护通道，再交换 HTTP" analogy="在确认收件人并建立有保护的传递通道后，再交付信件。加密不保证收件人处理业务时不出错。" steps={steps} labels={["HTTPS URL","TLS 保护","HTTP 交换","应用授权"]} mapping={mapping(["核实收件人","证书校验","目标身份认证"],["安全传递通道","TLS","机密性与完整性"],["信件内容","HTTP","业务消息"],["办事权限","服务端授权","是否允许操作资源"])} insight="HTTPS 提供传输保护，不会自动修复业务越权、XSS 或 SQL 注入。"/>;
}
export function CacheConcept(){
 const steps=[
  {title:"首次请求",description:"服务器返回 200、正文和 ETag 标识。"},
  {title:"保存表示",description:"缓存存储正文及相关元数据。"},
  {title:"条件请求",description:"客户端在 If-None-Match 中带上之前的 ETag 进行验证。"},
  {title:"服务器返回 304",description:"表示已有缓存版本仍可使用，不再返回完整正文。"},
 ];
 return <Concept id="cache" title="ETag 和 304 条件请求" analogy="你拿旧书的版本号询问有没有新版；没变就继续用手中的书，不必再印一本。" steps={steps} labels={["200 + ETag","保存正文","If-None-Match","304 复用"]} mapping={mapping(["第一次拿书","200 响应","获得表示"],["保存旧版本","缓存","复用资源"],["核对版本号","If-None-Match","条件请求"],["内容未变","304","使用已有缓存"])} insight="304 是一种用于条件请求的响应，不代表服务器出错，也不携带新的完整表示正文。"/>;
}
