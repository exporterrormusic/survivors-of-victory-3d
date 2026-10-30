// Desktop wrapper: serves dist/ from a fixed app://game origin (so localStorage saves survive every
// update and fetch() works for the .glb/.json assets), and checks GitHub Releases on each launch.
// Experimental updates (Settings > Data) also accept the pre-release builds CI makes from every push.
const { app, BrowserWindow, protocol, net, dialog, shell, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { autoUpdater } = require('electron-updater');

const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

// Lives beside the save data in userData, outside the install folder, so it survives updates.
const UPDATE_PREFS = () => path.join(app.getPath('userData'), 'update-prefs.json');
function readExperimental() {
  try { return JSON.parse(fs.readFileSync(UPDATE_PREFS(), 'utf8')).experimental === true; } catch { return false; }
}
function writeExperimental(enabled) {
  try { fs.writeFileSync(UPDATE_PREFS(), JSON.stringify({ experimental: enabled })); } catch (err) { console.warn('[update]', err?.message ?? err); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#000000',
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

function checkForUpdates() {
  if (!app.isPackaged) return;
  // Download in the background while the player plays; the new build is installed silently when the
  // game closes, and the player is offered an immediate restart only from the menu-safe dialog below.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = readExperimental();
  autoUpdater.on('error', (err) => console.warn('[update]', err?.message ?? err));
  autoUpdater.on('update-downloaded', async (info) => {
    if (!win || win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 1,
      cancelId: 1,
      title: 'Update ready',
      message: `Version ${info.version} is ready.`,
      detail: 'Restart now to update, or keep playing — it installs automatically when you close the game.',
    });
    if (response === 0) autoUpdater.quitAndInstall(true, true);
  });
  autoUpdater.checkForUpdates().catch((err) => console.warn('[update]', err?.message ?? err));
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

ipcMain.handle('updates:get-experimental', () => readExperimental());
ipcMain.handle('updates:set-experimental', (_e, enabled) => {
  writeExperimental(enabled);
  autoUpdater.allowPrerelease = enabled;
  // Opting in looks for the newest test build right away; opting out waits for the next stable release.
  if (enabled && app.isPackaged) autoUpdater.checkForUpdates().catch((err) => console.warn('[update]', err?.message ?? err));
  return enabled;
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
