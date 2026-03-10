import { Scan, FolderSearch, Settings, Cpu, Globe } from 'lucide-react'
import { useStore } from '../store'

const TABS = [
  { id: 'scan', icon: Scan, labelKey: 'scan' },
  { id: 'results', icon: FolderSearch, labelKey: 'results' },
  { id: 'models', icon: Cpu, labelKey: 'models' },
  { id: 'settings', icon: Settings, labelKey: 'settings' },
]

export function Sidebar({ t }: { t: any }) {
  const { activeTab, setActiveTab, lang, setLang, scanState } = useStore()

  return (
    <aside className="w-[68px] bg-[#0a0a0c] border-r border-white/5 flex flex-col items-center py-4 pt-10 gap-1 shrink-0">
      {/* App icon */}
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
        <FolderSearch size={18} className="text-white" />
      </div>

      {/* Nav items */}
      {TABS.map(({ id, icon: Icon, labelKey }) => {
        const isActive = activeTab === id
        const hasBadge = id === 'results' && scanState.status === 'done' && (scanState.groups_found ?? 0) > 0

        return (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group
              ${isActive
                ? 'bg-violet-500/20 text-violet-400'
                : 'text-white/30 hover:text-white/70 hover:bg-white/5'
              }`}
            title={(t.nav as any)[labelKey]}
          >
            <Icon size={20} />
            {hasBadge && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-violet-400 rounded-full" />
            )}
          </button>
        )
      })}

      {/* Language toggle at bottom */}
      <div className="mt-auto">
        <button
          onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all text-xs font-bold"
          title="Switch language"
        >
          {lang === 'ru' ? 'EN' : 'RU'}
        </button>
      </div>
    </aside>
  )
}
