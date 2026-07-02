const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: false,
    backgroundColor: '#0B0C10',
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'public', 'assets', 'icon.png')
  });

  // load remote dev server or local file
  if (isDev) {
    win.loadURL('http://localhost:3000/app.html');
  } else {
    win.loadFile(path.join(__dirname, 'public', 'app.html'));
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  // prevent navigation outside
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = ['file://', 'http://localhost'];
    if (!allowed.some(a => url.startsWith(a))) e.preventDefault();
  });

  return win;
}

app.on('ready', () => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
