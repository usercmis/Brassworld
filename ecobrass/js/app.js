import { translate as T, registerPlayers, describeAction, rules, differences, tour } from "../theme/locale.js";
// 《工业革命：世界》前端主程序
import { SYMBOLS, PCOL, IND_ART, artCSS, regionArt, iconHTML, cubeHTML, avatarHTML, AVATARS, AVATAR_ZH,
  ROMAN, BONUS_FULL, BONUS_SHORT, IND_ORDER } from "./art.js";
import { MapView } from "./map.js?v=industrial-belt-20-v1";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ZONE_KEYS = ["BRITAIN","EUROPE","AMERICAS","ASIAPAC"];
const ZONE_ZH = { BRITAIN: "Britain", EUROPE: "Europe", AMERICAS: "Americas", ASIAPAC: "Asia-Pacific" };
const KIND_ORDER = ["BUILD", "NETWORK", "DEVELOP", "SELL"];
const KIND_ZH = { BUILD: "Build", NETWORK: "Connect", SELL: "Sell", DEVELOP: "Develop", LOAN: "Loan", SCOUT: "Scout", CLEAN_UP: "Clean Up", ECO_UPGRADE: "Eco Upgrade" };
const RES_ZH = { coal: "Coal", iron: "Iron", prov: "Beer" };
const isMobile = () => matchMedia("(max-width: 760px)").matches;

// ---------- 设置（本机偏好，存 localStorage） ----------
const savedPrefs = (() => { try { const value = JSON.parse(localStorage.getItem("ecobrass_hackathon_prefs") || "{}"); return value && typeof value === "object" ? value : {}; } catch (e) { return {}; } })();
const savedContrastMode = savedPrefs.contrastMode ?? (savedPrefs.highContrast ? "light" : "off");
const SET = Object.assign({ speed: 1, step: true, follow: true, hints: false, level: "normal", avatar: "uk", music: true, vol: "0.35",
  contrastMode: "off", largeText: false, reduceMotion: false }, savedPrefs, { contrastMode: savedContrastMode });
delete SET.highContrast;
function savePrefs() { try { localStorage.setItem("ecobrass_hackathon_prefs", JSON.stringify(SET)); } catch (e) { } }
function applyA11yPrefs() {
  const root = document.documentElement;
  root.classList.toggle("a11y-contrast", SET.contrastMode === "light");
  root.classList.toggle("a11y-contrast-dark", SET.contrastMode === "dark");
  root.classList.toggle("a11y-large-text", !!SET.largeText);
  root.classList.toggle("a11y-reduce-motion", !!SET.reduceMotion);
}
applyA11yPrefs();

let B = null, M = null, map = null;
let fullBoard = null, fullMap = null, shownMapId = null;
let S = null;          // 服务端最新状态
let D = null;          // 回放中的「显示状态」：从旧状态出发，逐个事件往前推
const UI = { tab: null, filter: null, sel: null, card: null, busy: false, playing: false, skip: false, sheet: "hand", expanded: false,
  discard: [], passMode: false, devPick: [], devBonus: [], beer: [] };

const api = (p, b) => fetch(p, b ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) } : {})
  .then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(T(data.error || "The game service is temporarily unavailable."));
    return data;
  });
const city = id => B.cities.find(c => c.id === id);
const cityZh = id => T(map && map.city[id] ? map.city[id].short : (city(id) || {}).zh || id);
const V = () => D || S;
const me = (st = V()) => st.players.find(p => p.isMe);
const pname = (st, id) => T((st.players.find(p => p.id === id) || {}).name || "");

const englishPlayerName = T;

// ================= 启动 =================
async function boot() {
  $("#symbols").innerHTML = SYMBOLS;
  [B, M] = await Promise.all([api("/api/board"), fetch("/assets/map.json").then(r => r.json())]);
  fullBoard = B; fullMap = M;
  map = new MapView($("#map"), B, M, { targetPx: isMobile() ? 26 : 30 });
  map.on("hover", onMapHover);
  map.on("click", onMapClick);
  map.on("camera", (v, sc, zoomed) => { if (zoomed && UI.sel !== null) map.refreshPreview(); });   // 预览只随缩放变，平移不用重画
  if (isMobile()) map.setInset(0, 176);
  renderCityNavigator();
  addEventListener("resize", () => { layoutInfobar(); map.resize(); setSheet(UI.sheet, UI.expanded); });
  bindUI();
  setSheet("hand", false);
  document.addEventListener("visibilitychange", () => { if (document.hidden && UI.playing) UI.skip = true; });
  window.__bw = { get map() { return map; }, get S() { return S; }, get D() { return D; }, get BGM() { return BGM; }, UI, SET, renderAll };   // 调试用
  const st = await api("/api/state");
  if (st.started) {
    await applyState(st, false);
    map.focusRegion(me().home);
  } else if (localSave() && await resumeLocal(true)) {
    // 服务器重启过、会话没了：有本地存档就直接续上，不用玩家再点一次
    toast("Previous game restored.");
  } else {
    map.fitWorld();
    showNewGame();
  }
}

// ================= 存档 =================
function saveLocal(st) {
  try {
    if (st.save && !st.over) {
      localStorage.setItem("ecobrass_hackathon_save", JSON.stringify(st.save));
      localStorage.setItem("ecobrass_hackathon_save_meta", JSON.stringify({
        t: Date.now(), round: st.round, era: st.eraZh, mode: st.mode,
        players: st.players.map(p => ({ name: p.name, vp: p.vp, me: p.isMe }))
      }));
    }
    if (st.over) { localStorage.removeItem("ecobrass_hackathon_save"); localStorage.removeItem("ecobrass_hackathon_save_meta"); }
  } catch (e) { /* 隐私模式等情况下存不了，不影响游戏 */ }
}
function localSave() {
  try {
    const s = localStorage.getItem("ecobrass_hackathon_save");
    return s ? { save: JSON.parse(s), meta: JSON.parse(localStorage.getItem("ecobrass_hackathon_save_meta") || "{}") } : null;
  } catch (e) { return null; }
}
async function resumeLocal(quiet) {
  const ls = localSave(); if (!ls) return false;
  const st = await api("/api/load", { save: ls.save });
  if (!st.started) { toast(st.error || "Unable to load the saved game."); return false; }
  PREV_CLEAR();
  await applyState(st, false);
  map.focusRegion(me().home);
  if (!quiet) toast(`Local save loaded: ${T(st.eraZh)}, Round ${st.round}`);
  return true;
}
function PREV_CLEAR() { S = null; D = null; UI.sel = null; UI.filter = null; }

// ================= 提交动作 =================
async function submit(path, body) {
  if (UI.busy || UI.playing) return;
  UI.busy = true; document.body.classList.add("busy");
  // 服务器在算 AI 的回合时给个提示，否则界面看起来像卡住了
  const think = setTimeout(() => { $("#playwho").innerHTML = "Your rivals are thinking…"; $("#playbar").classList.remove("hide"); }, 350);
  try {
    let r = await api(path, Object.assign({ v: S ? S.ver : undefined }, body));
    if (r && r.started === false && localSave()) {
      // 服务端重启过、会话丢了：用本地存档恢复（刚才这一步没执行，玩家重点一次即可）
      await resumeLocal(true);
      toast("Game restored. Please select your action again.");
      return;
    }
    if (r.stale) toast("The game state has changed. Please select again.");
    if (r.error) toast(r.error);
    UI.sel = null; UI.filter = null; UI.card = null; UI.passMode = false; UI.discard = [];
    const previous=S;
    await applyState(r, false);
    if(!SET.reduceMotion && previous){
      for(const t of r.placed.filter(t=>!previous.placed.some(x=>x.id===t.id)))map.popSlot(t.city,t.slot);
      for(const l of r.builtLinks.filter(l=>!previous.builtLinks.some(x=>x.a===l.a&&x.b===l.b)))map.flashLink([l.a,l.b].sort().join("|"),PCOL[l.owner]);
      const aiLogs=r.log.slice(previous.log.length).filter(l=>l.who!=="You"&&l.who!=="System");
      if(aiLogs.length){
        const last=aiLogs[aiLogs.length-1],pid=r.players.find(p=>p.name===last.who)?.id;
        if(pid!==undefined)actFeed(pid,last.text,"",false);
        toast(`${aiLogs.length} rival actions completed. See Journal for details.`);
      }
    }
  } catch (e) {
    console.error(e); toast("Connection error: " + e.message);
  } finally {
    clearTimeout(think);
    if (!UI.playing) $("#playbar").classList.add("hide");
    UI.busy = false; document.body.classList.remove("busy");
  }
}

async function applyState(st, animate) {
  if (st.error) toast(st.error);
  saveLocal(st);
  const evs = st.events || [];
  const worth = evs.some(e => e.t === "act" || e.t === "round" || e.t === "era");
  if (animate && S && worth && !SET.reduceMotion) await playEvents(evs, st);
  S = st; D = null;
  renderAll();
  if (S.over && !$("#final")) showFinal();
}

// ================= 渲染 =================
function renderAll() {
  const st = V(); if (!st || !st.started) return;
  const mapId = st.mapId || 'world';
  if (shownMapId !== mapId) {
    if (st.mapId === 'industrial-belt-20-v1') {
      const keep = new Set(st.mapCities);
      B = { ...fullBoard,
        cities: fullBoard.cities.filter(c => keep.has(c.id)),
        regions: fullBoard.regions.filter(r => fullBoard.cities.some(c => keep.has(c.id) && c.region === r.id)),
        links: fullBoard.links.filter(l => keep.has(l.a) && keep.has(l.b)) };
      const keys = new Set(B.links.map(l => [l.a,l.b].sort().join('|')));
      M = { ...fullMap, cities: Object.fromEntries(Object.entries(fullMap.cities).filter(([id]) => keep.has(id))),
        links: Object.fromEntries(Object.entries(fullMap.links).filter(([id]) => keys.has(id))),
        zones: Object.fromEntries(Object.entries(fullMap.zones).filter(([id]) => ['BRITAIN', 'AMERICAS'].includes(id))) };
    } else { B = fullBoard; M = fullMap; }
    map.replaceBoard(B, M, st.mapId === 'industrial-belt-20-v1');
    shownMapId = mapId;
  }
  registerPlayers(st.players);
  renderTop(st); renderPlayers(st); renderMarkets(st); renderHand(st);
  renderCityNavigator(st);
  renderActions(); renderMat(st); renderLog(st);
  map.setState(st, me(st).id);
  if (UI.card !== null) showCardTargets(UI.card);
  else if (UI.mine) showMine(st, false);
  else if (UI.net && st.reach.length) map.setTargets(st.reach, "net");
  else map.setTargets(null);
  if (UI.sel !== null) previewSel();
  renderHint();
}

function renderTop(st) {
  $("#eraChip").textContent = "Combined Era";
  $("#roundInfo").textContent = `Round ${st.round} / 8 · ${st.over ? "Final ledger" : "2 actions per turn"}`;
  $("#pips").innerHTML = [0,1].map(i=>`<span class="pip ${!st.over && i<st.actionsLeft ? "" : "off"}"></span>`).join("");
}

function renderPlayers(st, bump = {}) {
  const order = st.turnOrder;
  const ps = [...st.players].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  $("#players").innerHTML = ps.map(p => {
    const links = (st.linkedPairs || []).filter(k => k.includes(p.id)).map(k => k[0] === p.id ? k[1] : k[0]);
    return `<div class="pl ${p.id === st.active ? "active" : ""} ${p.isMe ? "me" : ""}" data-p="${p.id}"
      title="${englishPlayerName(p.name)}｜Tiles ${p.tiles} · Links ${p.links} · Hand ${p.hand}｜Click to view all industry tiles">
      <span class="order">${order.indexOf(p.id) + 1}</span>
      ${avatarHTML(p.avatar, PCOL[p.id], isMobile() ? 30 : 40)}
      <div class="body">
      <div class="r1"><span class="nm" style="color:${PCOL[p.id]}">${englishPlayerName(p.name)}</span>
      <span class="vp ${bump[p.id] ? "bump" : ""}" title="Victory points">${p.vp}</span></div>
      <div class="r2"><span>£<b class="money">${p.money}</b></span><span>Income <b>+${p.income}</b></span><span title="Coal / iron in stock">${cubeHTML("coal",10)} ${p.coal} ${cubeHTML("iron",10)} ${p.iron}</span></div>
      <div class="r3">${p.levelZh ? `<span class="lv">${T(p.levelZh)}</span>` : ""}<span class="home">${T(p.homeZh)}</span>${st.eco ? `<span class="eco-green" title="Eco upgrades add 3 final points each; every 3 pollution costs 1 final point">♧ ${p.greenPoints || 0} eco · Pollution ${p.pollution}</span>` : ""}${links.map(i => `<span class="lnkdot" style="background:${PCOL[i]}" title="Network connected to ${pname(st, i)}"></span>`).join("")}</div>
      </div></div>`;
  }).join("");
  layoutInfobar();
}

