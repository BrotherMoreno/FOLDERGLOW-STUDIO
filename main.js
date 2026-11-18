const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, net, screen, globalShortcut, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
// si algo falla al iniciar, avisar y cerrar del todo (nunca quedar abierta e invisible)
let started = false;
process.on('uncaughtException', (err) => {
  try { require('fs').appendFileSync(require('path').join(app.getPath('userData'), 'error.log'), `[${new Date().toISOString()}] ${err.stack || err}\n`); } catch (_) {}
  if (!started) {
    try { require('electron').dialog.showErrorBox('FolderGlow Studio no pudo iniciar', String(err.stack || err).slice(0, 1500)); } catch (_) {}
    app.exit(1);
  }
});

// ------------------------------------------------------------ rendimiento
// Cada widget es un proceso; limitamos su heap y apagamos funciones de Chromium que no usamos.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=96 --lite-mode');
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,MediaSessionService,HardwareMediaKeyHandling');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => new Promise((r) => execFile(cmd, args, { windowsHide: true }, (e, so, se) => r({ e, so, se })));
const CFG = path.join(app.getPath('userData'), 'config.json');
let cfg = { widgets: {}, eco: false, ghToken: '', locked: false, launcher: { hotkey: 'Alt+Space', hideUninstall: true, counts: {} } };
try { const saved = JSON.parse(fs.readFileSync(CFG, 'utf8')); cfg = { ...cfg, ...saved, launcher: { ...cfg.launcher, ...(saved.launcher || {}) } }; } catch (_) {}
if (cfg.eco) app.disableHardwareAcceleration(); // modo ahorro: sin GPU (menos RAM de vídeo)

let mgr = null, tray = null, quitting = false, widgetsHidden = false;
const wins = {};
const BUILD = Number((os.release().split('.')[2]) || 0);
const WIN11 = process.platform === 'win32' && BUILD >= 22621; // Mica / Acrílico reales

let saveT;
function saveSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2)); } catch (_) {}
  }, 300);
}

// ------------------------------------------------------------ motor nativo (GlowGlass)
const glassExe = () => app.isPackaged
  ? path.join(process.resourcesPath, 'tools', 'glowglass.exe') : path.join(__dirname, 'tools', 'glowglass.exe');
const glassCfgPath = () => path.join(process.env.APPDATA || app.getPath('appData'), 'FolderGlow', 'glass.json');
const GLASS_DEFAULT = { enabled: false, taskbar: 'clear', tint: '000000', tint_alpha: 90, explorer: 'mica', explorer_opacity: 100,
  console: 'acrylic', console_opacity: 92, dark: true, open_fx: false, click_fx: false, fx_color: '0a84ff', win_launcher: false, hot_corner: false };
function readGlass() {
  try { return { ...GLASS_DEFAULT, ...JSON.parse(fs.readFileSync(glassCfgPath(), 'utf8')) }; } catch (_) { return { ...GLASS_DEFAULT }; }
}
function writeGlass(c) {
  fs.mkdirSync(path.dirname(glassCfgPath()), { recursive: true });
  fs.writeFileSync(glassCfgPath(), JSON.stringify({ ...GLASS_DEFAULT, ...c }, null, 2));
}
function startEngine() { // si ya corre, el propio exe recarga la configuración
  if (process.platform !== 'win32' || !fs.existsSync(glassExe())) return false;
  spawn(glassExe(), [], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return true;
}
let reloadT;
const reloadEngine = () => { clearTimeout(reloadT); reloadT = setTimeout(startEngine, 120); };
ipcMain.handle('glass:getcfg', () => readGlass());
ipcMain.handle('glass:apply', (e, c) => { writeGlass({ ...readGlass(), ...c, enabled: true, hide_taskbar: readGlass().hide_taskbar }); return { ok: startEngine() }; });
ipcMain.handle('glass:stop', () => { writeGlass({ ...readGlass(), enabled: false }); startEngine(); return true; });
ipcMain.handle('glass:autostart', (e, on) => run(glassExe(), [on ? '--install' : '--uninstall']).then(() => true));

// Windows Terminal (CMD/PowerShell en Windows 11 se abren aquí): opacidad + acrílico nativos
const wtSettings = () => {
  const L = process.env.LOCALAPPDATA || '';
  return [path.join(L, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    path.join(L, 'Packages', 'Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    path.join(L, 'Microsoft', 'Windows Terminal', 'settings.json')].filter((p) => fs.existsSync(p));
};
const stripJsonc = (s) => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '').replace(/,(\s*[}\]])/g, '$1');
ipcMain.handle('term:apply', (e, { opacity, acrylic, reset }) => {
  const files = wtSettings();
  if (!files.length) return { ok: false, msg: 'No encontré Windows Terminal instalado.' };
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf8');
    if (!fs.existsSync(f + '.folderglow.bak')) fs.writeFileSync(f + '.folderglow.bak', raw);
    const j = JSON.parse(stripJsonc(raw));
    j.profiles = Array.isArray(j.profiles) ? { list: j.profiles, defaults: {} } : (j.profiles || {});
    j.profiles.defaults = j.profiles.defaults || {};
    if (reset) { delete j.profiles.defaults.opacity; delete j.profiles.defaults.useAcrylic; }
    else { j.profiles.defaults.opacity = Math.max(20, Math.min(100, opacity | 0)); j.profiles.defaults.useAcrylic = !!acrylic; }
    j.useAcrylicInTabRow = !reset && !!acrylic;
    fs.writeFileSync(f, JSON.stringify(j, null, 4));
  }
  return { ok: true, msg: `Windows Terminal actualizado (${files.length} perfil(es)). Copia de seguridad: settings.json.folderglow.bak` };
});

// ------------------------------------------------------------ widgets
const WTYPES = {
  clock:     { w: 200, h: 200, opts: { format24: true, showSeconds: false, style: 'ipad' } },
  calendar:  { w: 300, h: 300, opts: { style: 'month' } },
  system:    { w: 300, h: 190, opts: { style: 'rings' } },
  battery:   { w: 380, h: 200, opts: { style: 'rings' } },
  weather:   { w: 380, h: 240, opts: { city: 'Lima', style: 'ipad' } },
  notes:     { w: 300, h: 240, opts: { text: '' } },
  pomodoro:  { w: 260, h: 260, opts: { work: 25, rest: 5, style: 'ring', title: 'Toma un descanso' } },
  music:     { w: 340, h: 180, opts: {} },
  photos:    { w: 320, h: 320, opts: { folder: '', every: 12 } },
  appfolder: { w: 230, h: 230, opts: { cat: 'Favoritos', style: 'folder' } },
  actions:   { w: 300, h: 200, opts: {} },
  quote:     { w: 380, h: 190, opts: { text: 'Hazlo simple, pero significativo.', author: '' } },
  profile:   { w: 280, h: 300, opts: { name: 'Robert', status: 'En línea', avatar: '' } },
  network:   { w: 340, h: 190, opts: {} },
  html:      { w: 360, h: 260, opts: { src: '' } },
  ghcontrib: { w: 560, h: 200, opts: { user: '', palette: 'green' } },
  ghstats:   { w: 420, h: 220, opts: { user: '' } },
  ghmonth:   { w: 250, h: 250, opts: { user: '', palette: 'green' } },
  ghlangs:   { w: 320, h: 210, opts: { user: '' } },
  ghprofile: { w: 320, h: 330, opts: { user: '' } },
};
const webPrefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
  spellcheck: false, backgroundThrottling: true, v8CacheOptions: 'bypassHeatCheck' };

function openManager() {
  if (mgr && !mgr.isDestroyed()) { mgr.show(); mgr.focus(); return; }
  mgr = new BrowserWindow({ width: 1080, height: 720, minWidth: 900, minHeight: 600, title: 'FolderGlow Studio',
    icon: path.join(__dirname, 'renderer', 'logo.png'), autoHideMenuBar: true, show: false,
    backgroundColor: WIN11 ? '#00000000' : '#1c1c1e', ...(WIN11 ? { backgroundMaterial: 'mica' } : {}),
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#f5f5f7', height: 40 },
    webPreferences: webPrefs });
  mgr.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { win11: WIN11 ? '1' : '0' } });
  mgr.once('ready-to-show', () => mgr.show());
  mgr.on('close', (e) => { if (!quitting) { e.preventDefault(); mgr.hide(); } });
  mgr.on('hide', () => { mgr.webContents.setBackgroundThrottling(true); });
}

function widgetMenu(id, win) {
  const w = cfg.widgets[id];
  return Menu.buildFromTemplate([
    { label: 'Fijo en el escritorio', type: 'radio', checked: !w.onTop, click: () => patchWidget(id, { onTop: false }) },
    { label: 'Siempre encima', type: 'radio', checked: !!w.onTop, click: () => patchWidget(id, { onTop: true }) },
    { type: 'separator' },
    { label: 'Bloquear posición', type: 'checkbox', checked: !!w.locked, click: (m) => patchWidget(id, { locked: m.checked }) },
    { label: 'Ocultar este widget', click: () => patchWidget(id, { enabled: false }) },
    { label: 'Abrir administrador', click: openManager },
  ]);
}

