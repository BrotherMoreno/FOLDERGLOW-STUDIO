const Q = new URLSearchParams(location.search);
const S = +Q.get('size') || 52, MAG = +Q.get('mag') || 1.7, AUTO = Q.get('autohide') === '1';
document.documentElement.style.setProperty('--s', S + 'px');
const $ = (q) => document.querySelector(q);
const SV = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const SYS = [
  { k: 'launcher', n: 'Aplicaciones', svg: '<circle cx="5" cy="5" r="1.7"/><circle cx="12" cy="5" r="1.7"/><circle cx="19" cy="5" r="1.7"/><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/><circle cx="5" cy="19" r="1.7"/><circle cx="12" cy="19" r="1.7"/><circle cx="19" cy="19" r="1.7"/>' },
];
const RIGHT = [
  { k: 'downloads', n: 'Descargas', svg: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>' },
  { k: 'trash', n: 'Papelera', svg: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>' },
];
let items = [], over = false, mx = -1;
if (AUTO) document.body.classList.add('hide');

function el(it, kind) {
  const d = document.createElement('div');
  d.className = 'it' + (it.wins?.length ? ' run' : '') + (it.wins?.some((w) => w.a) ? ' act' : '');
  let ic;
  if (kind === 'sys') { ic = document.createElement('div'); ic.className = 'ic sys'; ic.innerHTML = SV(it.svg); }
  else if (it.icon) { ic = new Image(); ic.src = it.icon; ic.className = 'ic'; ic.draggable = false; ic.onerror = () => ic.replaceWith(ph(it)); }
  else ic = ph(it);
  d.append(ic, Object.assign(document.createElement('i'), { className: 'dot' }));
  d.dataset.n = it.n;
  d.onclick = async () => {
    if (kind === 'sys') return api.dock.open(it.k);
    const r = await api.dock.click(it);
    if (r === 'launch') { d.classList.remove('bounce'); void d.offsetWidth; d.classList.add('bounce'); }
  };
  d.oncontextmenu = (e) => { e.preventDefault(); if (kind !== 'sys') api.dock.menu(it); };
  return d;
}
function ph(it) { const p = document.createElement('div'); p.className = 'ph'; p.textContent = (it.n || '?')[0].toUpperCase(); return p; }

function draw() {
  const box = $('#icons');
  box.replaceChildren(
    ...SYS.map((s) => el(s, 'sys')),
    sep(),
    ...items.filter((i) => i.pinned).map((i) => el(i)),
    ...(items.some((i) => !i.pinned) ? [sep()] : []),
    ...items.filter((i) => !i.pinned).map((i) => el(i)),
    sep(),
    ...RIGHT.map((s) => el(s, 'sys')));
  magnify();
  glassPos();
}
const sep = () => Object.assign(document.createElement('div'), { className: 'sep' });

// ampliación tipo macOS: cada icono crece según su distancia al cursor (curva coseno)
function magnify() {
  const its = [...document.querySelectorAll('.it')];
  const range = S * 2.6;
  for (const d of its) {
    let s = 1;
    if (mx >= 0 && MAG > 1) {
      const r = d.getBoundingClientRect();
      const dist = Math.abs(mx - (r.left + r.width / 2));
      if (dist < range) s = 1 + (MAG - 1) * Math.cos((dist / range) * (Math.PI / 2));
    }
    d.style.width = d.style.height = S * s + 'px';
    d.style.transition = mx >= 0 ? 'none' : 'width 260ms cubic-bezier(.23,1,.32,1), height 260ms cubic-bezier(.23,1,.32,1)';
  }
  const hov = its.find((d) => { const r = d.getBoundingClientRect(); return mx >= r.left && mx <= r.right; });
  const tip = $('#tip');
  if (hov && mx >= 0) {
    const r = hov.getBoundingClientRect();
    tip.textContent = hov.dataset.n; tip.style.left = r.left + r.width / 2 + 'px'; tip.style.top = r.top - 34 + 'px'; tip.classList.add('on');
  } else tip.classList.remove('on');
}
const dock = $('#dock');
dock.addEventListener('mouseenter', () => { over = true; api.dock.mouse(true); });
dock.addEventListener('mouseleave', () => { over = false; mx = -1; api.dock.mouse(false); magnify(); });
dock.addEventListener('mousemove', (e) => { mx = e.clientX; requestAnimationFrame(magnify); });
// el resto de la ventana deja pasar los clics: activamos la captura solo sobre la píldora
document.addEventListener('mousemove', (e) => {
  const r = dock.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 8 && e.clientY <= r.bottom;
  if (inside !== over) { over = inside; api.dock.mouse(inside); if (!inside) { mx = -1; magnify(); } }
});

// vidrio: tu fondo de pantalla desenfocado detrás del dock (mismo truco que los widgets)
let wallImg = null;
async function wall() {
  const g = await api.wall.get();
  if (!g.url) return;
  const img = new Image(); img.src = g.url;
  try { await img.decode(); } catch (_) { return; }
  const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * img.naturalHeight / img.naturalWidth);
  const x = c.getContext('2d'); x.filter = 'blur(4px) saturate(1.6)'; x.drawImage(img, -8, -8, c.width + 16, c.height + 16);
  wallImg = c.toDataURL('image/jpeg', .85);
  glassPos();
}
function glassPos() {
  if (!wallImg) return;
  const g = $('#glass'), r = dock.getBoundingClientRect();
  g.style.backgroundImage = `url("${wallImg}")`;
  g.style.backgroundSize = `${screen.width}px ${screen.height}px`;
  g.style.backgroundPosition = `${-(window.screenX + r.left - screen.availLeft)}px ${-(window.screenY + r.top)}px`;
}
api.wall.onChange(wall);
wall();
api.dock.onUpdate((d) => {
  const sig = JSON.stringify(d.items.map((i) => [i.n, i.icon, i.wins.length, i.wins.some((w) => w.a)]));
  if (sig === draw.sig) return; // sin cambios: no tocar el DOM (cero trabajo en reposo)
  draw.sig = sig; items = d.items; draw();
});
api.dock.onReveal((v) => document.body.classList.toggle('hide', !v));
new ResizeObserver(glassPos).observe(dock);
draw();
