/* apps.js — estado, motor fisiológico, persistencia, gamificación, panel, registro por zona y pruebas jugables. */
"use strict";

const $ = id => document.getElementById(id),
      esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const fmt = (p, v) => v.toFixed(p.d).replace(".", ","),
      bd = s => `<span class="bd t${s}">${SN[s]}</span>`;

/* día actual de la misión: la barra solo llega hasta aquí; se avanza de a poco */
const TK = "orbital_today_v1",
      loadToday = () => { try { return clamp(parseInt(localStorage.getItem(TK)) || 30, 30, 300); } catch (e) { return 30; } };

/* ningún parámetro admite negativos salvo T-score y Z-score */
const NEGOK = new Set(["pie.t", "pie.z"]);
const cleanV = v => {
  const o = {};
  Object.entries(v || {}).forEach(([k, x]) => {
    if (typeof x === "number" && x < 0 && !NEGOK.has(k)) return;
    o[k] = x;
  });
  return o;
};

const S = { crew: "c1", env: "iss", day: 30, today: loadToday(), tab: "panel", sel: {}, par: {}, cat: "all", cmp: 0, rl: "huesos", cc: {} };
CREW.forEach(c => S.cc[c.id] = { adh: 40, vas: 3 });

const cfg = (id = S.crew) => S.cc[id],
      crewOf = (id = S.crew) => CREW.find(x => x.id === id),
      layer = () => S.tab === "registro" ? S.rl : S.tab;

const out = (p, v) => (p.mx != null && v > p.mx) || (p.mn != null && v < p.mn);
const stat = (p, v) => p.dir === "none" ? -1 : out(p, v) ? 2 : p.dir === "lt" ? (v <= p.r ? 2 : v <= p.y ? 1 : 0) : (v >= p.r ? 2 : v >= p.y ? 1 : 0);
const sev = (p, v) => {
  if (p.dir !== "none" && out(p, v)) return 1;
  const q = p.r - p.base;
  return q ? clamp((v - p.base) / q, 0, 1) : 0;
};

const C = (day = S.day, cr = crewOf()) => {
  const e = ENVS[S.env], k = cfg(cr.id);
  return { d: day, m: day / 30 * cr.sens, f: 1 - .6 * k.adh / 100, k: e.k, fk: e.fk, gz: e.gz, adh: k.adh / 100, vas: k.vas };
};

const refText = p => p.dir === "none" ? "Sin umbral definido" : `Base ${fmt(p, p.base)} · Precaución ${p.dir === "lt" ? "≤" : "≥"} ${fmt(p, p.y)} · Alerta ${p.dir === "lt" ? "≤" : "≥"} ${fmt(p, p.r)}`;
const SC = ["#2ee6a6", "#ffb547", "#ff6b6b", "#6d788f"];

/* ---------- StorageManager ---------- */
const Store = {
  K: "orbital_logs_v4",
  ver: 0,
  _r: null,
  _o: {},
  all() {
    try {
      const r = localStorage.getItem(this.K) || "{}";
      if (r !== this._r) { this._o = JSON.parse(r); this._r = r; }
      return this._o;
    } catch (e) { return {}; }
  },
  days(c) { return this.all()[c] || {}; },
  get(c, d) { return this.days(c)[d]; },
  put(c, d, patch) {
    try {
      const a = this.all(),
            r = (a[c] = a[c] || {})[d] = a[c][d] || { v: {}, t: {} };
      Object.assign(r.v, cleanV(patch.v));
      Object.assign(r.t, patch.t || {});
      if (patch.n != null) r.n = patch.n;
      (localStorage.setItem(this.K, JSON.stringify(a)), Store.ver++);
    } catch (e) {}
  },
  setZone(c, d, zid, v, n) {
    try {
      const a = this.all(),
            r = (a[c] = a[c] || {})[d] = a[c][d] || { v: {}, t: {} };
      Object.keys(r.v).forEach(k => { if (k.indexOf(zid + ".") === 0) delete r.v[k]; });
      Object.assign(r.v, cleanV(v));
      r.zn = r.zn || {};
      if (n) r.zn[zid] = n; else delete r.zn[zid];
      if (!Object.keys(r.v).length && !Object.keys(r.t || {}).length && !Object.keys(r.zn).length && !r.n) delete a[c][d];
      (localStorage.setItem(this.K, JSON.stringify(a)), Store.ver++);
    } catch (e) {}
  },
  del(c, d) {
    try {
      const a = this.all();
      if (a[c]) delete a[c][d];
      (localStorage.setItem(this.K, JSON.stringify(a)), Store.ver++);
    } catch (e) {}
  }
};

/* ---------- PhysiologyEngine ---------- */
const Engine = {
  ev(z, c = C(), cid = S.crew) {
    const rec = Store.get(cid, S.day),
          rows = z.p.map(p => {
            const k = z.id + "." + p.id,
                  real = !!(rec && rec.v && rec.v[k] != null),
                  v = real ? rec.v[k] : p.v(c);
            return { p, v, real, s: stat(p, v), sv: sev(p, v) };
          });
    return { rows, st: rows.length ? Math.max(...rows.map(r => r.s)) : 3, real: rows.some(r => r.real) };
  },
  alerts(cr = crewOf()) {
    const o = [];
    ZONES.forEach(z => this.ev(z, C(S.day, cr), cr.id).rows.forEach(r => { if (r.s > 0) o.push({ z, r }); }));
    return o;
  },
  summary(cr) {
    const n = [0, 0, 0];
    ZONES.forEach(z => { const s = this.ev(z, C(S.day, cr), cr.id).st; if (s < 3) n[s]++; });
    return { n, w: n[2] ? 2 : n[1] ? 1 : 0 };
  },
  cross(al) {
    const g = id => al.find(a => a.z.id + "." + a.r.p.id === id),
          m = [];
    if (g("sueno.sq") && g("cognicion.cog")) m.push("Deterioro cognitivo por déficit de sueño: siesta estratégica de 25 min y luz azul enriquecida antes de reevaluar.");
    if (g("reaccion.rt")) m.push("Fatiga neuroconductual: reevaluar o descansar 20 min antes de autorizar tareas de precisión; EVA sin habilitar si el puntaje es 4 o menos.");
    if (g("cognicion.lat") && (g("cognicion.lap") || g("esfuerzo.co2"))) m.push("Posible hipercapnia de cabina: revisar los depuradores de CO₂ antes de atribuirlo a fatiga del tripulante.");
    return m;
  },
  gam(cr = crewOf()) {
    const days = Store.days(cr.id);
    let xp = 0, tests = 0, cog = 0, rs = 0;
    Object.values(days).forEach(r => {
      xp += Object.keys(r.v || {}).length * 5 + Object.keys(r.t || {}).length * 20;
      tests += Object.keys(r.t || {}).length;
      cog = Math.max(cog, (r.v || {})["cognicion.cog"] || 0);
      rs = Math.max(rs, (r.v || {})["reaccion.rs"] || 0);
    });
    let st = 0;
    for (let d = S.day; d >= 0 && days[d]; d--) st++;
    const b = [
      ["🚀", "Primer registro", xp > 0],
      ["🔥", "Racha de 3 días", st >= 3],
      ["🧠", "Cerebro de acero (≥ 85)", cog >= 85],
      ["⚡", "Reflejos (≥ 8)", rs >= 8],
      ["🏅", "5 pruebas completadas", tests >= 5]
    ];
    return { xp, lv: Math.floor(xp / 100) + 1, pct: xp % 100, st, b };
  }
};

