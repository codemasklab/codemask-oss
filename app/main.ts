import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { CodeMaskingEngine } from '../core/code/engine';
import { maskSelectedWords, unmaskText } from '../core/text/text_mask';
import { getAllMappings, getAllNamespaces, wipeAll, wipeNamespace } from '../core/mapping/store';
import { detectAll } from '../core/text/detectors';

let mainWindow: BrowserWindow | null = null;
const windowFilePaths = new Map<number, string>(); // Track file path per window

function createWindow(): BrowserWindow {
  const windowConfig: Electron.BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    frame: true, // Use native frame to keep OS window controls
    autoHideMenuBar: true, // Hide native menu bar - using custom titlebar
    title: '', // Remove title from native window header
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  // Use native frame with custom titlebar overlay (keeps native window controls)
  // Custom titlebar will be shown, native menu bar will be hidden
  if (process.platform === 'darwin') {
    // macOS: Use hiddenInset for overlay titlebar with native controls
    windowConfig.titleBarStyle = 'hiddenInset';
  } else if (process.platform === 'win32') {
    // Windows: Use titleBarOverlay to keep native controls but allow custom titlebar
    windowConfig.titleBarOverlay = {
      color: '#2d2d30', // Match titlebar background
      symbolColor: '#cccccc', // Match text color
      height: 32 // Match titlebar height
    };
    windowConfig.frame = true; // Keep native frame for controls
  } else {
    // Linux: Use hidden for overlay titlebar
    windowConfig.titleBarStyle = 'hidden';
  }

  const window = new BrowserWindow(windowConfig);

  // Hide native menu bar - using custom titlebar menu instead
  window.setMenuBarVisibility(false);
  window.setAutoHideMenuBar(true);
  
  // Remove title from native window header
  window.setTitle('');

  window.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    window.webContents.openDevTools();
  }

  // Track the first window as main window
  if (!mainWindow) {
    mainWindow = window;
  }

  // Send window state events to renderer (if needed for UI updates)
  // Native OS handles maximize/restore automatically with frame: true
  window.on('maximize', () => {
    window.webContents.send('window-maximized');
  });

  window.on('unmaximize', () => {
    window.webContents.send('window-unmaximized');
  });

  // Clean up when window is closed
  window.on('closed', () => {
    windowFilePaths.delete(window.id);
    if (window === mainWindow) {
      mainWindow = null;
    }
  });

  return window;
}

