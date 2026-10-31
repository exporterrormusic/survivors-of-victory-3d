// Desktop wrapper: serves dist/ from a fixed app://game origin (so localStorage saves survive every
// update and fetch() works for the .glb/.json assets), and checks GitHub Releases on each launch.
const { app, BrowserWindow, protocol, net, shell, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { autoUpdater } = require('electron-updater');

const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#000000',
    icon: path.join(DIST, 'icon-sov-v1.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') console.log(`[page ${event.level}] ${event.message}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log(`[load failed] ${code} ${desc} ${url}`));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL('app://game/index.html');
}

// What the in-game update banner shows (src/update-banner.ts): null, or
// { state: 'downloading', version, percent } / { state: 'ready' | 'installing' | 'error', version }.
let updateStatus = null;
function setUpdateStatus(status) {
  updateStatus = status;
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status);
}
ipcMain.handle('update:get', () => updateStatus);
ipcMain.handle('update:restart', () => {
  if (updateStatus?.state !== 'ready') return;
  // Not silent: the themed installer shows its progress bar (build/installer.nsh skips its questions
  // on updates and reopens the game). The banner says "installing" first, so the close isn't a mystery.
  setUpdateStatus({ state: 'installing', version: updateStatus.version });
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 1200);
});

function checkForUpdates() {
  if (!app.isPackaged) return;
  // Download in the background while the player plays; the banner shows progress from the first
  // screen, and the new build installs when the game closes or when the player picks Restart now.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let version = '';
  autoUpdater.on('update-available', (info) => { version = info.version; setUpdateStatus({ state: 'downloading', version, percent: 0 }); });
  autoUpdater.on('download-progress', (p) => setUpdateStatus({ state: 'downloading', version, percent: Math.floor(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => setUpdateStatus({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    console.warn('[update]', err?.message ?? err);
    if (version) setUpdateStatus({ state: 'error', version });
  });
  autoUpdater.checkForUpdates().catch((err) => console.warn('[update]', err?.message ?? err));
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  checkForUpdates();
});

app.on('window-all-closed', () => app.quit());
