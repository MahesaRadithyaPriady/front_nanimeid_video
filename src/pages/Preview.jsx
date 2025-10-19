import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../config/apiUrl'

// Utility to load external scripts/styles once
function useCdn(src, { as = 'script' } = {}) {
  useEffect(() => {
    let el
    if (as === 'script') {
      el = document.querySelector(`script[src="${src}"]`)
      if (!el) {
        el = document.createElement('script')
        el.src = src
        el.async = true
        document.body.appendChild(el)
      }
    } else if (as === 'style') {
      el = document.querySelector(`link[href="${src}"]`)
      if (!el) {
        el = document.createElement('link')
        el.rel = 'stylesheet'
        el.href = src
        document.head.appendChild(el)
      }
    }
  }, [src, as])
}

// Ensure external JS is loaded before use
function useScript(src) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let s = document.querySelector(`script[src="${src}"]`)
    const onLoad = () => {
      s?.setAttribute('data-loaded', 'true')
      setReady(true)
    }
    if (s) {
      if (s.getAttribute('data-loaded') === 'true') {
        setReady(true)
        return
      }
      s.addEventListener('load', onLoad)
    } else {
      s = document.createElement('script')
      s.src = src
      s.async = true
      s.addEventListener('load', onLoad)
      document.body.appendChild(s)
    }
    return () => {
      s?.removeEventListener('load', onLoad)
    }
  }, [src])
  return ready
}

export default function Preview() {
  const { id } = useParams()
  const videoRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signed, setSigned] = useState({ url: '', exp: 0, video: null })

  // Load Plyr CSS and wait for JS libraries to be ready
  useCdn('https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.css', { as: 'style' })
  const plyrReady = useScript('https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.polyfilled.min.js')
  const hlsReady = useScript('https://cdn.jsdelivr.net/npm/hls.js@latest')

  useEffect(() => {
    let player
    let hls
    async function init() {
      try {
        setLoading(true)
        // get expiring link (default ttl 1 hour)
        const res = await fetch(api(`/api/videos/${id}/link?ttl=3600`))
        if (!res.ok) throw new Error(`Gagal ambil link (${res.status})`)
        const data = await res.json()
        setSigned(data)

        const el = videoRef.current
        if (!el) return

        // wait until Plyr script is ready before initializing
        if (!plyrReady) {
          return
        }
        const Plyr = window.Plyr

        // Prefer hls.js when supported, even if URL doesn't end with .m3u8 (e.g., signed /media route)
        if (hlsReady && window.Hls && window.Hls.isSupported()) {
          hls = new window.Hls()

          // When manifest is parsed, derive quality options and init Plyr with quality menu
          hls.on(window.Hls.Events.MANIFEST_PARSED, function (_, eventData) {
            const levels = (eventData && eventData.levels) || hls.levels || []
            const heights = Array.from(new Set(levels.map((l) => l.height).filter(Boolean))).sort((a, b) => b - a)
            const defaultQuality = heights[0] || 0

            if (Plyr) {
              player = new Plyr(el, {
                controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
                settings: ['quality', 'speed'],
                quality: {
                  default: defaultQuality,
                  options: heights,
                  forced: true,
                  onChange: (q) => {
                    // map selected height to the closest matching level
                    const idx = hls.levels.findIndex((l) => l.height === q)
                    hls.currentLevel = idx !== -1 ? idx : -1 // -1 = auto
                  },
                },
              })
              // Set initial level to default height
              const initialIdx = hls.levels.findIndex((l) => l.height === defaultQuality)
              hls.currentLevel = initialIdx !== -1 ? initialIdx : -1
            }
          })

          hls.loadSource(data.url)
          hls.attachMedia(el)
        } else {
          // Let browser decide (native HLS on Safari/iOS or MP4)
          el.src = data.url
          if (Plyr) {
            player = new Plyr(el, {
              controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
              settings: ['speed'],
            })
          }
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    init()
    return () => {
      try { if (hls) hls.destroy() } catch {}
      try { if (player) player.destroy() } catch {}
    }
  }, [id, plyrReady, hlsReady])

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Preview Video (ID: {id})</h1>
        {loading && <p className="text-white/70">Memuat link...</p>}
        {error && <p className="text-red-400">{error}</p>}
        {!loading && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <video ref={videoRef} className="plyr__video-embed w-full" controls playsInline />
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm text-white/60">Judul</div>
                <div className="rounded-lg bg-white/5 p-2 text-sm">{signed.video?.nama_video || '-'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-white/60">Slug</div>
                <div className="rounded-lg bg-white/5 p-2 text-sm">/{signed.video?.slug || '-'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-white/60">Link Direct (DB)</div>
                <div className="flex items-center gap-2">
                  <input readOnly value={signed.video?.video_url || ''} className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-xs" />
                  <button onClick={() => navigator.clipboard.writeText(signed.video?.video_url || '')} className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15">Copy</button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-white/60">Link Signed (Exp)</div>
                <div className="flex items-center gap-2">
                  <input readOnly value={signed.url} className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-xs" />
                  <button onClick={() => navigator.clipboard.writeText(signed.url)} className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15">Copy</button>
                </div>
                <div className="text-xs text-white/60">Expired pada: {signed.exp ? new Date(signed.exp * 1000).toLocaleString() : '-'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
