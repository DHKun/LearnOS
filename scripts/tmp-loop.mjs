import fs from "node:fs"; import path from "node:path"; import { chromium } from "@playwright/test";
process.env.LD_LIBRARY_PATH=[path.join(process.cwd(),".pwlibs"),process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"); process.env.FONTCONFIG_FILE=path.join(process.cwd(),".pwlibs/fonts.conf");
const browser=await chromium.launch();
const ctx=await browser.newContext({ignoreHTTPSErrors:true, userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 LearnOS-Test/1.0"});
const page=await ctx.newPage();
page.on("console",m=>{const t=m.text(); if(/Content Security|violates/i.test(t)) console.log("CSP",t.slice(0,220));});
page.on("requestfailed",r=>console.log("FAILED",r.url().slice(0,120),r.failure()?.errorText));
ctx.on("response",async r=>{if(r.status()>=400)console.log("HTTP",r.status(),r.url().slice(0,120));});
await page.goto("http://127.0.0.1:3006/login");
await page.getByRole("button",{name:"使用 FloatCTF 登录"}).click();
await page.waitForTimeout(3000);
console.log("URL", page.url());
if (page.url().startsWith("chrome-error")) { console.log("STOP: tunnel unreachable"); await browser.close(); process.exit(2); }
if(await page.locator('input[name="username"]').count()){
  await page.locator('input[name="username"]').fill("1000000");
  await page.locator('input[name="password"]').fill("testuser");
  await page.getByRole("button",{name:"登录",exact:true}).click();
  await page.waitForTimeout(3500);
  console.log("AFTER LOGIN", page.url());
  console.log("BODY",(await page.locator("body").innerText()).slice(0,250).replace(/\n+/g," | "));
  if(page.url().includes("/oauth/consent")){
    await page.getByRole("button",{name:/允许/}).first().click();
    await page.waitForTimeout(3500);
    console.log("AFTER CONSENT", page.url());
    console.log("BODY",(await page.locator("body").innerText()).slice(0,250).replace(/\n+/g," | "));
  }
}
await browser.close();
