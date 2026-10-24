// 《工业革命：世界》前端主程序
import { SYMBOLS, PCOL, IND_ART, artCSS, regionArt, iconHTML, cubeHTML, avatarHTML, AVATARS, AVATAR_ZH,
  ROMAN, BONUS_FULL, BONUS_SHORT, IND_ORDER } from "./art.js";
import { MapView } from "./map.js?v=accessibility-text-2";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ZONE_ZH = { BRITAIN: "不列颠", EUROPE: "欧陆", AMERICAS: "美洲", ASIAPAC: "亚太" };
const KIND_ORDER = ["BUILD", "NETWORK", "SELL", "DEVELOP", "LOAN", "SCOUT"];
const KIND_ZH = { BUILD: "建造", NETWORK: "连接", SELL: "销售", DEVELOP: "开发", LOAN: "贷款", SCOUT: "侦查" };
const RES_ZH = { coal: "煤", iron: "铁", prov: "啤酒" };
const isMobile = () => matchMedia("(max-width: 760px)").matches;

// ---------- 设置（本机偏好，存 localStorage） ----------
const savedPrefs = (() => { try { const value = JSON.parse(localStorage.getItem("bw_prefs") || "{}"); return value && typeof value === "object" ? value : {}; } catch (e) { return {}; } })();
const savedContrastMode = savedPrefs.contrastMode ?? (savedPrefs.highContrast ? "light" : "off");
const SET = Object.assign({ speed: 1, step: true, follow: true, hints: false, level: "normal", avatar: "uk", music: true, vol: "0.35",
  contrastMode: "off", largeText: false, reduceMotion: false }, savedPrefs, { contrastMode: savedContrastMode });
delete SET.highContrast;
function savePrefs() { try { localStorage.setItem("bw_prefs", JSON.stringify(SET)); } catch (e) { } }
function applyA11yPrefs() {
  const root = document.documentElement;
  root.classList.toggle("a11y-contrast", SET.contrastMode === "light");
  root.classList.toggle("a11y-contrast-dark", SET.contrastMode === "dark");
  root.classList.toggle("a11y-large-text", !!SET.largeText);
  root.classList.toggle("a11y-reduce-motion", !!SET.reduceMotion);
}
applyA11yPrefs();

let B = null, M = null, map = null;
let S = null;          // 服务端最新状态
let D = null;          // 回放中的「显示状态」：从旧状态出发，逐个事件往前推
const UI = { tab: null, filter: null, sel: null, card: null, busy: false, playing: false, skip: false, sheet: "hand", expanded: false,
  discard: [], passMode: false, devPick: [], devBonus: [], beer: [] };

const api = (p, b) => fetch(p, b ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) } : {})
  .then(r => r.json());
const city = id => B.cities.find(c => c.id === id);
const cityZh = id => (map && map.city[id] ? map.city[id].short : (city(id) || {}).zh || id);
const V = () => D || S;
const me = (st = V()) => st.players.find(p => p.isMe);
const pname = (st, id) => (st.players.find(p => p.id === id) || {}).name || "";

const englishPlayerName = name => ({
  "麦克莱伦": "McClellan",
  "阿什沃思": "Ashworth",
  "彭伯顿": "Pemberton"
})[name] || name;

// ================= 启动 =================
async function boot() {
  $("#symbols").innerHTML = SYMBOLS;
  [B, M] = await Promise.all([api("/api/board"), fetch("/assets/map.json").then(r => r.json())]);
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
    toast("已恢复上一局");
  } else {
    map.fitWorld();
    showNewGame();
  }
}

// ================= 存档 =================
function saveLocal(st) {
  try {
    if (st.save && !st.over) {
      localStorage.setItem("bw_save", JSON.stringify(st.save));
      localStorage.setItem("bw_save_meta", JSON.stringify({
        t: Date.now(), round: st.round, era: st.eraZh, mode: st.mode,
        players: st.players.map(p => ({ name: p.name, vp: p.vp, me: p.isMe }))
      }));
    }
    if (st.over) { localStorage.removeItem("bw_save"); localStorage.removeItem("bw_save_meta"); }
  } catch (e) { /* 隐私模式等情况下存不了，不影响游戏 */ }
}
function localSave() {
  try {
    const s = localStorage.getItem("bw_save");
    return s ? { save: JSON.parse(s), meta: JSON.parse(localStorage.getItem("bw_save_meta") || "{}") } : null;
  } catch (e) { return null; }
}
async function resumeLocal(quiet) {
  const ls = localSave(); if (!ls) return false;
  const st = await api("/api/load", { save: ls.save });
  if (!st.started) { toast(st.error || "存档无法读取"); return false; }
  PREV_CLEAR();
  await applyState(st, false);
  map.focusRegion(me().home);
  if (!quiet) toast("已读取本地存档：" + st.eraZh + " 第 " + st.round + " 轮");
  return true;
}
function PREV_CLEAR() { S = null; D = null; UI.sel = null; UI.filter = null; }

