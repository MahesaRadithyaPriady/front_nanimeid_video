export const API_BASE = import.meta.env.VITE_API_BASE || 'https://media.nanimeid.xyz'
export const api = (path = '') => `${API_BASE}${path}`
