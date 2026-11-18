const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const el = (t, props = {}, kids = []) => { const e = Object.assign(document.createElement(t), props); e.append(...kids); return e; };
if (new URLSearchParams(location.search).get('win11') === '1') document.body.classList.add('win11');
let toastT;
const toast = (t) => { const x = $('#toast'); x.textContent = t; x.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => x.classList.remove('on'), 2400); };

// ---------- navegación
const loaders = {};
$$('nav button').forEach((b) => { b.title = b.textContent.trim(); });
$$('nav button').forEach((b) => b.onclick = () => {
  $$('nav button').forEach((x) => x.classList.toggle('on', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === b.dataset.tab));
  loaders[b.dataset.tab]?.();
});

// ---------- controles segmentados
function seg(node, value, onchange) {
  const set = (v) => node.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.value === v));
  node.querySelectorAll('button').forEach((b) => b.onclick = () => { set(b.value); node.dataset.v = b.value; onchange?.(b.value); });
  set(value); node.dataset.v = value;
  return node;
}
const segEl = (opts, value, onchange, cls = 'seg sm') => seg(el('div', { className: cls }, opts.map(([v, t]) => el('button', { value: v, textContent: t }))), value, onchange);
const sw = (checked, text, onchange) => el('label', { className: 'sw' }, [el('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }), el('span'), text]);

// ---------- generador de iconos neón
const PRESETS = { Naranja: ['#ff8a00', '#ff3d00'], Violeta: ['#c04bff', '#6a5cff'], Azul: ['#3da5ff', '#4b4bff'],
  Verde: ['#38ff9a', '#1fd1c0'], Rosa: ['#ff5ca8', '#ff3d6e'], Rojo: ['#ff4b4b', '#ff8a3d'],
  Amarillo: ['#ffe14b', '#ffa51f'], Cian: ['#3df2ff', '#3d8bff'] };
const GLYPHS = ['Ninguno', 'Imágenes', 'Descargas', 'Música', 'Videos', 'Documentos', 'Código', 'Nube', 'Estrella',
  'Corazón', 'Escritorio', 'Juegos', 'App'];
const st = { c1: '#c04bff', c2: '#6a5cff', glyph: 'Imágenes', tr: true };

function glyph(ctx, n) {
  const cx = 512, cy = 580;
  ctx.lineWidth = 46;
  const P = (pts, close) => { ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](cx + x, cy + y)); if (close) ctx.closePath(); ctx.stroke(); };
  const R = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(cx + x, cy + y, w, h, r); ctx.stroke(); };
  const C = (x, y, r, fill) => { ctx.beginPath(); ctx.arc(cx + x, cy + y, r, 0, 7); fill ? ctx.fill() : ctx.stroke(); };
  switch (n) {
    case 'Imágenes': R(-150, -110, 300, 220, 28); C(-70, -45, 25, 1); P([[-150, 80], [-40, 0], [30, 55], [90, 10], [150, 70]]); break;
    case 'Descargas': P([[0, -130], [0, 60]]); P([[-90, -20], [0, 70], [90, -20]]); P([[-130, 130], [130, 130]]); break;
    case 'Música': C(-80, 80, 50); P([[-30, 80], [-30, -120], [120, -150], [120, 10]]); C(70, 10, 50); break;
    case 'Videos': R(-150, -90, 190, 180, 30); P([[40, 0], [150, -70], [150, 70]], 1); break;
    case 'Documentos': R(-100, -140, 200, 280, 24); [-60, 0, 60].forEach((y) => P([[-55, y], [55, y]])); break;
    case 'Código': P([[-70, -90], [-150, 0], [-70, 90]]); P([[70, -90], [150, 0], [70, 90]]); P([[25, -110], [-25, 110]]); break;
    case 'Nube': C(-90, 50, 60, 1); C(-20, -50, 70, 1); ctx.beginPath(); ctx.ellipse(cx + 70, cy + 20, 80, 90, 0, 0, 7); ctx.fill(); ctx.fillRect(cx - 90, cy + 20, 180, 90); break;
    case 'Estrella': P([...Array(10)].map((_, i) => { const r = i % 2 ? 65 : 150, a = (-90 + i * 36) * Math.PI / 180; return [r * Math.cos(a), 10 + r * Math.sin(a)]; }), 1); break;
    case 'Corazón': C(-72, -42, 77, 1); C(72, -42, 77, 1); ctx.beginPath(); ctx.moveTo(cx - 142, cy - 5); ctx.lineTo(cx + 142, cy - 5); ctx.lineTo(cx, cy + 140); ctx.fill(); break;
    case 'Escritorio': R(-150, -110, 300, 170, 24); P([[0, 60], [0, 120]]); P([[-70, 125], [70, 125]]); break;
    case 'Juegos': R(-160, -80, 320, 170, 70); ctx.lineWidth = 40; P([[-90, -20], [-90, 40]]); P([[-120, 10], [-60, 10]]); C(70, -15, 15, 1); C(110, 25, 15, 1); break;
    case 'App': [[-120, -120], [10, -120], [-120, 10], [10, 10]].forEach(([x, y]) => R(x, y, 110, 110, 26)); break;
  }
}
function drawFolder(ctx, S, c1, c2, gl, tr) {
  ctx.clearRect(0, 0, S, S); ctx.save(); ctx.scale(S / 1024, S / 1024);
  const g = ctx.createLinearGradient(90, 210, 934, 854); g.addColorStop(0, c1); g.addColorStop(1, c2);
  const body = new Path2D(); body.moveTo(90, 854);
  [[90, 210], [370, 210], [440, 280], [934, 280], [934, 854]].forEach((p) => body.lineTo(p[0], p[1])); body.closePath();
  ctx.lineJoin = ctx.lineCap = 'round'; ctx.strokeStyle = g; ctx.fillStyle = g;
  if (!tr) { ctx.globalAlpha = 0.16; ctx.fill(body); ctx.globalAlpha = 1; }
  const pass = () => { ctx.lineWidth = 56; ctx.stroke(body); if (gl !== 'Ninguno') glyph(ctx, gl); };
  ctx.shadowColor = c1; ctx.shadowBlur = 70 * S / 1024; ctx.globalAlpha = 0.65; pass();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1; pass(); ctx.restore();
}
const preview = () => drawFolder($('#pv').getContext('2d'), 200, st.c1, st.c2, st.glyph, st.tr);
const frames = () => [16, 24, 32, 48, 64, 128, 256].map((s) => {
  const c = el('canvas', { width: s, height: s });
  drawFolder(c.getContext('2d'), s, st.c1, st.c2, st.glyph, st.tr);
  return { size: s, png: c.toDataURL('image/png').split(',')[1] };
});