/* ---------- Gráfico de línea ---------- */
let UID = 0;
function lineChartRaw(z, p, o = {}) {
  const W = o.w || 340,
        H = o.h || 170,
        L = o.mini ? 30 : 34,
        R = 8,
        T = 10,
        B = 22,
        cr = crewOf(),
        key = z.id + "." + p.id,
        id = "lg" + (UID++);
  
  const XM = Math.max(30, S.today),
        stp = Math.max(1, Math.ceil(XM / 60)),
        model = [];
  
  for (let d = 0; d < XM; d += stp) model.push([d, p.v(C(d, cr))]);
  model.push([XM, p.v(C(XM, cr))]);

  const real = Object.entries(Store.days(cr.id)).filter(([d, r]) => +d <= XM && r.v && r.v[key] != null).map(([d, r]) => [+d, r.v[key]]).sort((a, b) => a[0] - b[0]);
  const others = o.cmp ? CREW.filter(x => x.id !== cr.id).map(x => ({ x, pts: model.map(m => [m[0], p.v(C(m[0], x))]) })) : [];
  
  const vals = [...model.map(a => a[1]), ...real.map(a => a[1]), ...others.flatMap(q => q.pts.map(a => a[1])), p.base];
  if (p.dir !== "none") vals.push(p.y, p.r);
  
  let mn = Math.min(...vals),
      mx = Math.max(...vals);
  const pad = ((mx - mn) || 1) * .1;
  const nonneg = Math.min(...vals) >= 0;
  mn -= pad;
  mx += pad;
  if (nonneg && mn < 0) mn = 0;
  
  const sp = mx - mn,
        X = d => L + d / XM * (W - L - R),
        Y = v => T + (1 - (v - mn) / sp) * (H - T - B),
        cl = v => clamp(v, mn, mx),
        dec = p.d || (sp < 4 ? 1 : 0),
        tk = v => {
          const s = v.toFixed(dec);
          return (+s === 0 ? (0).toFixed(dec) : s).replace(".", ",");
        };

  const band = (a, b, c) => {
    const y1 = Y(cl(Math.max(a, b))),
          y2 = Y(cl(Math.min(a, b)));
    return y2 - y1 > .5 ? `<rect x="${L}" y="${y1}" width="${W - L - R}" height="${y2 - y1}" fill="${c}" opacity=".1"/>` : "";
  };

  const bands = p.dir === "none" ? "" : p.dir === "lt" ? band(mn, p.r, SC[2]) + band(p.r, p.y, SC[1]) + band(p.y, mx, SC[0]) : band(mn, p.y, SC[0]) + band(p.y, p.r, SC[1]) + band(p.r, mx, SC[2]);
  const th = (v, c) => p.dir === "none" && c !== "#7fb2ff" ? "" : `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-opacity=".85" stroke-dasharray="4 3"/>`;
  const pl = a => a.map(q => X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1)).join(" ");
  const area = `M${X(0)},${Y(mn)} L${pl(model).replace(/ /g, " L")} L${X(XM)},${Y(mn)}Z`;
  
  const rec = Store.get(cr.id, S.day),
        isReal = !!(rec && rec.v && rec.v[key] != null),
        cv = isReal ? rec.v[key] : p.v(C(S.day, cr)),
        cs = stat(p, cv),
        col = cs < 0 ? "#7fb2ff" : SC[cs];
        
  const grid = [mn, (mn + mx) / 2, mx].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#8cb4ff" stroke-opacity=".1"/><text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end" fill="#8d9bb8" font-size="9">${tk(v)}</text>`).join("");
  const xt = [0, Math.round(XM / 3), Math.round(XM * 2 / 3), XM].map(d => `<line x1="${X(d)}" x2="${X(d)}" y1="${T}" y2="${H - B}" stroke="#8cb4ff" stroke-opacity=".07"/><text x="${X(d)}" y="${H - 7}" text-anchor="${d === 0 ? "start" : d === XM ? "end" : "middle"}" fill="#8d9bb8" font-size="9">${d === 0 ? "Día 0" : d}</text>`).join("");

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Evolución de ${esc(p.n)} de ${esc(cr.name)}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${cr.col}" stop-opacity=".28"/><stop offset="1" stop-color="${cr.col}" stop-opacity="0"/></linearGradient></defs>${bands}${grid}${xt}${th(p.base, "#7fb2ff")}${th(p.y, SC[1])}${th(p.r, SC[2])}<path d="${area}" fill="url(#${id})"/>${others.map(q => `<polyline fill="none" stroke="${q.x.col}" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="3 3" points="${pl(q.pts)}"/>`).join("")}<polyline fill="none" stroke="${cr.col}" stroke-width="2.2" stroke-linejoin="round" points="${pl(model)}"/>${real.length > 1 ? `<polyline fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.6" points="${pl(real)}"/>` : ""}${real.map(a => `<circle data-day="${a[0]}" data-k="${key}" data-v="${a[1]}" cx="${X(a[0])}" cy="${Y(a[1])}" r="3.8" fill="${SC[stat(p, a[1]) < 0 ? 0 : stat(p, a[1])]}" stroke="#fff" stroke-width="1.2"><title>Día ${a[0]}: ${fmt(p, a[1])} ${esc(p.u)}</title></circle>`).join("")}<line x1="${X(S.day)}" x2="${X(S.day)}" y1="${T}" y2="${H - B}" stroke="#fff" stroke-opacity=".4"/><circle cx="${X(S.day)}" cy="${Y(cv)}" r="4.6" fill="${col}" stroke="#060912" stroke-width="2"/></svg>`;
}

const MEMO = new Map(),
      memo = (k, f) => {
        let v = MEMO.get(k);
        if (v === undefined) {
          if (MEMO.size > 400) MEMO.clear();
          MEMO.set(k, v = f());
        }
        return v;
      };

const dsig = () => { const k = cfg(); return [S.crew, S.env, k.adh, k.vas, S.day, S.today, Store.ver].join("|"); };
const lineChart = (z, p, o = {}) => memo(["lc", z.id, p.id, o.w, o.h, o.mini ? 1 : 0, o.cmp ? 1 : 0, dsig()].join("|"), () => lineChartRaw(z, p, o));
const chart = (z, p) => lineChart(z, p, { w: 320, h: 170, cmp: S.cmp });

/* ---------- Vistas ---------- */
function insp(z) {
  const e = Engine.ev(z),
        pi = Math.min(S.par[z.id] || 0, Math.max(0, z.p.length - 1)),
        pr = z.p[pi];
  return `<div class="rw" style="justify-content:space-between"><b>${z.n}</b><span class="src ${e.real ? "r" : ""}">${e.real ? "Dato real" : "Modelo simulado"}</span></div><div style="margin:6px 0">${bd(e.st)} <small style="color:var(--mu)">${z.sys}</small></div>
${e.rows.length ? `<div class="pl">${e.rows.map((r, i) => `<button class="pr ${i === pi ? "on" : ""}" data-p="${i}"><span>${r.p.n}${r.real ? ' <i class="src r">Dato real</i>' : ""}</span><b class="mono">${fmt(r.p, r.v)} <em>${r.p.u}</em></b>${r.p.dir === "none" ? "" : `<span class="t${r.s}"><span class="bar"><i style="width:${r.sv * 100}%"></i></span></span>`}</button>`).join("")}</div>${chart(z, pr)}<div class="lg"><span style="color:#7fb2ff">- - Base en Tierra ${fmt(pr, pr.base)}</span><span style="color:var(--warn)">- - Precaución</span><span style="color:var(--bad)">- - Alerta</span><span>━ Modelo</span><span style="color:#fff">● Real</span></div>` : `<p style="color:var(--mu);font-size:13px">${z.txt}</p>`}
<details><summary>Ver detalle clínico</summary><p>${z.txt}</p><p>Fuente de datos: ${z.src}</p></details>${z.tab !== "mente" && z.p.length ? `<button class="btn o sm" data-reg="${z.id}" style="margin-top:10px">Registrar datos de esta zona</button>` : ""}`;
}

function cards(zs, sel, btn) {
  return zs.map(z => {
    const x = Engine.ev(z), f = x.rows[0];
    return `<div class="card ${z.id === sel ? "sel" : ""}" data-z="${z.id}" role="button" tabindex="0"><small>${z.n}</small>${f ? `<div class="v mono">${fmt(f.p, f.v)} <em>${f.p.u}</em></div>` : `<div class="v mono">—</div>`}${bd(x.st)} <span class="src ${x.real ? "r" : ""}">${x.real ? "Dato real" : "Modelo"}</span><small style="display:block;margin:6px 0">${z.txt.split(". ")[0].slice(0, 110)}</small>${btn && x.rows.length ? `<button class="btn sm" data-open="${z.id}">Iniciar registro</button>` : ""}</div>`;
  }).join("");
}

const zoneFig = (tab, zs, sel) => {
  const cls = {};
  zs.forEach(z => cls[z.id] = "s" + Engine.ev(z).st + (z.id === sel.id ? " sel" : ""));
  return memo("fig|" + tab + "|" + JSON.stringify(cls), () => figure(tab, id => cls[id]));
};

const legend = () => `<div class="lg" style="justify-content:center">${SN.map((n, i) => `<span class="t${i}">● ${n}</span>`).join("")}</div>`;

function viewBody(tab) {
  const t = TABS.find(x => x.id === tab),
        zs = ZONES.filter(z => z.tab === tab),
        sel = zs.find(z => z.id === S.sel[tab]) || zs[0];
  S.sel[tab] = sel.id;
  return `<div class="two fig"><div class="g pn"><div class="svgw" id="svgw">${zoneFig(tab, zs, sel)}</div>${legend()}</div><div class="g pn" id="insp">${insp(sel)}</div></div>
<div class="g pn"><p style="margin:0 0 10px;color:var(--mu);font-size:13px"><b style="color:var(--tx)">Contramedida.</b> ${t.cm}</p><div class="rw"><button class="ib" data-r="cards" data-d="-1" aria-label="Anterior">‹</button><div class="rail" id="cards">${cards(zs, sel.id)}</div><button class="ib" data-r="cards" data-d="1" aria-label="Siguiente">›</button></div></div>`;
}

