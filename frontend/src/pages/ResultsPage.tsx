import { useState, useEffect, useRef } from 'react'
import { Trash2, ExternalLink, ZoomIn, X, AlertTriangle, Music, FileText, Video } from 'lucide-react'
import { getResults, deleteFile, getPreview } from '../utils/api'
import { useStore } from '../store'

interface FileEntry {
  path: string
  similarity: number
  file_type: string
  size: number
  name: string
  exists: boolean
}

interface Group {
  group_id: string
  match_type: 'exact' | 'near' | 'semantic'
  file_type: string
  files: FileEntry[]
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

let activePreviewRequests = 0
const MAX_CONCURRENT_PREVIEWS = 4
const previewQueue: Array<() => void> = []

function enqueuePreview(fn: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    const run = async () => {
      activePreviewRequests++
      try { await fn() } finally {
        activePreviewRequests--
        resolve()
        if (previewQueue.length > 0) {
          const next = previewQueue.shift()!
          next()
        }
      }
    }
    if (activePreviewRequests < MAX_CONCURRENT_PREVIEWS) {
      run()
    } else {
      previewQueue.push(run)
    }
  })
}

function ImagePreview({ path, fileType, onClick }: { path: string; fileType: string; onClick: (src: string) => void }) {
  const [src, setSrc] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    enqueuePreview(async () => {
      try {
        const d = await getPreview(path)
        setSrc(d.data)
        setLoading(false)
      } catch {
        setError(true)
        setLoading(false)
      }
    })
  }, [path])

  if (loading) return (
    <div className="w-full aspect-video bg-[#F2F4F3]/5 rounded-lg animate-pulse flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#F2F4F3]/10 border-t-[#E6E8E6] rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="w-full aspect-video bg-[#F2F4F3]/5 rounded-lg flex flex-col items-center justify-center gap-2 text-[#F2F4F3]/20">
      {fileType === 'video' ? <Video size={28} /> : <ZoomIn size={28} />}
      <span className="text-xs">No preview</span>
    </div>
  )

  return (
    <div className={`relative group ${fileType === 'video' ? 'cursor-pointer' : 'cursor-zoom-in'} aspect-video overflow-hidden rounded-lg`} onClick={() => onClick(src)}>
      <img src={src} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        {fileType === 'video' ? (
          <div className="w-12 h-12 rounded-full bg-[#F2F4F3]/20 backdrop-blur-sm flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="white"><path d="M4 2.5L15 9L4 15.5V2.5Z"/></svg>
          </div>
        ) : (
          <ZoomIn size={22} className="text-[#F2F4F3] drop-shadow" />
        )}
      </div>
      {fileType === 'video' && (
        <div className="absolute bottom-2 left-2 bg-black/60 text-[#F2F4F3] text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
          <Video size={10} /> видео
        </div>
      )}
    </div>
  )
}

