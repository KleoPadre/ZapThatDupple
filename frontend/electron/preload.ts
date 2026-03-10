import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  showFolderDialog: () => ipcRenderer.invoke('show-folder-dialog'),
  revealInFinder: (path: string) => ipcRenderer.invoke('reveal-in-finder', path),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
})
