import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import net from 'net'
import fs from 'fs'

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

const BACKEND_PORT = 8765
const isPackaged = app.isPackaged

// Log file
const logDir = path.join(app.getPath('home'), 'Zap that Dupple')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, 'app.log')
const logStream = fs.createWriteStream(logFile, { flags: 'a' })

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  logStream.write(line + '\n')
}

// ── Backend path resolution ───────────────────────────────────────────────────
function getBackendDir(): string {
  if (isPackaged) {
    return path.join(process.resourcesPath, 'backend_app')
  }
  // Dev / .command launcher: backend is sibling of frontend/
  return path.join(__dirname, '../../backend')
}

function getPythonPath(backendDir: string): string {
  if (isPackaged) {
    return path.join(backendDir, 'backend_app') // PyInstaller binary
  }
  // Try venv first, fallback to system python3
  const venvPython = path.join(backendDir, 'venv/bin/python3')
  if (fs.existsSync(venvPython)) return venvPython
  return 'python3'
}

// ── Start backend ─────────────────────────────────────────────────────────────
function startBackend() {
  const backendDir = getBackendDir()
  log(`Backend dir: ${backendDir}`)

  if (isPackaged) {
    const exe = getPythonPath(backendDir)
    log(`Starting packaged backend: ${exe}`)
    backendProcess = spawn(exe, [], {
      cwd: backendDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: 'pipe',
    })
  } else {
    const python = getPythonPath(backendDir)
    log(`Starting dev backend: ${python} main.py in ${backendDir}`)
    backendProcess = spawn(python, ['main.py'], {
      cwd: backendDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: 'pipe',
    })
  }

  backendProcess.stdout?.on('data', (d) => log(`[backend] ${d.toString().trim()}`))
  backendProcess.stderr?.on('data', (d) => log(`[backend:err] ${d.toString().trim()}`))
  backendProcess.on('close', (code) => log(`Backend exited with code ${code}`))
  backendProcess.on('error', (e) => log(`Backend spawn error: ${e.message}`))
}

// ── Wait for backend port ─────────────────────────────────────────────────────
function waitForBackend(port: number, timeout = 40000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket
        .connect(port, '127.0.0.1', () => {
          socket.destroy()
          log(`Backend ready on port ${port}`)
          resolve()
        })
        .on('error', () => {
          socket.destroy()
          if (Date.now() - start > timeout) {
            reject(new Error(`Backend did not start within ${timeout / 1000}s — check ~/ZapThatDupple/app.log`))
          } else {
            setTimeout(check, 500)
          }
        })
        .on('timeout', () => {
          socket.destroy()
          setTimeout(check, 500)
        })
    }
    check()
  })
}

// ── Frontend URL/path ─────────────────────────────────────────────────────────
function getFrontendPath(): { type: 'file' | 'url'; value: string } {
  // Packaged app
  if (isPackaged) {
    return { type: 'file', value: path.join(__dirname, '../dist/index.html') }
  }
  // Check if pre-built dist exists (launched via .command)
  const distPath = path.join(__dirname, '../dist/index.html')
  if (fs.existsSync(distPath)) {
    log(`Loading from pre-built dist: ${distPath}`)
    return { type: 'file', value: distPath }
  }
  // Dev server
  log('Loading from Vite dev server: http://localhost:5173')
  return { type: 'url', value: 'http://localhost:5173' }
}

// ── Create window ─────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(__dirname, '../assets/icon.png')

  mainWindow = new BrowserWindow({
    icon: iconPath,
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f11',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
    },
  })

  const { type, value } = getFrontendPath()
  if (type === 'file') {
    mainWindow.loadFile(value)
  } else {
    mainWindow.loadURL(value)
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    log(`Window failed to load: ${code} ${desc}`)
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Check if port in use ─────────────────────────────────────────────────────
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(300)
    socket
      .connect(port, '127.0.0.1', () => { socket.destroy(); resolve(true) })
      .on('error', () => { socket.destroy(); resolve(false) })
      .on('timeout', () => { socket.destroy(); resolve(false) })
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('App starting...')

  // Only start backend if not already running (launched via .command)
  const alreadyRunning = await isPortInUse(BACKEND_PORT)
  if (alreadyRunning) {
    log('Backend already running on port ' + BACKEND_PORT + ', skipping spawn')
  } else {
    startBackend()
  }

  try {
    await waitForBackend(BACKEND_PORT)
  } catch (e: any) {
    log(`ERROR: ${e.message}`)
    dialog.showErrorBox('ZapThatDupple — Backend Error', `${e.message}\n\nЛог: ~/ZapThatDupple/app.log`)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else { mainWindow?.show(); mainWindow?.focus() }
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  backendProcess?.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  backendProcess?.kill()
})

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('show-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'multiSelections'],
  })
  return result.filePaths
})

ipcMain.handle('reveal-in-finder', async (_, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('open-external', async (_, url: string) => {
  shell.openExternal(url)
})

ipcMain.handle('get-home-dir', () => app.getPath('home'))

ipcMain.handle('get-log-path', () => logFile)
