const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  steamPath: 'C:\\Program Files (x86)\\Steam\\steam.exe',
  discordPath: '',
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

ipcMain.handle('browse-file', async (_event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title || 'Select file',
    properties: ['openFile'],
    filters: [
      { name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'lnk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('launch-default', async () => {
  const settings = loadSettings();
  const errors = [];
  const launched = [];
  const myPid = process.pid;

  // Close all visible windows EXCEPT our own launcher
  try {
    // Get our own PID so we don't kill ourselves
    await execPromise(`powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.Id -ne ${myPid} -and $_.ProcessName -ne 'MyLauncher' -and $_.ProcessName -ne 'electron' } | Stop-Process -Force -ErrorAction SilentlyContinue"`);
  } catch (e) {
    // Some processes may refuse to close, that's ok
  }

  // Wait for processes to close
  await sleep(2000);

  // Launch Zapret
  if (settings.zapretPath) {
    const result = await launchApp(settings.zapretPath, [], 'Zapret');
    if (result.error) errors.push(result.error);
    else launched.push('Zapret');
  }

  // Launch Steam
  if (settings.steamPath) {
    const result = await launchApp(settings.steamPath, [], 'Steam');
    if (result.error) errors.push(result.error);
    else launched.push('Steam');
  }

  // Launch Discord
  if (settings.discordPath) {
    // Discord can be either Update.exe or Discord.exe directly
    const discordArgs = settings.discordPath.toLowerCase().includes('update.exe')
      ? ['--processStart', 'Discord.exe']
      : [];
    const result = await launchApp(settings.discordPath, discordArgs, 'Discord');
    if (result.error) errors.push(result.error);
    else launched.push('Discord');
  }

  // Small delay between launches
  await sleep(500);

  // Launch Firefox with tabs
  if (settings.firefoxPath) {
    const urls = (settings.firefoxUrls || []).filter(u => u.trim());
    const result = await launchFirefox(settings.firefoxPath, urls);
    if (result.error) errors.push(result.error);
    else launched.push('Firefox');
  }

  return {
    launched,
    errors
  };
});

// Launch any app via PowerShell Start-Process — handles spaces, parentheses, any path
async function launchApp(exePath, args, name) {
  if (!fs.existsSync(exePath)) {
    return { error: `${name}: file not found — "${exePath}"` };
  }

  try {
    // PowerShell Start-Process with single-quoted path handles ALL special chars
    // including spaces and parentheses like "general (ALT9).bat"
    const argsStr = args.length > 0
      ? ` -ArgumentList '${args.join("', '")}'`
      : '';
    const child = spawn('powershell', [
      '-NoProfile', '-Command',
      `Start-Process -FilePath '${exePath}'${argsStr}`
    ], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { error: `${name}: failed to launch — ${e.message}` };
  }
}

// Launch Firefox with multiple URLs — each URL as a separate -url argument
async function launchFirefox(firefoxPath, urls) {
  if (!fs.existsSync(firefoxPath)) {
    return { error: `Firefox: file not found — "${firefoxPath}"` };
  }

  try {
    // Firefox: first URL opens normally, rest via -new-tab
    // But simplest: just pass all URLs as arguments
    const urlStr = urls.length > 0
      ? ` -ArgumentList '${urls.join("', '")}'`
      : '';
    const child = spawn('powershell', [
      '-NoProfile', '-Command',
      `Start-Process -FilePath '${firefoxPath}'${urlStr}`
    ], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { error: `Firefox: failed to launch — ${e.message}` };
  }
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
