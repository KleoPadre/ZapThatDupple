import { useState, useEffect, useRef, useCallback } from 'react'
import { Trash2, ExternalLink, ZoomIn, X, AlertTriangle, Music, FileText, Video, ChevronLeft, ChevronRight, MapPin, Camera, Calendar, Maximize2 } from 'lucide-react'
import { getResults, deleteFile, getPreview, getExif } from '../utils/api'
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

interface ExifData {
  width?: number
  height?: number
  file_size?: number
  date_original?: string
  camera_make?: string
  camera_model?: string
  gps_lat?: number
  gps_lon?: number
  aperture?: number
  iso?: number
  exposure?: string
  focal_length?: number
}

interface LightboxState {
  fileType: 'image' | 'video'
  groupFiles: FileEntry[]
  currentIndex: number
  src?: string
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(dateStr: string): string {
  try {
    const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return dateStr }
}

function scoreFile(file: FileEntry, exif?: ExifData): number {
  let score = 0
  if (exif) {
    if (exif.gps_lat !== undefined && exif.gps_lon !== undefined) score += 4
    if (exif.date_original) score += 2
    if (exif.camera_model) score += 1
    if (exif.iso) score += 0.5
    if (exif.aperture) score += 0.5
    if (exif.width && exif.height) score += (exif.width * exif.height) / 50_000_000
  }
  score += file.size / 1_000_000_000
  return score
}

// ── Queues ─────────────────────────────────────────────────────────────────────
let activePreviewReqs = 0
const previewQ: Array<() => void> = []
function enqueuePreview(fn: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    const run = async () => {
      activePreviewReqs++
      try { await fn() } finally {
        activePreviewReqs--; resolve()
        if (previewQ.length > 0) previewQ.shift()!()
      }
    }
    activePreviewReqs < 4 ? run() : previewQ.push(run)
  })
}

let activeExifReqs = 0
const exifQ: Array<() => void> = []
function enqueueExif(fn: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    const run = async () => {
      activeExifReqs++
      try { await fn() } finally {
        activeExifReqs--; resolve()
        if (exifQ.length > 0) exifQ.shift()!()
      }
    }
    activeExifReqs < 4 ? run() : exifQ.push(run)
  })
}

// ── ImagePreview ───────────────────────────────────────────────────────────────
function ImagePreview({ path, fileType, onClick }: { path: string; fileType: string; onClick: (src: string) => void }) {
  const [src, setSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    enqueuePreview(async () => {
      try { const d = await getPreview(path); setSrc(d.data); setLoading(false) }
      catch { setError(true); setLoading(false) }
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
        ) : <ZoomIn size={22} className="text-[#F2F4F3] drop-shadow" />}
      </div>
      {fileType === 'video' && (
        <div className="absolute bottom-2 left-2 bg-black/60 text-[#F2F4F3] text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
          <Video size={10} /> видео
        </div>
      )}
    </div>
  )
}

// ── ExifMini ───────────────────────────────────────────────────────────────────
function ExifMini({ exif }: { exif: ExifData | undefined }) {
  if (!exif) return null
  const hasAny = exif.date_original || exif.camera_model || exif.gps_lat !== undefined || (exif.width && exif.height)
  if (!hasAny) return null

  const openMap = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (exif.gps_lat !== undefined && exif.gps_lon !== undefined)
      (window as any).electronAPI?.openExternal(`https://www.openstreetmap.org/?mlat=${exif.gps_lat}&mlon=${exif.gps_lon}#map=15/${exif.gps_lat}/${exif.gps_lon}`)
  }

  return (
    <div className="mt-1.5 space-y-0.5">
      {exif.width && exif.height && (
        <div className="flex items-center gap-1 text-[#F2F4F3]/40 text-[10px]">
          <Maximize2 size={9} className="shrink-0 opacity-60" />
          <span>{exif.width} × {exif.height}  ·  {formatSize(exif.file_size ?? 0)}</span>
        </div>
      )}
      {exif.date_original && (
        <div className="flex items-center gap-1 text-[#F2F4F3]/40 text-[10px]">
          <Calendar size={9} className="shrink-0 opacity-60" />
          <span>{formatDate(exif.date_original)}</span>
        </div>
      )}
      {exif.camera_model && (
        <div className="flex items-center gap-1 text-[#F2F4F3]/40 text-[10px]">
          <Camera size={9} className="shrink-0 opacity-60" />
          <span className="truncate">{exif.camera_model}</span>
        </div>
      )}
      {exif.gps_lat !== undefined && exif.gps_lon !== undefined && (
        <button onClick={openMap} className="flex items-center gap-1 text-[#1F555C]/80 hover:text-[#1F555C] text-[10px] transition-colors">
          <MapPin size={9} className="shrink-0" />
          <span>{exif.gps_lat.toFixed(4)}, {exif.gps_lon.toFixed(4)}</span>
        </button>
      )}
    </div>
  )
}