function openWidget(id) {
  const w = cfg.widgets[id];
  if (!w || wins[id]) return;
  const real = WIN11 && (w.material === 'acrylic' || w.material === 'mica');
  const win = new BrowserWindow({ x: w.x, y: w.y, width: w.w, height: w.h, frame: false, transparent: !real,
    backgroundColor: '#00000000', ...(real ? { backgroundMaterial: w.material, roundedCorners: true } : { hasShadow: false }),
    skipTaskbar: true, resizable: !w.locked, movable: !w.locked, minimizable: false, maximizable: false,
    fullscreenable: false, show: false, focusable: true, alwaysOnTop: !!w.onTop,
    title: w.onTop ? 'FGWidget+top' : 'FGWidget', webPreferences: webPrefs });
  wins[id] = win;
  win.on('page-title-updated', (e) => e.preventDefault()); // el motor nativo identifica los widgets por el título
  win.loadFile(path.join(__dirname, 'renderer', 'widget.html'), { query: { id, real: real ? '1' : '0' } });
  win.once('ready-to-show', () => { win.showInactive(); reloadEngine(); });
  const sync = () => {
    if (win.isDestroyed() || !cfg.widgets[id]) return;
    const b = win.getBounds();
    Object.assign(cfg.widgets[id], { x: b.x, y: b.y, w: b.width, h: b.height });
    saveSoon();
  };
  win.on('moved', sync);
  win.on('resized', sync);
  let posT;
  win.on('move', () => { clearTimeout(posT); posT = setTimeout(() => !win.isDestroyed() && win.webContents.send('widget:bounds', win.getBounds()), 16); });
  win.on('closed', () => { delete wins[id]; });
  const pop = (e) => { e?.preventDefault?.(); widgetMenu(id, win).popup({ window: win }); };
  win.webContents.on('context-menu', pop);
  win.on('system-context-menu', pop); // clic derecho sobre zona arrastrable
}

function reopenWidget(id) {
  const win = wins[id];
  if (!win) return openWidget(id);
  win.once('closed', () => setTimeout(() => openWidget(id), 50));
  win.close();
}

function patchWidget(id, p, sender) {
  const w = cfg.widgets[id];
  if (!w) return null;
  const { opts, ...rest } = p;
  Object.assign(w, rest);
  if (opts) w.opts = { ...w.opts, ...opts };
  saveSoon();
  const win = wins[id];
  if (p.enabled === false && win) win.close();
  else if (p.enabled === true && !win && !widgetsHidden) openWidget(id);
  else if (win) {
    if ('material' in p) return reopenWidget(id), w;
    if ('onTop' in p) { win.setAlwaysOnTop(!!p.onTop); win.setTitle(p.onTop ? 'FGWidget+top' : 'FGWidget'); reloadEngine(); }
    if ('locked' in p) { win.setMovable(!p.locked); win.setResizable(!p.locked); }
    if ('w' in p || 'h' in p) win.setBounds({ ...win.getBounds(), width: w.w, height: w.h });
    if (win.webContents !== sender) win.webContents.send('widget:update', w);
  }
  if (mgr && !mgr.isDestroyed() && mgr.webContents !== sender) mgr.webContents.send('widgets:changed');
  return w;
}

function setWidgetsVisible(v) {
  widgetsHidden = !v;
  for (const id of Object.keys(cfg.widgets)) {
    if (v && cfg.widgets[id].enabled) openWidget(id);
    if (!v && wins[id]) wins[id].close();
  }
  buildTray();
}
function lockAll(on) {
  for (const id of Object.keys(cfg.widgets)) patchWidget(id, { locked: on });
  cfg.locked = on; saveSoon(); buildTray();
}

// ------------------------------------------------------------ bandeja
function buildTray() {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'renderer', 'tray.png')).resize({ width: 16, height: 16 }));
    tray.setToolTip('FolderGlow Studio');
    tray.on('click', openManager);
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir FolderGlow Studio', click: openManager },
    { label: 'Aplicaciones', click: () => openLauncher() },
    { label: widgetsHidden ? 'Mostrar widgets' : 'Ocultar widgets', click: () => setWidgetsVisible(widgetsHidden) },
    { label: 'Bloquear todos los widgets', type: 'checkbox', checked: !!cfg.locked, click: (m) => lockAll(m.checked) },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ------------------------------------------------------------ iconos
function buildIco(frames) {
  const n = frames.length;
  const head = Buffer.alloc(6 + 16 * n);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  let off = head.length;
  const bufs = [];
  frames.forEach((f, i) => {
    const png = Buffer.from(f.png, 'base64');
    const o = 6 + 16 * i, s = f.size >= 256 ? 0 : f.size;
    head.writeUInt8(s, o); head.writeUInt8(s, o + 1); head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(png.length, o + 8); head.writeUInt32LE(off, o + 12);
    off += png.length; bufs.push(png);
  });
  return Buffer.concat([head, ...bufs]);
}
const attrib = (flags, p) => run('attrib', [...flags, p]);
const ps = (script) => run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
const q = (s) => s.replace(/'/g, "''");

async function cleanFolder(folder) {
  const ini = path.join(folder, 'desktop.ini');
  if (fs.existsSync(ini)) await attrib(['-s', '-h'], ini);
  for (const f of fs.readdirSync(folder)) {
    if (/^folderglow_.*\.ico$/.test(f)) {
      const p = path.join(folder, f);
      await attrib(['-s', '-h'], p);
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }
}
async function applyFolder(folder, ico) {
  await cleanFolder(folder);
  const name = `folderglow_${Date.now()}.ico`;
  const icoPath = path.join(folder, name), ini = path.join(folder, 'desktop.ini');
  fs.writeFileSync(icoPath, ico);
  fs.writeFileSync(ini, `[.ShellClassInfo]\r\nIconResource=${name},0\r\n`);
  await attrib(['+s', '+h'], icoPath);
  await attrib(['+s', '+h'], ini);
  await attrib(['+r'], folder);
}
async function applyShortcut(p, ico) {
  const dir = path.join(app.getPath('userData'), 'icons');
  fs.mkdirSync(dir, { recursive: true });
  const stem = path.basename(p, path.extname(p));
  const icoPath = path.join(dir, `${stem}_${Date.now()}.ico`);
  fs.writeFileSync(icoPath, ico);
  let lnk = p, extra = '';
  if (p.toLowerCase().endsWith('.exe')) {
    lnk = path.join(app.getPath('desktop'), stem + '.lnk');
    extra = `$s.TargetPath='${q(p)}';$s.WorkingDirectory='${q(path.dirname(p))}';`;
  }
  await ps(`$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(lnk)}');${extra}$s.IconLocation='${q(icoPath)},0';$s.Save()`);
}
ipcMain.handle('icons:apply', async (e, { items, frames }) => {
  const ico = buildIco(frames), out = [];
  for (const p of items) {
    try { fs.statSync(p).isDirectory() ? await applyFolder(p, ico) : await applyShortcut(p, ico); out.push({ p, ok: true }); }
    catch (err) { out.push({ p, ok: false, msg: err.message }); }
  }
  await run('ie4uinit.exe', ['-show']);
  return out;
});
ipcMain.handle('icons:restore', async (e, items) => {
  for (const p of items) {
    try {
      if (fs.statSync(p).isDirectory()) {
        await cleanFolder(p);
        const ini = path.join(p, 'desktop.ini');
        if (fs.existsSync(ini)) fs.unlinkSync(ini);
        await attrib(['-r'], p);
      } else if (p.toLowerCase().endsWith('.lnk')) {
        await ps(`$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(p)}');$s.IconLocation='';$s.Save()`);
      }
    } catch (_) {}
  }
  await run('ie4uinit.exe', ['-show']);
  return true;
});
ipcMain.handle('pick:folders', async () => {
  const r = await dialog.showOpenDialog(mgr, { properties: ['openDirectory', 'multiSelections'] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('pick:children', async () => {
  const r = await dialog.showOpenDialog(mgr, { properties: ['openDirectory'] });
  if (r.canceled) return [];
  const base = r.filePaths[0];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !/^[$.]/.test(d.name)).map((d) => path.join(base, d.name));
});
ipcMain.handle('pick:apps', async () => {
  const r = await dialog.showOpenDialog(mgr, { properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Apps y accesos directos', extensions: ['exe', 'lnk'] }] });
  return r.canceled ? [] : r.filePaths;
});

// ------------------------------------------------------------ datos (en el proceso principal: sin CORS, con caché compartida)
const cache = new Map();
async function cached(key, ttl, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttl) return c.v;
  if (c?.p) return c.p;
  const p = fn().then((v) => { cache.set(key, { t: Date.now(), v }); return v; })
    .catch((e) => { cache.delete(key); if (c?.v) return c.v; throw e; });
  cache.set(key, { ...(c || {}), p });
  return p;
}
const getJSON = async (url, headers = {}) => {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'FolderGlow-Studio', Accept: 'application/vnd.github+json', ...headers } });
  if (!r.ok) throw new Error(r.status === 403 ? 'Límite de GitHub alcanzado: añade un token en Ajustes' : `HTTP ${r.status}`);
  return r.json();
};
const ghAuth = () => (cfg.ghToken ? { Authorization: `Bearer ${cfg.ghToken}` } : {});

function parseContrib(html) {
  const days = [];
  const tips = {};
  for (const m of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = parseInt(m[2].replace(/,/g, ''), 10);
    tips[m[1]] = Number.isFinite(n) ? n : 0;
  }
  for (const m of html.matchAll(/<td\b[^>]*ContributionCalendar-day[^>]*>/g)) {
    const t = m[0];
    const d = /data-date="([\d-]+)"/.exec(t)?.[1];
    if (!d) continue;
    const id = /\bid="([^"]+)"/.exec(t)?.[1];
    const l = +(/data-level="(\d)"/.exec(t)?.[1] || 0);
    days.push({ d, l, c: id in tips ? tips[id] : (l ? 1 : 0) });
  }
  days.sort((a, b) => (a.d < b.d ? -1 : 1));
  const total = +((/([\d,]+)\s+contributions?\s+in the last year/i.exec(html)?.[1] || '0').replace(/,/g, ''))
    || days.reduce((a, x) => a + x.c, 0);
  let longest = 0, run = 0;
  for (const x of days) { run = x.c > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let streak = 0, i = days.length - 1;
  if (i >= 0 && days[i].c === 0) i--; // hoy aún sin contribuciones no rompe la racha
  for (; i >= 0 && days[i].c > 0; i--) streak++;
  return { days, total, streak, longest };
}

async function ghData(user) {
  const u = encodeURIComponent(user);
  return cached('gh:' + user.toLowerCase(), 30 * 60 * 1000, async () => {
    const H = ghAuth();
    const year = new Date().getFullYear();
    const [profile, repos, html, prs, commits] = await Promise.all([
      getJSON(`https://api.github.com/users/${u}`, H),
      getJSON(`https://api.github.com/users/${u}/repos?per_page=100&sort=updated&type=owner`, H).catch(() => []),
      net.fetch(`https://github.com/users/${u}/contributions`, { headers: { 'User-Agent': 'FolderGlow-Studio' } }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      getJSON(`https://api.github.com/search/issues?q=author:${u}+type:pr&per_page=1`, H).then((r) => r.total_count).catch(() => null),
      getJSON(`https://api.github.com/search/commits?q=author:${u}+committer-date:>=${year}-01-01&per_page=1`, H).then((r) => r.total_count).catch(() => null),
    ]);
    const langs = {};
    let stars = 0;
    for (const r of repos) {
      stars += r.stargazers_count || 0;
      if (r.language && !r.fork) langs[r.language] = (langs[r.language] || 0) + 1;
    }
    const totLang = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
    const top = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, c]) => ({ n, p: Math.round((100 * c) / totLang) }));
    return {
      login: profile.login, name: profile.name, avatar: profile.avatar_url, followers: profile.followers, repos: profile.public_repos,
      stars, prs, commits, year, langs: top,
      recent: repos.slice(0, 5).map((r) => ({ n: r.name, s: r.stargazers_count })),
      contrib: html ? parseContrib(html) : { days: [], total: 0, streak: 0, longest: 0 },
    };
  });
}
ipcMain.handle('data:github', (e, user) => (user ? ghData(user.trim()).catch((err) => ({ error: err.message })) : { error: 'sin usuario' }));

