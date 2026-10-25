/* Compatibility export for older integrations. New UI text is generated in English at render sites. */
export { translate } from './locale.js';

// Last-resort transport error display; never rewrites game data or rendered game sentences.
addEventListener('unhandledrejection',event=>{
 const message=event.reason?.message||'The game service is temporarily unavailable.';
 if(!/fetch|network|game service|original game|properties of undefined/i.test(message))return;
 document.querySelector('.atlas-connection-error')?.remove();
 const box=document.createElement('div');box.className='atlas-connection-error';box.setAttribute('role','alert');
 const text=document.createElement('span');text.textContent='Unable to load the game. '+message+' ';
 const button=document.createElement('button');button.textContent='Try new game';button.onclick=()=>{box.remove();document.querySelector('#btnNew').click();};
 box.append(text,button);document.body.append(box);
});
