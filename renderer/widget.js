const Q = new URLSearchParams(location.search);
const id = Q.get('id');
const root = document.getElementById('root');
let w = null, timers = [];
const h = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const svg = (s) => { const d = document.createElement('div'); d.innerHTML = s.trim(); return d.firstChild; };
// los temporizadores no trabajan mientras el widget está tapado (Windows marca la ventana como oculta)
const every = (fn, ms) => { fn(); timers.push(setInterval(() => { if (!document.hidden) fn(); }, ms)); };
const fmt = (n) => (n == null ? '—' : n >= 100000 ? (n / 1000).toFixed(0) + 'k' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009'));
const MARK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="8" r="2.4"/><path d="M6 8.4v7.2M18 10.4c0 4-6 3.2-10.4 6.4"/></svg>';
const LANG_COLORS = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5', Java: '#b07219', C: '#555555', 'C++': '#f34b7d',
  'C#': '#178600', HTML: '#e34c26', CSS: '#663399', Go: '#00add8', Rust: '#dea584', PHP: '#4f5d95', Ruby: '#701516', Kotlin: '#a97bff',
  Swift: '#f05138', Dart: '#00b4ab', Shell: '#89e051', Vue: '#41b883', 'Jupyter Notebook': '#da5b0b', PowerShell: '#012456' };
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const BARE = { clock: ['giant', 'text'] };
function theme() {
  const b = document.body;
  const st = w.opts?.style;
  b.className = `t-${w.theme || 'dark'} p-${w.opts?.palette || 'green'} mat-${w.material || 'none'}` + (Q.get('real') === '1' ? ' real' : '') + (w.locked ? ' locked' : '') +
    ((BARE[w.type] || []).includes(st) ? ' bare' : '') + (w.type === 'photos' || w.type === 'html' ? ' photo-only' : '') + (st === 'mini' ? ' mini' : '');
  const panel = document.getElementById('panel');
  panel.querySelector('.rbar')?.remove();
  if (w.theme === 'retro') { // ventana de 8 bits
    const bar = h('div', 'rbar');
    bar.append(h('span', '', w.opts?.title || ({ pomodoro: 'pomodoro.exe', notes: 'notas.txt', clock: 'reloj' }[w.type] || w.type)), h('i', '', '_'), h('i', '', '□'), h('i', '', '×'));
    panel.prepend(bar);
  }
  glass();
  document.documentElement.style.setProperty('--op', w.opacity ?? 0.82);
  document.documentElement.style.setProperty('--ac', w.accent || '#0a84ff');
}
// ---------- vidrio: dibuja TU fondo de pantalla desenfocado justo detrás del widget
let wallSmall = null, wallInfo = null, winPos = { x: window.screenX, y: window.screenY };
async function wallBlur() {
  wallInfo = await api.wall.get();
  if (!wallInfo.url) { wallSmall = null; return; }
  const img = new Image();
  img.src = wallInfo.url;
  try { await img.decode(); } catch (_) { wallSmall = null; return; }
  // reducir a 1/12 y desenfocar: barato en CPU/GPU y al ampliarse queda como vidrio esmerilado
  const c = document.createElement('canvas');
  c.width = 240; c.height = Math.round(240 * img.naturalHeight / img.naturalWidth);
  const x = c.getContext('2d');
  x.filter = 'blur(3px) saturate(1.5)';
  x.drawImage(img, -6, -6, c.width + 12, c.height + 12);
  wallSmall = c.toDataURL('image/jpeg', 0.85);
}
async function glass() {
  const panel = document.getElementById('panel');
  let g = document.getElementById('glass');
  if (w.material !== 'glass') { g?.remove(); return; }
  if (!wallSmall) await wallBlur();
  if (!wallSmall) return;
  if (!g) { g = h('div'); g.id = 'glass'; panel.prepend(g); }
  g.style.backgroundImage = `url("${wallSmall}")`;
  placeGlass();
}
function placeGlass() {
  const g = document.getElementById('glass');
  if (!g || !wallInfo) return;
  const cx = winPos.x + innerWidth / 2, cy = winPos.y + innerHeight / 2;
  const d = wallInfo.displays.find((b) => cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height) || wallInfo.displays[0];
  const pr = document.getElementById('panel').getBoundingClientRect();
  Object.assign(g.style, { left: d.x - winPos.x - pr.left + 'px', top: d.y - winPos.y - pr.top + 'px', width: d.width + 'px', height: d.height + 'px' });
}
api.desk.onBounds((b) => { winPos = b; placeGlass(); });
api.wall.onChange(async () => { wallSmall = null; await glass(); });
window.addEventListener('resize', placeGlass);

const msg = (t) => root.replaceChildren(h('div', 'center mut', t));
const needUser = () => msg('Escribe tu usuario de GitHub en FolderGlow → Widgets.');
const skeleton = (n = 3) => root.replaceChildren(...Array.from({ length: n }, (_, i) => { const s = h('div', 'sk'); s.style.height = i ? '14px' : '20px'; s.style.width = 90 - i * 15 + '%'; return s; }));