// 玩家条和市场放得下就排一行，放不下就分两行（每位玩家约需 150px，市场约 650px）
function layoutInfobar() {
  const bar = $("#infobar"), st = V();
  if (!bar || !st || !st.players) return;
  const want = !isMobile() && bar.clientWidth < st.players.length * 150 + 650;
  if (want !== bar.classList.contains("stack")) {
    bar.classList.toggle("stack", want);
    if (map) requestAnimationFrame(() => map.resize());     // 地图区域高度变了
  }
}
function marketRow(m, kind) {
  // 价位条：每一档一格，按存量填充；宽度随窗口伸缩（以前一块一块画方块，窗口一窄就出界）
  const lad = m.ladder.map(l => `<i title="£${l.price}: ${l.n}/${l.per}"><b style="height:${Math.round(100 * l.n / l.per)}%"></b></i>`).join("");
  return `<div class="mrow" title="${kind === "coal" ? "Coal" : "Iron"} ${m.count}/${m.capacity} — current price £${m.price}">${cubeHTML(kind, 12)}` +
    `<span class="mladder ${kind}">${lad}</span><b>£${m.price}</b></div>`;
}
function marketCubes(m, kind) {
  // 按原作的市场板：每个价格档 per 个格子，从便宜到贵，有货的画实心方块。
  // 交通打通后几个市场合成一个，格子数翻几倍 —— 这时改画分档条，否则一行几十块方块把整条栏撑爆
  if (m.capacity > 16) {
    return `<span class="mladder ${kind}">` + m.ladder.map(l =>
      `<i title="£${l.price}: ${l.n}/${l.per}"><b style="height:${Math.round(100 * l.n / l.per)}%"></b></i>`).join("") +
      `</span><span class="mcount">${m.count}/${m.capacity}</span>`;
  }
  let h = "";
  for (const l of m.ladder) for (let k = 0; k < l.per; k++)
    h += `<svg class="cube ${k < l.n ? "" : "e"}" viewBox="0 0 20 20"><use href="#cube-${kind}"/></svg>`;
  return `<span class="mcubes">${h}</span>`;
}
function renderMarkets(st) {
  const html = ZONE_KEYS.map(z=>`<div class="mz ${st.myZones.includes(z)?"mine":""}" data-zone="${z}" title="Automatic deliveries: shortages cost £2 per resource, anywhere. Your own coal/iron stock is used first."><div class="zn">${ZONE_ZH[z]}</div>${marketRow(st.markets[z].coal,"coal")}${marketRow(st.markets[z].iron,"iron")}</div>`).join("");
  $("#markets").innerHTML=html;$("#markets2").innerHTML=html;
}

function renderCityNavigator(st = V()) {
  const list = $("#cityList"), linkList = $("#linkList");
  if (!list || !linkList || !B) return;
  const counts = new Map(), linkCounts = new Map();
  if (st && st.started && st.actions) st.actions.forEach(action => {
    if (action.city) counts.set(action.city, (counts.get(action.city) || 0) + 1);
    [action.link, action.second].filter(Boolean).forEach(link => {
      const key = [...link].sort().join("|");
      linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
    });
  });
  const cityButtons = document.createDocumentFragment();
  [...B.cities].sort((a, b) => (a.en || a.zh || a.id).localeCompare(b.en || b.zh || b.id)).forEach(c => {
    const button = document.createElement("button"), name = T(c.en || c.zh || c.id);
    const region = T(c.regionEn || c.regionZh || c.region || "");
    const count = counts.get(c.id) || 0;
    button.type = "button";
    button.className = "city-option";
    button.dataset.city = c.id;
    button.textContent = region ? `${name} · ${region}` : name;
    button.setAttribute("aria-label", count
      ? `${name}, ${region}, ${count} available actions`
      : `${name}, ${region}`);
    cityButtons.appendChild(button);
  });
  list.replaceChildren(cityButtons);

  const linkButtons = document.createDocumentFragment();
  [...linkCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, count]) => {
    const [a, b] = key.split("|");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "city-option link-option";
    button.dataset.link = key;
    button.textContent = `${cityZh(a)} — ${cityZh(b)}`;
    button.setAttribute("aria-label", `${cityZh(a)} to ${cityZh(b)}, ${count} available actions`);
    linkButtons.appendChild(button);
  });
  linkList.replaceChildren(linkButtons);
}

// ---------- 手牌 ----------
function cardArt(c) {
  if (c.kind === "WILD") return c.v === "INDUSTRY" ? IND_ART.MFG : regionArt("WILD");
  return c.kind === "INDUSTRY" ? (IND_ART[c.v.split("+")[0]] || IND_ART.MFG) : regionArt(c.v);
}
function renderHand(st) {
  const tg = st.hand.map(c => cardTargets(c));
  $("#cards").innerHTML = st.hand.map((c, ci) => {
    const isInd = c.kind === "INDUSTRY", isWild = c.kind === "WILD";
    const dead = !isWild && tg[ci].size === 0;
    const dspec = (UI.sel !== null || UI.passMode) ? discardSpec() : null;
    const dcls = dspec ? (UI.discard.includes(ci) ? "todisc" : dspec.allowed.includes(ci) ? "candisc" : "nodisc") : "";
    const kind = isWild ? "Wild card" : isInd ? "Industry card" : "Region card";
    const selected = UI.card === ci;
    return `<div class="pcard ${isInd ? "" : "region"} ${isWild ? "wild" : ""} ${dead ? "dead" : ""} ${selected ? "sel" : ""} ${dcls}"
      data-ci="${ci}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${T(c.label)}, ${kind}${dead ? ", currently unavailable" : ""}" title="${T(c.label)}${dead ? " (currently unavailable)" : ""}">
      <span class="kind">${isWild ? "Wild" : isInd ? "Industry" : "Region"}</span>
      <div class="art" style="${artCSS(cardArt(c))}"></div><div class="nm">${T(c.label)}</div></div>`;
  }).join("");
  const usable = tg.filter((t, i) => st.hand[i].kind === "WILD" || t.size).length;
  $("#handSub").textContent = st.hand.length ? `Reference cards · no discards` : "";
}
// 这张牌能在哪建：区域牌 = 该区域城市（仍须在网络内）；产业牌 = 网络内有空格能建这种产业的城市
function cardTargets(card) {
  const acts=(V()?.actions||[]).filter(a=>a.kind==="BUILD");
  return new Set(acts.filter(a=>card.kind==="WILD" || card.kind==="REGION" && city(a.city).region===card.v || card.kind==="INDUSTRY" && a.industry===card.v).map(a=>a.city));
}

function costParts(t, e) {
  // 「$17 板件 + 亚太市场煤×1 $6 = $23」
  const parts = [`£${t.cost} Tiles`];
  (e.coalFrom || []).forEach(s => parts.push(`${cubeHTML("coal", 11)}${s.owner === me(S).id ? "Your own" : pname(S, s.owner)}·${cityZh(s.city)}×${s.n} Free`));
  if (e.coalMkt) parts.push(`${cubeHTML("coal", 11)}${zoneMkt[e.zone] || "Market"}×${e.coalMkt} £${e.coalCash}`);
  (e.ironFrom || []).forEach(s => parts.push(`${cubeHTML("iron", 11)}${s.owner === me(S).id ? "Your own" : pname(S, s.owner)}·${cityZh(s.city)}×${s.n} Free`));
  if (e.ironMkt) parts.push(`${cubeHTML("iron", 11)}${zoneMkt[e.zone] || "Market"}×${e.ironMkt} £${e.ironCash}`);
  return parts.join(" + ") + (parts.length > 1 ? ` = £${e.money}` : "");
}
function canLoan() { return S && S.actions && S.actions.some(a => a.kind === "LOAN"); }
function buildStatus(cityId,ind) {
  const st=S, info=st.buildInfo?.[ind];
  if(!st.reach.includes(cityId)) return {ok:false,why:"Outside your network. Connect a route reaching this city first."};
  if(!info?.left) return {ok:false,why:"No industry tiles remain."};
  const e=info.cities.find(x=>x.city===cityId);
  if(!e) return {ok:false,why:"No matching empty industry slot. Existing industries cannot be overwritten."};
  if(e.money>me(st).money) return {ok:false,e,short:true,why:`Need £${e.money-me(st).money} more. Sell a connected industry, or pass for round-end income.`};
  return {ok:true,e};
}

function tileLines(ind, t) {
  const need = [];
  for (let i = 0; i < t.coal; i++) need.push(cubeHTML("coal", 12));
  for (let i = 0; i < t.iron; i++) need.push(cubeHTML("iron", 12));
  const give = [`<b>${t.vp}</b> VP`, `Income +${t.income}`, `Links ${t.linkVp}`];
  const note = ["COAL", "IRON"].includes(ind) ? `Produces ${t.produces} resources when built; sells to market`
    : ind === "PROV" ? "Produces 1 beer in the Sail Era or 2 in the Steam Era"
      : t.sellProv ? `Requires ${t.sellProv} beer to sell and a connection to an open port accepting these goods` : "No beer required to sell; connect to an open port accepting these goods";
  return `<div class="r"><span class="k">Cost</span><b style="color:var(--gold2)">£${t.cost}</b>${need.length ? " + " + need.join("") : " · No coal or iron required"}</div>
    <div class="r"><span class="k">Rewards</span>${give.join(" · ")}</div>
    <div class="r"><span class="k">Notes</span>${note}</div>`;
}
function cityLine(cityId, ind) {
  const s = buildStatus(cityId, ind), e = s.e;
  const detail = s.ok ? costParts((S.buildInfo[ind] || {}).tile, e)
    : s.short ? `${s.why}<br>${costParts((S.buildInfo[ind] || {}).tile, e)}` : s.why;
  return `<div class="c ${s.ok ? "ok" : "no"}"><span class="m">${s.ok ? "✓" : "✗"}</span>
    <span class="n">${cityZh(cityId)}${e && e.money !== null && e.money !== undefined ? ` £${e.money}` : ""}</span><span class="d">${detail}</span></div>`;
}
function cardPopHTML(card) {
 const ind=card.kind==="INDUSTRY"?card.v:null;
 const t=ind?B.tiles[ind][0]:null;
 const costs=t?`<div class="r">Build: £${t.cost} + ${t.coal} coal + ${t.iron} iron. Missing stock is delivered at £2 each; action prices include delivery.</div>`:"";
 const note=ind==="COAL"?"Produces 2 × level coal each round.":ind==="IRON"?"Produces 2 × level iron each round.":ind==="PROV"?"Adds £1 income immediately when built.":"Goods earn cash, income and victory points when sold.";
 return `<div class="h"><b>${T(card.label)}</b></div>${costs}<div class="r">${t?note:"Start in your home region and expand along your own routes."}</div><div class="r">These are reference cards. They do not restrict or pay for actions. Every industry can sell once after one of your routes reaches its city.</div><div class="foot">Select an action, check the exact cost and confirm.</div>`;
}

function showCardPop(ci, anchor) {
  const st = V(), card = st.hand[ci], pop = $("#cardpop");
  if (!card || !S || !S.buildInfo) { pop.classList.add("hide"); return; }
  pop.innerHTML = cardPopHTML(card);
  pop.classList.remove("hide");
  if (!isMobile() && anchor) {
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + "px";
    pop.style.top = Math.max(8, r.top - pop.offsetHeight - 10) + "px";
  }
}
function hideCardPop() { $("#cardpop").classList.add("hide"); }

function showCardTargets(ci) {
  const st = V(), card = st.hand[ci]; if (!card) return;
  const t = cardTargets(card);
  // 区域牌：该区域的城市全部标出；能建的强高亮，其余（不在网络内或格位已满）弱高亮
  const rest = card.kind === "REGION" ? B.cities.filter(c => c.region === card.v && !t.has(c.id)).map(c => c.id) : null;
  $("#map").classList.remove("showmine");
  map.setTargets(t.size || !rest ? [...t] : [], "tgt", rest);
  const anchor = document.querySelector(`.pcard[data-ci="${ci}"]`);
  if (S && S.buildInfo && Object.keys(S.buildInfo).length) { showCardPop(ci, anchor); hideTip(); return; }
  const txt = card.kind === "WILD"
    ? `Wild card: ${card.v === "REGION" ? "any region" : "any industry"}; expires at era end`
    : card.kind === "REGION"
      ? `Region card: ${T(card.label)} — ${t.size} buildable cities${rest && rest.length ? ` (${rest.length} other cities are outside your network or full, marked with dashed lines)` : ""}`
      : `Industry card: ${t.size} buildable cities in your network`;
  showTip(`<b>${T(card.label)}</b><div class="sl">${txt}</div>` +
    (t.size ? `<div class="sl" style="margin-top:3px">${[...t].slice(0, 8).map(cityZh).join(", ")}${t.size > 8 ? " etc." : ""}</div>` : ""));
}

// ---------- 行动 ----------
function actThumb(a) {
  if (a.industry && IND_ART[a.industry]) return `<span class="athumb" style="${artCSS(IND_ART[a.industry])}"></span>`;
  const sym = { NETWORK: a.link && isSeaLink(a.link) ? "tk-ship" : "tk-rail", LOAN: "i-coin", SCOUT: "i-star", DEVELOP: "i-up" }[a.kind] || "i-star";
  return `<span class="athumb sym"><svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:currentColor"><use href="#${sym}"/></svg></span>`;
}
function isSeaLink(k) { const l = B.links.find(x => (x.a === k[0] && x.b === k[1]) || (x.a === k[1] && x.b === k[0])); return l && l.sea; }
function srcHTML(a) {
 const needs=[];
 if(a.needCoal)needs.push(`${a.needCoal} coal`);
 if(a.needIron)needs.push(`${a.needIron} iron`);
 if(a.mktCash)needs.push(`£${a.mktCash} delivery included`);
 return needs.join(" · ");
}

