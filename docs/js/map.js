import { translate as T } from "../theme/locale.js";
// 地图视图：SVG 图层、镜头、城市牌面、连线、高亮。
// 几何全部来自 tools/build_map.py 生成的 map.json（显示坐标已做密度放大、航线已寻路）。
import { el, IND_ART, PORT_ART, artSVG, PCOL, ROMAN, BONUS_SHORT } from "./art.js";

const PLATE_MIN_PX = 12;     // 建造格小于这个像素就不画牌面，只留点
const PLATE_MIN_SCALE = 8;   // 世界全图时一律不画牌面（否则稀疏处的牌面会先冒出来，很乱）
const SLOT_GAP = 0.12;

export class MapView {
  constructor(svg, B, M, opts = {}) {
    this.svg = svg; this.B = B; this.M = M;
    this.targetPx = opts.targetPx || 30;
    this.city = {};
    B.cities.forEach(c => { this.city[c.id] = Object.assign({}, c, M.cities[c.id]); });
    this.linkInfo = {};
    B.links.forEach(l => { this.linkInfo[[l.a, l.b].sort().join("|")] = l; });
    this.hubByCity = {};
    this.handlers = {};
    this.state = null;
    this.scale = 1;
    this.build();
    this.bindInput();
    const b = M.bounds;
    // 上下多留一些：地图顶上浮着提示条和按钮，不留边的话英国会被压在下面
    const padY = (b[3] - b[1]) * 0.12;
    this.home = { x: b[0], y: b[1] - padY, w: b[2] - b[0], h: b[3] - b[1] + padY * 1.4 };
    this.fitTo(this.home, false);
  }