async function weather(city) {
  return cached('wx:' + city.toLowerCase(), 20 * 60 * 1000, async () => {
    const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es`);
    const p = g.results?.[0];
    if (!p) throw new Error('Ciudad no encontrada');
    const f = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
      '&hourly=temperature_2m,weather_code&forecast_hours=7&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5');
    return { place: p.name, cur: f.current, daily: f.daily, hourly: f.hourly };
  });
}
ipcMain.handle('data:weather', (e, city) => weather(city || 'Lima').catch((err) => ({ error: err.message })));

let prevCpu = os.cpus();
ipcMain.handle('sys:stats', () => {
  const cur = os.cpus();
  let idle = 0, tot = 0;
  cur.forEach((c, i) => {
    for (const k in c.times) tot += c.times[k] - prevCpu[i].times[k];
    idle += c.times.idle - prevCpu[i].times.idle;
  });
  prevCpu = cur;
  let disk = null;
  try {
    const s = fs.statfsSync(process.env.SystemDrive ? process.env.SystemDrive + '\\' : '/');
    disk = Math.round(100 * (1 - s.bavail / s.blocks));
  } catch (_) {}
  return { cpu: tot ? Math.round(100 * (1 - idle / tot)) : 0, ram: Math.round(100 * (1 - os.freemem() / os.totalmem())),
    disk, ramGB: +(os.totalmem() / 2 ** 30).toFixed(1), up: os.uptime() };
});

// ------------------------------------------------------------ fondos de pantalla
const WALLS = [
  { id: 'atardecer', n: 'Atardecer' }, { id: 'oceano', n: 'Océano' }, { id: 'lavanda', n: 'Lavanda' },
  { id: 'bosque', n: 'Bosque' }, { id: 'grafito', n: 'Grafito' }, { id: 'pixel', n: 'Pixel noche' },
];
const WALL_CACHE = path.join(app.getPath('userData'), 'walls');
const TRANSCODED = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
let wallVer = 0;
function broadcast(ch, ...a) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(ch, ...a);
}
let regWall = { t: 0, v: null };
function regWallpaper() { // ruta del fondo que Windows tiene configurado ahora mismo
  if (process.platform !== 'win32') return null;
  if (Date.now() - regWall.t < 1500) return regWall.v;
  let v = null;
  try {
    const out = require('child_process').execFileSync('reg', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper'], { encoding: 'utf8', windowsHide: true, timeout: 2500 });
    const m = out.match(/WallPaper\s+REG_SZ\s+(.+)/i);
    v = m ? m[1].trim() : null;
  } catch (_) {}
  regWall = { t: Date.now(), v };
  return v;
}
let wallStamp = '';
function currentWall() { // copia el fondo real de Windows a un .jpg que Chromium pueda leer
  fs.mkdirSync(WALL_CACHE, { recursive: true });
  const dst = path.join(WALL_CACHE, 'actual.jpg');
  try {
    const reg = regWallpaper();
    const ok = (p) => p && fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0;
    const regOk = ok(reg) && /\.(jpe?g|png|bmp|webp)$/i.test(reg);
    const src = regOk ? reg : ok(TRANSCODED) ? TRANSCODED : cfg.wallpaper;
    if (ok(src)) {
      const st = fs.statSync(src);
      const stamp = src + '|' + st.mtimeMs + '|' + st.size;
      if (!fs.existsSync(dst) || stamp !== wallStamp) { fs.copyFileSync(src, dst); wallStamp = stamp; }
      wallVer = Math.round(st.mtimeMs) + st.size;
    }
  } catch (_) {}
  return fs.existsSync(dst) ? fileUrlOf(dst) + '?v=' + wallVer : null;
}
const fileUrlOf = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '');
async function setWallpaper(file) {
  if (process.platform !== 'win32' || !fs.existsSync(glassExe())) return false;
  const r = await run(glassExe(), ['--wallpaper', file]);
  cfg.wallpaper = file; saveSoon();
  setTimeout(() => broadcast('wall:changed'), 600);
  return !r.e;
}
ipcMain.handle('wall:list', () => WALLS);
ipcMain.handle('wall:get', () => ({ url: currentWall(), displays: screen.getAllDisplays().map((d) => d.bounds) }));
ipcMain.handle('wall:set', async (e, id) => {
  const w = WALLS.find((x) => x.id === id);
  if (!w) return false;
  fs.mkdirSync(WALL_CACHE, { recursive: true });
  const dst = path.join(WALL_CACHE, id + '.jpg'); // Windows no lee dentro del .asar: copiamos a una ruta real
  if (!fs.existsSync(dst)) fs.writeFileSync(dst, fs.readFileSync(path.join(__dirname, 'renderer', 'walls', id + '.jpg')));
  return setWallpaper(dst);
});
ipcMain.handle('wall:pick', async () => {
  const r = await dialog.showOpenDialog(mgr, { title: 'Elegir fondo de pantalla', properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }] });
  if (r.canceled) return false;
  return setWallpaper(r.filePaths[0]);
});
try { fs.watch(path.dirname(TRANSCODED), { persistent: false }, (ev, f) => { if (f === 'TranscodedWallpaper') { clearTimeout(wallT); wallT = setTimeout(() => broadcast('wall:changed'), 800); } }); } catch (_) {}
let wallT;

// ------------------------------------------------------------ música (sesión multimedia de Windows: Spotify, YouTube, etc.)
const MEDIA_PS = String.raw`
$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|?{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1'})[0]
function Await($op,[Type]$t){$m=$asTask.MakeGenericMethod($t);$k=$m.Invoke($null,@($op));$k.Wait(-1)|Out-Null;$k.Result}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]|Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]|Out-Null
$mgr=Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$last=''
while($true){
  $cmd=[Console]::In.ReadLine(); if($cmd -eq $null){break}
  $s=$mgr.GetCurrentSession()
  if(!$s){'{"none":true}';continue}
  if($cmd -eq 'toggle'){Await ($s.TryTogglePlayPauseAsync()) ([bool])|Out-Null}
  if($cmd -eq 'next'){Await ($s.TrySkipNextAsync()) ([bool])|Out-Null}
  if($cmd -eq 'prev'){Await ($s.TrySkipPreviousAsync()) ([bool])|Out-Null}
  $p=Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $i=$s.GetPlaybackInfo(); $t=$s.GetTimelineProperties()
  $o=@{title=$p.Title;artist=$p.Artist;app=$s.SourceAppUserModelId;playing=($i.PlaybackStatus -eq 4);pos=$t.Position.TotalSeconds;dur=$t.EndTime.TotalSeconds}
  $key="$($p.Title)|$($p.Artist)"
  if($key -ne $last -and $p.Thumbnail){
    try{$st=Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType]);$ns=[System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st);$ms=New-Object IO.MemoryStream;$ns.CopyTo($ms);$o.thumb=[Convert]::ToBase64String($ms.ToArray())}catch{}
    $last=$key
  }
  $o|ConvertTo-Json -Compress
}`;
let mediaProc = null, mediaQ = [], mediaBuf = '', mediaThumb = null, mediaIdleT;
function mediaCmd(cmd) {
  if (process.platform !== 'win32') return Promise.resolve({ none: true });
  if (!mediaProc) {
    const f = path.join(app.getPath('userData'), 'media.ps1');
    fs.writeFileSync(f, '﻿' + MEDIA_PS, 'utf8');
    mediaProc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', f], { windowsHide: true });
    mediaProc.stdout.on('data', (b) => {
      mediaBuf += b;
      let i;
      while ((i = mediaBuf.indexOf('\n')) >= 0) {
        const line = mediaBuf.slice(0, i).trim(); mediaBuf = mediaBuf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        let o = {};
        try { o = JSON.parse(line); } catch (_) {}
        if (o.none) mediaThumb = null;
        else if (o.thumb) mediaThumb = 'data:image/png;base64,' + o.thumb;
        o.thumb = mediaThumb;
        mediaQ.shift()?.(o);
      }
    });
    mediaProc.on('exit', () => { mediaProc = null; mediaQ.splice(0).forEach((r) => r({ none: true })); });
  }
  // ahorro: si ningún widget de música pregunta en 30 s, se cierra el proceso de PowerShell
  clearTimeout(mediaIdleT);
  mediaIdleT = setTimeout(() => { mediaProc?.kill(); mediaProc = null; }, 30000);
  return new Promise((res) => { mediaQ.push(res); mediaProc.stdin.write(cmd + '\n'); setTimeout(() => { const k = mediaQ.indexOf(res); if (k >= 0) { mediaQ.splice(k, 1); res({ none: true }); } }, 6000); });
}
ipcMain.handle('media:cmd', (e, c) => mediaCmd(['get', 'toggle', 'next', 'prev'].includes(c) ? c : 'get'));

// ------------------------------------------------------------ red y acciones del sistema
let netPrev = null;
ipcMain.handle('sys:net', async () => {
  if (process.platform !== 'win32') return { down: 0, up: 0 };
  const r = await run('netstat', ['-e']);
  const m = /(?:Bytes|Bytes recibidos|Bytes)\s+(\d+)\s+(\d+)/i.exec(r.so || '') || /\b(\d{6,})\s+(\d{6,})\b/.exec(r.so || '');
  if (!m) return { down: 0, up: 0 };
  const now = { t: Date.now(), rx: +m[1], tx: +m[2] };
  const p = netPrev; netPrev = now;
  if (!p) return { down: 0, up: 0 };
  const dt = (now.t - p.t) / 1000;
  return { down: Math.max(0, (now.rx - p.rx) / dt), up: Math.max(0, (now.tx - p.tx) / dt) };
});
ipcMain.handle('sys:action', async (e, a) => {
  const ask = async (msg) => (await dialog.showMessageBox({ type: 'question', buttons: ['Cancelar', 'Sí'], defaultId: 1, cancelId: 0, message: msg })).response === 1;
  if (a === 'lock') return run('rundll32.exe', ['user32.dll,LockWorkStation']);
  if (a === 'sleep') return run('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
  if (a === 'restart' && await ask('¿Reiniciar el equipo ahora?')) return run('shutdown', ['/r', '/t', '0']);
  if (a === 'logoff' && await ask('¿Cerrar sesión ahora?')) return run('shutdown', ['/l']);
  if (a === 'settings') return shell.openExternal('ms-settings:');
  if (a === 'files') return shell.openPath(app.getPath('home'));
  return false;
});
ipcMain.handle('pick:image', async (e, folder) => {
  const r = await dialog.showOpenDialog({ title: folder ? 'Carpeta de fotos' : 'Elegir imagen', properties: [folder ? 'openDirectory' : 'openFile'],
    filters: folder ? [] : [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('photos:list', (e, dir) => {
  try { return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)).slice(0, 200).map((f) => fileUrlOf(path.join(dir, f))); } catch (_) { return []; }
});
// apps para la carpeta de apps (comparte el escaneo del lanzador)
ipcMain.handle('apps:category', async (e, cat, n = 9) => {
  const apps = await loadApps(false);
  const counts = cfg.launcher.counts || {};
  const list = cat === 'Favoritos' ? [...apps].sort((a, b) => (counts[b.n] || 0) - (counts[a.n] || 0))
    : apps.filter((a) => categorize(a.n) === cat);
  return list.filter((a) => !UNINSTALL.test(a.n)).slice(0, n);
});
ipcMain.handle('apps:run', (e, a) => {
  if (a.id && !/["\r\n]/.test(a.id)) spawn('explorer.exe', [`shell:AppsFolder\\${a.id}`], { detached: true, stdio: 'ignore' }).unref();
  else if (a.lnk) shell.openPath(a.lnk);
  cfg.launcher.counts[a.n] = (cfg.launcher.counts[a.n] || 0) + 1; saveSoon();
  return true;
});
const CATS = [
  ['Juegos', /steam|epic|battle\.?net|riot|valorant|league|minecraft|xbox|ubisoft|uplay|ea app|origin|gog|roblox|itch|playnite|heroic|lutris|game|juego|launcher|genshin|fortnite/i],
  ['Creatividad', /photoshop|illustrator|premiere|after effects|lightroom|figma|blender|gimp|krita|inkscape|canva|davinci|capcut|clip studio|paint|obs|audacity|sketchup|lumion|twinmotion|enscape/i],
  ['Productividad', /word|excel|powerpoint|outlook|onenote|access|project|teams|notion|obsidian|acrobat|pdf|office|libreoffice|revit|autocad|navisworks|civil|power bi|calendar|correo|mail|todo|planner|evernote|zoom|slack|dynamo|sap|primavera|ms project/i],
  ['Social', /whatsapp|telegram|discord|messenger|instagram|facebook|twitter|tiktok|signal|skype|wechat|line\b/i],
  ['Entretenimiento', /spotify|netflix|prime video|disney|youtube|vlc|music|música|tv|crunchyroll|max\b|twitch|plex|kodi|stremio|media player|fotos|photos|reproductor/i],
  ['Internet', /chrome|edge|firefox|brave|opera|vivaldi|tor browser|arc\b|zen\b/i],
  ['Desarrollo', /visual studio|code|vscode|git|python|node|android studio|intellij|pycharm|unity|unreal|docker|postman|terminal|powershell|wsl|cursor|claude|chatgpt|copilot/i],
];
function categorize(n) { for (const [c, re] of CATS) if (re.test(n)) return c; return 'Utilidades'; }
ipcMain.handle('apps:categories', async () => {
  const apps = (await loadApps(false)).filter((a) => !UNINSTALL.test(a.n));
  const out = {};
  for (const a of apps) (out[categorize(a.n)] = out[categorize(a.n)] || []).push(a);
  return out;
});

// ------------------------------------------------------------ plantillas (fondo + estilo + widgets ordenados)
// Posiciones en una cuadrícula de 12 columnas sobre el área de trabajo del monitor principal: [col, fila, ancho, alto]
const TEMPLATES = [
  { id: 'ipad', n: 'iPad Glass', wall: 'atardecer', d: 'Vidrio claro sobre el fondo, como iPadOS', style: { theme: 'glass', material: 'glass', accent: '#ff9f0a' },
    widgets: [['clock', [0, 0, 2, 2], { style: 'ipad' }], ['calendar', [2, 0, 2, 2]], ['weather', [4, 0, 4, 2], { style: 'ipad' }],
      ['photos', [0, 2, 4, 4]], ['battery', [4, 2, 4, 2], { style: 'rings' }], ['appfolder', [4, 4, 2, 2], { cat: 'Favoritos' }], ['appfolder', [6, 4, 2, 2], { cat: 'Entretenimiento' }]] },
  { id: 'bosque', n: 'Bosque', wall: 'bosque', d: 'Reloj gigante y vidrio verde oscuro', style: { theme: 'forest', material: 'glass', accent: '#8ed1a7' },
    widgets: [['clock', [3, 0, 6, 3], { style: 'giant' }], ['calendar', [0, 0, 2, 2], { style: 'mini' }], ['clock', [0, 2, 2, 2], { style: 'analog' }],
      ['battery', [0, 4, 2, 2]], ['music', [9, 0, 3, 2]], ['appfolder', [10, 2, 2, 2], { cat: 'Productividad' }], ['appfolder', [10, 4, 2, 2], { cat: 'Juegos' }], ['appfolder', [8, 4, 2, 2], { cat: 'Social' }]] },
  { id: 'bento', n: 'Bento', wall: 'grafito', d: 'Tablero de tarjetas negras tipo startpage', style: { theme: 'mono', material: 'none', accent: '#ffffff', opacity: 0.96 },
    widgets: [['profile', [0, 0, 3, 3]], ['weather', [3, 0, 4, 2], { style: 'bento' }], ['music', [7, 0, 3, 3]], ['clock', [3, 2, 4, 1], { style: 'bento' }],
      ['system', [0, 3, 3, 2], { style: 'bars' }], ['quote', [3, 3, 4, 2]], ['actions', [7, 3, 3, 2]], ['appfolder', [10, 0, 1, 5], { cat: 'Favoritos', style: 'dock' }]] },
  { id: 'lavanda', n: 'Lavanda', wall: 'lavanda', d: 'Anillos de uso y conexión en violeta', style: { theme: 'lavender', material: 'glass', accent: '#bf5af2' },
    widgets: [['clock', [0, 0, 3, 1], { style: 'text' }], ['battery', [0, 1, 2, 2], { style: 'icon' }], ['system', [2, 1, 2, 2], { style: 'ram' }],
      ['system', [0, 3, 4, 2], { style: 'donuts' }], ['network', [0, 5, 4, 2]]] },
  { id: 'retro', n: 'Retro pixel', wall: 'pixel', d: 'Ventanas de 8 bits: pomodoro y notas', style: { theme: 'retro', material: 'none', accent: '#2b4bd9', opacity: 1 },
    widgets: [['pomodoro', [1, 1, 4, 3], { style: 'retro', title: 'Toma un descanso' }], ['notes', [6, 1, 3, 3], { text: '★ tomar agua\n★ estirarse\n★ descansar la vista' }],
      ['clock', [6, 0, 3, 1], { style: 'retro' }]] },
];
ipcMain.handle('templates:list', () => TEMPLATES.map(({ id, n, wall, d, widgets, style }) => ({ id, n, wall, d, theme: style.theme, count: widgets.length, boxes: widgets.map(([t, b, o]) => [t, b, o?.style]) })));
ipcMain.handle('templates:apply', async (e, id, replace) => {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return false;
  if (replace) for (const wid of Object.keys(cfg.widgets)) { if (wins[wid]) wins[wid].close(); delete cfg.widgets[wid]; }
  const wa = screen.getPrimaryDisplay().workArea;
  const M = Math.round(wa.width * 0.025), GAP = Math.round(wa.width * 0.0105);
  const cell = Math.floor((wa.width - 2 * M - 11 * GAP) / 12);
  const rows = Math.floor((wa.height - 2 * M + GAP) / (cell + GAP));
  const scale = Math.min(1, rows / 7); // monitores bajos: la plantilla se encoge en vertical
  const c = Math.floor(cell * scale), g = Math.floor(GAP * scale);
  for (const [type, [x, y, w, h], opts] of t.widgets) {
    const d = WTYPES[type];
    const wid = `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    // +16 px: el panel tiene 8 px de margen para la sombra
    cfg.widgets[wid] = { id: wid, type, enabled: true, x: wa.x + M + x * (c + g) - 8, y: wa.y + M + y * (c + g) - 8,
      w: w * c + (w - 1) * g + 16, h: h * c + (h - 1) * g + 16, theme: t.style.theme, material: t.style.material,
      opacity: t.style.opacity ?? 0.82, accent: t.style.accent, onTop: false, locked: true, template: t.id, opts: { ...d.opts, ...(opts || {}) } };
    if (!widgetsHidden) openWidget(wid);
  }
  saveSoon();
  const wf = path.join(WALL_CACHE, t.wall + '.jpg');
  fs.mkdirSync(WALL_CACHE, { recursive: true });
  if (!fs.existsSync(wf)) fs.writeFileSync(wf, fs.readFileSync(path.join(__dirname, 'renderer', 'walls', t.wall + '.jpg')));
  await setWallpaper(wf);
  if (mgr && !mgr.isDestroyed()) mgr.webContents.send('widgets:changed');
  return true;
});

