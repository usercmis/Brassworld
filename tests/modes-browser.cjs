const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true, channel:process.env.BROWSER_CHANNEL || undefined});
 try {
  const page=await browser.newPage();
  await page.setContent('<div id="actPane"><div id="acttabs"></div><div id="actlist"></div><div id="actCount"></div><div id="confirm"></div></div>');
  const app=fs.readFileSync('dist/js/app.js','utf8').replace(/^import[\s\S]*?from .*?;\n/gm,'').replace('boot();','');
  const helpers=fs.readFileSync('dist/js/display-modes.js','utf8').replaceAll('export function','function');
  await page.addScriptTag({content:`const localStorage={getItem:()=>null,setItem:()=>{}};\n${helpers}\n${app}\n
  B={industryZh:{}}; renderConfirm=()=>{}; actThumb=()=>''; actTitle=a=>a.kind; actGain=()=>''; srcHTML=()=>'';
  S={started:true,active:0,ver:1,players:[{id:0,isMe:true,money:20}],actions:[{i:0,kind:'LOAN'},{i:1,kind:'SCOUT',best:true},{i:2,kind:'LOAN'},{i:3,kind:'SCOUT'}]};
  SET.displayMode='beginner'; renderActions(); renderBeginnerHelp();
  window.modeTest={settings:showSettings, state:S, prefs:SET};`});
  assert.equal(await page.locator('#actlist .act').count(),1);
  await page.getByRole('button',{name:'Show All Options'}).click();
  assert.equal(await page.locator('#acttabs [data-k]').count(),2);
  await page.evaluate(()=>modeTest.settings());
  await page.getByRole('button',{name:'Classic',exact:true}).click();
  assert.equal(await page.evaluate(()=>modeTest.prefs.displayMode),'classic');
  assert.equal(await page.locator('#beginnerHelp').isVisible(),false);
  await page.getByRole('button',{name:'Beginner',exact:true}).click();
  assert.equal(await page.locator('#actlist .act').count(),1);
  assert.equal(await page.evaluate(()=>modeTest.state.actions.length),4);
  console.log('Browser: Beginner shortlist, Show All Options, Settings switches and legal actions passed.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
