const $ = (s) => document.querySelector(s);
if (new URLSearchParams(location.search).get('real') === '1') document.body.classList.add('real');
let apps = [], cats = null, games = null, counts = {}, tab = 'all', page = 0, sel = 0, view = [], perPage = 24, cols = 6;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const COLORS = ['#ff7a3d', '#0a84ff', '#30d158', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a'];

function layout() {
  const vp = $('#viewport');
  const G = tab === 'games' && !$('#q').value;
  const cell = G ? 168 + 12 : 132 + 22, rowH = G ? 252 + 12 : 129 + 14;
  cols = Math.max(3, Math.min(8, Math.floor((vp.clientWidth + 22) / cell)));
  const rows = Math.max(2, Math.min(5, Math.floor((vp.clientHeight + 14) / rowH)));
  perPage = cols * rows;
}

function list() {
  const q = norm($('#q').value.trim());
  if (tab === 'games') {
    const g = (games || []).filter((x) => !x.hidden).sort((a, b) => (b.favorite - a.favorite) || (b.last - a.last) || a.n.localeCompare(b.n));
    return q ? g.filter((x) => norm(x.n).includes(q)) : g;
  }
  if (q) {
    return [...apps, ...(games || []).filter((x) => !x.hidden)].filter((a) => norm(a.n).includes(q))
      .sort((a, b) => (norm(b.n).startsWith(q) - norm(a.n).startsWith(q)) || (counts[b.n] || 0) - (counts[a.n] || 0));
  }
  if (tab === 'freq') {
    const c = (x) => (x.src ? x.launches * 1 : counts[x.n]) || 0;
    return [...apps, ...(games || [])].filter(c).sort((a, b) => c(b) - c(a)).slice(0, perPage);
  }
  return apps;
}

const SRC = { steam: 'Steam', epic: 'Epic', gog: 'GOG', ubisoft: 'Ubisoft', riot: 'Riot', custom: 'PC' };
function gameTile(g, i) { // portada a sangre como Playnite; el nombre aparece al pasar el mouse
  const b = document.createElement('button');
  b.className = 'game' + (i === sel ? ' sel' : '');
  b.title = g.n;
  const cv = document.createElement('div');
  cv.className = 'cv';
  const gen = () => {
    cv.className = 'cv gen';
    cv.replaceChildren();
    if (g.icon) {
      const bg = new Image(); bg.src = g.icon; bg.className = 'bg';
      const ic = new Image(); ic.src = g.icon; ic.className = 'ic';
      cv.append(bg, ic);
    }
    cv.append(Object.assign(document.createElement('b'), { textContent: g.n }));
  };
  if (g.cover) { const im = new Image(); im.alt = ''; im.decoding = 'async'; im.loading = 'lazy'; im.onerror = gen; im.src = g.cover; cv.append(im); } else gen();
  const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = g.n;
  b.append(cv, lab);
  b.onclick = () => launch(g);
  b.onmouseenter = () => { sel = i; mark(); };
  return b;
}
function tile(a, i) {
  if (a.src) return gameTile(a, i);
  const b = document.createElement('button');
  b.className = 'app' + (i === sel ? ' sel' : '');
  if (a.icon) { const im = new Image(); im.src = a.icon; im.alt = ''; im.decoding = 'async'; im.loading = 'lazy'; b.append(im); }
  else {
    const ph = document.createElement('div');
    ph.className = 'ph'; ph.textContent = a.n[0]?.toUpperCase() || '?';
    ph.style.background = COLORS[a.n.length % COLORS.length];
    b.append(ph);
  }
  const s = document.createElement('span'); s.textContent = a.n; b.title = a.n;
  b.append(s);
  b.onclick = () => launch(a);
  b.onmouseenter = () => { sel = i; mark(); };
  return b;
}

function render() {
  const q = $('#q').value.trim();
  $('#dots').replaceChildren();
  if (!q && tab === 'games') return renderGames();
  if (!q && tab === 'lib') return renderLib();
  layout();
  view = list();
  const pages = Math.max(1, Math.ceil(view.length / perPage));
  page = Math.min(page, pages - 1);
  const root = $('#pages');
  root.replaceChildren();
  $('#viewport').classList.toggle('games', tab === 'games' && !$('#q').value);
  for (let p = 0; p < pages; p++) {
    const pg = document.createElement('div');
    pg.className = 'page';
    const items = view.slice(p * perPage, (p + 1) * perPage);
    pg.style.gridTemplateColumns = `repeat(${Math.min(cols, Math.max(1, items.length))}, var(--cell))`;
    items.forEach((a, k) => { const t = tile(a, p * perPage + k); t.style.setProperty('--i', Math.min(k, 30)); pg.append(t); });
    root.append(pg);
  }
  $('#empty').textContent = view.length ? '' : tab === 'games' && !games ? 'Buscando tus juegos de Steam y Epic…'
    : tab === 'games' && !$('#q').value ? 'No encontré juegos de Steam ni Epic. Añade los tuyos en FolderGlow → Juegos.'
      : (tab === 'freq' && !$('#q').value ? 'Aún no hay apps frecuentes: abre algunas desde "Todas".' : 'Sin resultados');
  $('#dots').replaceChildren(...Array.from({ length: pages > 1 ? pages : 0 }, (_, i) => {
    const d = document.createElement('b');
    d.onclick = () => go(i);
    return d;
  }));
  go(page);
}
function go(p) {
  const pages = $('#pages').children.length;
  page = Math.max(0, Math.min(pages - 1, p));
  $('#pages').style.transform = `translateX(-${page * 100}%)`;
  [...$('#dots').children].forEach((d, i) => d.classList.toggle('on', i === page));
}
function mark() {
  document.querySelectorAll('.app').forEach((b, i) => b.classList.toggle('sel', i === sel));
  const p = Math.floor(sel / perPage);
  if (p !== page) go(p);
}
function launch(a) { if (!a) return; if (a.src) api.games.play(a.key); else api.launcher.run({ n: a.n, id: a.id, lnk: a.lnk }); }

async function load(force) {
  const r = await api.launcher.apps(force);
  apps = r.apps; counts = r.counts;
  render();
  games = await api.games.list(force);
  render();
}

document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
  tab = b.dataset.t; page = 0; sel = 0;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  render();
});
$('#q').oninput = () => { document.body.classList.toggle('typing', !!$('#q').value); page = 0; sel = 0; render(); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#folder').classList.contains('on')) { $('#folder').classList.remove('on'); return; }
  if (e.key === 'Escape') { if ($('#q').value) { $('#q').value = ''; render(); } else api.launcher.hide(); return; }
  if (e.key === 'Enter') return launch(view[sel]);
  const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (mv && (e.key.startsWith('ArrowUp') || e.key.startsWith('ArrowDown') || !$('#q').value || document.activeElement !== $('#q'))) {
    e.preventDefault();
    sel = Math.max(0, Math.min(view.length - 1, sel + mv));
    mark();
  }
  if (e.key === 'PageDown' || (e.key === 'ArrowRight' && e.ctrlKey)) go(page + 1);
  if (e.key === 'PageUp') go(page - 1);
  if (e.key === 'F5') load(true);
});
let wheelLock = 0;
document.addEventListener('wheel', (e) => {
  if (Date.now() < wheelLock || Math.abs(e.deltaY) < 20) return;
  wheelLock = Date.now() + 350;
  if (tab === 'games' || tab === 'lib') return;
  go(page + ((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1));
}, { passive: true });
document.addEventListener('mousedown', (e) => { if (e.target.id === 'viewport' || e.target.classList.contains('page') || e.target.id === 'wrap') api.launcher.hide(); });
window.addEventListener('resize', () => render());

api.launcher.onOpen(() => {
  $('#folder').classList.remove('on'); cats = null;
  document.body.classList.remove('closing');
  $('#q').value = ''; tab = 'all'; page = 0; sel = 0;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.t === 'all'));
  requestAnimationFrame(() => document.body.classList.add('open'));
  $('#q').focus();
  if (!apps.length) load(false); else render();
});
api.games.onChanged(async () => { games = await api.games.list(false); if (document.body.classList.contains('open')) render(); });
api.launcher.onClose(() => { document.body.classList.add('closing'); document.body.classList.remove('open'); });