function viewTests() {
  const zs = ZONES.filter(z => z.tab === "mente"),
        sel = zs.find(z => z.id === S.sel.mente) || zs[0];
  S.sel.mente = sel.id;
  return `<div class="g pn"><p style="margin:0 0 10px;color:var(--mu);font-size:13px">${TABS.find(t => t.id === "mente").cm} Cada tarjeta abre su prueba; los resultados se guardan como “Dato real” del día ${S.day}.</p><div class="rw"><button class="ib" data-r="cards" data-d="-1" aria-label="Anterior">‹</button><div class="rail" id="cards">${cards(zs, sel.id, 1)}</div><button class="ib" data-r="cards" data-d="1" aria-label="Siguiente">›</button></div></div><div class="g pn" id="insp">${insp(sel)}</div>
<div class="g pn"><b>Protocolo de prueba de esfuerzo (CEVIS)</b><details open><summary>Ver las 8 fases</summary><div style="overflow-x:auto"><table class="tb"><tr><th>Fase</th><th>Duración</th><th>Carga</th><th>Cadencia</th><th>Objetivo</th></tr>${CPET.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div></details></div>`;
}

function viewRisks() {
  return `<div class="g pn" id="hz"><b>Los 5 peligros del Programa de Investigación Humana de la NASA</b><p style="color:var(--mu);font-size:13px">Cada peligro se traduce en indicadores que el tripulante puede medir. ${esc(ENVS[S.env].note)}</p><div class="rail" style="flex-wrap:wrap;overflow:visible">${HAZARDS.map(h => `<div class="card" style="width:min(100%,360px)"><div style="font-size:26px">${h.ic}</div><b>${h.n}</b><p style="font-size:13px;color:var(--mu);margin:6px 0">${h.eff}</p><details><summary>Indicadores y cuándo pedir ayuda</summary><p><b style="color:var(--tx)">Indicadores:</b> ${h.ind}</p><p><b style="color:var(--tx)">Pedir ayuda:</b> ${h.call}</p><p><b style="color:var(--tx)">Prevención:</b> ${h.prev}</p></details><button class="btn o sm" data-go="${h.go}" style="margin-top:8px">Ver en la app</button></div>`).join("")}</div></div>
<div class="g pn" id="guia"><b>Guía rápida de indicadores</b>${GUIDE.map(g => `<details><summary>${g[0]}</summary><p>${g[1]}</p></details>`).join("")}</div>
<div class="g pn" id="rec"><b>Recursos oficiales</b><ul>${LINKS.map(l => `<li><a href="${l[1]}" target="_blank" rel="noopener">${l[0]}</a></li>`).join("")}</ul></div>`;
}

function viewPanel() {
  const cr = crewOf(),
        items = PANEL.filter(a => S.cat === "all" || a[2] === S.cat);
  const cc = CREW.map(x => {
    const sm = Engine.summary(x), g = Engine.gam(x);
    return `<button class="cc ${x.id === S.crew ? "on" : ""}" data-c="${x.id}" style="--cc:${x.col}" aria-pressed="${x.id === S.crew}"><div class="av" style="background:${x.col};color:#06101f">${x.name.split(" ")[1][0]}</div><div class="ci"><b>${x.name}</b><span>${x.role}</span><div class="mini">${sm.n.map((v, i) => `<i class="t${i}">${v} ${["normal", "precaución", "alerta"][i]}</i>`).join("")}</div></div><div class="lv mono">Nv ${g.lv}</div></button>`;
  }).join("");
  
  const grid = items.map(([zi, pi]) => {
    const z = ZONES.find(q => q.id === zi),
          idx = z.p.findIndex(q => q.id === pi),
          p = z.p[idx],
          r = Engine.ev(z).rows[idx],
          nreal = Object.values(Store.days(cr.id)).filter(q => q.v && q.v[zi + "." + pi] != null).length;
    return `<article class="gc" data-gz="${zi}:${idx}" tabindex="0" role="button" aria-label="Abrir ${esc(z.n)}"><header><small>${z.n}</small><b>${p.n}</b></header><div class="gv"><span class="mono t${r.s < 0 ? 3 : r.s}">${fmt(p, r.v)}</span><em>${p.u}</em>${r.s >= 0 ? bd(r.s) : ""}${r.real ? '<i class="src r">Dato real</i>' : ""}</div>${lineChart(z, p, { w: 340, h: 168, mini: 1, cmp: S.cmp })}<footer><span>${refText(p)}</span>${nreal ? `<span class="src r">${nreal} real${nreal > 1 ? "es" : ""}</span>` : ""}</footer></article>`;
  }).join("");

  return `<div class="g pn"><div class="rw" style="justify-content:space-between;flex-wrap:wrap"><div><b>Selecciona un tripulante</b><p style="margin:2px 0 0;color:var(--mu);font-size:13px">Cada gráfico muestra la evolución de un estado de salud de <b style="color:var(--tx)">${cr.name}</b> desde el día 0 hasta el día ${S.today} de la misión.</p></div></div><div class="ccw">${cc}</div></div>
<div class="g pn"><div class="rw" style="flex-wrap:wrap;gap:8px">${CATS.map(c => `<button class="chip ${S.cat === c[0] ? "on" : ""}" data-cat="${c[0]}">${c[1]}</button>`).join("")}<span style="flex:1"></span><button class="chip ${S.cmp ? "on" : ""}" data-cmp="1" aria-pressed="${!!S.cmp}">Comparar con el resto de la tripulación</button></div>
<div class="lg" style="margin-top:10px"><span style="color:${cr.col}">━ ${cr.name} (modelo)</span><span style="color:#fff">● Dato real registrado</span><span style="color:#7fb2ff">- - Base en Tierra</span><span style="color:var(--warn)">- - Precaución</span><span style="color:var(--bad)">- - Alerta</span><span>│ Día ${S.day}</span>${S.cmp ? CREW.filter(x => x.id !== cr.id).map(x => `<span style="color:${x.col}">┅ ${x.name.split(" ").slice(-1)[0]}</span>`).join("") : ""}</div></div>
<div class="cg">${grid}</div><p style="color:var(--mu);font-size:12px;margin:0 4px">Toca un gráfico para ver la zona del cuerpo. Los puntos blancos son registros reales guardados en la pestaña Registro; la línea de color es el modelo simulado según el entorno, el cumplimiento de ejercicio y el día de misión.</p>`;
}

/* --- Registro por zona del cuerpo --- */
const RL = [["huesos", "🦴 Huesos"], ["musculos", "💪 Músculos"], ["organos", "🫀 Órganos"]];
function regForm(z) {
  const rec = Store.get(S.crew, S.day) || { v: {} },
        note = (rec.zn || {})[z.id] || "",
        c = C(),
        has = z.p.length > 0;
  if (!has) return `<div class="rw" style="justify-content:space-between"><b>${z.n}</b>${bd(3)}</div><p style="color:var(--mu);font-size:13px">${z.txt}</p>`;
  return `<div class="rw" style="justify-content:space-between"><b>${z.n}</b>${bd(Engine.ev(z).st)}</div><p style="margin:2px 0 10px;color:var(--mu);font-size:13px">${esc(crewOf().name)} · ${z.src}</p>
<div class="fg"><label>Día de misión<input type="number" id="fday" min="0" max="${S.today}" value="${S.day}"></label><div style="align-self:end;font-size:12px;color:var(--mu)">Deja vacío un campo para usar el modelo simulado.</div>
${z.p.map((p, i) => {
  const k = z.id + "." + p.id,
        v = rec.v && rec.v[k] != null ? rec.v[k] : "",
        cv = v !== "" ? v : p.v(c),
        s = stat(p, cv);
  return `<label>${esc(p.n)} (${esc(p.u)})<input type="number" step="any" inputmode="decimal" data-f="${k}" ${NEGOK.has(k) ? "" : 'min="0"'} value="${v}" placeholder="${fmt(p, p.v(c))}"><span class="rf"><span id="rs-${p.id}">${s >= 0 ? bd(s) : ""}</span> ${refText(p)}</span></label>`;
}).join("")}
<label class="w">Observaciones de esta zona<textarea id="zn" rows="2" placeholder="Ej.: molestia al agacharse, medición repetida…">${esc(note)}</textarea></label></div>
<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn o" id="zdel">Borrar esta zona del día</button><button class="btn" id="zsv">Guardar registro</button></div>`;
}