// ------------------------------------------------------------ IPC widgets
ipcMain.handle('widgets:list', () => cfg.widgets);
ipcMain.handle('widgets:types', () => Object.keys(WTYPES));
ipcMain.handle('widget:get', (e, id) => cfg.widgets[id]);
const PRESETS = { // entradas de la galería que son un estilo de otro widget
  appbubbles: { type: 'appfolder', w: 380, h: 380, opts: { style: 'bubbles', cat: 'Favoritos' } },
  apphdock: { type: 'appfolder', w: 640, h: 140, opts: { style: 'hdock', cat: 'Favoritos' } },
};
ipcMain.handle('widgets:add', (e, kind) => {
  const pre = PRESETS[kind];
  const type = pre ? pre.type : kind;
  const d = pre ? { ...WTYPES[type], w: pre.w, h: pre.h, opts: { ...WTYPES[type].opts, ...pre.opts } } : WTYPES[type];
  if (!d) return null;
  const wa = screen.getPrimaryDisplay().workArea;
  const n = Object.keys(cfg.widgets).length;
  const id = `${type}-${Date.now().toString(36)}`;
  cfg.widgets[id] = { id, type, enabled: true, x: wa.x + wa.width - d.w - 40 - (n % 4) * 24, y: wa.y + 40 + (n % 8) * 24,
    w: d.w, h: d.h, theme: 'glass', material: 'glass', opacity: 0.82, accent: '#0a84ff', onTop: false, locked: false, opts: { ...d.opts } };
  saveSoon();
  if (!widgetsHidden) openWidget(id);
  return cfg.widgets[id];
});
ipcMain.handle('widgets:remove', (e, id) => {
  if (wins[id]) wins[id].close();
  delete cfg.widgets[id];
  saveSoon();
  return true;
});
ipcMain.handle('widgets:update', (e, id, patch) => patchWidget(id, patch, e.sender));