// ---------- v2.4: fondo, biblioteca por categorías y "Continuar jugando"
async function paintWall() { // tu fondo de pantalla, reducido y desenfocado (barato) como en iPadOS
  const g = await api.wall.get();
  if (!g.url) return;
  const img = new Image(); img.src = g.url;
  try { await img.decode(); } catch (_) { return; }
  const c = document.createElement('canvas'); c.width = 960; c.height = Math.round(960 * img.naturalHeight / img.naturalWidth);
  const x = c.getContext('2d'); x.filter = 'blur(10px) saturate(1.3)'; x.drawImage(img, -20, -20, c.width + 40, c.height + 40);
  $('#shade').style.backgroundImage = `url("${c.toDataURL('image/jpeg', .85)}")`;
  $('#shade').classList.add('wall');
}
api.wall.onChange(paintWall);
api.launcher.onOpen(() => paintWall()); // el fondo puede haber cambiado desde la última vez
paintWall();

function viewport(node) {
  $('#viewport').classList.remove('games');
  $('#pages').style.transform = '';
  $('#pages').replaceChildren(node);
  $('#empty').textContent = '';
  view = [];
}
async function renderLib() {
  if (!cats) cats = await api.desk.categories();
  const order = ['Juegos', 'Productividad', 'Creatividad', 'Social', 'Entretenimiento', 'Internet', 'Desarrollo', 'Utilidades'];
  const lib = document.createElement('div'); lib.className = 'lib';
  for (const name of order.filter((k) => cats[k]?.length)) {
    const list = cats[name];
    const b = document.createElement('button'); b.className = 'cat';
    const box = document.createElement('div'); box.className = 'box';
    list.slice(0, 4).forEach((a) => { if (a.icon) { const im = new Image(); im.src = a.icon; im.alt = ''; box.append(im); } else { const p = document.createElement('div'); p.className = 'ph2'; box.append(p); } });
    b.append(box, Object.assign(document.createElement('span'), { textContent: `${name} · ${list.length}` }));
    b.onclick = () => openFolder(name, list);
    lib.append(b);
  }
  viewport(lib);
}
function openFolder(name, list) {
  $('#fname').textContent = name;
  $('#fgrid').replaceChildren(...list.map((a, i) => tile(a, -1)));
  $('#folder').classList.add('on');
}
$('#folder').addEventListener('mousedown', (e) => { if (e.target.id === 'folder') $('#folder').classList.remove('on'); });