// ── ExifPanel ──────────────────────────────────────────────────────────────────
function ExifPanel({ exif, onOpenMap }: { exif: ExifData; onOpenMap: () => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 bg-black/50 backdrop-blur-sm rounded-xl border border-[#F2F4F3]/10 flex-1 min-w-0">
      {exif.width && exif.height && (
        <span className="flex items-center gap-1.5 text-[#F2F4F3]/60 text-xs">
          <Maximize2 size={11} className="text-[#F2F4F3]/30 shrink-0" />
          {exif.width} × {exif.height}  ·  {formatSize(exif.file_size ?? 0)}
        </span>
      )}
      {exif.date_original && (
        <span className="flex items-center gap-1.5 text-[#F2F4F3]/60 text-xs">
          <Calendar size={11} className="text-[#F2F4F3]/30 shrink-0" />
          {formatDate(exif.date_original)}
        </span>
      )}
      {exif.camera_model && (
        <span className="flex items-center gap-1.5 text-[#F2F4F3]/60 text-xs">
          <Camera size={11} className="text-[#F2F4F3]/30 shrink-0" />
          {exif.camera_make ? `${exif.camera_make} ` : ''}{exif.camera_model}
        </span>
      )}
      {exif.aperture && <span className="text-[#F2F4F3]/60 text-xs">ƒ/{exif.aperture}</span>}
      {exif.iso && <span className="text-[#F2F4F3]/60 text-xs">ISO {exif.iso}</span>}
      {exif.exposure && <span className="text-[#F2F4F3]/60 text-xs">{exif.exposure}</span>}
      {exif.focal_length && <span className="text-[#F2F4F3]/60 text-xs">{exif.focal_length}mm</span>}
      {exif.gps_lat !== undefined && exif.gps_lon !== undefined && (
        <button onClick={onOpenMap} className="flex items-center gap-1.5 text-[#1F555C] hover:text-[#2a7080] text-xs transition-colors">
          <MapPin size={11} />
          {exif.gps_lat.toFixed(5)}, {exif.gps_lon.toFixed(5)}
        </button>
      )}
    </div>
  )
}

// ── MiniMap ────────────────────────────────────────────────────────────────────
function MiniMap({ lat, lon }: { lat: number; lon: number }) {
  const zoom = 14
  const latRad = (lat * Math.PI) / 180
  const n = Math.pow(2, zoom)
  const tileX = Math.floor(((lon + 180) / 360) * n)
  const tileY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  const fracX = ((lon + 180) / 360) * n - tileX
  const fracY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - tileY
  const pixX = fracX * 256
  const pixY = fracY * 256

  const openMap = () => (window as any).electronAPI?.openExternal(
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`
  )

  return (
    <button onClick={openMap} title="Открыть на карте"
      className="relative w-[150px] h-[110px] rounded-xl overflow-hidden border border-[#F2F4F3]/20 hover:border-[#1F555C]/70 transition-colors group shrink-0">
      <div style={{ position: 'absolute', width: 512, height: 512, left: -(pixX - 75), top: -(pixY - 55) }}>
        <img src={`https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`} alt="" width={256} height={256} style={{ position: 'absolute', left: 0, top: 0 }} draggable={false} />
        <img src={`https://tile.openstreetmap.org/${zoom}/${tileX + 1}/${tileY}.png`} alt="" width={256} height={256} style={{ position: 'absolute', left: 256, top: 0 }} draggable={false} />
        <img src={`https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY + 1}.png`} alt="" width={256} height={256} style={{ position: 'absolute', left: 0, top: 256 }} draggable={false} />
        <img src={`https://tile.openstreetmap.org/${zoom}/${tileX + 1}/${tileY + 1}.png`} alt="" width={256} height={256} style={{ position: 'absolute', left: 256, top: 256 }} draggable={false} />
      </div>
      {/* Pin */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)', pointerEvents: 'none' }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#FF705B', border: '2.5px solid white', boxShadow: '0 2px 6px rgba(0,0,0,0.5)', margin: '0 auto' }} />
        <div style={{ width: 2, height: 6, background: '#FF705B', margin: '0 auto', marginTop: -1 }} />
      </div>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
        <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] bg-black/70 px-2 py-1 rounded transition-opacity whitespace-nowrap">Открыть в браузере</span>
      </div>
    </button>
  )
}

