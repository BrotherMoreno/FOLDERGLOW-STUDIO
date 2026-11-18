const $ = (q) => document.querySelector(q);
const SV = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
$('#apps').innerHTML = SV('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>');
$('#apps').onclick = () => api.dock.open('launcher');
$('#clock').onclick = () => api.dock.open('calendar');
const TRAY = [
  ['notif', 'Notificaciones', '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/>'],
  ['wifi', 'Wi-Fi', '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r=".8" fill="currentColor"/>'],
  ['bluetooth', 'Bluetooth', '<path d="m7 7 10 10-5 4V3l5 4L7 17"/>'],
  ['sound', 'Sonido', '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'],
  ['quick', 'Ajustes rápidos', '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'],
];
$('#tray').innerHTML = '<span id="bat"></span>' + TRAY.map(([k, t, d]) => `<button data-k="${k}" title="${t}">${SV(d)}</button>`).join('');
$('#tray').querySelectorAll('button').forEach((b) => (b.onclick = () => api.dock.open(b.dataset.k)));
function tick() {
  const n = new Date();
  $('#clock').textContent = n.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/^\w/, (c) => c.toUpperCase()) +
    '  ·  ' + n.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
tick(); setInterval(tick, 15000);
navigator.getBattery?.().then((b) => {
  const up = () => { $('#bat').textContent = b.level < 1 || !b.charging ? `${b.charging ? '⚡' : ''}${Math.round(b.level * 100)}%` : ''; };
  b.addEventListener('levelchange', up); b.addEventListener('chargingchange', up); up();
});
api.dock.onUpdate((d) => { $('#title').textContent = d.active?.t || ''; });