// ------------------------------------------------------------ ajustes
ipcMain.handle('settings:get', () => ({ eco: !!cfg.eco, ghToken: cfg.ghToken ? '••••' + cfg.ghToken.slice(-4) : '', win11: WIN11,
  autostart: app.getLoginItemSettings().openAtLogin }));
ipcMain.handle('settings:set', (e, p) => {
  if ('eco' in p) cfg.eco = !!p.eco;
  if ('ghToken' in p) { cfg.ghToken = String(p.ghToken || '').trim(); cache.clear(); }
  if ('autostart' in p) app.setLoginItemSettings({ openAtLogin: !!p.autostart, args: ['--hidden'] });
  saveSoon();
  return true;
});
ipcMain.handle('app:relaunch', () => { quitting = true; app.relaunch(); app.quit(); });
ipcMain.handle('tools:install', (e, id) => {
  if (!/^[\w.\-]+$/.test(id)) return false;
  spawn('cmd.exe', ['/c', 'start', 'FolderGlow', 'cmd.exe', '/k',
    `winget install --id ${id} -e --accept-package-agreements --accept-source-agreements`],
  { detached: true, stdio: 'ignore' }).unref();
  return true;
});
ipcMain.handle('open:url', (e, url) => (/^https:\/\//.test(url) ? shell.openExternal(url) : null));

// ------------------------------------------------------------ lanzador de apps (estilo GNOME)
const APPS_DIR = path.join(app.getPath('userData'), 'apps');
let launcher = null, launcherIdleT = null, appsCache = null;
const UNINSTALL = /(uninstall|desinstal|uninst\b|remove\b|readme|léame|help|ayuda|website|sitio web|release notes)/i;

function scanShortcuts() { // respaldo si el escaneo nativo falla: accesos directos del menú Inicio
  const roots = [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
  const out = [];
  const walk = (d, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (/\.(lnk|url)$/i.test(e.name)) out.push({ n: e.name.replace(/\.(lnk|url)$/i, ''), lnk: p });
    }
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}

const fileUrl = (p, v) => 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '') + (v ? '?v=' + v : '');
const hashName = (s) => require('crypto').createHash('md5').update(s.toLowerCase()).digest('hex').slice(0, 12);
// Extrae iconos de 256 px con el motor nativo (una sola llamada para todo el lote)
async function nativeIcons(pairs) {
  const todo = pairs.filter(([, dst]) => !fs.existsSync(dst));
  if (!todo.length || process.platform !== 'win32' || !fs.existsSync(glassExe())) return;
  const list = path.join(os.tmpdir(), `fg-icons-${process.pid}.txt`);
  fs.writeFileSync(list, todo.map(([s, d]) => `${s}\t${d}`).join('\n'), 'utf8');
  await run(glassExe(), ['--icons', list]);
  try { fs.unlinkSync(list); } catch (_) {}
}
function desktopShortcuts() {
  const dirs = [app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')];
  const out = [];
  for (const d of dirs) {
    let ents = [];
    try { ents = fs.readdirSync(d); } catch (_) { continue; }
    for (const e of ents) if (/\.(lnk|url)$/i.test(e)) out.push({ n: e.replace(/\.(lnk|url)$/i, ''), lnk: path.join(d, e) });
  }
  return out;
}

async function loadApps(force) {
  if (appsCache && !force) return appsCache;
  const jsonPath = path.join(APPS_DIR, 'apps.json');
  fs.mkdirSync(path.join(APPS_DIR, 'lnk'), { recursive: true });
  if (process.platform === 'win32' && fs.existsSync(glassExe()) && (force || !fs.existsSync(jsonPath))) {
    await run(glassExe(), ['--apps', APPS_DIR]);
  }
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).map((a) => ({
      n: a.n, id: a.id, icon: a.i ? fileUrl(path.join(APPS_DIR, a.i), force ? Date.now() : 1) : null }));
  } catch (_) {}
  // Siempre sumamos accesos directos del menú Inicio y del escritorio: ahí suelen estar juegos y programas portables
  const names = new Set(list.map((a) => a.n.toLowerCase()));
  const extra = [...scanShortcuts(), ...desktopShortcuts()].filter((s) => !names.has(s.n.toLowerCase()) && names.add(s.n.toLowerCase()));
  const pairs = extra.map((s) => [s.lnk, path.join(APPS_DIR, 'lnk', hashName(s.lnk) + '.png')]);
  await nativeIcons(pairs);
  for (let i = 0; i < extra.length; i++) {
    let icon = fs.existsSync(pairs[i][1]) ? fileUrl(pairs[i][1]) : null;
    if (!icon) try { icon = (await app.getFileIcon(extra[i].lnk, { size: 'large' })).toDataURL(); } catch (_) {}
    list.push({ n: extra[i].n, lnk: extra[i].lnk, icon });
  }
  appsCache = list.filter((a) => a.n && a.n.trim()).sort((a, b) => a.n.localeCompare(b.n, 'es', { sensitivity: 'base' }));
  return appsCache;
}

// ------------------------------------------------------------ juegos (módulo games.js, estilo Playnite)
const gamesLib = require('./games')({ app, ipcMain, shell, dialog, net, run, getMgr: () => mgr, glassExe, cfg, saveSoon,
  hideLauncher: () => hideLauncher(), notifyLauncher: (ch) => launcher && !launcher.isDestroyed() && launcher.webContents.send(ch) });

function openLauncher() {
  clearTimeout(launcherIdleT);
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (launcher && !launcher.isDestroyed()) {
    if (launcher.isVisible()) return hideLauncher();
    launcher.setBounds(d.bounds);
    launcher.webContents.send('launcher:open');
    launcher.show(); launcher.focus();
    return;
  }
  launcher = new BrowserWindow({ ...d.bounds, frame: false, show: false, skipTaskbar: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, title: 'FolderGlow Apps',
    ...(WIN11 ? { backgroundMaterial: 'acrylic', backgroundColor: '#00000000' } : { transparent: true, backgroundColor: '#00000000' }),
    webPreferences: { ...webPrefs, backgroundThrottling: false } });
  launcher.setAlwaysOnTop(true, 'pop-up-menu');
  launcher.loadFile(path.join(__dirname, 'renderer', 'launcher.html'), { query: { real: WIN11 ? '1' : '0' } });
  launcher.once('ready-to-show', () => { launcher.show(); launcher.focus(); launcher.webContents.send('launcher:open'); });
  launcher.on('blur', () => hideLauncher());
  launcher.on('closed', () => { launcher = null; });
}
function hideLauncher() {
  if (!launcher || launcher.isDestroyed() || !launcher.isVisible()) return;
  launcher.webContents.send('launcher:close');
  setTimeout(() => launcher && !launcher.isDestroyed() && launcher.hide(), 130);
  // ahorro: si no se vuelve a usar en 3 min, se libera su memoria
  clearTimeout(launcherIdleT);
  launcherIdleT = setTimeout(() => launcher && !launcher.isDestroyed() && !launcher.isVisible() && launcher.destroy(), 3 * 60 * 1000);
}

ipcMain.handle('launcher:apps', async (e, force) => {
  const list = await loadApps(force);
  const hide = cfg.launcher.hideUninstall;
  return { apps: list.filter((a) => !hide || !UNINSTALL.test(a.n)), counts: cfg.launcher.counts || {} };
});
ipcMain.handle('launcher:run', (e, a) => {
  cfg.launcher.counts[a.n] = (cfg.launcher.counts[a.n] || 0) + 1;
  saveSoon();
  hideLauncher();
  if (a.id) {
    if (/["\r\n]/.test(a.id)) return false;
    spawn('explorer.exe', [`shell:AppsFolder\\${a.id}`], { detached: true, stdio: 'ignore' }).unref();
  } else if (a.lnk) shell.openPath(a.lnk);
  return true;
});
ipcMain.handle('launcher:hide', () => hideLauncher());
// vista general estilo GNOME: miniaturas de las ventanas abiertas
ipcMain.handle('launcher:windows', async () => {
  try {
    const src = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 360, height: 220 }, fetchWindowIcons: true });
    return src.filter((s) => s.name && !/^FolderGlow|^FGWidget/.test(s.name)).slice(0, 12).map((s) => ({
      h: (/^window:(\d+)/.exec(s.id) || [])[1], n: s.name, img: s.thumbnail.toDataURL(), icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null }));
  } catch (_) { return []; }
});
ipcMain.handle('launcher:focus', async (e, hwnd) => { hideLauncher(); if (/^\d+$/.test(String(hwnd))) await run(glassExe(), ['--activate', String(hwnd)]); });
ipcMain.handle('launcher:open', () => openLauncher());
ipcMain.handle('launcher:getcfg', () => ({ hotkey: cfg.launcher.hotkey, hideUninstall: cfg.launcher.hideUninstall,
  win_launcher: !!readGlass().win_launcher, hot_corner: !!readGlass().hot_corner }));