function AudioCard({ file, onDelete, onReveal, onToggle, selected, t }: { file: FileEntry; onDelete: () => void; onReveal: () => void; onToggle: () => void; selected: boolean; t: any }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl bg-black/20 border transition-all ${selected ? 'border-[#1F555C]/60 ring-1 ring-[#1F555C]/30' : 'border-[#F2F4F3]/10'} ${!file.exists ? 'opacity-40' : ''}`}>
      {file.exists && <Checkbox checked={selected} onChange={onToggle} />}
      <div className="w-10 h-10 rounded-xl bg-[#1F555C]/10 flex items-center justify-center shrink-0">
        <Music size={18} className="text-[#E6E8E6]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#F2F4F3]/80 text-sm font-medium truncate">{file.name}</p>
        <p className="text-[#E6E8E6]/50 text-xs mb-1">{formatSize(file.size)}</p>
        {file.similarity < 1 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-[#F2F4F3]/10 rounded-full">
              <div className="h-full bg-[#1F555C] rounded-full" style={{ width: `${file.similarity * 100}%` }} />
            </div>
            <span className="text-[#E6E8E6]/70 text-xs w-8 text-right">{(file.similarity * 100).toFixed(0)}%</span>
          </div>
        )}
        <button
          onClick={onReveal}
          className="mt-1 text-left text-[#F2F4F3]/20 text-[10px] font-mono truncate hover:text-[#E6E8E6] transition-colors flex items-center gap-1 w-full"
          title={file.path}
        >
          <ExternalLink size={9} className="shrink-0" />
          {file.path}
        </button>
      </div>
      {file.exists && (
        <button
          onClick={onDelete}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF705B]/10 text-[#FF705B]/70 hover:bg-[#FF705B]/20 hover:text-[#FF705B] transition-all text-xs"
        >
          <Trash2 size={13} />
          {t.results.deleteFile}
        </button>
      )}
    </div>
  )
}

function DocCard({ file, onDelete, onReveal, onToggle, selected, t }: { file: FileEntry; onDelete: () => void; onReveal: () => void; onToggle: () => void; selected: boolean; t: any }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl bg-black/20 border transition-all ${selected ? 'border-[#1F555C]/60 ring-1 ring-[#1F555C]/30' : 'border-[#F2F4F3]/10'} ${!file.exists ? 'opacity-40' : ''}`}>
      {file.exists && <Checkbox checked={selected} onChange={onToggle} />}
      <div className="w-10 h-10 rounded-xl bg-[#1F555C]/10 flex items-center justify-center shrink-0">
        <FileText size={18} className="text-[#E6E8E6]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#F2F4F3]/80 text-sm font-medium truncate">{file.name}</p>
        <p className="text-[#E6E8E6]/50 text-xs mb-1">{formatSize(file.size)}</p>
        {file.similarity < 1 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-[#F2F4F3]/10 rounded-full">
              <div className="h-full bg-[#1F555C] rounded-full" style={{ width: `${file.similarity * 100}%` }} />
            </div>
            <span className="text-[#E6E8E6]/70 text-xs w-8 text-right">{(file.similarity * 100).toFixed(0)}%</span>
          </div>
        )}
        <button
          onClick={onReveal}
          className="mt-1 text-left text-[#F2F4F3]/20 text-[10px] font-mono truncate hover:text-[#E6E8E6] transition-colors flex items-center gap-1 w-full"
          title={file.path}
        >
          <ExternalLink size={9} className="shrink-0" />
          {file.path}
        </button>
      </div>
      {file.exists && (
        <button
          onClick={onDelete}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF705B]/10 text-[#FF705B]/70 hover:bg-[#FF705B]/20 hover:text-[#FF705B] transition-all text-xs"
        >
          <Trash2 size={13} />
          {t.results.deleteFile}
        </button>
      )}
    </div>
  )
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#F2F4F3]/10 hover:bg-[#F2F4F3]/20 flex items-center justify-center text-[#F2F4F3] transition-all z-10" onClick={onClose}>
        <X size={20} />
      </button>
      <img src={src} alt="" className="max-w-full max-h-full object-contain select-none" style={{ maxWidth: '100vw', maxHeight: '100vh' }} onClick={(e) => e.stopPropagation()} draggable={false} />
    </div>
  )
}