function actTitle(a) {
 if(a.kind==="BUILD")return `${T(B.industryZh[a.industry])} ${ROMAN[a.level]} · ${cityZh(a.city)}`;
 if(a.kind==="NETWORK")return `${a.link.map(cityZh).join("—")} ${a.eco?"· Clean transport":"· Conventional"}`;
 if(a.kind==="DEVELOP")return `${a.variant==="eco"?"Eco retrofit":"Upgrade to level "+ROMAN[a.level]} · ${T(B.industryZh[a.industry])} · ${cityZh(a.city)}`;
 return `${T(B.industryZh[a.industry])} ${ROMAN[a.level]} · ${cityZh(a.city)}`;
}

function actGain(a) {
 if(a.kind==="BUILD")return `+${a.pollution} pollution · ${a.industry==="COAL"?"Produces 2 coal/round":a.industry==="IRON"?"Produces 2 iron/round":a.industry==="PROV"?"Income +£1 now":"Sell later for £10, 3 victory points and +£1 income"}`;
 if(a.kind==="NETWORK")return `+2 victory points · +${a.pollution} pollution · ${a.eco?"No coal required":"Uses 1 coal"}`;
 if(a.kind==="DEVELOP")return a.variant==="eco"?"Reduce pollution by up to 2 · +3 final points · selling uses no coal and emits nothing":"+2 victory points now · stronger sale rewards · 1 iron · max level III";
 return `+£${a.proceeds} · +${a.vp} victory points now · Income +£${a.income}/round · +${a.pollution} pollution`;
}

function groupActs() {
  const g = {}; (S.actions || []).forEach(a => (g[a.kind] = g[a.kind] || []).push(a));
  return g;
}
function filtered(list) {
  const f = UI.filter; if (!f) return list;
  return list.filter(a => (f.city && (a.city === f.city || (a.link && a.link.includes(f.city)) || (a.second && a.second.includes(f.city)))) ||
    (f.link && [a.link, a.second].filter(Boolean).some(k => [...k].sort().join("|") === f.link)));
}
function explainMove(action) {
  if (!action) return "";

  switch (action.kind) {
    case "BUILD":
      return "Building an industry can increase your income and create future scoring opportunities.";

    case "NETWORK":
      return "Expanding your network can unlock new cities and help connect your industries.";

    case "DEVELOP":
      return "Developing removes lower-level industry tiles, helping you access more advanced industries.";

    case "SELL":
      return "Selling eligible goods can increase your income and score points.";

    case "LOAN":
      return "Taking a loan gives you more money to invest, but reduces your income.";

    case "SCOUT":
      return "Scouting lets you discard 3 cards to gain wild cards, giving you more flexibility when building industries in different regions.";

    default:
      return "This move may help improve your position. Check its cost and effects before choosing.";
  }
}


function showEcoSellSelection() {
  const candidates = S.placed.filter(t => t.owner === me(S).id && !t.flipped && ["COTTON", "MFG", "LUX"].includes(t.industry));
  const d = modal(`<h2>Sell selected factories</h2><p>Select factories and one matching trade port. The server checks routes, acceptance and shared beer before selling anything.</p><div class="eco-sell-options">${candidates.map((t,i) => `<label><input type="checkbox" data-tile="${t.id}"> ${T(B.industryZh[t.industry])} · ${cityZh(t.city)}</label>`).join("")}</div><label>Trade port <select id="ecoHub">${S.hubs.filter(h=>h.open).map(h=>`<option value="${h.id}">${cityZh(h.city)} · ${h.accepts.map(i=>T(B.industryZh[i])).join(" / ")}</option>`).join("")}</select></label><label>Discard <select id="ecoDiscard">${S.hand.map((c,i)=>`<option value="${i}">${T(c.label)}</option>`).join("")}</select></label><p>Uses 1 action. Port beer is used first; own and connected opponent beer follow. For manual beer choices use individual/pair Sell plans.</p><div class="btns"><button id="ecoSellCancel">Cancel</button><button class="primary" id="ecoSellGo">Confirm selected sale</button></div>`);
  d.querySelector("#ecoSellCancel").onclick = () => d.remove();
  d.querySelector("#ecoSellGo").onclick = async () => {
    const ids=[...d.querySelectorAll("input[data-tile]:checked")].map(e=>e.dataset.tile);
    if (!ids.length) return toast("Select at least one factory.");
    const body={sellIds:ids,hubId:d.querySelector("#ecoHub").value,discard:[+d.querySelector("#ecoDiscard").value]};
    d.remove(); await submit("/api/action",body);
  };
}
function renderActions() {
 const st=S,tabs=$("#acttabs"),list=$("#actlist");
 if(!st)return;
 if(st.over){tabs.innerHTML="";list.innerHTML='<div class="empty">Eight rounds complete. See the final ledger.</div>';$("#confirm").classList.add("hide");return;}
 const g=groupActs();UI.tab=UI.tab||"NETWORK";
 $("#actCount").textContent=st.actions.length;
 tabs.innerHTML=KIND_ORDER.map(k=>`<button type="button" data-k="${k}" class="${UI.tab===k?"on":""}" aria-pressed="${UI.tab===k}">${KIND_ZH[k]}<span class="n">${filtered(g[k]||[]).length}</span></button>`).join("")+(UI.filter?`<button class="filter" id="clearFilter">Filter: ${UI.filter.city?cityZh(UI.filter.city):UI.filter.link.split("|").map(cityZh).join("—")} ✕</button>`:"")+'<button id="passbtn" class="passbtn" title="Use one action to wait for income">Pass</button>';
 const items=filtered(g[UI.tab]||[]);
 const why={BUILD:"Build in your home region or at a city reached by your routes. You need an empty matching slot and enough cash, including £2 for each missing resource.",NETWORK:"Connect from your home region or your network. A route can only have one owner. Conventional: £5 + 1 coal; clean: £8, no coal.",DEVELOP:"Develop one of your unsold industries: £5 + 1 iron for a level (maximum III), or £6 + 1 iron for an eco retrofit. Sold industries cannot be developed.",SELL:"A sale needs an unsold industry with one of your own routes at its city. Conventional selling uses 1 coal (£2 delivery if needed); eco selling needs none. Each industry sells once."};
 list.innerHTML=items.length?items.map(a=>`<button type="button" class="act ${UI.sel===a.i?"sel":""} ${a.best?"best":""}" data-i="${a.i}" aria-pressed="${UI.sel===a.i}">${actThumb(a)}<span class="body"><span class="tx">${actTitle(a)}</span><span class="gain">${actGain(a)}</span><span class="src">${srcHTML(a)}</span></span><span class="price ${a.cost?"":"free"}">${a.cost?"£"+a.cost:"Free"}</span></button>`).join(""):`<div class="empty">${UI.filter?"No matching actions here. Clear the city/route filter to see other choices. ":""}${why[UI.tab]}</div>`;
 renderConfirm();
}

function devKey(list) { return [...list].sort().join("+"); }
function devAction(pick) {
  const k = devKey(pick);
  return pick.length ? (S.actions || []).find(a => a.kind === "DEVELOP" && devKey((a.dev || [a]).map(d => d.industry)) === k) : null;
}
function devPickerHTML(acts, best) {
  const singles = acts.filter(a => !a.dev || a.dev.length === 1)
    .sort((a, b) => IND_ORDER.indexOf(a.industry) - IND_ORDER.indexOf(b.industry));
  const bestInds = best && best.kind === "DEVELOP" ? (best.dev || [best]).map(d => d.industry) : [];
  const p = UI.devPick;
  const btns = singles.map(a => {
    const n = p.filter(x => x === a.industry).length;
    const two = acts.find(x => x.dev && x.dev.length === 2 && x.dev.every(d => d.industry === a.industry));
    const lv = n === 2 && two ? two.dev.map(d => ROMAN[d.level]).join(", ") : ROMAN[a.level];
    return `<button type="button" class="dpk ${n ? "on" : ""}" data-dind="${a.industry}">${actThumb(a)}
      <span class="nm">${T(B.industryZh[a.industry])} ${lv}${bestInds.includes(a.industry) ? "★" : ""}</span>
      ${n === 2 ? `<span class="x2">×2</span>` : ""}</button>`;
  }).join("");
  let note = "Choose 1–2 industry tiles to remove. Pay 1 iron per tile. You may select the same industry twice.";
  if (p.length && !devAction(p)) note = "This combination is unavailable: insufficient cash for 2 iron.";
  return `<div class="dpick"><div class="dnote">${note}</div><div class="dbtns">${btns}</div></div>`;
}
function devClick(ind) {
  let p = [...UI.devPick];
  const n = p.filter(x => x === ind).length;
  const canTwo = (S.actions || []).some(a => a.kind === "DEVELOP" && a.dev && a.dev.length === 2 && a.dev.every(d => d.industry === ind));
  if (n === 0) p = [...p, ind].slice(-2);
  else if (n === 1 && p.length === 1 && canTwo) p.push(ind);
  else p = p.filter(x => x !== ind);
  const a = devAction(p);
  if (a) selectAction(a.i, false); else clearSel();
  UI.devPick = p;
  renderActions();
}
// ---------- 啤酒来源（伯明翰规则：卖货、双铺铁路用哪桶啤酒由玩家挑） ----------
// 按引擎的顺序模拟取用：每件货先用所选的港内啤酒，再按点选顺序用所选的酿酒厂。
function beerPlan(a, pick) {
  const b = a && a.beer; if (!b) return null;
  const opt = {}; b.options.forEach(o => { opt[o.key] = Object.assign({}, o, { left: o.n }); });
  const order = pick.filter(k => opt[k]);
  const hubs = order.filter(k => opt[k].kind === "hub"), brews = order.filter(k => opt[k].kind !== "hub");
  const needs = a.kind === "SELL" ? (a.sells || []).map(s => s.prov || 0) : [b.need];
  const used = {}; let short = 0;
  needs.forEach((need, i) => {
    let rest = need;
    [...hubs, ...brews].forEach(k => {
      const o = opt[k];
      if (!rest || !o.for.includes(i)) return;
      const t = Math.min(o.left, rest);
      if (t) { o.left -= t; rest -= t; used[k] = (used[k] || 0) + t; }
    });
    short += rest;
  });
  return { used, short };
}
function beerChanged(a) { return !!(a && a.beer) && UI.beer.join(",") !== a.beer.default.join(","); }
function beerReady() { const a = selAction(); return !a || !a.beer || beerPlan(a, UI.beer).short === 0; }
// 界面显示用的动作：玩家改了啤酒来源时，换上按新选择算出的来源（地图高亮、来源文字都用它）
function viewAction(a) {
  if (!a || !a.beer || a !== selAction() || !beerChanged(a)) return a;
  const used = beerPlan(a, UI.beer).used;
  const prov = a.beer.options.filter(o => o.kind !== "hub" && used[o.key])
    .map(o => ({ city: o.city, slot: o.slot, owner: o.owner, mine: o.mine, n: used[o.key] }));
  const hubN = a.beer.options.filter(o => o.kind === "hub").reduce((t, o) => t + (used[o.key] || 0), 0);
  const hub = a.hub ? Object.assign({}, a.hub, { bonus: used["hub:" + a.hub.id] ? a.hub.bonusType : null }) : a.hub;
  return Object.assign({}, a, { prov, hubProv: hubN, hub });
}
// 「免费开发」港口奖励只在用了该港的港内啤酒时触发
function devBonusLive(a) {
  const d = a && a.devBonus; if (!d) return false;
  if (!a.beer) return a.hubProv > 0;
  const used = beerPlan(a, UI.beer).used;
  return (d.hubs || []).some(h => used["hub:" + h]);
}
function beerHTML(a) {
  const b = a && a.beer; if (!b) return "";
  const r = beerPlan(a, UI.beer);
  const chips = b.options.map(o => {
    const on = UI.beer.includes(o.key), use = r.used[o.key] || 0;
    const who = o.kind === "hub" ? `At the port·${T(o.zh)}` : `${o.mine ? "Your own" : pname(S, o.owner)}·${cityZh(o.city)}`;
    const dot = o.kind === "hub" ? "" : `<i class="pdot" style="background:${PCOL[o.owner]}"></i>`;
    const tip = o.kind === "hub" ? "Use port beer to receive the port bonus" : o.mine ? "Your brewery flips when depleted, earning you victory points and income" : "Your rival’s brewery flips when depleted, earning its owner victory points and income";
    return `<button type="button" class="dchip beerchip ${on ? "on" : ""}" data-bk="${o.key}" title="${tip}">${dot}${who} ${cubeHTML("prov", 10)}${on ? `${use}/${o.n}` : o.n}</button>`;
  }).join("");
  const note = r.short ? `<span class="dwarn">${r.short} more beer needed</span>` : "";
  return `<div class="dsel"><span class="dl">Beer: ${b.need} required, used in selection order</span>${chips}${note}</div>`;
}
function pickBeer(k) {
  UI.beer = UI.beer.includes(k) ? UI.beer.filter(x => x !== k) : [...UI.beer, k];
  renderConfirm(); previewSel();
}
function mktSaleText(m, short) {
  if (m.n) return short ? `Sells ${m.n} to market for £${m.money}` : `Sells ${m.n} resources to market when built, earning £${m.money}`;
  if (m.why === "nohub") return short ? "No open port connection; no market sale" : "No connection to an open trade port: coal stays on the tile. Market sales happen only when built; connecting later does not trigger a sale.";
  return short ? "Market full" : "Market full: output stays on the tile";
}
// ---------- 「我的」：高亮自己的产业，其余城市与对手的板件压暗 ----------
function showMine(st, fit) {
  const ids = [...new Set((st.placed || []).filter(p => p.owner === me(st).id).map(p => p.city))];
  map.setTargets(ids.length ? ids : null, "mine");
  $("#map").classList.toggle("showmine", ids.length > 0);
  if (fit && ids.length) map.fitCities(ids, 1.4, 14);
  if (!ids.length && fit) toast("You have no industries on the map yet");
}
function baseTargets() {
  if (UI.mine && S && S.started) { showMine(V() || S, false); return; }
  $("#map").classList.remove("showmine");
  map.setTargets(UI.net && S && S.started && S.reach.length ? S.reach : null, "net");
}
function setMine(on, fit = false) {
  UI.mine = on; $("#btnMine").classList.toggle("on", on);
  if (on) { UI.net = false; $("#btnNet").classList.remove("on"); }
  $("#btnMine").setAttribute("aria-pressed", String(on));
  $("#btnNet").setAttribute("aria-pressed", String(!!UI.net));
  if (on && S && S.started) showMine(V() || S, fit);
  else baseTargets();
}
// ---------- 港口奖励：免费开发（原作由玩家自选，可放弃） ----------
function devBonusHTML(a) {
  const d = a && a.devBonus; if (!d || !devBonusLive(a)) return "";
  const cur = UI.devBonus[0];
  const chips = d.options.map(o => `<button type="button" class="dchip bchip ${cur === o.industry ? "on" : ""}" data-db="${o.industry}">${T(B.industryZh[o.industry])}${ROMAN[o.level] || ""}</button>`).join("") +
    `<button type="button" class="dchip bchip ${cur === "" ? "on" : ""}" data-db="">Discard</button>`;
  return `<div class="dsel"><span class="dl bl">Port bonus: Free development</span>${chips}</div>`;
}
function selAction() { return S && UI.sel !== null ? S.actions.find(a => a.i === UI.sel) : null; }
// ---------- 弃牌（伯明翰规则：每个动作弃 1 张，由玩家选；建造须弃对应的牌；侦查弃 3 张） ----------
function discardSpec() { return null; }
function discardHTML() {
  const d = discardSpec(); if (!d) return "";
  const chips = d.allowed.map(i => {
    const c = S.hand[i]; if (!c) return "";
    return `<button type="button" class="dchip ${UI.discard.includes(i) ? "on" : ""} ${c.kind === "WILD" ? "wild" : ""}" data-di="${i}">${T(c.label)}</button>`;
  }).join("");
  return `<div class="dsel"><span class="dl">Discard${d.n > 1 ? ` (Select ${d.n} cards)` : ""}</span>${chips}</div>`;
}
function pickDiscard(i) {
  const d = discardSpec(); if (!d || !d.allowed.includes(i)) return false;
  if (d.n === 1) UI.discard = [i];
  else if (UI.discard.includes(i)) UI.discard = UI.discard.filter(x => x !== i);
  else UI.discard = [...UI.discard, i].slice(-d.n);
  renderConfirm(); renderHand(S);
  return true;
}
function discardReady() { const d = discardSpec(); return !d || UI.discard.length === d.n; }
function go() {
  if (UI.busy || !discardReady() || !beerReady()) return;
  if (UI.passMode) submit("/api/pass", { discard: UI.discard });
  else if (UI.sel !== null) submit("/api/action", { i: UI.sel, discard: UI.discard, devBonus: UI.devBonus.length && devBonusLive(selAction()) ? UI.devBonus : undefined,
    beer: beerChanged(selAction()) ? UI.beer : undefined });
}
function renderConfirm() {
 const a=selAction(),box=$("#confirm");
 if(UI.passMode){box.innerHTML='<div class="ct"><div class="t1">Pass one action</div><div class="t2">Wait for round-end income. No card or money required.</div></div><button id="btnCancel">Cancel</button><button class="primary" id="btnGo">Confirm ⏎</button>';box.classList.remove("hide");return;}
 if(!a){box.classList.add("hide");return;}
 box.innerHTML=`<div class="ct"><div class="t1">${KIND_ZH[a.kind]}: ${actTitle(a)}</div><div class="t2"><b>£${a.cost} total</b> · ${actGain(a)}</div><div class="t2">${srcHTML(a)} · Uses 1 of your 2 actions</div></div><button id="btnCancel">Cancel</button><button class="primary" id="btnGo">Confirm ⏎</button>`;
 box.classList.remove("hide");
}

