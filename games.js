// Biblioteca de juegos de FolderGlow — organizada como Playnite / Heroic / Lutris:
//   1) "plugins de biblioteca": uno por tienda, cada uno devuelve juegos instalados con su id nativo
//   2) base de datos propia (library.json): favoritos, ocultos, portada elegida, veces jugado…
//   3) "proveedores de metadatos": portada vertical (2:3), fondo (hero) e icono, descargados y cacheados
// Clave única por juego = "<tienda>:<id nativo>"  →  nunca se duplica aunque se escanee dos veces.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

module.exports = function games(ctx) {
  const { app, ipcMain, shell, dialog, net, run, getMgr, glassExe, hideLauncher, cfg, saveSoon } = ctx;
  const DATA = app.getPath('userData');
  const DB_FILE = path.join(DATA, 'library.json');
  const MEDIA = path.join(DATA, 'media');
  fs.mkdirSync(MEDIA, { recursive: true });
  let db = { games: {} };
  try { db = { games: {}, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (_) {}
  let saveT;
  const saveDb = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(DB_FILE, JSON.stringify(db), () => {}), 400); };
  const hash = (s) => crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 14);
  const fileUrl = (p) => (p ? 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '') : null);
  const exists = (p) => { try { return !!p && fs.existsSync(p); } catch (_) { return false; } };
  const normPath = (p) => path.resolve(String(p).replace(/\//g, '\\')).toLowerCase();
  const normName = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[™®©:'’\-–_.!]/g, '').replace(/\s+/g, ' ').trim();
  const log = (m) => { try { fs.appendFileSync(path.join(DATA, 'games.log'), `[${new Date().toISOString()}] ${m}\n`); } catch (_) {} };

  // ---------------------------------------------------------------- utilidades
  function vdf(text) { // parser de KeyValues de Valve (acf / vdf)
    let i = 0;
    const n = text.length;
    const skip = () => {
      while (i < n) {
        const c = text[i];
        if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
        if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
        break;
      }
    };
    const str = () => {
      let s = '';
      if (text[i] === '"') {
        i++;
        while (i < n && text[i] !== '"') {
          if (text[i] === '\\' && i + 1 < n) { const e = text[i + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; i += 2; continue; }
          s += text[i++];
        }
        i++;
        return s;
      }
      while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
      return s;
    };
    const obj = () => {
      const o = {};
      for (;;) {
        skip();
        if (i >= n) return o;
        if (text[i] === '}') { i++; return o; }
        const k = str();
        skip();
        if (text[i] === '{') { i++; o[k] = obj(); } else o[k] = str();
      }
    };
    return obj();
  }
  const ci = (o, k) => (o ? o[Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase())] : undefined);
  async function regTree(key) { // { subclave: { valor: dato } }
    const r = await run('reg', ['query', key, '/s']);
    const out = {};
    let cur = null;
    for (const line of (r.so || '').split(/\r?\n/)) {
      if (/^HKEY_/i.test(line)) { cur = line.trim().split('\\').pop(); out[cur] = out[cur] || {}; continue; }
      const m = /^\s{4}(.*?)\s{4}REG_\w+\s{4}(.*)$/.exec(line);
      if (m && cur) out[cur][m[1] === '(Default)' || m[1] === '(Predeterminado)' ? '' : m[1]] = m[2];
    }
    return out;
  }
  async function regValue(key, name) {
    const r = await run('reg', ['query', key, '/v', name]);
    return /REG_\w+\s+(.+?)\s*$/m.exec(r.so || '')?.[1] || null;
  }
  const findFile = (dir, re, depth = 3) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return null; }
    for (const e of ents) if (e.isFile() && re.test(e.name)) return path.join(dir, e.name);
    if (depth > 0) for (const e of ents) if (e.isDirectory()) { const r = findFile(path.join(dir, e.name), re, depth - 1); if (r) return r; }
    return null;
  };

  // ---------------------------------------------------------------- plugins de biblioteca
  const STEAM_TOOLS = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '250820', '1826330', '2180100', '961940', '1580130']);
  async function steamLib() {
    const root = (await regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath')) || 'C:\\Program Files (x86)\\Steam';
    const steamRoot = path.resolve(root.replace(/\//g, '\\'));
    if (!exists(steamRoot)) return [];
    const libs = new Map([[normPath(steamRoot), steamRoot]]); // clave en minúsculas: evita escanear la misma carpeta 2 veces
    try {
      const lf = ci(vdf(fs.readFileSync(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8')), 'libraryfolders') || {};
      for (const v of Object.values(lf)) {
        const p = typeof v === 'object' ? ci(v, 'path') : v;
        if (p && typeof p === 'string' && /[\\/]/.test(p)) libs.set(normPath(p), path.resolve(p));
      }
    } catch (e) { log('steam libraryfolders: ' + e.message); }
    // tiempo de juego: userdata/<cuenta>/config/localconfig.vdf (la cuenta usada más recientemente)
    let play = {};
    try {
      const ud = path.join(steamRoot, 'userdata');
      const users = fs.readdirSync(ud).map((u) => path.join(ud, u, 'config', 'localconfig.vdf')).filter(exists)
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      if (users[0]) {
        const lc = vdf(fs.readFileSync(users[0], 'utf8'));
        const apps = ci(ci(ci(ci(ci(lc, 'UserLocalConfigStore'), 'Software'), 'Valve'), 'Steam'), 'apps') || {};
        for (const [id, a] of Object.entries(apps)) play[id] = { min: +(ci(a, 'Playtime') || 0), last: +(ci(a, 'LastPlayed') || 0) * 1000 };
      }
    } catch (e) { log('steam localconfig: ' + e.message); }
    const cache = path.join(steamRoot, 'appcache', 'librarycache');
    const out = new Map();
    for (const lib of libs.values()) {
      const dir = path.join(lib, 'steamapps');
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        let st;
        try { st = ci(vdf(fs.readFileSync(path.join(dir, f), 'utf8')), 'AppState'); } catch (_) { continue; }
        if (!st) continue;
        const id = String(ci(st, 'appid') || ''), name = ci(st, 'name');
        if (!id || !name || STEAM_TOOLS.has(id) || /^(Proton|Steam Linux Runtime|Steamworks|SteamVR)/i.test(name)) continue;
        if (!(+ci(st, 'StateFlags') & 4)) continue; // 4 = totalmente instalado
        if (out.has(id)) continue;
        const local = (re) => findFile(path.join(cache, id), re, 2) || findFile(cache, new RegExp(`^${id}_${re.source.slice(1)}`), 0);
        out.set(id, {
          key: 'steam:' + id, src: 'steam', id, n: name, dir: path.join(dir, 'common', ci(st, 'installdir') || ''),
          size: +(ci(st, 'SizeOnDisk') || 0), playtime: play[id]?.min || 0,
          last: Math.max(play[id]?.last || 0, +(ci(st, 'LastPlayed') || 0) * 1000),
          art: {
            cover: local(/^library_600x900(_2x)?\.jpg$/i) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900_2x.jpg`,
            coverAlt: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
            hero: local(/^library_hero\.jpg$/i) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
            header: local(/^header\.jpg$/i) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
            icon: findFile(path.join(cache, id), /^[0-9a-f]{40}\.jpg$/i, 1),
          },
        });
      }
    }
    return [...out.values()];
  }

  // Epic: manifiestos locales + catcache.bin (catálogo en base64 con imágenes y categorías, sin internet)
  function epicCatalog() {
    const f = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Catalog', 'catcache.bin');
    const map = {};
    try {
      const arr = JSON.parse(Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64').toString('utf8'));
      for (const it of arr) map[it.id] = it;
    } catch (e) { log('epic catcache: ' + e.message); }
    return map;
  }
  const EPIC_TALL = ['DieselGameBoxTall', 'OfferImageTall', 'CodeRedemption_340x440', 'Thumbnail'];
  const EPIC_WIDE = ['DieselGameBox', 'OfferImageWide', 'DieselStoreFrontWide', 'featuredMedia'];
  const pickImg = (imgs, types) => { for (const t of types) { const m = (imgs || []).find((k) => k.type === t); if (m) return m.url; } return null; };
  async function epicLib() {
    const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.item')); } catch (_) { return []; }
    const cat = epicCatalog();
    const out = new Map();
    for (const f of files) {
      let j;
      try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { continue; }
      if (!j.DisplayName || j.bIsIncompleteInstall || (j.MainGameAppName && j.MainGameAppName !== j.AppName)) continue;
      const c = cat[j.CatalogItemId];
      const cats = [...(j.AppCategories || []), ...((c?.categories || []).map((x) => x.path))];
      const isGame = cats.includes('games') || (!cats.includes('applications') && !cats.includes('software'));
      if (!isGame || cats.includes('addons') || cats.includes('digitalextras')) continue; // Discord, Unreal Engine…
      if (out.has(j.AppName)) continue;
      out.set(j.AppName, {
        key: 'epic:' + j.AppName, src: 'epic', id: j.AppName, n: c?.title || j.DisplayName, dir: j.InstallLocation,
        exe: j.LaunchExecutable ? path.join(j.InstallLocation || '', j.LaunchExecutable) : null, size: +(j.InstallSize || 0),
        ns: j.CatalogNamespace, item: j.CatalogItemId, last: 0, playtime: 0,
        art: { cover: pickImg(c?.keyImages, EPIC_TALL), hero: pickImg(c?.keyImages, EPIC_WIDE), logo: pickImg(c?.keyImages, ['DieselGameBoxLogo']) },
      });
    }
    return [...out.values()];
  }
  async function gogLib() {
    const tree = await regTree('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games');
    const galaxy = await regValue('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\GalaxyClient\\paths', 'client');
    return Object.entries(tree).filter(([, v]) => v.gameName && v.path && exists(v.path)).map(([id, v]) => ({
      key: 'gog:' + (v.gameID || id), src: 'gog', id: v.gameID || id, n: v.gameName, dir: v.path, exe: v.exe || v.launchCommand,
      galaxy: galaxy ? path.join(galaxy, 'GalaxyClient.exe') : null, last: 0, playtime: 0, size: 0, art: {},
    }));
  }
  async function ubisoftLib() {
    const tree = await regTree('HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs');
    return Object.entries(tree).filter(([id, v]) => /^\d+$/.test(id) && v.InstallDir && exists(v.InstallDir)).map(([id, v]) => ({
      key: 'ubisoft:' + id, src: 'ubisoft', id, n: path.basename(v.InstallDir.replace(/[\\/]+$/, '')), dir: v.InstallDir,
      exe: findFile(v.InstallDir, /\.exe$/i, 0), last: 0, playtime: 0, size: 0, art: {},
    }));
  }
  const RIOT = { valorant: 'VALORANT', league_of_legends: 'League of Legends', bacon: 'Legends of Runeterra', lion: '2XKO' };
  async function riotLib() {
    const base = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games');
    let rc = null;
    try { rc = JSON.parse(fs.readFileSync(path.join(base, 'RiotClientInstalls.json'), 'utf8')).rc_default; } catch (_) { return []; }
    let metas = [];
    try { metas = fs.readdirSync(path.join(base, 'Metadata')).filter((d) => /\.live$/.test(d)); } catch (_) {}
    const out = [];
    for (const m of metas) {
      const prod = m.replace(/\.live$/, '');
      if (!RIOT[prod]) continue;
      let dir = null;
      try { dir = /product_install_full_path:\s*"?([^"\r\n]+)"?/.exec(fs.readFileSync(path.join(base, 'Metadata', m, m + '.product_settings.yaml'), 'utf8'))?.[1]; } catch (_) {}
      if (dir && !exists(dir)) continue;
      out.push({ key: 'riot:' + prod, src: 'riot', id: prod, n: RIOT[prod], dir, rc, exe: rc, last: 0, playtime: 0, size: 0, art: {} });
    }
    return out;
  }
  function customLib() {
    return (cfg.games?.custom || []).filter((c) => exists(c.exe)).map((c) => ({
      key: 'custom:' + hash(c.exe.toLowerCase()), src: 'custom', id: c.exe, n: c.n, exe: c.exe, dir: path.dirname(c.exe), last: 0, playtime: 0, size: 0, art: {},
    }));
  }

  // ---------------------------------------------------------------- metadatos (portada / fondo / icono)
  const download = async (url, file) => {
    if (exists(file)) return file;
    try {
      const r = await net.fetch(url, { headers: { 'User-Agent': 'FolderGlow-Studio' } });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1500) return null; // imagen vacía / placeholder
      fs.writeFileSync(file, buf);
      return file;
    } catch (_) { return null; }
  };
  const getJSON = async (url, opts = {}) => { const r = await net.fetch(url, opts); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  async function steamSearch(name) { // busca el juego en la tienda de Steam por nombre exacto (Epic, GOG, propios…)
    try {
      const j = await getJSON(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`);
      const hit = (j.items || []).find((x) => normName(x.name) === normName(name));
      return hit ? String(hit.id) : null;
    } catch (_) { return null; }
  }
  async function epicGraphql(ns, id) {
    try {
      const j = await getJSON('https://graphql.epicgames.com/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query($ns:String!,$id:String!){Catalog{catalogItem(namespace:$ns,id:$id,locale:"en-US"){keyImages{type url}}}}', variables: { ns, id } }) });
      return j?.data?.Catalog?.catalogItem?.keyImages || null;
    } catch (_) { return null; }
  }
  async function sgdb(name) { // SteamGridDB (opcional, con tu clave gratuita como en Playnite)
    const key = cfg.sgdbKey;
    if (!key) return {};
    const H = { headers: { Authorization: 'Bearer ' + key } };
    try {
      const s = await getJSON(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(name)}`, H);
      const gid = s.data?.[0]?.id;
      if (!gid) return {};
      const [g, hh] = await Promise.all([
        getJSON(`https://www.steamgriddb.com/api/v2/grids/game/${gid}?dimensions=600x900&types=static`, H).catch(() => ({})),
        getJSON(`https://www.steamgriddb.com/api/v2/heroes/game/${gid}?types=static`, H).catch(() => ({})),
      ]);
      return { cover: g.data?.[0]?.url, hero: hh.data?.[0]?.url };
    } catch (_) { return {}; }
  }
  async function resolveMedia(g) {
    const rec = db.games[g.key];
    const m = rec.media || (rec.media = {});
    const base = path.join(MEDIA, hash(g.key));
    const tryArt = async (kind, ...urls) => {
      if (m[kind] && exists(m[kind])) return;
      for (const u of urls.filter(Boolean)) {
        if (/^https?:/.test(u)) { const f = await download(u, `${base}-${kind}.jpg`); if (f) { m[kind] = f; return; } }
        else if (exists(u)) { m[kind] = u; return; }
      }
    };
    await tryArt('cover', rec.customCover, g.art.cover, g.art.coverAlt);
    await tryArt('hero', g.art.hero, g.art.header);
    if (g.src === 'epic' && (!m.cover || !m.hero) && g.ns) {
      const imgs = await epicGraphql(g.ns, g.item);
      if (imgs) { await tryArt('cover', pickImg(imgs, EPIC_TALL)); await tryArt('hero', pickImg(imgs, EPIC_WIDE)); }
    }
    if (!m.cover || !m.hero) {
      const sid = g.src === 'steam' ? null : await steamSearch(g.n);
      if (sid) {
        await tryArt('cover', `https://cdn.cloudflare.steamstatic.com/steam/apps/${sid}/library_600x900_2x.jpg`, `https://cdn.cloudflare.steamstatic.com/steam/apps/${sid}/library_600x900.jpg`);
        await tryArt('hero', `https://cdn.cloudflare.steamstatic.com/steam/apps/${sid}/library_hero.jpg`, `https://cdn.cloudflare.steamstatic.com/steam/apps/${sid}/header.jpg`);
      }
    }
    if (!m.cover || !m.hero) { const s = await sgdb(g.n); await tryArt('cover', s.cover); await tryArt('hero', s.hero); }
    if (!m.icon || !exists(m.icon)) {
      if (g.art.icon && exists(g.art.icon)) m.icon = g.art.icon;
      else if (g.exe && exists(g.exe)) m.icon = await exeIcon(g.exe, `${base}-icon.png`);
    }
    m.done = Date.now();
  }
  async function exeIcon(exe, png) {
    if (exists(png)) return png;
    if (process.platform === 'win32' && exists(glassExe())) {
      const list = path.join(os.tmpdir(), `fg-ico-${hash(exe)}.txt`);
      fs.writeFileSync(list, `${exe}\t${png}`, 'utf8');
      await run(glassExe(), ['--icons', list]);
      try { fs.unlinkSync(list); } catch (_) {}
      if (exists(png)) return png;
    }
    try { fs.writeFileSync(png, (await app.getFileIcon(exe, { size: 'large' })).toPNG()); return png; } catch (_) { return null; }
  }

  // ---------------------------------------------------------------- escaneo + vista
  let scanning = null, lastList = null;
  const notify = () => { const w = getMgr(); if (w && !w.isDestroyed()) w.webContents.send('games:changed'); ctx.notifyLauncher?.('games:changed'); };
  function view() {
    return Object.values(db.games).filter((r) => r.installed).map((r) => ({
      key: r.key, src: r.src, n: r.n, sort: r.sortName || r.n, dir: r.dir, size: r.size, playtime: r.playtime || 0,
      last: Math.max(r.last || 0, r.fgLast || 0), added: r.added, favorite: !!r.favorite, hidden: !!r.hidden, launches: r.launches || 0,
      cover: fileUrl(r.media?.cover), hero: fileUrl(r.media?.hero), icon: fileUrl(r.media?.icon), pending: !r.media?.done,
    }));
  }
  async function scan() {
    if (scanning) return scanning;
    scanning = (async () => {
      const t0 = Date.now();
      const results = await Promise.all([steamLib(), epicLib(), gogLib(), ubisoftLib(), riotLib()].map((p) => p.catch((e) => { log('plugin: ' + e.message); return []; })));
      const found = [...results.flat(), ...customLib()];
      const seen = new Set();
      for (const r of Object.values(db.games)) r.installed = false;
      for (const g of found) {
        if (seen.has(g.key)) continue;
        seen.add(g.key);
        const r = db.games[g.key] || (db.games[g.key] = { added: Date.now() });
        Object.assign(r, { key: g.key, src: g.src, id: g.id, n: r.customName || g.n, dir: g.dir, exe: g.exe, size: g.size, playtime: g.playtime,
          last: g.last, ns: g.ns, item: g.item, galaxy: g.galaxy, rc: g.rc, installed: true });
        g._rec = r;
      }
      saveDb();
      log(`escaneo: ${found.length} juegos (${results.map((x) => x.length).join('/')}) en ${Date.now() - t0} ms`);
      lastList = view();
      notify();
      // metadatos en segundo plano, de 4 en 4, avisando a la interfaz cada vez que llegan portadas
      const todo = found.filter((g) => !g._rec.media?.done || !g._rec.media?.cover || !exists(g._rec.media?.cover));
      for (let i = 0; i < todo.length; i += 4) {
        await Promise.all(todo.slice(i, i + 4).map((g) => resolveMedia(g).catch((e) => log('media ' + g.n + ': ' + e.message))));
        saveDb(); lastList = view(); notify();
      }
      scanning = null;
      return lastList;
    })();
    return scanning;
  }

  // ---------------------------------------------------------------- acciones
  const recOf = (key) => db.games[key];
  async function play(key) {
    const r = recOf(key);
    if (!r) return false;
    r.launches = (r.launches || 0) + 1; r.fgLast = Date.now(); saveDb();
    hideLauncher?.();
    const { spawn } = require('child_process');
    switch (r.src) {
      case 'steam': return shell.openExternal(`steam://rungameid/${r.id}`);
      case 'epic': return shell.openExternal(`com.epicgames.launcher://apps/${encodeURIComponent(`${r.ns}:${r.item}:${r.id}`)}?action=launch&silent=true`);
      case 'ubisoft': return shell.openExternal(`uplay://launch/${r.id}/0`);
      case 'gog':
        if (r.galaxy && exists(r.galaxy)) return spawn(r.galaxy, ['/command=runGame', `/gameId=${r.id}`, `/path=${r.dir}`], { detached: true, stdio: 'ignore' }).unref();
        return shell.openPath(r.exe && path.isAbsolute(r.exe) ? r.exe : path.join(r.dir, r.exe || ''));
      case 'riot': return spawn(r.rc, [`--launch-product=${r.id}`, '--launch-patchline=live'], { detached: true, stdio: 'ignore' }).unref();
      default: return shell.openPath(r.exe);
    }
  }
  ipcMain.handle('games:list', async (e, force) => {
    if (force || !lastList) { const p = scan(); if (force || !lastList) { await Promise.race([p, new Promise((r) => setTimeout(r, 4000))]); } }
    return lastList || view();
  });
  ipcMain.handle('games:play', (e, key) => play(key));
  ipcMain.handle('games:action', async (e, key, action, arg) => {
    const r = recOf(key);
    if (!r) return false;
    const done = () => { saveDb(); lastList = view(); notify(); return true; };
    switch (action) {
      case 'favorite': r.favorite = !r.favorite; return done();
      case 'hide': r.hidden = true; return done();
      case 'show': r.hidden = false; return done();
      case 'rename': if (arg && arg.trim()) { r.customName = r.n = arg.trim(); } return done();
      case 'folder': return r.dir ? shell.openPath(r.dir) : false;
      case 'store':
        if (r.src === 'steam') return shell.openExternal(`steam://nav/games/details/${r.id}`);
        if (r.src === 'epic') return shell.openExternal('com.epicgames.launcher://library');
        if (r.src === 'gog') return shell.openExternal(`goggalaxy://openGameView/${r.id}`);
        if (r.src === 'ubisoft') return shell.openExternal('uplay://');
        return r.dir ? shell.openPath(r.dir) : false;
      case 'uninstall':
        if (r.src === 'steam') return shell.openExternal(`steam://uninstall/${r.id}`);
        if (r.src === 'epic') return shell.openExternal('com.epicgames.launcher://library');
        if (r.src === 'ubisoft') return shell.openExternal(`uplay://uninstall/${r.id}`);
        if (r.src === 'gog') { const u = findFile(r.dir, /^unins\d+\.exe$/i, 0); return u ? shell.openPath(u) : shell.openExternal(`goggalaxy://openGameView/${r.id}`); }
        if (r.src === 'custom') { cfg.games.custom = cfg.games.custom.filter((c) => c.exe !== r.exe); saveSoon(); delete db.games[key]; return done(); }
        return false;
      case 'cover': {
        const res = await dialog.showOpenDialog(getMgr(), { title: 'Elegir portada (vertical 2:3)', properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
        if (res.canceled) return false;
        const dst = path.join(MEDIA, `${hash(key)}-custom${path.extname(res.filePaths[0])}`);
        fs.copyFileSync(res.filePaths[0], dst);
        r.customCover = dst; r.media = { ...(r.media || {}), cover: dst };
        return done();
      }
      case 'refetch': {
        for (const k of ['cover', 'hero']) { const f = r.media?.[k]; if (f && f.startsWith(MEDIA) && !/-custom/.test(f)) try { fs.unlinkSync(f); } catch (_) {} }
        r.media = r.customCover ? { cover: r.customCover } : {};
        done(); scan(); return true;
      }
    }
    return false;
  });
  ipcMain.handle('games:add', async () => {
    const r = await dialog.showOpenDialog(getMgr(), { title: 'Añadir juego', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Juegos y accesos directos', extensions: ['exe', 'lnk', 'url', 'bat'] }] });
    if (r.canceled) return 0;
    cfg.games = cfg.games || { custom: [] };
    cfg.games.custom = cfg.games.custom || [];
    for (const f of r.filePaths) if (!cfg.games.custom.some((c) => c.exe.toLowerCase() === f.toLowerCase())) cfg.games.custom.push({ n: path.basename(f).replace(/\.\w+$/, ''), exe: f });
    saveSoon();
    scan();
    return r.filePaths.length;
  });
  ipcMain.handle('games:sgdb', (e, key) => { cfg.sgdbKey = String(key || '').trim(); saveSoon(); return true; });

  return { scan, play, view: () => lastList || view(), _test: { vdf, epicCatalog, normName } };
};