function regHistory(z) {
  if (!z.p.length) return "";
  const days = Store.days(S.crew),
        pre = z.id + ".",
        rows = Object.entries(days).filter(([d, r]) => Object.keys(r.v || {}).some(k => k.indexOf(pre) === 0)).sort((a, b) => b[0] - a[0]).slice(0, 14),
        pi = Math.min(S.par[z.id] || 0, z.p.length - 1),
        pr = z.p[pi];
  return `<div class="g pn"><b>Historial de ${esc(crewOf().name.split(" ").slice(-1)[0])} · ${z.n}</b><div class="row" style="margin:10px 0">${z.p.map((p, i) => `<button class="chip ${i === pi ? "on" : ""}" data-p="${i}">${esc(p.n)}</button>`).join("")}</div>${lineChart(z, pr, { w: 560, h: 220, cmp: S.cmp })}
${rows.length ? `<div style="overflow-x:auto;margin-top:10px"><table class="tb"><tr><th>Día</th>${z.p.map(p => `<th>${esc(p.n)}</th>`).join("")}<th>Observación</th></tr>${rows.map(([d, r]) => `<tr class="${+d === S.day ? "cur" : ""}"><td><button class="chip" data-day="${d}">${d}</button></td>${z.p.map(p => { const v = r.v[pre + p.id]; return v == null ? "<td>—</td>" : `<td class="mono t${Math.max(0, stat(p, v))}">${fmt(p, v)}</td>`; }).join("")}<td>${esc((r.zn && r.zn[z.id]) || "")}</td></tr>`).join("")}</table></div>` : `<p style="color:var(--mu);font-size:13px">Aún no hay registros reales de esta zona. Guarda el primero en el formulario; mientras tanto la curva es el modelo simulado.</p>`}</div>`;
}

function viewRegistro() {
  const cr = crewOf(),
        L = S.rl,
        zs = ZONES.filter(z => z.tab === L),
        sel = zs.find(z => z.id === S.sel[L]) || zs[0];
  S.sel[L] = sel.id;
  const days = Store.days(cr.id),
        nd = Object.keys(days).length,
        mz = zs.filter(z => Object.values(days).some(r => Object.keys(r.v || {}).some(k => k.indexOf(z.id + ".") === 0))).length;
  return `<div class="g pn"><div class="rw" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><div><b>Registro de ${cr.name}</b><p style="margin:2px 0 0;color:var(--mu);font-size:13px">Elige la zona del cuerpo, completa sus controles y revisa su historial. ${nd} día${nd === 1 ? "" : "s"} con datos · ${mz} de ${zs.length} zonas de esta capa con registro.</p></div><div class="row">${CREW.map(x => `<button class="chip ${x.id === S.crew ? "on" : ""}" data-c="${x.id}">${x.name.split(" ").slice(-1)[0]}</button>`).join("")}</div></div></div>
<div class="two fig"><div class="g pn"><div class="row" style="justify-content:center;margin-bottom:6px">${RL.map(l => `<button class="chip ${l[0] === L ? "on" : ""}" data-rl="${l[0]}">${l[1]}</button>`).join("")}</div><div class="svgw" id="svgw">${zoneFig(L, zs, sel)}</div>${legend()}
<div class="row" style="margin-top:10px;justify-content:center">${zs.map(z => { const st = Engine.ev(z).st; return `<button class="chip zc ${z.id === sel.id ? "on" : ""}" data-z="${z.id}"><i class="t${st}">●</i> ${z.n.split(" (")[0]}</button>`; }).join("")}</div></div>
<div style="display:grid;gap:12px;align-content:start"><div class="g pn" id="regform">${regForm(sel)}</div>${regHistory(sel)}</div></div>
<div class="g pn"><b>Pruebas y autorregistros del día ${S.day}</b><p style="margin:2px 0 10px;color:var(--mu);font-size:13px">Sueño, memoria, reacción, ánimo y esfuerzo se registran con sus propias pruebas.</p><div class="rw"><button class="ib" data-r="cards" data-d="-1" aria-label="Anterior">‹</button><div class="rail" id="cards">${cards(ZONES.filter(z => z.tab === "mente"), "", 1)}</div><button class="ib" data-r="cards" data-d="1" aria-label="Siguiente">›</button></div></div>`;
}

function renderChrome() {
  const cr = crewOf(),
        al = Engine.alerts(),
        cx = Engine.cross(al),
        gm = Engine.gam(),
        sm = Engine.summary(cr),
        n = sm.n,
        w = sm.w,
        k = cfg();
  $("dd").textContent = S.day + " / " + S.today;
  $("day").max = S.today;
  $("day").value = S.day;
  for (const i of ["env", "env2"]) $(i).value = S.env;
  $("envnote").textContent = ENVS[S.env].note + " Latencia de comunicación: " + ENVS[S.env].lat + ".";
  $("adh").value = k.adh;
  $("adho").textContent = k.adh + " %";
  $("vas").value = k.vas;
  $("vaso").textContent = k.vas;
  $("crew").innerHTML = CREW.map(x => `<button class="crew ${x.id === S.crew ? "on" : ""}" data-c="${x.id}"><div class="av" style="background:${x.col};color:#06101f">${x.name.split(" ")[1][0]}</div><div><b>${x.name}</b><span>${x.role}</span></div></button>`).join("");
  $("hero").innerHTML = `<div>${bd(w)}<h2>${cr.name}</h2><p>${cr.role} · ${cr.bio}</p></div><div class="kp">${n.map((v, i) => `<div><small>${SN[i]}</small><b class="mono t${i}">${v}</b></div>`).join("")}<div style="min-width:150px"><small>Nivel ${gm.lv} · racha ${gm.st} d</small><div class="xp"><i style="width:${gm.pct}%"></i></div><span style="font-size:18px">${gm.b.map(b => `<span title="${b[1]}" style="opacity:${b[2] ? 1 : .25}">${b[0]}</span>`).join(" ")}</span></div></div>
<details style="width:100%"><summary>Alertas activas (${al.length})</summary>${al.length ? al.map(a => `<p>${bd(a.r.s)} ${a.z.n} · ${a.r.p.n}: <b class="mono">${fmt(a.r.p, a.r.v)} ${a.r.p.u}</b></p>`).join("") : "<p>Sin alertas: todos los parámetros están dentro de lo esperado.</p>"}${cx.map(t => `<p class="t1">⚠ ${t}</p>`).join("")}</details>`;
  $("tabs").innerHTML = TABS.map(t => `<button class="tab ${t.id === S.tab ? "on" : ""}" data-t="${t.id}">${t.ic ? t.ic + " " : ""}${t.n}</button>`).join("");
}

function render() { Nav.render(); }
function State(p) { Object.assign(S, p); Nav.render(); }
function toast(t) {
  const e = $("toast");
  e.textContent = t;
  e.classList.add("on");
  setTimeout(() => e.classList.remove("on"), 1900);
}

/* ---------- Eventos ---------- */
const tip = $("tip");
document.addEventListener("click", e => {
  const t = e.target.closest("[data-t],[data-open],[data-z],[data-c],[data-r],[data-p],[data-go],[data-gz],[data-cat],[data-cmp],[data-rl],[data-reg],[data-day],#zsv,#zdel");
  if (!t) return;
  const d = t.dataset;
  if (t.id === "zsv") return saveZone();
  if (t.id === "zdel") return delZone();
  if (d.open) return openTest(d.open);
  if (d.t) Nav.go({ tab: d.t, quiet: 1 });
  else if (d.go) Nav.go({ tab: d.go });
  else if (d.gz) {
    const [zi, ix] = d.gz.split(":"),
          z = ZONES.find(q => q.id === zi);
    Nav.go({ tab: z.tab, z: zi, p: +ix });
  } else if (d.cat) State({ cat: d.cat });
  else if (d.cmp) State({ cmp: S.cmp ? 0 : 1 });
  else if (d.rl) { Nav.go({ tab: "registro", rl: d.rl, quiet: 1 }); }
  else if (d.reg) {
    const z = ZONES.find(q => q.id === d.reg);
    Nav.go({ tab: "registro", rl: z.tab, z: z.id });
  } else if (d.day != null) State({ day: +d.day });
  else if (d.z) Nav.pick(d.z);
  else if (d.p != null) Nav.par(+d.p);
  else if (d.c) { State({ crew: d.c }); closeDrawer(); }
  else if (d.r) {
    const r = $(d.r),
          c = r.firstElementChild;
    r.scrollBy({ left: d.d * (c ? c.offsetWidth + 10 : 260), behavior: "smooth" });
  }
});