function previewSel() {
  const a = selAction();
  if (!a) { map.clearPreview(); return; }
  map.preview(viewAction(a), PCOL[me(S).id]);
}
function selectAction(i, center = true) {
  UI.sel = i; UI.passMode = false;
  const a = selAction(); if (!a) return;
  UI.discard = a.discard ? [...a.discard.default] : [];
  UI.devPick = a.kind === "DEVELOP" ? (a.dev || [a]).map(d => d.industry) : [];
  UI.devBonus = a.devBonus ? [a.devBonus.default || ""] : [];
  UI.beer = a.beer ? [...a.beer.default] : [];
  if (a.kind === "DEVELOP" && UI.tab !== "DEVELOP") { UI.tab = "DEVELOP"; renderActions(); }
  renderHand(S);
  $$("#actlist .act").forEach(b => b.classList.toggle("sel", +b.dataset.i === i));
  renderConfirm(); previewSel();
  if (center) {
    const ids = [a.city, ...(a.link || []), ...(a.second || [])].filter(Boolean);
    if (a.hub) ids.push(a.hub.city);
    map.ensureVisible(ids).then(previewSel);
  }
  if (isMobile()) setSheet("act", true);
}
function clearSel() {
  UI.sel = null; UI.passMode = false; UI.discard = []; UI.devPick = []; UI.devBonus = []; UI.beer = []; map.clearPreview(); renderConfirm();
  if (S && S.started) renderHand(S);
  $$("#actlist .act.sel").forEach(b => b.classList.remove("sel"));
}

// ---------- 板件（玩家面板） ----------
function anyNoDev() { return !!B && Object.values(B.tiles).some(ts => ts.some(t => t.noDev)); }
function nextTile(p, ind) {
  const sup = p.supply[ind] || {};
  const lv = Object.keys(sup).map(Number).filter(l => sup[l] > 0).sort((a, b) => a - b)[0];
  return lv ? B.tiles[ind].find(t => t.level === lv) : null;
}
function needHTML(t) {
  const n = [];
  for (let i = 0; i < t.coal; i++) n.push(cubeHTML("coal", 11));
  for (let i = 0; i < t.iron; i++) n.push(cubeHTML("iron", 11));
  if (t.sellProv) n.push(`<span title="Beer needed to sell">Sell${cubeHTML("prov", 11)}${t.sellProv > 1 ? "×" + t.sellProv : ""}</span>`);
  return n.join("") || "—";
}
function renderMat(st) {
  const p = me(st);
  if (!$("#mat")) return;
  $("#mat").innerHTML = IND_ORDER.map(ind => {
    const t = nextTile(p, ind);
    const left = Object.values(p.supply[ind] || {}).reduce((a, b) => a + b, 0);
    if (!t) return `<div class="mrow2 off"><span class="bi" style="${artCSS(IND_ART[ind])}"></span><span class="bn">${T(B.industryZh[ind])}</span><span></span><span></span><span class="need">Depleted</span><span></span><span></span></div>`;
    const ok = t.era === "BOTH" || t.era === st.era;
    return `<div class="mrow2 ${ok ? "" : "off"}" title="${T(B.industryZh[ind])} ${ROMAN[t.level]}: Cost £${t.cost} · ${t.vp} VP · Income +${t.income} · Links ${t.linkVp}${t.noDev ? " · Cannot be developed" : ""}${ok ? "" : ` (Unavailable in the ${T(st.eraZh)}; develop first)`}">
      <span class="bi" style="${artCSS(IND_ART[ind])}"></span><span class="bn">${T(B.industryZh[ind])}</span>
      <span class="lv${t.noDev ? " nd" : ""}">${ROMAN[t.level]}</span><span class="cost">£${t.cost}</span>
      <span class="need">${needHTML(t)}${ok ? "" : ` <span class="warn">Development required</span>`}</span>
      <span class="give">${t.vp} VP +${t.income}</span><span class="left">×${left}</span></div>`;
  }).join("");
}
function showMatModal(pid) {
 const p=S.players.find(p=>p.id===(pid??0));
 const d=modal(`<button class="x">✕</button><h2>${p.name} · Industry ledger</h2><div class="sub">£${p.money} · Income +£${p.income}/round · ${p.coal} coal · ${p.iron} iron<br>Pollution ${p.pollution}: −${Math.floor(p.pollution/3)} final points · ${p.greenPoints} eco upgrades: +${p.greenPoints*3} final points</div><div class="matgrid">${S.placed.filter(t=>t.owner===p.id).map(t=>`<div class="mcol"><h4><span class="bi" style="${artCSS(IND_ART[t.industry])}"></span>${T(B.industryZh[t.industry])}</h4><div class="tcard"><div class="h">${cityZh(t.city)} · Level ${ROMAN[t.level]}</div><div class="r">${t.flipped?"Sold":"Unsold"} · ${t.ecoUpgraded?"Eco upgraded":"Conventional"}</div></div></div>`).join("")}</div>`);
 d.querySelector(".x").onclick=()=>d.remove();
}

function logHTML(st) {
  let lastRound = null;
  return st.log.map(l => {
    const p = st.players.find(x => x.name === l.who || T(x.name) === l.who);
    let sep = "";
    // 每一轮（包括第 1 轮）都有标题；开局的本土分配不算在任何一轮里
    const rk = l.who === "setup" || /^(★|最终排名)/.test(l.text) ? null : `${l.era}-${l.round}`;
    if (l.round !== undefined && rk !== null && rk !== lastRound)
      sep = `<div class="le round">Combined Era, Round ${l.round}</div>`;
    if (rk !== null) lastRound = rk;
    return sep + `<div class="le ${l.who === "system" || l.who === "setup" ? "sys" : ""} ${l._new ? "new" : ""} ${l.at ? "loc" : ""}"` +
      (l.at ? ` data-at="${l.at.join(",")}" title="Click to locate"` : "") + `>` +
      (p ? `<span class="who" style="color:${PCOL[p.id]}">${T(l.who)}</span>` : "") + T(l.text) +
      (l.why ? ` <span class="why">« ${T(l.why)}</span>` : "") + `</div>`;
  }).join("");
}
function renderLog(st) {
  const h = logHTML(st);
  ["#log", "#log2"].forEach(s => { const e = $(s); e.innerHTML = h; e.scrollTop = 1e6; });
}

// ---------- 提示 ----------
function renderHint() {
 const el=$("#hint"),st=S;if(!st)return;
 el.textContent=st.over?"Eight rounds complete. Highest final score wins.":st.actions.some(a=>a.kind==="SELL")?"Ready to sell: earn cash, income and victory points.":`Round ${st.round}/8 · ${st.actionsLeft} actions left. Select a city or route, choose an action, then confirm.`;
 el.classList.remove("hide","hint-port");
}

function showTip(html) { const t = $("#tip"); t.innerHTML = html; t.classList.remove("hide"); }
function hideTip() { $("#tip").classList.add("hide"); }
function cityTip(id) {
 const c=city(id),st=V();if(!c||!st)return;
 const tiles=st.placed.filter(t=>t.city===id);
 let h=`<b>${cityZh(id)}</b><div class="sl">${T(c.regionZh)} · City pollution ${st.eco.pollution[id]||0}</div>`;
 h+=c.slots.map((sl,i)=>{const t=tiles.find(t=>t.slot===i);return t?`<div class="row" style="color:${PCOL[t.owner]}">${T(B.industryZh[t.industry])} ${ROMAN[t.level]} · ${pname(st,t.owner)}<span class="sl"> · ${t.flipped?"Sold":"Unsold"}${t.ecoUpgraded?" · Eco":""}</span></div>`:`<div class="row sl">${sl.map(ind=>T(B.industryZh[ind])).join(" / ")} · Empty</div>`;}).join("");
 h+='<div class="sl">'+(st.reach.includes(id)?"In your network. Select this city to see actions.":"Outside your network. Build a connection reaching this city first.")+'</div>';
 showTip(h);
}

function linkTip(key) {
 const [a,b]=key.split("|"),st=V();if(!st)return;
 const owner=st.builtLinks.find(l=>[l.a,l.b].sort().join("|")===key);
 showTip(`<b>${cityZh(a)} — ${cityZh(b)}</b><div class="sl">${owner?`Owned by ${pname(st,owner.owner)} · ${owner.eco?"Clean transport":"Conventional transport"}`:"Conventional: £5 + 1 coal, +1 pollution. Clean: £8, no coal, no pollution. Both earn 2 victory points."}</div>`);
}