  on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); }
  emit(evt, ...a) { (this.handlers[evt] || []).forEach(f => f(...a)); }

  // ---------------- 静态图层 ----------------
  build() {
    const svg = this.svg;
    svg.innerHTML = "";
    const defs = el("defs");
    svg.appendChild(defs);
    const SEA = { x0: -560, y0: -230, x1: 560, y1: 200 };
    const pat = (id, href, tw) => {
      const p = el("pattern", { id, patternUnits: "userSpaceOnUse", width: tw, height: tw * 9 / 16, x: 0, y: 0 });
      p.appendChild(el("image", { href, width: tw, height: tw * 9 / 16, preserveAspectRatio: "xMidYMid slice" }));
      defs.appendChild(p);
      return p;
    };
    // 色调已预先烘焙进纹理（terrain_baked / sea_baked）。以前是「遮罩 + 纹理 + 压色」三层，
    // 软件渲染时一帧要几十秒（无界面 Chrome 截图超时），手机上也会卡。
    this.seaPat = pat("seaPat", "/assets/sea_baked.jpg", 260);
    this.terPat = pat("terrainPat", "/assets/terrain_baked.jpg", 92);
    const landD = this.M.land.join("");
    const glow = el("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" });
    glow.innerHTML = `<feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>`;
    defs.appendChild(glow);

    const L = n => { const g = el("g", { class: n }); svg.appendChild(g); return g; };
    this.gSea = L("g-sea"); this.gGrat = L("g-grat"); this.gLand = L("g-land");
    this.gZone = L("g-zone"); this.gReg = L("g-reg");
    this.gLinks = L("g-links"); this.gBuilt = L("g-built"); this.gHit = L("g-hit");
    this.gTok = L("g-tok"); this.gRing = L("g-ring"); this.gDots = L("g-dots");
    this.gPlates = L("g-plates"); this.gDotLbl = L("g-dotlbl"); this.gHl = L("g-hl");

    const rect = (fill, op) => {
      const r = el("rect", { x: SEA.x0, y: SEA.y0, width: SEA.x1 - SEA.x0, height: SEA.y1 - SEA.y0 });
      r.style.fill = fill; if (op !== undefined) r.style.opacity = op; return r;
    };
    this.gSea.appendChild(rect("url(#seaPat)"));
    this.M.grat.forEach(d => [0, -360, 360].forEach(o =>
      this.gGrat.appendChild(el("path", { d, class: "grat", transform: `translate(${o} 0)`, "vector-effect": "non-scaling-stroke" }))));
    // 陆地：一条路径直接用纹理图案填充、同时描海岸线。
    // 远景用简化过的轮廓（点数少一个数量级），近景换精细版；日界线两侧的副本只在视野跨过 ±180° 时画。
    this.landD = { hi: landD, lo: (this.M.landLo || this.M.land).join("") };
    this.landEls = [0, -360, 360].map(o => {
      const e = el("path", { d: this.landD.lo, "fill-rule": "evenodd", class: "land", transform: `translate(${o} 0)` });
      e.dataset.off = o; this.gLand.appendChild(e); return e;
    });
    this._lod = "lo";

    // 标签
    const ZZ = { BRITAIN: "Britain", EUROPE: "Europe", AMERICAS: "Americas", ASIAPAC: "Asia-Pacific" };
    Object.entries(this.M.zones).forEach(([z, [x, y]]) => {
      const t = el("text", { x, y, class: "zone-lbl" }); t.textContent = ZZ[z]; this.gZone.appendChild(t);
    });
    this.B.regions.forEach(r => {
      const p = this.M.regions[r.id]; if (!p) return;
      const t = el("text", { x: p[0], y: p[1], class: "reg-lbl" });
      t.textContent = T(r.zh); t.dataset.region = r.id; this.gReg.appendChild(t);
    });

    // 连线：深色描边 + 浅色芯线，海上陆上都看得见（以前海运线在深色海面上几乎隐形，
    // 看起来像「中间断开」）。另有一条透明粗线专门接收鼠标。
    this.linkEls = {};
    Object.entries(this.M.links).forEach(([key, g]) => {
      const info = this.linkInfo[key] || {};
      const offs = g.wrap ? [0, -360, 360] : [0];
      const parts = { casing: [], core: [], hit: [] };
      offs.forEach(o => {
        const tr = o ? `translate(${o} 0)` : "";
        const cas = el("path", { d: g.d, class: "lk-cas" + (info.sea ? " sea" : ""), transform: tr, "vector-effect": "non-scaling-stroke" });
        const core = el("path", { d: g.d, class: "lk" + (info.sea ? " sea" : "") + (info.era === "E2" ? " e2" : info.era === "E1" ? " e1" : ""),
          transform: tr, "vector-effect": "non-scaling-stroke" });
        const hit = el("path", { d: g.d, class: "lk-hit", transform: tr, "vector-effect": "non-scaling-stroke" });
        hit.dataset.link = key;
        this.gLinks.appendChild(cas); this.gLinks.appendChild(core); this.gHit.appendChild(hit);
        parts.casing.push(cas); parts.core.push(core); parts.hit.push(hit);
      });
      this.linkEls[key] = parts;
    });

    // 城市：点 + 牌面
    this.dotEls = {}; this.plateEls = {};
    Object.values(this.city).forEach(c => {
      // 描边一律用 non-scaling-stroke：CSS 里的 1.3px 在 SVG 世界坐标里是 1.3 个地图单位，
      // 放大后圆点的描边会变成一个大黑圆
      const d = el("circle", { cx: c.x, cy: c.y, r: 1, class: "dot" + (c.hub ? " hub" : "") + (c.port ? " port" : ""),
        "vector-effect": "non-scaling-stroke" });
      d.dataset.city = c.id; this.gDots.appendChild(d); this.dotEls[c.id] = d;
      const g = el("g", { class: "plate" }); g.dataset.city = c.id;
      this.gPlates.appendChild(g); this.plateEls[c.id] = g;
      // 牌面缩成点时的小字名：否则香港、广州这种密集处只剩两个点，认不出是哪座城
      const t = el("text", { x: c.x, y: c.y, class: "dotlbl" + (c.hub ? " hub" : "") });
      t.textContent = T(c.short); t.dataset.city = c.id; t.dataset.pri = c.hub ? 2 : (c.port ? 1 : 0);
      this.gDotLbl.appendChild(t); (this.dotLbl = this.dotLbl || {})[c.id] = t;
    });
  }

  // ---------------- 局面 ----------------
  setState(S, meId) {
    this.state = S; this.meId = meId;
    const reach = new Set(S.reach || []);
    Object.entries(this.dotEls).forEach(([id, d]) => d.classList.toggle("reach", reach.has(id)));
    // 已建连线
    const owner = {};
    (S.builtLinks || []).forEach(l => { owner[[l.a, l.b].sort().join("|")] = l.owner; });
    this.builtOwner = owner;
    this.gBuilt.innerHTML = ""; this.gTok.innerHTML = ""; this.tokEls = [];
    Object.entries(this.linkEls).forEach(([key, parts]) => {
      const o = owner[key];
      parts.core.forEach(p => p.classList.toggle("taken", o !== undefined));
      parts.casing.forEach(p => p.classList.toggle("taken", o !== undefined));
      if (o === undefined) return;
      const g = this.M.links[key], info = this.linkInfo[key] || {};
      (g.wrap ? [0, -360, 360] : [0]).forEach(off => {
        const tr = off ? `translate(${off} 0)` : "";
        this.gBuilt.appendChild(el("path", { d: g.d, class: "bl-cas", transform: tr, "vector-effect": "non-scaling-stroke" }));
        const p = el("path", { d: g.d, class: "bl" + (info.sea ? " sea" : ""), transform: tr, "vector-effect": "non-scaling-stroke" });
        p.style.stroke = PCOL[o]; p.dataset.link = key;
        this.gBuilt.appendChild(p);
      });
      const t = el("g", { class: "tok" });
      t.dataset.x = g.mx; t.dataset.y = g.my; t.dataset.a = g.ang; t.dataset.len = g.len; t.dataset.link = key;
      const ov = el("ellipse", { cx: 0, cy: 0, rx: 11.5, ry: 7.6, "vector-effect": "non-scaling-stroke" });
      ov.style.fill = PCOL[o]; t.appendChild(ov);
      const ic = el("use", { href: info.sea ? "#tk-ship" : "#tk-rail", x: -7.5, y: -7.5, width: 15, height: 15 });
      t.appendChild(ic);
      this.gTok.appendChild(t); this.tokEls.push(t);
    });
    // 牌面内容
    const byCity = {};
    (S.placed || []).forEach(p => { (byCity[p.city] = byCity[p.city] || {})[p.slot] = p; });
    const hubs = {};
    (S.hubs || []).forEach(h => { if (h.active) hubs[h.city] = h; });
    this.hubByCity = hubs;
    const contested = new Set(S.contested || []);
    Object.values(this.city).forEach(c => this.drawPlate(c, byCity[c.id] || {}, hubs[c.id], contested.has(c.id)));
    this.layout();
  }

  drawPlate(c, tiles, hub, contested) {
    const g = this.plateEls[c.id];
    g.innerHTML = "";
    g.classList.toggle("contested", contested);
    const n = c.slots.length, W = n + SLOT_GAP * (n - 1);
    // 名牌
    const nw = Math.max(1.2, T(c.short).length * 0.25 + 0.4);
    const nb = el("g", { class: "nm" + (c.hub ? " hub" : "") });
    nb.appendChild(el("rect", { x: -nw / 2, y: 0.18, width: nw, height: 0.6, rx: 0.06, "vector-effect": "non-scaling-stroke" }));
    const tx = el("text", { x: 0, y: 0.62 }); tx.textContent = T(c.short); nb.appendChild(tx);
    g.appendChild(nb);
    // 贸易港收货栏：港口插画 + 收什么货 + 港口奖励
    if (hub) {
      const goods = hub.accepts;
      const hw = Math.max(2.6, 0.95 + goods.length * 0.62 + 0.7);
      // 未开张（港口城市还没有连线接入）时整条变暗
      const hg = el("g", { class: "hubstrip" + (hub.open === false ? " closed" : "") });
      hg.appendChild(el("rect", { x: -hw / 2, y: -2.12, width: hw, height: 0.84, rx: 0.08, class: "hubbg", "vector-effect": "non-scaling-stroke" }));
      hg.appendChild(artSVG(PORT_ART, -hw / 2 + 0.06, -2.06, 0.72, 0.72));
      goods.forEach((ind, i) => {
        hg.appendChild(el("use", { href: "#i-" + ind, x: -hw / 2 + 0.9 + i * 0.62, y: -1.96, width: 0.52, height: 0.52, class: "hubglyph" }));
      });
      const claimed = hub.claimedBy !== null && hub.claimedBy !== undefined;
      const bx = hw / 2 - 0.36, by = -1.7;
      const bc = el("circle", { cx: bx, cy: by, r: 0.3, class: "hubbadge", "vector-effect": "non-scaling-stroke" });
      if (claimed) bc.style.fill = PCOL[hub.claimedBy];
      hg.appendChild(bc);
      const bt = el("text", { x: bx, y: by + 0.12, class: "hubbadge-t" });
      bt.textContent = claimed ? "✓" : (BONUS_SHORT[hub.bonus] || "·");
      hg.appendChild(bt);
      if (hub.open === false) {
        const tt = el("title", {}); tt.textContent = T(hub.zh) + ": Closed; build a link to this city to open the port";
        hg.appendChild(tt);
      }
      g.appendChild(hg);
    }
    // 建造格
    c.slots.forEach((allowed, i) => {
      const sx = -W / 2 + i * (1 + SLOT_GAP);
      const t = tiles[i];
      const sg = el("g", { class: "slot" + (t ? " built" : "") + (t && t.owner === this.meId ? " mine" : ""), transform: `translate(${sx} -1.22)` });
      sg.dataset.slot = i;
      sg.appendChild(el("rect", { x: 0, y: 0, width: 1, height: 1, rx: 0.06, class: "sbox" + (t ? " built" : ""), "vector-effect": "non-scaling-stroke" }));
      if (t) {
        const art = artSVG(IND_ART[t.industry] || IND_ART.MFG, 0.05, 0.05, 0.9, 0.72);
        if (!t.flipped) art.setAttribute("opacity", ".45");
        sg.appendChild(art);
        const band = el("rect", { x: 0.03, y: 0.78, width: 0.94, height: 0.19 });
        band.style.fill = PCOL[t.owner]; sg.appendChild(band);
        const lv = el("text", { x: 0.2, y: 0.32, class: "lvl" }); lv.textContent = ROMAN[t.level] || t.level;
        sg.appendChild(lv);
        if (t.flipped) {
          const f = el("text", { x: 0.83, y: 0.3, class: "flipmark" }); f.textContent = "✓"; sg.appendChild(f);
        }
        const res = t.resources || 0;
        if (res && ["COAL", "IRON", "PROV"].includes(t.industry)) {
          const kind = t.industry === "COAL" ? "coal" : t.industry === "IRON" ? "iron" : "prov";
          const k = Math.min(res, 5), cs = 0.2;
          for (let j = 0; j < k; j++)
            sg.appendChild(el("use", { href: "#cube-" + kind, x: 0.94 - cs - j * (cs * 0.78), y: 0.56, width: cs, height: cs }));
        }
      } else {
        const m = allowed.length;
        allowed.forEach((ind, k) => {
          const sz = m > 1 ? 0.42 : 0.6, gx = m > 1 ? 0.06 + k * 0.46 : 0.2, gy = m > 1 ? 0.29 : 0.2;
          sg.appendChild(el("use", { href: "#i-" + ind, x: gx, y: gy, width: sz, height: sz, class: "glyph" }));
        });
      }
      g.appendChild(sg);
    });
  }

  // ---------------- 镜头 ----------------
  // 地图上被遮住的部分（手机上底部抽屉盖在地图上）。居中和「确保可见」只算露出来的那块。
  setInset(top, bottom) { this.inset = { top: top || 0, bottom: bottom || 0 }; }
  _eff() {
    const r = this.svg.getBoundingClientRect();
    const t = (this.inset && this.inset.top) || 0, b = (this.inset && this.inset.bottom) || 0;
    const cw = this.svg.clientWidth, ch = this.svg.clientHeight;      // 布局尺寸：不受手势中 CSS 变换影响
    const H = ch > 20 ? ch : r.height > 20 ? r.height : 600;
    return { r, top: t, bottom: b, h: Math.max(80, H - t - b), H, W: cw > 20 ? cw : r.width > 20 ? r.width : 900 };
  }
  fitTo(v, animate = true) {
    this._dropTransient();
    const e = this._eff();
    const ar = e.W / e.h;
    let w = v.w, h = v.h;
    if (w / h > ar) h = w / ar; else w = h * ar;
    const Hw = h * e.H / e.h;                       // 整个 SVG 对应的世界高度
    const cy = v.y + v.h / 2;
    const t = { x: v.x + v.w / 2 - w / 2, y: cy - (e.top + e.h / 2) / e.H * Hw, w, h: Hw };
    return animate ? this.animateTo(t) : (this.view = t, this.layout(), Promise.resolve());
  }
  fitWorld() { return this.fitTo(this.home); }
  fitCities(ids, pad = 1.6, minW = 14, animate = true) {
    const ps = ids.map(id => this.city[id]).filter(Boolean);
    if (!ps.length) return Promise.resolve();
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max((x1 - x0) * pad, minW), h = Math.max((y1 - y0) * pad, minW * 0.55);
    return this.fitTo({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2 - h * 0.04, w, h }, animate);
  }
  focusRegion(r) {
    return this.fitCities(this.B.cities.filter(c => c.region === r).map(c => c.id), 2.2, 24);
  }
  // 目标不在视野里就平移过去；已经在视野里就不动（跟随镜头不该晃个不停）
  ensureVisible(ids, margin = 0.12) {
    const v = this.view, e = this._eff();
    const ps = ids.map(id => this.city[id]).filter(Boolean);
    if (!ps.length) return Promise.resolve();
    const vy0 = v.y + e.top / e.H * v.h, vy1 = v.y + (e.H - e.bottom) / e.H * v.h;
    const vh = vy1 - vy0;
    const inside = ps.every(p => p.x > v.x + v.w * margin && p.x < v.x + v.w * (1 - margin) &&
      p.y > vy0 + vh * margin && p.y < vy1 - vh * margin);
    if (inside) return Promise.resolve();
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * e.W / e.h);
    const w = Math.min(Math.max(v.w, span * 1.8), this.home.w);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const h = w * e.h / e.W;
    return this.fitTo({ x: cx - w / 2, y: cy - h / 2, w, h }, true);
  }
  animateTo(t, D = 460) {
    if (document.documentElement.classList.contains("a11y-reduce-motion")) {
      cancelAnimationFrame(this._raf);
      this.view = t; this.layout();
      return Promise.resolve();
    }
    const f = Object.assign({}, this.view), t0 = performance.now();
    cancelAnimationFrame(this._raf);
    if (document.hidden) { this.view = t; this.layout(); return Promise.resolve(); }
    return new Promise(res => {
      // 兜底：动画帧被暂停（页面在后台）时直接落到终点
      const guard = setTimeout(() => { cancelAnimationFrame(this._raf); this.view = t; this.layout(); res(); }, D + 600);
      const step = now => {
        const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
        // 缩放按对数插值，平移按线性：拉远再推近时不会先冲过头
        const w = Math.exp(Math.log(f.w) + (Math.log(t.w) - Math.log(f.w)) * e);
        const h = w * t.h / t.w;
        const cx = f.x + f.w / 2 + ((t.x + t.w / 2) - (f.x + f.w / 2)) * e;
        const cy = f.y + f.h / 2 + ((t.y + t.h / 2) - (f.y + f.h / 2)) * e;
        this.view = { x: cx - w / 2, y: cy - h / 2, w, h };
        this.layout({ quick: k < 1 });
        if (k < 1) this._raf = requestAnimationFrame(step); else { clearTimeout(guard); res(); }
      };
      this._raf = requestAnimationFrame(step);
    });
  }
  resize() {
    if (!this.view) return;
    const r = this.svg.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;         // 布局还没排好（或被隐藏）时尺寸是 0，别拿它做除法
    const ar = r.width / Math.max(1, r.height);
    const cx = this.view.x + this.view.w / 2, cy = this.view.y + this.view.h / 2;
    const h = this.view.w / ar;
    this.view = { x: this.view.x, y: cy - h / 2, w: this.view.w, h };
    this.layout();
  }
  worldToScreen(x, y) {
    const r = this.svg.getBoundingClientRect(), v = this.view;
    return { x: r.left + (x - v.x) / v.w * r.width, y: r.top + (y - v.y) / v.h * r.height };
  }
  screenToWorld(cx, cy) {
    const r = this.svg.getBoundingClientRect(), v = this.view;
    return { x: v.x + (cx - r.left) / r.width * v.w, y: v.y + (cy - r.top) / r.height * v.h };
  }
  zoomAt(cx, cy, k) {
    this._commit();
    const p = this.screenToWorld(cx, cy), v = this.view;
    const nw = Math.max(3, Math.min(this.home.w * 1.25, v.w * k)), nh = nw * v.h / v.w;
    this.view = { x: p.x - (p.x - v.x) * nw / v.w, y: p.y - (p.y - v.y) * nh / v.h, w: nw, h: nh };
    this.layout();
  }
  // 手势中的「临时镜头」：拖动、双指缩放、滚轮时，先用 CSS 变换移动/缩放整张已画好的地图
  // （显卡合成，不重画、不重排），松手、停顿、或移出/缩放超过阈值时，才把目标视野写进 viewBox 真正重画一次。
  // 临时期间 this.view 保持为已提交的视野；getBoundingClientRect 带着变换，屏幕↔世界坐标换算仍然一致。
  _transient(vt, idleMs = 110) {
    const v = this.view, W = this.svg.clientWidth || 1, H = this.svg.clientHeight || 1;
    const k = v.w / vt.w;
    const tx = (v.x - vt.x) * W / vt.w, ty = (v.y - vt.y) * H / vt.h;
    if (!this._tview) this._r0 = this.svg.getBoundingClientRect();   // 变换前的位置（滚轮换算用）
    this._tview = vt;
    this.svg.style.transformOrigin = "0 0";
    this.svg.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`;
    clearTimeout(this._tIdle);
    if (Math.abs(tx) > W * 0.3 || Math.abs(ty) > H * 0.3 || k > 2.4 || k < 0.55) this._commit();
    else this._tIdle = setTimeout(() => this._commit(), idleMs);
  }
  _commit() {
    clearTimeout(this._tIdle);
    const vt = this._tview; if (!vt) return;
    this._tview = null;
    this.view = vt;
    this.svg.style.transform = "";
    this.layout({ pan: true });
  }
  // 程序化移动镜头（fitTo、动画）前丢掉临时变换
  _dropTransient() {
    clearTimeout(this._tIdle);
    if (this._tview) { this._tview = null; this.svg.style.transform = ""; }
  }
  _panBy(dx, dy) {
    const v = this._tview || this.view, W = this.svg.clientWidth || 1, H = this.svg.clientHeight || 1;
    this._transient(Object.assign({}, v, { x: v.x - dx / W * v.w, y: v.y - dy / H * v.h }));
  }


  // 牌面尺寸、标签、令牌都随缩放重新摆。
  // opts.pan：纯平移（缩放没变）时只换 viewBox —— 其余东西都只跟缩放有关，手机上每帧全算一遍会卡。
  // opts.quick：缩放手势进行中，标签避让（要量字宽，最贵）推迟到手势停下再做。
  layout(opts = {}) {
    let v = this.view; if (!v) return;
    if (![v.x, v.y, v.w, v.h].every(Number.isFinite) || v.w <= 0 || v.h <= 0) v = this.view = Object.assign({}, this.home);
    this.svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    const px = this.svg.clientWidth || this.svg.getBoundingClientRect().width || 900;
    const sc = px / v.w;
    if (opts.pan && this._laidSc && Math.abs(sc - this._laidSc) < sc * 1e-9) {
      this.landEls.forEach(e => {
        const o = +e.dataset.off;
        e.style.display = !o || (o < 0 ? v.x < -180 : v.x + v.w > 180) ? "" : "none";
      });
      this.emit("camera", this.view, sc, false);
      return;
    }
    this.scale = this._laidSc = sc;
    clearTimeout(this._lblTimer);
    const u = p => p / sc;
    // SVG text uses inline sizes, so scale map labels explicitly for the larger-text setting.
    const textScale = document.documentElement.classList.contains("a11y-large-text") ? 1.3 : 1;
    const platesOn = sc >= PLATE_MIN_SCALE;
    // 纹理平铺尺寸跟着缩放换档：固定一个尺寸的话，放大后一格纹理被拉到几千像素宽，糊成一片
    const tile = sc < 9 ? 92 : sc < 22 ? 48 : sc < 50 ? 26 : 14;
    if (tile !== this._tile) {
      this._tile = tile;
      [[this.terPat, tile], [this.seaPat, tile * 2.8]].forEach(([p, w]) => {
        const h = w * 9 / 16;
        p.setAttribute("width", w); p.setAttribute("height", h);
        p.firstChild.setAttribute("width", w); p.firstChild.setAttribute("height", h);
      });
    }
    const lod = sc < 14 ? "lo" : "hi";
    if (lod !== this._lod) { this._lod = lod; this.landEls.forEach(e => e.setAttribute("d", this.landD[lod])); }
    this.landEls.forEach(e => {
      const o = +e.dataset.off;
      e.style.display = !o || (o < 0 ? v.x < -180 : v.x + v.w > 180) ? "" : "none";
      e.style.strokeWidth = u(1.3) + "px";
    });
    // 牌面随放大逐步变大，但不超过各城市的上限（cap 保证互不重叠、不压别人的线）
    const target = this.targetPx * (sc < 30 ? 1 : sc < 70 ? 1.2 : 1.4);
    this.plateScale = {};
    Object.values(this.city).forEach(c => {
      const g = this.plateEls[c.id], d = this.dotEls[c.id];
      const s = Math.min(target / sc, c.cap);
      const vis = platesOn && s * sc >= PLATE_MIN_PX;
      this.plateScale[c.id] = vis ? s : 0;
      g.style.display = vis ? "" : "none";
      if (vis) g.setAttribute("transform", `translate(${c.x} ${c.y}) scale(${s})`);
      d.setAttribute("r", u(vis ? 2.6 : (c.hub ? 5.2 : 4)));
    });
    // 只剩点的城市：在点旁边写小字名（按重要性避让，挤不下的不写）
    const lblOn = sc >= 5.5;
    this.gDotLbl.style.display = lblOn ? "" : "none";
    if (lblOn) {
      const cand = [];
      Object.values(this.city).forEach(c => {
        const t = this.dotLbl[c.id];
        const vis = !this.plateScale[c.id];
        // 缩放手势中不重新避让：沿用上次避让的结果，免得所有小字名同时冒出来叠在一起
        t.style.display = vis && !(opts.quick && t._clash) ? "" : "none";
        if (!vis) return;
        t.style.fontSize = u(11 * textScale) + "px"; t.style.strokeWidth = u(3 * textScale) + "px";
        t.setAttribute("x", c.x); t.setAttribute("y", c.y + u(15 * textScale));
        cand.push(t);
      });
      cand.sort((a, b) => (+b.dataset.pri) - (+a.dataset.pri));
      this._lblCand = cand;
    } else this._lblCand = null;
    // 连线令牌：只在连线在屏幕上够长时画
    (this.tokEls || []).forEach(t => {
      const L = +t.dataset.len * sc;
      t.style.display = L > 46 && sc > 5 ? "" : "none";
      t.setAttribute("transform", `translate(${t.dataset.x} ${t.dataset.y}) rotate(${t.dataset.a}) scale(${u(1)})`);
    });
    // 标签：远景显示四大市场区，中景显示区域名，近景（牌面出现后）区域名变淡
    const zoneOn = sc < 7.5, regOn = sc >= 4.2 && sc < 40;
    this.gZone.style.display = zoneOn ? "" : "none";
    this.gReg.style.display = regOn ? "" : "none";
    this.gZone.querySelectorAll("text").forEach(t => { t.style.fontSize = u(28 * textScale) + "px"; t.style.strokeWidth = u(5 * textScale) + "px"; });
    this.gReg.querySelectorAll("text").forEach(t => {
      t.style.fontSize = u((sc > 14 ? 13 : 15) * textScale) + "px"; t.style.strokeWidth = u(3.5 * textScale) + "px";
    });
    this.gReg.style.opacity = sc > 14 ? .55 : 1;
    this._regOn = regOn;
    this.gRing.querySelectorAll("circle").forEach(r => {
      const ps = this.plateScale[r.dataset.city];
      r.setAttribute("r", u(ps ? 7 : 10));
    });
    if (opts.quick) this._lblTimer = setTimeout(() => this._labels(), 140);
    else this._labels();
    this.emit("camera", this.view, sc, true);
  }
  _labels() {
    const sc = this._laidSc;
    if (this._lblCand) this.declutter(this._lblCand, sc, true);
    if (this._regOn) this.declutter(this.gReg.querySelectorAll("text"), sc);
  }
  declutter(nodes, sc, avoidDots) {
    const shown = [];
    const dots = [];
    if (avoidDots) Object.values(this.city).forEach(c => {       // 字不压别的城市点（自己的点除外）
      const x = (c.x - this.view.x) * sc, y = (c.y - this.view.y) * sc;
      dots.push({ id: c.id, x0: x - 4, x1: x + 4, y0: y - 4, y1: y + 4 });
    });
    nodes = [...nodes];
    // 字宽与字号成正比：每个标签只量一次（量的是「每单位字号的宽度」）。
    // 先把要量的全部显示出来再统一读，浏览器只重排一次；以前边改边量，每个字都强制重排一次。
    const todo = nodes.filter(t => t._w1 === undefined);
    if (todo.length) {
      todo.forEach(t => { t.style.display = ""; });
      todo.forEach(t => {
        let w = 0; try { w = t.getComputedTextLength(); } catch (e) { w = 0; }
        const fs = parseFloat(t.style.fontSize);
        if (w > 0 && fs > 0) t._w1 = w / fs;
      });
    }
    nodes.forEach(t => {
      const fs = parseFloat(t.style.fontSize) || 12;
      const w = (t._w1 !== undefined ? t._w1 * fs : t.textContent.length * fs) * sc;
      const h = fs * sc;
      const cx = (+t.getAttribute("x") - this.view.x) * sc, cy = (+t.getAttribute("y") - this.view.y) * sc;
      const pad = avoidDots ? 2 : 8;
      const r = { x0: cx - w / 2 - pad, x1: cx + w / 2 + pad, y0: cy - h - 2, y1: cy + 2 };
      const hit = o => !(r.x1 < o.x0 || r.x0 > o.x1 || r.y1 < o.y0 || r.y0 > o.y1);
      const clash = shown.some(hit) || dots.some(o => o.id !== t.dataset.city && hit(o));
      t._clash = clash;
      t.style.display = clash ? "none" : ""; if (!clash) shown.push(r);
    });
  }

  // 建造格中心的世界坐标（牌面隐藏时退回城市点）
  slotPos(cityId, slot) {
    const c = this.city[cityId]; if (!c) return { x: 0, y: 0 };
    const s = this.plateScale && this.plateScale[cityId];
    if (!s || slot === null || slot === undefined) return { x: c.x, y: c.y };
    const n = c.slots.length, W = n + SLOT_GAP * (n - 1);
    return { x: c.x + s * (-W / 2 + slot * (1 + SLOT_GAP) + 0.5), y: c.y + s * (-1.22 + 0.5) };
  }
  linkMid(key) { const g = this.M.links[key]; return g ? { x: g.mx, y: g.my } : null; }

  // ---------------- 高亮 ----------------
  // 目标城市：手牌悬停 / 选中动作时。全局视野下也看得见 —— 画发光圈而不只是描牌面
  // ids：强高亮（可建）；soft：弱高亮（同一区域但暂时建不了，例如不在网络内）
  setTargets(ids, cls = "tgt", soft = null) {
    this.gRing.innerHTML = "";
    const set = ids ? new Set(ids) : null;
    const weak = new Set((soft || []).filter(id => !set || !set.has(id)));
    const on = !!set || weak.size > 0;
    Object.entries(this.plateEls).forEach(([id, g]) => {
      g.classList.toggle("tgt", !!set && set.has(id));
      g.classList.toggle("soft", weak.has(id));
      g.classList.toggle("dim", on && !(set && set.has(id)) && !weak.has(id));
    });
    Object.entries(this.dotEls).forEach(([id, d]) => {
      d.classList.toggle("tgt", !!set && set.has(id));
      d.classList.toggle("soft", weak.has(id));
      d.classList.toggle("dim", on && !(set && set.has(id)) && !weak.has(id));
    });
    this.svg.classList.toggle("targeting", on);
    const ring = (id, c2) => {
      const c = this.city[id]; if (!c) return;
      const r = el("circle", { cx: c.x, cy: c.y, r: 1, class: "ring " + c2, "vector-effect": "non-scaling-stroke" });
      r.dataset.city = id; this.gRing.appendChild(r);
    };
    if (set) set.forEach(id => ring(id, cls));
    weak.forEach(id => ring(id, "soft"));
    this.layout();
  }
  // 动作预览：目标格子、连线、资源来源、贸易港
  preview(a, color) {
    this.clearPreview();
    if (!a) return;
    const hl = this.gHl, sc = this.scale, u = p => p / sc;
    const mark = (cityId, slot, cls) => {
      const p = this.slotPos(cityId, slot), s = this.plateScale[cityId];
      if (s && slot !== null && slot !== undefined) {
        const r = el("rect", { x: p.x - s * 0.58, y: p.y - s * 0.58, width: s * 1.16, height: s * 1.16, rx: s * .1,
          class: "pv " + cls, "vector-effect": "non-scaling-stroke" });
        hl.appendChild(r);
      } else {
        hl.appendChild(el("circle", { cx: p.x, cy: p.y, r: u(9), class: "pv " + cls, "vector-effect": "non-scaling-stroke" }));
      }
    };
    [a.link, a.second].filter(Boolean).forEach(k => {
      const key = [...k].sort().join("|"), g = this.M.links[key];
      if (!g) return;
      (g.wrap ? [0, -360, 360] : [0]).forEach(o => {
        const p = el("path", { d: g.d, class: "pv-link", transform: o ? `translate(${o} 0)` : "", "vector-effect": "non-scaling-stroke" });
        if (color) p.style.stroke = color;
        hl.appendChild(p);
      });
    });
    if (a.city && (a.kind === "BUILD" || a.kind === "SELL")) mark(a.city, a.slot, a.kind === "SELL" ? "sell" : "build");
    (a.sells || []).slice(1).forEach(s => mark(s.city, s.slot, "sell"));
    (a.coal || []).forEach(s => mark(s.city, s.slot, "src coal"));
    (a.iron || []).forEach(s => mark(s.city, s.slot, "src iron"));
    (a.prov || []).forEach(s => mark(s.city, s.slot, "src prov"));
    if (a.hub) mark(a.hub.city, null, "hubt");
    this._pv = a; this._pvColor = color;
  }
  clearPreview() { this.gHl.innerHTML = ""; this._pv = null; }
  refreshPreview() { if (this._pv) this.preview(this._pv, this._pvColor); }
  flashLink(key, color) {
    const parts = this.gBuilt.querySelectorAll(`.bl[data-link="${key}"]`);
    parts.forEach(p => {
      const L = p.getTotalLength ? p.getTotalLength() : 50;
      p.style.strokeDasharray = `${L} ${L}`;
      p.style.strokeDashoffset = L;
      p.getBoundingClientRect();
      p.style.transition = "stroke-dashoffset .8s ease-out";
      p.style.strokeDashoffset = 0;
      setTimeout(() => { p.style.strokeDasharray = ""; p.style.transition = ""; }, 900);
    });
  }
  popSlot(cityId, slot) {
    const g = this.plateEls[cityId]; if (!g) return;
    const s = g.querySelector(`.slot[data-slot="${slot}"]`);
    if (s) { s.classList.remove("pop"); s.getBoundingClientRect(); s.classList.add("pop"); }
  }

  // ---------------- 输入 ----------------
  bindInput() {
    const svg = this.svg;
    const pts = new Map();
    let drag = null, pinch = null, moved = false;
    svg.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();                       // 拖地图不再选中页面文字
      svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      cancelAnimationFrame(this._raf);
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, ox: 0, oy: 0, target: e.target };
      if (pts.size === 2) {
        this._commit();
        const [a, b] = [...pts.values()];
        const r0 = svg.getBoundingClientRect();
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), v: Object.assign({}, this.view), r: r0,
          c: this.screenToWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
        drag = null;
      }
    });
    svg.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) {
        if (e.pointerType === "mouse") this.hoverAt(e);
        return;
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const k = pinch.d / Math.max(10, d);
        const nw = Math.max(3, Math.min(this.home.w * 1.25, pinch.v.w * k)), nh = nw * pinch.v.h / pinch.v.w;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r0 = pinch.r;
        this._transient({ x: pinch.c.x - (mx - r0.left) / r0.width * nw, y: pinch.c.y - (my - r0.top) / r0.height * nh, w: nw, h: nh }, 160);
        moved = true;
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        svg.classList.add("dragging");
        this._panBy(dx - drag.ox, dy - drag.oy);
        drag.ox = dx; drag.oy = dy;
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      svg.classList.remove("dragging");
      this._commit();
      if (pts.size < 2) pinch = null;
      if (drag && !moved && e.type === "pointerup") this.clickAt(e, drag.target);
      if (pts.size === 0) drag = null;
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !pts.size) this.emit("hover", null); });
    svg.addEventListener("wheel", e => {
      e.preventDefault();
      const k = Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
      const v = this._tview || this.view;
      const W = svg.clientWidth || 1, H = svg.clientHeight || 1, rr = this._tview ? this._r0 : svg.getBoundingClientRect();
      const px = v.x + (e.clientX - rr.left) / W * v.w, py = v.y + (e.clientY - rr.top) / H * v.h;
      const nw = Math.max(3, Math.min(this.home.w * 1.25, v.w * k)), nh = nw * v.h / v.w;
      this._transient({ x: px - (px - v.x) * nw / v.w, y: py - (py - v.y) * nh / v.h, w: nw, h: nh }, 150);
    }, { passive: false });
    svg.addEventListener("dblclick", e => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, 0.5); });
  }
  _pick(target) {
    const pl = target.closest && target.closest("[data-city]");
    if (pl) {
      const sl = target.closest(".slot");
      return { city: pl.dataset.city, slot: sl ? +sl.dataset.slot : null };
    }
    const lk = target.closest && target.closest("[data-link]");
    if (lk) return { link: lk.dataset.link };
    return null;
  }
  hoverAt(e) {
    const hit = this._pick(e.target);
    const key = hit ? (hit.city ? "c:" + hit.city + ":" + hit.slot : "l:" + hit.link) : "";
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    this.gHit.querySelectorAll(".hov").forEach(x => x.classList.remove("hov"));
    if (hit && hit.link) this.gHit.querySelectorAll(`[data-link="${hit.link}"]`).forEach(x => x.classList.add("hov"));
    this.emit("hover", hit, e);
  }
  clickAt(e, target) {
    const hit = this._pick(target || e.target);
    this.emit("click", hit, e);
  }
}