document.addEventListener("keydown", e => {
  const el = e.target;
  if ((e.key === "Enter" || e.key === " ") && el.dataset && (el.dataset.z || el.dataset.gz) && !/INPUT|TEXTAREA|SELECT/.test(el.tagName)) {
    e.preventDefault();
    el.click();
  }
});

document.addEventListener("pointermove", e => {
  const z = e.target.closest && e.target.closest("svg .z");
  if (!z) { tip.style.display = "none"; return; }
  const zz = ZONES.find(q => q.id === z.dataset.z && q.tab === layer());
  if (!zz) return;
  const x = Engine.ev(zz),
        f = x.rows[0];
  tip.innerHTML = `${zz.n}${f ? `: <b>${fmt(f.p, f.v)} ${f.p.u}</b>` : ""} · ${SN[x.st]}`;
  tip.style.display = "block";
  tip.style.left = Math.min(e.clientX + 12, innerWidth - 260) + "px";
  tip.style.top = e.clientY + 14 + "px";
});

document.addEventListener("input", e => {
  const i = e.target;
  if (!i.dataset || !i.dataset.f) return;
  const [zid, pid] = i.dataset.f.split("."),
        z = ZONES.find(q => q.id === zid),
        p = z.p.find(q => q.id === pid),
        el = $("rs-" + pid);
  if (!el) return;
  const v = parseFloat(i.value),
        x = isNaN(v) ? p.v(C()) : v,
        s = stat(p, x);
  el.innerHTML = s >= 0 ? bd(s) : "";
});

document.addEventListener("change", e => {
  if (e.target.id === "fday") State({ day: clamp(Math.round(+e.target.value || 0), 0, S.today) });
});

function saveZone() {
  const z = ZONES.find(q => q.id === S.sel[S.rl]);
  const d = clamp(Math.round(+$("fday").value || 0), 0, S.today);
  const v = {};

  document.querySelectorAll("[data-f]").forEach(i => {
    if (i.value !== "" && !isNaN(parseFloat(i.value))) {
      v[i.dataset.f] = parseFloat(i.value);
    }
  });

  const n = $("zn").value.trim();
  if (Object.keys(v).some(k => v[k] < 0 && !NEGOK.has(k))) {
    return toast("No se permiten valores negativos");
  }
  if (!Object.keys(v).length && !n) {
    return toast("Ingresa al menos un valor");
  }

  S.day = d;
  Store.setZone(S.crew, d, z.id, v, n);
  render();
  toast("Registro de " + z.n.split(" (")[0] + " guardado");
  checkAndTriggerAlerts(true);
}

function delZone() {
  const z = ZONES.find(q => q.id === S.sel[S.rl]),
        d = clamp(Math.round(+$("fday").value || 0), 0, S.today);
  Store.setZone(S.crew, d, z.id, {}, "");
  render();
  toast("Registro de la zona borrado");
}

const openDrawer = () => Nav.open(),
      closeDrawer = () => Nav.close();

$("hb").onclick = openDrawer;
$("scrim").onclick = closeDrawer;
$("day").oninput = e => State({ day: +e.target.value });
$("adh").oninput = e => { cfg().adh = +e.target.value; render(); };
$("vas").oninput = e => { cfg().vas = +e.target.value; render(); };