ipcMain.handle('launcher:setcfg', (e, p) => {
  if ('hotkey' in p) { cfg.launcher.hotkey = p.hotkey; registerHotkey(); }
  if ('hideUninstall' in p) cfg.launcher.hideUninstall = !!p.hideUninstall;
  if ('win_launcher' in p || 'hot_corner' in p) {
    const g = readGlass();
    if ('win_launcher' in p) g.win_launcher = !!p.win_launcher;
    if ('hot_corner' in p) g.hot_corner = !!p.hot_corner;
    writeGlass(g); startEngine();
  }
  saveSoon();
  return true;
});
function registerHotkey() {
  globalShortcut.unregisterAll();
  const k = cfg.launcher.hotkey;
  if (k) try { globalShortcut.register(k, openLauncher); } catch (_) {}
}
function startPipe() { // el motor nativo avisa por aquí (tecla Windows, esquina activa)
  if (process.platform !== 'win32') return;
  require('net').createServer((sock) => {
    sock.on('data', (b) => { if (String(b).includes('launcher')) openLauncher(); });
    sock.on('error', () => {});
  }).on('error', () => {}).listen('\\\\.\\pipe\\folderglow');
}

// ------------------------------------------------------------ desenfoque real en carpetas (ExplorerBlurMica)
// Se engancha a explorer.exe cuando este ARRANCA: tras registrarlo hay que reiniciar explorer.exe
// (las carpetas viven dentro del mismo proceso, cerrarlas y reabrirlas no basta).
const EBM_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'FolderGlow', 'ExplorerBlurMica');
const EBM_CLSID = '{887D3A6A-502E-4AF5-9CE6-D515E12AFE89}';
const EBM_LOG = path.join(app.getPath('userData'), 'blur.log');
const blog = (m) => { try { fs.appendFileSync(EBM_LOG, `[${new Date().toISOString()}] ${m}\n`); } catch (_) {} };
const allFiles = (dir, name, out = []) => {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) out.push(p);
    else if (e.isDirectory()) allFiles(p, name, out);
  }
  return out;
};
const ebmDll = () => { // el paquete puede traer x64 / ARM64 / x86: elegimos la de este equipo
  const all = allFiles(EBM_DIR, 'ExplorerBlurMica.dll');
  const want = process.arch === 'arm64' ? /arm64/i : /x64|amd64/i;
  return all.find((p) => want.test(p)) || all.find((p) => !/arm|x86|win32/i.test(p)) || all[0] || null;
};
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const EBM_DEFAULT = { effect: 3, clearAddress: true, clearBarBg: true, clearWinUIBg: true, showLine: true,
  light: { r: 220, g: 220, b: 220, a: 160 }, dark: { r: 0, g: 0, b: 0, a: 120 } };
const ebmCfgFile = () => path.join(app.getPath('userData'), 'blurmica.json');
const readEbm = () => { try { return { ...EBM_DEFAULT, ...JSON.parse(fs.readFileSync(ebmCfgFile(), 'utf8')) }; } catch (_) { return { ...EBM_DEFAULT }; } };
function writeEbmIni(c) {
  const dll = ebmDll();
  if (!dll) return false;
  const ini = `[config]\r\neffect=${c.effect}\r\nclearAddress=${!!c.clearAddress}\r\nclearBarBg=${!!c.clearBarBg}\r\n` +
    `clearWinUIBg=${!!c.clearWinUIBg}\r\nshowLine=${!!c.showLine}\r\n[light]\r\nr=${c.light.r}\r\ng=${c.light.g}\r\nb=${c.light.b}\r\na=${c.light.a}\r\n` +
    `[dark]\r\nr=${c.dark.r}\r\ng=${c.dark.g}\r\nb=${c.dark.b}\r\na=${c.dark.a}\r\n`;
  fs.writeFileSync(path.join(path.dirname(dll), 'config.ini'), ini);
  fs.writeFileSync(ebmCfgFile(), JSON.stringify(c, null, 2));
  return true;
}
async function ebmRegistered() { // la verdad está en el registro, no en nuestra configuración
  const r = await run('reg', ['query', `HKCR\\CLSID\\${EBM_CLSID}\\InprocServer32`, '/ve']);
  return (r.so || '').match(/REG_\w+\s+(.+)/)?.[1]?.trim() || null;
}
// Reinicia explorer.exe y vuelve a abrir las carpetas que tenías abiertas
const restartExplorer = () => ps(`$s=New-Object -ComObject Shell.Application; $p=@(); foreach($w in @($s.Windows())){ try{ if($w.FullName -like '*explorer.exe'){ $p+=$w.Document.Folder.Self.Path } }catch{} }; Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 1500; if(-not (Get-Process explorer -ErrorAction SilentlyContinue)){ Start-Process explorer.exe }; Start-Sleep -Milliseconds 1500; foreach($x in $p){ Start-Process explorer.exe -ArgumentList ('"'+$x+'"') }`);