function ghWidget(draw) {
  const u = w.opts.user;
  if (!u) return needUser();
  skeleton();
  every(async () => {
    const d = await api.data.github(u);
    if (d.error) return msg('No se pudo cargar: ' + d.error);
    draw(d);
  }, 30 * 60 * 1000);
}
const level = (x) => (x.l ? 'l' + x.l : '');

function ring(label, pct, sub) {
  const r = 31, c = 2 * Math.PI * r;
  const el = h('div', 'ring');
  el.innerHTML = `<svg viewBox="0 0 78 78"><circle class="bg" cx="39" cy="39" r="${r}"/><circle class="fg" cx="39" cy="39" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg><div class="v">–</div><div class="cap">${label}</div>`;
  const fg = el.querySelector('.fg'), v = el.querySelector('.v');
  el.set = (p, text) => { fg.style.strokeDashoffset = c * (1 - Math.max(0, Math.min(100, p)) / 100); v.textContent = text ?? Math.round(p) + '%'; };
  if (pct != null) el.set(pct, sub);
  return el;
}

const WMO = (c, day = 1) => (c === 0 ? (day ? ['☀️', 'Despejado'] : ['🌙', 'Despejado']) : c <= 2 ? ['🌤️', 'Parcial'] : c === 3 ? ['☁️', 'Nublado']
  : c <= 48 ? ['🌫️', 'Niebla'] : c <= 57 ? ['🌦️', 'Llovizna'] : c <= 67 ? ['🌧️', 'Lluvia'] : c <= 77 ? ['🌨️', 'Nieve']
    : c <= 82 ? ['🌧️', 'Chubascos'] : ['⛈️', 'Tormenta']);

