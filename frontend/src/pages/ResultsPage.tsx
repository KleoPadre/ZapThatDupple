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

// ── Preview components ────────────────────────────────────────────────────────

// Global concurrency limiter for previews
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
    <div className="w-full aspect-video bg-white/5 rounded-lg animate-pulse flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-white/10 border-t-violet-400 rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="w-full aspect-video bg-white/5 rounded-lg flex flex-col items-center justify-center gap-2 text-white/20">
      {fileType === 'video' ? <Video size={28} /> : <ZoomIn size={28} />}
      <span className="text-xs">No preview</span>
    </div>
  )

  return (
    <div className="relative group cursor-zoom-in aspect-video overflow-hidden rounded-lg" onClick={() => onClick(src)}>
      <img src={src} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <ZoomIn size={22} className="text-white drop-shadow" />
      </div>
      {fileType === 'video' && (
        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
          <Video size={10} /> видео
        </div>
      )}
    </div>
  )
}

function AudioCard({ file, onDelete, onReveal, t }: { file: FileEntry; onDelete: () => void; onReveal: () => void; t: any }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl bg-black/20 border border-white/5 ${!file.exists ? 'opacity-40' : ''}`}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
        <Music size={18} className="text-violet-400" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-sm font-medium truncate">{file.name}</p>
        <p className="text-white/30 text-xs mb-1">{formatSize(file.size)}</p>

        {/* Similarity bar */}
        {file.similarity < 1 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-white/10 rounded-full">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${file.similarity * 100}%` }} />
            </div>
            <span className="text-violet-400/70 text-xs w-8 text-right">{(file.similarity * 100).toFixed(0)}%</span>
          </div>
        )}

        {/* Path */}
        <button
          onClick={onReveal}
          className="mt-1 text-left text-white/20 text-[10px] font-mono truncate hover:text-violet-400 transition-colors flex items-center gap-1 w-full"
          title={file.path}
        >
          <ExternalLink size={9} className="shrink-0" />
          {file.path}
        </button>
      </div>

      {/* Delete */}
      {file.exists && (
        <button
          onClick={onDelete}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition-all text-xs"
        >
          <Trash2 size={13} />
          {t.results.deleteFile}
        </button>
      )}
    </div>
  )
}

