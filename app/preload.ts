import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  codeAutoMask: (code: string, namespace: string, language?: string, includeProperties?: boolean) =>
    ipcRenderer.invoke('code:auto-mask', code, namespace, language, includeProperties),
  
  codeSelectMask: (code: string, selected: string[], namespace: string, language?: string) =>
    ipcRenderer.invoke('code:select-mask', code, selected, namespace, language),
  
  codeSymbols: (code: string, language?: string, includeProperties?: boolean) =>
    ipcRenderer.invoke('code:symbols', code, language, includeProperties),
  
  textMaskSelected: (text: string, selected: string[], namespace: string, caseSensitive?: boolean) =>
    ipcRenderer.invoke('text:mask-selected', text, selected, namespace, caseSensitive),
  
  textDetect: (text: string) =>
    ipcRenderer.invoke('text:detect', text),
  
  unmask: (text: string, namespace: string) =>
    ipcRenderer.invoke('unmask', text, namespace),
  
  wipeMapping: (namespace?: string | null) =>
    ipcRenderer.invoke('wipe-mapping', namespace),
  
  getAllNamespaces: () =>
    ipcRenderer.invoke('get-all-namespaces') as Promise<string[]>,

  fileSave: (content: string) =>
    ipcRenderer.invoke('file:save', content),
  
  fileSaveAs: (content: string) =>
    ipcRenderer.invoke('file:save-as', content),
  
  fileOpen: () =>
    ipcRenderer.invoke('file:open'),

  onFileOpened: (callback: (content: string, filePath: string) => void) => {
    ipcRenderer.on('file-opened', (_, content: string, filePath: string) => callback(content, filePath));
  },

  onFileSave: (callback: () => void) => {
    ipcRenderer.on('file-save', () => callback());
  },

  onFileSaveAs: (callback: () => void) => {
    ipcRenderer.on('file-save-as', () => callback());
  },

  onViewSelectNamespace: (callback: () => void) => {
    ipcRenderer.on('view:select-namespace', () => callback());
  },
  onViewNextTab: (callback: () => void) => {
    ipcRenderer.on('view:next-tab', () => callback());
  },
  onViewPreviousTab: (callback: () => void) => {
    ipcRenderer.on('view:previous-tab', () => callback());
  },
  onViewSetLanguage: (callback: (lang: string) => void) => {
    ipcRenderer.on('view:set-language', (_evt, lang: string) => callback(lang));
  },

  onFileNew: (callback: () => void) => {
    ipcRenderer.on('file:new', () => callback());
  },

  onEditCut: (callback: () => void) => {
    ipcRenderer.on('edit:cut', () => callback());
  },

  onEditCopy: (callback: () => void) => {
    ipcRenderer.on('edit:copy', () => callback());
  },

  onEditPaste: (callback: () => void) => {
    ipcRenderer.on('edit:paste', () => callback());
  },

  onEditDelete: (callback: () => void) => {
    ipcRenderer.on('edit:delete', () => callback());
  },

  onEditUndo: (callback: () => void) => {
    ipcRenderer.on('edit:undo', () => callback());
  },

  onEditRedo: (callback: () => void) => {
    ipcRenderer.on('edit:redo', () => callback());
  },

  onEditClearInput: (callback: () => void) => {
    ipcRenderer.on('edit:clear-input', () => callback());
  },

  onEditClearOutput: (callback: () => void) => {
    ipcRenderer.on('edit:clear-output', () => callback());
  },

  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  onWindowMaximized: (callback: () => void) => {
    ipcRenderer.on('window-maximized', () => callback());
  },

  onWindowUnmaximized: (callback: () => void) => {
    ipcRenderer.on('window-unmaximized', () => callback());
  },

  newWindow: () => ipcRenderer.invoke('window:new'),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-dev-tools'),

  helpAbout: () => ipcRenderer.invoke('help:about') as Promise<{ name: string; version: string; description: string }>,
  helpRestart: () => ipcRenderer.invoke('help:restart'),
  helpOpenManual: () => ipcRenderer.invoke('help:open-manual'),

  onHelpAbout: (callback: () => void) => {
    ipcRenderer.on('help:about', () => callback());
  },

  onHelpRestart: (callback: () => void) => {
    ipcRenderer.on('help:restart', () => callback());
  }
});

// Type definitions for TypeScript in renderer
declare global {
  interface Window {
    electronAPI: {
      codeAutoMask: (code: string, namespace: string, language?: string, includeProperties?: boolean) => Promise<string>;
      codeSelectMask: (code: string, selected: string[], namespace: string, language?: string) => Promise<string>;
      codeSymbols: (code: string, language?: string, includeProperties?: boolean) => Promise<string[]>;
      textMaskSelected: (text: string, selected: string[], namespace: string, caseSensitive?: boolean) => Promise<string>;
      textDetect: (text: string) => Promise<Array<{ text: string; type: string; start: number; end: number }>>;
      unmask: (text: string, namespace: string) => Promise<string>;
      wipeMapping: (namespace?: string | null) => Promise<boolean>;
      getAllNamespaces: () => Promise<string[]>;
      fileSave: (content: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      fileSaveAs: (content: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      fileOpen: () => Promise<{ success: boolean; content?: string; path?: string; error?: string }>;
      onFileOpened: (callback: (content: string, filePath: string) => void) => void;
      onFileSave: (callback: () => void) => void;
      onFileSaveAs: (callback: () => void) => void;
      onViewSelectNamespace: (callback: () => void) => void;
      onViewNextTab: (callback: () => void) => void;
      onViewPreviousTab: (callback: () => void) => void;
      onViewSetLanguage: (callback: (lang: string) => void) => void;
      onFileNew: (callback: () => void) => void;
      onEditCut: (callback: () => void) => void;
      onEditCopy: (callback: () => void) => void;
      onEditPaste: (callback: () => void) => void;
      onEditDelete: (callback: () => void) => void;
      onEditUndo: (callback: () => void) => void;
      onEditRedo: (callback: () => void) => void;
      onEditClearInput: (callback: () => void) => void;
      onEditClearOutput: (callback: () => void) => void;
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowToggleMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      onWindowMaximized: (callback: () => void) => void;
      onWindowUnmaximized: (callback: () => void) => void;
      newWindow: () => Promise<void>;
      toggleDevTools: () => Promise<void>;
      helpAbout: () => Promise<{ name: string; version: string; description: string }>;
      helpRestart: () => Promise<void>;
      helpOpenManual: () => Promise<void>;
      onHelpAbout: (callback: () => void) => void;
      onHelpRestart: (callback: () => void) => void;
    };
  }
}

