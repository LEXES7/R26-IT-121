import { useState } from 'react'

export default function ForensicReport({ report, loading }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="bg-sentinel-800 border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-sentinel-700 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold text-slate-200">
          <span className="text-blue-400">📋</span>
          AI Forensic Investigation Report
          <span className="text-xs bg-blue-900/50 border border-blue-700 text-blue-300 px-2 py-0.5 rounded-full">
            RAG-Grounded
          </span>
        </span>
        <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-700">
          {loading ? (
            <div className="flex items-center gap-3 py-6 text-slate-400">
              <span className="animate-spin text-blue-400">⟳</span>
              Generating forensic report via LLM…
            </div>
          ) : report ? (
            <pre className="mt-4 text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed bg-sentinel-900 rounded-lg p-4 border border-slate-700 max-h-[500px] overflow-y-auto">
              {report}
            </pre>
          ) : (
            <p className="mt-4 text-slate-500 text-sm italic">
              No report generated. Configure GEMINI_API_KEY in backend .env to enable LLM reports.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