Object.entries(PRESETS).forEach(([n, [a, b]]) => $('#presets').append(el('b', {
  title: n, style: `background:linear-gradient(135deg,${a},${b})`,
  onclick: () => { st.c1 = $('#c1').value = a; st.c2 = $('#c2').value = b; preview(); } })));
GLYPHS.forEach((g) => $('#glyph').append(el('option', { value: g, textContent: g })));
$('#glyph').value = st.glyph; $('#c1').value = st.c1; $('#c2').value = st.c2;
$('#c1').oninput = (e) => { st.c1 = e.target.value; preview(); };
$('#c2').oninput = (e) => { st.c2 = e.target.value; preview(); };
$('#glyph').onchange = (e) => { st.glyph = e.target.value; preview(); };
$('#tr').onchange = (e) => { st.tr = e.target.checked; preview(); };
preview();

const items = [];
const addItems = (arr) => arr.forEach((p) => { if (!items.includes(p)) { items.push(p); $('#list').append(el('option', { value: p, textContent: p })); } });
$('#addF').onclick = async () => addItems(await api.pickFolders());
$('#addC').onclick = async () => addItems(await api.pickChildren());
$('#addA').onclick = async () => addItems(await api.pickApps());
$('#rm').onclick = () => [...$('#list').selectedOptions].forEach((o) => { items.splice(items.indexOf(o.value), 1); o.remove(); });
$('#apply').onclick = async () => {
  if (!items.length) { $('#st').textContent = 'Añade al menos una carpeta o app.'; return; }
  $('#st').textContent = 'Aplicando…';
  const res = await api.applyIcons({ items, frames: frames() });
  const bad = res.filter((r) => !r.ok);
  $('#st').textContent = `Listo: ${res.length - bad.length} personalizado(s).` + (bad.length ? ` Fallaron ${bad.length}: ${bad[0].msg}` : '');
};
$('#restore').onclick = async () => { await api.restoreIcons(items); $('#st').textContent = 'Iconos originales restaurados.'; };


// ---------- cristal + efectos (misma configuración del motor nativo)
let G = null;
const bindOut = (inp, out, suf = ' %') => { const f = () => (out.textContent = inp.value + suf); inp.addEventListener('input', f); f(); };
async function loadGlass() {
  G = await api.glass.getCfg();
  seg($('[data-k=taskbar]'), G.taskbar); seg($('[data-k=explorer]'), G.explorer); seg($('[data-k=console]'), G.console);
  $('#gTint').value = '#' + String(G.tint).replace('#', '').padStart(6, '0');
  $('#gAlpha').value = G.tint_alpha; $('#gExOp').value = G.explorer_opacity; $('#gCoOp').value = G.console_opacity;
  $('#gDark').checked = !!G.dark; $('#gAuto').checked = !!G.autostart;
  $('#fOpen').checked = !!G.open_fx; $('#fClick').checked = !!G.click_fx; $('#fColor').value = '#' + G.fx_color;
  bindOut($('#gExOp'), $('#oEx')); bindOut($('#gCoOp'), $('#oCo')); bindOut($('#tOp'), $('#oWt'));
}
loaders.glass = loadGlass; loaders.fx = loadGlass;
const collect = () => ({ ...G, taskbar: $('[data-k=taskbar]').dataset.v, explorer: $('[data-k=explorer]').dataset.v,
  console: $('[data-k=console]').dataset.v, tint: $('#gTint').value.slice(1), tint_alpha: +$('#gAlpha').value,
  explorer_opacity: +$('#gExOp').value, console_opacity: +$('#gCoOp').value, dark: $('#gDark').checked, autostart: $('#gAuto').checked,
  open_fx: $('#fOpen').checked, click_fx: $('#fClick').checked, fx_color: $('#fColor').value.slice(1) });
