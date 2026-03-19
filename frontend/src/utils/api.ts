import axios from 'axios'

const API_BASE = 'http://127.0.0.1:8765'

export const api = axios.create({ baseURL: API_BASE, timeout: 10000 })

// Отдельный инстанс для /api/results — при большой коллекции JOIN-запрос
// может занять несколько секунд, стандартного 10s таймаута не хватает
export const resultsApi = axios.create({ baseURL: API_BASE, timeout: 60000 })

// Separate instance for previews — longer timeout
export const previewApi = axios.create({ baseURL: API_BASE, timeout: 30000 })

export const getModels = (lang = 'ru') => api.get(`/api/models?lang=${lang}`).then(r => r.data)
export const downloadModel = (model_id: string) => api.post('/api/models/download', { model_id })
export const checkModelUpdates = () => api.post('/api/models/check-updates')
export const getSettings = () => api.get('/api/settings').then(r => r.data)
export const saveSettings = (settings: object) => api.post('/api/settings', settings)
export const startScan = (params: object) => api.post('/api/scan/start', params)
export const stopScan = () => api.post('/api/scan/stop')
export const getScanStatus = () => api.get('/api/scan/status').then(r => r.data)
export const getResults = () => resultsApi.get('/api/results').then(r => r.data)
export const deleteFile = (path: string) => api.post('/api/file/delete', { path })
export const resetDatabase = () => api.post('/api/db/reset')

// Preview with cache — avoid re-fetching same file
const previewCache = new Map<string, string>()

export async function getPreview(path: string): Promise<{ data: string }> {
  if (previewCache.has(path)) {
    return { data: previewCache.get(path)! }
  }
  const result = await previewApi.get('/api/file/preview', { params: { path } })
  previewCache.set(path, result.data.data)
  return result.data
}

// WebSocket
export function createWebSocket(onMessage: (data: any) => void): WebSocket {
  const ws = new WebSocket('ws://127.0.0.1:8765/ws')
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch {}
  }
  ws.onerror = (e) => console.error('WS error', e)
  return ws
}