for (const i of ["env", "env2"]) {
  $(i).innerHTML = Object.entries(ENVS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join("");
  $(i).onchange = e => State({ env: e.target.value });
}
$("log").onclick = () => Nav.go({ tab: "registro" });
$("dys").onclick = () => openDays();
$("upl").onclick = () => openUpload();

/* ---------- Diálogo y pruebas jugables ---------- */
let TM = [];
const later = (f, ms) => TM.push(setTimeout(f, ms)),
      clr = () => { TM.forEach(clearTimeout); TM = []; };

const dlg = $("dlg");
dlg.addEventListener("close", () => { clr(); render(); });

function openDlg(h) {
  clr();
  $("dbody").innerHTML = h;
  if (!dlg.open) dlg.showModal();
}

const head = (t, s) => `<h3 style="margin:0 0 4px">${t}</h3><p style="margin:0 0 12px;color:var(--mu);font-size:13px">${crewOf().name} · día ${S.day}. ${s || ""}</p>`;
const foot = (ok) => `<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn o" onclick="dlg.close()">Cerrar</button>${ok || ""}</div>`;
const num = (id, l, x = "") => `<label>${l}<input type="number" step="any" inputmode="decimal" min="0" id="${id}" ${x}></label>`;
const V = id => {
  const e = $(id);
  return e && e.value !== "" ? parseFloat(e.value) : null;
};

function save(v, t, msg) {
  Store.put(S.crew, S.day, { v, t });
  toast(msg || "Dato real guardado");
}

const alertBox = (c, t) => `<div class="alert t${c}">${t}</div>`;
function openTest(id) {
  ({ sueno: tSleep, cognicion: tColors, reaccion: tPVT, animo: tMood, esfuerzo: tCpet })[id]();
}

/* --- Sueño --- */
function tSleep() {
  openDlg(head("Registro de sueño", "Telemetría del anillo biométrico más autorreporte matutino de 15 segundos.") +
    `<div class="fg">${num("tst", "Tiempo total de sueño (h)", 'value="6.2"')}${num("eff", "Eficiencia (%)", 'value="84"')}${num("hrv", "HRV nocturna (ms)", 'value="55"')}
${[["r1", "¿Qué tan descansado te sientes? (1 agotado, 5 renovado)"], ["r2", "Continuidad del sueño (1 fragmentado, 5 continuo)"], ["r3", "Claridad mental al despertar (1 somnolencia, 5 alerta máxima)"]].map(a => `<label class="w">${a[1]}<input type="range" id="${a[0]}" min="1" max="5" value="3" style="width:100%"></label>`).join("")}</div><div id="res"></div>` +
    foot('<button class="btn" id="go">Calcular y guardar</button>'));
  $("go").onclick = () => {
    const g = k => V(k),
          s = { tst: g("tst"), eff: g("eff") },
          obj = sleepObj(s),
          subj = clamp(Math.round((g("r1") + g("r2") + g("r3")) / 3), 1, 5),
          glob = clamp(Math.round(.6 * obj + .4 * subj), 1, 5);
    save({ "sueno.tst": s.tst, "sueno.eff": s.eff, "sueno.nhrv": g("hrv"), "sueno.sq": glob }, { sleep: { obj, subj, glob } });
    let h = `<div class="alert t${glob <= 2 ? 2 : glob === 3 ? 1 : 0}">Calidad objetiva <b>${obj}/5</b> · subjetiva <b>${subj}/5</b> · global <b>${glob}/5 — ${SLEEP_CAT[glob]}</b></div>`;
    if (Math.abs(obj - subj) >= 2) h += alertBox(1, "Discordancia objetivo-subjetiva: se prioriza el dato fisiológico y se restringen tareas de alto riesgo cognitivo.");
    if (glob <= 2) h += alertBox(2, "Calidad 2 o menor: reducir 15–20 % el volumen de ARED pesado si se repite dos noches seguidas.");
    $("res").innerHTML = h;
  };
}

/* --- Test de colores --- */
function tColors() {
  const seq = [];
  while (seq.length < 10) {
    const i = Math.floor(Math.random() * 10),
          n = seq.length;
    if (n >= 2 && seq[n - 1] === i && seq[n - 2] === i) continue;
    seq.push(i);
  }
  openDlg(head("Test secuencial de colores", "Memoriza 10 colores y repítelos en el mismo orden. Dura menos de 45 s.") +
    `<div class="big" id="bx" style="background:#10192e">Preparado</div><div id="pad" class="sw" style="display:none">${PALETTE.map((p, i) => `<button data-k="${i}" style="background:${p[1]}">${p[0]}</button>`).join("")}</div><div id="res"></div>` +
    foot('<button class="btn" id="go">Comenzar</button>'));
  $("go").onclick = () => {
    $("go").disabled = true;
    let c = 3;
    const bx = $("bx");
    const tick = () => {
      if (c > 0) {
        bx.textContent = c--;
        later(tick, 1000);
      } else show(0);
    };
    tick();

    function show(i) {
      if (i >= 10) {
        bx.style.background = "#10192e";
        bx.textContent = "¡Repite la secuencia!";
        $("pad").style.display = "grid";
        return play();
      }
      bx.style.background = PALETTE[seq[i]][1];
      bx.textContent = PALETTE[seq[i]][0];
      bx.style.color = "#06101f";
      later(() => {
        bx.style.background = "#10192e";
        bx.textContent = "";
        later(() => show(i + 1), 300);
      }, 600);
    }

    function play() {
      const taps = [], t0 = performance.now();
      later(() => fin(taps, t0), 30000);
      $("pad").onclick = e => {
        const b = e.target.closest("[data-k]");
        if (!b || taps.length >= 10) return;
        taps.push([+b.dataset.k, performance.now()]);
        bx.textContent = taps.length + " / 10";
        if (taps.length === 10) {
          clr();
          fin(taps, t0);
        }
      };
    }

    function fin(taps, t0) {
      $("pad").style.display = "none";
      const acc = taps.filter((t, i) => t[0] === seq[i]).length;
      let span = 0;
      while (span < taps.length && taps[span][0] === seq[span]) span++;
      const T = taps.length === 10 ? taps[9][1] - t0 : 30000,
            lat = taps.length ? taps[0][1] - t0 : 30000,
            gaps = taps.map((t, i) => t[1] - (i ? taps[i - 1][1] : t0)),
            itv = taps.length > 1 ? gaps.slice(1).reduce((a, b) => a + b, 0) / (taps.length - 1) : 0,
            lap = gaps.slice(1).filter(g => g > 2000).length;
      const sv = T <= 6000 ? 20 : T <= 12000 ? 20 * (1 - (T - 6000) / 6000) : 0,
            score = Math.round(clamp(acc * 5 + span * 3 + sv - lap * 5, 0, 100)),
            cls = COG.find(c => score >= c[0]);
      save({ "cognicion.cog": score, "cognicion.acc": acc, "cognicion.span": span, "cognicion.lat": Math.round(lat), "cognicion.itv": Math.round(itv), "cognicion.lap": lap }, { colors: { score, cls: cls[1] } });
      $("res").innerHTML = alertBox(score >= 85 ? 0 : score >= 70 ? 1 : 2, `Puntaje <b>${score}/100</b> · ${cls[1]}<br>${cls[2]}`) + `<p class="mono" style="font-size:12px;color:var(--mu)">Aciertos ${acc}/10 · racha ${span} · latencia ${Math.round(lat)} ms · intervalo medio ${Math.round(itv)} ms · lapsos ${lap}</p>`;
      $("bx").textContent = "Fin";
    }
  };
}

/* --- Reacción (PVT) --- */
function tPVT() {
  openDlg(head("Test de reacción", "Toca en cuanto el botón cambie de rojo a verde. 3 intentos válidos.") +
    `<div class="big" id="bx" style="background:#10192e">Preparado</div><div id="res"></div>` +
    foot('<button class="btn" id="go">Comenzar</button>'));
  let st = "idle", t0 = 0, tr = [], fs = 0;
  const bx = $("bx");

  function wait() {
    st = "red";
    bx.style.background = "#b8323f";
    bx.textContent = "ESPERA…";
    later(() => {
      st = "green";
      bx.style.background = "#1fbf86";
      bx.style.color = "#04140d";
      bx.textContent = "¡AHORA!";
      t0 = performance.now();
    }, 2000 + Math.random() * 4000);
  }

  bx.addEventListener("pointerdown", () => {
    if (st === "red") {
      clr();
      fs++;
      st = "pause";
      bx.textContent = "¡Muy pronto! Espera al verde";
      later(wait, 1200);
    } else if (st === "green") {
      const t = Math.round(performance.now() - t0);
      tr.push(t);
      st = "pause";
      bx.textContent = t + " ms";
      later(() => tr.length < 3 ? wait() : fin(), 1500);
    }
  });

  $("go").onclick = () => {
    $("go").disabled = true;
    wait();
  };

  function fin() {
    st = "done";
    const avg = tr.reduce((a, b) => a + b, 0) / 3,
          base = REACT.find(r => avg <= r[0]),
          lap = tr.filter(t => t > 500).length;
    let sc = base[1];
    if (fs >= 2) sc -= 1;
    if (lap >= 1) sc -= 2;
    sc = Math.max(1, sc);
    save({ "reaccion.rt": Math.round(avg), "reaccion.fast": Math.min(...tr), "reaccion.rs": sc, "reaccion.fs": fs, "reaccion.rl": lap }, { pvt: { trials: tr, sc } });
    bx.style.background = "#10192e";
    bx.style.color = "";
    bx.textContent = "Fin";
    $("res").innerHTML = alertBox(sc >= 6 ? 0 : sc >= 5 ? 1 : 2, `Puntaje <b>${sc}/10</b> · ${base[2]}. ${base[3]}<br>Habilitación para EVA: <b>${sc >= 6 ? "sí" : "no"}</b> (se requiere 6 o más)`) + `<p class="mono" style="font-size:12px;color:var(--mu)">Intentos ${tr.join(" · ")} ms · promedio ${Math.round(avg)} ms · salidas en falso ${fs} · lapsos ${lap}</p>`;
  }
}

/* --- Ánimo --- */
function tMood() {
  let sc = null, tags = [];
  openDlg(head("Ánimo del día", "Menos de 30 segundos antes de dormir.") +
    `<div class="sw" id="sw">${MOOD.map(m => `<button data-m="${m[0]}" style="background:hsl(${(m[0] - 1) * 13} 70% 62%)">${m[0]}</button>`).join("")}</div><p id="mm" style="min-height:40px;color:var(--mu)">Toca un número para ver su significado.</p><div class="row">${TAGS.map(t => `<button class="chip" data-g="${t}">${t}</button>`).join("")}</div><label class="fg" style="margin-top:10px"><span class="w" style="font-size:12px;color:var(--mu)">Resume tu día en dos líneas (lo mejor y lo más difícil)</span><textarea class="w" id="jr" rows="2"></textarea></label><div id="res"></div>` +
    foot('<button class="btn" id="go">Guardar</button>'));
  
  $("sw").onclick = e => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    sc = +b.dataset.m;
    const m = MOOD.find(x => x[0] === sc);
    $("mm").innerHTML = `<b style="color:var(--tx)">${m[1]}.</b> ${m[2]}`;
  };

  $("dbody").querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
    const t = b.dataset.g;
    if (tags.includes(t)) tags = tags.filter(x => x !== t);
    else if (tags.length < 2) tags.push(t);
    b.classList.toggle("on", tags.includes(t));
  });

  $("go").onclick = () => {
    if (!sc) return toast("Elige un número");
    const days = Store.days(S.crew);
    let prev = null;
    for (let d = S.day - 1; d >= 0; d--) if (days[d] && days[d].v && days[d].v["animo.mood"] != null) { prev = days[d].v["animo.mood"]; break; }
    
    let mono = true;
    for (let d = S.day - 6; d < S.day; d++) {
      const m = days[d] && days[d].v && days[d].v["animo.mood"];
      if (m !== 5 && m !== 6) mono = false;
    }
    mono = mono && (sc === 5 || sc === 6);
    save({ "animo.mood": sc }, { mood: { tags, journal: $("jr").value.trim() } });
    
    let h = "";
    if (sc <= 3 || (prev != null && prev - sc >= 4)) h += alertBox(2, "Alerta roja: se sugiere descanso y se avisa de forma confidencial al equipo médico en Tierra.");
    if (mono) h += alertBox(1, "Alerta amarilla por monotonía: 7 días seguidos en 5 o 6. Agenda una videollamada con tu familia o varía tus tareas.");
    $("res").innerHTML = h || alertBox(0, "Registro guardado. ¡Buen trabajo!");
  };
}

/* --- Prueba de esfuerzo --- */
function tCpet() {
  openDlg(head("Prueba de esfuerzo (CEVIS)", "Control de seguridad cada segundo y resultados del rendimiento.") +
    `<div class="fg">${num("hr", "FC (lpm)")}${num("spo2", "SpO₂ (%)", 'value="97"')}${num("spo2b", "SpO₂ basal (%)", 'value="98"')}${num("ptc", "PtcCO₂ (mmHg)", 'value="38"')}${num("sbp", "Presión sistólica")}${num("dbp", "Presión diastólica")}${num("sbpP", "Sistólica en la etapa previa")}<label>Síntoma o arritmia<select id="sym"><option value="0">No</option><option value="1">Sí (mareo, dolor torácico, calambres, ST)</option></select></label>
${num("vo2", "VO₂máx estimado (mL/kg/min)")}${num("awe", "Eficiencia aeróbica (mL O₂/min/W)")}${num("pw", "Potencia en VT1 (W/kg)")}${num("hrr", "Recuperación de FC al minuto (lpm)")}${num("borg", "Borg Etapa 2 (6–20)")}</div><div id="res"></div>` +
    foot('<button class="btn" id="go">Verificar y guardar</button>'));
  
  $("go").onclick = () => {
    const g = V,
          r = cpetCheck({
            age: crewOf().age,
            hr: g("hr") || 0,
            spo2: g("spo2") || 98,
            spo2b: g("spo2b") || 98,
            ptc: g("ptc") || 0,
            sbp: g("sbp") || 0,
            dbp: g("dbp") || 0,
            sbpPrev: g("sbpP"),
            sym: $("sym").value === "1"
          });
    const m = {};
    [["vo2", "vo2"], ["awe", "awe"], ["pw", "pw"], ["hrr", "hrr"], ["borg", "borg"], ["ptc", "co2"]].forEach(([a, b]) => {
      const x = g(a);
      if (x != null) m["esfuerzo." + b] = x;
    });
    if (Object.keys(m).length) save(m, { cpet: { stop: r } }, "Prueba guardada");
    $("res").innerHTML = r.length ? alertBox(2, "<b>DETENER AHORA</b>: pasar a la Fase 6 (recuperación activa a 40 W).<br>• " + r.join("<br>• ")) : alertBox(0, "Sin criterios de detención. Continuar el protocolo.");
  };
}

