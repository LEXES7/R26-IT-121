export default function AblationComparison({ baselineReport, groundedReport }) {
  if (!baselineReport || !groundedReport) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-bold text-white">Novelty Proof — RAG Ablation Study</h3>
        <span className="text-xs bg-purple-900/40 border border-purple-700/50 text-purple-300 px-2 py-0.5 rounded-full">
          Academic Contribution
        </span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        Same fraud scores. Same LLM. The only difference is whether the FATF typology was retrieved first.
        The baseline receives only numbers — watch it hallucinate. DeepSentinel anchors every claim to a regulatory definition.
      </p>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Baseline — ungrounded */}
        <div className="bg-red-950/20 border border-red-800/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-red-800/40 flex items-center gap-2">
            <span className="text-red-400 text-base">✗</span>
            <div>
              <p className="text-sm font-semibold text-red-300">Baseline LLM — No RAG</p>
              <p className="text-xs text-red-700 mt-0.5">Scores only · No FATF typology · Free-form generation</p>
            </div>
          </div>
          <div className="p-4">
            <pre className="text-xs text-red-200/70 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {baselineReport}
            </pre>
          </div>
          <div className="px-4 py-2.5 border-t border-red-800/40 bg-red-950/30">
            <p className="text-xs text-red-600">
              ⚠ Claims not traceable to any regulatory source. Not legally admissible.
            </p>
          </div>
        </div>

        {/* DeepSentinel — grounded */}
        <div className="bg-green-950/20 border border-green-800/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-green-800/40 flex items-center gap-2">
            <span className="text-green-400 text-base">✓</span>
            <div>
              <p className="text-sm font-semibold text-green-300">DeepSentinel — RAG Grounded</p>
              <p className="text-xs text-green-700 mt-0.5">Scores + FATF typology · Chain-of-evidence constrained</p>
            </div>
          </div>
          <div className="p-4">
            <pre className="text-xs text-green-200/70 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {groundedReport}
            </pre>
          </div>
          <div className="px-4 py-2.5 border-t border-green-800/40 bg-green-950/30">
            <p className="text-xs text-green-600">
              ✓ Every claim anchored to retrieved FATF typology. Audit-traceable and legally admissible.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