async function applyGlass(stEl) {
  G = collect();
  const r = await api.glass.apply(G);
  await api.glass.autostart($('#gAuto').checked);
  stEl.textContent = r.ok ? 'Activo ✓' : 'El motor solo funciona en Windows.';
  toast(r.ok ? 'Cristal y efectos activados' : 'No se pudo iniciar el motor');
}
$('#gGo').onclick = () => applyGlass($('#gSt'));
$('#fGo').onclick = () => applyGlass($('#fSt'));
$('#gStop').onclick = async () => { await api.glass.stop(); $('#gSt').textContent = 'Restaurado.'; toast('Windows restaurado'); };
['#0a84ff', '#bf5af2', '#ff375f', '#ff9f0a', '#30d158', '#64d2ff', '#ffffff'].forEach((c) => $('#fPresets').append(el('b', {
  style: `background:${c}`, onclick: () => { $('#fColor').value = c; } })));
$('#tGo').onclick = async () => { const r = await api.term.apply({ opacity: +$('#tOp').value, acrylic: $('#tAcr').checked }); $('#tSt').textContent = r.msg || ''; };
$('#tReset').onclick = async () => { const r = await api.term.apply({ reset: true }); $('#tSt').textContent = r.ok ? 'Terminal restaurado.' : r.msg; };

// ---------- complementos
const TOOLS = [
  { n: 'TranslucentTB', d: 'Barra de tareas translúcida completa en Windows 11.', repo: 'https://github.com/TranslucentTB/TranslucentTB', w: 'CharlesMilette.TranslucentTB' },
  { n: 'ExplorerBlurMica', d: 'Desenfoque real dentro de las carpetas del Explorador.', repo: 'https://github.com/Maplespe/ExplorerBlurMica/releases' },
  { n: 'Windhawk', d: 'Mods del sistema: Taskbar Styler, File Explorer Styler…', repo: 'https://github.com/ramensoftware/windhawk', w: 'RamenSoftware.Windhawk' },
  { n: 'Mica For Everyone', d: 'Mica / Acrílico en cualquier app Win32.', repo: 'https://github.com/MicaForEveryone/MicaForEveryone', w: 'MicaForEveryone.MicaForEveryone' },
  { n: 'DWMBlurGlass', d: 'Cristal en las barras de título de todo el sistema.', repo: 'https://github.com/Maplespe/DWMBlurGlass' },
  { n: 'Rainmeter', d: 'Miles de skins de escritorio de la comunidad.', repo: 'https://github.com/rainmeter/rainmeter', w: 'Rainmeter.Rainmeter' },
  { n: 'Lively Wallpaper', d: 'Fondos animados: video, GIF y páginas HTML. Compatible con los widgets de FolderGlow.', repo: 'https://github.com/rocksdanister/lively', w: 'rocksdanister.LivelyWallpaper' },
  { n: 'Seelen UI', d: 'Escritorio completo: dock, barra superior, mosaicos y widgets.', repo: 'https://github.com/eythaann/Seelen-UI', w: 'Seelen.SeelenUI' },
  { n: 'YASB Reborn', d: 'Barra de estado configurable con YAML y CSS.', repo: 'https://github.com/amnweb/yasb', w: 'AmN.yasb' },
  { n: 'Zebar', d: 'Barras y widgets hechos en HTML/CSS/JS (sirven como widgets HTML).', repo: 'https://github.com/glzr-io/zebar', w: 'glzr-io.zebar' },
  { n: 'Widgetsack', d: 'Widgets con editor visual: sistema, relojes, música.', repo: 'https://github.com/gyng/widgetsack' },
  { n: 'Wigify', d: 'Crea widgets HTML/CSS/JS; puedes cargarlos en FolderGlow con “Widget HTML”.', repo: 'https://github.com/wigify/wigify' },
];
TOOLS.forEach((t) => $('#toolGrid').append(el('div', { className: 'tile' }, [
  el('b', { textContent: t.n }), el('small', { textContent: t.d }),
  el('div', { className: 'row' }, [
    ...(t.w ? [el('button', { className: 'pri', textContent: 'Instalar', onclick: () => { api.tool.install(t.w); toast('Abriendo winget…'); } })] : []),
    el('button', { className: 'ghost', textContent: 'GitHub', onclick: () => api.tool.open(t.repo) })])])));