function VideoLightbox({ path, onClose }: { path: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, playing])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    playing ? v.pause() : v.play()
  }

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    if (videoRef.current) videoRef.current.currentTime = ratio * duration
    setCurrent(ratio * duration)
  }

  const fileUrl = `file://${path}`

  return (
    <div className="fixed inset-0 z-50 bg-black/97 flex flex-col items-center justify-center" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#F2F4F3]/10 hover:bg-[#F2F4F3]/20 flex items-center justify-center text-[#F2F4F3] transition-all z-10" onClick={onClose}>
        <X size={20} />
      </button>
      <video
        ref={videoRef}
        src={fileUrl}
        className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
        style={{ maxWidth: '90vw' }}
        onClick={(e) => { e.stopPropagation(); togglePlay() }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => { if (!dragging && videoRef.current) setCurrent(videoRef.current.currentTime) }}
        onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration) }}
        onEnded={() => setPlaying(false)}
        playsInline
      />
      <div className="mt-4 w-full max-w-2xl px-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative h-1.5 bg-[#F2F4F3]/15 rounded-full cursor-pointer group"
          onClick={seek}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onMouseMove={(e) => { if (dragging) seek(e) }}
        >
          <div className="absolute inset-y-0 left-0 bg-[#1F555C] rounded-full transition-none" style={{ width: duration ? `${(current / duration) * 100}%` : '0%' }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: duration ? `calc(${(current / duration) * 100}% - 7px)` : '-7px' }} />
        </div>
        <div className="flex items-center gap-4">
          <button onClick={togglePlay} className="w-9 h-9 rounded-full bg-[#F2F4F3]/10 hover:bg-[#F2F4F3]/20 flex items-center justify-center text-[#F2F4F3] transition-all">
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="4" height="12" rx="1"/><rect x="8" y="1" width="4" height="12" rx="1"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5L12 7L3 12.5V1.5Z"/></svg>
            )}
          </button>
          <span className="text-[#F2F4F3]/60 text-sm font-mono tabular-nums">{fmt(current)} / {fmt(duration)}</span>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmModal({ path, onConfirm, onCancel, t }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8">
      <div className="bg-[#1C1C1C] border border-[#F2F4F3]/10 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-[#FF705B]" size={20} />
          <h3 className="font-semibold text-[#F2F4F3]">{t.results.deleteConfirm}</h3>
        </div>
        <p className="text-[#F2F4F3]/50 text-sm mb-2">{t.results.deleteConfirmDesc}</p>
        <p className="text-[#F2F4F3]/30 text-xs font-mono break-all mb-6">{path}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-[#F2F4F3]/8 text-[#F2F4F3]/60 hover:bg-[#1E1E1E]/50 transition-all text-sm">
            {t.results.cancel}
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-[#FF705B]/20 text-[#FF705B] hover:bg-[#FF705B]/30 transition-all text-sm font-medium">
            {t.results.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

const MATCH_LABELS: any = {
  exact:    { color: 'text-[#FF705B] bg-[#FF705B]/10' },
  near:     { color: 'text-orange-400 bg-orange-500/10' },
  semantic: { color: 'text-[#E6E8E6] bg-[#1F555C]/10' },
}

// ── Checkbox ──────────────────────────────────────────────────────────────────
function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
        checked
          ? 'bg-[#FF705B] border-[#FF705B]'
          : 'bg-transparent border-[#F2F4F3]/20 hover:border-[#E6E8E6]'
      }`}
    >
      {checked && (
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path d="M1 4L4 7L10 1" stroke="#F2F4F3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

function BulkDeleteModal({ paths, onConfirm, onCancel, t }: { paths: string[]; onConfirm: () => void; onCancel: () => void; t: any }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8">
      <div className="bg-[#1C1C1C] border border-[#F2F4F3]/10 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-[#FF705B]" size={20} />
          <h3 className="font-semibold text-[#F2F4F3]">{t.results.deleteBulkConfirm}</h3>
        </div>
        <p className="text-[#F2F4F3]/50 text-sm mb-1">
          {t.results.deleteBulkDesc}<span className="text-[#F2F4F3] font-semibold">{paths.length}</span>
        </p>
        <p className="text-[#F2F4F3]/30 text-xs mb-4">{t.results.irreversible}</p>
        <div className="max-h-32 overflow-y-auto mb-5 space-y-1">
          {paths.map(p => (
            <p key={p} className="text-[#F2F4F3]/20 text-[10px] font-mono truncate">{p}</p>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-[#F2F4F3]/8 text-[#F2F4F3]/60 hover:bg-[#1E1E1E]/50 transition-all text-sm">
            {t.results.cancel}
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-[#FF705B]/20 text-[#FF705B] hover:bg-[#FF705B]/30 transition-all text-sm font-medium">
            {t.results.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ResultsPage({ t }: { t: any }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [lightbox, setLightbox] = useState<{ type: 'image'; src: string } | { type: 'video'; path: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const { scanState } = useStore()

  const loadResults = async () => {
    try {
      setLoading(true)
      const data = await getResults()
      setGroups(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadResults() }, [scanState.status])

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const handleBulkDelete = async () => {
    const paths = Array.from(selectedPaths)
    for (const path of paths) {
      try { await deleteFile(path) } catch {}
    }
    setGroups(prev =>
      prev
        .map(g => ({ ...g, files: g.files.filter(f => !paths.includes(f.path)) }))
        .filter(g => g.files.length > 1)
    )
    setSelectedPaths(new Set())
    setShowBulkConfirm(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteFile(deleteTarget)
      setGroups(prev =>
        prev
          .map(g => ({ ...g, files: g.files.filter(f => f.path !== deleteTarget) }))
          .filter(g => g.files.length > 1)
      )
    } catch (e) { console.error(e) }
    setDeleteTarget(null)
  }

  const openLightbox = async (path: string, fileType: string) => {
    if (fileType === 'video') {
      setLightbox({ type: 'video', path })
    } else {
      try {
        const data = await getPreview(path)
        setLightbox({ type: 'image', src: data.data })
      } catch {}
    }
  }

  const revealInFinder = (path: string) => window.electronAPI?.revealInFinder(path)

  const filteredGroups = groups.filter(g => filter === 'all' || g.match_type === filter)

  const FILTERS = [
    { id: 'all',      label: t.results.filterAll },
    { id: 'exact',    label: t.results.filterExact },
    { id: 'near',     label: t.results.filterNear },
    { id: 'semantic', label: t.results.filterSemantic },
  ]

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="flex items-center gap-3 text-[#F2F4F3]/30">
        <div className="w-4 h-4 border-2 border-[#F2F4F3]/20 border-t-[#E6E8E6] rounded-full animate-spin" />
        {t.common.loading}
      </div>
    </div>
  )

  if (groups.length === 0) return (
    <div className="p-8 flex flex-col items-center justify-center h-full">
      <div className="w-16 h-16 rounded-2xl bg-[#F2F4F3]/5 flex items-center justify-center mb-4">
        <ZoomIn className="text-[#F2F4F3]/20" size={28} />
      </div>
      <h2 className="text-[#F2F4F3]/60 text-lg font-medium mb-2">{t.results.noResults}</h2>
      <p className="text-[#F2F4F3]/30 text-sm">{t.results.runScanFirst}</p>
    </div>
  )

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#F2F4F3]">{t.results.title}</h1>
          <p className="text-[#F2F4F3]/30 text-sm mt-1">
            {filteredGroups.length} {t.results.groups} · {filteredGroups.reduce((a, g) => a + g.files.length, 0)} {t.results.files}
          </p>
        </div>
        <div className="flex gap-1 bg-[#F2F4F3]/8 p-1 rounded-xl">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${filter === f.id ? 'bg-[#1F555C] text-[#F2F4F3]' : 'text-[#F2F4F3]/40 hover:text-[#F2F4F3]/70'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-5">
        {filteredGroups.map(group => {
          const badge = MATCH_LABELS[group.match_type] || MATCH_LABELS.semantic
          const ftype = group.file_type || (group.files[0]?.file_type ?? '')
          const isVisual = ftype === 'image' || ftype === 'video'
          const isAudio = ftype === 'audio'
          const isDoc = ftype === 'document'

          return (
            <div key={group.group_id} className="rounded-2xl bg-[#F2F4F3]/5 border border-[#F2F4F3]/10 overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[#F2F4F3]/8">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>
                  {group.match_type}
                </span>
                <span className="text-[#F2F4F3]/30 text-xs">
                  {group.files.length} files · {ftype}
                </span>
              </div>

              {/* Visual (image / video) */}
              {isVisual && (
                <div className="p-4 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {group.files.map(file => (
                    <div key={file.path} className={`rounded-xl bg-black/20 overflow-hidden ${!file.exists ? 'opacity-40' : ''} ${selectedPaths.has(file.path) ? 'ring-2 ring-[#1E1E1E] ring-offset-2 ring-offset-[#1E1E1E]/20' : ''}`}>
                      <div className="relative">
                        <ImagePreview
                          path={file.path}
                          fileType={ftype}
                          onClick={(src) => {
                            if (ftype === 'video') setLightbox({ type: 'video', path: file.path })
                            else setLightbox({ type: 'image', src })
                          }}
                        />
                        {file.exists && (
                          <div className="absolute top-2 left-2">
                            <Checkbox checked={selectedPaths.has(file.path)} onChange={() => toggleSelect(file.path)} />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-[#F2F4F3]/70 text-xs font-medium truncate mb-1">{file.name}</p>
                        <p className="text-[#E6E8E6]/50 text-xs mb-1">{formatSize(file.size)}</p>
                        {file.similarity < 1 && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className="flex-1 h-1 bg-[#F2F4F3]/10 rounded-full">
                              <div className="h-full bg-[#1F555C] rounded-full" style={{ width: `${file.similarity * 100}%` }} />
                            </div>
                            <span className="text-[#E6E8E6]/70 text-xs">{(file.similarity * 100).toFixed(0)}%</span>
                          </div>
                        )}
                        <button
                          onClick={() => revealInFinder(file.path)}
                          className="w-full text-left text-[#F2F4F3]/20 text-[10px] font-mono truncate hover:text-[#E6E8E6] transition-colors flex items-center gap-1 mb-2"
                          title={file.path}
                        >
                          <ExternalLink size={9} className="shrink-0" />{file.path}
                        </button>
                        {file.exists && (
                          <button
                            onClick={() => setDeleteTarget(file.path)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#FF705B]/10 text-[#FF705B]/70 hover:bg-[#FF705B]/20 hover:text-[#FF705B] transition-all text-xs"
                          >
                            <Trash2 size={12} />{t.results.deleteFile}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Audio */}
              {isAudio && (
                <div className="p-4 space-y-2">
                  {group.files.map(file => (
                    <AudioCard key={file.path} file={file} onDelete={() => setDeleteTarget(file.path)} onReveal={() => revealInFinder(file.path)} onToggle={() => toggleSelect(file.path)} selected={selectedPaths.has(file.path)} t={t} />
                  ))}
                </div>
              )}

              {/* Document */}
              {isDoc && (
                <div className="p-4 space-y-2">
                  {group.files.map(file => (
                    <DocCard key={file.path} file={file} onDelete={() => setDeleteTarget(file.path)} onReveal={() => revealInFinder(file.path)} onToggle={() => toggleSelect(file.path)} selected={selectedPaths.has(file.path)} t={t} />
                  ))}
                </div>
              )}

              {/* Unknown fallback */}
              {!isVisual && !isAudio && !isDoc && (
                <div className="p-4 space-y-2">
                  {group.files.map(file => (
                    <div key={file.path} className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-black/20 border transition-all ${selectedPaths.has(file.path) ? 'border-[#1F555C]/60 ring-1 ring-[#1F555C]/30' : 'border-[#F2F4F3]/10'} ${!file.exists ? 'opacity-40' : ''}`}>
                      {file.exists && <Checkbox checked={selectedPaths.has(file.path)} onChange={() => toggleSelect(file.path)} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[#F2F4F3]/70 text-sm truncate">{file.name}</p>
                        <p className="text-[#E6E8E6]/50 text-xs">{formatSize(file.size)}</p>
                        <button onClick={() => revealInFinder(file.path)} className="text-[#F2F4F3]/20 text-[10px] font-mono truncate hover:text-[#E6E8E6] transition-colors flex items-center gap-1 mt-1 w-full text-left" title={file.path}>
                          <ExternalLink size={9} className="shrink-0" />{file.path}
                        </button>
                      </div>
                      {file.exists && (
                        <button onClick={() => setDeleteTarget(file.path)} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF705B]/10 text-[#FF705B]/70 hover:bg-[#FF705B]/20 hover:text-[#FF705B] transition-all text-xs">
                          <Trash2 size={13} />{t.results.deleteFile}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Floating bulk action panel */}
      {selectedPaths.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-2xl bg-[#1C1C1C] border border-[#1E1E1E]/50 shadow-2xl shadow-black/60">
          <span className="text-[#F2F4F3]/60 text-sm">
            <span className="text-[#F2F4F3] font-semibold">{selectedPaths.size}</span> {t.results.selectedCount}
          </span>
          <button onClick={() => setSelectedPaths(new Set())} className="text-[#F2F4F3]/30 hover:text-[#F2F4F3]/60 transition-colors text-xs">
            <X size={14} />
          </button>
          <button
            onClick={() => setShowBulkConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF705B]/20 text-[#FF705B] hover:bg-[#FF705B]/30 transition-all text-sm font-medium"
          >
            <Trash2 size={14} />
            {t.results.deleteSelected}
          </button>
        </div>
      )}

      {lightbox?.type === 'image' && <ImageLightbox src={lightbox.src} onClose={() => setLightbox(null)} />}
      {lightbox?.type === 'video' && <VideoLightbox path={lightbox.path} onClose={() => setLightbox(null)} />}
      {deleteTarget && <DeleteConfirmModal path={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} t={t} />}
      {showBulkConfirm && <BulkDeleteModal paths={Array.from(selectedPaths)} onConfirm={handleBulkDelete} onCancel={() => setShowBulkConfirm(false)} t={t} />}
    </div>
  )
}
