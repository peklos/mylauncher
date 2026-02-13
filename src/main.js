const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  steamPath: 'C:\\Program Files (x86)\\Steam\\steam.exe',
  discordPath: path.join(process.env.LOCALAPPDATA || '', 'Discord', 'Update.exe'),
  firefoxPath: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  zapretPath: '',
  firefoxUrls: [
    'https://vk.com',
    'https://web.telegram.org',
    'https://youtube.com',
    'https://twitch.tv'
  ]
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  try {
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// IPC handlers
ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', (_event, settings) => {
  saveSettings(settings);
  return true;
});

ipcMain.handle('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.handle('close-window', () => {
  mainWindow.close();
});

ipcMain.handle('launch-default', async () => {
  const settings = loadSettings();

  // Close all visible windows (taskkill visible user processes)
  try {
    await execPromise('powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne \'\' } | Stop-Process -Force"');
  } catch (e) {
    // Some processes may refuse to close, that's ok
  }

  // Wait a bit for processes to close
  await new Promise(r => setTimeout(r, 1500));

  const launches = [];

  // Launch Zapret
  if (settings.zapretPath && fs.existsSync(settings.zapretPath)) {
    launches.push(execPromise(`start "" "${settings.zapretPath}"`));
  }

  // Launch Steam
  if (settings.steamPath && fs.existsSync(settings.steamPath)) {
    launches.push(execPromise(`start "" "${settings.steamPath}"`));
  }

  // Launch Discord
  if (settings.discordPath) {
    const discordDir = path.dirname(settings.discordPath);
    if (fs.existsSync(settings.discordPath)) {
      launches.push(execPromise(`start "" "${settings.discordPath}" --processStart Discord.exe`));
    }
  }

  // Launch Firefox with tabs
  if (settings.firefoxPath && fs.existsSync(settings.firefoxPath)) {
    const urls = settings.firefoxUrls.join(' ');
    launches.push(execPromise(`start "" "${settings.firefoxPath}" ${urls}`));
  }

  await Promise.allSettled(launches);
  return true;
});

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}