ipcMain.handle('ebm:status', async () => {
  const dll = ebmDll();
  const reg = process.platform === 'win32' ? await ebmRegistered() : null;
  return { installed: !!dll, registered: !!reg, regPath: reg, dll, cfg: readEbm(), win11: WIN11, build: BUILD,
    log: fs.existsSync(EBM_LOG) ? fs.readFileSync(EBM_LOG, 'utf8').split('\n').slice(-8).join('\n') : '' };
});
ipcMain.handle('ebm:install', async (e, c) => {
  try {
    blog(`instalar · Windows build ${BUILD} · arch ${process.arch}`);
    if (!ebmDll()) {
      const rel = await getJSON('https://api.github.com/repos/Maplespe/ExplorerBlurMica/releases/latest');
      const asset = (rel.assets || []).find((a) => /\.zip$/i.test(a.name));
      blog(`release ${rel.tag_name} · asset ${asset?.name}`);
      if (!asset) throw new Error('No encontré un .zip en la última versión de GitHub.');
      const zip = path.join(os.tmpdir(), asset.name);
      const r = await net.fetch(asset.browser_download_url);
      if (!r.ok) throw new Error('Descarga fallida: HTTP ' + r.status);
      fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
      fs.mkdirSync(EBM_DIR, { recursive: true });
      const x = await ps(`Expand-Archive -LiteralPath ${psq(zip)} -DestinationPath ${psq(EBM_DIR)} -Force`);
      if (x.e) blog('Expand-Archive: ' + (x.se || x.e.message));
      blog('DLLs: ' + allFiles(EBM_DIR, 'ExplorerBlurMica.dll').join(' | '));
      if (!ebmDll()) throw new Error('El paquete no trae ExplorerBlurMica.dll. Revisa blur.log.');
    }
    const dll = ebmDll();
    blog('usando ' + dll);
    writeEbmIni({ ...readEbm(), ...(c || {}) });
    // registrar la extensión requiere administrador: Windows mostrará el aviso UAC
    const res = await ps(`try { $p=Start-Process regsvr32.exe -ArgumentList '/s',${psq('"' + dll + '"')} -Verb RunAs -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { exit 1223 }`);
    const code = res.e ? res.e.code : 0;
    blog('regsvr32 código ' + code);
    if (code === 1223) throw new Error('Cancelaste el permiso de administrador.');
    const reg = await ebmRegistered();
    blog('registro CLSID → ' + (reg || 'NO registrado'));
    if (!reg) throw new Error(`Windows no registró la DLL (código ${code}). Puede faltar el runtime de Visual C++ x64 o el antivirus la bloqueó.`);
    // evita que nuestro Mica/opacidad del Explorador pelee con el desenfoque real
    const g = readGlass(); g.explorer = 'off'; g.explorer_opacity = 100; writeGlass(g); startEngine();
    await restartExplorer();
    blog('explorer.exe reiniciado');
    return { ok: true, msg: 'Desenfoque activado: el Explorador se reinició. Si la carpeta sigue opaca en tu versión de Windows, revisa el registro abajo.' };
  } catch (err) { blog('ERROR ' + err.message); return { ok: false, msg: err.message }; }
});
ipcMain.handle('ebm:apply', async (e, c) => {
  if (!writeEbmIni({ ...readEbm(), ...c })) return { ok: false, msg: 'Primero instálalo.' };
  await restartExplorer();
  return { ok: true, msg: 'Aplicado ✓ (el Explorador se reinició)' };
});
ipcMain.handle('ebm:restart', async () => { await restartExplorer(); return { ok: true, msg: 'Explorador reiniciado' }; });
ipcMain.handle('ebm:uninstall', async () => {
  const dll = ebmDll();
  if (!dll) return { ok: true, msg: 'No estaba instalado.' };
  const res = await ps(`try { $p=Start-Process regsvr32.exe -ArgumentList '/s','/u',${psq('"' + dll + '"')} -Verb RunAs -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { exit 1223 }`);
  if (res.e && res.e.code === 1223) return { ok: false, msg: 'Cancelaste el permiso de administrador.' };
  await restartExplorer();
  return { ok: true, msg: 'Desenfoque desactivado y Explorador reiniciado.' };
});

// ------------------------------------------------------------ dock tipo macOS + barra superior (reemplazan la barra de Windows)
cfg.dock = { enabled: false, topbar: false, autohide: false, size: 52, magnify: 1.7, pinned: null, ...(cfg.dock || {}) };
let dockWin = null, topWin = null, dockPoll = null, dockWins = [], dockHidden = false, mouseT = null;
const EXE_ICONS = path.join(app.getPath('userData'), 'apps', 'exe');
const base = (p) => (p ? path.basename(String(p)).toLowerCase() : '');
const DEFAULT_PINS = [/^(explorador de archivos|file explorer)$/i, /^google chrome$/i, /^microsoft edge$/i, /^spotify/i, /^steam$/i, /^discord$/i,
  /^whatsapp$/i, /^visual studio code$/i, /^(configuración|settings)$/i];