app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            const targetWindow = focusedWindow || mainWindow;
            if (targetWindow) {
              // Clear the current screen by sending a clear event
              targetWindow.webContents.send('file:new');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            const targetWindow = focusedWindow || mainWindow;
            if (!targetWindow) return;
            
            const result = await dialog.showOpenDialog(targetWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'JavaScript', extensions: ['js', 'jsx', 'mjs', 'cjs'] },
                { name: 'TypeScript', extensions: ['ts', 'tsx'] },
                { name: 'Python', extensions: ['py', 'pyw', 'pyi'] },
                { name: 'Java', extensions: ['java'] },
                { name: 'Go', extensions: ['go'] },
                { name: 'C++', extensions: ['cpp', 'cxx', 'cc', 'c++', 'hpp', 'hxx', 'h++'] },
                { name: 'C', extensions: ['c', 'h'] },
                { name: 'Rust', extensions: ['rs'] },
                { name: 'Ruby', extensions: ['rb'] },
                { name: 'PHP', extensions: ['php', 'phtml', 'php3', 'php4', 'php5'] },
                { name: 'Bash/Shell', extensions: ['sh', 'bash', 'zsh', 'fish'] },
                { name: 'SQL', extensions: ['sql'] },
                { name: 'HTML', extensions: ['html', 'htm'] },
                { name: 'CSS', extensions: ['css'] },
                { name: 'JSON', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
              const filePath = result.filePaths[0];
              try {
                const content = fs.readFileSync(filePath, 'utf8');
                windowFilePaths.set(targetWindow.id, filePath);
                targetWindow.webContents.send('file-opened', content, filePath);
              } catch (error: any) {
                dialog.showErrorBox('Error', `Failed to open file: ${error.message || error}`);
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            const targetWindow = focusedWindow || mainWindow;
            if (!targetWindow) return;
            
            const currentFilePath = windowFilePaths.get(targetWindow.id);
            if (currentFilePath) {
              // Save to existing file
              targetWindow.webContents.send('file-save');
            } else {
              // Save as new file
              targetWindow.webContents.send('file-save-as');
            }
          }
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            const targetWindow = focusedWindow || mainWindow;
            if (!targetWindow) return;
            targetWindow.webContents.send('file-save-as');
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('edit:cut');
            }
          }
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('edit:copy');
            }
          }
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('edit:paste');
            }
          }
        },
        {
          label: 'Delete',
          accelerator: 'Delete',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('edit:delete');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('edit:undo');
            }
          }
        },
        {
          label: 'Redo',
          accelerator: process.platform === 'darwin' ? 'CmdOrCtrl+Shift+Z' : 'CmdOrCtrl+Y',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('edit:redo');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Clear Input',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('edit:clear-input');
            }
          }
        },
        {
          label: 'Clear Output',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('edit:clear-output');
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Select Mapping Group',
          accelerator: 'Ctrl+Shift+M',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.send('view:select-namespace');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Language',
          submenu: (() => {
            const defs = [
              { id: 'javascript', label: 'JavaScript' },
              { id: 'typescript', label: 'TypeScript' },
              { id: 'python', label: 'Python' },
              { id: 'java', label: 'Java' },
              { id: 'go', label: 'Go' },
              { id: 'c', label: 'C' },
              { id: 'cpp', label: 'C++' },
              { id: 'rust', label: 'Rust' },
              { id: 'ruby', label: 'Ruby' },
              { id: 'php', label: 'PHP' },
              { id: 'sql', label: 'SQL' },
              { id: 'plaintext', label: 'Plain Text' }
            ];
            const items: Electron.MenuItemConstructorOptions[] = defs.map(({ id, label }) => ({
              label,
              type: 'radio' as const,
              click: (_item: Electron.MenuItem, focusedWindow?: BrowserWindow | null) => {
                const target = focusedWindow || mainWindow;
                if (target) {
                  target.webContents.send('view:set-language', id);
                }
              }
            }));
            return items;
          })()
        },
        { type: 'separator' },
        {
          label: 'Next Tab',
          accelerator: process.platform === 'darwin' ? 'Cmd+Alt+Right' : 'Ctrl+Tab',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.send('view:next-tab');
            }
          }
        },
        {
          label: 'Previous Tab',
          accelerator: process.platform === 'darwin' ? 'Cmd+Alt+Left' : 'Ctrl+Shift+Tab',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.send('view:previous-tab');
            }
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            createWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.close();
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('help:about');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Restart to Update',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('help:restart');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Online Manual',
          click: () => {
            const { shell } = require('electron');
            shell.openExternal('https://codemasklab.com/manual'); // Update with actual URL when available
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
let secretKey: string | null = null;

async function getSecret(): Promise<string> {
  if (!secretKey) {
    // Generate or load from keychain (already handled by store)
    secretKey = crypto.randomBytes(32).toString('hex');
  }
  return secretKey;
}

ipcMain.handle('code:auto-mask', async (_, code: string, namespace: string, language?: string, includeProperties?: boolean) => {
  const secret = await getSecret();
  const result = await CodeMaskingEngine.autoMask(code, {
    namespace,
    secret,
    language,
    includeProperties: includeProperties ?? true
  });
  return result.masked;
});

ipcMain.handle('code:select-mask', async (_, code: string, selected: string[], namespace: string, language?: string) => {
  const secret = await getSecret();
  const result = await CodeMaskingEngine.selectMask(code, selected, {
    namespace,
    secret,
    language
  });
  return result.masked;
});

ipcMain.handle('code:symbols', async (_, code: string, language?: string, includeProperties?: boolean) => {
  return await CodeMaskingEngine.getSymbols(code, language, includeProperties);
});

ipcMain.handle('text:mask-selected', async (_, text: string, selected: string[], namespace: string, caseSensitive?: boolean) => {
  const secret = await getSecret();
  return await maskSelectedWords(text, selected, namespace, secret, caseSensitive ?? false);
});

ipcMain.handle('text:detect', async (_, text: string) => {
  return detectAll(text);
});

ipcMain.handle('unmask', async (_, text: string, namespace: string) => {
  const mappings = await getAllMappings(namespace);
  return await unmaskText(text, mappings);
});

ipcMain.handle('wipe-mapping', async (_, namespace?: string | null) => {
  if (namespace) {
    // Wipe only the specified namespace
    await wipeNamespace(namespace);
  } else {
    // Wipe all mappings
    await wipeAll();
    secretKey = null;
  }
  return true;
});

ipcMain.handle('get-all-namespaces', async () => {
  return await getAllNamespaces();
});

// File operations
ipcMain.handle('file:save', async (event, content: string) => {
  const windowId = event.sender.id;
  const currentFilePath = windowFilePaths.get(windowId);
  
  if (!currentFilePath) {
    return { success: false, error: 'No file path' };
  }
  
  try {
    fs.writeFileSync(currentFilePath, content, 'utf8');
    return { success: true, path: currentFilePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file:save-as', async (event, content: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return { success: false, error: 'No window' };
  }
  
  const result = await dialog.showSaveDialog(window, {
    // No filters - allow saving any file type
    // Users can specify any extension they want in the filename
  });
  
  if (result.canceled || !result.filePath) {
    return { success: false, error: 'Cancelled' };
  }
  
  try {
    fs.writeFileSync(result.filePath, content, 'utf8');
    windowFilePaths.set(window.id, result.filePath);
    return { success: true, path: result.filePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file:open', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return { success: false, error: 'No window' };
  }
  
  try {
    // Note: GLib-GObject errors in console are harmless GTK warnings on Linux/WSL
    // They don't prevent the dialog from working
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile']
      // No filters - allow opening any file type
      // Language detection will still work based on file extension
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Cancelled' };
    }
    
    const filePath = result.filePaths[0];
    console.log('Opening file:', filePath);
    
    const content = fs.readFileSync(filePath, 'utf8');
    windowFilePaths.set(window.id, filePath);
    return { success: true, content, path: filePath };
  } catch (error: any) {
    console.error('Error opening file:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

// Window controls
ipcMain.handle('window:minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.minimize();
  }
});

ipcMain.handle('window:close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.close();
  }
});

ipcMain.handle('window:new', () => {
  createWindow();
});

ipcMain.handle('window:toggle-dev-tools', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.webContents.toggleDevTools();
  }
});

// Help menu handlers
ipcMain.handle('help:about', () => {
  // Return app info for About dialog
  // Use path relative to project root (dist/app -> dist -> root)
  const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
  let packageJson: any = {};
  try {
    packageJson = require(packageJsonPath);
  } catch (e) {
    // Fallback if package.json not found
    console.warn('Could not load package.json:', e);
  }
  return {
    name: packageJson.name || 'CodeMaskLab',
    version: packageJson.version || app.getVersion() || '1.0.0',
    description: packageJson.description || 'A desktop application for masking sensitive identifiers and text before sending content to LLMs, with reversible token generation.'
  };
});

ipcMain.handle('help:restart', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('help:open-manual', () => {
  const { shell } = require('electron');
  shell.openExternal('https://codemasklab.com/manual'); // Update with actual URL when available
});