function onMapHover(hit) {
  if (UI.card !== null) return;
  if (!hit) { if (UI.sel === null) hideTip(); return; }
  if (hit.city) cityTip(hit.city); else if (hit.link) linkTip(hit.link);
}
function onMapClick(hit) {
  if (UI.playing) return;
  if (!hit) { UI.card = null; baseTargets(); hideCardPop(); $$(".pcard").forEach(x => { x.classList.remove("sel"); x.setAttribute("aria-pressed", "false"); }); if (UI.filter) { UI.filter = null; renderActions(); } hideTip(); return; }
  if (hit.city) cityTip(hit.city); else linkTip(hit.link);
  if (!S || S.over || S.active !== me(S).id) return;
  let acts = [];
  if (hit.city) {
    acts = S.actions.filter(a => a.city === hit.city);
    if (hit.slot !== null && hit.slot !== undefined) {
      const bySlot = acts.filter(a => a.slot === hit.slot);
      if (bySlot.length) acts = bySlot;
    }
    UI.filter = { city: hit.city };
  } else {
    acts = S.actions.filter(a => [a.link, a.second].filter(Boolean).some(k => [...k].sort().join("|") === hit.link));
    UI.filter = { link: hit.link };
  }
  if (!acts.length) {
    UI.filter = null; renderActions();
    toast(hit.city ? `${cityZh(hit.city)}: no actions available. See the tooltip for details.` : `This link cannot be built in the ${T(S.eraZh)}`);
    return;
  }
  UI.tab = acts[0].kind;
  renderActions();
  if (acts.length === 1) selectAction(acts[0].i, false);
  else if (isMobile()) setSheet("act", true);
}

