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
// { state: 'available' | 'installing' | 'error', version } / { state: 'downloading', version, percent }.
let updateStatus = null;
function setUpdateStatus(status) {
  updateStatus = status;
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status);
}
ipcMain.handle('update:get', () => updateStatus);
// Update now: download (the banner shows progress), then install straight away.
ipcMain.handle('update:start', () => {
  if (updateStatus?.state !== 'available' && updateStatus?.state !== 'error') return;
  setUpdateStatus({ state: 'downloading', version: updateStatus.version, percent: 0 });
  autoUpdater.downloadUpdate().catch((err) => console.warn('[update]', err?.message ?? err));
});

function checkForUpdates() {
  if (!app.isPackaged) return;
  // Nothing downloads until the player picks Update now; Later just hides the banner, and the next
  // launch asks again.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  let version = '';
  autoUpdater.on('update-available', (info) => { version = info.version; setUpdateStatus({ state: 'available', version }); });
  autoUpdater.on('download-progress', (p) => setUpdateStatus({ state: 'downloading', version, percent: Math.floor(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    // Not silent: the themed installer shows its progress bar (build/installer.nsh skips its questions
    // on updates and reopens the game). The banner says "installing" first, so the close isn't a mystery.
    setUpdateStatus({ state: 'installing', version: info.version });
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 1500);
  });
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
