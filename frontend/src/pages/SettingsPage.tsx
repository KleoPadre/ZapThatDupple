import { useState } from 'react'
import { Info, Check, AlertTriangle, X } from 'lucide-react'
import { useStore } from '../store'
import { saveSettings, resetDatabase } from '../utils/api'

function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-violet-500 cursor-pointer"
      />
      <span className="text-violet-400 text-sm font-mono w-12 text-right">{value.toFixed(2)}</span>
    </div>
  )
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-white/20 hover:text-white/60 transition-colors"
      >
        <Info size={14} />
      </button>
      {show && (
        <div className="absolute left-6 top-0 z-10 w-64 p-3 rounded-xl bg-[#1a1a1f] border border-white/10 text-xs text-white/50 leading-relaxed shadow-xl">
          {text}
        </div>
      )}
    </div>
  )
}

function SettingRow({ label, desc, children, t }: any) {
  return (
    <div className="py-4 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-white/70">{label}</span>
        <InfoTooltip text={desc} />
      </div>
      {children}
    </div>
  )
}

function ConfirmModal({ title, desc, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-[#1a1a1f] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="text-red-400" size={20} />
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        <p className="text-white/40 text-sm mb-6">{desc}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 hover:bg-white/10 transition-all text-sm">
            Отмена
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm font-medium">
            Сбросить
          </button>
        </div>
      </div>
    </div>
  )
}

export function SettingsPage({ t }: { t: any }) {
  const { settings, setSettings, lang, setLang } = useStore()
  const [saved, setSaved] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const handleSave = async () => {
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = async () => {
    await resetDatabase()
    setShowResetConfirm(false)
  }

  const Section = ({ title, children }: any) => (
    <div className="mb-8">
      <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-1">{title}</h2>
      <div className="rounded-2xl bg-white/5 border border-white/5 px-5">
        {children}
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-8">{t.settings.title}</h1>

      <Section title={t.settings.imageSection}>
        <SettingRow label={t.settings.imageThreshold} desc={t.settings.imageThresholdDesc} t={t}>
          <Slider value={settings.image_threshold} min={0.5} max={1.0} step={0.01}
            onChange={(v) => setSettings({ image_threshold: v })} />
        </SettingRow>
      </Section>

      <Section title={t.settings.videoSection}>
        <SettingRow label={t.settings.videoThreshold} desc={t.settings.videoThresholdDesc} t={t}>
          <Slider value={settings.video_threshold} min={0.5} max={1.0} step={0.01}
            onChange={(v) => setSettings({ video_threshold: v })} />
        </SettingRow>
        <SettingRow label={t.settings.videoFrames} desc={t.settings.videoFramesDesc} t={t}>
          <div className="flex items-center gap-3">
            <input type="range" min={3} max={30} step={1} value={settings.video_frames}
              onChange={(e) => setSettings({ video_frames: parseInt(e.target.value) })}
              className="flex-1 accent-violet-500 cursor-pointer" />
            <span className="text-violet-400 text-sm font-mono w-12 text-right">{settings.video_frames}</span>
          </div>
        </SettingRow>
      </Section>

      <Section title={t.settings.audioSection}>
        <SettingRow label={t.settings.audioThreshold} desc={t.settings.audioThresholdDesc} t={t}>
          <Slider value={settings.audio_threshold} min={0.5} max={1.0} step={0.01}
            onChange={(v) => setSettings({ audio_threshold: v })} />
        </SettingRow>
      </Section>

      <Section title={t.settings.documentSection}>
        <SettingRow label={t.settings.textThreshold} desc={t.settings.textThresholdDesc} t={t}>
          <Slider value={settings.text_threshold} min={0.5} max={1.0} step={0.01}
            onChange={(v) => setSettings({ text_threshold: v })} />
        </SettingRow>
      </Section>

      {/* Language */}
      <Section title={t.settings.language}>
        <div className="py-4 flex gap-3">
          {(['ru', 'en'] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-5 py-2 rounded-xl text-sm transition-all ${
                lang === l ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'
              }`}>
              {l === 'ru' ? 'Русский' : 'English'}
            </button>
          ))}
        </div>
      </Section>

      {/* Reset DB */}
      <Section title="">
        <div className="py-4">
          <p className="text-sm text-white/40 mb-3">{t.settings.resetDbDesc}</p>
          <button onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-sm">
            {t.settings.resetDb}
          </button>
        </div>
      </Section>

      {/* Save button */}
      <button onClick={handleSave}
        className={`w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
          saved ? 'bg-green-500/20 text-green-400' : 'bg-violet-500 hover:bg-violet-400 text-white shadow-lg shadow-violet-500/20'
        }`}>
        {saved ? <><Check size={16} /> {t.settings.saved}</> : t.settings.save}
      </button>

      {showResetConfirm && (
        <ConfirmModal
          title={t.settings.resetDbConfirm}
          desc={t.settings.resetDbConfirmDesc}
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  )
}
