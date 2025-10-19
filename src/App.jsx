import { useState } from 'react'
import { Film, Mail, Lock } from 'lucide-react'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const onSubmit = (e) => {
    e.preventDefault()
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black text-white antialiased">
      <div className="absolute inset-0 -z-10">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-6rem] right-[-6rem] h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md animate__animated animate__fadeInUp">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-500 text-white">
                <Film className="size-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">NanimeID Video Management</h1>
                <p className="text-sm text-white/60">Masuk ke gerbang utama</p>
              </div>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 pl-11 text-white placeholder-white/50 outline-none transition focus:border-fuchsia-400/40 focus:bg-white/15"
                  required
                />
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-white/60" />
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kata sandi"
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 pl-11 text-white placeholder-white/50 outline-none transition focus:border-fuchsia-400/40 focus:bg-white/15"
                  required
                />
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-white/60" />
              </div>
              <div className="flex items-center justify-between text-sm text-white/70">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className="size-4 rounded border-white/20 bg-transparent text-fuchsia-500 focus:ring-fuchsia-500/40" />
                  Ingat saya
                </label>
                <a href="#" className="text-fuchsia-300 hover:text-fuchsia-200">Lupa kata sandi?</a>
              </div>
              <button className="w-full rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-500 px-4 py-3 font-medium text-white shadow-lg shadow-fuchsia-500/20 transition hover:opacity-95">
                Masuk
              </button>
            </form>
          </div>
          <p className="mt-6 text-center text-xs text-white/50"> {new Date().getFullYear()} NanimeID</p>
        </div>
      </div>
    </div>
  )
}

export default App
