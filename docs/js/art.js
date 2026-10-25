// 美术资源：精灵图切片、SVG 图标、煤铁方块、头像。
export const NS = "http://www.w3.org/2000/svg";
export const el = (t, a = {}) => {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};

// 产业插画：原来是一张 2048 宽的精灵图，每块板件都嵌一整张再裁 —— 地图上几十块板件时
// 渲染很重。现在预先切成 256px 的小图（web/assets/tiles/，切图脚本见 tools 说明）。
const tile = k => ({ src: `/assets/tiles/${k}.jpg`, W: 256, H: 256, x: 0, y: 0, w: 256, h: 256 });
export const IND_ART = {
  COAL: tile("COAL"), IRON: tile("IRON"), PROV: tile("PROV"), MFG: tile("MFG"),
  LUX: tile("LUX"), COTTON: tile("COTTON"),
};
export const RAIL_ART = tile("RAIL"), LOCO_ART = tile("LOCO");
export const PORT_ART = tile("PORT");
const TERRAIN = { src: "/assets/terrain.png", W: 1600, H: 900 };

export const IND_ORDER = ["COAL", "IRON", "PROV", "COTTON", "MFG", "LUX"];
export const PCOL = ["#c0492f", "#3574ad", "#46895a", "#c9a24a", "#8561b3", "#cf7a3e"];
export const PCOL_ZH = ["Vermilion", "Cobalt", "Forest", "Ochre", "Violet", "Rust"];
export const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ"];
export const BONUS_SHORT = { develop: "On", income: "Inc", vp: "VP", money: "£" };
export const BONUS_FULL = { develop: "Develop one tile for free (your choice)", income: "Income +2 steps", vp: "+3 VP", money: "+£5" };

// 区域牌画面：按区域 id 取地形图不同片段。用无符号右移，避免哈希转负数后背景跑出框外。
export function regionArt(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const w = 430, ht = 330;
  return { ...TERRAIN, x: h % (TERRAIN.W - w), y: (h >>> 7) % (TERRAIN.H - ht), w, h: ht };
}

// 把一格画面铺进 HTML 盒子：用百分比，与盒子尺寸无关，任何比例都刚好填满
export function artCSS(a) {
  if (!a.x && !a.y && a.w === a.W && a.h === a.H)
    return `background-image:url(${a.src});background-size:cover;background-position:center;background-repeat:no-repeat;`;
  const sw = a.W / a.w * 100, sh = a.H / a.h * 100;
  const cl = v => Math.max(0, Math.min(100, v));
  const px = cl((a.W - a.w) ? (a.x / (a.W - a.w) * 100) : 0);
  const py = cl((a.H - a.h) ? (a.y / (a.H - a.h) * 100) : 0);
  return `background-image:url(${a.src});background-size:${sw.toFixed(3)}% ${sh.toFixed(3)}%;` +
    `background-position:${px.toFixed(3)}% ${py.toFixed(3)}%;background-repeat:no-repeat;`;
}

// SVG 里取一格：嵌套 svg + viewBox，不用切图
export function artSVG(a, x, y, w, h) {
  if (!a.x && !a.y && a.w === a.W && a.h === a.H)          // 整张小图：直接一个 <image>，不嵌套
    return el("image", { href: a.src, x, y, width: w, height: h, preserveAspectRatio: "xMidYMid slice" });
  const sub = el("svg", { x, y, width: w, height: h, viewBox: `${a.x} ${a.y} ${a.w} ${a.h}`,
    preserveAspectRatio: "xMidYMid slice" });
  sub.appendChild(el("image", { href: a.src, width: a.W, height: a.H }));
  return sub;
}

