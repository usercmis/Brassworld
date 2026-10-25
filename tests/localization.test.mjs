import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const geography = JSON.parse(await readFile(new URL('../dist/theme/geography.json',import.meta.url)));
globalThis.fetch=async()=>({json:async()=>geography});
const {translate,registerPlayers,describeAction}=await import('../dist/theme/locale.js');
const messages=JSON.parse(await readFile(new URL('./fixtures/backend-messages.json',import.meta.url)));
test('all captured backend messages across both eras translate fully',()=>{
 for(const message of messages){
  const text=translate(message);
  assert(!/[\u3400-\u9fff]/.test(text),message);
  assert(!text.includes('unavailable in English'),message);
 }
});
test('complete sentences preserve numbers, resources, players and discard choices',()=>{
 assert.equal(translate('建造 酿酒厂Ⅰ · 伯明翰（£6） · 弃「中部与约克郡」'),'Build Brewery Ⅰ in Birmingham (£6) · Discard: Midlands & Yorkshire');
 assert.equal(translate('与 你 网络首次互通：双方各得 £8、收入 +1'),'Networks connected with You for the first time: each player receives £8 and +1 income');
 assert.equal(translate('开发 煤矿Ⅰ、煤矿Ⅱ（£8）'),'Develop Coal mine Ⅰ, Coal mine Ⅱ (£8)');
 assert.equal(translate('资金不足：拆除 煤矿Ⅲ · 里尔，得 £4'),'Insufficient funds: liquidate Coal mine Ⅲ in Lille for £4');
});
test('display localization never mutates incoming records or save data',()=>{
 const player=Object.freeze({id:1,name:'测试名字',isMe:false});
 const save=Object.freeze({players:Object.freeze([player]),era:'E1',industry:'COAL',kind:'BUILD'});
 const before=JSON.stringify(save);registerPlayers(save.players);
 assert.equal(translate(player.name),'Rival 2');assert.equal(JSON.stringify(save),before);
 for(const value of ['E1','COAL','BUILD','MIDYORK','bw_save'])assert.equal(translate(value),value);
});
test('unrecognized messages remain intact rather than becoming mixed-language fragments',()=>{
 const warn=console.warn;console.warn=()=>{};
 try{assert.equal(translate('未知的新通知，包含煤矿'),'未知的新通知，包含煤矿')}finally{console.warn=warn}
});
test('deployed docs copies match dist',async()=>{
 for(const file of ['index.html','js/app.js','js/art.js','js/map.js','theme/english.js','theme/locale.js','theme/tutorial.js','theme/atlas.css'])
  assert.deepEqual(await readFile(new URL('../dist/'+file,import.meta.url)),await readFile(new URL('../docs/'+file,import.meta.url)),file);
});

test('typed replay events generate English without parsing the backend sentence',()=>{
 const board={cities:[{id:'birmingham',zh:'伯明翰'}],industryZh:{COAL:'煤矿'}};
 const event=Object.freeze({kind:'BUILD',industry:'COAL',level:2,city:'birmingham',cost:7,discarded:Object.freeze(['铁厂']),text:'服务器未来改变的句子'});
 const before=JSON.stringify(event);
 assert.equal(describeAction(event,board),'Build Coal mine Ⅱ in Birmingham (£7) · Discard: Iron works');
 assert.equal(JSON.stringify(event),before);
});
