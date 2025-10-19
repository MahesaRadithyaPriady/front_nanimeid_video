export const API_BASE = import.meta.env.VITE_API_BASE || 'http://103.103.23.250:8080'
export const api = (path = '') => `${API_BASE}${path}`