// ---- 图标（SVG symbol，放进页面 <defs> 一次） ----
export const SYMBOLS = `
<!-- 煤矿：装煤的矿车；铁厂：铁砧；棉纺厂：绕满线的线轴；制造厂：木箱（原作图标） -->
<symbol id="i-COAL" viewBox="0 0 24 24"><path d="M4.6 9.2a2.7 2.7 0 0 1 4.4-2.5a3.2 3.2 0 0 1 5.9-.9a2.8 2.8 0 0 1 4.5 3.4z"/><path d="M3 10.4h18l-2.6 7.4H5.6z"/><circle cx="8.4" cy="20.2" r="2.1"/><circle cx="15.6" cy="20.2" r="2.1"/></symbol>
<symbol id="i-IRON" viewBox="0 0 24 24"><path d="M2 7.4C3.8 6.5 5.8 6 7.6 6H21v4h-4.3c-.6 1.2-.8 2.5-.5 3.8l3.3 2.6v3.1h-5.7v-1.3h-3.6v1.3H4.5v-3.1l3.3-2.6c.3-1.3.1-2.6-.5-3.8h-1C4.6 10 3 9 2 7.4z"/></symbol>
<symbol id="i-PROV" viewBox="0 0 24 24"><path d="M7 4h10c1 3 1 13 0 16H7c-1-3-1-13 0-16z"/><rect x="5" y="8" width="14" height="1.6"/><rect x="5" y="14" width="14" height="1.6"/></symbol>
<symbol id="i-COTTON" viewBox="0 0 24 24"><ellipse cx="11" cy="4.8" rx="7.6" ry="2.3"/><ellipse cx="11" cy="19.2" rx="7.6" ry="2.3"/><path fill-rule="evenodd" d="M5.2 7.7h11.6v8.6H5.2zM5.2 9.9h11.6v.9H5.2zM5.2 12.4h11.6v.9H5.2zM5.2 14.9h11.6v.9H5.2z"/><path d="M16.8 11.6c2.6.6 4.2 2.6 4.6 6.6l.1 3.3h-1.2l-.1-3.2c-.3-3.3-1.5-4.9-3.4-5.5z"/></symbol>
<symbol id="i-MFG" viewBox="0 0 24 24"><path d="M12 2.6l9 4.2-9 4.2-9-4.2z"/><path fill-rule="evenodd" d="M2.8 8.2l8.6 4v9.6l-8.6-4zM2.8 12.3l8.6 4v.9l-8.6-4z"/><path fill-rule="evenodd" d="M12.6 12.2l8.6-4v9.6l-8.6 4zM12.6 16.3l8.6-4v.9l-8.6 4z"/></symbol>
<symbol id="i-LUX" viewBox="0 0 24 24"><path d="M9 2h6v2.5c0 2 3 3.5 3 7.5s-2.5 7-6 10c-3.5-3-6-6-6-10s3-5.5 3-7.5z"/></symbol>

<symbol id="tk-rail" viewBox="0 0 24 24"><path d="M3 16h12v-7h-3.5V5H3z"/><rect x="15" y="11" width="4.5" height="5"/><rect x="4.2" y="2" width="2.8" height="3.4"/><circle cx="6.5" cy="19" r="2.3"/><circle cx="12.5" cy="19" r="2.3"/><circle cx="17.5" cy="19" r="1.9"/></symbol>
<symbol id="tk-ship" viewBox="0 0 24 24"><path d="M2.5 15.5h19L19 21H5z"/><rect x="11.2" y="3" width="1.7" height="12.5"/><path d="M13.6 4.2l6 8.3h-6z"/><path d="M10.5 5.4L5.2 12.5h5.3z"/></symbol>
<symbol id="cube-coal" viewBox="0 0 20 20"><path d="M10 1.5l7.5 4.2v8.6L10 18.5 2.5 14.3V5.7z" fill="#0c0c0c"/><path d="M10 1.5l7.5 4.2L10 9.9 2.5 5.7z" fill="#4a4a4a"/><path d="M2.5 5.7L10 9.9v8.6l-7.5-4.2z" fill="#262626"/><path d="M5 5.2l2.4-1.3" stroke="#8a8a8a" stroke-width="1" stroke-linecap="round"/></symbol>
<symbol id="cube-iron" viewBox="0 0 20 20"><path d="M10 1.5l7.5 4.2v8.6L10 18.5 2.5 14.3V5.7z" fill="#8a3f12"/><path d="M10 1.5l7.5 4.2L10 9.9 2.5 5.7z" fill="#f09a45"/><path d="M2.5 5.7L10 9.9v8.6l-7.5-4.2z" fill="#c4661f"/><path d="M5 5.2l2.4-1.3" stroke="#ffd9a8" stroke-width="1" stroke-linecap="round"/></symbol>
<symbol id="cube-prov" viewBox="0 0 20 20"><path d="M5 4h10c1.4 3 1.4 9 0 12H5C3.6 13 3.6 7 5 4z" fill="#8a6a3a"/><path d="M5 4h10c.5 1 .8 2 .9 3H4.1c.1-1 .4-2 .9-3z" fill="#c09a5c"/><rect x="3.8" y="8.6" width="12.4" height="1.4" fill="#4a3518"/><rect x="3.8" y="12.4" width="12.4" height="1.4" fill="#4a3518"/></symbol>
<symbol id="i-anchor" viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 6.7v14M7.5 10h9M4 13c0 4.5 3.6 7.6 8 7.6s8-3.1 8-7.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></symbol>
<symbol id="i-coin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#d9b25a" stroke="#6b5220" stroke-width="1.4"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#8a6a2a" stroke-width="1"/><text x="12" y="16" text-anchor="middle" font-size="10" font-weight="800" fill="#5a4214" font-family="Georgia,serif">£</text></symbol>
<symbol id="i-star" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"/></symbol>
<symbol id="i-up" viewBox="0 0 24 24"><path d="M12 3l8 9h-5v9H9v-9H4z"/></symbol>
`;