function renderGames() { // solo las portadas, centradas (sin banner)
  if (!games) { viewport(Object.assign(document.createElement('p'), { className: 'mut', textContent: 'Buscando tus juegos…' })); return; }
  const list = games.filter((x) => !x.hidden).sort((a, b) => (!!b.favorite - !!a.favorite) || (b.last - a.last) || a.n.localeCompare(b.n));
  const gv = document.createElement('div'); gv.className = 'gview';
  const grid = document.createElement('div'); grid.className = 'ggrid2';
  list.forEach((g, i) => { const t = gameTile(g, -1); t.style.setProperty('--i', Math.min(i, 30)); grid.append(t); });
  gv.append(grid);
  viewport(gv);
}

// ---------- vista general: ventanas abiertas arriba, como GNOME Actividades
async function drawWindows() {
  const box = $('#wins');
  if (tab === 'games') { box.classList.remove('on'); return; }
  const ws = await api.launcher.windows();
  box.replaceChildren(...ws.map((w, i) => {
    const b = document.createElement('button'); b.className = 'win'; b.title = w.n; b.style.setProperty('--i', i);
    const th = document.createElement('div'); th.className = 'th'; th.style.backgroundImage = `url("${w.img}")`;
    if (w.icon) { const ic = new Image(); ic.src = w.icon; th.append(ic); }
    b.append(th, Object.assign(document.createElement('span'), { textContent: w.n }));
    b.onclick = () => api.launcher.focus(w.h);
    return b;
  }));
  box.classList.toggle('on', ws.length > 0);
  requestAnimationFrame(render); // el área de apps cambió de alto
}
api.launcher.onOpen(() => drawWindows());
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => $('#wins').classList.toggle('on', b.dataset.t !== 'games' && $('#wins').children.length > 0)));
