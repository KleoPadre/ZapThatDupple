import { useState } from 'react'
import { FolderPlus, X, Play, Square, RotateCcw, Folder } from 'lucide-react'
import { useStore } from '../store'
import { startScan, stopScan } from '../utils/api'
import { ProgressBar } from '../components/ProgressBar'

declare global {
  interface Window {
    electronAPI: {
      showFolderDialog: () => Promise<string[]>
      revealInFinder: (path: string) => void
      openExternal: (url: string) => void
      getHomeDir: () => Promise<string>
    }
  }
}

function formatTime(seconds: number, t: any): string {
  if (seconds < 60) return `${seconds} ${t.scan.seconds}`
  return `${Math.floor(seconds / 60)} ${t.scan.minutes} ${seconds % 60} ${t.scan.seconds}`
}

export function ScanPage({ t }: { t: any }) {
  const { selectedFolders, addFolder, removeFolder, settings, setScanState, scanState, setActiveTab } = useStore()
  const [fullRescan, setFullRescan] = useState(false)

  const isRunning = ['scanning', 'processing', 'loading_models', 'comparing'].includes(scanState.status)

  const handleAddFolders = async () => {
    if (!window.electronAPI) return
    const folders = await window.electronAPI.showFolderDialog()
    folders.forEach(addFolder)
  }

  const handleStart = async () => {
    if (selectedFolders.length === 0) return
    setScanState({ status: 'scanning', progress: 0, processed: 0 })

    try {
      await startScan({
        folders: selectedFolders,
        image_model: settings.image_model,
        text_model: settings.text_model,
        image_threshold: settings.image_threshold,
        text_threshold: settings.text_threshold,
        audio_threshold: settings.audio_threshold,
        video_threshold: settings.video_threshold,
        video_frames: settings.video_frames,
        full_rescan: fullRescan,
      })
    } catch (e: any) {
      setScanState({ status: 'error', error: e.message })
    }
  }

  const handleStop = async () => {
    await stopScan()
    setScanState({ status: 'idle' })
  }

  const getStepLabel = () => {
    switch (scanState.status) {
      case 'scanning': return t.scan.scanning
      case 'loading_models': return t.scan.loadingModels
      case 'processing': return t.scan.processing
      case 'comparing': return t.scan.comparing
      case 'done': return t.scan.done
      default: return scanState.message || ''
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-8">{t.scan.title}</h1>

      {/* Folder selection */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">
            {t.scan.selectedFolders}
          </h2>
          <button
            onClick={handleAddFolders}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-all text-sm disabled:opacity-40"
          >
            <FolderPlus size={15} />
            {t.scan.addFolder}
          </button>
        </div>

        {selectedFolders.length === 0 ? (
          <div
            onClick={handleAddFolders}
            className="border-2 border-dashed border-white/10 rounded-xl p-12 text-center cursor-pointer hover:border-violet-500/40 hover:bg-violet-500/5 transition-all"
          >
            <Folder className="mx-auto mb-3 text-white/20" size={40} />
            <p className="text-white/30 text-sm">{t.scan.noFolders}</p>
            <p className="text-violet-400/60 text-xs mt-1">{t.scan.selectFolders}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedFolders.map((folder) => (
              <div
                key={folder}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/5"
              >
                <Folder size={16} className="text-violet-400 shrink-0" />
                <span className="text-white/70 text-sm flex-1 truncate">{folder}</span>
                {!isRunning && (
                  <button
                    onClick={() => removeFolder(folder)}
                    className="text-white/20 hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Options */}
      <section className="mb-8">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            onClick={() => !isRunning && setFullRescan(!fullRescan)}
            className={`w-11 h-6 rounded-full transition-colors ${fullRescan ? 'bg-violet-500' : 'bg-white/10'} relative`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${fullRescan ? 'translate-x-6' : 'translate-x-1'}`} />
          </div>
          <div>
            <p className="text-sm text-white/70">{t.scan.fullRescan}</p>
            <p className="text-xs text-white/30">{t.scan.fullRescanDesc}</p>
          </div>
        </label>
      </section>

      {/* Progress */}
      {isRunning || scanState.status === 'done' || scanState.status === 'error' ? (
        <section className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-white/80">{getStepLabel()}</p>
            {scanState.status === 'done' && (
              <span className="text-xs text-violet-400 bg-violet-500/10 px-3 py-1 rounded-full">
                {scanState.groups_found} {t.scan.groupsFound}
              </span>
            )}
          </div>

          <ProgressBar value={scanState.progress} />

          <div className="flex items-center justify-between mt-3 text-xs text-white/30">
            <span>
              {scanState.processed} {t.scan.of} {scanState.total_files} {t.scan.filesProcessed}
            </span>
            {scanState.remaining !== undefined && scanState.remaining > 0 && (
              <span>{formatTime(scanState.remaining, t)} {t.scan.timeRemaining}</span>
            )}
          </div>

          {scanState.current_file && isRunning && (
            <p className="mt-2 text-xs text-white/20 truncate">
              {t.scan.currentFile}: {scanState.current_file}
            </p>
          )}

          {scanState.status === 'error' && (
            <p className="mt-2 text-xs text-red-400">{scanState.error}</p>
          )}

          {scanState.status === 'done' && (
            <button
              onClick={() => setActiveTab('results')}
              className="mt-4 w-full py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-sm font-medium transition-all"
            >
              {t.nav.results} →
            </button>
          )}
        </section>
      ) : null}

      {/* Action button */}
      <div className="flex gap-3">
        {isRunning ? (
          <button
            onClick={handleStop}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all font-medium"
          >
            <Square size={16} />
            {t.scan.stopScan}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={selectedFolders.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all font-medium shadow-lg shadow-violet-500/20"
          >
            <Play size={16} />
            {t.scan.startScan}
          </button>
        )}
      </div>
    </div>
  )
}
