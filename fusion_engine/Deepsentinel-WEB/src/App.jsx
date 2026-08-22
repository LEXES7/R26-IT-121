import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Analyzer from './pages/Analyzer'
import Settings from './pages/Settings'
import About from './pages/About'
import FAQ from './pages/FAQ'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#06091a]">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/analyzer" element={<Analyzer />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<FAQ />} />
          </Routes>
        </main>

        <footer className="border-t border-white/[0.06] mt-16">
          <div className="max-w-6xl mx-auto px-6 py-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">

              {/* Brand */}
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs">
                    DS
                  </div>
                  <span className="font-semibold text-white">DeepSentinel</span>
                </div>
                <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
                  Multi-Modal AI Platform for Explainable Financial Fraud Detection.
                  SLIIT Final Year Research Project 2026.
                </p>
              </div>

              {/* Links */}
              <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-slate-600">
                <div className="space-y-2">
                  <p className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Platform</p>
                  <div className="space-y-1.5">
                    <a href="/" className="block hover:text-slate-400 transition-colors">Overview</a>
                    <a href="/analyzer" className="block hover:text-slate-400 transition-colors">Analyzer</a>
                    <a href="/faq" className="block hover:text-slate-400 transition-colors">FAQ</a>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Developers</p>
                  <div className="space-y-1.5">
                    <a href="https://deepsent-api-production.up.railway.app/docs" target="_blank" rel="noreferrer" className="block hover:text-slate-400 transition-colors">API Docs ↗</a>
                    <a href="https://deepsent-api-production.up.railway.app/health" target="_blank" rel="noreferrer" className="block hover:text-slate-400 transition-colors">API Status ↗</a>
                    <a href="https://github.com/R26-IT-121" target="_blank" rel="noreferrer" className="block hover:text-slate-400 transition-colors">GitHub ↗</a>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Research</p>
                  <div className="space-y-1.5">
                    <a href="/about" className="block hover:text-slate-400 transition-colors">The Team</a>
                    <span className="block text-slate-700">FATF Typologies</span>
                    <span className="block text-slate-700">SDG 16 · SDG 9</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-700">
              <p>© 2026 DeepSentinel · SLIIT · All rights reserved.</p>
              <p>Built with FastAPI · ChromaDB · Gemini · React</p>
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}
