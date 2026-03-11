import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import net from 'net'
import fs from 'fs'

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

const BACKEND_PORT = 8765
const isPackaged = app.isPackaged
const isWindows = process.platform === 'win32'

// ── Logging ───────────────────────────────────────────────────────────────────
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
  return path.join(__dirname, '../../backend')
}

function getBackendExecutable(): { cmd: string; args: string[] } {
  const backendDir = getBackendDir()

  if (isPackaged) {
    // PyInstaller binary
    const exe = isWindows
      ? path.join(backendDir, 'backend_app.exe')
      : path.join(backendDir, 'backend_app')
    return { cmd: exe, args: [] }
  }

  // Dev mode — find python in venv
  const venvPython = isWindows
    ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.join(backendDir, 'venv', 'bin', 'python3')

  const python = fs.existsSync(venvPython) ? venvPython : (isWindows ? 'python' : 'python3')
  return { cmd: python, args: ['main.py'] }
}

// ── Start backend ─────────────────────────────────────────────────────────────
function startBackend() {
  const backendDir = getBackendDir()
  const { cmd, args } = getBackendExecutable()

  // Log diagnostics
  log(`Backend dir: ${backendDir} (exists=${fs.existsSync(backendDir)})`)
  log(`Backend exe: ${cmd} (exists=${fs.existsSync(cmd)})`)
  if (fs.existsSync(backendDir)) {
    try {
      const entries = fs.readdirSync(backendDir).slice(0, 20)
      log(`Backend dir contents: ${entries.join(', ')}`)
    } catch (e) {}
  }

  backendProcess = spawn(cmd, args, {
    cwd: backendDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: 'pipe',
    // On Windows, don't show console window
    ...(isWindows ? { windowsHide: true } : {}),
  })

  backendProcess.stdout?.on('data', (d) => log(`[backend] ${d.toString().trim()}`))
  backendProcess.stderr?.on('data', (d) => log(`[backend:err] ${d.toString().trim()}`))
  backendProcess.on('close', (code) => log(`Backend exited with code ${code}`))
  backendProcess.on('error', (e) => log(`Backend spawn error: ${e.message}`))
}

// ── Port check ────────────────────────────────────────────────────────────────
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

function waitForBackend(port: number, timeout = 60000): Promise<void> {
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
            reject(new Error(`Backend did not start within ${timeout / 1000}s\nLog: ${logFile}`))
          } else {
            setTimeout(check, 600)
          }
        })
        .on('timeout', () => { socket.destroy(); setTimeout(check, 600) })
    }
    check()
  })
}

// ── Frontend URL/path ─────────────────────────────────────────────────────────
function getFrontendPath(): { type: 'file' | 'url'; value: string } {
  if (isPackaged) {
    return { type: 'file', value: path.join(__dirname, '../dist/index.html') }
  }
  const distPath = path.join(__dirname, '../dist/index.html')
  if (fs.existsSync(distPath)) {
    log(`Loading from pre-built dist: ${distPath}`)
    return { type: 'file', value: distPath }
  }
  log('Loading from Vite dev server')
  return { type: 'url', value: 'http://localhost:5173' }
}

// ── Create window ─────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '../assets/icon.png')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: isWindows ? 'default' : 'hiddenInset',
    // titleBarOverlay reserves the full top strip as a native drag area (macOS)
    titleBarOverlay: isWindows ? false : { height: 52 },
    // traffic lights centered in 52px strip: 52/2 - 7 = 19
    trafficLightPosition: { x: 15, y: 19 },
    backgroundColor: '#1C1C1C',
    show: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
    },
  })

  const { type, value } = getFrontendPath()
  if (type === 'file') mainWindow.loadFile(value)
  else mainWindow.loadURL(value)

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    log(`Window failed to load: ${code} ${desc}`)
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)  // Hide File/Edit/View menu bar
  log(`App starting (packaged=${isPackaged}, platform=${process.platform})`)

  const alreadyRunning = await isPortInUse(BACKEND_PORT)
  if (alreadyRunning) {
    log('Backend already running, skipping spawn')
  } else {
    startBackend()
  }

  try {
    await waitForBackend(BACKEND_PORT)
  } catch (e: any) {
    log(`ERROR: ${e.message}`)
    // Only show error dialog in packaged mode — in dev the .bat already handles it
    if (isPackaged) {
      const choice = dialog.showMessageBoxSync({
        type: 'error',
        title: 'Zap that Dupple — Backend Error',
        message: 'Backend failed to start',
        detail: `${e.message}\n\nLog file: ${logFile}`,
        buttons: ['Open Log', 'Continue Anyway'],
        defaultId: 1,
      })
      if (choice === 0) {
        shell.openPath(logFile)
      }
      // Continue regardless — user chose to proceed
    }
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

app.on('before-quit', () => { backendProcess?.kill() })

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
