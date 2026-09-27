export default function AblationComparison({ baselineReport, groundedReport }) {
  if (!baselineReport || !groundedReport) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-bold text-slate-200">Novelty Proof — RAG Ablation Study</h3>
        <span className="text-xs bg-modality-graph/15 border border-modality-graph/30 text-modality-graph px-2 py-0.5 rounded-full">
          Academic Contribution
        </span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        Same fraud scores. Same LLM. The only difference is whether the FATF typology was retrieved first.
        The baseline receives only numbers — watch it hallucinate. DeepSentinel anchors every claim to a regulatory definition.
      </p>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Baseline — ungrounded */}
        <div className="bg-risk-critical/[0.06] border border-risk-critical/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-risk-critical/30 flex items-center gap-2">
            <span className="text-risk-critical text-base">✗</span>
            <div>
              <p className="text-sm font-semibold text-risk-critical">Baseline LLM — No RAG</p>
              <p className="text-xs text-slate-500 mt-0.5">Scores only · No FATF typology · Free-form generation</p>
            </div>
          </div>
          <div className="p-4">
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {baselineReport}
            </pre>
          </div>
          <div className="px-4 py-2.5 border-t border-risk-critical/30 bg-risk-critical/[0.08]">
            <p className="text-xs text-risk-critical">
              ⚠ Claims not traceable to any regulatory source. Not legally admissible.
            </p>
          </div>
        </div>

        {/* DeepSentinel — grounded */}
        <div className="bg-risk-low/[0.06] border border-risk-low/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-risk-low/30 flex items-center gap-2">
            <span className="text-risk-low text-base">✓</span>
            <div>
              <p className="text-sm font-semibold text-risk-low">DeepSentinel — RAG Grounded</p>
              <p className="text-xs text-slate-500 mt-0.5">Scores + FATF typology · Chain-of-evidence constrained</p>
            </div>
          </div>
          <div className="p-4">
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {groundedReport}
            </pre>
          </div>
          <div className="px-4 py-2.5 border-t border-risk-low/30 bg-risk-low/[0.08]">
            <p className="text-xs text-risk-low">
              ✓ Every claim anchored to retrieved FATF typology. Audit-traceable and legally admissible.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