// ---------- widgets
const WMETA = {
  appbubbles: ['🫧', 'Burbujas de apps', 'Panal tipo watchOS con lupa'], apphdock: ['▭', 'Dock horizontal', 'Fila de apps con ampliación'],
  music: ['🎵', 'Música', 'Lo que suena + controles'], photos: ['🖼️', 'Fotos', 'Carrusel de tu carpeta'],
  appfolder: ['🗂️', 'Carpeta de apps', 'Como iPadOS, por categoría'], actions: ['⏻', 'Acciones', 'Bloquear, suspender, reiniciar'],
  quote: ['❝', 'Cita', 'Tu frase del día'], profile: ['🙂', 'Perfil', 'Foto, nombre y estado'], network: ['📶', 'Conexión', 'Bajada y subida en vivo'],
  html: ['🧩', 'Widget HTML', 'Usa widgets web de la comunidad'],
  clock: ['🕐', 'Reloj', 'Digital o analógico'], calendar: ['📅', 'Calendario', 'Mes actual'], system: ['📊', 'Sistema', 'CPU · RAM · disco'],
  battery: ['🔋', 'Batería', 'Nivel y autonomía'], weather: ['⛅', 'Clima', 'Open-Meteo, sin clave'], notes: ['📝', 'Notas', 'Se guardan solas'],
  pomodoro: ['⏱️', 'Pomodoro', 'Enfoque y descanso'], ghcontrib: ['🟩', 'GitHub · Contribuciones', 'Mapa de calor y racha'],
  ghstats: ['⭐', 'GitHub · Stats', 'Estrellas, commits, PRs'], ghmonth: ['🗓️', 'GitHub · Mes', 'Contribuciones del mes'],
  ghlangs: ['💻', 'GitHub · Lenguajes', 'Top lenguajes'], ghprofile: ['👤', 'GitHub · Perfil', 'Avatar y repos'],
};
const STYLE = (opts) => ['style', 'seg', 'Estilo', opts];
const CATS_OPT = [['Favoritos', 'Favoritos'], ['Juegos', 'Juegos'], ['Productividad', 'Productividad'], ['Social', 'Social'], ['Entretenimiento', 'Ocio'], ['Creatividad', 'Creatividad'], ['Desarrollo', 'Dev'], ['Internet', 'Internet'], ['Utilidades', 'Utilidades']];
const FIELDS = {
  calendar: [STYLE([['month', 'Mes'], ['mini', 'Mini']])],
  system: [STYLE([['rings', 'Anillos'], ['bars', 'Barras'], ['donuts', 'Donas'], ['ram', 'Solo RAM']])],
  battery: [STYLE([['ring', 'Anillo'], ['rings', 'iPad'], ['icon', 'Pila']])],
  music: [], actions: [], network: [],
  photos: [['folder', 'text', 'Carpeta de fotos', 'C:\\Users\\…\\Pictures'], ['every', 'num', 'Cambiar cada (s)']],
  appfolder: [['cat', 'seg', 'Categoría', CATS_OPT], STYLE([['folder', 'Carpeta'], ['bubbles', 'Burbujas'], ['hdock', 'Dock horizontal'], ['dock', 'Dock vertical']])],
  quote: [['text', 'text', 'Frase'], ['author', 'text', 'Autor (opcional)']],
  profile: [['name', 'text', 'Nombre'], ['status', 'text', 'Estado']],
  html: [['src', 'text', 'Archivo .html o URL https', 'C:\\widgets\\reloj\\index.html']],
  clock: [['style', 'seg', 'Estilo', [['digital', 'Digital'], ['analog', 'Analógico'], ['ipad', 'iPad'], ['giant', 'Gigante'], ['text', 'Texto'], ['bento', 'Mono'], ['retro', 'Retro']]], ['format24', 'check', 'Formato 24 h'], ['showSeconds', 'check', 'Segundos']],
  weather: [['city', 'text', 'Ciudad', 'Lima'], STYLE([['classic', 'Clásico'], ['ipad', 'iPad'], ['bento', 'Bento']])],
  pomodoro: [['work', 'num', 'Enfoque (min)'], ['rest', 'num', 'Descanso (min)'], ['title', 'text', 'Título (tema retro)']],
  ghcontrib: [['user', 'text', 'Usuario de GitHub', 'octocat'], ['palette', 'seg', 'Paleta', [['green', 'Verde'], ['blue', 'Azul'], ['amber', 'Ámbar'], ['purple', 'Violeta']]]],
  ghmonth: [['user', 'text', 'Usuario de GitHub', 'octocat'], ['palette', 'seg', 'Paleta', [['green', 'Verde'], ['blue', 'Azul'], ['amber', 'Ámbar'], ['purple', 'Violeta']]]],
  ghstats: [['user', 'text', 'Usuario de GitHub', 'octocat']], ghlangs: [['user', 'text', 'Usuario de GitHub', 'octocat']],
  ghprofile: [['user', 'text', 'Usuario de GitHub', 'octocat']],
};
const THEMES = [['glass', 'iPad'], ['forest', 'Bosque'], ['lavender', 'Lavanda'], ['mono', 'Bento'], ['retro', 'Retro'], ['dark', 'Oscuro'], ['midnight', 'Medianoche'], ['light', 'Claro'], ['mint', 'Menta']];
let WIN11 = false;
Object.entries(WMETA).forEach(([k, [ico, n, d]]) => $('#gallery').append(el('div', { className: 'tile' }, [
  el('div', { className: 'ico', textContent: ico }), el('b', { textContent: n }), el('small', { textContent: d }),
  el('button', { textContent: 'Añadir', onclick: async () => { await api.widgets.add(k); toast(`${n} añadido al escritorio`); loadWidgets(); } })])));

