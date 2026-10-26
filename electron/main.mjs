import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';

// Desktop app: one window over the same office server, started on a free port.
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

if (!app.requestSingleInstanceLock()) app.quit();

// The install folder is read-only; the user's choices (project, team) live in app data.
process.env.VIRTUALOF_DATA_DIR = app.getPath('userData');

let office;
let win;

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(win, { title: 'Pasta do projeto', properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

async function open() {
  const { startOffice } = await import('../dist-server/app.mjs');
  office = await startOffice({ port: 0, web: { dir: here('../dist') } });

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'VirtualOF',
    backgroundColor: '#120f1c',
    autoHideMenuBar: true,
    icon: here('../build/icon.png'),
    webPreferences: { preload: here('preload.cjs'), contextIsolation: true, sandbox: true },
  });

  // Only the office itself loads in the window; any other link opens in the user's browser.
  const isOffice = (url) => url.startsWith(office.url);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isOffice(url)) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  await win.loadURL(office.url);
}

app.on('second-instance', () => {
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

app.whenReady().then(open).catch((error) => {
  dialog.showErrorBox('VirtualOF não abriu', String(error?.stack ?? error));
  app.quit();
});

// Closing the window turns the whole office off, agents included.
app.on('window-all-closed', () => {
  office?.shutdown();
  app.quit();
});
