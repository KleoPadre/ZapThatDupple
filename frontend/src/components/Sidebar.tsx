import React from 'react'
import { Scan, FolderSearch, Settings, Cpu } from 'lucide-react'
import { useStore } from '../store'

const TABS = [
  { id: 'scan',     icon: Scan,         labelKey: 'scan'     },
  { id: 'results',  icon: FolderSearch, labelKey: 'results'  },
  { id: 'models',   icon: Cpu,          labelKey: 'models'   },
  { id: 'settings', icon: Settings,     labelKey: 'settings' },
]

const noDrag: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as any

export function Sidebar({ t }: { t: any }) {
  const { activeTab, setActiveTab, lang, setLang, scanState } = useStore()

  return (
    <aside className="w-[86px] bg-[#1C1C1C] border-r border-[#F2F4F3]/5 flex flex-col items-center gap-2 shrink-0">
      {/* Spacer под traffic lights */}
      <div className="h-[52px] w-full shrink-0" />

      {/* App icon */}
      <div
        className="w-[52px] h-[52px] rounded-2xl bg-gradient-to-br from-[#1F555C] to-[#1E1E1E] flex items-center justify-center mb-4 shadow-lg shadow-[#1F555C]/20"
        style={noDrag}
      >
        <FolderSearch size={24} className="text-[#F2F4F3]" />
      </div>

      {/* Nav items */}
      {TABS.map(({ id, icon: Icon, labelKey }) => {
        const isActive = activeTab === id
        const hasBadge = id === 'results' && scanState.status === 'done' && (scanState.groups_found ?? 0) > 0

        return (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={noDrag}
            className={`relative w-[70px] h-[70px] rounded-2xl flex items-center justify-center transition-all duration-200
              ${isActive
                ? 'bg-[#1F555C]/30 text-[#E6E8E6]'
                : 'text-[#F2F4F3]/30 hover:text-[#F2F4F3]/70 hover:bg-[#F2F4F3]/5'
              }`}
            title={(t.nav as any)[labelKey]}
          >
            <Icon size={24} />
            {hasBadge && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#E6E8E6] rounded-full" />
            )}
          </button>
        )
      })}

      {/* Language toggle */}
      <div className="mt-auto mb-4" style={noDrag}>
        <button
          onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
          className="w-[70px] h-[70px] rounded-2xl flex items-center justify-center text-[#F2F4F3]/30 hover:text-[#F2F4F3]/70 hover:bg-[#F2F4F3]/5 transition-all text-xs font-bold"
          title="Switch language"
        >
          {lang === 'ru' ? 'EN' : 'RU'}
        </button>
      </div>
    </aside>
  )
}