// ================= 回放（AI 行动逐条上图） =================
const DUR = ms => ms * (SET.speed || 1);
function screenOfCity(id, slot) { const p = map.slotPos(id, slot); return map.worldToScreen(p.x, p.y); }
function screenOfPlayer(pid, sel = ".vp") {
  const e = document.querySelector(`.pl[data-p="${pid}"] ${sel}`) || document.querySelector(`.pl[data-p="${pid}"]`);
  if (!e) return { x: innerWidth / 2, y: 80 };
  const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function screenOfMarket(zone) {
  const e = document.querySelector(`#markets .mz[data-zone="${zone}"]`);
  if (!e || !e.offsetParent) return { x: innerWidth - 60, y: 70 };
  const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function flyCube(kind, from, to, delay = 0, dur = 520) {
  if (document.hidden || UI.skip) return Promise.resolve();
  return new Promise(res => setTimeout(() => {
    const e = document.createElement("div");
    e.className = "fxcube";
    e.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16"><use href="#cube-${kind}"/></svg>`;
    $("#fx").appendChild(e);
    const t0 = performance.now(), D2 = DUR(dur);
    // 兜底：页面切到后台时浏览器会暂停动画帧，不兜底的话回放会永远卡在这一块方块上
    let done = false;
    const finish = () => { if (!done) { done = true; e.remove(); res(); } };
    setTimeout(finish, D2 + 400);
    const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - 60;
    const step = now => {
      const k = Math.min(1, (now - t0) / D2), e2 = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const x = (1 - e2) * (1 - e2) * from.x + 2 * (1 - e2) * e2 * mx + e2 * e2 * to.x;
      const y = (1 - e2) * (1 - e2) * from.y + 2 * (1 - e2) * e2 * my + e2 * e2 * to.y;
      e.style.left = x + "px"; e.style.top = y + "px";
      if (k < 1 && !done) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
  }, DUR(delay)));
}
function floatText(pos, text, color = "#f0d49a") {
  const e = document.createElement("div");
  e.className = "fxtext"; e.textContent = T(text); e.style.color = color;
  e.style.left = pos.x + "px"; e.style.top = pos.y + "px";
  e.style.animationDuration = DUR(1500) + "ms";
  $("#fx").appendChild(e); setTimeout(() => e.remove(), DUR(1600));
}
function ringAt(pos, color) {
  const e = document.createElement("div"); e.className = "fxring";
  e.style.left = pos.x + "px"; e.style.top = pos.y + "px"; if (color) e.style.borderColor = color;
  $("#fx").appendChild(e); setTimeout(() => e.remove(), 950);
}
function banner(text) {
  const b = $("#banner"); b.textContent = T(text); b.classList.remove("hide");
  b.style.animation = "none"; b.getBoundingClientRect(); b.style.animation = "";
  clearTimeout(banner._t); banner._t = setTimeout(() => b.classList.add("hide"), 1500);
}

function deep(o) { return JSON.parse(JSON.stringify(o)); }

async function playEvents(events, final) {
  UI.playing = true; UI.skip = false;
  UI.stepN = 0; UI.stepTotal = events.filter(e => (e.t === "act" || e.t === "pass") && e.p !== me(S).id).length;
  clearSel(); UI.card = null; $$(".pcard").forEach(x => { x.classList.remove("sel"); x.setAttribute("aria-pressed", "false"); }); baseTargets(); hideCardPop();
  D = deep(S);
  D.hand = final.hand;             // 手牌直接换成新的（弃牌 / 补牌不做逐张动画）
  renderActions(); renderTop(D); renderHint();     // 回放期间不挂给你的提示
  $("#playbar").classList.remove("hide");
  try {
    for (const ev of events) {
      if (UI.skip || document.hidden) break;       // 切到后台就不再逐条播放，回来直接看结果
      await playOne(ev, final);
    }
  } catch (e) { console.error(e); }
  $("#playbar").classList.add("hide"); $("#playbar").classList.remove("waiting");
  $("#fx").innerHTML = "";
  UI.waitTap = null;
  UI.playing = false;
}
function setPlaybar(pid, waiting = false) {
  const p = D.players.find(x => x.id === pid);
  const step = UI.stepTotal > 1 ? `<span class="pstep" title="AI action replay progress">${UI.stepN}/${UI.stepTotal}</span>` : "";
  $("#playwho").innerHTML = !p ? "" : waiting
    ? `${avatarHTML(p.avatar, PCOL[p.id], 24)}<span style="color:${PCOL[p.id]}">${T(p.name)}</span>${step}<span class="ptap">Click anywhere to continue ▸</span>`
    : `${avatarHTML(p.avatar, PCOL[p.id], 24)}<span style="color:${PCOL[p.id]}">${T(p.name)}</span> ActionMedium…`;
  $("#playbar").classList.toggle("waiting", waiting);
}
// 逐步播放：AI 的每个动作播完后停住（地图高亮、行动卡片都保留），点屏幕任意处（或空格、回车）继续。
// 拖动、缩放地图不算点击；点按钮、玩家卡、手牌、弹窗时照常执行它们自己的功能，不继续。
function waitTap(pid) {
  if (!SET.step || UI.skip || document.hidden) return Promise.resolve();
  setPlaybar(pid, true);
  return new Promise(res => { UI.waitTap = () => { UI.waitTap = null; $("#playbar").classList.remove("waiting"); res(); }; });
}
function continueTap() { if (UI.waitTap) UI.waitTap(); }
function applyDeltas(ev) {
  const bump = {};
  ["money", "vp", "income"].forEach(k => {
    Object.entries(ev["d" + k] || {}).forEach(([pid, dv]) => {
      const p = D.players.find(x => x.id === +pid); if (!p) return;
      p[k] += dv; if (k === "vp") bump[p.id] = 1;
    });
  });
  return bump;
}
async function playOne(ev, final) {
  if ((ev.t === "turn" || ev.t === "yourturn") && D._strip) {
    orderStrip(D, D._strip, D.round); D._strip = null;
    await sleep(DUR(1500));
  }
  if (ev.t === "turn") {
    D.active = ev.p; setPlaybar(ev.p);
    renderPlayers(D);
    const pl = document.querySelector(`.pl[data-p="${ev.p}"]`);
    if (pl) { pl.classList.remove("turnfx"); void pl.offsetWidth; pl.classList.add("turnfx"); }
    return sleep(DUR(520));
  }
  if (ev.t === "yourturn") {
    D.active = me(D).id;
    renderPlayers(D);
    return yourTurnFx(final.actionsLeft);
  }
  if (ev.t === "pass") {
    D.log.push({ who: D.players.find(p => p.id === ev.p).name, text: "Pass", _new: 1 }); renderLog(D);
    if (ev.p === me(D).id) return sleep(DUR(500));
    UI.stepN += 1;
    const card = actFeed(ev.p, "Pass", "", SET.step);
    await sleep(DUR(300));
    await waitTap(ev.p);
    fadeFeed(card);
    return;
  }
  if (ev.t === "round") {
    Object.entries(ev.income || {}).forEach(([pid, v]) => {
      const p = D.players.find(x => x.id === +pid); if (!p) return;
      p.money += v;
    });
    Object.entries(ev.debt || {}).forEach(([pid, v]) => { const p = D.players.find(x => x.id === +pid); if (p) p.vp += v; });
    D.turnOrder = ev.order; D.round = (ev.round || D.round) + 1;
    renderPlayers(D); renderTop(D);
    Object.entries(ev.income || {}).forEach(([pid, v]) => {
      if (v) floatText(screenOfPlayer(+pid, ".money"), (v > 0 ? "+£" : "−£") + Math.abs(v), v > 0 ? "#b9e3a7" : "#f09a8a");
    });
    D.log.push({ who: "system", text: `Round ${ev.round} ends: income paid; lower spending acts earlier next round`, _new: 1 }); renderLog(D);
    D._strip = ev.order;              // 等下一位玩家开始时再显示顺位条（时代交替的画面要先播完）
    return sleep(DUR(700));
  }
  if (ev.t === "era") return eraSplash(ev);
  if (ev.t !== "act") return;

  const pid = ev.p, col = PCOL[pid], isMe = pid === me(D).id;
  D.active = pid;
  if (!isMe) setPlaybar(pid);
  // 镜头跟随：只在目标不在视野里时移动
  const focus = [ev.city, ...(ev.link || []), ...(ev.second || []), ...(ev.coal || []).map(s => s.city)].filter(Boolean);
  if (!isMe && SET.follow && focus.length) await map.ensureVisible(focus);
  map.preview(ev, col);
  if (!isMe) UI.stepN += 1;
  const card = isMe ? null : actFeed(pid, describeAction(ev, B), ev.why, SET.step);
  await sleep(DUR(isMe ? 120 : 650));

  const tgt = ev.city ? screenOfCity(ev.city, ev.kind === "BUILD" || ev.kind === "SELL" ? ev.slot : null)
    : ev.link ? (() => { const m = map.linkMid([...ev.link].sort().join("|")); return m ? map.worldToScreen(m.x, m.y) : screenOfPlayer(pid); })()
      : screenOfPlayer(pid);
  const zone = ev.city ? (city(ev.city) || {}).zone : ev.link ? (city(ev.link[0]) || {}).zone : null;
  // 资源飞过去：来自板件或来自市场
  const flights = [];
  let k = 0;
  ["coal", "iron", "prov"].forEach(r => (ev[r] || []).forEach(s => {
    for (let j = 0; j < s.n; j++) flights.push(flyCube(r, screenOfCity(s.city, s.slot), tgt, (k++) * 110));
  }));
  for (let j = 0; j < (ev.mktCoal || 0); j++) flights.push(flyCube("coal", screenOfMarket(zone || "BRITAIN"), tgt, (k++) * 110));
  for (let j = 0; j < (ev.mktIron || 0); j++) flights.push(flyCube("iron", screenOfMarket(zone || "BRITAIN"), ev.kind === "DEVELOP" ? screenOfPlayer(pid) : tgt, (k++) * 110));
  if (flights.length) await Promise.all(flights);

  // 把结果写进显示状态
  if (ev.kind === "BUILD") {
    D.placed = D.placed.filter(p => !(p.city === ev.city && p.slot === ev.slot));
    D.placed.push({ city: ev.city, slot: ev.slot, owner: pid, industry: ev.industry, level: ev.level, flipped: false, resources: ev.produces || 0 });
    const P = D.players.find(x => x.id === pid); if (P) P.tiles += 1;
  }
  if (ev.kind === "NETWORK") {
    [ev.link, ev.second].filter(Boolean).forEach(l => D.builtLinks.push({ a: l[0], b: l[1], owner: pid }));
    const P = D.players.find(x => x.id === pid); if (P) P.links += ev.second ? 2 : 1;
  }
  (ev.after || []).forEach(t => {
    const i = D.placed.findIndex(p => p.city === t.city && p.slot === t.slot);
    if (i >= 0) D.placed[i] = Object.assign(D.placed[i], t); else D.placed.push(t);
  });
  (ev.flipped || []).forEach(([c, s]) => { const t = D.placed.find(p => p.city === c && p.slot === s); if (t) t.flipped = true; });
  if (ev.kind === "DEVELOP") {
    const P = D.players.find(x => x.id === pid);
    (ev.dev || [ev]).forEach(d => { if (P && P.supply[d.industry] && P.supply[d.industry][d.level]) P.supply[d.industry][d.level] -= 1; });
  }
  if (ev.kind === "BUILD") {
    const P = D.players.find(x => x.id === pid);
    if (P && P.supply[ev.industry] && P.supply[ev.industry][ev.level]) P.supply[ev.industry][ev.level] -= 1;
  }
  (ev.pairs || []).forEach(pr => D.linkedPairs.push(pr));
  (ev.claimed || []).forEach(c => { const h = D.hubs.find(x => x.id === c.hub); if (h) h.claimedBy = c.by; });
  const bump = applyDeltas(ev);
  D.log.push({ who: D.players.find(p => p.id === pid).name, text: describeAction(ev, B), why: ev.why, _new: 1,
    at: [ev.city, ...(ev.link || []), ...(ev.second || [])].filter(Boolean) });

  map.clearPreview();
  map.setState(D, me(D).id);
  renderPlayers(D, bump); renderLog(D); renderMat(D);
  if (ev.kind === "BUILD" || ev.kind === "SELL") { map.popSlot(ev.city, ev.slot); ringAt(screenOfCity(ev.city, ev.slot), col); }
  (ev.sells || []).slice(1).forEach(s => { map.popSlot(s.city, s.slot); ringAt(screenOfCity(s.city, s.slot), col); });
  if (ev.kind === "NETWORK") [ev.link, ev.second].filter(Boolean).forEach(l => map.flashLink([...l].sort().join("|"), col));
  // 数字飘字：钱、收入、分
  const dm = (ev.dmoney || {})[pid];
  if (dm) floatText(screenOfPlayer(pid, ".money"), (dm > 0 ? "+£" : "−£") + Math.abs(dm), dm > 0 ? "#b9e3a7" : "#f0b08a");
  const di = (ev.dincome || {})[pid];
  if (di) setTimeout(() => floatText(screenOfPlayer(pid, ".r2"), `Income ${di > 0 ? "+" : ""}${di}`, di > 0 ? "#b9e3a7" : "#f09a8a"), DUR(260));
  if (ev.kind === "SELL") floatText(tgt, "Sold！", "#ffe39a");
  // 煤铁建成立刻卖给市场：方块从板件飞回市场
  if (ev.kind === "BUILD" && ["COAL", "IRON"].includes(ev.industry)) {
    const after = (ev.after || []).find(t => t.city === ev.city && t.slot === ev.slot);
    const sold = after ? (ev.produces || 0) - after.resources : 0;
    for (let j = 0; j < sold; j++) flyCube(ev.industry === "COAL" ? "coal" : "iron", tgt, screenOfMarket(zone), 200 + j * 90, 480);
  }
  Object.entries(ev.dmoney || {}).forEach(([op, v]) => {       // 被取用资源的对手也有反应
    if (+op !== pid && v) floatText(screenOfPlayer(+op, ".money"), (v > 0 ? "+£" : "−£") + Math.abs(v), "#b9e3a7");
  });
  (ev.notes || []).forEach(n => { if (!n.startsWith("取用")) toast(n); });
  if (!isMe && SET.step && !UI.skip && !document.hidden) {
    await sleep(DUR(450));                          // 飘字、方块先播完
    map.preview(ev, col);                           // 停住时继续标出这一步动了哪里、资源从哪来
    await waitTap(pid);
    map.clearPreview(); fadeFeed(card);
    return;
  }
  await sleep(DUR(isMe ? 420 : 1150));
}

function eraSplash(ev) {
  return new Promise(res => {
    const d = document.createElement("div"); d.id = "eraSplash";
    const rows = D.players.map(p => {
      const g = ev.gain[p.id] || {};
      const tot = Object.values(g).reduce((a, b) => a + b, 0);
      const parts = [["tiles", "Tiles"], ["links", "Links"], ["contested", "Shared cities"]].filter(([k]) => g[k]).map(([k, z]) => `${z} ${g[k]}`).join(" · ");
      return `<div class="g">${avatarHTML(p.avatar, PCOL[p.id], 42)}<div class="n" style="color:${PCOL[p.id]}">${T(p.name)}</div>
        <div class="v">+${tot}</div><div class="d">${parts || "—"}</div><div class="d">Total ${ev.vp[p.id]} VP</div></div>`;
    }).join("");
    d.innerHTML = `<h2>${T(ev.eraZh)} ends</h2><p>Flipped tiles score; links score the link values of flipped tiles at both ends</p><div class="gains">${rows}</div>
      <p>${ev.final ? "The final ledger" : "Entering the Steam Era: level I tiles and all links will be removed"}</p><button class="primary">Continue</button>`;
    document.body.appendChild(d);
    D.players.forEach(p => { p.vp = ev.vp[p.id]; });
    renderPlayers(D);
    const done = () => {
      d.remove();
      if (ev.next) {
        D.placed = D.placed.filter(p => p.level > 1);
        D.builtLinks = []; D.era = "E2"; D.eraZh = "蒸汽时代"; D.round = 1;
        map.setState(D, me(D).id); renderTop(D);
      }
      res();
    };
    d.querySelector("button").onclick = done;
    if (!SET.step || UI.skip) setTimeout(() => { if (d.isConnected) done(); }, UI.skip ? 10 : DUR(ev.final ? 2800 : 4200));
  });
}


// ================= 开局与回合的节奏：抽顺位 → 开始 → 逐个回放 → 轮到你 =================
function pInfo(st, pid) { return st.players.find(x => x.id === pid); }
function clickOrWait(el, ms) {           // 点一下或等够时间就继续；跳过动画时立即继续
  return new Promise(res => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    el.addEventListener("click", fin);
    setTimeout(fin, UI.skip ? 10 : ms);
  });
}
// 顺位抽取：四张牌背洗一下，再依次翻开；你的那张高亮，并说明你第几个行动
async function orderDraw(st) {
  const order = st.turnOrder, meId = me(st).id, pos = order.indexOf(meId) + 1;
  const d = document.createElement("div"); d.id = "orderDraw";
  d.innerHTML = `<h2>Drawing turn order</h2><div class="sub">The turn order for Round 1 is determined randomly.</div>
    <div class="odcards">${order.map((pid, i) => {
      const p = pInfo(st, pid);
      return `<div class="odc ${pid === meId ? "me" : ""}" style="--c:${PCOL[pid]};--i:${i}"><div class="in">
        <div class="back"></div>
        <div class="front"><span class="no">${i + 1}</span>${avatarHTML(p.avatar, PCOL[pid], 54)}<b style="color:${PCOL[pid]}">${p.isMe ? "You" : T(p.name)}</b></div>
      </div></div>`;
    }).join("")}</div>
    <div class="cap"></div><div class="hintc">Click to continue</div>`;
  document.body.appendChild(d);
  await sleep(UI.skip ? 0 : DUR(900));                      // 洗牌
  const cards = [...d.querySelectorAll(".odc")];
  for (const c of cards) { c.classList.add("flip"); await sleep(UI.skip ? 0 : DUR(380)); }
  d.querySelector(".cap").innerHTML = pos === 1 ? `You act <b>first</b>` :
    `You act in position <b>${pos}</b>. Watch ${pos - 1} rivals take their turns before you.`;
  d.classList.add("done");
  await clickOrWait(d, DUR(2600));
  d.classList.add("out"); await sleep(UI.skip ? 0 : 280); d.remove();
}
// 开场：时代与轮次
async function startSplash(st) {
  const d = document.createElement("div"); d.id = "startSplash";
  d.innerHTML = `<div class="t1">${T(st.eraZh)}</div><div class="t2">The world opens</div>
    <div class="t3">Round 1: 1 action per player · Subsequent rounds: 2 actions per player</div>`;
  document.body.appendChild(d);
  await clickOrWait(d, DUR(1900));
  d.classList.add("out"); await sleep(UI.skip ? 0 : 320); d.remove();
}
// 每轮开始：顺位条（花钱少的先行动）
function orderStrip(st, order, round) {
  const old = $("#orderStrip"); if (old) old.remove();
  const meId = me(st).id;
  const d = document.createElement("div"); d.id = "orderStrip";
  d.innerHTML = `<span class="rd">${T(st.eraZh)}, Round ${round}</span>` + order.map((pid, i) => {
    const p = pInfo(st, pid);
    return `<span class="os ${pid === meId ? "me" : ""}" style="--c:${PCOL[pid]}"><i>${i + 1}</i>${avatarHTML(p.avatar, PCOL[pid], 26)}<b>${p.isMe ? "You" : T(p.name)}</b></span>`;
  }).join(`<span class="ar">›</span>`) + `<span class="why">Lowest spending last round goes first</span>`;
  $("#mapwrap").appendChild(d);
  setTimeout(() => d.classList.add("out"), DUR(2600));
  setTimeout(() => d.remove(), DUR(2600) + 400);
}
// 「记录」按钮下方的行动卡片：谁做了什么、为什么；几秒后自动消失
function actFeed(pid, text, why, sticky = false) {
  const box = $("#actfeed"), st = V(), p = st && pInfo(st, pid); if (!box || !p) return null;
  const e = document.createElement("div"); e.className = "afc"; e.style.setProperty("--c", PCOL[pid]);
  e.innerHTML = `<div class="h">${avatarHTML(p.avatar, PCOL[pid], 22)}<b style="color:${PCOL[pid]}">${p.isMe ? "You" : T(p.name)}</b></div>
    <div class="t">${T(text)}</div>${why ? `<div class="w">${T(why)}</div>` : ""}`;
  box.appendChild(e);
  while (box.children.length > 3) box.firstElementChild.remove();
  if (!sticky) fadeFeed(e, DUR(4200));
  return e;
}
function fadeFeed(e, ms = 2600) {
  if (!e) return;
  setTimeout(() => e.classList.add("out"), ms);
  setTimeout(() => e.remove(), ms + 450);
}
// 轮到你：屏幕边缘泛出你的颜色，中间弹出提示，手牌和行动区闪一下
async function yourTurnFx(n) {
  const st = V(); if (!st) return;
  const p = me(st), col = PCOL[p.id];
  const d = document.createElement("div"); d.id = "yourTurn"; d.style.setProperty("--c", col);
  d.innerHTML = `<div class="pill">${avatarHTML(p.avatar, col, 40)}<div><b>Your turn</b><span>${n || st.actionsLeft || 2} ${(n || st.actionsLeft || 2) === 1 ? "action" : "actions"} this turn</span></div></div>`;
  document.body.appendChild(d);
  ["#handPane", "#actPane"].forEach(s => { const el = $(s); if (el) { el.classList.remove("attn"); void el.offsetWidth; el.classList.add("attn"); } });
  setTimeout(() => d.classList.add("out"), 1500);
  setTimeout(() => d.remove(), 2000);
  await sleep(UI.skip ? 0 : 700);
}
async function playOpening(st) {
  const op = st.opening;
  saveLocal(st);
  if (!op || SET.reduceMotion) { S = st; D = null; renderAll(); return; }
  S = op; D = null; renderAll();                 // 谁都还没行动时的局面
  await map.focusRegion(me(op).home);
  UI.skip = false;
  await orderDraw(op);
  await startSplash(op);
  await playEvents(st.events || [], st);
  S = st; D = null; renderAll();
}

// ================= 背景音乐 =================
// tools/make_bgm.py 合成：文件 = 曲尾 1 秒 + 完整一遍 108 秒 + 曲头 1 秒，只在中间那段循环，
// MP3 首尾的编码空白就落在循环区外，接缝无缝。浏览器要等玩家第一次点击或按键后才允许出声。
const BGM_PAD = 1.0, BGM_LOOP = 108.0;
const BGM = { ctx: null, gain: null, src: null, buf: null, loading: null };
async function bgmStart() {
  if (!SET.music) return;
  try {
    if (!BGM.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      BGM.ctx = new AC(); BGM.gain = BGM.ctx.createGain(); BGM.gain.gain.value = 0; BGM.gain.connect(BGM.ctx.destination);
    }
    if (BGM.ctx.state === "suspended") await BGM.ctx.resume();
    if (!BGM.buf) {
      BGM.loading = BGM.loading || fetch("/assets/bgm.mp3").then(r => r.arrayBuffer())
        .then(a => new Promise((ok, bad) => BGM.ctx.decodeAudioData(a, ok, bad)));
      BGM.buf = await BGM.loading;
    }
    if (!SET.music) return;                                   // 下载期间被关掉了
    if (!BGM.src) {
      const s = BGM.ctx.createBufferSource();
      s.buffer = BGM.buf;
s.loop = true;
s.loopStart = 0;
s.loopEnd = BGM.buf.duration;
s.connect(BGM.gain);
s.start(0);
BGM.src = s;
    }
    bgmRamp(+SET.vol || 0.35, 2.5);
  } catch (e) { }
}
function bgmRamp(to, sec) {
  if (!BGM.ctx) return;
  const g = BGM.gain.gain, now = BGM.ctx.currentTime;
  g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(to, now + sec);
}
function bgmToggle(on = !SET.music) {
  SET.music = on; savePrefs();
  if (on) bgmStart(); else bgmRamp(0, 0.6);
  const b = $("#btnMusic"); b.classList.toggle("on", on); b.title = on ? "Background music: on (M)" : "Background music: off (M)";
}
function bgmBind() {
  const b = $("#btnMusic"); b.classList.toggle("on", !!SET.music);
  b.onclick = e => { e.stopPropagation(); bgmToggle(); };
  const first = () => { removeEventListener("pointerdown", first, true); removeEventListener("keydown", first, true); bgmStart(); };
  addEventListener("pointerdown", first, true); addEventListener("keydown", first, true);
  document.addEventListener("visibilitychange", () => {         // 切到别的标签页时暂停
    if (!BGM.ctx) return;
    if (document.hidden) BGM.ctx.suspend(); else if (SET.music) BGM.ctx.resume();
  });
}

// ================= 弹层 =================
function modal(html, cls = "") {
  const d = document.createElement("div"); d.className = "overlay";
  d.innerHTML = `<div class="modal ${cls}">${html}${S && S.eco && (html.includes("<h2>How to play</h2>") || html.includes("<h2>Rules</h2>")) ? ECO_RULES_HTML : ""}</div>`;
  document.body.appendChild(d);
  d.addEventListener("click", e => { if (e.target === d && !d.dataset.sticky) d.remove(); });
  return d;
}
function seg(name, opts, cur) {
  const labels = { contrastMode: "Contrast mode", largeText: "Text size", reduceMotion: "Animation" };
  return `<div class="seg" role="group" aria-label="${labels[name] || name}" data-name="${name}">${opts.map(([v, t]) => {
    const selected = String(v) === String(cur);
    return `<button type="button" data-v="${v}" class="${selected ? "on" : ""}" aria-pressed="${selected}">${t}</button>`;
  }).join("")}</div>`;
}
function bindSeg(root, onChange) {
  root.querySelectorAll(".seg").forEach(s => s.querySelectorAll("button").forEach(b => b.onclick = () => {
    s.querySelectorAll("button").forEach(x => {
      const selected = x === b;
      x.classList.toggle("on", selected);
      x.setAttribute("aria-pressed", String(selected));
    });
    onChange(s.dataset.name, b.dataset.v);
  }));
}
function showNewGame() {
 const ls=localSave();let avatar=SET.avatar||"uk";
 const d=modal(`<h2>EcoBrass — An Industrial Atlas</h2><div class="sub">The original Atlas. A simpler industrial age.<br>80 cities · 8 rounds · You and three novice AI rivals</div><div class="eco-start-note">Two actions each turn: Build, Connect, Develop or Sell. Begin with £30, 3 coal, 3 iron, £3 income and a starter industry. Eco upgrades and cleaner transport reward sustainable growth.</div><div class="field"><label>Your portrait</label><div class="avgrid">${AVATARS.map(k=>`<button class="avopt ${k===avatar?"on":""}" data-av="${k}">${avatarHTML(k,"#c9a15a",44)}<span>${AVATAR_ZH[k]}</span></button>`).join("")}</div></div><div class="btns">${S?.started?'<button id="ngCancel">Return to game</button>':""}${ls?'<button id="ngResume">Resume EcoBrass</button>':""}<button class="primary" id="ngGo">Begin the game</button></div>`);
 if(!S?.started)d.dataset.sticky="1";
 d.querySelectorAll("[data-av]").forEach(b=>b.onclick=()=>{avatar=b.dataset.av;d.querySelectorAll("[data-av]").forEach(x=>x.classList.toggle("on",x===b));});
 d.querySelector("#ngCancel")?.addEventListener("click",()=>d.remove());
 d.querySelector("#ngResume")?.addEventListener("click",async()=>{d.remove();await resumeLocal();});
 d.querySelector("#ngGo").onclick=async()=>{
  try{SET.avatar=avatar;SET.mode="hackathon";SET.level="easy";savePrefs();
  const st=await api("/api/new",{avatar,hints:!!SET.hints});d.remove();$$("#final").forEach(x=>x.remove());PREV_CLEAR();UI.tab="NETWORK";await applyState(st,false);await map.focusRegion(me().home);
  if(!localStorage.getItem("ecobrass_hackathon_seen")){showHelp();localStorage.setItem("ecobrass_hackathon_seen","1");}
  }catch(e){toast(e.message);}
 };
}

const STEPS = () => rules;
// ---------- 玩法：先问会不会玩伯明翰，再讲规则或差异，最后逐一指认界面 ----------
const KEYS_LINE = `<div class="sub" style="margin:12px 0 0">Keyboard: Enter — confirm · Esc — cancel · AI turns: Space / Enter — next, Esc — skip replay · F — world · H — home · I — my industries · M — music</div>`;
const ECO_RULES_HTML = `<section class="eco-help"><h3>Eco Mode · Environmental rules</h3><ul><li>On Sell: cotton +1, manufacturing +2, pottery +3 city pollution (cap 10).</li><li>At pollution 6–10, every player's new Build costs an extra £5.</li><li>Clean Up: £5 + one action + one discard; reduce pollution by 3 in a city with your factory.</li><li>Eco Upgrade: £8 + one action + one discard; upgrade your unsold sales factory once. Its sale emits 2 less pollution, minimum zero.</li><li>Sell an upgraded factory: gain 2 green points, once. Each converts to 1 VP only at final scoring.</li><li>Pollution persists across eras. Coal, iron and breweries do not emit in this version.</li></ul><p>Eco runs a newly implemented world engine and heuristic AI. Classic retains the original online engine. See ECO_README_CN.md for compatibility limits.</p></section>`;
function showHelp() {
 const lessons=[
 ["Your first two actions","Click <b>Connect</b> and choose a route touching Manchester, your starter industry's city. Choose conventional (£5 + 1 coal) or clean (£8). Confirm, then click <b>Sell</b> and sell the starter industry for £10, 3 victory points and +£1 income."],
 ["Build your economy","Start in your home region and expand along your own routes. Build in matching empty city slots. Cash and coal/iron costs are shown before confirmation. Coal mines and ironworks produce 2 × level resources every round; breweries add £1 income when built."],
 ["Develop or go green","On Develop, upgrade an unsold industry's level for £5 + 1 iron: gain 2 points and improve its sale. Or choose an eco retrofit for £6 + 1 iron: remove up to 2 pollution, gain 3 final points, and sell without coal or emissions. Level III is the maximum."],
 ["Sell and collect income","Every industry may sell once, after one of your own routes reaches its city. Earn £(8 + 2 × level), 3 × level points, and +£level income. Non-eco sales use 1 coal and add 1 pollution. Missing coal or iron is delivered automatically for £2 each; the total action price includes it."],
 ["Win after eight rounds","You and three novice AIs take two actions per turn in fixed order. At each round end, everyone receives income and coal/iron production. All industries and routes survive the combined era. Final score = earned points + 3 per eco retrofit − floor(pollution ÷ 3). Ties use income, then cash; exact ties share victory."],
 ["Read the original Atlas","Click cities or routes to filter actions, and clear the filter to see all choices. The illustrated hand is a reference guide; no card matching or discards. Pass waits for income. The original map, portraits and card art remain. Points earned now appear immediately; green bonuses and pollution penalties settle once at the end."]];
 const d=modal(`<button class="x">✕</button><h2>How to play EcoBrass</h2><div class="sub">One industrial age · Eight rounds · Two actions each turn</div>${stepsHTML(lessons)}<div class="btns"><button class="primary" id="hpClose">Start building →</button></div>`);
 d.querySelectorAll(".x,#hpClose").forEach(b=>b.onclick=()=>d.remove());
}

const DIFFS = differences;
function stepsHTML(list) {
  return list.map((s, i) => `<div class="step"><div class="n">${i + 1}</div><div class="t"><b>${s[0]}</b><div class="d">${s[1]}</div></div></div>`).join("");
}
function showDiffs() { showHelp(); return;
  const d = modal(`<button class="x">✕</button><h2>The world-map variant</h2>
    <div class="sub">All other rules follow Brass: Birmingham.</div>${stepsHTML(DIFFS)}
    <div class="btns"><button id="hpAll">Read all rules</button><button class="primary" id="hpTour">Explore the interface →</button></div>`);
  d.querySelector(".x").onclick = () => d.remove();
  d.querySelector("#hpAll").onclick = () => { d.remove(); showRules(false); };
  d.querySelector("#hpTour").onclick = () => { d.remove(); startTour(false); };
}
function showRules(novice = true) { showHelp(); return;
  const d = modal(`<button class="x">✕</button><h2>Rules</h2>
    <div class="sub">Brass: Birmingham rules · World map · Progress autosaved in this browser</div>${stepsHTML(STEPS())}${KEYS_LINE}
    <div class="btns"><button id="hpClose">Close</button><button class="primary" id="hpTour">Explore the interface →</button></div>`);
  d.querySelectorAll(".x,#hpClose").forEach(b => b.onclick = () => d.remove());
  d.querySelector("#hpTour").onclick = () => { d.remove(); startTour(novice); };
}

// 界面导览：遮罩上挖一个洞露出目标区域，旁边放说明。手机上目标在底部标签页里，先切过去。
function tourStops(novice) {
  const n = (a, b) => novice ? a + b : a;
  return [
    { sel: "#mapwrap", title: tour["地图"][0], text: tour["地图"][1] },
    { sel: "#handPane", pane: "hand", title: tour["手牌"][0], text: tour["手牌"][1] },
    { sel: "#actPane", pane: "act", title: tour["可选行动"][0], text: tour["可选行动"][1] },
    { sel: "#matPane", pane: "mat", title: tour["板件"][0], text: tour["板件"][1] },
    { sel: "#markets", msel: "#mktPane", pane: "mkt", title: tour["四个煤铁市场"][0], text: tour["四个煤铁市场"][1] },
    { sel: "#players", title: tour["玩家信息"][0], text: tour["玩家信息"][1] },
    { sel: "#btnLog", msel: '#sheetTabs button[data-pane="log"]', title: tour["行动记录"][0], text: tour["行动记录"][1] },
  ];
}
function startTour(novice) {
  const stops = tourStops(novice);
  let k = 0;
  const box = document.createElement("div"); box.className = "coach";
  box.innerHTML = `<div class="hole"></div><div class="bub"><div class="h"><b></b><span class="k"></span></div><div class="d"></div>
    <div class="b"><button type="button" class="skip">Finish tour</button><span class="spacer"></span><button type="button" class="prev">Back</button><button type="button" class="primary next"></button></div></div>`;
  document.body.appendChild(box);
  const hole = box.querySelector(".hole"), bub = box.querySelector(".bub");
  const end = () => { box.remove(); removeEventListener("resize", draw); removeEventListener("keydown", key, true); if (isMobile()) setSheet("hand", false); };
  let timer = null;
  function draw() {
    const st = stops[k], mob = isMobile();
    // 手机：目标在底部面板里。面板展开有过渡动画，要等动画结束再量位置，否则高亮框停在旧位置
    const moving = mob && st.pane && (UI.sheet !== st.pane || !UI.expanded);
    if (mob && st.pane) setSheet(st.pane, true);
    clearTimeout(timer);
    timer = setTimeout(place, moving ? 420 : 0);
  }
  function place() {
    const st = stops[k], mob = isMobile();
    requestAnimationFrame(() => {
      const el = $((mob && st.msel) || st.sel);
      const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      const pad = 5, x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
      const w = Math.min(innerWidth - 8 - x, r.width + pad * 2), h = Math.min(innerHeight - 8 - y, r.height + pad * 2);
      Object.assign(hole.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
      bub.querySelector(".h b").textContent = st.title;
      bub.querySelector(".k").textContent = `${k + 1} / ${stops.length}`;
      bub.querySelector(".d").textContent = st.text;
      bub.querySelector(".prev").disabled = k === 0;
      bub.querySelector(".next").textContent = k === stops.length - 1 ? "Begin game" : "Next";
      // 说明框放在目标下方；放不下放上方；都放不下（目标很大）就放在目标内部靠上
      const bw = Math.min(340, innerWidth - 24), bh = bub.offsetHeight || 150;
      let top = y + h + 10;
      if (top + bh > innerHeight - 8) top = y - bh - 10;
      if (top < 8) top = Math.min(innerHeight - bh - 8, y + 12);
      const left = Math.min(innerWidth - bw - 12, Math.max(12, x + w / 2 - bw / 2));
      Object.assign(bub.style, { width: bw + "px", left: left + "px", top: top + "px" });
    });
  }
  function key(e) {
    if (e.key === "Escape") { e.stopPropagation(); end(); }
    else if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); next(); }
    else if (e.key === "ArrowLeft" && k > 0) { e.stopPropagation(); k--; draw(); }
  }
  const next = () => { if (k === stops.length - 1) end(); else { k++; draw(); } };
  bub.querySelector(".next").onclick = next;
  bub.querySelector(".prev").onclick = () => { if (k > 0) { k--; draw(); } };
  bub.querySelector(".skip").onclick = end;
  addEventListener("resize", draw);
  addEventListener("keydown", key, true);
  draw();
}
function showSettings() {
  const d = modal(`<button class="x">✕</button><h2>Settings</h2><div class="sub">Saved on this device</div>
    <div class="field"><label>Suggested moves</label>${seg("hints", [["0", "Off"], ["1", "On"]], SET.hints ? "1" : "0")}</div>
    <div class="field"><label>Contrast mode</label>${seg("contrastMode", [["off", "Standard"], ["light", "Light high contrast"], ["dark", "Dark high contrast"]], SET.contrastMode)}</div>
    <div class="field"><label>Text size</label>${seg("largeText", [["0", "Default"], ["1", "Larger"]], SET.largeText ? "1" : "0")}</div>
    <div class="field"><label>Animation</label><div class="a11y-setting">${seg("reduceMotion", [["0", "Animations on"], ["1", "Reduce animations"]], SET.reduceMotion ? "1" : "0")}<p class="a11y-help">Minimizes map effects and decorative motion.</p></div></div>
    <div class="field"><label>Background music</label>${seg("music", [["1", "On"], ["0", "Off"]], SET.music ? "1" : "0")}</div>
    <div class="field"><label>Volume</label>${seg("vol", [["0.2", "Low"], ["0.35", "Medium"], ["0.55", "High"]], SET.vol)}</div>
    <div class="field"><label>Save game</label><button id="stExport">Export save</button><button id="stImport">Import save</button></div>
    <div class="btns"><button class="primary">Done</button></div>`);
  bindSeg(d, async (k, v) => {
    if (k === "speed") SET.speed = +v;
    if (k === "step") { SET.step = v === "1"; if (!SET.step) continueTap(); }
    if (k === "follow") SET.follow = v === "1";
    if (k === "contrastMode") SET.contrastMode = v;
    if (k === "largeText") SET.largeText = v === "1";
    if (k === "reduceMotion") SET.reduceMotion = v === "1";
    if (k === "music") bgmToggle(v === "1");
    if (k === "vol") { SET.vol = v; if (SET.music) bgmRamp(+v, 0.4); }
    if (k === "hints") { SET.hints = v === "1"; if (S && S.started) { const st = await api("/api/settings", { hints: SET.hints }); S = st; renderAll(); } }
    applyA11yPrefs();
    if (k === "largeText" && map) map.layout();
    savePrefs();
  });
  d.querySelectorAll(".x,.btns button").forEach(b => b.onclick = () => d.remove());
  d.querySelector("#stExport").onclick = () => {
    const ls = localSave(); if (!ls) { toast("There is no saved game to export yet."); return; }
    const blob = new Blob([JSON.stringify(ls.save)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `EcoBrass-save-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  d.querySelector("#stImport").onclick = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = async () => {
      try {
        const save = JSON.parse(await inp.files[0].text());
        const st = await api("/api/load", { save });
        if (!st.started) { toast(st.error || "Unable to load the saved game."); return; }
        d.remove(); PREV_CLEAR(); await applyState(st, false); map.focusRegion(me().home); toast("Save imported.");
      } catch (e) { toast("Unable to read this save file."); }
    };
    inp.click();
  };
}
function showFinal() {
 const st=S,rank=[...st.players].sort((a,b)=>b.vp-a.vp||b.income-a.income||b.money-a.money),cols=[["sales","Sales"],["links","Routes"],["develop","Develop"],["green","Eco"],["pollution","Pollution"]];
 const winners=st.winnerIds.map(id=>st.players.find(p=>p.id===id).name).join(" & ");
 const d=modal(`<h2>The final ledger</h2><div class="sub">${winners} ${st.winnerIds.length>1?"share victory":"wins"}. Eight rounds complete.<br>Final points include eco bonuses and pollution penalties. Ties: income, then cash.</div><table class="score"><thead><tr><th>Player</th>${cols.map(c=>`<th>${c[1]}</th>`).join("")}<th>Total</th></tr></thead><tbody>${rank.map(p=>`<tr class="${p.isMe?"me":""}"><td><span class="namecell">${avatarHTML(p.avatar,PCOL[p.id],26)}${p.name}</span></td>${cols.map(([k])=>`<td>${st.vpBreak[p.id]?.[k]||0}</td>`).join("")}<td class="tot">${p.vp}</td></tr>`).join("")}</tbody></table><div class="btns"><button id="fnView">View final map</button><button id="fnAgain" class="primary">Play again</button></div>`);
 d.id="final";d.querySelector("#fnView").onclick=()=>d.remove();d.querySelector("#fnAgain").onclick=()=>{d.remove();showNewGame();};
}

function toast(text) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = T(text);
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), 3500);
  while ($("#toasts").children.length > 3) $("#toasts").firstChild.remove();
}
function setSheet(pane, expanded) {
  UI.sheet = pane; UI.expanded = expanded;
  document.body.classList.toggle("sheet-open", !!expanded);
  $$("#sheetTabs button").forEach(b => {
    const selected = b.dataset.pane === pane;
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", String(selected));
  });
  if (isMobile()) {
    $$("#dock .pane").forEach(p => p.classList.toggle("on", p.dataset.pane === pane));
    const h = expanded ? Math.round(innerHeight * 0.56) : 176;
    document.documentElement.style.setProperty("--sheetH", h + "px");
    if (map) map.setInset(0, h);
  } else {
    if (map) map.setInset(0, 0);
    $$("#dock .pane").forEach(p => p.classList.toggle("on", !p.classList.contains("mobile-only")));
    document.documentElement.style.removeProperty("--sheetH");
  }
}

function bindUI() {
  bgmBind();
  $("#btnNet").setAttribute("aria-pressed", String(!!UI.net));
  $("#btnMine").setAttribute("aria-pressed", String(!!UI.mine));
  $("#btnNew").onclick = () => { $("#menu").classList.remove("open"); showNewGame(); };
  $("#btnHelp").onclick = () => { $("#menu").classList.remove("open"); showHelp(); };
  $("#btnSettings").onclick = () => { $("#menu").classList.remove("open"); showSettings(); };
  $("#btnMenu").onclick = () => $("#menu").classList.toggle("open");
  const cityNavigator = $("#cityNavigator"), cityToggle = $("#btnCities");
  if (cityNavigator && cityToggle) {
    const syncCityToggle = () => cityToggle.setAttribute("aria-expanded", String(cityNavigator.open));
    const closeCityNavigator = () => {
      cityNavigator.open = false; syncCityToggle(); cityToggle.focus();
    };
    cityToggle.onclick = () => {
      cityNavigator.open = !cityNavigator.open; syncCityToggle();
      if (cityNavigator.open) cityNavigator.querySelector("summary")?.focus();
    };
    cityNavigator.addEventListener("toggle", syncCityToggle);
    $("#btnCitiesClose")?.addEventListener("click", closeCityNavigator);
    cityNavigator.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation(); closeCityNavigator();
    });
  }
  $("#btnWorld").onclick = () => map.fitWorld();
  $("#btnHome").onclick = () => { if (S && S.started) map.focusRegion(me().home); };
  $("#btnLog").onclick = () => { if (isMobile()) setSheet("log", true); else $("#logpanel").classList.toggle("hide"); renderLog(V() || S); };
  const cityList = $("#cityList");
  if (cityList) cityList.addEventListener("click", e => {
    const button = e.target.closest(".city-option");
    if (!button) return;
    map.ensureVisible([button.dataset.city], 0.35);
    onMapClick({ city: button.dataset.city, slot: null });
  });
  const linkList = $("#linkList");
  if (linkList) linkList.addEventListener("click", e => {
    const button = e.target.closest(".link-option");
    if (!button) return;
    const [a, b] = button.dataset.link.split("|");
    map.ensureVisible([a, b], 0.35);
    onMapClick({ link: button.dataset.link });
  });
  $("#logClose").onclick = () => $("#logpanel").classList.add("hide");
  // 点记录里的一条，地图跳到那里并闪一下
  ["#log", "#log2"].forEach(sel => $(sel).addEventListener("click", e => {
    const le = e.target.closest(".le.loc"); if (!le) return;
    const ids = le.dataset.at.split(",");
    map.ensureVisible(ids, 0.2).then(() => ids.forEach(id => { if (map.city[id]) ringAt(screenOfCity(id, null), "#ffd98a"); }));
    if (isMobile()) setSheet("log", false);
  }));
  // 「我的网络」：把网络够不到的城市压暗，一眼看出自己能在哪建
  $("#btnNet").onclick = () => {
    UI.net = !UI.net; $("#btnNet").classList.toggle("on", UI.net);
    $("#btnNet").setAttribute("aria-pressed", String(UI.net));
    if (UI.net) setMine(false);
    if (UI.net && S) map.setTargets(S.reach.length ? S.reach : null, "net"); else map.setTargets(null);
  };
  $("#btnMine").onclick = () => setMine(!UI.mine, true);
  $("#btnSkip").onclick = () => { UI.skip = true; continueTap(); };
  // 逐步播放时的「点击任意处继续」：只认轻点（移动不超过 8 像素、单指），不认拖动和双指缩放
  let tap0 = null, tapMulti = false;
  document.addEventListener("pointerdown", e => {
    if (!UI.waitTap) { tap0 = null; return; }
    if (tap0) tapMulti = true; else { tap0 = { x: e.clientX, y: e.clientY }; tapMulti = false; }
  }, true);
  document.addEventListener("pointerup", e => {
    const t = tap0, multi = tapMulti; tap0 = null; tapMulti = false;
    if (!UI.waitTap || !t || multi || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) return;
    const el = e.target;
    if (el.closest && el.closest("button, a, input, select, textarea, [role=button], .pl, .pcard, .modal, .overlay, #logpanel, #sheetTabs, #settings")) return;
    continueTap();
  }, true);
  if ($("#btnMat")) $("#btnMat").onclick = () => showMatModal();
  $("#players").addEventListener("click", e => { const p = e.target.closest(".pl"); if (p && S) showMatModal(+p.dataset.p); });
  $("#sheetTabs").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const same = UI.sheet === b.dataset.pane;
    setSheet(b.dataset.pane, same ? !UI.expanded : (b.dataset.pane !== "hand" || UI.expanded));
    if (b.dataset.pane === "log") renderLog(V() || S);
  });
  $("#sheetHandle").onclick = () => setSheet(UI.sheet, !UI.expanded);

  // 手牌：悬停（桌面）/ 点按（手机）亮出能用的城市
  const cards = $("#cards");
  cards.addEventListener("mouseover", e => {
    if (isMobile() || UI.playing) return;
    const pc = e.target.closest(".pcard"); if (!pc || UI.card !== null) return;
    showCardTargets(+pc.dataset.ci);
  });
  cards.addEventListener("mouseleave", () => { if (UI.card === null) { baseTargets(); hideTip(); hideCardPop(); } });
  cards.addEventListener("click", e => {
    const pc = e.target.closest(".pcard"); if (!pc) return;
    const ci = +pc.dataset.ci;
    if ((UI.sel !== null || UI.passMode) && pickDiscard(ci)) return;      // 已选动作时，点手牌改选弃牌
    UI.card = UI.card === ci ? null : ci;
    $$(".pcard").forEach(x => {
      const selected = +x.dataset.ci === UI.card;
      x.classList.toggle("sel", selected);
      x.setAttribute("aria-pressed", String(selected));
    });
    if (UI.card === null) { baseTargets(); hideTip(); hideCardPop(); }
    else {
      showCardTargets(ci);
      const t = [...cardTargets(V().hand[ci])];
      if (t.length) map.ensureVisible(t);
    }
  });
  cards.addEventListener("focusin", e => { const pc = e.target.closest(".pcard"); if (pc) showCardTargets(+pc.dataset.ci); });
  cards.addEventListener("focusout", () => { if (UI.card === null) { baseTargets(); hideCardPop(); } });

  // 行动列表
  $("#acttabs").addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "clearFilter") { UI.filter = null; renderActions(); return; }
    if (b.id === "passbtn") {
      clearSel(); UI.passMode = true; UI.discard = [...(S.passDiscard || [0])];
      renderConfirm(); renderHand(S); if (isMobile()) setSheet("act", true); return;
    }
    clearSel(); UI.tab = b.dataset.k; renderActions();
  });
  cards.addEventListener("keydown", e => {
    const card = e.target.closest(".pcard");
    if (!card || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    e.stopPropagation();
    card.click();
  });
  const list = $("#actlist");
  list.addEventListener("click", e => {
    const dp = e.target.closest(".dpk");
    if (dp && !UI.busy) { devClick(dp.dataset.dind); return; }
    const a = e.target.closest(".act"); if (!a || UI.busy) return;
    const i = +a.dataset.i;
    if (UI.sel === i && !isMobile()) { go(); return; }   // 再点一次 = 确认
    selectAction(i);
  });
  list.addEventListener("mouseover", e => {
    if (isMobile() || UI.sel !== null) return;
    const a = e.target.closest(".act"); if (!a) return;
    const act = S.actions.find(x => x.i === +a.dataset.i);
    if (act) map.preview(act, PCOL[me(S).id]);
  });
  list.addEventListener("mouseleave", () => { if (UI.sel === null) map.clearPreview(); });
  $("#confirm").addEventListener("click", e => {
    const bc = e.target.closest(".bchip");
    if (bc) { UI.devBonus = [bc.dataset.db]; renderConfirm(); return; }
    const bk = e.target.closest(".beerchip");
    if (bk) { pickBeer(bk.dataset.bk); return; }
    const chip = e.target.closest(".dchip");
    if (chip) { pickDiscard(+chip.dataset.di); return; }
    if (e.target.id === "btnGo") go();
    if (e.target.id === "btnCancel") clearSel();
  });
  addEventListener("keydown", e => {
    if (e.target.matches && e.target.matches("input,select,textarea")) return;
    if ((e.key === " " || e.key === "Enter") && e.target.closest?.("button, a, summary, input, select, textarea, [role=button]")) return;
    if ((e.key === " " || e.key === "Enter") && UI.waitTap) { e.preventDefault(); continueTap(); return; }
    if (e.key === "Escape" && UI.playing) { UI.skip = true; continueTap(); return; }
    if (e.key === "Enter" && (UI.sel !== null || UI.passMode) && !UI.busy) { e.preventDefault(); go(); }
    else if (e.key === "Escape") { clearSel(); UI.card = null; $$(".pcard").forEach(x => { x.classList.remove("sel"); x.setAttribute("aria-pressed", "false"); }); baseTargets(); hideCardPop(); UI.filter = null; renderActions(); hideTip(); }
    else if (e.key === " " && UI.playing) { e.preventDefault(); }
    else if (e.key === "f" || e.key === "F") map.fitWorld();
    else if ((e.key === "h" || e.key === "H") && S && S.started) map.focusRegion(me().home);
    else if (e.key === "m" || e.key === "M") bgmToggle();
    else if ((e.key === "i" || e.key === "I") && S && S.started) setMine(!UI.mine, true);
  });
}

boot();