const R = {
  clock() {
    const st = w.opts.style;
    const tm = (n, sec) => `${String(w.opts.format24 === false ? (n.getHours() % 12 || 12) : n.getHours()).padStart(st === 'bento' || st === 'retro' ? 2 : 1, '0')}:${String(n.getMinutes()).padStart(2, '0')}` + (sec ? `:${String(n.getSeconds()).padStart(2, '0')}` : '');
    if (['ipad', 'giant', 'bento', 'text', 'retro'].includes(st)) {
      const box = h('div', 'ck-' + st), t = h('div', 't'), d = h('div', 'd');
      if (st === 'giant') box.append(d, t); else if (st === 'ipad' || st === 'retro') box.append(t); else box.append(t, d);
      if (st === 'ipad' || st === 'retro') { box.textContent = ''; }
      root.append(box);
      every(() => {
        const n = new Date();
        const txt = tm(n, w.opts.showSeconds);
        if (st === 'ipad' || st === 'retro') box.textContent = txt; else t.textContent = txt;
        d.textContent = st === 'bento' ? n.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' })
          : st === 'giant' ? n.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/^\w/, (c) => c.toUpperCase())
            : n.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, (c) => c.toUpperCase());
      }, w.opts.showSeconds ? 1000 : 10000);
      return;
    }
    if (st === 'analog') {
      const s = svg(`<svg class="analog" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="none" stroke="var(--ln)" stroke-width="2"/>
        ${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="7" x2="50" y2="${i % 3 ? 11 : 14}" stroke="var(--mt)" stroke-width="${i % 3 ? 1.5 : 2.5}" stroke-linecap="round" transform="rotate(${i * 30} 50 50)"/>`).join('')}
        <line id="hh" x1="50" y1="50" x2="50" y2="27" stroke="var(--tx)" stroke-width="4" stroke-linecap="round"/>
        <line id="mm" x1="50" y1="50" x2="50" y2="15" stroke="var(--tx)" stroke-width="3" stroke-linecap="round"/>
        <line id="ss" x1="50" y1="56" x2="50" y2="12" stroke="var(--ac)" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="50" cy="50" r="3" fill="var(--ac)"/></svg>`);
      root.append(s);
      const [hh, mm, ss] = ['#hh', '#mm', '#ss'].map((q) => s.querySelector(q));
      if (!w.opts.showSeconds) ss.style.display = 'none';
      every(() => {
        const n = new Date(), m = n.getMinutes() + n.getSeconds() / 60;
        hh.setAttribute('transform', `rotate(${(n.getHours() % 12) * 30 + m / 2} 50 50)`);
        mm.setAttribute('transform', `rotate(${m * 6} 50 50)`);
        ss.setAttribute('transform', `rotate(${n.getSeconds() * 6} 50 50)`);
      }, w.opts.showSeconds ? 1000 : 20000);
      return;
    }
    const box = h('div', 'clock'), t = h('div', 'big'), d = h('div', 'date');
    box.append(t, d); root.append(box);
    every(() => {
      const n = new Date();
      let hr = n.getHours(), suf = '';
      if (!w.opts.format24) { suf = hr < 12 ? 'a. m.' : 'p. m.'; hr = hr % 12 || 12; }
      t.textContent = `${String(hr).padStart(w.opts.format24 ? 2 : 1, '0')}:${String(n.getMinutes()).padStart(2, '0')}` +
        (w.opts.showSeconds ? `:${String(n.getSeconds()).padStart(2, '0')}` : '');
      if (suf) t.append(h('small', '', suf));
      d.textContent = n.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    }, w.opts.showSeconds ? 1000 : 10000);
  },

  calendar() {
    every(() => {
      const n = new Date(), y = n.getFullYear(), m = n.getMonth();
      const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
      const head = h('div', 'spread'); head.append(h('div', 'ttl', MONTHS[m]), h('div', 'cap', String(y)));
      const g = h('div', 'cal');
      WD.forEach((d) => g.append(h('b', '', d)));
      for (let i = first - 1; i >= 0; i--) g.append(h('span', 'o', prevDays - i));
      for (let d = 1; d <= days; d++) g.append(h('span', d === n.getDate() ? 'today' : '', d));
      const rest = (7 - ((first + days) % 7)) % 7;
      for (let d = 1; d <= rest; d++) g.append(h('span', 'o', d));
      root.replaceChildren(head, g);
    }, 60 * 60 * 1000);
  },

  system() {
    const rs = [ring('CPU'), ring('RAM'), ring('Disco')];
    const box = h('div', 'rings'); box.append(...rs);
    const cap = h('div', 'cap');
    cap.style.textAlign = 'center';
    root.append(box, cap);
    every(async () => {
      const s = await api.widgets.sys();
      rs[0].set(s.cpu); rs[1].set(s.ram);
      s.disk == null ? rs[2].set(0, '—') : rs[2].set(s.disk);
      cap.textContent = `${s.ramGB} GB RAM · encendido ${Math.floor(s.up / 3600)} h ${Math.floor((s.up % 3600) / 60)} min`;
    }, 2500);
  },

  async battery() {
    if (!navigator.getBattery) return msg('Este equipo no informa batería.');
    const b = await navigator.getBattery();
    const r = ring(''), cap = h('div', 'cap');
    const box = h('div', 'center'); box.append(r, cap); root.append(box);
    const up = () => {
      r.set(b.level * 100);
      cap.textContent = b.charging ? '⚡ Cargando' : b.dischargingTime !== Infinity ? `${Math.round(b.dischargingTime / 60)} min restantes` : 'Con batería';
    };
    ['levelchange', 'chargingchange', 'dischargingtimechange'].forEach((e) => b.addEventListener(e, up));
    up();
  },

  weather() {
    skeleton();
    every(async () => {
      const d = await api.data.weather(w.opts.city || 'Lima');
      if (d.error) return msg(d.error);
      const [ic, txt] = WMO(d.cur.weather_code, d.cur.is_day);
      const top = h('div', 'spread'); top.append(h('div', 'ttl', d.place), h('div', 'cap', txt));
      const main = h('div', 'wx'); main.append(h('div', 'ic', ic), h('div', 't', Math.round(d.cur.temperature_2m) + '°'));
      const det = h('div', 'cap', `Sensación ${Math.round(d.cur.apparent_temperature)}° · 💧 ${d.cur.relative_humidity_2m}% · 💨 ${Math.round(d.cur.wind_speed_10m)} km/h`);
      const days = h('div', 'days');
      d.daily.time.slice(1, 5).forEach((t, i) => {
        const x = h('div');
        x.append(h('span', 'mut', new Date(t + 'T12:00').toLocaleDateString('es-PE', { weekday: 'short' })),
          h('span', '', WMO(d.daily.weather_code[i + 1])[0]), h('span', '', `${Math.round(d.daily.temperature_2m_max[i + 1])}° ${Math.round(d.daily.temperature_2m_min[i + 1])}°`));
        days.append(x);
      });
      root.replaceChildren(top, main, det, days);
    }, 20 * 60 * 1000);
  },

  notes() {
    const t = document.createElement('textarea');
    t.value = w.opts.text || ''; t.placeholder = 'Escribe tus notas…';
    let to;
    t.oninput = () => { clearTimeout(to); to = setTimeout(() => api.widgets.update(id, { opts: { text: t.value } }), 500); };
    root.append(t);
  },

  pomodoro() {
    let phase = 'work', left = w.opts.work * 60, tick = null;
    const r = ring(''), lab = h('div', 'cap', 'Enfoque'), row = h('div', 'row');
    const go = h('button', 'pri', 'Iniciar'), rs = h('button', '', 'Reiniciar');
    row.append(go, rs);
    const box = h('div', 'center'); box.append(r, lab, row); root.append(box);
    const total = () => (phase === 'work' ? w.opts.work : w.opts.rest) * 60;
    const draw = () => r.set((100 * left) / total(), `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    const stop = () => { clearInterval(tick); tick = null; go.textContent = 'Iniciar'; };
    go.onclick = () => {
      if (tick) return stop();
      go.textContent = 'Pausa';
      tick = setInterval(() => {
        if (--left > 0) return draw();
        phase = phase === 'work' ? 'rest' : 'work';
        left = total(); lab.textContent = phase === 'work' ? 'Enfoque' : 'Descanso';
        new Notification('FolderGlow', { body: phase === 'work' ? 'A enfocarse 💪' : 'Tómate un descanso ☕', silent: false });
        draw();
      }, 1000);
    };
    rs.onclick = () => { stop(); phase = 'work'; left = total(); lab.textContent = 'Enfoque'; draw(); };
    draw();
  },

  ghcontrib() {
    ghWidget((d) => {
      const c = d.contrib;
      if (!c.days.length) return msg('GitHub no devolvió el calendario de contribuciones.');
      const grid = h('div', 'heat');
      const G = 3, availW = root.clientWidth || w.w - 52, availH = (root.clientHeight || w.h - 48) - 30;
      const cell = Math.max(6, Math.min(16, Math.floor((availH - 6 * G) / 7)));
      const weeks = Math.max(8, Math.floor((availW + G) / (cell + G)));
      grid.style.cssText = `grid-template-columns:repeat(${weeks},${cell}px);grid-template-rows:repeat(7,${cell}px);gap:${G}px`;
      const lastDay = new Date(c.days[c.days.length - 1].d + 'T12:00').getDay();
      const take = (weeks - 1) * 7 + lastDay + 1;
      const days = c.days.slice(-take); // empieza en domingo, como GitHub
      for (let i = days.length; i < take; i++) grid.append(h('i'));
      days.forEach((x) => { const i = h('i', level(x)); i.title = `${x.c} contribuciones · ${x.d}`; grid.append(i); });
      const foot = h('div', 'foot');
      foot.append(h('span', '', `🔥 ${c.streak} días de racha`), h('span', 'plus', `+${fmt(c.total)} contribuciones`));
      root.replaceChildren(grid, foot);
    });
  },

  ghstats() {
    ghWidget((d) => {
      const head = h('div', 'ttl');
      head.append(h('span', '', `${d.name || d.login} · GitHub Stats`), svg(MARK));
      head.style.justifyContent = 'space-between';
      const g = h('div', 'stats');
      const yy = String(d.year).slice(2);
      [['⭐', 'Estrellas', d.stars], ['🔥', 'Racha', d.contrib.streak + 'd'], ['🕐', `Commits ('${yy})`, fmt(d.commits)],
        ['🏆', 'Mejor racha', d.contrib.longest + 'd'], ['📅', 'Contribuciones', fmt(d.contrib.total)], ['📦', 'Repos públicos', d.repos],
        ['🔀', 'Pull requests', fmt(d.prs)], ['👥', 'Seguidores', fmt(d.followers)]]
        .forEach(([e, k, v]) => { const s = h('div', 'stat'); s.append(h('span', 'e', e), h('span', 'k', k), h('span', 'v', v)); g.append(s); });
      root.replaceChildren(head, g);
    });
  },

  ghmonth() {
    ghWidget((d) => {
      const n = new Date(), y = n.getFullYear(), m = n.getMonth();
      const map = Object.fromEntries(d.contrib.days.map((x) => [x.d, x]));
      const head = h('div', 'spread'); head.append(h('div', 'ttl', MONTHS[m]), svg(MARK));
      const g = h('div', 'month');
      WD.forEach((x) => g.append(h('b', '', x)));
      const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      for (let i = 0; i < first; i++) g.append(h('i', 'x'));
      for (let dd = 1; dd <= days; dd++) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        const x = map[key];
        const i = h('i', dd > n.getDate() ? 'f' : x ? level(x) : '');
        if (x) i.title = `${x.c} contribuciones`;
        g.append(i);
      }
      root.replaceChildren(head, g);
    });
  },

  ghlangs() {
    ghWidget((d) => {
      if (!d.langs.length) return msg('Sin lenguajes detectados.');
      const head = h('div', 'ttl'); head.append(h('span', '', '💻 Lenguajes principales'));
      const bar = h('div', 'lbar'), leg = h('div', 'legend');
      d.langs.forEach((l, i) => {
        const col = LANG_COLORS[l.n] || ['#8b949e', '#a371f7', '#3fb950', '#f778ba', '#79c0ff', '#ffa657'][i % 6];
        const seg = h('i'); seg.style.cssText = `flex:${l.p};background:${col}`; bar.append(seg);
        const it = h('div'), dot = h('span', 'dot'); dot.style.background = col;
        it.append(dot, h('span', '', `${l.n}`), h('span', 'mut', `${l.p}%`)); leg.append(it);
      });
      root.replaceChildren(head, bar, leg);
    });
  },

  ghprofile() {
    ghWidget((d) => {
      const head = h('div', 'gh'), info = h('div');
      const av = new Image(); av.src = d.avatar; av.alt = '';
      info.append(h('b', '', d.name || d.login), h('span', 'cap', '@' + d.login));
      head.append(av, info);
      const nums = h('div', 'nums');
      [['Repos', d.repos], ['Seguidores', d.followers], ['Estrellas', d.stars]].forEach(([l, v]) => {
        const x = h('div', 'cap', l); x.prepend(h('b', '', fmt(v))); nums.append(x);
      });
      const list = h('div', 'grow');
      d.recent.forEach((r) => { const row = h('div', 'repo'); row.append(h('span', '', r.n), h('span', 'mut', '★ ' + r.s)); list.append(row); });
      root.replaceChildren(head, nums, list);
    });
  },
};