/* ---------- Días de misión ---------- */
function setToday(n) {
  n = clamp(Math.round(+n || 0), S.today, 300);
  try { localStorage.setItem(TK, String(n)); } catch (e) {}
  State({ today: n, day: n });
}

function openDays() {
  const t = S.today;
  openDlg(head("Días de misión", "La barra y los gráficos llegan hasta el día actual.") +
    `<div class="alert t0">Día actual de la misión: <b>${t}</b> de 300</div>
    <div class="row" style="margin-top:10px"><button type="button" class="btn" id="dnext" ${t >= 300 ? "disabled" : ""}>Pasar al día ${Math.min(t + 1, 300)}</button>
    <label class="ctl">o elegir día<input type="number" id="dgo" min="${t + 1}" max="300" value="${Math.min(t + 1, 300)}" style="width:90px"></label><button type="button" class="btn o" id="dgob" ${t >= 300 ? "disabled" : ""}>Ir</button></div>
    <p style="color:var(--mu);font-size:12px;margin:8px 0 0">Solo se puede avanzar. Los días anteriores se completan a mano o con “Cargar archivo”.</p>` + foot());
  
  $("dnext").onclick = () => { setToday(S.today + 1); openDays(); };
  $("dgob").onclick = () => {
    const v = Math.round(+$("dgo").value);
    if (!(v > S.today && v <= 300)) return toast("Elige un día posterior a " + S.today);
    setToday(v);
    openDays();
  };
}

/* ---------- Carga de días anteriores (SVG o CSV) ---------- */
const KNOWN = () => {
  const k = new Set();
  ZONES.forEach(z => z.p.forEach(p => k.add(z.id + "." + p.id)));
  return k;
};

const crewRes = x => {
  const t = norm(x);
  if (!t) return S.crew;
  const c = CREW.find(q => norm(q.id) === t || norm(q.name) === t || norm(q.name.split(" ").slice(-1)[0]) === t);
  return c ? c.id : null;
};

const crewFor = tg => x => {
  const t = norm(x);
  if (tg === "all") return t ? crewRes(x) : null;
  if (!t) return tg;
  return crewRes(x) === tg ? tg : null;
};

function svgParse(txt) {
  const doc = new DOMParser().parseFromString(txt, "image/svg+xml"),
        root = doc.documentElement;
  if (!root || doc.querySelector("parsererror") || root.localName !== "svg") return null;
  const rows = [],
        push = (c, d, k, v) => rows.push({ c: c || "", d: parseNum(d), k: String(k || "").trim(), v: parseNum(v) });
  
  doc.querySelectorAll("metadata").forEach(m => {
    try {
      const j = JSON.parse(m.textContent);
      Object.entries(j.data || {}).forEach(([d, o]) => Object.entries(o || {}).forEach(([k, v]) => push(j.crew, d, k, v)));
      Object.entries(j.crews || {}).forEach(([c, dd]) => Object.entries(dd || {}).forEach(([d, o]) => Object.entries(o || {}).forEach(([k, v]) => push(c, d, k, v))));
    } catch (e) {}
  });
  
  doc.querySelectorAll("[data-k][data-v]").forEach(el => {
    const dn = el.closest("[data-day]"), cn = el.closest("[data-crew]");
    push(cn && cn.getAttribute("data-crew"), el.getAttribute("data-day") != null ? el.getAttribute("data-day") : dn && dn.getAttribute("data-day"), el.getAttribute("data-k"), el.getAttribute("data-v"));
  });
  return rows;
}

function applyRows(rows, tg) {
  const { good, rej } = validateRows(rows, { today: S.today, known: KNOWN(), crew: crewFor(tg), negOk: k => NEGOK.has(k) }),
        by = {};
  let over = 0;
  
  good.forEach(r => {
    const o = by[r.c + "|" + r.d] = by[r.c + "|" + r.d] || { c: r.c, d: r.d, v: {} },
          pv = Store.get(r.c, r.d);
    if (pv && pv.v && pv.v[r.k] != null && pv.v[r.k] !== r.v) over++;
    o.v[r.k] = r.v;
  });
  
  Object.values(by).forEach(o => Store.put(o.c, o.d, { v: o.v }));
  const per = {};
  good.forEach(r => per[r.c] = (per[r.c] || 0) + 1);
  return { per, ok: good.length, days: Object.keys(by).length, over, rej };
}

const impReport = (r, tg) => {
  const j = r.rej,
        x = [
          [j.neg, "con valor negativo (no permitido)"],
          [j.rng, `con día fuera de 0 a ${S.today - 1}`],
          [j.unk, "con parámetro desconocido"],
          [j.bad, "con valor no numérico"],
          [j.crew, tg === "all" ? "sin tripulante o desconocido (con “Los 3 juntos” cada fila debe indicar su tripulante)" : "de otro tripulante o desconocido (solo se cargan las filas de " + crewOf(tg).name + " o sin tripulante)"]
        ].filter(q => q[0]);
  return alertBox(r.ok ? (x.length ? 1 : 0) : 2, `Se cargaron <b>${r.ok}</b> valores en <b>${r.days}</b> día${r.days === 1 ? "" : "s"}${r.over ? ` (${r.over} reemplazaron valores anteriores)` : ""}.` + (tg === "all" && r.ok ? "<br>" + CREW.map(c => c.name + ": " + (r.per[c.id] || 0)).join(" · ") : "") + x.map(q => `<br>${q[0]} ${q[1]}.`).join(""));
};

const histHtml = c => {
  const rows = Object.entries(Store.days(c)).filter(([d, r]) => r.v && Object.keys(r.v).length).sort((a, b) => b[0] - a[0]),
        tot = rows.reduce((s, [d, r]) => s + Object.keys(r.v).length, 0);
  return `<b>Historial de ${esc(crewOf(c).name)}</b> <small style="color:var(--mu)">${rows.length} día${rows.length === 1 ? "" : "s"} · ${tot} valores reales</small>` + (rows.length ? `<div style="overflow-x:auto;max-height:150px;margin-top:6px"><table class="tb"><tr><th>Día</th><th>Valores</th></tr>${rows.slice(0, 10).map(([d, r]) => `<tr><td>${d}</td><td>${Object.keys(r.v).length}</td></tr>`).join("")}</table></div>` : '<p style="color:var(--mu);font-size:13px;margin:6px 0 0">Sin registros reales todavía.</p>');
};

const histFor = t => t === "all" ? CREW.map(c => histHtml(c.id)).join('<hr style="border:0;border-top:1px solid var(--line);margin:10px 0">') : histHtml(t);
const csvCell = x => { x = String(x); return /[",;\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };

function download(name, type, body) {
  const u = URL.createObjectURL(new Blob([body], { type })),
        l = document.createElement("a");
  l.href = u;
  l.download = name;
  document.body.appendChild(l);
  l.click();
  l.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}

function csvExport(tg) {
  const ids = tg === "all" ? CREW.map(c => c.id) : [tg || S.crew],
        L = ["dia,tripulante,parametro,valor"];
  ids.forEach(cid => Object.entries(Store.days(cid)).filter(([d]) => +d < S.today).sort((a, b) => a[0] - b[0]).forEach(([d, r]) => Object.entries(r.v || {}).forEach(([k, v]) => L.push([d, cid, k, v].map(csvCell).join(",")))));
  download(`respaldo_${tg === "all" ? "tripulacion" : tg || S.crew}_dia${S.today}.csv`, "text/csv;charset=utf-8", "\uFEFF" + L.join("\r\n") + "\r\n");
}

function svgExport(tg) {
  tg = tg || S.crew;
  const zs = ZONES.find(z => z.id === S.sel[layer()]) || ZONES.find(z => z.tab === "musculos"),
        pr = zs.p.length ? zs.p[Math.min(S.par[zs.id] || 0, zs.p.length - 1)] : null;
  const of = cid => {
    const o = {};
    Object.entries(Store.days(cid)).forEach(([d, r]) => { if (+d < S.today && r.v && Object.keys(r.v).length) o[d] = r.v; });
    return o;
  };
  const pl = tg === "all" ? { app: "kinesoft-orbital", crews: Object.fromEntries(CREW.map(c => [c.id, of(c.id)])) } : { app: "kinesoft-orbital", crew: tg, data: of(tg) };
  const meta = `<metadata>${esc(JSON.stringify(pl))}</metadata><desc>Formato: data = {día: {zona.parametro: valor}}. Solo se leen días anteriores al día ${S.today}.</desc>`,
        ch = pr ? lineChartRaw(zs, pr, { w: 560, h: 220 }) : '<svg viewBox="0 0 560 220"></svg>';
  download(`respaldo_${tg === "all" ? "tripulacion" : tg}_dia${S.today}.svg`, "image/svg+xml", ch.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/<svg[^>]*>/, m => m + meta));
}

const readText = f => f.text ? f.text() : new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => no(new Error("no se pudo leer el archivo"));
  r.readAsText(f);
});

