const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('bw_prefs',JSON.stringify({music:false,reduceMotion:true}));localStorage.setItem('bw_seen3','1')});
await page.goto('http://127.0.0.1:3012');await page.locator('#ngGo').click();await page.waitForFunction(()=>window.__bw?.S?.mode==='combined');await page.locator('.overlay .x').click().catch(()=>{});
const scan=async()=>{const text=await page.locator('body').innerText();assert(!/[\u3400-\u9fff]/.test(text),text);assert(!text.includes('${'),text);assert(!text.includes('£'),text);assert(!text.includes('undefined'),text);const attrs=await page.locator('[title],[aria-label]').evaluateAll(es=>es.map(e=>(e.title||'')+(e.getAttribute('aria-label')||'')).join(' '));assert(!/[\u3400-\u9fff]/.test(attrs),attrs)};
await scan();assert.equal(await page.evaluate(()=>window.__bw.B?.cities?.length||document.querySelectorAll('#cityList button').length),80);
await page.locator('#actlist .act').first().click();await page.locator('#btnGo').click();await page.waitForFunction(()=>window.__bw.S.round===2&&!window.__bw.UI.busy);await scan();
await page.locator('.pl.me').click();await scan();await page.locator('.overlay .x').click();
await page.locator('#btnHelp').click();await scan();await page.locator('.overlay .x').click();
await page.locator('#btnLog').click();await scan();await page.locator('#logClose').click();
await page.screenshot({path:'../../outputs/combined-desktop.png'});
await page.reload();await page.waitForFunction(()=>window.__bw?.S?.round===2);await scan();
for(const width of [768,390]){await page.setViewportSize({width,height:844});await page.waitForTimeout(250);await scan();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`)}
await page.screenshot({path:'../../outputs/combined-mobile.png'});
// Complete through the real HTTP API, then verify the final UI.
for(let r=2;r<=8;r++){const result=await page.evaluate(async()=>{const s=window.__bw.S;const a=s.actions.find(a=>a.kind==='NETWORK')||s.actions[0];return fetch(a?'/api/action':'/api/pass',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({v:s.ver,i:a?.i})}).then(r=>r.json())});assert(!result.error,result.error);await page.reload();await page.waitForFunction(()=>window.__bw?.S?.started);await scan()}
assert(await page.evaluate(()=>window.__bw.S.over));await page.waitForSelector('#final');await scan();assert.deepEqual(errors,[]);await browser.close();console.log('PASS full 8-round browser game, English, placeholders, restore, help, tiles, desktop/tablet/mobile and final scores');})().catch(e=>{console.error(e);process.exit(1)});