async function loadWidgets() {
  const all = Object.values(await api.widgets.list());
  $('#wempty').style.display = all.length ? 'none' : '';
  $('#wlist').replaceChildren(...all.map((w) => {
    const up = (patch) => api.widgets.update(w.id, patch);
    const [ico, name] = (w.type === 'appfolder' && w.opts.style === 'bubbles' ? WMETA.appbubbles : w.type === 'appfolder' && w.opts.style === 'hdock' ? WMETA.apphdock : WMETA[w.type]) || ['▦', w.type];
    const fields = (FIELDS[w.type] || []).map(([k, t, l, extra]) => {
      if (t === 'check') return sw(!!w.opts[k], l, (v) => up({ opts: { [k]: v } }));
      if (t === 'seg') return el('label', {}, [l, el('div', {}, [segEl(extra, w.opts[k], (v) => up({ opts: { [k]: v } }))])]);
      if (t === 'num') return el('label', {}, [l, el('input', { type: 'number', min: 1, max: 120, value: w.opts[k], style: 'width:100%', onchange: (e) => up({ opts: { [k]: +e.target.value } }) })]);
      return el('label', {}, [l, el('input', { type: 'text', value: w.opts[k] || '', placeholder: extra || '', style: 'width:100%', onchange: (e) => up({ opts: { [k]: e.target.value.trim() } }) })]);
    });
    const num = (k) => el('input', { type: 'number', value: w[k], min: 120, step: 10, style: 'width:84px', onchange: (e) => up({ [k]: +e.target.value }) });
    return el('div', { className: 'card wcard' }, [
      el('div', { className: 'wh' }, [el('span', { textContent: ico }), el('b', { textContent: name }),
        sw(w.enabled, '', (v) => up({ enabled: v })),
        el('button', { className: 'danger', textContent: 'Eliminar', onclick: async () => { await api.widgets.remove(w.id); loadWidgets(); } })]),
      el('div', { className: 'grid' }, [
        el('label', {}, ['Tema', el('div', {}, [segEl(THEMES, w.theme || 'dark', (v) => up({ theme: v }))])]),
        el('label', {}, ['Posición', el('div', {}, [segEl([['desk', 'Fijo en escritorio'], ['top', 'Siempre encima']], w.onTop ? 'top' : 'desk', (v) => up({ onTop: v === 'top' }))])]),
        ...fields]),
      el('details', {}, [el('summary', { textContent: 'Apariencia y tamaño' }), el('div', { className: 'grid' }, [
        el('label', {}, ['Opacidad del panel', el('input', { type: 'range', min: 0, max: 100, value: Math.round((w.opacity ?? 0.82) * 100), oninput: (e) => up({ opacity: e.target.value / 100 }) })]),
        el('label', {}, ['Acento ', el('input', { type: 'color', value: w.accent || '#0a84ff', oninput: (e) => up({ accent: e.target.value }) })]),
        el('label', {}, ['Material', el('div', {}, [segEl([['none', 'Color'], ['glass', 'Vidrio sobre fondo'], ...(WIN11 ? [['acrylic', 'Acrílico'], ['mica', 'Mica']] : [])], w.material || 'none', (v) => up({ material: v }))])]),
        sw(!!w.locked, 'Bloquear posición', (v) => up({ locked: v })),
        el('label', {}, ['Ancho × alto ', num('w'), ' ', num('h')])])]),
    ]);
  }));
}
loaders.widgets = loadWidgets;
api.widgets.onChanged(() => { if ($('#widgets').classList.contains('on')) loadWidgets(); });

// ---------- ajustes
async function loadSettings() {
  const s = await api.settings.get();
  $('#sAuto').checked = s.autostart; $('#sEco').checked = s.eco; $('#sTok').placeholder = s.ghToken || 'github_pat_…';
}
loaders.settings = loadSettings;
$('#sAuto').onchange = (e) => api.settings.set({ autostart: e.target.checked });
$('#sEco').onchange = async (e) => { await api.settings.set({ eco: e.target.checked }); toast('Reiniciando para aplicar el modo ahorro…'); setTimeout(() => api.settings.relaunch(), 900); };
$('#sTokSave').onclick = async () => { await api.settings.set({ ghToken: $('#sTok').value }); $('#sTok').value = ''; toast('Token guardado'); loadSettings(); };

api.settings.get().then((s) => { WIN11 = s.win11; loadWidgets(); });

// ---------- desenfoque real de carpetas (ExplorerBlurMica)
const hex = (r, g, b) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
const rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
async function loadBlur() {
  const s = await api.blur.status();
  const c = s.cfg;
  seg($('#bEffect'), String(c.effect));
  $('#bDarkC').value = hex(c.dark.r, c.dark.g, c.dark.b); $('#bDarkA').value = c.dark.a;
  $('#bLightC').value = hex(c.light.r, c.light.g, c.light.b); $('#bLightA').value = c.light.a;
  $('#bAddr').checked = c.clearAddress; $('#bWinUI').checked = c.clearWinUIBg; $('#bBar').checked = c.clearBarBg; $('#bLine').checked = c.showLine;
  bindOut($('#bDarkA'), $('#oBD'), ''); bindOut($('#bLightA'), $('#oBL'), '');
  const on = s.installed && s.registered;
  $('#bState').textContent = on ? 'Registrado en Windows' : s.registered ? 'Registrado (otra copia)' : s.installed ? 'Descargado, sin registrar' : 'No instalado';
  $('#bLog').textContent = `Windows build ${s.build} · DLL: ${s.dll || '—'}\nRegistro: ${s.regPath || 'no registrado'}\n\n${s.log || 'Sin eventos todavía.'}`;
  $('#bState').classList.toggle('ok', on);
  $('#bGo').textContent = on ? 'Reinstalar' : 'Instalar y activar';
}
const blurCfg = () => ({ effect: +$('#bEffect').dataset.v, clearAddress: $('#bAddr').checked, clearWinUIBg: $('#bWinUI').checked,
  clearBarBg: $('#bBar').checked, showLine: $('#bLine').checked,
  dark: { ...rgb($('#bDarkC').value), a: +$('#bDarkA').value }, light: { ...rgb($('#bLightC').value), a: +$('#bLightA').value } });
