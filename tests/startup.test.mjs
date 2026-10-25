import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Run the actual boot routine with browser/transport boundaries replaced.
const source=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8');
const bootSource=source.slice(source.indexOf('async function boot() {'),source.indexOf('// ================= 存档'));
async function run({state={started:false},saved=true,restoreError=false,stateError=false}={}) {
 const calls=[];
 const make= new Function('$','SYMBOLS','api','fetch','MapView','isMobile','renderCityNavigator','addEventListener','bindUI','setSheet','document','window','localSave','resumeLocal','toast','console','applyState','me','showNewGame',`
 let B,M,fullBoard,fullMap,map; const UI={sel:null}; const BGM={}; const SET={}; function renderAll(){}; function onMapHover(){}; function onMapClick(){};
 ${bootSource}
 return boot();`);
 await make(()=>({innerHTML:''}),'',async path=>{if(path==='/api/state'){if(stateError)throw Error('Offline');return state;}return {};},async()=>({json:async()=>({})}),class{on(){} setInset(){}fitWorld(){calls.push('world')}focusRegion(){calls.push('focus')}},()=>false,()=>{},()=>{},()=>{},()=>{},{addEventListener(){}},{},()=>saved?{save:{}}:null,async()=>{calls.push('resume');if(restoreError)throw Error('Invalid save signature');return true;},text=>calls.push(text),{warn(){}},async()=>calls.push('apply'),()=>({home:'LANCS'}),()=>calls.push('setup'));
 return calls;
}
test('rejected browser save falls back to new-game setup',async()=>{
 const calls=await run({restoreError:true});assert(calls.includes('resume'));assert(calls.includes('setup'));assert(calls.some(x=>x.includes('could not be restored')));
});
test('offline state request still offers setup',async()=>{assert((await run({stateError:true})).includes('setup'));});
test('active server game is restored without setup',async()=>{const calls=await run({state:{started:true}});assert(calls.includes('apply'));assert(!calls.includes('setup'));});
test('fresh browser offers setup and valid save resumes',async()=>{assert((await run({saved:false})).includes('setup'));const calls=await run();assert(calls.includes('resume'));assert(!calls.includes('setup'));});