// ======================= v2.4: estilos nuevos y widgets nuevos =======================
const SV = (d, s = 18) => svg(`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`);
const ICON = {
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  ram: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11v2M10 11v2M14 11v2M18 11v2"/>',
  disk: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>',
  bat: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/>',
  prev: '<path d="M19 20 9 12l10-8zM5 19V5"/>', next: '<path d="m5 4 10 8-10 8zM19 5v14"/>', play: '<path d="m6 4 14 8-14 8z" fill="currentColor"/>', pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', sleep: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', logoff: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
};
const fmtRate = (b) => (b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB/s' : Math.round(b / 1024) + ' KB/s');

const _weather = R.weather, _battery = R.battery, _system = R.system, _pomodoro = R.pomodoro;
R.weather = function () {
  const st = w.opts.style;
  if (st !== 'ipad' && st !== 'bento') return _weather();
  skeleton();
  every(async () => {
    const d = await api.data.weather(w.opts.city || 'Lima');
    if (d.error) return msg(d.error);
    const [ic, txt] = WMO(d.cur.weather_code, d.cur.is_day);
    if (st === 'bento') {
      const box = h('div', 'wxb'), info = h('div');
      info.append(h('div', 'ttl', txt), h('div', 'cap', `${d.place} · máx ${Math.round(d.daily.temperature_2m_max[0])}° mín ${Math.round(d.daily.temperature_2m_min[0])}°`));
      box.append(h('div', 'ic', ic), info, h('div', 't', Math.round(d.cur.temperature_2m) + '°C'));
      return root.replaceChildren(box);
    }
    const box = h('div', 'wxi'), top = h('div', 'top'), l = h('div'), r = h('div');
    l.append(h('div', 'ttl', d.place + ' ➤'), h('div', 't', Math.round(d.cur.temperature_2m) + '°'));
    r.style.textAlign = 'right';
    r.append(h('div', '', ic), h('div', 'cap', txt), h('div', 'cap', `Máx ${Math.round(d.daily.temperature_2m_max[0])}° Mín ${Math.round(d.daily.temperature_2m_min[0])}°`));
    top.append(l, r);
    const hrs = h('div', 'hrs');
    (d.hourly?.time || []).slice(0, 6).forEach((t, i) => {
      const x = h('div');
      x.append(h('span', 'cap', new Date(t).getHours() + ' h'), h('span', '', WMO(d.hourly.weather_code[i])[0]), h('span', '', Math.round(d.hourly.temperature_2m[i]) + '°'));
      hrs.append(x);
    });
    box.append(top, hrs);
    const lo = Math.min(...d.daily.temperature_2m_min), hi = Math.max(...d.daily.temperature_2m_max);
    const fit = Math.max(0, Math.min(4, Math.floor((innerHeight - 196) / 22)));
    d.daily.time.slice(1, 1 + fit).forEach((t, i) => {
      const k = i + 1, row = h('div', 'row'), bar = h('div', 'bar'), fill = h('i');
      fill.style.left = (100 * (d.daily.temperature_2m_min[k] - lo)) / (hi - lo || 1) + '%';
      fill.style.right = 100 - (100 * (d.daily.temperature_2m_max[k] - lo)) / (hi - lo || 1) + '%';
      bar.append(fill);
      row.append(h('span', '', new Date(t + 'T12:00').toLocaleDateString('es-PE', { weekday: 'short' })), h('span', '', WMO(d.daily.weather_code[k])[0]),
        h('span', 'cap', Math.round(d.daily.temperature_2m_min[k]) + '°'), bar, h('span', '', Math.round(d.daily.temperature_2m_max[k]) + '°'));
      box.append(row);
    });
    root.replaceChildren(box);
  }, 20 * 60 * 1000);
};

R.battery = async function () {
  const st = w.opts.style;
  if (st !== 'rings' && st !== 'icon') return _battery();
  const b = navigator.getBattery ? await navigator.getBattery() : null;
  if (st === 'icon') {
    const box = h('div', 'batt'), cell = h('div', 'cell'), fill = h('i'), lab = h('div', 'ttl');
    cell.append(fill); box.append(cell, lab); root.append(box);
    const up = () => { const p = b ? Math.round(b.level * 100) : 100; fill.style.width = p + '%'; lab.textContent = (b?.charging ? '⚡ ' : '') + p + '%'; };
    b?.addEventListener('levelchange', up); b?.addEventListener('chargingchange', up); up();
    return;
  }
  const rs = [ring('Batería'), ring('CPU'), ring('RAM')];
  const box = h('div', 'rings'); box.append(...rs); root.append(box);
  every(async () => {
    const s = await api.widgets.sys();
    rs[0].set(b ? b.level * 100 : 100, b ? Math.round(b.level * 100) + '%' : 'AC');
    rs[1].set(s.cpu); rs[2].set(s.ram);
  }, 4000);
};

R.system = function () {
  const st = w.opts.style;
  if (st === 'bars') {
    const box = h('div', 'bars'), rows = {};
    for (const [k, ic] of [['cpu', 'cpu'], ['ram', 'ram'], ['disk', 'disk'], ['bat', 'bat']]) {
      const row = h('div', 'b'), tr = h('div', 'tr'), f = h('i');
      tr.append(f); row.append(SV(ICON[ic], 16), tr); rows[k] = f; box.append(row);
    }
    root.append(box);
    let bat = null;
    navigator.getBattery?.().then((b) => { bat = b; });
    return every(async () => {
      const s = await api.widgets.sys();
      rows.cpu.style.width = s.cpu + '%'; rows.ram.style.width = s.ram + '%'; rows.disk.style.width = (s.disk || 0) + '%';
      rows.bat.style.width = (bat ? bat.level * 100 : 100) + '%';
    }, 2500);
  }
  if (st === 'ram') {
    const r = ring('RAM'), box = h('div', 'center'); box.append(r); root.append(box);
    return every(async () => { const s = await api.widgets.sys(); r.set(s.ram); }, 3000);
  }
  if (st === 'donuts') {
    const head = h('div', 'sec'); head.append(SV(ICON.disk, 14), h('span', '', 'Uso'));
    const grid = h('div', 'donuts');
    const mk = (label) => {
      const el = h('div', 'donut');
      el.innerHTML = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="25" stroke="var(--ln)"/><circle class="u" cx="32" cy="32" r="25" stroke="var(--ac)" stroke-dasharray="157" stroke-dashoffset="157" style="transition:stroke-dashoffset .6s var(--ease)"/></svg><div class="lg"><b>${label}</b><span class="f"></span><br><span class="us"></span></div>`;
      el.set = (used) => { el.querySelector('.u').style.strokeDashoffset = 157 * (1 - used / 100); el.querySelector('.f').textContent = `Libre ${100 - used}%`; el.querySelector('.us').textContent = `Usado ${used}%`; };
      return el;
    };
    const dd = mk('Disco'), rr = mk('RAM');
    grid.append(dd, rr); root.append(head, grid);
    return every(async () => { const s = await api.widgets.sys(); dd.set(s.disk || 0); rr.set(s.ram); }, 4000);
  }
  return _system();
};

R.pomodoro = function () {
  if (w.theme !== 'retro') return _pomodoro();
  let phase = 'work', left = w.opts.work * 60, tick = null;
  const box = h('div', 'center'), t = h('div', 'ck-retro'), bar = h('div', 'pixbar'), lab = h('div', 'cap', '¡a enfocarse!');
  t.style.height = 'auto'; t.style.fontSize = 'min(30vh, 18vw)';
  bar.style.width = '90%';
  const cells = Array.from({ length: 16 }, () => h('i')); bar.append(...cells);
  const row = h('div', 'row'), go = h('button', 'pri', '▶ INICIAR'), rs = h('button', '', '↺');
  row.append(go, rs); box.append(lab, t, bar, row); root.append(box);
  const total = () => (phase === 'work' ? w.opts.work : w.opts.rest) * 60;
  const draw = () => {
    t.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    const on = Math.round(16 * (1 - left / total()));
    cells.forEach((c, i) => c.classList.toggle('on', i < on));
  };
  const stop = () => { clearInterval(tick); tick = null; go.textContent = '▶ INICIAR'; };
  go.onclick = () => {
    if (tick) return stop();
    go.textContent = '❚❚ PAUSA';
    tick = setInterval(() => {
      if (--left > 0) return draw();
      phase = phase === 'work' ? 'rest' : 'work'; left = total();
      lab.textContent = phase === 'work' ? '¡a enfocarse!' : 'toma agua y descansa la vista';
      new Notification('FolderGlow', { body: phase === 'work' ? 'A enfocarse 💪' : 'Toma un descanso ☕' });
      draw();
    }, 1000);
  };
  rs.onclick = () => { stop(); phase = 'work'; left = total(); draw(); };
  draw();
};

R.music = function () {
  const v = innerHeight > innerWidth * 0.85;
  const box = h('div', 'mu' + (v ? ' v' : '')), art = h('div', 'art'), info = h('div', 'info');
  const ti = h('b', '', 'Nada sonando'), ar = h('div', 'cap', 'Abre Spotify, YouTube o tu reproductor'), prog = h('div', 'prog'), pf = h('i');
  prog.append(pf);
  const ctl = h('div', 'ctl');
  const bt = (ic, cmd, cls) => { const b = h('button', cls || ''); b.append(SV(ICON[ic], cls ? 18 : 16)); b.onclick = () => upd(cmd); return b; };
  const pp = bt('play', 'toggle', 'pp');
  ctl.append(bt('prev', 'prev'), pp, bt('next', 'next'));
  info.append(ti, ar, prog, ctl);
  box.append(art, info); root.append(box);
  let last = 0;
  async function upd(cmd = 'get') {
    const m = await api.desk.media(cmd);
    if (m.none || !m.title) { ti.textContent = 'Nada sonando'; ar.textContent = 'Abre Spotify, YouTube o tu reproductor'; art.style.backgroundImage = ''; pf.style.width = '0'; return; }
    ti.textContent = m.title; ar.textContent = m.artist || m.app || '';
    if (m.thumb) art.style.backgroundImage = `url("${m.thumb}")`;
    pf.style.width = m.dur ? (100 * m.pos) / m.dur + '%' : '0';
    pp.replaceChildren(SV(ICON[m.playing ? 'pause' : 'play'], 18));
    last = Date.now();
  }
  every(() => upd('get'), 3000);
};

R.photos = async function () {
  if (!w.opts.folder) {
    const b = h('button', 'pri', 'Elegir carpeta de fotos');
    b.onclick = async () => { const f = await api.desk.pickImage(true); if (f) api.widgets.update(id, { opts: { folder: f } }); };
    const box = h('div', 'center'); box.append(h('div', 'ttl', '🖼️ Fotos'), b); return root.append(box);
  }
  const list = await api.desk.photos(w.opts.folder);
  if (!list.length) return msg('Esa carpeta no tiene imágenes.');
  const ph = h('div', 'ph'); root.append(ph);
  let i = Math.floor(Math.random() * list.length), cur = null;
  every(() => {
    const im = new Image(); im.src = list[i++ % list.length]; im.decoding = 'async';
    im.onload = () => { ph.append(im); requestAnimationFrame(() => im.classList.add('on')); const old = cur; cur = im; if (old) setTimeout(() => old.remove(), 1000); };
  }, Math.max(4, w.opts.every || 12) * 1000);
};

R.appfolder = async function () {
  const st = w.opts.style;
  if (st === 'bubbles') return bubbles();
  if (st === 'hdock') return hdock();
  const apps = await api.desk.appsCat(w.opts.cat || 'Favoritos', st === 'dock' ? 6 : 9);
  const mkBtn = (a) => {
    const b = h('button'); b.title = a.n;
    if (a.icon) { const im = new Image(); im.src = a.icon; im.alt = ''; b.append(im); } else b.textContent = a.n[0];
    b.onclick = () => api.desk.appsRun({ n: a.n, id: a.id, lnk: a.lnk });
    return b;
  };
  if (w.opts.style === 'dock') { const d = h('div', 'dock'); d.append(...apps.map(mkBtn)); return root.append(d); }
  const f = h('div', 'fold'), box = h('div', 'box');
  box.append(...apps.map(mkBtn));
  f.append(box, h('div', 'lbl', w.opts.cat || 'Favoritos'));
  root.append(f);
};

const appBtn = (a, cls) => {
  const b = h('button', cls || ''); b.title = a.n;
  if (a.icon) { const im = new Image(); im.src = a.icon; im.alt = ''; im.draggable = false; b.append(im); } else b.append(h('div', 'ltr', a.n[0]));
  b.onclick = () => { b.animate([{ transform: b.style.transform + ' scale(.9)' }, { transform: b.style.transform }], { duration: 180, easing: 'cubic-bezier(.23,1,.32,1)' }); api.desk.appsRun({ n: a.n, id: a.id, lnk: a.lnk }); };
  return b;
};
// Burbujas tipo watchOS: panal hexagonal; los iconos crecen cerca del cursor y se achican en los bordes
async function bubbles() {
  const apps = await api.desk.appsCat(w.opts.cat || 'Favoritos', 37);
  const box = h('div', 'bub'); root.append(box);
  const pos = [[0, 0]];
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (let k = 1; pos.length < apps.length && k < 5; k++) { // anillo k del panal (coordenadas axiales)
    let q = dirs[4][0] * k, r = dirs[4][1] * k;
    for (let d = 0; d < 6; d++) for (let i = 0; i < k; i++) { pos.push([q, r]); q += dirs[d][0]; r += dirs[d][1]; }
  }
  const rings = Math.ceil((-3 + Math.sqrt(9 + 12 * (apps.length - 1))) / 6) || 1;
  const W = box.clientWidth || innerWidth, H = box.clientHeight || innerHeight;
  const D = Math.min(W, H) / (2 * rings + 0.9); // diámetro base
  const cx = W / 2, cy = H / 2;
  const btns = apps.map((a, i) => {
    const [q, r] = pos[i] || [0, 0];
    const x = cx + D * 1.06 * (q + r / 2), y = cy + D * 0.92 * r;
    const b = appBtn(a);
    Object.assign(b.style, { width: D * 0.9 + 'px', height: D * 0.9 + 'px', left: x - D * 0.45 + 'px', top: y - D * 0.45 + 'px' });
    b._x = x; b._y = y;
    box.append(b);
    return b;
  });
  const lens = (px, py) => {
    const R = Math.max(W, H) * 0.62;
    for (const b of btns) {
      const d = Math.hypot(b._x - px, b._y - py);
      const s = Math.max(0.58, 1.15 - (d / R) * 0.62);
      b.style.transform = `scale(${s.toFixed(3)})`;
    }
  };
  lens(cx, cy);
  box.addEventListener('mousemove', (e) => { const r = box.getBoundingClientRect(); box.classList.add('live'); lens(e.clientX - r.left, e.clientY - r.top); });
  box.addEventListener('mouseleave', () => { box.classList.remove('live'); lens(cx, cy); });
}
// Dock horizontal: fila de apps con la ampliación del dock de macOS
async function hdock() {
  const apps = await api.desk.appsCat(w.opts.cat || 'Favoritos', 12);
  const row = h('div', 'hd'), tip = h('div', 'hdtip');
  root.append(tip, row);
  const S = Math.min((innerWidth - 40) / apps.length - 6, innerHeight * 0.5);
  const btns = apps.map((a) => { const b = appBtn(a); b.style.width = b.style.height = S + 'px'; row.append(b); return b; });
  const mag = (mx) => {
    let hov = null;
    for (const b of btns) {
      const r = b.getBoundingClientRect(), d = Math.abs(mx - (r.left + r.width / 2)), range = S * 2.5;
      const k = mx < 0 || d > range ? 1 : 1 + 0.6 * Math.cos((d / range) * Math.PI / 2);
      b.style.width = b.style.height = S * k + 'px';
      b.style.transition = mx < 0 ? 'width .25s cubic-bezier(.23,1,.32,1), height .25s cubic-bezier(.23,1,.32,1)' : 'none';
      if (mx >= r.left && mx <= r.right) hov = b;
    }
    tip.textContent = hov?.title || ''; tip.classList.toggle('on', !!hov);
  };
  row.addEventListener('mousemove', (e) => requestAnimationFrame(() => mag(e.clientX)));
  row.addEventListener('mouseleave', () => mag(-1));
}

R.actions = function () {
  const g = h('div', 'acts');
  for (const [ic, a, t] of [['lock', 'lock', 'Bloquear'], ['sleep', 'sleep', 'Suspender'], ['restart', 'restart', 'Reiniciar'], ['logoff', 'logoff', 'Cerrar sesión']]) {
    const b = h('button'); b.title = t; b.append(SV(ICON[ic], 20)); b.onclick = () => api.desk.action(a); g.append(b);
  }
  root.append(g);
};

R.quote = function () {
  const q = h('div', 'quote'), t = h('q', '', w.opts.text || '');
  q.append(t);
  if (w.opts.author) q.append(h('div', 'a', '— ' + w.opts.author));
  root.append(q);
};

R.profile = function () {
  const p = h('div', 'prof'), av = h('div', 'av');
  if (w.opts.avatar) av.style.backgroundImage = `url("file:///${w.opts.avatar.replace(/\\/g, '/')}")`; else av.textContent = (w.opts.name || '?')[0];
  av.title = 'Clic para cambiar la foto';
  av.onclick = async () => { const f = await api.desk.pickImage(false); if (f) api.widgets.update(id, { opts: { avatar: f } }); };
  p.append(av, h('b', '', w.opts.name || 'Tu nombre'), h('div', 'cap', w.opts.status || ''));
  root.append(p);
};

R.network = function () {
  const head = h('div', 'sec'); head.append(h('span', '', '📶 Conexión'));
  const g = h('div', 'net');
  const mk = (ic, lab) => { const s = h('div', 's'), i = h('span', 'ic'); i.append(SV(ICON[ic], 14)); const v = h('b', '', '—'); const t = h('div'); t.append(v, h('div', 'cap', lab)); s.append(i, t); s.v = v; return s; };
  const dn = mk('down', 'Bajada'), upl = mk('up', 'Subida');
  g.append(dn, upl);
  const cv = document.createElement('canvas'); cv.className = 'spark';
  root.append(head, g, cv);
  const hist = [];
  every(async () => {
    const n = await api.desk.net();
    dn.v.textContent = fmtRate(n.down); upl.v.textContent = fmtRate(n.up);
    hist.push(n.down); if (hist.length > 40) hist.shift();
    const c = cv.getContext('2d'), W = (cv.width = cv.clientWidth * 2), H = (cv.height = 92), mx = Math.max(...hist, 1);
    c.clearRect(0, 0, W, H); c.beginPath();
    hist.forEach((v, i) => c.lineTo((i / 39) * W, H - (v / mx) * (H - 8) - 4));
    c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ac') || '#0a84ff'; c.lineWidth = 3; c.stroke();
  }, 2000);
};

R.html = function () { // widgets HTML hechos por la comunidad (estilo Wigify / Zebar), aislados en un sandbox
  if (!w.opts.src) return msg('Elige un archivo .html o una URL https en FolderGlow → Widgets.');
  const f = document.createElement('iframe');
  f.className = 'web';
  f.setAttribute('sandbox', 'allow-scripts allow-forms');
  f.src = /^https:\/\//.test(w.opts.src) ? w.opts.src : 'file:///' + w.opts.src.replace(/\\/g, '/');
  root.append(f);
};

function render() {
  timers.forEach(clearInterval); timers = [];
  root.replaceChildren();
  (R[w.type] || (() => msg('Widget desconocido')))();
}
api.widgets.get(id).then((x) => { w = x; theme(); render(); });
api.widgets.onUpdate((x) => {
  const visualOnly = w && x.type === w.type && JSON.stringify(x.opts) === JSON.stringify(w.opts);
  w = x; theme();
  if (!visualOnly && w.type !== 'notes') render(); // cambiar opacidad o color no reconstruye el widget
});