const blurAct = (fn, busy) => async () => {
  $('#bSt').textContent = busy;
  const r = await fn(blurCfg());
  $('#bSt').textContent = r.msg; toast(r.ok ? 'Listo' : 'No se completó');
  loadBlur();
};
$('#bGo').onclick = blurAct(api.blur.install, 'Descargando de GitHub y registrando… acepta el aviso de Windows.');
$('#bApply').onclick = blurAct(api.blur.apply, 'Aplicando…');
$('#bOff').onclick = blurAct(() => api.blur.uninstall(), 'Desactivando… acepta el aviso de Windows.');
$('#bRestart').onclick = blurAct(() => api.blur.restart(), 'Reiniciando el Explorador…');
const prevGlassLoader = loaders.glass;
loaders.glass = () => { prevGlassLoader(); loadBlur(); };

// ---------- lanzador de aplicaciones
async function loadLauncher() {
  const c = await api.launcher.getCfg();
  $('#lKey').value = c.hotkey || ''; $('#lWin').checked = c.win_launcher; $('#lCorner').checked = c.hot_corner; $('#lHide').checked = c.hideUninstall;
}
loaders.apps = loadLauncher;
$('#lOpen').onclick = () => api.launcher.open();
$('#lScan').onclick = async () => { $('#lSt').textContent = 'Escaneando…'; const r = await api.launcher.apps(true); $('#lSt').textContent = `${r.apps.length} apps encontradas`; };
$('#lWin').onchange = (e) => { api.launcher.setCfg({ win_launcher: e.target.checked }); toast(e.target.checked ? 'Tecla Windows → Aplicaciones' : 'Tecla Windows → Inicio'); };
$('#lCorner').onchange = (e) => api.launcher.setCfg({ hot_corner: e.target.checked });
$('#lHide').onchange = (e) => api.launcher.setCfg({ hideUninstall: e.target.checked });
$('#lKeyClr').onclick = () => { $('#lKey').value = ''; api.launcher.setCfg({ hotkey: '' }); };
$('#lKey').onkeydown = (e) => {
  e.preventDefault();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean);
  if (!mods.length) return toast('Usa al menos Ctrl, Alt o Shift');
  const k = e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const acc = [...mods, k].join('+');
  $('#lKey').value = acc; api.launcher.setCfg({ hotkey: acc }); toast('Atajo: ' + acc);
};

