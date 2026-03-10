import { useEffect, useRef } from 'react'
import { useStore } from './store'
import { createWebSocket } from './utils/api'
import { translations } from './i18n/translations'
import { ScanPage } from './pages/ScanPage'
import { ResultsPage } from './pages/ResultsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ModelsPage } from './pages/ModelsPage'
import { Sidebar } from './components/Sidebar'

export default function App() {
  const { activeTab, setScanState, lang } = useStore()
  const wsRef = useRef<WebSocket | null>(null)
  const t = translations[lang]

  useEffect(() => {
    const connect = () => {
      wsRef.current = createWebSocket((data) => {
        if (data.type === 'progress' || data.type === 'state') {
          setScanState({
            status: data.status || data.step,
            progress: data.progress ?? 0,
            total_files: data.total_files ?? 0,
            processed: data.processed ?? 0,
            current_file: data.current_file,
            elapsed: data.elapsed,
            remaining: data.remaining,
            message: data.message,
          })
        }
        if (data.type === 'scan_done') {
          setScanState({
            status: 'done',
            groups_found: data.groups_found,
            progress: 100,
          })
        }
        if (data.type === 'scan_error') {
          setScanState({ status: 'error', error: data.error })
        }
      })

      wsRef.current.onclose = () => {
        setTimeout(connect, 3000)
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  const renderPage = () => {
    switch (activeTab) {
      case 'scan': return <ScanPage t={t} />
      case 'results': return <ResultsPage t={t} />
      case 'settings': return <SettingsPage t={t} />
      case 'models': return <ModelsPage t={t} />
      default: return <ScanPage t={t} />
    }
  }

  return (
    <div className="flex h-screen bg-[#0f0f11] text-white overflow-hidden">
      <Sidebar t={t} />
      <main className="flex-1 overflow-auto">
        {renderPage()}
      </main>
    </div>
  )
}
