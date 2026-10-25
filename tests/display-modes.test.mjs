import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// Run the shipped module without imposing a new package/module format on the app.
const helpers = readFileSync(new URL('../dist/js/display-modes.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
const context = vm.createContext({});
vm.runInContext(helpers, context);
test('shortlist prioritizes Advisor, preserves legal action identity and input/save', () => {
 const actions = [{i:4,kind:'LOAN'},{i:7,kind:'BUILD'},{i:8,kind:'SELL',best:true},{i:9,kind:'SCOUT'}];
 const state = {actions, save:{version:1, legacy:true}};
 const original = JSON.stringify(state);
 const result = context.shortlist(actions);
 assert.deepEqual(Array.from(result, a => a.i), [8,4,7]);
 assert.equal(result[0], actions[2]);
 assert.equal(JSON.stringify(state), original);
 for (let n=0;n<4;n++) assert.equal(context.shortlist(actions.slice(0,n)).length, Math.min(n,3));
});
test('summaries cover player and opponent changes and era transitions', () => {
 const before={era:'E1',round:1,players:[{id:0,isMe:true,money:20,income:0,vp:0,hand:8},{id:1,name:'AI',money:10}]};
 const after={era:'E2',round:2,players:[{id:0,isMe:true,money:10,income:2,vp:3,hand:7},{id:1,name:'AI',money:15}],events:[{t:'act',text:'Built a mine'}]};
 const result=context.moveSummary(before,after);
 for (const text of ['Built a mine','cash -10','income +2','victory points +3','cards -1','AI: cash +5','era changed','round began']) assert.ok(result.includes(text),text);
});
test('both shipped interfaces render and switch without network or save mutations', () => {
 let source=readFileSync(new URL('../dist/js/app.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from .*?;\n/gm,'').replace('boot();','');
 const elements=new Map();
 const element = selector => { if(!elements.has(selector)) elements.set(selector,{innerHTML:'',textContent:'',classList:{add(){},toggle(){}},insertAdjacentHTML(position,html){this.innerHTML=html+this.innerHTML;},prepend(){},replaceChildren(){},append(){}}); return elements.get(selector); };
 const storage=new Map([['bw_save','{"old":"unchanged"}']]);
 const ctx=vm.createContext({console,document:{querySelector:element,documentElement:{classList:{toggle(){}}}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>({matches:false}),setTimeout});
 vm.runInContext(helpers+'\n'+source+`\nB={industryZh:{}}; renderConfirm=()=>{}; actThumb=()=>''; actTitle=a=>a.kind; actGain=()=>''; srcHTML=()=>'';
 S={started:true,ver:1,active:0,players:[{id:0,isMe:true,money:20}],actions:[{i:0,kind:'LOAN'},{i:1,kind:'SCOUT',best:true},{i:2,kind:'LOAN'},{i:3,kind:'SCOUT'}]};
 SET.displayMode='beginner'; renderActions();`,ctx);
 assert.equal((element('#actlist').innerHTML.match(/data-i=/g)||[]).length,3);
 assert.ok(element('#actlist').innerHTML.includes('Advisor choice'));
 element('#showAllOptions').onclick();
 assert.ok(element('#acttabs').innerHTML.includes('data-k='));
 vm.runInContext(`SET.displayMode='classic'; UI.allOptions=false; renderActions();`,ctx);
 assert.ok(element('#acttabs').innerHTML.includes('data-k='));
 assert.ok(!element('#acttabs').innerHTML.includes('showAllOptions'));
 vm.runInContext(`SET.displayMode='beginner'; renderActions();`,ctx);
 assert.equal((element('#actlist').innerHTML.match(/data-i=/g)||[]).length,3);
 assert.equal(storage.get('bw_save'),'{"old":"unchanged"}');
});
