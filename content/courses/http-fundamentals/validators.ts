/** Server-side validators. Never imported by a client component. */
import {
  BOOK_ETAG, METHODS, cookiePathMatches, gradeDiagnosis, gradeMethods, gradeMissions,
  simulateCache, simulateCookie, simulateHttp,
  type CookieSettings, type LabRequest, type Method,
} from "./simulation/http";

type Verdict={passed:boolean;feedback:Record<string,unknown>};
const bad=(message:string):Verdict=>({passed:false,feedback:{message}});
function record(input:unknown):Record<string,unknown>|null {
  return input!==null && typeof input==="object" && !Array.isArray(input) ? input as Record<string,unknown> : null;
}
function str(v:unknown,max=4096):string {
  return typeof v==="string" && v.length<=max ? v : "";
}
function parseRequest(raw:unknown):LabRequest|null {
  const r=record(raw);
  if(!r || !METHODS.includes(r.method as Method) || typeof r.path!=="string" || r.path.length>200 || r.path.length===0) return null;
  if(["accept","contentType","body","cookie"].some(k=>r[k]!==undefined && (typeof r[k]!=="string" || (r[k] as string).length>4096)))return null;
  return {
    method:r.method as Method,path:r.path,
    accept:str(r.accept),contentType:str(r.contentType),body:str(r.body),cookie:str(r.cookie),
  };
}
export function validateRequestConsole(input:unknown):Verdict {
  const r=parseRequest(input);
  if(!r)return bad("请求字段缺失或格式不符合要求。");
  const response=simulateHttp(r);
  const passed=r.method==="GET" && r.path.trim()==="/api/books/2" && response.status===200;
  return {passed,feedback:{status:response.status,message:passed?"已成功读取 2 号图书，200 响应与 JSON 均正确。":"目标是 GET /api/books/2 → 200。请检查方法和路径。"}};
}
function stringMap(input:unknown):Record<string,string> {
  const obj=record(input);if(!obj) return {};
  return Object.fromEntries(Object.entries(obj).filter(([k,v])=>k.length<100 && typeof v==="string" && v.length<100)) as Record<string,string>;
}
export function validateMethodMatcher(input:unknown):Verdict {
  const answers=stringMap(record(input)?.answers);
  const graded=gradeMethods(answers);
  return {passed:graded.passed,feedback:{correct:graded.correct,total:graded.total,message:graded.passed?"四个方法的典型语义匹配正确。":`当前匹配 ${graded.correct}/${graded.total}，再检查读取、创建、替换和删除。`}};
}
export function validateJsonConsole(input:unknown):Verdict {
  const r=parseRequest(input);
  if(!r)return bad("请求格式无效，请填写合法的方法、路径和 Header。");
  const response=simulateHttp(r);
  const passed=r.method==="POST" && r.path.trim()==="/api/notes" && response.status===201;
  return {passed,feedback:{status:response.status,message:passed?"便签创建成功，服务器按教学规则返回 201 Created。":"请检查：POST /api/notes、Content-Type: application/json、合法且带非空 title 的 JSON Body。"}};
}
export function validateCookieConsole(input:unknown):Verdict {
  const raw=record(input);if(!raw)return bad("Cookie 配置无效。");
  if(typeof raw.path!=="string" || raw.path.length>80)return bad("Path 不合法。");
  const config:CookieSettings={setCookie:raw.setCookie===true,secure:raw.secure===true,
    httpOnly:raw.httpOnly===true,
    sameSite:raw.sameSite==="Strict"?"Strict":raw.sameSite==="None"?"None":"Lax",
    path:raw.path};
  const flow=simulateCookie(config);
  const passed=flow.accepted && flow.sent && config.secure && config.httpOnly && config.sameSite==="Lax" &&
    cookiePathMatches(config.path,"/account/profile");
  return {passed,feedback:{sent:flow.sent,message:passed?"配置正确：安全的同站 HTTPS 请求携带了 HttpOnly 会话 Cookie。":"请配置 Set-Cookie、Secure、HttpOnly、SameSite=Lax 和匹配 /account/profile 的 Path。"}};
}
export function validateCacheConsole(input:unknown):Verdict {
  const tag=str(record(input)?.ifNoneMatch,100);
  const response=simulateCache(tag);
  const passed=tag===BOOK_ETAG && response.status===304;
  return {passed,feedback:{status:response.status,message:passed?"304 Not Modified：可以复用先前缓存的表示。":"请从首次 200 响应中找到 ETag，并填入 If-None-Match。"}};
}
export function validateDiagnosisConsole(input:unknown):Verdict {
  const answers=stringMap(record(input)?.answers);
  const graded=gradeDiagnosis(answers);
  return {passed:graded.passed,feedback:{correct:graded.correct,total:graded.total,message:graded.passed?"三类 HTTP 故障原因都已定位。":`已定位 ${graded.correct}/${graded.total} 项，请根据状态码和消息再次排查。`}};
}
export function validateFinalMission(input:unknown):Verdict {
  const tasks=record(input)?.tasks;
  if(!Array.isArray(tasks) || tasks.length!==3)return bad("必须提交三个请求任务。");
  const parsed=tasks.map(parseRequest);
  if(parsed.some(r=>r===null))return bad("至少有一个任务请求格式不正确。");
  const graded=gradeMissions(parsed as LabRequest[]);
  return {passed:graded.passed,feedback:{results:graded.results,passedCount:graded.results.filter(Boolean).length,
    message:graded.passed?"三项综合任务全部通过！":"请完成读取图书、创建 JSON 便签、携带会话 Cookie 获取资料这三项任务。"}};
}
