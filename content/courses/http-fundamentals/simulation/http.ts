/** Pure, deterministic HTTP teaching model. Never performs network I/O. */
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
export type LabRequest = {
  method: Method;
  path: string;
  accept: string;
  contentType: string;
  body: string;
  cookie: string;
};
export type LabResponse = {
  status: number;
  reason: string;
  headers: Record<string, string>;
  body: string;
  explanation: string;
};
export const DEFAULT_REQUEST: LabRequest = {
  method: "GET", path: "/api/books/2", accept: "application/json",
  contentType: "", body: "", cookie: "",
};
const messages: Record<number, string> = {
  200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently",
  302: "Found", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized",
  403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
  415: "Unsupported Media Type", 500: "Internal Server Error",
};
function res(status: number, headers: Record<string,string>, body: unknown, explanation: string): LabResponse {
  return {status, reason: messages[status] ?? "Unknown", headers,
    body: status === 204 || status === 304 ? "" : typeof body === "string" ? body : JSON.stringify(body, null, 2), explanation};
}
const json = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const BOOK = {id:2,title:"HTTP 入门",author:"LearnOS 教学组",available:true};
export const BOOK_ETAG = '"book-v1"';
export function simulateHttp(input: LabRequest): LabResponse {
  const path = input.path.trim() || "/";
  const method = input.method;
  const [pathname] = path.split("?");
  if (pathname === "/api/books/2") {
    if (method === "GET") return res(200,{...json, etag:BOOK_ETAG},BOOK,"服务器找到了编号为 2 的图书资源。 ");
    if (method === "DELETE") return res(204,{},"","按课程规则，删除成功但响应没有 Body。\n这个模拟器不会改变真实数据。 ");
    return res(405,{allow:"GET, DELETE"},{error:"method_not_allowed"},"这个资源在模拟规则中只允许 GET 和 DELETE。 ");
  }
  if (pathname.startsWith("/api/books/")) return res(404,json,{error:"book_not_found"},"虚拟数据里没有这本书。 ");
  if (pathname === "/api/notes") {
    if (method !== "POST") return res(405,{allow:"POST"},{error:"method_not_allowed"},"创建便签请使用 POST。 ");
    if (!/^application\/json(?:\s*;|\s*$)/i.test(input.contentType.trim()))
      return res(415,json,{error:"unsupported_media_type"},"请求体应标注 Content-Type: application/json。 ");
    let data: unknown;
    try {data=JSON.parse(input.body);} catch {return res(400,json,{error:"invalid_json"},"请求体不是合法 JSON。 ");}
    if (!data || typeof data!=="object" || Array.isArray(data) ||
        typeof (data as {title?:unknown}).title!=="string" ||
        !(data as {title:string}).title.trim())
      return res(400,json,{error:"title_required"},"本课的便签 API 要求非空字符串 title。 ");
    return res(201,{...json,location:"/api/notes/1"},{id:1,title:(data as {title:string}).title.trim()},"创建成功：201 Created。 ");
  }
  if (pathname === "/api/profile" || pathname === "/api/admin/reports") {
    const authorized = input.cookie.split(";").some(part=>part.trim()==="session=learnos-demo");
    if (!authorized) return res(401,{...json,"www-authenticate":'Bearer realm="learnos-demo"'},
      {error:"login_required"},"没有提供有效的教学会话凭据。 ");
    if (pathname === "/api/admin/reports") return res(403,json,{error:"forbidden"},"普通用户已经认证，但没有管理员权限。 ");
    if (method!=="GET") return res(405,{allow:"GET"},{error:"method_not_allowed"},"这里只支持 GET。 ");
    return res(200,json,{id:1,name:"学习者",role:"student"},"虚拟服务器识别了有效的教学 Session。 ");
  }
  if (pathname === "/api/redirect" && method === "GET")
    return res(302,{location:"/api/books/2"},"","302 响应提示浏览器可能需要跳转。 ");
  if (pathname === "/api/crash" && method === "GET")
    return res(500,json,{error:"internal_error"},"模拟了服务器内部错误。 ");
  return res(404,json,{error:"not_found",path:pathname},"没有与这个路径相匹配的模拟路由。 ");
}
export function requestText(r: LabRequest): string {
  const headers=[`Host: api.example.test`];
  if(r.accept.trim()) headers.push(`Accept: ${r.accept.trim()}`);
  if(r.contentType.trim()) headers.push(`Content-Type: ${r.contentType.trim()}`);
  if(r.cookie.trim()) headers.push(`Cookie: ${r.cookie.trim()}`);
  return `${r.method} ${r.path || "/"} HTTP/1.1\n${headers.join("\n")}${r.body ? "\n\n"+r.body : ""}`;
}
export function responseText(r: LabResponse): string {
  const h=Object.entries(r.headers).map(([key,value])=>`${key}: ${value}`).join("\n");
  return `HTTP/1.1 ${r.status} ${r.reason}${h ? "\n"+h : ""}${r.body ? "\n\n"+r.body : ""}`;
}
export const METHOD_TASKS = [
  {id:"read",description:"读取指定的图书",expected:"GET"},
  {id:"create",description:"向集合中创建一条新记录",expected:"POST"},
  {id:"replace",description:"用完整表示替换指定资源",expected:"PUT"},
  {id:"delete",description:"删除指定资源",expected:"DELETE"},
] as const;
export function gradeMethods(answers: Record<string,string>) {
  const correct=METHOD_TASKS.filter(t=>answers[t.id]===t.expected).length;
  return {correct,total:METHOD_TASKS.length,passed:correct===METHOD_TASKS.length};
}
export type CookieSettings={setCookie:boolean;path:string;secure:boolean;httpOnly:boolean;sameSite:"Lax"|"Strict"|"None"};
export const DEFAULT_COOKIE:CookieSettings={setCookie:false,path:"/wrong",secure:false,httpOnly:false,sameSite:"Lax"};
export function cookiePathMatches(cookiePath:string,requestPath:string):boolean {
  const p=cookiePath.startsWith("/")?cookiePath:"/";
  return requestPath===p || (requestPath.startsWith(p) && (p.endsWith("/") || requestPath.charAt(p.length)==="/"));
}
/** Same-site HTTPS navigation to /account/profile only; not a full browser cookie jar. */
export function simulateCookie(c:CookieSettings){
  const accepted=c.setCookie && !(c.sameSite==="None"&&!c.secure);
  const sent=accepted && cookiePathMatches(c.path,"/account/profile");
  const setCookie=c.setCookie?`session=demo-123; Path=${c.path || "/"}${c.secure?"; Secure":""}${c.httpOnly?"; HttpOnly":""}; SameSite=${c.sameSite}`:"(未下发)";
  return {accepted,sent,setCookie,nextHeader:sent?"Cookie: session=demo-123":"(无 Cookie)",
  explanation:!c.setCookie?"服务器没有下发 Set-Cookie。":!accepted?"SameSite=None 在现代浏览器中要求 Secure，本课程模拟为拒绝保存。":!sent?"Cookie Path 不匹配 /account/profile。":"Cookie 被浏览器保存，并在符合条件的同站 HTTPS 请求中发送。"};
}
export function simulateCache(ifNoneMatch:string){
 const matched=ifNoneMatch.trim()===BOOK_ETAG;
 return matched?res(304,{etag:BOOK_ETAG,"cache-control":"no-cache"},"","ETag 匹配，旧表示仍有效，可以复用缓存正文。"):
 res(200,{...json,etag:BOOK_ETAG,"cache-control":"no-cache"},BOOK,"返回完整资源及 ETag；客户端可以保存表示供下一次验证。 ");
}
export const DIAGNOSTICS=[
 {id:"missing",request:"GET /api/books/99",response:"404 Not Found",note:'{"error":"book_not_found"}',answer:"path",title:"为什么找不到书？"},
 {id:"type",request:"POST /api/notes\nContent-Type: text/plain",response:"415 Unsupported Media Type",note:'{"error":"unsupported_media_type"}',answer:"media",title:"为什么不能创建便签？"},
 {id:"role",request:"GET /api/admin/reports\nCookie: session=learnos-demo",response:"403 Forbidden",note:'{"error":"forbidden"}',answer:"permission",title:"为什么登录了还进不去？"},
] as const;
export function gradeDiagnosis(answers:Record<string,string>){
 const correct=DIAGNOSTICS.filter(t=>answers[t.id]===t.answer).length;
 return {correct,total:DIAGNOSTICS.length,passed:correct===DIAGNOSTICS.length};
}
export const MISSION_DEFAULT: LabRequest[]=[
 {...DEFAULT_REQUEST},
 {...DEFAULT_REQUEST,method:"GET",path:"/api/notes",contentType:"",body:""},
 {...DEFAULT_REQUEST,method:"GET",path:"/api/profile",cookie:""},
];
export function gradeMissions(requests:LabRequest[]){
 if(requests.length!==3) return {passed:false,results:[false,false,false]};
 const r=requests.map(simulateHttp);
 const results=[
  requests[0].method==="GET" && requests[0].path.trim()==="/api/books/2" && r[0].status===200,
  requests[1].method==="POST" && requests[1].path.trim()==="/api/notes" && r[1].status===201,
  requests[2].method==="GET" && requests[2].path.trim()==="/api/profile" && r[2].status===200,
 ];
 return {passed:results.every(Boolean),results};
}