// ── Carousel nav buttons ───────────────────────────────────────────────────────
function NavArrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`absolute ${dir === 'left' ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#F2F4F3]/10 hover:bg-[#F2F4F3]/25 flex items-center justify-center text-[#F2F4F3] transition-all z-10`}>
      {dir === 'left' ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
    </button>
  )
}

function DotNav({ count, current, onSelect }: { count: number; current: number; onSelect: (i: number) => void }) {
  if (count <= 1) return null
  return (
    <div className="flex items-center justify-center gap-1.5 mt-2">
      {Array.from({ length: count }, (_, i) => (
        <button key={i} onClick={(e) => { e.stopPropagation(); onSelect(i) }}
          className={`rounded-full transition-all ${i === current ? 'w-4 h-1.5 bg-[#F2F4F3]/70' : 'w-1.5 h-1.5 bg-[#F2F4F3]/25 hover:bg-[#F2F4F3]/50'}`} />
      ))}
    </div>
  )
}

// ── ImageLightbox ──────────────────────────────────────────────────────────────
function ImageLightbox({ state, onClose, exifData, onNavigate }: {
  state: LightboxState; onClose: () => void; exifData: Map<string, ExifData>; onNavigate: (i: number) => void
}) {
  const { groupFiles, currentIndex, src } = state
  const canPrev = currentIndex > 0
  const canNext = currentIndex < groupFiles.length - 1
  const file = groupFiles[currentIndex]
  const exif = exifData.get(file.path)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && canPrev) onNavigate(currentIndex - 1)
      if (e.key === 'ArrowRight' && canNext) onNavigate(currentIndex + 1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, canPrev, canNext, currentIndex, onNavigate])

  const openMap = () => exif?.gps_lat !== undefined && (window as any).electronAPI?.openExternal(
    `https://www.openstreetmap.org/?mlat=${exif.gps_lat}&mlon=${exif.gps_lon}#map=15/${exif.gps_lat}/${exif.gps_lon}`
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#F2F4F3]/10 hover:bg-[#F2F4F3]/20 flex items-center justify-center text-[#F2F4F3] z-10" onClick={onClose}>
        <X size={20} />
      </button>
      {groupFiles.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[#F2F4F3]/40 text-sm z-10 bg-black/40 px-3 py-1 rounded-full">
          {currentIndex + 1} / {groupFiles.length}
        </div>
      )}
      {canPrev && <NavArrow dir="left" onClick={() => onNavigate(currentIndex - 1)} />}
      {canNext && <NavArrow dir="right" onClick={() => onNavigate(currentIndex + 1)} />}

      {src ? (
        <img src={src} alt="" className="max-h-[72vh] object-contain select-none rounded-lg"
          style={{ maxWidth: '82vw' }} onClick={(e) => e.stopPropagation()} draggable={false} />
      ) : (
        <div className="w-40 h-40 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#F2F4F3]/20 border-t-[#E6E8E6] rounded-full animate-spin" />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-4 pt-2 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-[#F2F4F3]/40 text-xs text-center truncate">{file.name}</p>
        {exif && (
          <div className="flex items-start gap-3 justify-center flex-wrap">
            <ExifPanel exif={exif} onOpenMap={openMap} />
            {exif.gps_lat !== undefined && exif.gps_lon !== undefined && (
              <MiniMap lat={exif.gps_lat} lon={exif.gps_lon} />
            )}
          </div>
        )}
        <DotNav count={groupFiles.length} current={currentIndex} onSelect={onNavigate} />
      </div>
    </div>
  )
}

// ── VideoLightbox ──────────────────────────────────────────────────────────────
function VideoLightbox({ state, onClose, exifData, onNavigate }: {
  state: LightboxState; onClose: () => void; exifData: Map<string, ExifData>; onNavigate: (i: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [dragging, setDragging] = useState(false)

  const { groupFiles, currentIndex } = state
  const canPrev = currentIndex > 0
  const canNext = currentIndex < groupFiles.length - 1
  const file = groupFiles[currentIndex]
  const exif = exifData.get(file.path)

  useEffect(() => { setCurrent(0); setDuration(0); setPlaying(false) }, [currentIndex])

  const togglePlay = () => { const v = videoRef.current; if (!v) return; playing ? v.pause() : v.play() }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      if (e.key === 'ArrowLeft' && !playing && canPrev) onNavigate(currentIndex - 1)
      if (e.key === 'ArrowRight' && !playing && canNext) onNavigate(currentIndex + 1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, playing, canPrev, canNext, currentIndex, onNavigate])

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    if (videoRef.current) videoRef.current.currentTime = ratio * duration
    setCurrent(ratio * duration)
  }

  const openMap = () => exif?.gps_lat !== undefined && (window as any).electronAPI?.openExternal(
    `https://www.openstreetmap.org/?mlat=${exif.gps_lat}&mlon=${exif.gps_lon}#map=15/${exif.gps_lat}/${exif.gps_lon}`
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/97 flex flex-col items-center justify-center" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#F2F4F3]/10 hover:bg-[#F2F4F3]/20 flex items-center justify-center text-[#F2F4F3] z-10" onClick={onClose}>
        <X size={20} />
      </button>
      {groupFiles.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[#F2F4F3]/40 text-sm z-10 bg-black/40 px-3 py-1 rounded-full">
          {currentIndex + 1} / {groupFiles.length}
        </div>
      )}
      {canPrev && <NavArrow dir="left" onClick={() => onNavigate(currentIndex - 1)} />}
      {canNext && <NavArrow dir="right" onClick={() => onNavigate(currentIndex + 1)} />}

      <video key={file.path} ref={videoRef} src={`file://${file.path}`}
        className="rounded-lg shadow-2xl" style={{ maxWidth: '82vw', maxHeight: '60vh' }}
        onClick={(e) => { e.stopPropagation(); togglePlay() }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={() => { if (!dragging && videoRef.current) setCurrent(videoRef.current.currentTime) }}
        onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration) }}
        onEnded={() => setPlaying(false)} playsInline />

      <div className="mt-3 w-full max-w-2xl px-6 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-1.5 bg-[#F2F4F3]/15 rounded-full cursor-pointer group"
          onClick={seek} onMouseDown={() => setDragging(true)} onMouseUp={() => setDragging(false)}
          onMouseMove={(e) => { if (dragging) seek(e) }}>
          <div className="absolute inset-y-0 left-0 bg-[#1F555C] rounded-full" style={{ width: duration ? `${(current / duration) * 100}%` : '0%' }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: duration ? `calc(${(current / duration) * 100}% - 7px)` : '-7px' }} />
        </div>
        <div className="flex items-center gap-4">
          <button onClick={togglePlay} className="w-9 h-9 rounded-full bg-[#F2F4F3]/10 hover:bg-[#F2F4F3]/20 flex items-center justify-center text-[#F2F4F3]">
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="4" height="12" rx="1"/><rect x="8" y="1" width="4" height="12" rx="1"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5L12 7L3 12.5V1.5Z"/></svg>
            )}
          </button>
          <span className="text-[#F2F4F3]/60 text-sm font-mono tabular-nums">{fmt(current)} / {fmt(duration)}</span>
        </div>
        {exif && (
          <div className="flex items-start gap-3 flex-wrap mt-1">
            <ExifPanel exif={exif} onOpenMap={openMap} />
            {exif.gps_lat !== undefined && exif.gps_lon !== undefined && (
              <MiniMap lat={exif.gps_lat} lon={exif.gps_lon} />
            )}
          </div>
        )}
        <DotNav count={groupFiles.length} current={currentIndex} onSelect={onNavigate} />
      </div>
    </div>
  )
}