function DocCard({ file, onDelete, onReveal, t }: { file: FileEntry; onDelete: () => void; onReveal: () => void; t: any }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl bg-black/20 border border-white/5 ${!file.exists ? 'opacity-40' : ''}`}>
      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
        <FileText size={18} className="text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-sm font-medium truncate">{file.name}</p>
        <p className="text-white/30 text-xs mb-1">{formatSize(file.size)}</p>
        {file.similarity < 1 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-white/10 rounded-full">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${file.similarity * 100}%` }} />
            </div>
            <span className="text-blue-400/70 text-xs w-8 text-right">{(file.similarity * 100).toFixed(0)}%</span>
          </div>
        )}
        <button
          onClick={onReveal}
          className="mt-1 text-left text-white/20 text-[10px] font-mono truncate hover:text-violet-400 transition-colors flex items-center gap-1 w-full"
          title={file.path}
        >
          <ExternalLink size={9} className="shrink-0" />
          {file.path}
        </button>
      </div>
      {file.exists && (
        <button
          onClick={onDelete}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition-all text-xs"
        >
          <Trash2 size={13} />
          {t.results.deleteFile}
        </button>
      )}
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain select-none"
        style={{ maxWidth: '100vw', maxHeight: '100vh' }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  )
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteConfirmModal({ path, onConfirm, onCancel, t }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8">
      <div className="bg-[#1a1a1f] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-red-400" size={20} />
          <h3 className="font-semibold text-white">{t.results.deleteConfirm}</h3>
        </div>
        <p className="text-white/50 text-sm mb-2">{t.results.deleteConfirmDesc}</p>
        <p className="text-white/30 text-xs font-mono break-all mb-6">{path}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 hover:bg-white/10 transition-all text-sm">
            {t.results.cancel}
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm font-medium">
            {t.results.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

const MATCH_LABELS: any = {
  exact:    { color: 'text-red-400 bg-red-500/10' },
  near:     { color: 'text-orange-400 bg-orange-500/10' },
  semantic: { color: 'text-blue-400 bg-blue-500/10' },
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ResultsPage({ t }: { t: any }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
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
    try {
      const data = await getPreview(path)
      setLightboxSrc(data.data)
    } catch {}
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
      <div className="flex items-center gap-3 text-white/30">
        <div className="w-4 h-4 border-2 border-white/20 border-t-violet-400 rounded-full animate-spin" />
        {t.common.loading}
      </div>
    </div>
  )

  if (groups.length === 0) return (
    <div className="p-8 flex flex-col items-center justify-center h-full">
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <ZoomIn className="text-white/20" size={28} />
      </div>
      <h2 className="text-white/60 text-lg font-medium mb-2">{t.results.noResults}</h2>
      <p className="text-white/30 text-sm">{t.results.runScanFirst}</p>
    </div>
  )

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t.results.title}</h1>
          <p className="text-white/30 text-sm mt-1">
            {filteredGroups.length} {t.results.groups} · {filteredGroups.reduce((a, g) => a + g.files.length, 0)} {t.results.files}
          </p>
        </div>
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${filter === f.id ? 'bg-violet-500 text-white' : 'text-white/40 hover:text-white/70'}`}>
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
            <div key={group.group_id} className="rounded-2xl bg-white/5 border border-white/5 overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>
                  {group.match_type}
                </span>
                <span className="text-white/30 text-xs">
                  {group.files.length} files · {ftype}
                </span>
              </div>

              {/* ── Visual (image / video) — grid with previews ── */}
              {isVisual && (
                <div className="p-4 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {group.files.map(file => (
                    <div key={file.path} className={`rounded-xl bg-black/20 overflow-hidden ${!file.exists ? 'opacity-40' : ''}`}>
                      <ImagePreview
                        path={file.path}
                        fileType={ftype}
                        onClick={(src) => setLightboxSrc(src)}
                      />
                      <div className="p-3">
                        <p className="text-white/70 text-xs font-medium truncate mb-1">{file.name}</p>
                        <p className="text-white/30 text-xs mb-1">{formatSize(file.size)}</p>
                        {file.similarity < 1 && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className="flex-1 h-1 bg-white/10 rounded-full">
                              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${file.similarity * 100}%` }} />
                            </div>
                            <span className="text-violet-400/70 text-xs">{(file.similarity * 100).toFixed(0)}%</span>
                          </div>
                        )}
                        <button
                          onClick={() => revealInFinder(file.path)}
                          className="w-full text-left text-white/20 text-[10px] font-mono truncate hover:text-violet-400 transition-colors flex items-center gap-1 mb-2"
                          title={file.path}
                        >
                          <ExternalLink size={9} className="shrink-0" />{file.path}
                        </button>
                        {file.exists && (
                          <button
                            onClick={() => setDeleteTarget(file.path)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500/10 text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition-all text-xs"
                          >
                            <Trash2 size={12} />{t.results.deleteFile}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Audio — list with cards ── */}
              {isAudio && (
                <div className="p-4 space-y-2">
                  {group.files.map(file => (
                    <AudioCard
                      key={file.path}
                      file={file}
                      onDelete={() => setDeleteTarget(file.path)}
                      onReveal={() => revealInFinder(file.path)}
                      t={t}
                    />
                  ))}
                </div>
              )}

              {/* ── Document — list with cards ── */}
              {isDoc && (
                <div className="p-4 space-y-2">
                  {group.files.map(file => (
                    <DocCard
                      key={file.path}
                      file={file}
                      onDelete={() => setDeleteTarget(file.path)}
                      onReveal={() => revealInFinder(file.path)}
                      t={t}
                    />
                  ))}
                </div>
              )}

              {/* ── Unknown type fallback ── */}
              {!isVisual && !isAudio && !isDoc && (
                <div className="p-4 space-y-2">
                  {group.files.map(file => (
                    <div key={file.path} className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-black/20 border border-white/5 ${!file.exists ? 'opacity-40' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/70 text-sm truncate">{file.name}</p>
                        <p className="text-white/30 text-xs">{formatSize(file.size)}</p>
                        <button onClick={() => revealInFinder(file.path)} className="text-white/20 text-[10px] font-mono truncate hover:text-violet-400 transition-colors flex items-center gap-1 mt-1 w-full text-left" title={file.path}>
                          <ExternalLink size={9} className="shrink-0" />{file.path}
                        </button>
                      </div>
                      {file.exists && (
                        <button onClick={() => setDeleteTarget(file.path)} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition-all text-xs">
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

      {/* Modals */}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {deleteTarget && (
        <DeleteConfirmModal
          path={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          t={t}
        />
      )}
    </div>
  )
}