// ---------- biblioteca de juegos (estilo Playnite)
const GL = { list: [], src: 'all', sort: 'last', fav: false, hid: false, sel: null };
const SRCN = { steam: 'Steam', epic: 'Epic', gog: 'GOG', ubisoft: 'Ubisoft', riot: 'Riot', custom: 'Mío' };
const fmtSize = (b) => (b ? (b / 2 ** 30).toFixed(1).replace('.', ',') + ' GB' : '—');
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Nunca');
const fmtPlay = (m) => (!m ? '—' : m < 60 ? `${m} min` : `${(m / 60).toFixed(1).replace('.', ',')} h`);
const gnorm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pref = (k, d) => { try { const v = localStorage.getItem('g.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('g.' + k, JSON.stringify(v)); } catch (_) {} };

function artEl(g) { // portada; si no hay, portada generada con el icono (nunca un cuadro vacío)
  const box = el('div', { className: 'art' });
  const gen = () => {
    const d = el('div', { className: 'gen' });
    if (g.icon) d.append(el('img', { className: 'bg', src: g.icon, alt: '' }), el('img', { className: 'ic', src: g.icon, alt: '' }));
    d.append(el('b', { textContent: g.n }));
    box.replaceChildren(d);
    if (g.pending) box.append(el('div', { className: 'shim' }));
  };
  if (g.cover) { const im = el('img', { src: g.cover, alt: '', loading: 'lazy', decoding: 'async' }); im.onerror = gen; box.append(im); } else gen();
  return box;
}
function shown() {
  const q = gnorm($('#gq').value.trim());
  const by = { last: (a, b) => b.last - a.last || a.sort.localeCompare(b.sort), name: (a, b) => a.sort.localeCompare(b.sort, 'es', { sensitivity: 'base' }),
    playtime: (a, b) => b.playtime - a.playtime, added: (a, b) => (b.added || 0) - (a.added || 0) }[GL.sort];
  return GL.list.filter((g) => (GL.hid ? g.hidden : !g.hidden) && (GL.src === 'all' || g.src === GL.src) && (!GL.fav || g.favorite) && (!q || gnorm(g.n).includes(q)))
    .sort((a, b) => (GL.sort === 'last' ? (b.favorite - a.favorite) : 0) || by(a, b));
}
function drawGames() {
  GL.idx = 0;
  clearTimeout(GL.st); GL.st = setTimeout(() => $('#ggrid').classList.add('settled'), 1200);
  const list = shown();
  const counts = Object.keys(SRCN).map((k) => [k, GL.list.filter((g) => g.src === k && !g.hidden).length]).filter(([, n]) => n);
  $('#gmSt').textContent = `${list.length} de ${GL.list.filter((g) => !g.hidden).length} juegos · ` + counts.map(([k, n]) => `${SRCN[k]} ${n}`).join(' · ') +
    (GL.list.some((g) => g.pending) ? ' · descargando portadas…' : '');
  const top = !$('#gq').value && GL.src === 'all' && !GL.hid ? list.find((g) => g.last) : null;
  const heroCard = top ? [el('div', { className: 'ghero', style: `background-image:url("${top.hero || top.cover || ''}")` }, [
    el('div', { className: 'hc' }, [el('small', { textContent: 'Continuar jugando' }), el('h2', { textContent: top.n }),
      el('button', { className: 'play', textContent: '▶  Jugar', onclick: () => playG(top) })])])] : [];
  $('#ggrid').replaceChildren(...heroCard, ...(list.length ? list.map((g) => {
    const c = el('div', { className: 'gc' + (GL.sel === g.key ? ' sel' : '') + (g.hidden ? ' hid' : ''), title: g.n }, [artEl(g), el('div', { className: 'nm', textContent: g.n })]);
    c.style.setProperty('--i', Math.min(GL.idx = (GL.idx || 0) + 1, 36));
    if (g.favorite) c.append(el('span', { className: 'fav', textContent: '★' }));
    c.onclick = () => { GL.sel = g.key; $$('.gc.sel').forEach((x) => x.classList.remove('sel')); c.classList.add('sel'); drawDetail(); };
    c.ondblclick = () => playG(g);
    c.oncontextmenu = (e) => { e.preventDefault(); c.onclick(); openMenu(g, e.clientX, e.clientY); };
    return c;
  }) : [el('p', { className: 'mut', style: 'grid-column:1/-1', textContent: GL.list.length ? 'Nada coincide con el filtro.' : 'Escaneando Steam, Epic, GOG, Ubisoft y Riot…' })]));
  drawDetail();
}
const playG = (g) => { api.games.play(g.key); toast('Abriendo ' + g.n + '…'); };
const act = (g, a, msg) => async () => { closeMenu(); const r = await api.games.action(g.key, a); if (msg && r !== false) toast(msg); };
function actions(g) {
  return [
    ['★ ' + (g.favorite ? 'Quitar de favoritos' : 'Favorito'), act(g, 'favorite')],
    ['Abrir carpeta', act(g, 'folder')],
    ...(g.src !== 'custom' && g.src !== 'riot' ? [[g.src === 'steam' ? 'Ver en Steam' : `Abrir ${SRCN[g.src]}`, act(g, 'store')]] : []),
    ['Cambiar portada…', act(g, 'cover', 'Portada actualizada')],
    ['Volver a descargar arte', act(g, 'refetch', 'Buscando arte de nuevo…')],
    ...(g.src === 'custom' ? [['Renombrar…', () => { closeMenu(); const n = prompt('Nuevo nombre', g.n); if (n) api.games.action(g.key, 'rename', n); }]] : []),
    [g.hidden ? 'Mostrar en la biblioteca' : 'Ocultar', act(g, g.hidden ? 'show' : 'hide', g.hidden ? 'Visible' : 'Oculto')],
    [g.src === 'custom' ? 'Quitar de la biblioteca' : 'Desinstalar…', act(g, 'uninstall', g.src === 'custom' ? 'Quitado' : 'Abriendo el desinstalador…'), 'danger'],
  ];
}
function drawDetail() {
  const g = GL.list.find((x) => x.key === GL.sel);
  const d = $('#gdet');
  d.classList.toggle('on', !!g);
  if (!g) return;
  const hero = el('div', { className: 'hero' });
  if (g.hero || g.cover) hero.style.backgroundImage = `url("${g.hero || g.cover}")`;
  const cv = el('img', { className: 'cv', src: g.cover || g.icon || '', alt: '' });
  d.replaceChildren(hero, el('div', { className: 'body' }, [cv,
    el('h2', { textContent: g.n }), el('span', { className: 'badge ' + g.src, textContent: SRCN[g.src] }),
    el('button', { className: 'play', textContent: '▶  Jugar', onclick: () => playG(g) }),
    el('dl', {}, [['Tiempo jugado', fmtPlay(g.playtime)], ['Última vez', fmtDate(g.last)], ['Tamaño', fmtSize(g.size)], ['Añadido', fmtDate(g.added)], ['Veces abierto aquí', g.launches]]
      .flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })])),
    el('div', { className: 'acts' }, actions(g).map(([t, f, cls]) => el('button', { className: cls || 'ghost', textContent: t, onclick: f }))),
  ]));
}
function openMenu(g, x, y) {
  const m = $('#gmenu');
  m.replaceChildren(el('button', { textContent: '▶  Jugar', onclick: () => { closeMenu(); playG(g); } }), el('hr'),
    ...actions(g).map(([t, f, cls]) => el('button', { textContent: t, onclick: f, className: cls || '' })));
  m.classList.add('on');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
const closeMenu = () => $('#gmenu').classList.remove('on');
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#gmenu')) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

async function loadGames(force) {
  if (force) $('#gmSt').textContent = 'Escaneando…';
  GL.list = await api.games.list(force);
  drawGames();
}
loaders.games = () => { $('#ggrid').classList.remove('settled'); loadGames(false); };
api.games.onChanged(async () => { GL.list = await api.games.list(false); if ($('#games').classList.contains('on')) drawGames(); });
GL.src = pref('src', 'all'); GL.sort = pref('sort', 'last');
seg($('#gSrc'), GL.src, (v) => { GL.src = v; setPref('src', v); drawGames(); });
$('#gSort').value = GL.sort;
$('#gSort').onchange = (e) => { GL.sort = e.target.value; setPref('sort', GL.sort); drawGames(); };
$('#gq').oninput = () => drawGames();
const tg = (id, k, after) => { const b = $(id); b.classList.toggle('on', !!pref(k, false)); b.onclick = () => { const v = !pref(k, false); setPref(k, v); b.classList.toggle('on', v); after(v); }; after(!!pref(k, false)); };
tg('#gFav', 'fav', (v) => { GL.fav = v; if (GL.list.length) drawGames(); });
tg('#gHid', 'hid', (v) => { GL.hid = v; if (GL.list.length) drawGames(); });
tg('#gNames', 'names', (v) => $('#ggrid').classList.toggle('names', v));
$('#gZoom').value = pref('zoom', 150);
const zoom = () => { $('#ggrid').style.setProperty('--gw', $('#gZoom').value + 'px'); setPref('zoom', +$('#gZoom').value); };
$('#gZoom').oninput = zoom; zoom();
$('#gmScan').onclick = () => loadGames(true);
$('#gmAdd').onclick = async () => { const n = await api.games.add(); if (n) toast(`${n} juego(s) añadido(s)`); };
$('#sSgdbSave').onclick = async () => { await api.games.sgdb($('#sSgdb').value); $('#sSgdb').value = ''; toast('Clave de SteamGridDB guardada'); };

// ---------- Personalizar: plantillas y fondos
async function loadHome() {
  const [tpls, walls] = await Promise.all([api.templates.list(), api.wall.list()]);
  $('#tplGrid').replaceChildren(...tpls.map((t) => {
    const pv = el('div', { className: 'pv ' + t.theme, style: `background-image:url(walls/${t.wall}-thumb.jpg)` });
    for (const [type, [x, y, w, h], st] of t.boxes) {
      const bare = type === 'clock' && (st === 'giant' || st === 'text');
      pv.append(el('i', { className: bare ? 'bare' : '', style: `left:${3 + x * 7.9}%;top:${5 + y * 13.4}%;width:${w * 7.9 - 1.2}%;height:${h * 13.4 - 2}%` }));
    }
    return el('div', { className: 'tpl' }, [pv, el('div', { className: 'meta' }, [el('div', {}, [el('b', { textContent: t.n }), el('small', { textContent: `${t.d} · ${t.count} widgets` })]),
      el('button', { className: 'pri', textContent: 'Aplicar', onclick: async (e) => { e.target.textContent = 'Aplicando…'; await api.templates.apply(t.id, $('#tplReplace').checked); e.target.textContent = 'Aplicar'; toast(`Plantilla “${t.n}” aplicada`); } })])]);
  }));
  $('#wallGrid').replaceChildren(...walls.map((w) => el('button', { className: 'wall', style: `background-image:url(walls/${w.id}-thumb.jpg)`, onclick: async () => { await api.wall.set(w.id); toast('Fondo: ' + w.n); } }, [el('span', { textContent: w.n })])),
    el('button', { className: 'wall add', textContent: '+ Tu imagen…', onclick: async () => { if (await api.wall.pick()) toast('Fondo actualizado'); } }));
}
loaders.home = loadHome;
loadHome();

// ---------- dock tipo Mac y barra superior
async function loadDock() {
  const c = await api.dock.config();
  $('#dEn').checked = c.enabled; $('#dTop').checked = c.topbar; $('#dAuto').checked = c.autohide;
  $('#dSize').value = c.size; $('#dMag').value = Math.round(c.magnify * 100);
  bindOut($('#dSize'), $('#oDS'), ' px'); bindOut($('#dMag'), $('#oDM'), ' %');
}
const prevHome = loaders.home;
loaders.home = () => { prevHome(); loadDock(); };
loadDock();
$('#dEn').onchange = async (e) => { await api.dock.set({ enabled: e.target.checked }); toast(e.target.checked ? 'Dock activado: la barra de Windows se ocultó' : 'Barra de Windows restaurada'); };
$('#dTop').onchange = (e) => api.dock.set({ topbar: e.target.checked });
$('#dAuto').onchange = (e) => api.dock.set({ autohide: e.target.checked });
$('#dSize').onchange = (e) => api.dock.set({ size: +e.target.value });
$('#dMag').onchange = (e) => api.dock.set({ magnify: +e.target.value / 100 });
