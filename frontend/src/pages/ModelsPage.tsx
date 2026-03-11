import { useState, useEffect, useRef } from 'react'
import { Download, CheckCircle, HardDrive, Cpu, FileText, Music, WifiOff } from 'lucide-react'
import { getModels, downloadModel, createWebSocket } from '../utils/api'
import { useStore } from '../store'

interface ModelMeta {
  id: string
  name: string
  description: string
  hf_id: string | null
  size_mb: number
  type: string
  downloaded: boolean
}

interface ModelsData {
  image: ModelMeta[]
  text: ModelMeta[]
  audio: ModelMeta[]
}

export function ModelsPage({ t }: { t: any }) {
  const [models, setModels] = useState<ModelsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<Set<string>>(new Set())
  const { settings, setSettings, lang } = useStore()

  const loadModels = async () => {
    try {
      const data = await getModels(lang)
      setModels(data)
      setError(null)
    } catch (e: any) {
      setError('No connection to backend. Check ~/Zap that Dupple/app.log')
    }
  }

  useEffect(() => {
    loadModels()
    const interval = setInterval(loadModels, 5000)
    return () => clearInterval(interval)
  }, [lang])

  const stopDownloading = (modelId: string) => {
    setDownloading(prev => { const n = new Set(prev); n.delete(modelId); return n })
  }

  // WebSocket: stop spinner immediately when backend confirms download done
  useEffect(() => {
    const ws = createWebSocket((msg) => {
      if (msg.type === 'model_download_progress' && msg.status === 'downloaded') {
        stopDownloading(msg.model_id)
        loadModels()
      }
    })
    return () => ws.close()
  }, [])

  const handleDownload = async (modelId: string) => {
    setDownloading(prev => new Set(prev).add(modelId))
    try {
      await downloadModel(modelId)

      // Poll API every 4s — stops as soon as backend confirms downloaded
      let attempts = 0
      const maxAttempts = 120 // 8 minutes max
      const poll = setInterval(async () => {
        attempts++
        try {
          const data = await getModels()
          setModels(data)
          const allModels = [...data.image, ...data.text, ...data.audio]
          const model = allModels.find(m => m.id === modelId)
          if (model?.downloaded || attempts >= maxAttempts) {
            clearInterval(poll)
            stopDownloading(modelId)
          }
        } catch {
          // backend busy, keep polling
        }
      }, 4000)
    } catch (e) {
      stopDownloading(modelId)
    }
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full gap-4">
        <WifiOff className="text-[#FF705B]/60" size={40} />
        <p className="text-[#FF705B]/80 text-sm text-center max-w-sm">{error}</p>
        <button onClick={loadModels} className="px-4 py-2 rounded-xl bg-[#F2F4F3]/5 text-[#F2F4F3]/50 hover:bg-[#F2F4F3]/10 text-sm transition-all">
          Повторить
        </button>
      </div>
    )
  }

  if (!models) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-[#F2F4F3]/30">
          <div className="w-4 h-4 border-2 border-[#F2F4F3]/20 border-t-[#E6E8E6] rounded-full animate-spin" />
          {t.common.connecting}
        </div>
      </div>
    )
  }

  const ModelCard = ({ model, selected, onSelect, onDownload, isDownloading, t }: {
    model: ModelMeta, selected: boolean,
    onSelect: () => void, onDownload: () => void, isDownloading: boolean, t: any
  }) => {
    const sizeMb = model.size_mb
    const sizeStr = sizeMb >= 1000 ? `${(sizeMb/1024).toFixed(1)} ${t.models.gb}` : sizeMb > 0 ? `${sizeMb} ${t.models.mb}` : '—'

    return (
      <div className={`p-4 rounded-xl border transition-all ${selected ? 'border-[#1F555C]/50 bg-[#1F555C]/10' : 'border-[#F2F4F3]/5 bg-[#F2F4F3]/5 hover:border-[#F2F4F3]/10'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[#F2F4F3]/80 text-sm font-medium">{model.name}</h3>
              {selected && <span className="text-xs text-[#E6E8E6] bg-[#1F555C]/15 px-2 py-0.5 rounded-full">{t.models.selected}</span>}
            </div>
            <p className="text-[#F2F4F3]/30 text-xs leading-relaxed mb-2">{model.description}</p>
            {sizeMb > 0 && (
              <div className="flex items-center gap-1 text-[#F2F4F3]/20 text-xs">
                <HardDrive size={10} />{sizeStr}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {model.hf_id === null ? (
              <span className="text-[#E6E8E6]/70 text-xs flex items-center gap-1">
                <CheckCircle size={12} />{t.models.builtin}
              </span>
            ) : model.downloaded ? (
              <span className="text-[#E6E8E6]/70 text-xs flex items-center gap-1">
                <CheckCircle size={12} />{t.models.downloaded}
              </span>
            ) : (
              <button onClick={onDownload} disabled={isDownloading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F2F4F3]/5 text-[#E6E8E6] hover:bg-[#F2F4F3]/5 transition-all text-xs disabled:opacity-50">
                {isDownloading ? <span className="animate-spin">↻</span> : <Download size={12} />}
                {isDownloading ? t.models.downloading : t.models.download}
              </button>
            )}
            {model.downloaded && !selected && model.hf_id !== null && (
              <button onClick={onSelect}
                className="px-3 py-1.5 rounded-lg bg-[#1F555C]/10 text-[#E6E8E6] hover:bg-[#1F555C]/20 transition-all text-xs">
                {t.models.select}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const Section = ({ icon: Icon, title, children }: any) => (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-[#E6E8E6]" />
        <h2 className="text-sm font-medium text-[#F2F4F3]/60">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#F2F4F3] mb-2">{t.models.title}</h1>
      <p className="text-[#F2F4F3]/30 text-sm mb-8">
        {t.models.modelsStoredAt}: <code className="text-[#E6E8E6]/70 text-xs">~/Zap that Dupple/models/</code>
      </p>

      <Section icon={Cpu} title={t.models.imageModels}>
        {models.image.map(m => (
          <ModelCard key={m.id} model={m} t={t}
            selected={settings.image_model === m.id}
            onSelect={() => setSettings({ image_model: m.id })}
            onDownload={() => handleDownload(m.id)}
            isDownloading={downloading.has(m.id)} />
        ))}
      </Section>

      <Section icon={FileText} title={t.models.textModels}>
        {models.text.map(m => (
          <ModelCard key={m.id} model={m} t={t}
            selected={settings.text_model === m.id}
            onSelect={() => setSettings({ text_model: m.id })}
            onDownload={() => handleDownload(m.id)}
            isDownloading={downloading.has(m.id)} />
        ))}
      </Section>

      <Section icon={Music} title={t.models.audioModels}>
        {models.audio.map(m => (
          <ModelCard key={m.id} model={m} t={t}
            selected={false} onSelect={() => {}} onDownload={() => {}}
            isDownloading={false} />
        ))}
      </Section>
    </div>
  )
}
