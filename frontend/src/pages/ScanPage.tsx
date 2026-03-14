import { useState } from 'react'
import { FolderPlus, X, Play, Square, Folder, Check, Loader2, Clock } from 'lucide-react'
import { useStore } from '../store'
import { startScan, stopScan } from '../utils/api'

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

type StepStatus = 'pending' | 'running' | 'done'

interface StepDef {
  id: string
  label: string
  icon: string
  subtitle?: string
  progress?: number
  processed?: number
  total?: number
  currentFile?: string
  remaining?: number
}

function MiniBar({ value }: { value: number }) {
  return (
    <div className="w-full h-1 rounded-full bg-[#F2F4F3]/8 mt-2 overflow-hidden">
      <div
        className="h-full rounded-full bg-[#E8A838] transition-all duration-300"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}

function StepCard({ status, step, t }: { status: StepStatus; step: StepDef; t: any }) {
  const isRunning = status === 'running'
  const isDone = status === 'done'
  const isPending = status === 'pending'

  return (
    <div
      className={`rounded-2xl border px-5 py-4 transition-all duration-300 ${
        isRunning
          ? 'border-[#E8A838]/60 bg-[#F2F4F3]/5'
          : isDone
          ? 'border-[#1F555C]/50 bg-[#1F555C]/8'
          : 'border-[#F2F4F3]/5 bg-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-lg leading-none ${isPending ? 'opacity-30' : ''}`}>
            {isRunning ? <Loader2 size={18} className="text-[#E8A838] animate-spin" /> : step.icon}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-tight ${isPending ? 'text-[#F2F4F3]/25' : 'text-[#F2F4F3]/90'}`}>
              {step.label}
            </p>
            {step.subtitle && (
              <p className={`text-xs mt-0.5 truncate ${isPending ? 'text-[#F2F4F3]/12' : 'text-[#F2F4F3]/40'}`}>
                {step.subtitle}
              </p>
            )}
          </div>
        </div>

        {isDone && (
          <span className="shrink-0 flex items-center gap-1.5 text-xs text-[#7EE787] bg-[#7EE787]/10 px-3 py-1 rounded-full font-medium">
            <Check size={11} />
            {t.scan.statusDone}
          </span>
        )}
        {isRunning && (
          <span className="shrink-0 text-xs text-[#E8A838] bg-[#E8A838]/10 px-3 py-1 rounded-full font-medium">
            {t.scan.statusRunning}
          </span>
        )}
      </div>

      {/* Progress bar — only when running */}
      {isRunning && step.progress !== undefined && (
        <div className="mt-3">
          <MiniBar value={step.progress} />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-[#F2F4F3]/30">{step.processed?.toLocaleString() ?? 0}</span>
            <span className="text-xs text-[#F2F4F3]/30">
              {Math.round(step.progress)}% · {step.total?.toLocaleString() ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* Current file + time remaining */}
      {isRunning && (
        <div className="flex items-center justify-between mt-2 gap-3">
          {step.currentFile ? (
            <p className="text-xs text-[#F2F4F3]/25 truncate flex-1">{step.currentFile}</p>
          ) : <span />}
          {step.remaining !== undefined && step.remaining > 0 && (
            <p className="shrink-0 flex items-center gap-1 text-xs text-[#F2F4F3]/30">
              <Clock size={11} />
              {formatTime(step.remaining, t)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ScanPage({ t }: { t: any }) {
  const { selectedFolders, addFolder, removeFolder, settings, setScanState, scanState, setActiveTab } = useStore()
  const [fullRescan, setFullRescan] = useState(false)

  const isRunning = ['scanning', 'processing', 'loading_models', 'comparing'].includes(scanState.status)
  const showProgress = isRunning || scanState.status === 'done' || scanState.status === 'error'

  const handleAddFolders = async () => {
    if (!window.electronAPI) return
    const folders = await window.electronAPI.showFolderDialog()
    folders.forEach(addFolder)
  }

  const handleStart = async () => {
    if (selectedFolders.length === 0) return
    setScanState({ status: 'scanning', progress: 0, processed: 0, log_messages: [] })
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

  // ─── Step logic ────────────────────────────────────────────────────────────

  const STATUS_ORDER = [
    'scanning',
    'loading_models',
    'processing_image',
    'processing_video',
    'processing_audio',
    'processing_document',
    'comparing',
  ]

  const currentStepId = (): string => {
    if (scanState.status === 'processing') {
      return scanState.substep ? `processing_${scanState.substep}` : 'processing_image'
    }
    return scanState.status
  }

  const getStatus = (id: string): StepStatus => {
    if (scanState.status === 'idle') return 'pending'
    if (scanState.status === 'done') return 'done'
    const cur = currentStepId()
    const ci = STATUS_ORDER.indexOf(cur)
    const si = STATUS_ORDER.indexOf(id)
    if (si < 0 || ci < 0) return 'pending'
    if (si < ci) return 'done'
    if (si === ci) return 'running'
    return 'pending'
  }

  const tc = scanState.type_counts

  const subProg =
    scanState.substep_total && scanState.substep_total > 0
      ? Math.round(((scanState.substep_processed ?? 0) / scanState.substep_total) * 100)
      : undefined

  // Estimate remaining time for current substep based on global remaining + substep progress
  const substepRemaining = (): number | undefined => {
    const rem = scanState.remaining
    if (rem === undefined || rem <= 0) return undefined
    return rem
  }

  const subStepInfo = (type: 'image' | 'video' | 'audio' | 'document') => {
    const active = scanState.substep === type
    const done = getStatus(`processing_${type}`) === 'done'
    const count = tc?.[type]

    const labelKey = type === 'image' ? 'images' : type === 'video' ? 'videos' : type === 'audio' ? 'audios' : 'docs'
    const subtitle = count != null ? `${count.toLocaleString()} ${t.scan[labelKey]}` : undefined

    return {
      subtitle,
      progress: active && subProg !== undefined ? subProg : done ? 100 : undefined,
      processed: active ? (scanState.substep_processed ?? 0) : undefined,
      total: active ? (scanState.substep_total ?? 0) : undefined,
      currentFile: active ? scanState.current_file : undefined,
      remaining: active ? substepRemaining() : undefined,
    }
  }

  const scanSubtitle = tc
    ? [
        tc.image > 0 && `${tc.image.toLocaleString()} ${t.scan.images}`,
        tc.video > 0 && `${tc.video.toLocaleString()} ${t.scan.videos}`,
        tc.audio > 0 && `${tc.audio.toLocaleString()} ${t.scan.audios}`,
        tc.document > 0 && `${tc.document.toLocaleString()} ${t.scan.docs}`,
      ].filter(Boolean).join(', ')
    : scanState.total_files
    ? `${scanState.total_files.toLocaleString()} файлов`
    : undefined

  // Always show all 4 processing steps — pending if type has 0 files
  const steps: { id: string; def: StepDef }[] = [
    {
      id: 'scanning',
      def: { id: 'scanning', icon: '🗂️', label: t.scan.stepScanning, subtitle: scanSubtitle },
    },
    {
      id: 'loading_models',
      def: { id: 'loading_models', icon: '⚡', label: t.scan.stepLoadModels },
    },
    {
      id: 'processing_image',
      def: { id: 'processing_image', icon: '🖼️', label: t.scan.stepImages, ...subStepInfo('image') },
    },
    {
      id: 'processing_video',
      def: { id: 'processing_video', icon: '🎬', label: t.scan.stepVideo, ...subStepInfo('video') },
    },
    {
      id: 'processing_audio',
      def: { id: 'processing_audio', icon: '🎵', label: t.scan.stepAudio, ...subStepInfo('audio') },
    },
    {
      id: 'processing_document',
      def: { id: 'processing_document', icon: '📄', label: t.scan.stepDocs, ...subStepInfo('document') },
    },
    {
      id: 'comparing',
      def: {
        id: 'comparing',
        icon: '🔍',
        label: t.scan.stepComparing,
        progress: (() => {
          const s = getStatus('comparing')
          if (s === 'running' && scanState.substep_total && scanState.substep_total > 0)
            return Math.round(((scanState.substep_processed ?? 0) / scanState.substep_total) * 100)
          if (s === 'done') return 100
          return undefined
        })(),
        processed: getStatus('comparing') === 'running' ? (scanState.substep_processed ?? 0) : undefined,
        total: getStatus('comparing') === 'running' ? (scanState.substep_total ?? 0) : undefined,
        remaining: getStatus('comparing') === 'running' ? scanState.remaining : undefined,
      },
    },
  ]

  // ─── Analysis view ─────────────────────────────────────────────────────────

  if (showProgress) {
    return (
      <div className="min-h-full flex items-center justify-center p-8">
        <div className="w-full max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-[#F2F4F3]">{t.scan.analysisTitle}</h1>
            {scanState.status === 'done' ? (
              <p className="text-sm text-[#F2F4F3]/40 mt-1">{scanState.groups_found} {t.scan.groupsFound}</p>
            ) : (
              <p className="text-sm text-[#F2F4F3]/40 mt-1 min-h-[20px]"> </p>
            )}
          </div>

          <div className="space-y-2 mb-6">
            {steps.map(({ id, def }) => (
              <StepCard
                key={id}
                status={scanState.status === 'done' ? 'done' : getStatus(id)}
                step={def}
                t={t}
              />
            ))}
          </div>

          {scanState.status === 'error' && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#FF705B]/10 border border-[#FF705B]/20">
              <p className="text-xs text-[#FF705B]">{scanState.error}</p>
            </div>
          )}

          <div className="flex gap-3">
            {scanState.status === 'done' ? (
              <>
                <button
                  onClick={() => setScanState({ status: 'idle' })}
                  className="px-5 py-3 rounded-xl border border-[#F2F4F3]/10 text-[#F2F4F3]/50 text-sm hover:bg-[#F2F4F3]/5 transition-all"
                >
                  ← {t.scan.title}
                </button>
                <button
                  onClick={() => setActiveTab('results')}
                  className="flex-1 py-3 rounded-xl bg-[#1F555C] hover:bg-[#238636] text-[#F2F4F3] text-sm font-medium transition-all"
                >
                  {t.nav.results} →
                </button>
              </>
            ) : (
              <button
                onClick={handleStop}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#FF705B]/10 text-[#FF705B] hover:bg-[#FF705B]/20 transition-all font-medium"
              >
                <Square size={16} />
                {t.scan.stopScan}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Idle — folder selection ───────────────────────────────────────────────

  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-semibold text-[#F2F4F3] mb-8">{t.scan.title}</h1>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[#F2F4F3]/50 uppercase tracking-wider">{t.scan.selectedFolders}</h2>
            <button
              onClick={handleAddFolders}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1F555C]/20 text-[#E6E8E6] hover:bg-[#1F555C]/30 transition-all text-sm"
            >
              <FolderPlus size={15} />
              {t.scan.addFolder}
            </button>
          </div>

          {selectedFolders.length === 0 ? (
            <div
              onClick={handleAddFolders}
              className="border-2 border-dashed border-[#F2F4F3]/10 rounded-xl p-12 text-center cursor-pointer hover:border-[#1F555C]/40 hover:bg-[#1F555C]/5 transition-all"
            >
              <Folder className="mx-auto mb-3 text-[#F2F4F3]/20" size={40} />
              <p className="text-[#F2F4F3]/30 text-sm">{t.scan.noFolders}</p>
              <p className="text-[#E6E8E6]/60 text-xs mt-1">{t.scan.selectFolders}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedFolders.map((folder) => (
                <div key={folder} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F2F4F3]/8 border border-[#1E1E1E]/50">
                  <Folder size={16} className="text-[#E6E8E6] shrink-0" />
                  <span className="text-[#F2F4F3]/70 text-sm flex-1 truncate">{folder}</span>
                  <button onClick={() => removeFolder(folder)} className="text-[#F2F4F3]/20 hover:text-[#FF705B] transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setFullRescan(!fullRescan)}
              className={`w-11 h-6 rounded-full transition-colors relative ${fullRescan ? 'bg-[#1F555C]' : 'bg-[#F2F4F3]/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${fullRescan ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
            <div>
              <p className="text-sm text-[#F2F4F3]/70">{t.scan.fullRescan}</p>
              <p className="text-xs text-[#F2F4F3]/30">{t.scan.fullRescanDesc}</p>
            </div>
          </label>
        </section>

        <button
          onClick={handleStart}
          disabled={selectedFolders.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#1F555C] hover:bg-[#238636] disabled:opacity-40 disabled:cursor-not-allowed text-[#F2F4F3] transition-all font-medium shadow-lg shadow-[#1F555C]/20"
        >
          <Play size={16} />
          {t.scan.startScan}
        </button>
      </div>
    </div>
  )
}