function pinExe(a) { // ejecutable de un elemento fijado (para saber si ya está abierto)
  if (a.exe) return base(a.exe);
  if (a.lnk && /\.lnk$/i.test(a.lnk)) { try { return base(shell.readShortcutLink(a.lnk).target); } catch (_) {} }
  if (a.id && /\.exe$/i.test(a.id)) return base(a.id);
  if (/explorador de archivos|file explorer/i.test(a.n)) return 'explorer.exe';
  return '';
}
async function dockPins() {
  if (!cfg.dock.pinned) { // primera vez: apps típicas que existan en este PC
    const apps = await loadApps(false);
    cfg.dock.pinned = DEFAULT_PINS.map((re) => apps.find((a) => re.test(a.n))).filter(Boolean).map((a) => ({ n: a.n, id: a.id, lnk: a.lnk, icon: a.icon }));
    saveSoon();
  }
  return cfg.dock.pinned.map((p) => ({ ...p, exe: p.exe || pinExe(p) }));
}
async function exeIcons(exes) {
  fs.mkdirSync(EXE_ICONS, { recursive: true });
  const pairs = exes.filter(Boolean).map((e) => [e, path.join(EXE_ICONS, hashName(e) + '.png')]);
  await nativeIcons(pairs);
  const out = {};
  for (const [e, png] of pairs) out[e.toLowerCase()] = fs.existsSync(png) ? fileUrlOf(png) : null;
  return out;
}
let polling = false, lastDockData = null;
async function pollWindows() {
  if (polling || process.platform !== 'win32' || !fs.existsSync(glassExe())) return;
  polling = true;
  try { await pollWindowsInner(); } finally { polling = false; }
}
async function pollWindowsInner() {
  const r = await run(glassExe(), ['--windows']);
  try { dockWins = JSON.parse(r.so || '[]'); } catch (_) { return; }
  const pins = await dockPins();
  const icons = await exeIcons([...new Set(dockWins.map((w) => w.e))]);
  // agrupar ventanas por ejecutable, como el dock de macOS
  const groups = new Map();
  for (const w of dockWins) { const k = base(w.e) || 'w' + w.h; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); }
  const items = pins.map((p) => ({ ...p, pinned: true, wins: groups.get(p.exe) || [] }));
  const used = new Set(pins.map((p) => p.exe).filter(Boolean));
  for (const [k, ws] of groups) if (!used.has(k)) items.push({ n: ws[0].t.split(' - ').pop() || ws[0].t, exe: k, path: ws[0].e, icon: icons[(ws[0].e || '').toLowerCase()], pinned: false, wins: ws });
  for (const it of items) if (!it.icon && it.wins[0]) it.icon = icons[(it.wins[0].e || '').toLowerCase()];
  const active = dockWins.find((w) => w.a);
  const full = !!active?.f;
  const data = { items, active: active ? { t: active.t, exe: base(active.e) } : null, full };
  lastDockData = data;
  for (const w of [dockWin, topWin]) if (w && !w.isDestroyed()) w.webContents.send('dock:update', data);
  // en juegos/video a pantalla completa el dock y la barra se esconden
  if (full !== dockHidden) { dockHidden = full; for (const w of [dockWin, topWin]) if (w && !w.isDestroyed()) (full ? w.hide() : w.showInactive()); }
}
function dockGeom() {
  const d = screen.getPrimaryDisplay();
  const H = Math.round(cfg.dock.size * cfg.dock.magnify) + 46; // espacio para la ampliación y la etiqueta
  return { d, H, pill: cfg.dock.size + 20 };
}
// Todas las operaciones del dock/barra pasan por una cola: nunca se pisan entre sí.
let dockQ = Promise.resolve(), taskbarHidden = false, workT = null;
function dockQueue(fn) { const r = dockQ.then(fn); dockQ = r.catch(() => {}); return r; }
function scheduleWorkArea() { clearTimeout(workT); workT = setTimeout(applyWorkArea, 900); } // da tiempo a Explorer a recalcular
async function applyWorkArea() {
  if (process.platform !== 'win32' || !fs.existsSync(glassExe())) return;
  const { d, pill } = dockGeom();
  const s = d.scaleFactor, b = d.bounds, w = d.workArea;
  const top = cfg.dock.topbar ? 34 : 0;
  // con el dock activo la barra de Windows está oculta y reservamos el espacio del dock; si no, respetamos lo que Explorer ya calculó
  const bottom = cfg.dock.enabled && taskbarHidden ? b.y + b.height - (cfg.dock.autohide ? 0 : pill + 12) : w.y + w.height;
  const L = Math.round(w.x * s), T = Math.round((b.y + top) * s), R = Math.round((w.x + w.width) * s), B = Math.round(bottom * s);
  await run(glassExe(), ['--workarea', String(L), String(T), String(R), String(B)]);
  setTimeout(placeBars, 300); setTimeout(placeBars, 1200); // Windows mueve las ventanas al cambiar el área de trabajo
}
async function setTaskbarHidden(hide, force) {
  if (!force && hide === taskbarHidden) return; // no tocar Explorer si no cambió nada (evita parpadeos y bucles)
  taskbarHidden = !!hide;
  const g = readGlass(); g.hide_taskbar = !!hide; writeGlass(g); startEngine();
  await run(glassExe(), ['--taskbar', hide ? 'hide' : 'show']);
}
function makeBar(file, bounds, extra = {}) {
  const w = new BrowserWindow({ ...bounds, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: true, show: false, title: 'FolderGlow ' + file,
    webPreferences: { ...webPrefs, backgroundThrottling: false }, ...extra });
  w.setAlwaysOnTop(true, 'pop-up-menu');
  w.on('page-title-updated', (e) => e.preventDefault());
  w.loadFile(path.join(__dirname, 'renderer', file + '.html'), { query: { size: cfg.dock.size, mag: cfg.dock.magnify, autohide: cfg.dock.autohide ? 1 : 0 } });
  // la barra nueva se rellena al instante, sin esperar al siguiente sondeo
  w.webContents.once('did-finish-load', () => { if (lastDockData && !w.isDestroyed()) w.webContents.send('dock:update', lastDockData); });
  w.once('ready-to-show', () => { w.showInactive(); setTimeout(placeBars, 350); });
  pinBar(w, file === 'dock' ? 'dock' : 'top');
  return w;
}
// Mantiene cada barra pegada a su borde (arriba / abajo) aunque Windows la empuje hacia el área de trabajo.
function pinBar(w, key) {
  let t = null, tries = 0;
  const near = (a, b) => Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 && Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2;
  const fix = () => {
    if (w.isDestroyed()) return;
    const want = barBounds()[key];
    if (near(w.getBounds(), want)) { tries = 0; return; }
    if (tries++ < 8) w.setBounds(want);
  };
  w.on('move', () => { clearTimeout(t); t = setTimeout(fix, 120); });
  w.on('resize', () => { clearTimeout(t); t = setTimeout(fix, 120); });
}
function placeBars() { // solo recoloca; no toca el área de trabajo
  const bb = barBounds();
  if (dockWin && !dockWin.isDestroyed()) dockWin.setBounds(bb.dock);
  if (topWin && !topWin.isDestroyed()) topWin.setBounds(bb.top);
}
function barBounds() {
  const { d, H } = dockGeom();
  return { dock: { x: d.bounds.x, y: d.bounds.y + d.bounds.height - H, width: d.bounds.width, height: H },
    top: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: 34 } };
}
async function startDock() {
  const bb = barBounds();
  if (cfg.dock.enabled && !dockWin) {
    revealed = false; leaveAt = 0;
    dockWin = makeBar('dock', bb.dock);
    dockWin.setIgnoreMouseEvents(true, { forward: true }); // solo la "píldora" recibe clics; el resto deja pasar el mouse
    dockWin.on('closed', () => { dockWin = null; });
  }
  if (cfg.dock.topbar && !topWin) {
    topWin = makeBar('topbar', bb.top);
    topWin.on('closed', () => { topWin = null; });
  }
  if (cfg.dock.enabled || cfg.dock.topbar) {
    await setTaskbarHidden(!!cfg.dock.enabled);
    scheduleWorkArea();
    if (!dockPoll) { dockPoll = setInterval(pollWindows, 1300); pollWindows(); }
    else pollWindows();
    if (cfg.dock.autohide && cfg.dock.enabled && !mouseT) mouseT = setInterval(autoHideTick, 120);
  } else if (taskbarHidden || readGlass().hide_taskbar) {
    await setTaskbarHidden(false, true); // por si quedó oculta de una sesión anterior
  }
}
async function stopDock(which, restart) {
  if (which !== 'top' && dockWin) { dockWin.destroy(); dockWin = null; }
  if (which !== 'dock' && topWin) { topWin.destroy(); topWin = null; }
  if (!dockWin) { clearInterval(mouseT); mouseT = null; }
  if (!dockWin && !topWin) { clearInterval(dockPoll); dockPoll = null; }
  if (restart) return; // solo se recrea: la barra de Windows se queda como está
  if (!dockWin) await setTaskbarHidden(false); // Explorer vuelve a calcular el área de trabajo
  scheduleWorkArea();
}
function repositionBars() { // cambió la pantalla: mover las barras, no destruirlas
  placeBars();
  scheduleWorkArea();
}
let revealed = false, leaveAt = 0;
function autoHideTick() { // ocultación automática: aparece al llevar el mouse al borde inferior
  if (!dockWin || dockWin.isDestroyed()) return;
  const { d, H } = dockGeom();
  const p = screen.getCursorScreenPoint();
  const bottom = d.bounds.y + d.bounds.height;
  if (!revealed && p.y >= bottom - 3) { revealed = true; dockWin.webContents.send('dock:reveal', true); }
  else if (revealed) {
    if (p.y < bottom - H) { if (!leaveAt) leaveAt = Date.now(); else if (Date.now() - leaveAt > 500) { revealed = false; leaveAt = 0; dockWin.webContents.send('dock:reveal', false); } }
    else leaveAt = 0;
  }
}
async function dockLaunch(it) {
  if (it.id && !/["\r\n]/.test(it.id)) spawn('explorer.exe', [`shell:AppsFolder\\${it.id}`], { detached: true, stdio: 'ignore' }).unref();
  else if (it.lnk) shell.openPath(it.lnk);
  else if (it.path) spawn(it.path, [], { detached: true, stdio: 'ignore', cwd: path.dirname(it.path) }).unref();
}
ipcMain.handle('dock:config', () => cfg.dock);
ipcMain.handle('dock:set', (e, p) => dockQueue(async () => {
  const prev = { ...cfg.dock };
  Object.assign(cfg.dock, p); saveSoon();
  if ('size' in p || 'magnify' in p || 'autohide' in p) { await stopDock(undefined, true); await startDock(); }
  else {
    if (prev.enabled && !cfg.dock.enabled) await stopDock('dock');
    if (prev.topbar && !cfg.dock.topbar) await stopDock('top');
    await startDock();
  }
  return cfg.dock;
}));
ipcMain.handle('dock:mouse', (e, over) => { if (dockWin && !dockWin.isDestroyed()) dockWin.setIgnoreMouseEvents(!over, { forward: true }); });
ipcMain.handle('dock:click', async (e, it) => {
  const ws = (it.wins || []).filter((w) => w.h);
  if (!ws.length) { await dockLaunch(it); return 'launch'; }
  // varias ventanas: va rotando entre ellas
  const i = ws.findIndex((w) => w.a);
  await run(glassExe(), ['--activate', String(ws[(i + 1) % ws.length].h)]);
  setTimeout(pollWindows, 250);
  return 'focus';
});
ipcMain.handle('dock:menu', async (e, it) => {
  const ws = it.wins || [];
  const isPinned = (cfg.dock.pinned || []).some((p) => p.n === it.n);
  const tpl = [
    ...ws.slice(0, 8).map((w) => ({ label: (w.t.length > 48 ? w.t.slice(0, 47) + '…' : w.t), click: () => run(glassExe(), ['--activate', String(w.h)]) })),
    ...(ws.length ? [{ type: 'separator' }] : []),
    { label: 'Abrir nueva ventana', click: () => dockLaunch(it) },
    { label: isPinned ? 'Quitar del dock' : 'Mantener en el dock', click: () => {
      if (isPinned) cfg.dock.pinned = cfg.dock.pinned.filter((p) => p.n !== it.n);
      else cfg.dock.pinned.push({ n: it.n, exe: it.path || it.exe, icon: it.icon, path: it.path });
      saveSoon(); pollWindows();
    } },
    ...(it.path ? [{ label: 'Mostrar en la carpeta', click: () => shell.showItemInFolder(it.path) }] : []),
    ...(ws.length ? [{ type: 'separator' }, { label: ws.length > 1 ? `Cerrar ${ws.length} ventanas` : 'Cerrar ventana', click: () => ws.forEach((w) => run(glassExe(), ['--close', String(w.h)])) }] : []),
  ];
  Menu.buildFromTemplate(tpl).popup({ window: BrowserWindow.fromWebContents(e.sender) });
});
ipcMain.handle('dock:open', (e, what) => {
  const uris = { downloads: app.getPath('downloads'), trash: 'shell:RecycleBinFolder', settings: 'ms-settings:', wifi: 'ms-availablenetworks:',
    bluetooth: 'ms-settings:bluetooth', sound: 'ms-settings:sound', notif: 'ms-actioncenter:', quick: 'ms-actioncenter:controlcenter/&showFooter=true',
    calendar: 'outlookcal:', power: 'ms-settings:powersleep', home: app.getPath('home') };
  if (what === 'launcher') return openLauncher();
  if (what === 'studio') return openManager();
  const u = uris[what];
  if (!u) return;
  if (/^(shell:|[A-Z]:\\)/i.test(u)) spawn('explorer.exe', [u], { detached: true, stdio: 'ignore' }).unref();
  else shell.openExternal(u);
});
app.on('before-quit', () => { // devolver la barra de Windows al salir
  if (process.platform === 'win32' && (cfg.dock.enabled || cfg.dock.topbar) && fs.existsSync(glassExe())) {
    try { const g = readGlass(); g.hide_taskbar = false; writeGlass(g); require('child_process').execFileSync(glassExe(), ['--taskbar', 'show'], { timeout: 3000 }); } catch (_) {}
  }
});
app.whenReady().then(() => {
  let metricsT = null;
  // OJO: applyWorkArea cambia el área de trabajo y eso también dispara este evento; solo reaccionamos a cambios reales de pantalla
  screen.on('display-metrics-changed', (e, display, changed) => {
    if (!(dockWin || topWin) || !(changed || []).some((m) => m === 'bounds' || m === 'scaleFactor' || m === 'rotation')) return;
    clearTimeout(metricsT); metricsT = setTimeout(() => dockQueue(async () => repositionBars()), 800);
  });
  setTimeout(() => dockQueue(startDock), 1500);
});

// ------------------------------------------------------------ ciclo de vida
app.on('second-instance', (e, argv) => (argv.includes('--launcher') ? openLauncher() : openManager()));
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => {
  quitting = true;
  // si el cristal no está activo, el motor solo servía para fijar widgets: lo cerramos
  if (process.platform === 'win32' && !readGlass().enabled && fs.existsSync(glassExe())) {
    try { require('child_process').execFileSync(glassExe(), ['--stop'], { windowsHide: true, timeout: 3000 }); } catch (_) {}
  }
});
app.on('window-all-closed', () => {}); // sigue en la bandeja
app.whenReady().then(() => {
  started = true;
  app.setAppUserModelId('com.folderglow.studio');
  buildTray();
  startEngine();
  for (const id of Object.keys(cfg.widgets)) if (cfg.widgets[id].enabled) openWidget(id);
  registerHotkey();
  startPipe();
  if (process.argv.includes('--launcher')) openLauncher();
  else if (!process.argv.includes('--hidden')) openManager();
});