export function iconHTML(ind, size, color) {
  return `<svg class="ic" viewBox="0 0 24 24" style="width:${size}px;height:${size}px;` +
    `fill:${color || "currentColor"}"><use href="#i-${ind}"/></svg>`;
}
export function cubeHTML(kind, size = 13) {
  return `<svg class="cube" viewBox="0 0 20 20" style="width:${size}px;height:${size}px"><use href="#cube-${kind}"/></svg>`;
}

// ---- 头像 ----
// 有插画就用插画（web/assets/avatars/<键>.jpg，Canva 生成的油画肖像），没有就画一个剪影，边框用玩家色。
export const AVATARS = ["uk", "eu", "us", "la", "cn", "jp", "in", "sea", "af", "au"];
export const AVATAR_ZH = { uk: "British industrialist", eu: "European manufacturer", us: "American rail baron", la: "South American planter",
  cn: "Chinese merchant", jp: "Meiji industrialist", in: "Bombay textile trader", sea: "Straits merchant", af: "Cairo cotton trader", au: "Sydney wool trader" };
const AV_OK = {};
export function avatarHTML(key, color, size = 40) {
  const k = key && key !== "you" ? key : "uk";
  const src = `/assets/avatars/${k}.jpg`;
  return `<span class="av" style="width:${size}px;height:${size}px;border-color:${color}">` +
    `<img src="${src}" alt="" onerror="this.remove()">` +
    `<svg viewBox="0 0 40 40"><rect width="40" height="40" fill="#2a2216"/>` +
    `<path d="M11 13h18v2H11z M14 5h12v8H14z" fill="#0f0c08"/>` +
    `<circle cx="20" cy="20" r="6.2" fill="#c9b08a"/>` +
    `<path d="M6 40c1-9 7-13 14-13s13 4 14 13z" fill="#1b1611"/>` +
    `<path d="M17 28l3 5 3-5z" fill="#e8dcc0"/></svg></span>`;
}
