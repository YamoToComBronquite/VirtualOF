import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import updater from 'electron-updater';
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
  watchForUpdates();
}

// Installed copies check the GitHub Releases of the repo when they open (and every 4 hours).
// A new version is offered right away; the download only starts if the user says yes, shows its
// progress on the taskbar icon, and the app restarts into it. Running from source never updates.
function watchForUpdates() {
  if (!app.isPackaged) return;
  const { autoUpdater } = updater;
  autoUpdater.autoDownload = false;
  let busy = false;

  autoUpdater.on('update-available', async (info) => {
    if (busy) return;
    busy = true;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Atualização disponível',
      message: `Tem uma versão nova do VirtualOF: ${info.version} (você está na ${app.getVersion()}).`,
      detail: 'Atualizar agora? O download leva alguns minutos e aparece no ícone da barra de tarefas. No fim o app reinicia sozinho; se os agentes estiverem trabalhando, eles param.',
      buttons: ['Atualizar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) {
      busy = false;
      return;
    }
    autoUpdater.downloadUpdate().catch((error) => {
      busy = false;
      win?.setProgressBar(-1);
      void dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Atualização',
        message: 'Não consegui baixar a atualização.',
        detail: `${error?.message ?? error}\n\nO VirtualOF continua na versão atual e tenta de novo na próxima vez que abrir.`,
      });
    });
  });
  autoUpdater.on('download-progress', (progress) => win?.setProgressBar(progress.percent / 100));
  autoUpdater.on('update-downloaded', () => {
    win?.setProgressBar(-1);
    office?.shutdown();
    autoUpdater.quitAndInstall();
  });
  // No internet or no release yet is normal; the app just keeps the version it has.
  autoUpdater.on('error', (error) => console.warn('[update]', error?.message ?? error));

  const check = () => {
    if (!busy) autoUpdater.checkForUpdates().catch(() => {});
  };
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
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
