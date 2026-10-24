/** Reusable panel for the real frontend. No dependency on the demo page.
 * Usage: import {mountEcoPanel} from './eco-panel.js';
 * const panel = mountEcoPanel(element, {onAction: async request => {...}});
 * panel.update({enabled:true, cities:[{id,name,pollution,surcharge}], green:2,
 *   finalized:false, actions:[{id,label,detail}], revision:42});
 * Host returns a new payload from onAction; only server-generated action ids.
 * Style using the .eco-* classes or your existing theme. Text is English.
 */
export function mountEcoPanel(root, {onAction}) {
  let current;
  let busy = false;
  let errorMessage = '';
  const element = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  function render() {
    root.replaceChildren();
    if (!current) return;
    root.append(element('h2', current.enabled ? 'Eco Mode' : 'Standard Mode'));
    if (!current.enabled) return;
    root.append(element('p', `Green points: ${current.green} · ${current.finalized ? 'Included in final VP' : '1 point = 1 VP at game end'}`));
    for (const city of current.cities) {
      const row = element('p', `${city.name} · Pollution ${city.pollution}/10 · Build surcharge £${city.surcharge}`, 'eco-city');
      root.append(row);
    }
    for (const action of current.actions) {
      const box = element('section', undefined, 'eco-action');
      const button = element('button', action.label);
      button.disabled = busy;
      button.onclick = async () => {
        if (busy) return;
        const request = {id: action.id, revision: current.revision};
        busy = true; errorMessage = ''; render();
        try {
          const next = await onAction(request);
          if (next) current = next;
        } catch (error) { errorMessage = error.message || 'Action failed'; }
        finally { busy = false; render(); }
      };
      box.append(element('p', action.detail), button); root.append(box);
    }
    if (errorMessage) { const error = element('p', errorMessage); error.setAttribute('role', 'alert'); root.append(error); }
  }
  return {update(payload) { current = payload; render(); }, destroy() { root.replaceChildren(); }};
}