// ── Modals ─────────────────────────────────────────────────────────────────────
function DeleteConfirmModal({ path, onConfirm, onCancel, t }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8">
      <div className="bg-[#1C1C1C] border border-[#F2F4F3]/10 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4"><AlertTriangle className="text-[#FF705B]" size={20} /><h3 className="font-semibold text-[#F2F4F3]">{t.results.deleteConfirm}</h3></div>
        <p className="text-[#F2F4F3]/50 text-sm mb-2">{t.results.deleteConfirmDesc}</p>
        <p className="text-[#F2F4F3]/30 text-xs font-mono break-all mb-6">{path}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-[#F2F4F3]/8 text-[#F2F4F3]/60 transition-all text-sm">{t.results.cancel}</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-[#FF705B]/20 text-[#FF705B] hover:bg-[#FF705B]/30 transition-all text-sm font-medium">{t.results.confirm}</button>
        </div>
      </div>
    </div>
  )
}

function BulkDeleteModal({ paths, onConfirm, onCancel, t }: { paths: string[]; onConfirm: () => void; onCancel: () => void; t: any }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8">
      <div className="bg-[#1C1C1C] border border-[#F2F4F3]/10 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4"><AlertTriangle className="text-[#FF705B]" size={20} /><h3 className="font-semibold text-[#F2F4F3]">{t.results.deleteBulkConfirm}</h3></div>
        <p className="text-[#F2F4F3]/50 text-sm mb-1">{t.results.deleteBulkDesc}<span className="text-[#F2F4F3] font-semibold">{paths.length}</span></p>
        <p className="text-[#F2F4F3]/30 text-xs mb-4">{t.results.irreversible}</p>
        <div className="max-h-32 overflow-y-auto mb-5 space-y-1">
          {paths.map(p => <p key={p} className="text-[#F2F4F3]/20 text-[10px] font-mono truncate">{p}</p>)}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-[#F2F4F3]/8 text-[#F2F4F3]/60 transition-all text-sm">{t.results.cancel}</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-[#FF705B]/20 text-[#FF705B] hover:bg-[#FF705B]/30 transition-all text-sm font-medium">{t.results.confirm}</button>
        </div>
      </div>
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange() }}
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${checked ? 'bg-[#FF705B] border-[#FF705B]' : 'bg-transparent border-[#F2F4F3]/20 hover:border-[#E6E8E6]'}`}>
      {checked && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7L10 1" stroke="#F2F4F3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </button>
  )
}

function AudioCard({ file, onDelete, onReveal, onToggle, selected, t }: { file: FileEntry; onDelete: () => void; onReveal: () => void; onToggle: () => void; selected: boolean; t: any }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl bg-black/20 border transition-all ${selected ? 'border-[#1F555C]/60 ring-1 ring-[#1F555C]/30' : 'border-[#F2F4F3]/10'} ${!file.exists ? 'opacity-40' : ''}`}>
      {file.exists && <Checkbox checked={selected} onChange={onToggle} />}
      <div className="w-10 h-10 rounded-xl bg-[#1F555C]/10 flex items-center justify-center shrink-0"><Music size={18} className="text-[#E6E8E6]" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[#F2F4F3]/80 text-sm font-medium truncate">{file.name}</p>
        <p className="text-[#E6E8E6]/50 text-xs mb-1">{formatSize(file.size)}</p>
        {file.similarity < 1 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-[#F2F4F3]/10 rounded-full"><div className="h-full bg-[#1F555C] rounded-full" style={{ width: `${file.similarity * 100}%` }} /></div>
            <span className="text-[#E6E8E6]/70 text-xs w-8 text-right">{(file.similarity * 100).toFixed(0)}%</span>
          </div>
        )}
        <button onClick={onReveal} className="mt-1 text-left text-[#F2F4F3]/20 text-[10px] font-mono truncate hover:text-[#E6E8E6] transition-colors flex items-center gap-1 w-full" title={file.path}>
          <ExternalLink size={9} className="shrink-0" />{file.path}
        </button>
      </div>
      {file.exists && <button onClick={onDelete} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF705B]/10 text-[#FF705B]/70 hover:bg-[#FF705B]/20 hover:text-[#FF705B] transition-all text-xs"><Trash2 size={13} />{t.results.deleteFile}</button>}
    </div>
  )
}

