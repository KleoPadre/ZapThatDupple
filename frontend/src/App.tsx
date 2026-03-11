import React, { useEffect, useRef } from 'react'
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
          setScanState({ status: 'done', groups_found: data.groups_found, progress: 100 })
        }
        if (data.type === 'scan_error') {
          setScanState({ status: 'error', error: data.error })
        }
      })
      wsRef.current.onclose = () => { setTimeout(connect, 3000) }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  const renderPage = () => {
    switch (activeTab) {
      case 'scan':     return <ScanPage t={t} />
      case 'results':  return <ResultsPage t={t} />
      case 'settings': return <SettingsPage t={t} />
      case 'models':   return <ModelsPage t={t} />
      default:         return <ScanPage t={t} />
    }
  }

  return (
    <div style={{ position: 'relative' }} className="h-screen bg-[#1E1E1E] text-[#F2F4F3] overflow-hidden">
      {/* Full-width native drag strip — covers entire top 52px of the window */}
      <div style={{
        WebkitAppRegion: 'drag',
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 52,
        zIndex: 0,
      } as React.CSSProperties} />

      {/* Main layout — sits above drag strip, buttons use no-drag via Sidebar */}
      <div className="flex h-full" style={{ position: 'relative', zIndex: 1 }}>
        <Sidebar t={t} />
        <main className="flex-1 overflow-auto h-full">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
