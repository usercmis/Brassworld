// This UI never submits money, pollution, rewards or ownership as authority.
// The server regenerates the legal action and checks its state revision.
const $ = selector => document.querySelector(selector);
let state = null;
let pending = null;
let busy = false;
const kinds = {SELL: "Sell", BUILD: "Build", CLEAN_UP: "Clean Up", ECO_UPGRADE: "Eco Upgrade", LOAN: "Loan", PASS: "Pass"};

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function notify(text) { $("#message").textContent = text; }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result.state;
}
function render() {
  $("#welcome").hidden = !!state;
  $("#game").hidden = !state;
  if (!state) return;
  const active = state.players[state.active];
  $("#status").textContent = state.over
    ? `Final scores · ${Object.entries(state.players).map(([, p]) => `${p.name}: ${p.vp} VP`).join(" · ")}`
    : `${state.eco.enabled ? "ECO MODE" : "STANDARD MODE"} · ${state.era === 1 ? "Sail" : "Steam"} Era · Round ${state.round}/8 · ${active.name}'s turn · ${state.actions_left} action(s) left`;
  $("#players").replaceChildren(...Object.entries(state.players).map(([id, p]) => {
    const box = node("article", undefined, `player ${id === state.active ? "active" : ""}`);
    box.append(node("h3", p.name), node("p", `£${p.money} · Income ${p.income >= 0 ? "+" : ""}${p.income} · ${p.vp} VP`), node("span", `${state.eco.green[id]} green points · ${p.cards} demo cards`, "small"));
    return box;
  }));
  const citySelect = $("#city");
  const selected = citySelect.value;
  citySelect.replaceChildren(new Option("All cities", "ALL"), ...Object.entries(state.cities).map(([id, c]) => new Option(c.name, id)));
  citySelect.value = selected || "ALL";
  $("#cities").replaceChildren(...Object.entries(state.cities).map(([id, city]) => {
    const pollution = state.eco.pollution[id];
    const high = state.eco.enabled && pollution >= state.eco.config.threshold;
    const card = node("article", undefined, `city ${high ? "polluted" : ""}`);
    const heading = node("div", undefined, "city-heading");
    heading.append(node("h3", city.name), node("span", state.eco.enabled ? `${pollution}/10` : "Standard", "pollution"));
    const meter = node("progress"); meter.max = 10; meter.value = pollution;
    meter.setAttribute("aria-label", `${city.name} pollution ${pollution} out of 10`);
    card.append(heading, meter, node("p", high ? "Build surcharge +£5" : "No pollution surcharge", "small"));
    for (const tile of Object.values(state.tiles).filter(t => t.city === id)) {
      const upgraded = state.eco.upgraded.includes(tile.id);
      const line = node("div", undefined, "tile");
      line.append(node("strong", state.definitions[tile.industry].name), node("span", `${state.players[tile.owner].name} · ${tile.flipped ? "Flipped" : "Unflipped"}${tile.industry === "PROV" ? ` · Beer ${tile.resources}` : ""}${upgraded ? " · Eco upgraded" : ""}`, "small"));
      card.append(line);
    }
    const button = node("button", "View city actions", "link");
    button.disabled = state.over;
    button.onclick = () => { citySelect.value = id; $("#kind").value = "ALL"; renderActions(); $(".action-panel").scrollIntoView({behavior: "smooth", block: "nearest"}); };
    card.append(button);
    return card;
  }));
  $("#log").replaceChildren(...state.log.slice().reverse().map(text => node("li", text)));
  renderActions();
}
function renderActions() {
  if (!state) return;
  const kind = $("#kind").value;
  const city = $("#city").value;
  const options = state.options.filter(action => {
    const actionCity = action.city || state.tiles[action.tile_id]?.city;
    return (kind === "ALL" || action.kind === kind) && (city === "ALL" || actionCity === city);
  });
  $("#actions").replaceChildren(...options.map(action => {
    const button = node("button", undefined, "action");
    button.append(node("span", kinds[action.kind], "action-kind"), node("strong", action.label), node("span", action.detail, "small"));
    button.disabled = busy;
    button.onclick = () => {
      pending = action;
      $("#confirm-title").textContent = action.label;
      $("#confirm-detail").textContent = action.detail;
      $("#confirm").showModal();
    };
    return button;
  }));
  if (!options.length) $("#actions").append(node("p", state.over ? "Scenario complete. Start another to compare strategies." : "No legal action for this filter. Try another city or action type.", "small"));
}
$("#commit").onclick = async () => {
  if (!pending || busy) return;
  busy = true; $("#commit").disabled = true;
  try {
    state = await api("/api/action", {id: pending.id, revision: state.revision});
    $("#confirm").close(); pending = null; notify("Action saved.");
  } catch (error) {
    $("#confirm").close(); notify(error.message);
    try { state = await api("/api/state"); } catch { /* Preserve current view if connection failed. */ }
  } finally { busy = false; $("#commit").disabled = false; render(); }
};
$("#start").onclick = async () => {
  if (busy) return;
  busy = true; $("#start").disabled = true;
  try {
    state = await api("/api/new", {eco_enabled: $("#mode").value === "eco"});
    $("#city").value = "ALL"; $("#kind").value = "ALL"; notify("Scenario started."); render();
  } catch (error) { notify(error.message); }
  finally { busy = false; $("#start").disabled = false; render(); }
};
$("#new").onclick = () => { state = null; render(); notify("Choose a mode. Starting will replace this browser's saved scenario."); };
$("#kind").onchange = renderActions;
$("#city").onchange = renderActions;
try { state = await api("/api/state"); render(); } catch (error) { notify(error.message); }
