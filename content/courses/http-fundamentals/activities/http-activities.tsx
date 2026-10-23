"use client";

import * as React from "react";
import { ActivitySaveStatus } from "@/components/activities/status";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning/context";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps, LearningState } from "@/lib/learning/types";
import {
  BOOK_ETAG, DEFAULT_COOKIE, DEFAULT_REQUEST, DIAGNOSTICS, METHOD_TASKS,
  METHODS, MISSION_DEFAULT, requestText, responseText, simulateCache,
  simulateCookie, simulateHttp,
  type CookieSettings, type LabRequest, type Method,
} from "../simulation/http";

type SaveState = LearningState & { passed:boolean };
function asObject(v:unknown):Record<string,unknown> {return v && typeof v==="object" && !Array.isArray(v)?v as Record<string,unknown>:{};}
function normRequest(v:unknown,fallback:LabRequest=DEFAULT_REQUEST):LabRequest {
 const r=asObject(v);
 const limited=(k:keyof LabRequest)=>typeof r[k]==="string" ? String(r[k]).slice(0,1000) : fallback[k];
 return {method:METHODS.includes(r.method as Method)?r.method as Method:fallback.method,
   path:limited("path"),accept:limited("accept"),contentType:limited("contentType"),body:limited("body"),cookie:limited("cookie")};
}
function StatusBar({status,error,conflict,reload}:{status:"idle"|"saving"|"saved"|"error"|"conflict";error:string|null;conflict:boolean;reload:()=>void}) {
 return <ActivitySaveStatus status={status} error={error} conflict={conflict} onReload={reload}/>;
}
function Result({passed,message}:{passed:boolean|null;message:string|null}){
 if(!message)return null;
 return <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${passed?"border-emerald-500/40 bg-emerald-500/10":"border-amber-500/40 bg-amber-500/10"}`}>
  <strong>{passed?"服务端验证通过":"尚未通过"}</strong><p className="mt-1">{message}</p>
 </div>;
}
function useSubmit(){
 const {sdk}=useLearning();
 const [pending,setPending]=React.useState(false);
 const [last,setLast]=React.useState<{passed:boolean;message:string}|null>(null);
 async function submit(data:Record<string,unknown>,event:string){
  if(pending)return false;
  setPending(true);
  try {
   const result=await sdk.submit(data);
   const message=typeof result.feedback?.message==="string"?result.feedback.message:result.passed?"通过":"请再检查你的操作";
   setLast({passed:result.passed,message});
   sdk.track(event,{passed:result.passed});
   return result.passed;
  } catch(e){setLast({passed:false,message:e instanceof Error?e.message:"提交失败"});return false;}
  finally{setPending(false);}
 }
 return {submit,pending,last};
}
function Preview({req,empty=false}:{req:LabRequest;empty?:boolean}){
 const resp=simulateHttp(req);
 return <div className="grid gap-3 lg:grid-cols-2">
  <div className="min-w-0"><p className="mb-1 text-xs font-semibold">HTTP 请求</p><pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">{requestText(req)}</pre></div>
  <div className="min-w-0"><p className="mb-1 text-xs font-semibold">模拟响应 · {resp.status} {resp.reason}</p>
   <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">{empty?"点击运行查看模拟结果":responseText(resp)}</pre>
   {!empty&&<p className="mt-2 text-xs text-muted-foreground">{resp.explanation}</p>}
  </div>
 </div>;
}
function ReqFields({id,req,onChange,readOnly,withBody=true,withCookie=false}:{id:string;req:LabRequest;onChange:(next:LabRequest)=>void;readOnly:boolean;withBody?:boolean;withCookie?:boolean}){
 const patch=(part:Partial<LabRequest>)=>{if(!readOnly)onChange({...req,...part});};
 return <div className="grid gap-3">
  <div className="grid gap-3 sm:grid-cols-[8.5rem_1fr]">
   <label className="text-xs font-medium">方法
    <select aria-label={`${id} 请求方法`} disabled={readOnly} value={req.method} onChange={e=>patch({method:e.target.value as Method})}
      className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm">
     {METHODS.map(m=><option key={m}>{m}</option>)}
    </select>
   </label>
   <label className="text-xs font-medium">路径
    <input aria-label={`${id} 请求路径`} disabled={readOnly} value={req.path} onChange={e=>patch({path:e.target.value})}
      className="mt-1 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm" />
   </label>
  </div>
  {withBody&&<div className="grid gap-3 sm:grid-cols-2">
   <label className="text-xs font-medium">Accept（期望的响应类型）
    <select disabled={readOnly} value={req.accept} onChange={e=>patch({accept:e.target.value})}
      className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm">
      <option value="application/json">application/json</option><option value="text/html">text/html</option><option value="">不指定</option>
    </select>
   </label>
   <label className="text-xs font-medium">Content-Type（请求体媒体类型）
    <select disabled={readOnly} value={req.contentType} onChange={e=>patch({contentType:e.target.value})}
      className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm">
      <option value="">不指定</option><option value="application/json">application/json</option><option value="text/plain">text/plain</option>
    </select>
   </label>
   <label className="text-xs font-medium sm:col-span-2">请求 Body（可选）
    <textarea disabled={readOnly} value={req.body} onChange={e=>patch({body:e.target.value})} rows={4}
      className="mt-1 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm" />
   </label>
  </div>}
  {withCookie&&<label className="text-xs font-medium">Cookie Header（教学用假值）
    <select disabled={readOnly} value={req.cookie} onChange={e=>patch({cookie:e.target.value})}
      className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm">
      <option value="">不携带</option><option value="session=learnos-demo">session=learnos-demo</option><option value="session=invalid">session=invalid</option>
    </select>
   </label>}
 </div>;
}

type RequestState = SaveState & {request:LabRequest;ran:boolean};
const REQUEST_INITIAL:RequestState={request:{...DEFAULT_REQUEST,path:"/api/books/99"},ran:false,passed:false};
function normRequestState(v:unknown):RequestState {const o=asObject(v);return {request:normRequest(o.request,REQUEST_INITIAL.request),ran:o.ran===true,passed:o.passed===true};}
export function RequestConsole({readOnly}:ActivityComponentProps){
 const {state,setState,status,error,conflict,reload}=useActivityState<RequestState>(REQUEST_INITIAL,normRequestState);
 const {submit,pending,last}=useSubmit();
 const change=(request:LabRequest)=>setState(s=>({...s,request,ran:false}));
 return <div className="space-y-4" data-testid="http-fundamentals-request">
  <p className="text-sm">目标：让请求返回 <code>GET /api/books/2 → 200 OK</code>。先试错再修正。</p>
  <ReqFields id="请求实验" req={state.request} onChange={change} readOnly={readOnly}/>
  <Button variant="outline" disabled={readOnly} onClick={()=>setState(s=>({...s,ran:true}))}>运行浏览器本地模拟</Button>
  <Preview req={state.request} empty={!state.ran}/>
  <div className="flex flex-wrap items-center justify-between gap-3"><StatusBar status={status} error={error} conflict={conflict} reload={()=>void reload()}/>
   <Button disabled={readOnly||pending||state.passed} onClick={()=>void submit(state.request,"http_request_completed").then(ok=>{if(ok)setState(s=>({...s,passed:true,ran:true}));})}>{state.passed?"已通过":"提交实验结论"}</Button>
  </div><Result passed={last?.passed??null} message={last?.message??null}/>
 </div>;
}

type MapState=SaveState&{answers:Record<string,string>};
const MAP_INITIAL:MapState={answers:{},passed:false};
function normMap(v:unknown):MapState{const o=asObject(v);return {answers:Object.fromEntries(Object.entries(asObject(o.answers)).filter(([,v])=>typeof v==="string")),passed:o.passed===true} as MapState;}
export function MethodMatcher({readOnly}:ActivityComponentProps){
 const {state,setState,status,error,conflict,reload}=useActivityState<MapState>(MAP_INITIAL,normMap);
 const {submit,pending,last}=useSubmit();
 return <div className="space-y-4" data-testid="http-fundamentals-methods">
  <p className="text-sm">四种资源操作如何选择最合适的 HTTP 方法？允许反复修改答案。</p>
  {METHOD_TASKS.map(t=><label key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"><span>{t.description}</span>
    <select aria-label={t.description} disabled={readOnly||state.passed} value={state.answers[t.id]??""} onChange={e=>setState(s=>({...s,answers:{...s.answers,[t.id]:e.target.value}}))} className="rounded-md border border-border bg-background p-2">
     <option value="">请选择方法</option>{METHODS.map(m=><option key={m}>{m}</option>)}
    </select>
   </label>)}
  <StatusBar status={status} error={error} conflict={conflict} reload={()=>void reload()}/>
  <Button disabled={readOnly||pending||state.passed} onClick={()=>void submit({answers:state.answers},"http_methods_completed").then(ok=>{if(ok)setState(s=>({...s,passed:true}));})}>{state.passed?"已通过":"提交匹配结果"}</Button>
  <Result passed={last?.passed??null} message={last?.message??null}/>
 </div>;
}

type JsonState=SaveState&{request:LabRequest;ran:boolean};
const JSON_INITIAL:JsonState={request:{...DEFAULT_REQUEST,method:"POST",path:"/api/notes",contentType:"",body:'{"title":""}'},ran:false,passed:false};
function normJson(v:unknown):JsonState{const o=asObject(v);return {request:normRequest(o.request,JSON_INITIAL.request),ran:o.ran===true,passed:o.passed===true};}
export function JsonConsole({readOnly}:ActivityComponentProps){
 const {state,setState,status,error,conflict,reload}=useActivityState<JsonState>(JSON_INITIAL,normJson);
 const {submit,pending,last}=useSubmit();
 return <div className="space-y-4" data-testid="http-fundamentals-json">
  <p className="text-sm">任务：向 <code>/api/notes</code> 创建一条至少包含非空 <code>title</code> 的 JSON 便签，观察 415 → 400 → 201。</p>
  <ReqFields id="JSON 实验" req={state.request} onChange={r=>setState(s=>({...s,request:r,ran:false}))} readOnly={readOnly}/>
  <Button variant="outline" disabled={readOnly} onClick={()=>setState(s=>({...s,ran:true}))}>运行本地模拟</Button>
  <Preview req={state.request} empty={!state.ran}/>
  <StatusBar status={status} error={error} conflict={conflict} reload={()=>void reload()}/>
  <Button disabled={readOnly||pending||state.passed} onClick={()=>void submit(state.request,"http_json_completed").then(ok=>{if(ok)setState(s=>({...s,passed:true,ran:true}));})}>{state.passed?"已通过":"提交创建结论"}</Button>
  <Result passed={last?.passed??null} message={last?.message??null}/>
 </div>;
}

type CookieState=SaveState&{config:CookieSettings};
const COOKIE_INITIAL:CookieState={config:{...DEFAULT_COOKIE},passed:false};
function normCookie(v:unknown):CookieState{const o=asObject(v),c=asObject(o.config);return {config:{setCookie:c.setCookie===true,secure:c.secure===true,httpOnly:c.httpOnly===true,path:typeof c.path==="string"?c.path.slice(0,80):"/wrong",sameSite:c.sameSite==="None"?"None":c.sameSite==="Strict"?"Strict":"Lax"},passed:o.passed===true};}
export function CookieConsole({readOnly}:ActivityComponentProps){
 const {state,setState,status,error,conflict,reload}=useActivityState<CookieState>(COOKIE_INITIAL,normCookie);
 const {submit,pending,last}=useSubmit();
 const patch=(p:Partial<CookieSettings>)=>setState(s=>({...s,config:{...s.config,...p}}));
 const flow=simulateCookie(state.config);
 return <div className="space-y-4" data-testid="http-fundamentals-cookie">
  <p className="text-sm">设置 Cookie，让它能在同站 HTTPS 请求 <code>/account/profile</code> 时被携带；要求启用 Secure、HttpOnly 和 SameSite=Lax。</p>
  <div className="grid gap-3 sm:grid-cols-2">
   {[{key:"setCookie",label:"服务器发送 Set-Cookie"},{key:"secure",label:"Secure：只经安全传输发送"},{key:"httpOnly",label:"HttpOnly：禁止 JS 读取"}].map(f=><label key={f.key} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
    <input type="checkbox" disabled={readOnly||state.passed} checked={state.config[f.key as "setCookie"|"secure"|"httpOnly"]} onChange={e=>patch({[f.key]:e.target.checked})}/>{f.label}
   </label>)}
   <label className="text-xs">Path
    <select disabled={readOnly||state.passed} value={state.config.path} onChange={e=>patch({path:e.target.value})} className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm">
     <option value="/wrong">/wrong</option><option value="/account">/account</option><option value="/">/</option><option value="/accounting">/accounting</option>
    </select>
   </label>
   <label className="text-xs">SameSite
    <select disabled={readOnly||state.passed} value={state.config.sameSite} onChange={e=>patch({sameSite:e.target.value as CookieSettings["sameSite"]})} className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm">
     <option>Lax</option><option>Strict</option><option>None</option>
    </select>
   </label>
  </div>
  <div className="rounded-lg bg-muted/40 p-3 text-sm"><p className="font-semibold">Set-Cookie（模拟）</p><code className="block overflow-x-auto py-2 text-xs">{flow.setCookie}</code><p className="mt-2 font-semibold">下一次请求</p><code className="block py-2 text-xs">{flow.nextHeader}</code><p className="mt-2 text-muted-foreground">{flow.explanation}</p></div>
  <StatusBar status={status} error={error} conflict={conflict} reload={()=>void reload()}/>
  <Button disabled={readOnly||pending||state.passed} onClick={()=>void submit(state.config,"http_cookie_completed").then(ok=>{if(ok)setState(s=>({...s,passed:true}));})}>{state.passed?"已通过":"验证 Cookie 配置"}</Button>
  <Result passed={last?.passed??null} message={last?.message??null}/>
 </div>;
}

type CacheState=SaveState&{ifNoneMatch:string};
const CACHE_INITIAL:CacheState={ifNoneMatch:"",passed:false};
function normCache(v:unknown):CacheState{const o=asObject(v);return {ifNoneMatch:typeof o.ifNoneMatch==="string"?o.ifNoneMatch.slice(0,100):"",passed:o.passed===true};}
export function CacheConsole({readOnly}:ActivityComponentProps){
 const {state,setState,status,error,conflict,reload}=useActivityState<CacheState>(CACHE_INITIAL,normCache);
 const {submit,pending,last}=useSubmit();
 const first=simulateCache(""); const second=simulateCache(state.ifNoneMatch);
 return <div className="space-y-4" data-testid="http-fundamentals-cache">
  <p className="text-sm">第 1 轮得到 200 和 ETag；第 2 轮把旧 ETag 放进 If-None-Match，观察如何得到 304。</p>
  <div className="rounded-lg border border-border p-3 text-sm"><p className="font-semibold">第一次响应（模拟）</p>
   <pre className="mt-2 max-h-44 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{responseText(first)}</pre>
  </div>
  <label className="block text-sm">第二次请求的 If-None-Match
   <select disabled={readOnly||state.passed} value={state.ifNoneMatch} onChange={e=>setState(s=>({...s,ifNoneMatch:e.target.value}))} className="mt-2 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm">
    <option value="">（不发送）</option><option value='"old-version"'>&quot;old-version&quot;</option><option value={BOOK_ETAG}>{BOOK_ETAG}</option>
   </select>
  </label>
  <div className="rounded-lg border border-border p-3 text-sm"><p className="font-semibold">第二次响应（模拟） · {second.status}</p><pre className="mt-2 max-h-44 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{responseText(second)}</pre><p className="mt-2 text-xs text-muted-foreground">{second.explanation}</p></div>
  <StatusBar status={status} error={error} conflict={conflict} reload={()=>void reload()}/>
  <Button disabled={readOnly||pending||state.passed} onClick={()=>void submit({ifNoneMatch:state.ifNoneMatch},"http_cache_completed").then(ok=>{if(ok)setState(s=>({...s,passed:true}));})}>{state.passed?"已通过":"验证缓存结果"}</Button>
  <Result passed={last?.passed??null} message={last?.message??null}/>
 </div>;
}

export function DiagnosisConsole({readOnly}:ActivityComponentProps){
 const {state,setState,status,error,conflict,reload}=useActivityState<MapState>(MAP_INITIAL,normMap);
 const {submit,pending,last}=useSubmit();
 const reasons=[{value:"path",label:"路径或目标资源不存在"},{value:"media",label:"请求媒体类型不被接受"},{value:"permission",label:"已登录，但缺乏权限"},{value:"connection",label:"域名解析或连接失败"}];
 return <div className="space-y-4" data-testid="http-fundamentals-diagnosis">
  {DIAGNOSTICS.map(s=><div key={s.id} className="space-y-2 rounded-lg border border-border p-3">
   <h4 className="font-semibold">{s.title}</h4><pre className="overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{s.request}{"\n"}{s.response}{"\n"}{s.note}</pre>
   <label className="block text-xs">最可能的原因
    <select disabled={readOnly||state.passed} value={state.answers[s.id]??""} onChange={e=>setState(current=>({...current,answers:{...current.answers,[s.id]:e.target.value}}))} className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm">
     <option value="">请选择</option>{reasons.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
    </select>
   </label>
  </div>)}
  <StatusBar status={status} error={error} conflict={conflict} reload={()=>void reload()}/>
  <Button disabled={readOnly||pending||state.passed} onClick={()=>void submit({answers:state.answers},"http_diagnosis_completed").then(ok=>{if(ok)setState(s=>({...s,passed:true}));})}>{state.passed?"已通过":"提交诊断报告"}</Button>
  <Result passed={last?.passed??null} message={last?.message??null}/>
 </div>;
}

type MissionState=SaveState&{tasks:LabRequest[];ran:boolean[]};
const MISSION_INITIAL:MissionState={tasks:MISSION_DEFAULT.map(r=>({...r})),ran:[false,false,false],passed:false};
function normMission(v:unknown):MissionState {const o=asObject(v),t=Array.isArray(o.tasks)?o.tasks:[];
 return {tasks:MISSION_DEFAULT.map((r,i)=>normRequest(t[i],r)),ran:[0,1,2].map(i=>Array.isArray(o.ran)&&o.ran[i]===true),passed:o.passed===true};}
export function FinalMission({readOnly}:ActivityComponentProps){
 const {state,setState,status,error,conflict,reload}=useActivityState<MissionState>(MISSION_INITIAL,normMission);
 const {submit,pending,last}=useSubmit();
 const tasks=["一、读取 2 号图书（200）","二、POST 创建 JSON 便签（201）","三、使用 Cookie 获取个人资料（200）"];
 function patch(i:number,next:LabRequest){setState(s=>({...s,tasks:s.tasks.map((r,j)=>i===j?next:r),ran:s.ran.map((v,j)=>i===j?false:v)}));}
 return <div className="space-y-5" data-testid="http-fundamentals-mission">
  <p className="text-sm">请分别配置三个模拟请求。先运行观察结果，最后统一提交给服务器验证。</p>
  {state.tasks.map((r,i)=><section key={i} className="space-y-3 rounded-xl border border-border p-4">
   <h4 className="font-semibold">{tasks[i]}</h4>
   <ReqFields id={`综合任务 ${i+1}`} req={r} onChange={n=>patch(i,n)} readOnly={readOnly||state.passed} withCookie={i===2} withBody={i===1}/>
   <Button size="sm" variant="outline" disabled={readOnly||state.passed} onClick={()=>setState(s=>({...s,ran:s.ran.map((v,j)=>j===i?true:v)}))}>运行第 {i+1} 个模拟</Button>
   <Preview req={r} empty={!state.ran[i]}/>
  </section>)}
  <StatusBar status={status} error={error} conflict={conflict} reload={()=>void reload()}/>
  <Button disabled={readOnly||pending||state.passed} onClick={()=>void submit({tasks:state.tasks},"http_final_mission_completed").then(ok=>{if(ok)setState(s=>({...s,passed:true}));})}>{state.passed?"全部任务已完成":"提交全部三个任务"}</Button>
  <Result passed={last?.passed??null} message={last?.message??null}/>
 </div>;
}
