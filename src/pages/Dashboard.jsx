import { useEffect, useMemo, useRef, useState } from 'react'
import { Film, Link as LinkIcon, CheckCircle, Type, Hash, Upload, FileVideo, X, Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../config/apiUrl'

function slugify(input) {
  return input
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function Dashboard() {
  const [namaVideo, setNamaVideo] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [useCustomSlug, setUseCustomSlug] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [encodeHls, setEncodeHls] = useState(false)
  const [useUpload, setUseUpload] = useState(false)
  const [file, setFile] = useState(null)
  const [objectUrl, setObjectUrl] = useState('')
  const videoRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [videos, setVideos] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [encodeProgress, setEncodeProgress] = useState(null)
  const progressESRef = useRef(null)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploading, setUploading] = useState(false)

  const derivedSlug = useMemo(() => (useCustomSlug ? customSlug : slugify(namaVideo)), [useCustomSlug, customSlug, namaVideo])

  // Clean up object URL when file changes or component unmounts
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      // cleanup SSE on unmount
      try { progressESRef.current?.close() } catch {}
    }
  }, [objectUrl])

  const fetchVideos = async () => {
    try {
      setLoadingList(true)
      const res = await fetch(api('/api/videos'))
      const data = await res.json()
      setVideos(Array.isArray(data) ? data : [])
    } catch (_) {
      // ignore
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    fetchVideos()
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Decide source priority: uploaded file > typed URL
    const effectiveSrc = useUpload && objectUrl ? objectUrl : videoUrl

    if (!effectiveSrc) {
      video.removeAttribute('src')
      video.load()
      return
    }

    // Local files aren't HLS; only treat as HLS when using URL mode
    const isHls = !useUpload && (effectiveSrc.endsWith('.m3u8') || encodeHls)

    if (isHls) {
      // Load hls.js from CDN lazily
      const ensureHls = () =>
        new Promise((resolve, reject) => {
          if (window.Hls) return resolve(window.Hls)
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest'
          script.async = true
          script.onload = () => resolve(window.Hls)
          script.onerror = reject
          document.body.appendChild(script)
        })

      ensureHls().then((Hls) => {
        if (Hls && Hls.isSupported()) {
          const hls = new Hls()
          hls.loadSource(effectiveSrc)
          hls.attachMedia(video)
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = effectiveSrc
        }
      }).catch(() => {
        // fallback: try direct assign
        video.src = effectiveSrc
      })
    } else {
      video.src = effectiveSrc
    }
  }, [videoUrl, encodeHls, useUpload, objectUrl])

  const subscribeProgress = (id) => {
    try { progressESRef.current?.close() } catch {}
    setEncodeProgress(0)
    const es = new EventSource(api(`/api/videos/${id}/encode/progress`))
    progressESRef.current = es
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (typeof data.percent === 'number') {
          const pct = Math.min(100, Math.max(1, Math.round(data.percent)))
          setEncodeProgress(pct)
          if (pct >= 100) {
            es.close()
            // slight delay to allow DB update then refresh
            setTimeout(() => {
              fetchVideos()
              setStatusMsg('Encode selesai.')
            }, 800)
          }
        }
      } catch {}
    }
    es.onerror = () => {
      try { es.close() } catch {}
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setStatusMsg('')

    try {
      setSaving(true)

      let finalUrl = videoUrl

      if (useUpload) {
        if (!file) {
          setStatusMsg('Pilih file terlebih dahulu.')
          return
        }
        const fd = new FormData()
        fd.append('file', file)
        const uploadId = `up-${Date.now()}`
        setUploading(true)
        setUploadProgress(0)

        // Use XHR for progress events
        const urlReq = api(`/api/upload?id=${uploadId}`)
        const xhr = new XMLHttpRequest()
        const upPromise = new Promise((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.min(100, Math.max(1, Math.round((e.loaded / e.total) * 100)))
              setUploadProgress(pct)
            }
          }
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              setUploading(false)
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const resp = JSON.parse(xhr.responseText)
                  setUploadProgress(100)
                  resolve(resp)
                } catch (err) {
                  reject(err)
                }
              } else {
                try {
                  const resp = JSON.parse(xhr.responseText)
                  reject(new Error(resp.error || `Gagal upload (${xhr.status})`))
                } catch (err) {
                  reject(new Error(`Gagal upload (${xhr.status})`))
                }
              }
            }
          }
          xhr.onerror = () => {
            setUploading(false)
            reject(new Error('Network error saat upload'))
          }
          xhr.open('POST', urlReq)
          xhr.send(fd)
        })

        const upRes = await upPromise
        const url = upRes.url
        finalUrl = url
        setVideoUrl(url)
      }

      const payload = {
        nama_video: namaVideo,
        slug: derivedSlug,
        video_url: finalUrl,
        encode_hls: encodeHls,
      }

      const res = await fetch(api('/api/videos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Gagal simpan (${res.status})`)
      }
      const saved = await res.json().catch(() => ({}))
      if (encodeHls && saved.id) {
        setStatusMsg('Disimpan. Memulai proses encode HLS...')
        subscribeProgress(saved.id)
        const enc = await fetch(api(`/api/videos/${saved.id}/encode`), { method: 'POST' })
        if (!enc.ok) {
          const d = await enc.json().catch(() => ({}))
          setStatusMsg(`Encode gagal: ${d.error || enc.status}`)
          setEncodeProgress(null)
        } else {
          setStatusMsg('Encode dimulai. Tunggu beberapa saat lalu muat ulang daftar.')
        }
      } else {
        setStatusMsg('Berhasil diupload dan disimpan.')
      }
      // refresh list
      fetchVideos()
    } catch (err) {
      setStatusMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black text-white antialiased">
      <div className="absolute inset-0 -z-10">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-6rem] right-[-6rem] h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-500 text-white">
            <Film className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-white/70">Fungsi utama pengelolaan video</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Form */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <form onSubmit={onSubmit} className="space-y-4">
              {/* Source Switch */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
                <button type="button" onClick={() => setUseUpload(false)} className={`rounded-lg px-4 py-2 text-sm transition ${!useUpload ? 'bg-white/10' : 'bg-transparent'} `}>URL</button>
                <button type="button" onClick={() => setUseUpload(true)} className={`rounded-lg px-4 py-2 text-sm transition ${useUpload ? 'bg-white/10' : 'bg-transparent'} `}>Upload</button>
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/80">Nama Video</label>
                <div className="relative">
                  <input
                    type="text"
                    value={namaVideo}
                    onChange={(e) => setNamaVideo(e.target.value)}
                    placeholder="Nama video"
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 pl-11 text-white placeholder-white/60 outline-none transition focus:border-fuchsia-400/40 focus:bg-white/15"
                  />
                  <Type className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-white/60" />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm text-white/80">Slug</label>
                  <label className="inline-flex select-none items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={useCustomSlug}
                      onChange={(e) => setUseCustomSlug(e.target.checked)}
                      className="size-4 rounded border-white/20 bg-transparent text-fuchsia-500 focus:ring-fuchsia-500/40"
                    />
                    Custom slug
                  </label>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={useCustomSlug ? customSlug : derivedSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                    disabled={!useCustomSlug}
                    placeholder="slug-otomatis-dari-nama"
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 pl-11 text-white placeholder-white/60 outline-none transition focus:border-fuchsia-400/40 focus:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <Hash className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-white/60" />
                </div>
              </div>

              {!useUpload && (
                <div>
                  <label className="mb-1 block text-sm text-white/80">URL Video (MP4 / HLS .m3u8)</label>
                  <div className="relative">
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://domain.com/video.mp4 atau .m3u8"
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 pl-11 text-white placeholder-white/60 outline-none transition focus:border-fuchsia-400/40 focus:bg-white/15"
                    />
                    <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-white/60" />
                  </div>
                </div>
              )}

              {useUpload && (
                <div>
                  <label className="mb-1 block text-sm text-white/80">Upload Video (MP4, WebM, dll)</label>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/5 px-4 py-3 hover:bg-white/10">
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          if (objectUrl) URL.revokeObjectURL(objectUrl)
                          const nextUrl = URL.createObjectURL(f)
                          setFile(f)
                          setObjectUrl(nextUrl)
                          // Pre-fill name from filename if empty
                          if (!namaVideo) {
                            const base = f.name.replace(/\.[^/.]+$/, '')
                            setNamaVideo(base)
                          }
                        }}
                      />
                      <Upload className="size-5 text-white/70" />
                      <span className="text-sm text-white/80">Pilih file dari penyimpanan</span>
                    </label>
                    {file && (
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <FileVideo className="size-4 text-white/70" />
                          <span className="truncate max-w-[16rem]">{file.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null)
                            if (objectUrl) URL.revokeObjectURL(objectUrl)
                            setObjectUrl('')
                          }}
                          className="rounded-md p-1 hover:bg-white/10"
                          title="Hapus file"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {statusMsg && (
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">{statusMsg}</div>
              )}
              {uploadProgress !== null && (
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-white/60">
                    <span>Upload file</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-white/10">
                    <div className="h-2 bg-gradient-to-r from-emerald-500 to-lime-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
              {encodeProgress !== null && (
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-white/60">
                    <span>Proses encode</span>
                    <span>{encodeProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-white/10">
                    <div className="h-2 bg-gradient-to-r from-fuchsia-500 to-cyan-500 transition-all" style={{ width: `${encodeProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={encodeHls}
                    onChange={(e) => setEncodeHls(e.target.checked)}
                    className="size-4 rounded border-white/20 bg-transparent text-fuchsia-500 focus:ring-fuchsia-500/40"
                  />
                  Encode HLS (.m3u8)
                </label>
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-fuchsia-500/20 transition hover:opacity-95 disabled:opacity-60">
                  <CheckCircle className="size-4" /> {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>

          {/* Preview */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Preview</h2>
              <p className="text-sm text-white/70">{namaVideo || 'Judul video'}</p>
              <p className="text-xs text-white/50">/{derivedSlug || 'slug-otomatis'}</p>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <video ref={videoRef} controls className="h-full w-full" preload="metadata" />
            </div>
          </div>
        </div>

        {/* List */}
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Daftar Video</h2>
            <button onClick={fetchVideos} className="text-sm text-white/70 hover:text-white">{loadingList ? 'Memuat...' : 'Muat ulang'}</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-white/70">
                <tr>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Link Direct</th>
                  <th className="px-3 py-2">Link Expiring</th>
                  <th className="px-3 py-2">Preview</th>
                  <th className="px-3 py-2">Hapus</th>
                </tr>
              </thead>
              <tbody>
                {videos.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-white/60" colSpan={4}>Belum ada video.</td>
                  </tr>
                )}
                {videos.map((v) => (
                  <tr key={v.id} className="border-t border-white/10">
                    <td className="px-3 py-3">{v.nama_video}</td>
                    <td className="px-3 py-3 text-white/80">/{v.slug}</td>
                    <td className="px-3 py-3">
                      <a href={v.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fuchsia-300 hover:text-fuchsia-200">
                        <Link2 className="size-4" /> Buka
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(api(`/api/videos/${v.id}/link?ttl=3600`))
                            const data = await res.json()
                            if (data.url) {
                              window.open(data.url, '_blank')
                            }
                          } catch (_) {}
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1 text-white/80 hover:bg-white/15"
                      >
                        Buat (1 jam)
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/preview/${v.id}`} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1 text-white/80 hover:bg-white/15">Buka preview</Link>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={async () => {
                          if (!confirm(`Hapus video #${v.id}? Aksi ini tidak bisa dibatalkan.`)) return
                          try {
                            const res = await fetch(api(`/api/videos/${v.id}`), { method: 'DELETE' })
                            if (!res.ok) {
                              const d = await res.json().catch(() => ({}))
                              throw new Error(d.error || `Gagal hapus (${res.status})`)
                            }
                            setStatusMsg(`Video #${v.id} berhasil dihapus.`)
                            fetchVideos()
                          } catch (e) {
                            setStatusMsg(e.message)
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-red-600/80 px-3 py-1 text-white hover:bg-red-600"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