async function loadFile(f) {
  const res = $("res");
  if (!f) return;
  res.innerHTML = alertBox(1, "Leyendo " + esc(f.name) + "…");
  try {
    const txt = await readText(f),
          csv = /\.csv$/i.test(f.name) || /csv/.test(f.type);
    let rows;
    if (csv) {
      const tb = tableToRows(csvParse(txt));
      if (tb.err) return res.innerHTML = alertBox(2, esc(tb.err));
      rows = tb.rows;
    } else {
      rows = svgParse(txt);
      if (!rows) return res.innerHTML = alertBox(2, "El archivo no es un SVG válido. Si es una tabla, usa .csv.");
    }
    if (!rows.length) return res.innerHTML = alertBox(1, "El archivo no trae datos que leer.");
    res.innerHTML = impReport(applyRows(rows, upTarget), upTarget);
    $("hist").innerHTML = histFor(upTarget);
  } catch (e) {
    res.innerHTML = alertBox(2, "No se pudo leer el archivo: " + esc(e.message));
  }
}

let upTarget = S.crew;
function openUpload() {
  const t = S.today;
  upTarget = S.crew;
  openDlg(head("Cargar días anteriores", "Archivo SVG or CSV con días de 0 a " + (t - 1) + ".") +
    `<div class="row" id="ups" style="margin-bottom:10px"><b style="font-size:13px">Cargar para:</b>${CREW.map(c => `<button type="button" class="chip ${c.id === upTarget ? "on" : ""}" data-up="${c.id}">${esc(c.name)}</button>`).join("")}<button type="button" class="chip" data-up="all">Los 3 juntos</button></div>
    <div class="row"><label class="btn" for="upf" style="cursor:pointer">Elegir archivo (.svg o .csv)</label><input type="file" id="upf" accept=".svg,.csv,image/svg+xml,text/csv" style="position:absolute;width:1px;height:1px;opacity:0">
    <button type="button" class="btn o sm" id="csvx">Plantilla CSV</button><button type="button" class="btn o sm" id="svgx">Plantilla SVG</button></div>
    <div id="drop" style="margin:10px 0;padding:14px;border:1px dashed var(--line);border-radius:12px;text-align:center;color:var(--mu);font-size:13px">o arrastra aquí el archivo</div>
    <details><summary>Formato aceptado</summary><p><b style="color:var(--tx)">CSV</b>: <code>dia,tripulante,parametro,valor</code>.</p><p><b style="color:var(--tx)">SVG</b>: <code>&lt;metadata&gt;</code> con JSON.</p></details>
    <div id="res"></div><div id="hist" style="margin-top:10px">${histHtml(S.crew)}</div>` + foot());
  
  $("upf").onchange = e => { loadFile(e.target.files[0]); e.target.value = ""; };
  $("csvx").onclick = () => csvExport(upTarget);
  $("svgx").onclick = () => svgExport(upTarget);
  
  $("ups").onclick = e => {
    const b = e.target.closest("[data-up]");
    if (!b) return;
    upTarget = b.dataset.up;
    $("ups").querySelectorAll("[data-up]").forEach(x => x.classList.toggle("on", x === b));
    $("hist").innerHTML = histFor(upTarget);
    $("res").innerHTML = "";
  };

  const dz = $("drop");
  dz.ondragover = e => { e.preventDefault(); dz.style.borderColor = "var(--ac)"; };
  dz.ondragleave = () => { dz.style.borderColor = ""; };
  dz.ondrop = e => { e.preventDefault(); dz.style.borderColor = ""; loadFile(e.dataTransfer.files[0]); };
}

/* ==========================================================================
   Sistema de gestión de alertas dinámicas (amarilla y roja)
   ========================================================================== */
let activeAlertTarget = null;
let lastAlertSignature = "";
let yellowToastTimer = null;

function checkAndTriggerAlerts(force = false) {
  const al = Engine.alerts();
  const toastEl = $("alert-toast-yellow");
  const overlayEl = $("danger-modal-overlay");

  if (!al.length) {
    lastAlertSignature = "";
    if (toastEl) toastEl.classList.remove("on");
    if (overlayEl) overlayEl.classList.remove("on");
    return;
  }

  const redAlert = al.find(a => a.r.s === 2);
  const yellowAlert = al.find(a => a.r.s === 1);
  const target = redAlert || yellowAlert;

  const sig = `${S.crew}|${S.day}|${S.env}|${target.z.id}.${target.r.p.id}|${target.r.s}`;
  if (!force && sig === lastAlertSignature) return;
  lastAlertSignature = sig;

  if (redAlert) {
    triggerRedAlert(redAlert);
  } else if (yellowAlert) {
    triggerYellowAlert(yellowAlert);
  }
}

function triggerYellowAlert(alertObj) {
  const toastEl = $("alert-toast-yellow");
  const overlayEl = $("danger-modal-overlay");
  if (!toastEl) return;

  if (overlayEl) overlayEl.classList.remove("on");
  activeAlertTarget = alertObj;

  toastEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span>⚠ PRECAUCIÓN [NIVEL AMARILLO]</span>
      <span style="font-size:11px;opacity:0.8;">Ir →</span>
    </div>
    <div style="font-weight:500;">
      ${esc(alertObj.z.n)} · ${esc(alertObj.r.p.n)}: 
      <span class="mono">${fmt(alertObj.r.p, alertObj.r.v)} ${esc(alertObj.r.p.u)}</span>
    </div>
  `;
  toastEl.classList.add("on");

  clearTimeout(yellowToastTimer);
  yellowToastTimer = setTimeout(() => {
    toastEl.classList.remove("on");
  }, 6500);
}

function triggerRedAlert(alertObj) {
  const overlayEl = $("danger-modal-overlay");
  const toastEl = $("alert-toast-yellow");
  const msgEl = $("danger-msg");
  if (!overlayEl || !msgEl) return;

  if (toastEl) toastEl.classList.remove("on");
  activeAlertTarget = alertObj;

  msgEl.innerHTML = `
    Parámetro crítico detectado en <b>${esc(alertObj.z.n)}</b> (${esc(alertObj.r.p.n)}): 
    <span class="mono" style="color:var(--bad);font-weight:700;">
      ${fmt(alertObj.r.p, alertObj.r.v)} ${esc(alertObj.r.p.u)}
    </span>
  `;

  document.body.classList.remove("screen-red-flash");
  void document.body.offsetWidth;
  document.body.classList.add("screen-red-flash");
  overlayEl.classList.add("on");

  setTimeout(() => {
    document.body.classList.remove("screen-red-flash");
  }, 1800);
}

document.addEventListener("click", e => {
  if (e.target.closest("#danger-close-btn")) {
    e.stopPropagation();
    const overlayEl = $("danger-modal-overlay");
    if (overlayEl) overlayEl.classList.remove("on");
    activeAlertTarget = null;
    return;
  }

  if (e.target.closest("#alert-toast-yellow") && activeAlertTarget) {
    const target = activeAlertTarget;
    $("alert-toast-yellow").classList.remove("on");
    Nav.go({
      tab: target.z.tab,
      z: target.z.id,
      p: target.r.p.id
    });
    activeAlertTarget = null;
    return;
  }

  if (e.target.closest("#danger-card-action") && activeAlertTarget) {
    const target = activeAlertTarget;
    $("danger-modal-overlay").classList.remove("on");
    Nav.go({
      tab: target.z.tab,
      z: target.z.id,
      p: target.r.p.id
    });
    activeAlertTarget = null;
  }
});
