const { contextBridge, ipcRenderer } = require('electron');
const inv = (c) => (...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('api', {
  pickFolders: inv('pick:folders'), pickChildren: inv('pick:children'), pickApps: inv('pick:apps'),
  applyIcons: inv('icons:apply'), restoreIcons: inv('icons:restore'),
  glass: { apply: inv('glass:apply'), stop: inv('glass:stop'), autostart: inv('glass:autostart'), getCfg: inv('glass:getcfg') },
  term: { apply: inv('term:apply') },
  tool: { install: inv('tools:install'), open: inv('open:url') },
  data: { github: inv('data:github'), weather: inv('data:weather') },
  widgets: {
    list: inv('widgets:list'), types: inv('widgets:types'), add: inv('widgets:add'), remove: inv('widgets:remove'),
    update: inv('widgets:update'), get: inv('widget:get'), sys: inv('sys:stats'),
    onUpdate: (cb) => ipcRenderer.on('widget:update', (e, w) => cb(w)),
    onChanged: (cb) => ipcRenderer.on('widgets:changed', () => cb()),
  },
  launcher: {
    apps: inv('launcher:apps'), run: inv('launcher:run'), windows: inv('launcher:windows'), focus: inv('launcher:focus'), hide: inv('launcher:hide'), open: inv('launcher:open'),
    getCfg: inv('launcher:getcfg'), setCfg: inv('launcher:setcfg'),
    onOpen: (cb) => ipcRenderer.on('launcher:open', () => cb()), onClose: (cb) => ipcRenderer.on('launcher:close', () => cb()),
  },
  blur: { status: inv('ebm:status'), install: inv('ebm:install'), apply: inv('ebm:apply'), uninstall: inv('ebm:uninstall'), restart: inv('ebm:restart') },
  games: { list: inv('games:list'), play: inv('games:play'), action: inv('games:action'), add: inv('games:add'), sgdb: inv('games:sgdb'),
    onChanged: (cb) => ipcRenderer.on('games:changed', () => cb()) },
  wall: { list: inv('wall:list'), get: inv('wall:get'), set: inv('wall:set'), pick: inv('wall:pick'),
    onChange: (cb) => ipcRenderer.on('wall:changed', () => cb()) },
  templates: { list: inv('templates:list'), apply: inv('templates:apply') },
  desk: { media: inv('media:cmd'), net: inv('sys:net'), action: inv('sys:action'), pickImage: inv('pick:image'), photos: inv('photos:list'),
    appsCat: inv('apps:category'), appsRun: inv('apps:run'), categories: inv('apps:categories'),
    onBounds: (cb) => ipcRenderer.on('widget:bounds', (e, b) => cb(b)) },
  dock: { config: inv('dock:config'), set: inv('dock:set'), mouse: inv('dock:mouse'), click: inv('dock:click'), menu: inv('dock:menu'), open: inv('dock:open'),
    onUpdate: (cb) => ipcRenderer.on('dock:update', (e, d) => cb(d)), onReveal: (cb) => ipcRenderer.on('dock:reveal', (e, v) => cb(v)) },
  settings: { get: inv('settings:get'), set: inv('settings:set'), relaunch: inv('app:relaunch') },
});