function DocCard({ file, onDelete, onReveal, onToggle, selected, t }: { file: FileEntry; onDelete: () => void; onReveal: () => void; onToggle: () => void; selected: boolean; t: any }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl bg-black/20 border transition-all ${selected ? 'border-[#1F555C]/60 ring-1 ring-[#1F555C]/30' : 'border-[#F2F4F3]/10'} ${!file.exists ? 'opacity-40' : ''}`}>
      {file.exists && <Checkbox checked={selected} onChange={onToggle} />}
      <div className="w-10 h-10 rounded-xl bg-[#1F555C]/10 flex items-center justify-center shrink-0"><FileText size={18} className="text-[#E6E8E6]" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[#F2F4F3]/80 text-sm font-medium truncate">{file.name}</p>
        <p className="text-[#E6E8E6]/50 text-xs mb-1">{formatSize(file.size)}</p>
        {file.similarity < 1 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-[#F2F4F3]/10 rounded-full"><div className="h-full bg-[#1F555C] rounded-full" style={{ width: `${file.similarity * 100}%` }} /></div>
            <span className="text-[#E6E8E6]/70 text-xs w-8 text-right">{(file.similarity * 100).toFixed(0)}%</span>
          </div>
        )}
        <button onClick={onReveal} className="mt-1 text-left text-[#F2F4F3]/20 text-[10px] font-mono truncate hover:text-[#E6E8E6] transition-colors flex items-center gap-1 w-full" title={file.path}>
          <ExternalLink size={9} className="shrink-0" />{file.path}
        </button>
      </div>
      {file.exists && <button onClick={onDelete} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF705B]/10 text-[#FF705B]/70 hover:bg-[#FF705B]/20 hover:text-[#FF705B] transition-all text-xs"><Trash2 size={13} />{t.results.deleteFile}</button>}
    </div>
  )
}

const MATCH_LABELS: any = {
  exact:    { color: 'text-[#FF705B] bg-[#FF705B]/10' },
  near:     { color: 'text-orange-400 bg-orange-500/10' },
  semantic: { color: 'text-[#E6E8E6] bg-[#1F555C]/10' },
}

// ── ResultsPage ────────────────────────────────────────────────────────────────
export function ResultsPage({ t }: { t: any }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [exifData, setExifData] = useState<Map<string, ExifData>>(new Map())
  const { scanState } = useStore()

  const loadResults = async () => {
    try { setLoading(true); const data = await getResults(); setGroups(data) }
    catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { loadResults() }, [scanState.status])

  // Load EXIF for all visual files
  useEffect(() => {
    const files = groups
      .filter(g => { const ft = g.file_type || g.files[0]?.file_type; return ft === 'image' || ft === 'video' })
      .flatMap(g => g.files).filter(f => f.exists)

    for (const file of files) {
      if (exifData.has(file.path)) continue
      enqueueExif(async () => {
        try { const d = await getExif(file.path); setExifData(prev => new Map(prev).set(file.path, d)) }
        catch {}
      })
    }
  }, [groups])

  const navigateLightbox = useCallback(async (newIndex: number) => {
    if (!lightbox) return
    const file = lightbox.groupFiles[newIndex]
    if (lightbox.fileType === 'image') {
      try { const d = await getPreview(file.path); setLightbox(p => p ? { ...p, currentIndex: newIndex, src: d.data } : null) }
      catch { setLightbox(p => p ? { ...p, currentIndex: newIndex, src: undefined } : null) }
    } else {
      setLightbox(p => p ? { ...p, currentIndex: newIndex } : null)
    }
  }, [lightbox])

  const openLightbox = async (file: FileEntry, groupFiles: FileEntry[], fileType: string) => {
    const idx = groupFiles.indexOf(file)
    if (fileType === 'video') {
      setLightbox({ fileType: 'video', groupFiles, currentIndex: idx })
    } else {
      try { const d = await getPreview(file.path); setLightbox({ fileType: 'image', groupFiles, currentIndex: idx, src: d.data }) }
      catch { setLightbox({ fileType: 'image', groupFiles, currentIndex: idx }) }
    }
  }

  const toggleSelect = (path: string) => setSelectedPaths(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n })

  const handleBulkDelete = async () => {
    const paths = Array.from(selectedPaths)
    for (const p of paths) { try { await deleteFile(p) } catch {} }
    setGroups(prev => prev.map(g => ({ ...g, files: g.files.filter(f => !paths.includes(f.path)) })).filter(g => g.files.length > 1))
    setSelectedPaths(new Set()); setShowBulkConfirm(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try { await deleteFile(deleteTarget); setGroups(prev => prev.map(g => ({ ...g, files: g.files.filter(f => f.path !== deleteTarget) })).filter(g => g.files.length > 1)) }
    catch (e) { console.error(e) }
    setDeleteTarget(null)
  }

  const revealInFinder = (path: string) => (window as any).electronAPI?.revealInFinder(path)
  const filteredGroups = groups.filter(g => filter === 'all' || g.match_type === filter)

  const FILTERS = [
    { id: 'all', label: t.results.filterAll }, { id: 'exact', label: t.results.filterExact },
    { id: 'near', label: t.results.filterNear }, { id: 'semantic', label: t.results.filterSemantic },
  ]

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="flex items-center gap-3 text-[#F2F4F3]/30">
        <div className="w-4 h-4 border-2 border-[#F2F4F3]/20 border-t-[#E6E8E6] rounded-full animate-spin" />{t.common.loading}
      </div>
    </div>
  )

  if (groups.length === 0) return (
    <div className="p-8 flex flex-col items-center justify-center h-full">
      <div className="w-16 h-16 rounded-2xl bg-[#F2F4F3]/5 flex items-center justify-center mb-4"><ZoomIn className="text-[#F2F4F3]/20" size={28} /></div>
      <h2 className="text-[#F2F4F3]/60 text-lg font-medium mb-2">{t.results.noResults}</h2>
      <p className="text-[#F2F4F3]/30 text-sm">{t.results.runScanFirst}</p>
    </div>
  )

  return (
    <div className="p-8">
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

      <div className="space-y-5">
        {filteredGroups.map(group => {
          const badge = MATCH_LABELS[group.match_type] || MATCH_LABELS.semantic
          const ftype = group.file_type || (group.files[0]?.file_type ?? '')
          const isVisual = ftype === 'image' || ftype === 'video'
          const isAudio = ftype === 'audio'
          const isDoc = ftype === 'document'

          // Best file badge
          let bestIdx = -1
          if (isVisual && group.files.length > 1) {
            const anyLoaded = group.files.some(f => exifData.has(f.path))
            if (anyLoaded) {
              const scores = group.files.map(f => scoreFile(f, exifData.get(f.path)))
              const max = Math.max(...scores)
              if (max > 0) bestIdx = scores.indexOf(max)
            }
          }

          return (
            <div key={group.group_id} className="rounded-2xl bg-[#F2F4F3]/5 border border-[#F2F4F3]/10 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[#F2F4F3]/8">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>{group.match_type}</span>
                <span className="text-[#F2F4F3]/30 text-xs">{group.files.length} files · {ftype}</span>
              </div>

              {isVisual && (
                <div className="p-4 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {group.files.map((file, fi) => (
                    <div key={file.path}
                      className={`rounded-xl bg-black/20 overflow-hidden ${!file.exists ? 'opacity-40' : ''} ${selectedPaths.has(file.path) ? 'ring-2 ring-[#1E1E1E] ring-offset-2 ring-offset-[#1E1E1E]/20' : ''}`}>
                      <div className="relative">
                        <ImagePreview path={file.path} fileType={ftype}
                          onClick={() => openLightbox(file, group.files, ftype)} />
                        {file.exists && <div className="absolute top-2 left-2"><Checkbox checked={selectedPaths.has(file.path)} onChange={() => toggleSelect(file.path)} /></div>}
                        {/* Best file checkmark */}
                        {fi === bestIdx && (
                          <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#1F555C] shadow-lg shadow-black/40 flex items-center justify-center" title="Лучший файл в группе">
                            <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                              <path d="M1.5 5L5 8.5L11.5 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-[#F2F4F3]/70 text-xs font-medium truncate mb-0.5">{file.name}</p>
                        {file.similarity < 1 && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="flex-1 h-1 bg-[#F2F4F3]/10 rounded-full"><div className="h-full bg-[#1F555C] rounded-full" style={{ width: `${file.similarity * 100}%` }} /></div>
                            <span className="text-[#E6E8E6]/70 text-xs">{(file.similarity * 100).toFixed(0)}%</span>
                          </div>
                        )}
                        <ExifMini exif={exifData.get(file.path)} />
                        <button onClick={() => revealInFinder(file.path)}
                          className="w-full text-left text-[#F2F4F3]/20 text-[10px] font-mono truncate hover:text-[#E6E8E6] transition-colors flex items-center gap-1 mt-1.5 mb-2" title={file.path}>
                          <ExternalLink size={9} className="shrink-0" />{file.path}
                        </button>
                        {file.exists && (
                          <button onClick={() => setDeleteTarget(file.path)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#FF705B]/10 text-[#FF705B]/70 hover:bg-[#FF705B]/20 hover:text-[#FF705B] transition-all text-xs">
                            <Trash2 size={12} />{t.results.deleteFile}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isAudio && (
                <div className="p-4 space-y-2">
                  {group.files.map(file => <AudioCard key={file.path} file={file} onDelete={() => setDeleteTarget(file.path)} onReveal={() => revealInFinder(file.path)} onToggle={() => toggleSelect(file.path)} selected={selectedPaths.has(file.path)} t={t} />)}
                </div>
              )}

              {isDoc && (
                <div className="p-4 space-y-2">
                  {group.files.map(file => <DocCard key={file.path} file={file} onDelete={() => setDeleteTarget(file.path)} onReveal={() => revealInFinder(file.path)} onToggle={() => toggleSelect(file.path)} selected={selectedPaths.has(file.path)} t={t} />)}
                </div>
              )}

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
                      {file.exists && <button onClick={() => setDeleteTarget(file.path)} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF705B]/10 text-[#FF705B]/70 hover:bg-[#FF705B]/20 hover:text-[#FF705B] transition-all text-xs"><Trash2 size={13} />{t.results.deleteFile}</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedPaths.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-2xl bg-[#1C1C1C] border border-[#1E1E1E]/50 shadow-2xl shadow-black/60">
          <span className="text-[#F2F4F3]/60 text-sm"><span className="text-[#F2F4F3] font-semibold">{selectedPaths.size}</span> {t.results.selectedCount}</span>
          <button onClick={() => setSelectedPaths(new Set())} className="text-[#F2F4F3]/30 hover:text-[#F2F4F3]/60 transition-colors"><X size={14} /></button>
          <button onClick={() => setShowBulkConfirm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF705B]/20 text-[#FF705B] hover:bg-[#FF705B]/30 transition-all text-sm font-medium">
            <Trash2 size={14} />{t.results.deleteSelected}
          </button>
        </div>
      )}

      {lightbox?.fileType === 'image' && <ImageLightbox state={lightbox} onClose={() => setLightbox(null)} exifData={exifData} onNavigate={navigateLightbox} />}
      {lightbox?.fileType === 'video' && <VideoLightbox state={lightbox} onClose={() => setLightbox(null)} exifData={exifData} onNavigate={navigateLightbox} />}
      {deleteTarget && <DeleteConfirmModal path={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} t={t} />}
      {showBulkConfirm && <BulkDeleteModal paths={Array.from(selectedPaths)} onConfirm={handleBulkDelete} onCancel={() => setShowBulkConfirm(false)} t={t} />}
    </div>
  )
}
