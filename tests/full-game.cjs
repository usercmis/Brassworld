/* Disposable end-to-end game: pass player turns while the remote AI plays both eras. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],unknown=[],messages=new Set();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.text().startsWith('Untranslated game message:'))unknown.push(m.text())});
 page.on('response',async r=>{
  if(!/\/api\/(new|action|pass|load)$/.test(r.url()))return;
  try{const s=await r.json();const walk=x=>{if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')Object.entries(x).forEach(([k,v])=>{if(k!=='save')walk(v)});else if(typeof x==='string'&&/[\u3400-\u9fff]/.test(x))messages.add(x)};walk(s)}catch{}
 });
 await page.addInitScript(()=>{
  localStorage.setItem('bw_prefs',JSON.stringify({step:false,speed:0.01,music:false,level:'easy',follow:false}));localStorage.setItem('bw_seen3','1');
  window.__visibleChinese=[];
  addEventListener('DOMContentLoaded',()=>{
   // Observe visible output at every DOM update, including transient AI feeds and notifications.
   const check=()=>{
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    while(n=walker.nextNode()){
     const p=n.parentElement;
     if(!p||p.closest('script,style')||!/[\u3400-\u9fff]/.test(n.data))continue;
     if(p.getClientRects().length&&getComputedStyle(p).visibility!=='hidden')window.__visibleChinese.push(n.data);
    }
   };
   new MutationObserver(check).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
  });
 });
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000');await page.waitForSelector('#ngGo');await page.locator('#ngGo').click();
 await page.waitForFunction(()=>window.__bw?.S?.started&&!window.__bw.UI.playing,{},{timeout:180000});
 const eras=new Set();let steps=0;
 while(steps<65){
  const state=await page.evaluate(()=>({over:window.__bw.S.over,era:window.__bw.S.era,round:window.__bw.S.round}));eras.add(state.era);
  if(state.over)break;
  await page.locator('#passbtn').click();await page.locator('#btnGo').click();
  await page.waitForFunction(()=>!window.__bw.UI.busy&&!window.__bw.UI.playing,{},{timeout:180000});
  steps++;if(steps%4===0)console.log('progress',steps,state.era,state.round);
 }
 await page.waitForSelector('#final',{timeout:10000});
 const result=await page.evaluate(()=>({over:window.__bw.S.over,era:window.__bw.S.era,round:window.__bw.S.round,breakdown:window.__bw.S.vpBreak,visibleChinese:[...new Set(window.__visibleChinese)]}));
 assert(result.over);assert(eras.has('E1')&&eras.has('E2'));assert(result.breakdown);
 const text=await page.locator('body').innerText();assert(!/[\u3400-\u9fff]/.test(text),'Chinese in final screen');
 await page.screenshot({path:'/tmp/brass-final.png'});
 fs.writeFileSync('/tmp/brass-full-game-messages.json',JSON.stringify([...messages].sort(),null,2));
 fs.writeFileSync('/tmp/brass-full-game-result.json',JSON.stringify({...result,steps,errors,unknown:[...new Set(unknown)]},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(result.visibleChinese,[]);assert.deepEqual([...new Set(unknown)],[]);
 console.log('PASS complete game',steps,'player actions, both eras, AI notifications, final scoring; no visible Chinese');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