// ================= 提交动作 =================
async function submit(path, body) {
  if (UI.busy || UI.playing) return;
  UI.busy = true; document.body.classList.add("busy");
  // 服务器在算 AI 的回合时给个提示，否则界面看起来像卡住了
  const think = setTimeout(() => { $("#playwho").innerHTML = "对手思考中…"; $("#playbar").classList.remove("hide"); }, 350);
  try {
    let r = await api(path, Object.assign({ v: S ? S.ver : undefined }, body));
    if (r && r.started === false && localSave()) {
      // 服务端重启过、会话丢了：用本地存档恢复（刚才这一步没执行，玩家重点一次即可）
      await resumeLocal(true);
      toast("会话已恢复，请重新操作");
      return;
    }
    if (r.stale) toast("局面已更新，请重新选择");
    if (r.error) toast(r.error);
    UI.sel = null; UI.filter = null; UI.card = null; UI.passMode = false; UI.discard = [];
    await applyState(r, true);
  } catch (e) {
    console.error(e); toast("网络错误：" + e.message);
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
  $("#eraChip").textContent = st.eraZh;
  $("#roundInfo").textContent = `第 ${st.round} 轮 · 牌库 ${st.deck}`;
  const myTurn = !st.over && st.active === me(st).id && !UI.playing;
  $("#pips").innerHTML = [...Array(st.actionsTotal || 2).keys()].map(i => `<span class="pip ${myTurn && i < st.actionsLeft ? "" : "off"}"></span>`).join("");
}

function renderPlayers(st, bump = {}) {
  const order = st.turnOrder;
  const ps = [...st.players].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  $("#players").innerHTML = ps.map(p => {
    const links = (st.linkedPairs || []).filter(k => k.includes(p.id)).map(k => k[0] === p.id ? k[1] : k[0]);
    return `<div class="pl ${p.id === st.active ? "active" : ""} ${p.isMe ? "me" : ""}" data-p="${p.id}"
      title="${englishPlayerName(p.name)}｜板件 ${p.tiles} · 连线 ${p.links} · 手牌 ${p.hand}｜点击查看全部板件">
      <span class="order">${order.indexOf(p.id) + 1}</span>
      ${avatarHTML(p.avatar, PCOL[p.id], isMobile() ? 30 : 40)}
      <div class="body">
      <div class="r1"><span class="nm" style="color:${PCOL[p.id]}">${englishPlayerName(p.name)}</span>
      <span class="vp ${bump[p.id] ? "bump" : ""}" title="胜利点">${p.vp}</span></div>
      <div class="r2"><span>$<b class="money">${p.money}</b></span><span>收入 <b>${p.income >= 0 ? "+" : ""}${p.income}</b></span></div>
      <div class="r3">${p.levelZh ? `<span class="lv">${p.levelZh}</span>` : ""}<span class="home">${p.homeZh}</span>${links.map(i => `<span class="lnkdot" style="background:${PCOL[i]}" title="已与 ${pname(st, i)} 互通"></span>`).join("")}</div>
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
  const lad = m.ladder.map(l => `<i title="$${l.price}：${l.n}/${l.per}"><b style="height:${Math.round(100 * l.n / l.per)}%"></b></i>`).join("");
  return `<div class="mrow" title="${kind === "coal" ? "煤" : "铁"} ${m.count}/${m.capacity}，现价 $${m.price}">${cubeHTML(kind, 12)}` +
    `<span class="mladder ${kind}">${lad}</span><b>$${m.price}</b></div>`;
}
function marketCubes(m, kind) {
  // 按原作的市场板：每个价格档 per 个格子，从便宜到贵，有货的画实心方块。
  // 交通打通后几个市场合成一个，格子数翻几倍 —— 这时改画分档条，否则一行几十块方块把整条栏撑爆
  if (m.capacity > 16) {
    return `<span class="mladder ${kind}">` + m.ladder.map(l =>
      `<i title="$${l.price}：${l.n}/${l.per}"><b style="height:${Math.round(100 * l.n / l.per)}%"></b></i>`).join("") +
      `</span><span class="mcount">${m.count}/${m.capacity}</span>`;
  }
  let h = "";
  for (const l of m.ladder) for (let k = 0; k < l.per; k++)
    h += `<svg class="cube ${k < l.n ? "" : "e"}" viewBox="0 0 20 20"><use href="#cube-${kind}"/></svg>`;
  return `<span class="mcubes">${h}</span>`;
}
function renderMarkets(st) {
  const mine = new Set(st.myZones || []);
  const grp = st.zoneGroup || {}, size = {};
  Object.values(grp).forEach(r => size[r] = (size[r] || 0) + 1);
  const html = Object.entries(st.markets).map(([z, m]) => {
    const merged = size[grp[z]] > 1;
    const mates = merged ? Object.keys(grp).filter(k => grp[k] === grp[z] && k !== z).map(k => ZONE_ZH[k]).join("、") : "";
    const tip = `${ZONE_ZH[z]}市场｜煤 ${m.coal.count}/${m.coal.capacity}，现价 $${m.coal.price}｜铁 ${m.iron.count}/${m.iron.capacity}，现价 $${m.iron.price}｜` +
      `售空后按 $${m.coal.outside}/$${m.iron.outside} 外购` + (mine.has(z) ? "｜网络可达" : "") +
      (merged ? `｜已与${mates}合并` : "");
    return `<div class="mz ${mine.has(z) ? "mine" : ""} ${merged ? "merged" : ""}" data-zone="${z}" title="${tip}">
      <div class="zn">${ZONE_ZH[z]}${mine.has(z) ? " ●" : ""}${merged ? " ⛓" : ""}</div>
      ${marketRow(m.coal, "coal")}${marketRow(m.iron, "iron")}</div>`;
  }).join("");
  $("#markets").innerHTML = html;
  $("#markets2").innerHTML = html;
}

// Keyboard and screen-reader alternative to selecting places on the visual map.
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
    const button = document.createElement("button"), name = c.en || c.zh || c.id;
    const region = c.regionEn || c.regionZh || c.region || "";
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
      data-ci="${ci}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${c.label}, ${kind}${dead ? ", currently unavailable" : ""}" title="${c.label}${dead ? " (currently unavailable)" : ""}">
      <span class="kind">${isWild ? "万用" : isInd ? "产业" : "区域"}</span>
      <div class="art" style="${artCSS(cardArt(c))}"></div><div class="nm">${c.label}</div></div>`;
  }).join("");
  const usable = tg.filter((t, i) => st.hand[i].kind === "WILD" || t.size).length;
  $("#handSub").textContent = st.hand.length ? `可用 ${usable}/${st.hand.length}` : "";
}
// 这张牌能在哪建：区域牌 = 该区域城市（仍须在网络内）；产业牌 = 网络内有空格能建这种产业的城市
function cardTargets(card) {
  const st = V();
  const reach = new Set(st.reach), taken = {};
  st.placed.forEach(p => { (taken[p.city] = taken[p.city] || new Set()).add(p.slot); });
  const free = c => c.slots.some((sl, i) => !(taken[c.id] && taken[c.id].has(i)));
  const inNet = c => !reach.size || reach.has(c.id);
  // 区域牌可建在网络外（原作的地点牌）；万用区域牌 = 任一城市
  if (card.kind === "WILD" && card.v === "REGION") return new Set(B.cities.filter(c => free(c)).map(c => c.id));
  const inds = card.kind === "WILD" ? null : card.v.split("+");    // 棉纺厂/制造厂共用一种牌
  if (card.kind === "REGION") return new Set(B.cities.filter(c => c.region === card.v && free(c)).map(c => c.id));
  return new Set(B.cities.filter(c => inNet(c) && c.slots.some((sl, i) =>
    (inds === null || sl.some(x => inds.includes(x))) && !(taken[c.id] && taken[c.id].has(i)))).map(c => c.id));
}
// ---- 为什么能 / 不能建：服务端给出每种产业下一块的规格和每座城的实际总价（buildInfo） ----
const zoneMkt = { BRITAIN: "不列颠市场", EUROPE: "欧陆市场", AMERICAS: "美洲市场", ASIAPAC: "亚太市场" };
function costParts(t, e) {
  // 「$17 板件 + 亚太市场煤×1 $6 = $23」
  const parts = [`$${t.cost} 板件`];
  (e.coalFrom || []).forEach(s => parts.push(`${cubeHTML("coal", 11)}${s.owner === me(S).id ? "自有" : pname(S, s.owner)}·${cityZh(s.city)}×${s.n} 免费`));
  if (e.coalMkt) parts.push(`${cubeHTML("coal", 11)}${zoneMkt[e.zone] || "市场"}×${e.coalMkt} $${e.coalCash}`);
  (e.ironFrom || []).forEach(s => parts.push(`${cubeHTML("iron", 11)}${s.owner === me(S).id ? "自有" : pname(S, s.owner)}·${cityZh(s.city)}×${s.n} 免费`));
  if (e.ironMkt) parts.push(`${cubeHTML("iron", 11)}${zoneMkt[e.zone] || "市场"}×${e.ironMkt} $${e.ironCash}`);
  return parts.join(" + ") + (parts.length > 1 ? ` = $${e.money}` : "");
}
function canLoan() { return S && S.actions && S.actions.some(a => a.kind === "LOAN"); }
function buildStatus(cityId, ind) {
  const st = S, info = (st.buildInfo || {})[ind], c = city(cityId);
  if (!info || !c) return { ok: false, why: "—" };
  if (info.reason) return { ok: false, why: info.reason };
  // 区域牌（原作的地点牌）可建在网络外；产业牌只能建在网络内
  const inNet = !st.reach.length || st.reach.includes(cityId);
  const hasReg = st.hand.some(h => (h.kind === "REGION" && h.v === c.region) || (h.kind === "WILD" && h.v === "REGION"));
  const hasInd = st.hand.some(h => (h.kind === "INDUSTRY" && h.v.split("+").includes(ind)) || (h.kind === "WILD" && h.v === "INDUSTRY"));
  if (!inNet && !hasReg) return { ok: false, why: `不在网络内：需「${c.regionZh}」区域牌` };
  const e = (info.cities || []).find(x => x.city === cityId);
  if (!e) return { ok: false, why: "无未被占用的对应格位" };
  if (e.money === null) return { ok: false, why: e.why };
  const cash = me(st).money;
  if (!hasReg && !hasInd) return { ok: false, e, why: `缺牌：需「${c.regionZh}」或「${B.industryZh[ind]}」` };
  if (e.money > cash) return { ok: false, e, short: true,
    why: `资金不足：差 <b>$${e.money - cash}</b>${canLoan() ? "（可贷款 $30）" : ""}` };
  return { ok: true, e };
}
function tileLines(ind, t) {
  const need = [];
  for (let i = 0; i < t.coal; i++) need.push(cubeHTML("coal", 12));
  for (let i = 0; i < t.iron; i++) need.push(cubeHTML("iron", 12));
  const give = [`<b>${t.vp}</b> 分`, `收入 +${t.income}`, `连线 ${t.linkVp}`];
  const note = ["COAL", "IRON"].includes(ind) ? `建成产出 ${t.produces} 块，售予市场`
    : ind === "PROV" ? "产出啤酒：帆船时代建成放 1 桶，蒸汽时代建成放 2 桶"
      : t.sellProv ? `销售耗啤酒 ×${t.sellProv}，须连通收购此货、已开张的贸易港` : "销售不耗啤酒，须连通收购此货、已开张的贸易港";
  return `<div class="r"><span class="k">造价</span><b style="color:var(--gold2)">$${t.cost}</b>${need.length ? " + " + need.join("") : " · 无需煤铁"}</div>
    <div class="r"><span class="k">收益</span>${give.join(" · ")}</div>
    <div class="r"><span class="k">备注</span>${note}</div>`;
}
function cityLine(cityId, ind) {
  const s = buildStatus(cityId, ind), e = s.e;
  const detail = s.ok ? costParts((S.buildInfo[ind] || {}).tile, e)
    : s.short ? `${s.why}<br>${costParts((S.buildInfo[ind] || {}).tile, e)}` : s.why;
  return `<div class="c ${s.ok ? "ok" : "no"}"><span class="m">${s.ok ? "✓" : "✗"}</span>
    <span class="n">${cityZh(cityId)}${e && e.money !== null && e.money !== undefined ? ` $${e.money}` : ""}</span><span class="d">${detail}</span></div>`;
}
function cardPopHTML(card) {
  const st = S;
  if (card.kind === "WILD")
    return `<div class="h"><b>${card.label}</b></div><div class="r">${card.v === "REGION" ? "视为任意区域：可建在任一城市，不必在网络内" : "视为任意产业：须建在网络内"}；本时代结束作废。</div>`;
  if (card.kind === "INDUSTRY") {
    const inds = card.v.split("+");
    if (inds.length > 1)       // 棉纺厂/制造厂共用一种牌：两种产业各列一段
      return inds.map(i => cardPopHTML({ kind: "INDUSTRY", v: i })).join(`<div class="sep"></div>`);
    const ind = card.v, info = (st.buildInfo || {})[ind] || {}, t = info.tile;
    let h = `<div class="h"><b>${B.industryZh[ind]}${t ? " " + (ROMAN[t.level] || "") : ""}</b>` +
      (t && t.era !== "BOTH" ? `<span class="era">${t.era === "E1" ? "仅帆船时代" : "仅蒸汽时代"}</span>` : "") +
      (t && t.noDev ? `<span class="era">不可开发</span>` : "") +
      `<span class="left">余 ${info.left || 0} 块</span></div>`;
    if (t) h += tileLines(ind, t);
    h += `<div class="sep"></div>`;
    if (info.reason) return h + `<div class="c no"><span class="m">✗</span><span class="d">${info.reason}</span></div>`;
    const cs = (info.cities || []).slice().sort((a, b) => (a.money ?? 999) - (b.money ?? 999));
    if (!cs.length) return h + `<div class="c no"><span class="m">✗</span><span class="d">网络内无可建${B.industryZh[ind]}的未占用格位</span></div>`;
    h += cs.slice(0, 6).map(e => cityLine(e.city, ind)).join("");
    if (cs.length > 6) h += `<div class="foot">另 ${cs.length - 6} 城</div>`;
    return h + `<div class="foot">产业牌：网络内任一城市均可建此产业</div>`;
  }
  // 区域牌：这个区域里每座城、每个空格能建什么、多少钱
  const cs = B.cities.filter(c => c.region === card.v);
  const netSet = new Set(st.reach);
  let h = `<div class="h"><b>${card.label}</b><span class="left">区域牌</span></div>`;
  cs.forEach(c => {
    const taken = new Set(st.placed.filter(p => p.city === c.id).map(p => p.slot));
    const inds = [...new Set(c.slots.filter((s, i) => !taken.has(i)).flat())];
    if (!inds.length) { h += `<div class="c no"><span class="m">✗</span><span class="n">${cityZh(c.id)}</span><span class="d">格位已满</span></div>`; return; }
    h += `<div class="r" style="margin-top:6px"><b style="color:var(--txt)">${cityZh(c.id)}</b>${netSet.size && !netSet.has(c.id) ? `<span class="sl" style="margin-left:6px">网络外</span>` : ""}</div>`;
    h += inds.map(ind => {
      const s = buildStatus(c.id, ind);
      return `<div class="c ${s.ok ? "ok" : "no"}"><span class="m">${s.ok ? "✓" : "✗"}</span><span class="n">${iconHTML(ind, 12, "currentColor")}${B.industryZh[ind]}${s.e && s.e.money != null ? ` $${s.e.money}` : ""}</span><span class="d">${s.ok ? "" : s.why}</span></div>`;
    }).join("");
  });
  return h + `<div class="foot">区域牌：该区域任一城市均可建，不必在网络内（同原作的地点牌）</div>`;
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
    ? `万用牌：视为${card.v === "REGION" ? "任意区域" : "任意产业"}，本时代结束作废`
    : card.kind === "REGION"
      ? `区域牌：${card.label}可建 ${t.size} 城${rest && rest.length ? `（另 ${rest.length} 城不在网络内或已满，虚线标出）` : ""}`
      : `产业牌：网络内可建 ${t.size} 城`;
  showTip(`<b>${card.label}</b><div class="sl">${txt}</div>` +
    (t.size ? `<div class="sl" style="margin-top:3px">${[...t].slice(0, 8).map(cityZh).join("、")}${t.size > 8 ? " 等" : ""}</div>` : ""));
}

// ---------- 行动 ----------
function actThumb(a) {
  if (a.industry && IND_ART[a.industry]) return `<span class="athumb" style="${artCSS(IND_ART[a.industry])}"></span>`;
  const sym = { NETWORK: a.link && isSeaLink(a.link) ? "tk-ship" : "tk-rail", LOAN: "i-coin", SCOUT: "i-star", DEVELOP: "i-up" }[a.kind] || "i-star";
  return `<span class="athumb sym"><svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:currentColor"><use href="#${sym}"/></svg></span>`;
}
function isSeaLink(k) { const l = B.links.find(x => (x.a === k[0] && x.b === k[1]) || (x.a === k[1] && x.b === k[0])); return l && l.sea; }
function srcHTML(a) {
  a = viewAction(a);
  const parts = [];
  ["coal", "iron", "prov"].forEach(r => {
    (a[r] || []).forEach(s => parts.push(`${cubeHTML(r, 11)}${s.mine ? "自有" : pname(S, s.owner)}·${cityZh(s.city)}×${s.n}`));
  });
  if (a.mktCoal) parts.push(`${cubeHTML("coal", 11)}市场×${a.mktCoal}`);
  if (a.mktIron) parts.push(`${cubeHTML("iron", 11)}市场×${a.mktIron}`);
  return parts.join(" ");
}
function actTitle(a) {
  // 动作类别由标签页 / 确认条前缀给出，这里只写对象，避免「侦查：侦查…」这样的叠字
  const lv = ROMAN[a.level] || "";
  if (a.kind === "BUILD") return `${B.industryZh[a.industry]}${lv} <span class="c">·</span> ${cityZh(a.city)}` +
    (a.over ? ` <span class="c">覆盖${a.over.mine ? "" : "对手的"}${B.industryZh[a.over.industry]}${ROMAN[a.over.level] || ""}</span>` : "");
  if (a.kind === "NETWORK") {
    let t = `${cityZh(a.link[0])}—${cityZh(a.link[1])}`;
    if (a.second) t += ` <span class="c">+</span> ${cityZh(a.second[0])}—${cityZh(a.second[1])}`;
    return t;
  }
  if (a.kind === "SELL") {
    if (a.sells && a.sells.length > 1)
      return `${a.sells.length} 件 <span class="c">（${a.sells.map(s => B.industryZh[s.industry] + (ROMAN[s.level] || "")).join("、")}）</span>`;
    return `${B.industryZh[a.industry]}${lv} <span class="c">·</span> ${cityZh(a.city)}`;
  }
  if (a.kind === "DEVELOP") return (a.dev || [a]).map(d => B.industryZh[d.industry] + (ROMAN[d.level] || "")).join("、");
  if (a.kind === "LOAN") return "$30";
  return "Discard 3 cards to draw 2 wild cards.";
}
function actGain(a) {
  if (a.kind === "BUILD") {
    const bits = [`${a.vp} 分`, `收入 +${a.income}`];
    if (a.produces) bits.push(`产 ${a.produces}`);
    if (a.linkVp) bits.push(`连线 ${a.linkVp}`);
    if (a.mktSale) bits.push(mktSaleText(a.mktSale, true));
    return bits.join(" · ");
  }
  if (a.kind === "SELL") return `时代末 ${a.vp} 分 · 收入 +${a.income}` + (a.hub ? ` · 经${a.hub.zh}` + (a.hub.bonus ? `（港口奖励：${BONUS_FULL[a.hub.bonus]}）` : "") : "") +
    (a.hubProv ? ` · 港内啤酒 ×${a.hubProv}` : "");
  if (a.kind === "NETWORK") return (isSeaLink(a.link) ? "海运" : "陆路") + (a.second ? " · 双铺" : "");
  if (a.kind === "LOAN") return "收入 −3 级";
  if (a.kind === "DEVELOP") return `移除 ${(a.dev || [a]).length} 块板件，每块 1 铁`;
  return "万用牌视为任意区域 / 产业";
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


function renderActions() {
  const st = S;
  const tabs = $("#acttabs"), list = $("#actlist");
  if (!st || UI.playing) { tabs.innerHTML = ""; list.innerHTML = `<div class="empty">其他玩家行动中…</div>`; $("#confirm").classList.add("hide"); return; }
  if (st.over) { tabs.innerHTML = ""; list.innerHTML = `<div class="empty">对局已结束</div>`; return; }
  const myTurn = st.active === me(st).id;
  const g = groupActs();
  const nAct = st.actions.filter(a => !(a.kind === "DEVELOP" && a.dev && a.dev.length > 1)).length;
  $("#actCount").textContent = myTurn && nAct ? nAct : "";
  if (!myTurn) { tabs.innerHTML = ""; list.innerHTML = `<div class="empty">等待其他玩家…</div>`; return; }
  const kinds = KIND_ORDER.filter(k => g[k]);
  const best = st.actions.find(a => a.best);
  const player = me(st);

  const advisorMessage = best
    ? `★ Strategy Advisor
      Current Money: $${player.money}
      Recommended Action: ${best.kind}
      Action Cost: $${best.cost ?? 0}

      ${explainMove(best)}`
    : "";
  if (best && UI.bestSeen !== st.ver) { UI.bestSeen = st.ver; UI.tab = best.kind; }   // 推荐走法所在的标签页先打开
  if (!UI.tab || !g[UI.tab]) UI.tab = kinds[0];
  let fk = null;
  if (UI.filter) {
    const hit = kinds.filter(k => filtered(g[k]).length);
    if (hit.length && !hit.includes(UI.tab)) UI.tab = hit[0];
    fk = UI.filter;
  }
  tabs.innerHTML = kinds.map(k => {
    const n = UI.filter ? filtered(g[k]).length : k === "DEVELOP" ? g[k].filter(a => !a.dev || a.dev.length === 1).length : g[k].length;
    return `<button type="button" data-k="${k}" class="${k === UI.tab ? "on" : ""}" aria-pressed="${k === UI.tab}">${KIND_ZH[k]}${best && best.kind === k ? "★" : ""}<span class="n">${n}</span></button>`;
  }).join("") +
    (fk ? `<button class="filter" id="clearFilter">筛选：${fk.city ? cityZh(fk.city) : fk.link.split("|").map(cityZh).join("—")} ✕</button>` : "") +
    `<button class="${st.actions.length ? "" : "primary "}passbtn" id="passbtn" title="不执行动作，弃 1 张牌">跳过</button>`;
  if (UI.tab === "DEVELOP" && !UI.filter) { list.innerHTML = devPickerHTML(g.DEVELOP, best); renderConfirm(); return; }
  let items = filtered(g[UI.tab] || []);
  if (UI.tab === "BUILD") items.sort((a, b) => IND_ORDER.indexOf(a.industry) - IND_ORDER.indexOf(b.industry) || a.cost - b.cost);
  else if (UI.tab === "NETWORK") items.sort((a, b) => (!!a.second - !!b.second) || a.cost - b.cost);
  else if (UI.tab === "DEVELOP") items.sort((a, b) => IND_ORDER.indexOf(a.industry) - IND_ORDER.indexOf(b.industry));
  if (best) items.sort((a, b) => (b.best ? 1 : 0) - (a.best ? 1 : 0));    // 推荐的排第一（排序是稳定的）
  list.innerHTML = items.length ? items.slice(0, 160).map(a => `
    <button type="button" class="act ${UI.sel === a.i ? "sel" : ""} ${a.best ? "best" : ""}" data-i="${a.i}" aria-pressed="${UI.sel === a.i}">
      ${actThumb(a)}
      <span class="body"><span class="tx">${actTitle(a)}</span>
        <span class="gain">${actGain(a)}</span>
        ${srcHTML(a) ? `<span class="src">${srcHTML(a)}</span>` : ""}</span>
      <span class="price ${a.cost ? "" : "free"}">${a.cost ? "$" + a.cost : "免费"}</span></button>`).join("")
    : `<div class="empty">${UI.filter ? "此处无该类动作" : "无可执行动作"}</div>`;
  if (advisorMessage) {
    list.insertAdjacentHTML(
      "afterbegin",
      `<div class="strategy-advisor" role="status">
        <strong>💡 Recommended Move</strong>
        <p>${advisorMessage}</p>
      </div>`
    );
  }

    renderConfirm();

}
// ---------- 开发（伯明翰规则：一次移除 1–2 块，每块 1 铁；同一产业可移除两块） ----------
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
    const lv = n === 2 && two ? two.dev.map(d => ROMAN[d.level]).join("、") : ROMAN[a.level];
    return `<button type="button" class="dpk ${n ? "on" : ""}" data-dind="${a.industry}">${actThumb(a)}
      <span class="nm">${B.industryZh[a.industry]}${lv}${bestInds.includes(a.industry) ? "★" : ""}</span>
      ${n === 2 ? `<span class="x2">×2</span>` : ""}</button>`;
  }).join("");
  let note = "Choose 1–2 industry tiles to remove. Pay 1 iron per tile. You may select the same industry twice.";
  if (p.length && !devAction(p)) note = "该组合不可执行：现金不足以支付 2 块铁。";
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
    const who = o.kind === "hub" ? `港内·${o.zh}` : `${o.mine ? "自有" : pname(S, o.owner)}·${cityZh(o.city)}`;
    const dot = o.kind === "hub" ? "" : `<i class="pdot" style="background:${PCOL[o.owner]}"></i>`;
    const tip = o.kind === "hub" ? "港内啤酒：用掉即得港口奖励" : o.mine ? "你的酿酒厂：啤酒取完后翻面，你得分和收入" : "对手的酿酒厂：啤酒取完后翻面，对手得分和收入";
    return `<button type="button" class="dchip beerchip ${on ? "on" : ""}" data-bk="${o.key}" title="${tip}">${dot}${who} ${cubeHTML("prov", 10)}${on ? `${use}/${o.n}` : o.n}</button>`;
  }).join("");
  const note = r.short ? `<span class="dwarn">还差 ${r.short} 桶</span>` : "";
  return `<div class="dsel"><span class="dl">啤酒（需 ${b.need} 桶，按点选顺序取用）</span>${chips}${note}</div>`;
}
function pickBeer(k) {
  UI.beer = UI.beer.includes(k) ? UI.beer.filter(x => x !== k) : [...UI.beer, k];
  renderConfirm(); previewSel();
}
function mktSaleText(m, short) {
  if (m.n) return short ? `建成售市场 ×${m.n} $${m.money}` : `建成时卖给市场 ${m.n} 块，得 $${m.money}`;
  if (m.why === "nohub") return short ? "不连港，不售市场" : "此处未连通开张的贸易港：煤留在板件上，不卖给市场（只在建成时卖一次，之后连通也不会补卖）";
  return short ? "市场已满" : "市场已满：产出留在板件上";
}
// ---------- 「我的」：高亮自己的产业，其余城市与对手的板件压暗 ----------
function showMine(st, fit) {
  const ids = [...new Set((st.placed || []).filter(p => p.owner === me(st).id).map(p => p.city))];
  map.setTargets(ids.length ? ids : null, "mine");
  $("#map").classList.toggle("showmine", ids.length > 0);
  if (fit && ids.length) map.fitCities(ids, 1.4, 14);
  if (!ids.length && fit) toast("你在地图上还没有产业");
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
  const chips = d.options.map(o => `<button type="button" class="dchip bchip ${cur === o.industry ? "on" : ""}" data-db="${o.industry}">${B.industryZh[o.industry]}${ROMAN[o.level] || ""}</button>`).join("") +
    `<button type="button" class="dchip bchip ${cur === "" ? "on" : ""}" data-db="">Discard</button>`;
  return `<div class="dsel"><span class="dl bl">港口奖励：免费开发</span>${chips}</div>`;
}
function selAction() { return S && UI.sel !== null ? S.actions.find(a => a.i === UI.sel) : null; }
// ---------- 弃牌（伯明翰规则：每个动作弃 1 张，由玩家选；建造须弃对应的牌；侦查弃 3 张） ----------
function discardSpec() {
  const a = selAction();
  if (a && a.discard) return a.discard;
  if (UI.passMode && S) return { n: 1, allowed: S.hand.map((_, i) => i), default: S.passDiscard || [0] };
  return null;
}
function discardHTML() {
  const d = discardSpec(); if (!d) return "";
  const chips = d.allowed.map(i => {
    const c = S.hand[i]; if (!c) return "";
    return `<button type="button" class="dchip ${UI.discard.includes(i) ? "on" : ""} ${c.kind === "WILD" ? "wild" : ""}" data-di="${i}">${c.label}</button>`;
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
  const a = selAction(), box = $("#confirm");
  if (UI.passMode && S) {
    box.innerHTML = `<div class="ct"><div class="t1">跳过</div><div class="t2">不执行动作，仅弃 1 张牌</div>${discardHTML()}</div>
      <button id="btnCancel">取消</button><button class="primary" id="btnGo">确认 ⏎</button>`;
    box.classList.remove("hide"); return;
  }
  if (!a) { box.classList.add("hide"); return; }
  const cost = a.cost ? `$${a.cost}` : "免费";
  const detail = [];
  if (a.base !== null && a.base !== undefined && a.kind === "BUILD") detail.push(`板件 $${a.base}`);
  if (a.mktCash && a.kind !== "DEVELOP") detail.push(`购料 $${a.mktCash}`);
  box.innerHTML = `<div class="ct"><div class="t1">${KIND_ZH[a.kind]}：${actTitle(a)}</div>
      <div class="t2"><b style="color:var(--gold2)">${cost}</b>${detail.length ? `（${detail.join(" + ")}）` : ""} · ${actGain(viewAction(a))} ${srcHTML(a) ? " · " + srcHTML(a) : ""}</div>
      ${a.mktSale ? `<div class="t2 msale">${mktSaleText(a.mktSale, false)}</div>` : ""}
      ${beerHTML(a)}${devBonusHTML(a)}${discardHTML()}</div>
    <button id="btnCancel">取消</button><button class="primary" id="btnGo" ${discardReady() && beerReady() ? "" : "disabled"}>确认 ⏎</button>`;
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
  if (t.sellProv) n.push(`<span title="销售耗啤酒">售${cubeHTML("prov", 11)}${t.sellProv > 1 ? "×" + t.sellProv : ""}</span>`);
  return n.join("") || "—";
}
function renderMat(st) {
  const p = me(st);
  $("#mat").innerHTML = IND_ORDER.map(ind => {
    const t = nextTile(p, ind);
    const left = Object.values(p.supply[ind] || {}).reduce((a, b) => a + b, 0);
    if (!t) return `<div class="mrow2 off"><span class="bi" style="${artCSS(IND_ART[ind])}"></span><span class="bn">${B.industryZh[ind]}</span><span></span><span></span><span class="need">已用完</span><span></span><span></span></div>`;
    const ok = t.era === "BOTH" || t.era === st.era;
    return `<div class="mrow2 ${ok ? "" : "off"}" title="${B.industryZh[ind]}${ROMAN[t.level]}：造价 $${t.cost} · ${t.vp} 分 · 收入 +${t.income} · 连线 ${t.linkVp}${t.noDev ? " · 不可开发" : ""}${ok ? "" : `（${st.eraZh}不可用，需先开发）`}">
      <span class="bi" style="${artCSS(IND_ART[ind])}"></span><span class="bn">${B.industryZh[ind]}</span>
      <span class="lv${t.noDev ? " nd" : ""}">${ROMAN[t.level]}</span><span class="cost">$${t.cost}</span>
      <span class="need">${needHTML(t)}${ok ? "" : ` <span class="warn">需开发</span>`}</span>
      <span class="give">${t.vp}分 +${t.income}</span><span class="left">×${left}</span></div>`;
  }).join("");
}
function showMatModal(pid) {
  const st = V();
  let cur = pid === undefined ? me(st).id : pid;
  const d = document.createElement("div"); d.className = "overlay";
  const draw = () => {
    const p = st.players.find(x => x.id === cur);
    d.innerHTML = `<div class="modal wide"><button class="x">✕</button><h2>板件总览</h2>
      <div class="sub">各产业按等级依次使用，金框为下一块。帆：仅帆船时代；蒸：仅蒸汽时代${anyNoDev() ? "；不可开发：只能建造，不能用开发移除" : ""}。</div>
      <div class="mattabs">${st.players.map(q => `<button data-p="${q.id}" class="${q.id === cur ? "on" : ""}">${avatarHTML(q.avatar, PCOL[q.id], 24)}${q.name}</button>`).join("")}</div>
      <div class="matgrid">${IND_ORDER.map(ind => {
        const sup = p.supply[ind] || {}, nt = nextTile(p, ind);
        return `<div class="mcol"><h4><span class="bi" style="${artCSS(IND_ART[ind])}"></span>${B.industryZh[ind]}</h4>` +
          B.tiles[ind].map(t => {
            const left = sup[t.level] || 0;
            const era = t.era === "E1" ? "帆" : t.era === "E2" ? "蒸" : "";
            return `<div class="tcard ${nt && nt.level === t.level ? "next" : ""} ${left ? "" : "gone"}">
              <div class="h"><span class="l">${ROMAN[t.level]}</span>${era ? `<span class="era">${era}</span>` : ""}<span class="c">$${t.cost}</span></div>${t.noDev ? `<div class="nodev-note" title="Must build this tile to unlock the next level">Cannot be developed</div>` : ""}
              <div class="r">${needHTML(t)}</div>
              <div class="r"><span><b>${t.vp}</b>分</span><span>· 收入<b>+${t.income}</b></span><span>· 连线<b>${t.linkVp}</b></span>${ind === "PROV" ? `<span title="帆船时代建成放 1 桶，蒸汽时代建成放 2 桶">· 产啤酒<b>1</b>/<b>2</b></span>` : t.produces ? `<span>· 产${ind === "COAL" ? "煤" : "铁"}<b>${t.produces}</b></span>` : ""}</div>
              <span class="cnt">×${left}/${t.copies}</span></div>`;
          }).join("") + `</div>`;
      }).join("")}</div>
      <div class="legend">${cubeHTML("coal", 12)} 耗煤　${cubeHTML("iron", 12)} 耗铁　售${cubeHTML("prov", 12)} 销售耗啤酒<br>连线：板件翻面后，每条通到该城的连线在时代末多得这么多分（归修线的人）<br>产煤 / 产铁 / 产啤酒：建成时放在板件上的资源数，被取完即翻面（啤酒帆船时代 1 桶、蒸汽时代 2 桶）</div></div>`;
    d.querySelector(".x").onclick = () => d.remove();
    d.querySelectorAll(".mattabs button").forEach(b => b.onclick = () => { cur = +b.dataset.p; draw(); });
  };
  draw();
  d.addEventListener("click", e => { if (e.target === d) d.remove(); });
  document.body.appendChild(d);
}

// ---------- 记录 ----------
function logHTML(st) {
  let lastRound = null;
  return st.log.map(l => {
    const p = st.players.find(x => x.name === l.who);
    let sep = "";
    // 每一轮（包括第 1 轮）都有标题；开局的本土分配不算在任何一轮里
    const rk = l.who === "setup" || /^(★|最终排名)/.test(l.text) ? null : `${l.era}-${l.round}`;
    if (l.round !== undefined && rk !== null && rk !== lastRound)
      sep = `<div class="le round">${l.era === "E2" ? "蒸汽时代" : "帆船时代"} 第 ${l.round} 轮</div>`;
    if (rk !== null) lastRound = rk;
    return sep + `<div class="le ${l.who === "system" || l.who === "setup" ? "sys" : ""} ${l._new ? "new" : ""} ${l.at ? "loc" : ""}"` +
      (l.at ? ` data-at="${l.at.join(",")}" title="点击定位"` : "") + `>` +
      (p ? `<span class="who" style="color:${PCOL[p.id]}">${l.who}</span>` : "") + l.text +
      (l.why ? ` <span class="why">« ${l.why}</span>` : "") + `</div>`;
  }).join("");
}
function renderLog(st) {
  const h = logHTML(st);
  ["#log", "#log2"].forEach(s => { const e = $(s); e.innerHTML = h; e.scrollTop = 1e6; });
}

// ---------- 提示 ----------
function renderHint() {
  const st = S; const el = $("#hint");
  let h = "";
  if (st && st.started && !st.over && !UI.playing) {
    const m = me(st), myTurn = st.active === m.id;
    const openHub = new Set((st.hubs || []).filter(x => x.active && x.open !== false).map(x => x.city));
    const hubs = st.reach.filter(c => openHub.has(c)).length;
    const sell = st.actions.filter(a => a.kind === "SELL").length;
    const dead = st.placed.filter(p => p.owner === m.id && !p.flipped && ["COTTON", "MFG", "LUX"].includes(p.industry)).length;
    if (!myTurn) h = "";
    else if (!st.actions.length) h = "无可执行动作，只能跳过";
    else if (sell) h = `${sell} 件货物可销售`;
    else if (!hubs) h = "网络未连通开张的贸易港：无法销售，也无法从市场购煤。贸易港须有连线接入才开张";
    else if (dead >= 2) h = `${dead} 件货物未售出，时代末不计分`;
    else if (m.money < 6) h = "现金不足：收入低时贷款代价最小";
    else if (st.deck < 12 && st.era === "E1") h = "帆船时代即将结束：Ⅰ级板件与全部连线将被清除";
    else {
      const unlinked = st.players.filter(q => !q.isMe && !(st.linkedPairs || []).some(k => k.includes(m.id) && k.includes(q.id)));
      if (unlinked.length && st.round <= 4) h = `与 ${unlinked[0].name} 网络互通：双方各得 $8、收入 +1`;
    }
  }
  el.textContent = h; el.classList.toggle("hide", !h);
}

// ---------- 城市提示框 ----------
function showTip(html) { const t = $("#tip"); t.innerHTML = html; t.classList.remove("hide"); }
function hideTip() { $("#tip").classList.add("hide"); }
function cityTip(id) {
  const st = V(), c = city(id); if (!c) return;
  const tiles = st.placed.filter(p => p.city === id);
  let h = `<b>${c.zh}</b> <span class="sl">${c.en} · ${c.regionZh}${c.port ? " · 港口" : ""}</span>`;
  h += c.slots.map((s, i) => {
    const t = tiles.find(p => p.slot === i);
    if (t) {
      const res = t.resources && ["COAL", "IRON", "PROV"].includes(t.industry)
        ? ` · 存货 ${cubeHTML(t.industry === "COAL" ? "coal" : t.industry === "IRON" ? "iron" : "prov", 11)}×${t.resources}` : "";
      return `<div class="row" style="color:${PCOL[t.owner]}">${iconHTML(t.industry, 13, PCOL[t.owner])} ${B.industryZh[t.industry]}${ROMAN[t.level]}
        <span class="sl">${t.flipped ? "已翻面" : "未翻面"} · ${pname(st, t.owner)}${res}</span></div>`;
    }
    return `<div class="row sl">${s.map(x => iconHTML(x, 12, "#8f826a") + B.industryZh[x]).join(" / ")} · 未被占用</div>`;
  }).join("");
  // 轮到你时：这里的空格能建哪些产业、每种多少钱、建不了卡在哪（同一产业只说一次）
  if (S && S.buildInfo && !UI.playing && S.active === me(S).id) {
    const taken = new Set(tiles.map(t => t.slot));
    const inds = [...new Set(c.slots.filter((s, i) => !taken.has(i)).flat())];
    if (inds.length) h += `<div class="sl" style="margin-top:5px;color:var(--gold)">可建：</div>` + inds.map(ind => {
      const bs = buildStatus(id, ind);
      return `<div class="tipst ${bs.ok ? "ok" : "no"}">${bs.ok ? "✓" : "✗"} ${B.industryZh[ind]}${bs.e && bs.e.money != null ? ` $${bs.e.money}` : ""}${bs.ok ? "" : "：" + bs.why}</div>`;
    }).join("");
  }
  const hub = (st.hubs || []).find(x => x.city === id && x.active);
  if (hub) {
    const claimed = hub.claimedBy !== null && hub.claimedBy !== undefined;
    h += `<div class="row" style="color:var(--gold);margin-top:5px">⚓ ${hub.zh}：收购 ${hub.accepts.map(a => B.industryZh[a]).join(" / ")}</div>` +
      `<div class="sl">港内啤酒 ${cubeHTML("prov", 11)}×${hub.prov || 0}（售予此港时优先使用，每个时代补满）</div>` +
      `<div class="sl">港口奖励：<b style="color:var(--gold2);font-size:12px;letter-spacing:0">${BONUS_FULL[hub.bonus] || "—"}</b>` +
      (hub.prov ? "（用港内啤酒销售即得）" : claimed ? ` <span style="color:${PCOL[hub.claimedBy]}">本时代已由 ${pname(st, hub.claimedBy)} 领取</span>` : "（本时代已无）") + `</div>`;
  }
  const n = S && S.actions ? S.actions.filter(a => a.city === id).length : 0;
  if (n && !UI.playing) h += `<div class="sl" style="margin-top:4px;color:var(--gold)">点击查看 ${n} 个可选动作</div>`;
  showTip(h);
}
function linkTip(key) {
  const [a, b] = key.split("|"), l = B.links.find(x => [x.a, x.b].sort().join("|") === key); if (!l) return;
  const st = V(), bl = (st.builtLinks || []).find(x => [x.a, x.b].sort().join("|") === key);
  const era = l.era === "E1" ? "仅帆船时代" : l.era === "E2" ? "仅蒸汽时代" : "两个时代";
  const cost = B.linkCost[`${st.era}_${l.sea ? "sea" : "land"}`];
  let h = `<b>${cityZh(a)} — ${cityZh(b)}</b> <span class="sl">${l.sea ? "海运" : "陆路"} · ${era}</span>`;
  if (bl) h += `<div class="row" style="color:${PCOL[bl.owner]}">${pname(st, bl.owner)} 已建成</div>`;
  else if (cost && (l.era === "BOTH" || l.era === st.era)) h += `<div class="sl">建造费用：$${cost.money}${cost.coal ? ` + ${cubeHTML("coal", 11)}` : ""}${cost.prov ? ` + ${cubeHTML("prov", 11)}` : ""}</div>`;
  else h += `<div class="sl">${st.eraZh}不可用</div>`;
  showTip(h);
}

// ---------- 地图交互 ----------
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
    toast(hit.city ? `${cityZh(hit.city)}：当前无可执行动作，原因见提示框` : `该连线${S.eraZh}不可建`);
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
  e.className = "fxtext"; e.textContent = text; e.style.color = color;
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
  const b = $("#banner"); b.textContent = text; b.classList.remove("hide");
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
  const step = UI.stepTotal > 1 ? `<span class="pstep" title="本轮 AI 行动的第几步">${UI.stepN}/${UI.stepTotal}</span>` : "";
  $("#playwho").innerHTML = !p ? "" : waiting
    ? `${avatarHTML(p.avatar, PCOL[p.id], 24)}<span style="color:${PCOL[p.id]}">${p.name}</span>${step}<span class="ptap">点任意处继续 ▸</span>`
    : `${avatarHTML(p.avatar, PCOL[p.id], 24)}<span style="color:${PCOL[p.id]}">${p.name}</span> 行动中…`;
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
    D.log.push({ who: pname(D, ev.p), text: "跳过", _new: 1 }); renderLog(D);
    if (ev.p === me(D).id) return sleep(DUR(500));
    UI.stepN += 1;
    const card = actFeed(ev.p, "跳过", "", SET.step);
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
      if (v) floatText(screenOfPlayer(+pid, ".money"), (v > 0 ? "+$" : "−$") + Math.abs(v), v > 0 ? "#b9e3a7" : "#f09a8a");
    });
    D.log.push({ who: "system", text: `第 ${ev.round} 轮结束：发放收入；本轮花费少者下轮先行`, _new: 1 }); renderLog(D);
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
  const card = isMe ? null : actFeed(pid, ev.text, ev.why, SET.step);
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
  D.log.push({ who: isMe ? "你" : pname(D, pid), text: ev.text, why: ev.why, _new: 1,
    at: [ev.city, ...(ev.link || []), ...(ev.second || [])].filter(Boolean) });

  map.clearPreview();
  map.setState(D, me(D).id);
  renderPlayers(D, bump); renderLog(D); renderMat(D);
  if (ev.kind === "BUILD" || ev.kind === "SELL") { map.popSlot(ev.city, ev.slot); ringAt(screenOfCity(ev.city, ev.slot), col); }
  (ev.sells || []).slice(1).forEach(s => { map.popSlot(s.city, s.slot); ringAt(screenOfCity(s.city, s.slot), col); });
  if (ev.kind === "NETWORK") [ev.link, ev.second].filter(Boolean).forEach(l => map.flashLink([...l].sort().join("|"), col));
  // 数字飘字：钱、收入、分
  const dm = (ev.dmoney || {})[pid];
  if (dm) floatText(screenOfPlayer(pid, ".money"), (dm > 0 ? "+$" : "−$") + Math.abs(dm), dm > 0 ? "#b9e3a7" : "#f0b08a");
  const di = (ev.dincome || {})[pid];
  if (di) setTimeout(() => floatText(screenOfPlayer(pid, ".r2"), `收入 ${di > 0 ? "+" : ""}${di}`, di > 0 ? "#b9e3a7" : "#f09a8a"), DUR(260));
  if (ev.kind === "SELL") floatText(tgt, "卖出！", "#ffe39a");
  // 煤铁建成立刻卖给市场：方块从板件飞回市场
  if (ev.kind === "BUILD" && ["COAL", "IRON"].includes(ev.industry)) {
    const after = (ev.after || []).find(t => t.city === ev.city && t.slot === ev.slot);
    const sold = after ? (ev.produces || 0) - after.resources : 0;
    for (let j = 0; j < sold; j++) flyCube(ev.industry === "COAL" ? "coal" : "iron", tgt, screenOfMarket(zone), 200 + j * 90, 480);
  }
  Object.entries(ev.dmoney || {}).forEach(([op, v]) => {       // 被取用资源的对手也有反应
    if (+op !== pid && v) floatText(screenOfPlayer(+op, ".money"), (v > 0 ? "+$" : "−$") + Math.abs(v), "#b9e3a7");
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
      const parts = [["tiles", "板件"], ["links", "连线"], ["contested", "争夺"]].filter(([k]) => g[k]).map(([k, z]) => `${z} ${g[k]}`).join(" · ");
      return `<div class="g">${avatarHTML(p.avatar, PCOL[p.id], 42)}<div class="n" style="color:${PCOL[p.id]}">${p.name}</div>
        <div class="v">+${tot}</div><div class="d">${parts || "—"}</div><div class="d">合计 ${ev.vp[p.id]} 分</div></div>`;
    }).join("");
    d.innerHTML = `<h2>${ev.eraZh}结束</h2><p>已翻面板件计分；连线按两端板件的连线分计分</p><div class="gains">${rows}</div>
      <p>${ev.final ? "对局结束" : "即将进入蒸汽时代：Ⅰ级板件与全部连线将被清除"}</p><button class="primary">继续</button>`;
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
  d.innerHTML = `<h2>抽取顺位</h2><div class="sub">The turn order for Round 1 is determined randomly.</div>
    <div class="odcards">${order.map((pid, i) => {
      const p = pInfo(st, pid);
      return `<div class="odc ${pid === meId ? "me" : ""}" style="--c:${PCOL[pid]};--i:${i}"><div class="in">
        <div class="back"></div>
        <div class="front"><span class="no">${i + 1}</span>${avatarHTML(p.avatar, PCOL[pid], 54)}<b style="color:${PCOL[pid]}">${p.isMe ? "你" : p.name}</b></div>
      </div></div>`;
    }).join("")}</div>
    <div class="cap"></div><div class="hintc">Click to continue</div>`;
  document.body.appendChild(d);
  await sleep(UI.skip ? 0 : DUR(900));                      // 洗牌
  const cards = [...d.querySelectorAll(".odc")];
  for (const c of cards) { c.classList.add("flip"); await sleep(UI.skip ? 0 : DUR(380)); }
  d.querySelector(".cap").innerHTML = pos === 1 ? `你<b>第 1 个</b>行动` :
    `你<b>第 ${pos} 个</b>行动：前面 ${pos - 1} 位对手先行动，你会看到他们的每一步`;
  d.classList.add("done");
  await clickOrWait(d, DUR(2600));
  d.classList.add("out"); await sleep(UI.skip ? 0 : 280); d.remove();
}
// 开场：时代与轮次
async function startSplash(st) {
  const d = document.createElement("div"); d.id = "startSplash";
  d.innerHTML = `<div class="t1">${st.eraZh}</div><div class="t2">游戏开始</div>
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
  d.innerHTML = `<span class="rd">${st.eraZh} 第 ${round} 轮</span>` + order.map((pid, i) => {
    const p = pInfo(st, pid);
    return `<span class="os ${pid === meId ? "me" : ""}" style="--c:${PCOL[pid]}"><i>${i + 1}</i>${avatarHTML(p.avatar, PCOL[pid], 26)}<b>${p.isMe ? "你" : p.name}</b></span>`;
  }).join(`<span class="ar">›</span>`) + `<span class="why">上轮花费少者先行动</span>`;
  $("#mapwrap").appendChild(d);
  setTimeout(() => d.classList.add("out"), DUR(2600));
  setTimeout(() => d.remove(), DUR(2600) + 400);
}
// 「记录」按钮下方的行动卡片：谁做了什么、为什么；几秒后自动消失
function actFeed(pid, text, why, sticky = false) {
  const box = $("#actfeed"), st = V(), p = st && pInfo(st, pid); if (!box || !p) return null;
  const e = document.createElement("div"); e.className = "afc"; e.style.setProperty("--c", PCOL[pid]);
  e.innerHTML = `<div class="h">${avatarHTML(p.avatar, PCOL[pid], 22)}<b style="color:${PCOL[pid]}">${p.isMe ? "你" : p.name}</b></div>
    <div class="t">${text}</div>${why ? `<div class="w">${why}</div>` : ""}`;
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
  d.innerHTML = `<div class="pill">${avatarHTML(p.avatar, col, 40)}<div><b>轮到你了</b><span>本回合 ${n || st.actionsLeft || 2} 个动作</span></div></div>`;
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
  const b = $("#btnMusic"); b.classList.toggle("on", on); b.title = on ? "背景音乐：开（M）" : "背景音乐：关（M）";
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
  d.innerHTML = `<div class="modal ${cls}">${html}</div>`;
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
  const ls = localSave();
  const o = Object.assign({}, SET);
  const resume = ls ? `<div class="resume"><div class="t">上一局：<b>${ls.meta.era || ""} 第 ${ls.meta.round || "?"} 轮</b><br>
      ${(ls.meta.players || []).map(p => `${p.name} ${p.vp}分`).join(" · ")}<br><span style="color:var(--dim);font-size:11.5px">${new Date(ls.meta.t || Date.now()).toLocaleString("zh-CN")}</span></div>
      <button class="primary" id="ngResume">继续上局</button></div>` : "";
  const d = modal(`<h2>工业革命 · 世界</h2>
    <div class="sub">Brass: Birmingham 同人世界地图 · 80 城 · 21 区域 · 4 人局（你与 3 个 AI）</div>
    ${resume}
    <div class="field"><label>AI 难度</label>${seg("level", [["easy", "新手"], ["normal", "老练"], ["hard", "大师"]], o.level)}
      <div class="seg"><span class="hint" id="lvHint"></span></div></div>
    <div class="field"><label>推荐走法</label>${seg("hints", [["0", "关"], ["1", "开"]], o.hints ? "1" : "0")}</div>
    <div class="field" style="align-items:flex-start"><label>你的头像</label><div class="avgrid">${AVATARS.map(k =>
      `<div class="avopt ${k === o.avatar ? "on" : ""}" data-av="${k}">${avatarHTML(k, "#c9a15a", 44)}<span>${AVATAR_ZH[k]}</span></div>`).join("")}</div></div>
    <div class="btns">${S && S.started && !S.over ? `<button id="ngCancel">返回对局</button>` : ""}<button class="primary" id="ngGo">开始新对局</button></div>`);
  if (!(S && S.started)) d.dataset.sticky = "1";
  const LVH = { easy: "启发式评分，随机性较大", normal: "价值网络，偶有次优选择", hard: "价值网络 + 整回合前瞻",
    master: "价值网络 + 抽样模拟搜索，最强；每轮需等十余秒" };
  const sync = () => { d.querySelector("#lvHint").textContent = LVH[o.level]; };
  bindSeg(d, (k, v) => { o[k] = k === "hints" ? v === "1" : v; sync(); });
  d.querySelectorAll(".avopt").forEach(a => a.onclick = () => { o.avatar = a.dataset.av; d.querySelectorAll(".avopt").forEach(x => x.classList.toggle("on", x === a)); });
  sync();
  if (ls) d.querySelector("#ngResume").onclick = async () => { d.remove(); await resumeLocal(); };
  const c = d.querySelector("#ngCancel"); if (c) c.onclick = () => d.remove();
  d.querySelector("#ngGo").onclick = async () => {
    Object.assign(SET, { level: o.level, hints: o.hints, avatar: o.avatar }); savePrefs();
    d.remove(); $$("#final").forEach(x => x.remove());
    PREV_CLEAR();
    // 开局顺位随机，AI 可能先走；大师、宗师难度要算几秒 —— 没提示的话像是点了没反应
    const wait = modal(`<h2>正在开局…</h2><div class="sub">分配本土、洗牌；先行的 AI 正在行动</div>`);
    wait.dataset.sticky = "1";
    let st;
    try { st = await api("/api/new", { level: o.level, hints: o.hints, avatar: o.avatar }); }
    finally { wait.remove(); }
    await playOpening(st);
    if (!SET.reduceMotion) await map.focusRegion(me().home);
    toast(`Home: ${me().homeZh}. Hover over cards in your hand to see buildable cities and required resources.`);
    try { if (!localStorage.getItem("bw_seen3")) { showHelp(); localStorage.setItem("bw_seen3", "1"); } } catch (e) { }
  };
}
const STEPS = () => [
  ["目标", "两个时代结束后，胜利点最高者获胜；同分比收入，再比现金。胜利点来自<b>已翻面的板件</b>（每个时代末各计一次）与<b>连线</b>（两端已翻面板件的连线分之和，贸易港所在城市另加 2）。"],
  ["回合与手牌", "每回合 2 个动作（帆船时代第一轮每人 1 个），每个动作弃 1 张手牌，弃哪张由你选择（确认条中可更换）。建造须弃对应的<b>区域牌</b>、<b>产业牌</b>或万用牌；侦查弃 3 张，换取万用区域牌与万用产业牌各 1 张。也可弃 1 张牌跳过一个动作。回合结束时补足 8 张，牌库用尽后不再补。"],
  ["网络", "<b>你的网络</b>：有你板件的城市，以及你的连线两端的城市。用产业牌建造须在网络内，用区域牌可建在该区域任一城市（同原作的地点牌），新连线须接着网络。卖货、用煤、用别人的啤酒只要求<b>连通</b>：沿任何玩家的连线能到即可。本土区域开局自带连线。每个动作铺 1 条连线；蒸汽时代可一次铺 2 条（第二条接在第一条远端），两条单价之和 + $5，另耗 1 啤酒。"],
  ["建造", "城里有只画该产业的空格时须建在那里，没有才用两种产业共用的格。帆船时代每人在每座城市最多 1 块板件。可用同产业更高级的板件<b>覆盖</b>自己的板件；对手的煤矿、铁厂只在场上与市场都没有该资源时可覆盖。被覆盖的板件移出游戏，原主不损失收入。"],
  ["煤、铁与市场", "酿酒厂帆船时代建成放 1 桶啤酒，蒸汽时代建成放 2 桶。建造消耗煤（黑）与铁（橙）。煤取与该处连通、相隔连线最少的煤矿（谁的都行），不足时向市场购买（该处须与开张的贸易港连通）；铁可取场上任意铁厂。铁厂建成后，产出售予所在区的市场；煤矿须在建成时已与开张的贸易港连通才售予市场。两者都只在<b>建成那一刻</b>卖一次，之后再连通也不会补卖。蒸汽时代起，有连线连通的两个区市场合并。"],
  ["资金", "每轮结束按收入领钱（全局最后一轮除外）。贷款：得 $30，收入退 3 级，不得低于 −10。收入为负且付不起时，须拆除自己的板件，每块得造价一半；仍不够，每差 $1 扣 1 分。"],
  ["板件等级", `各产业板件按等级依次使用。开发：移除 1–2 块板件（各为所属产业当前最低一级，可同一产业），每块支付 1 铁。Ⅰ级板件在帆船时代结束时清出地图；标注“仅帆船时代”的板件须先开发，蒸汽时代才能继续该产业。${anyNoDev() ? "标注“不可开发”的板件只能建造。" : ""}`],
  ["销售", "棉纺厂、制造厂、陶瓷厂须连通收购该货的<b>贸易港</b>方可销售。贸易港须有连线接入（港口城市至少连着一条已建成的连线，谁建的都行）才开张，未开张时地图上显示为暗色。销售按板件所示消耗啤酒，用哪桶由你选：所卖贸易港自带的啤酒（每个时代 1 桶）、你自己任一酿酒厂的、或与该板件连通的对手酿酒厂的。一次销售可任选几件，售出后板件翻面。用掉贸易港自带的啤酒时获得该港奖励（港内啤酒每个时代补满）。"],
  ["操作", "悬停（手机：点按）手牌可查看可建城市、造价与所需资源。点击城市或连线可筛选该处动作。选中动作后，地图显示目标与资源来源，确认后执行。AI 行动逐条回放，可跳过。"],
];
// ---------- 玩法：先问会不会玩伯明翰，再讲规则或差异，最后逐一指认界面 ----------
const KEYS_LINE = `<div class="sub" style="margin:12px 0 0">快捷键：回车 确认 · Esc 取消 · AI 回合中空格 / 回车 下一步、Esc 跳过回放 · F 全局 · H 本土 · I 我的产业 · M 音乐</div>`;
function showHelp() {
  const d = modal(`<button class="x">✕</button><h2>玩法</h2>
    <div class="sub">你玩过《工业革命：伯明翰》吗？</div>
    <div class="choose">
      <button type="button" id="hpKnow"><b>会玩</b><span>只看与伯明翰不同的地方，再认识界面</span></button>
      <button type="button" id="hpNew"><b>不会玩</b><span>从规则讲起，再逐一认识界面</span></button>
    </div>${KEYS_LINE}`);
  d.querySelector(".x").onclick = () => d.remove();
  d.querySelector("#hpKnow").onclick = () => { d.remove(); showDiffs(); };
  d.querySelector("#hpNew").onclick = () => { d.remove(); showRules(); };
}
const DIFFS = [
  ["地图与牌", "世界地图共 80 城、21 个区域。地点牌改为<b>区域牌</b>：可在该区域任一城市建造，同样不必在网络内。固定 4 人局，每个时代约 13 轮。"],
  ["本土", "每人有一个本土区域，开局自带本土内的连线。"],
  ["贸易港", "对应商人，共 17 个，设在城市里，这座城市也可以建产业。原作卖货至少要经一条通往商人的连线，这里对应为：<b>港口城市至少连着一条已建成的连线（谁建的都行）才开张</b>，未开张的港不收货，也不能经它买市场煤。每个港收购的货物固定；港口奖励（免费开发、收入 +2、3 分、$5）每局随机分配。港内啤酒即商人啤酒，每个时代补满。"],
  ["市场", "煤铁市场分四个区：不列颠、欧陆、美洲、亚太，各一套原作规格的市场，开局储量不同。在哪个区建造，就向哪个区的市场购买、卖给哪个区的市场。<b>蒸汽时代</b>起，两个区之间有连线连通（谁修的都行），两区市场合并成一个：方块与空位合在一起，价格趋同，建在任一区的煤矿、铁厂都能填补合并后市场的空位。帆船时代各区市场始终独立。"],
  ["海运线", "除陆路外还有海运线：帆船时代 $8；蒸汽时代 $12，另耗 1 煤、1 啤酒。蒸汽时代双铺时，第二条须接在第一条的远端。"],
  ["额外收益", "两名玩家的网络首次连通时，双方各得 $8、收入 +1。时代结束时，同一城市有两家以上的板件，每家 +2 分。"],
  ["简化", "收入为负、须拆板件还钱时，由系统自动选择损失最小的板件。"],
];
function stepsHTML(list) {
  return list.map((s, i) => `<div class="step"><div class="n">${i + 1}</div><div class="t"><b>${s[0]}</b><div class="d">${s[1]}</div></div></div>`).join("");
}
function showDiffs() {
  const d = modal(`<button class="x">✕</button><h2>与伯明翰的不同</h2>
    <div class="sub">其余规则与《工业革命：伯明翰》相同</div>${stepsHTML(DIFFS)}
    <div class="btns"><button id="hpAll">查看完整规则</button><button class="primary" id="hpTour">认识界面 →</button></div>`);
  d.querySelector(".x").onclick = () => d.remove();
  d.querySelector("#hpAll").onclick = () => { d.remove(); showRules(false); };
  d.querySelector("#hpTour").onclick = () => { d.remove(); startTour(false); };
}
function showRules(novice = true) {
  const d = modal(`<button class="x">✕</button><h2>规则</h2>
    <div class="sub">Brass: Birmingham 规则 · 世界地图 · 进度自动保存于本机浏览器</div>${stepsHTML(STEPS())}${KEYS_LINE}
    <div class="btns"><button id="hpClose">关闭</button><button class="primary" id="hpTour">认识界面 →</button></div>`);
  d.querySelectorAll(".x,#hpClose").forEach(b => b.onclick = () => d.remove());
  d.querySelector("#hpTour").onclick = () => { d.remove(); startTour(novice); };
}

// 界面导览：遮罩上挖一个洞露出目标区域，旁边放说明。手机上目标在底部标签页里，先切过去。
function tourStops(novice) {
  const n = (a, b) => novice ? a + b : a;
  return [
    { sel: "#mapwrap", title: "地图",
      text: n("80 座城市、21 个区域。城市下方的格位标出可建的产业，⚓ 为贸易港（暗色表示还没有连线接入，未开张），虚线为航线。点击城市或连线，可筛选该处的动作。",
        "你的板件和连线都建在这里；开局你在自己的本土区域，已自带连线。") },
    { sel: "#handPane", pane: "hand", title: "手牌",
      text: n("区域牌可在该区域任一城市建造；产业牌可在网络内任一城市建造该产业。悬停一张牌，地图亮出能建的城市与造价。",
        "手牌 8 张，每个动作都要弃 1 张；回合结束时补足。") },
    { sel: "#actPane", pane: "act", title: "可选行动",
      text: n("本回合能执行的动作，按类别分页；也可跳过。选中一项，地图显示目标与资源来源，确认条显示花费与要弃的牌。",
        "六种动作：建造、连接、销售、开发、贷款、侦查。这里只列出现在能做的。") },
    { sel: "#matPane", pane: "mat", title: "板件",
      text: n("每种产业的下一块板件：造价、所需煤铁、分数与收入。「全部板件」查看完整面板。",
        "同一产业按等级从低到高依次使用；开发动作可以移除低级板件，直接用上高级的。") },
    { sel: "#markets", msel: "#mktPane", pane: "mkt", title: "四个煤铁市场",
      text: n("不列颠、欧陆、美洲、亚太各有一个煤（黑）铁（橙）市场。建造缺煤缺铁时，向所在区的市场购买；蒸汽时代起，两个区有连线连通后，市场合并。",
        "越买越贵；买煤须与开张的贸易港连通。建成煤矿、铁厂时，产出先卖给市场换钱。") },
    { sel: "#players", title: "玩家信息",
      text: n("每位玩家的分数、现金、收入与本土，按本轮行动顺序排列。点击玩家卡查看其板件。",
        "收入在每轮结束时发放；本轮花钱最少的，下一轮最先行动。") },
    { sel: "#btnLog", msel: '#sheetTabs button[data-pane="log"]', title: "行动记录",
      text: "所有玩家的行动、弃牌与奖励都记录在这里，点击一条可在地图上定位。" },
  ];
}
function startTour(novice) {
  const stops = tourStops(novice);
  let k = 0;
  const box = document.createElement("div"); box.className = "coach";
  box.innerHTML = `<div class="hole"></div><div class="bub"><div class="h"><b></b><span class="k"></span></div><div class="d"></div>
    <div class="b"><button type="button" class="skip">结束导览</button><span class="spacer"></span><button type="button" class="prev">上一步</button><button type="button" class="primary next"></button></div></div>`;
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
      bub.querySelector(".next").textContent = k === stops.length - 1 ? "开始游戏" : "下一步";
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
  const d = modal(`<button class="x">✕</button><h2>设置</h2><div class="sub">保存在这台设备上</div>
    <div class="field"><label>AI 行动</label>${seg("step", [["1", "逐步（点击继续）"], ["0", "自动播放"]], SET.step ? "1" : "0")}</div>
    <div class="field"><label>动画速度</label>${seg("speed", [["1.6", "慢"], ["1", "正常"], ["0.5", "快"], ["0.15", "极快"]], SET.speed)}</div>
    <div class="field"><label>镜头跟随</label>${seg("follow", [["1", "跟随 AI 行动"], ["0", "不动"]], SET.follow ? "1" : "0")}</div>
    <div class="field"><label>推荐走法</label>${seg("hints", [["0", "关"], ["1", "开"]], SET.hints ? "1" : "0")}</div>
    <div class="field"><label>Contrast mode</label>${seg("contrastMode", [["off", "Standard"], ["light", "Light high contrast"], ["dark", "Dark high contrast"]], SET.contrastMode)}</div>
    <div class="field"><label>Text size</label>${seg("largeText", [["0", "Default"], ["1", "Larger"]], SET.largeText ? "1" : "0")}</div>
    <div class="field"><label>Animation</label><div class="a11y-setting">${seg("reduceMotion", [["0", "Animations on"], ["1", "Reduce animations"]], SET.reduceMotion ? "1" : "0")}<p class="a11y-help">Skips animated AI move replays and minimizes decorative motion and camera movement.</p></div></div>
    <div class="field"><label>背景音乐</label>${seg("music", [["1", "开"], ["0", "关"]], SET.music ? "1" : "0")}</div>
    <div class="field"><label>音量</label>${seg("vol", [["0.2", "低"], ["0.35", "中"], ["0.55", "高"]], SET.vol)}</div>
    <div class="field"><label>存档</label><button id="stExport">导出存档文件</button><button id="stImport">导入存档文件</button></div>
    <div class="btns"><button class="primary">完成</button></div>`);
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
    const ls = localSave(); if (!ls) { toast("还没有可导出的存档"); return; }
    const blob = new Blob([JSON.stringify(ls.save)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `工业革命世界-存档-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  d.querySelector("#stImport").onclick = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = async () => {
      try {
        const save = JSON.parse(await inp.files[0].text());
        const st = await api("/api/load", { save });
        if (!st.started) { toast(st.error || "存档无法读取"); return; }
        d.remove(); PREV_CLEAR(); await applyState(st, false); map.focusRegion(me().home); toast("存档已导入");
      } catch (e) { toast("存档文件无法读取"); }
    };
    inp.click();
  };
}
function showFinal() {
  const st = S, rank = [...st.players].sort((a, b) => b.vp - a.vp || b.income - a.income || b.money - a.money);   // 同分比收入，再比现金
  const cols = [["tiles", "板件"], ["links", "连线"], ["contested", "争夺"], ["hub", "贸易港"], ["debt", "欠债"]];
  const bk = st.vpBreak || {};
  const mine = rank.findIndex(p => p.isMe) + 1;
  const d = modal(`<h2>对局结束</h2><div class="sub">${mine === 1 ? "获胜。" : `第 ${mine} 名。`}胜利点按来源拆分</div>
    <table class="score"><thead><tr><th></th><th>玩家</th>${cols.map(c => `<th>${c[1]}</th>`).join("")}<th>合计</th></tr></thead><tbody>
    ${rank.map((p, i) => { const b = bk[p.id] || {}; return `<tr class="${p.isMe ? "me" : ""}"><td>${i + 1}</td>
      <td><span class="namecell">${avatarHTML(p.avatar, PCOL[p.id], 26)}${p.name}${p.levelZh ? ` <span style="color:var(--dim);font-size:11px">${p.levelZh}</span>` : ""}</span></td>
      ${cols.map(([k]) => `<td class="${(b[k] || 0) < 0 ? "neg" : ""}">${b[k] ? b[k] : "—"}</td>`).join("")}<td class="tot">${p.vp}</td></tr>`; }).join("")}
    </tbody></table><div class="btns"><button id="fnView">查看终局地图</button><button class="primary" id="fnAgain">再来一局</button></div>`);
  d.id = "final";
  d.querySelector("#fnView").onclick = () => d.remove();
  d.querySelector("#fnAgain").onclick = () => { d.remove(); showNewGame(); };
}

// ================= 其他 =================
function toast(text) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = text;
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
  $("#btnMat").onclick = () => showMatModal();
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
    UI.tab = b.dataset.k; renderActions();
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
