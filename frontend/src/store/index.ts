import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Lang } from '../i18n/translations'

export interface ScanState {
  status: 'idle' | 'scanning' | 'processing' | 'loading_models' | 'comparing' | 'done' | 'error'
  step?: string
  progress: number
  total_files: number
  processed: number
  current_file?: string
  elapsed?: number
  remaining?: number
  groups_found?: number
  error?: string
  message?: string
}

export interface Settings {
  image_model: string
  text_model: string
  image_threshold: number
  text_threshold: number
  audio_threshold: number
  video_threshold: number
  video_frames: number
  scan_folders: string[]
}

interface AppStore {
  lang: Lang
  setLang: (lang: Lang) => void

  scanState: ScanState
  setScanState: (state: Partial<ScanState>) => void

  settings: Settings
  setSettings: (s: Partial<Settings>) => void

  selectedFolders: string[]
  addFolder: (f: string) => void
  removeFolder: (f: string) => void
  setFolders: (folders: string[]) => void

  activeTab: string
  setActiveTab: (tab: string) => void
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      lang: 'ru',
      setLang: (lang) => set({ lang }),

      scanState: {
        status: 'idle',
        progress: 0,
        total_files: 0,
        processed: 0,
      },
      setScanState: (state) =>
        set((prev) => ({ scanState: { ...prev.scanState, ...state } })),

      settings: {
        image_model: 'clip-ViT-B-32',
        text_model: 'all-MiniLM-L6-v2',
        image_threshold: 0.92,
        text_threshold: 0.90,
        audio_threshold: 0.88,
        video_threshold: 0.90,
        video_frames: 10,
        scan_folders: [],
      },
      setSettings: (s) =>
        set((prev) => ({ settings: { ...prev.settings, ...s } })),

      selectedFolders: [],
      addFolder: (f) =>
        set((prev) => ({
          selectedFolders: prev.selectedFolders.includes(f)
            ? prev.selectedFolders
            : [...prev.selectedFolders, f],
        })),
      removeFolder: (f) =>
        set((prev) => ({
          selectedFolders: prev.selectedFolders.filter((x) => x !== f),
        })),
      setFolders: (folders) => set({ selectedFolders: folders }),

      activeTab: 'scan',
      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: 'filesdedupe-store',
      partialize: (state) => ({
        lang: state.lang,
        settings: state.settings,
        selectedFolders: state.selectedFolders,
      }),
    }
  )
)
