const NODE_W = 140
const NODE_H = 44
const PADDING = 16

function Box({ x, y, label, sublabel, color = 'blue', small = false }) {
  const colors = {
    /* Hex rather than tokens: this is an SVG diagram, and the boxes need a
       fill/stroke/label triad that stays legible on both grounds. */
    blue:      { fill: '#0d3b37', stroke: '#0f9b8e', text: '#5eead4' },
    graphTint: { fill: '#0d3b37', stroke: '#0f9b8e', text: '#5eead4' },
    rose:      { fill: '#3d1020', stroke: '#dc2649', text: '#fda4af' },
    amber:     { fill: '#3a2606', stroke: '#c2740a', text: '#fcd34d' },
    green:  { fill: '#14352a', stroke: '#22c55e', text: '#86efac' },
    orange: { fill: '#3d1f0a', stroke: '#f97316', text: '#fdba74' },
    slate:  { fill: '#1e293b', stroke: '#475569', text: '#94a3b8' },
    red:    { fill: '#3b0f0f', stroke: '#ef4444', text: '#fca5a5' },
  }
  const c = colors[color]
  const w = small ? 120 : NODE_W
  const h = small ? 36 : NODE_H
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8}
        fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + (sublabel ? h / 2 - 4 : h / 2 + 5)}
        textAnchor="middle" fill={c.text} fontSize={small ? 11 : 12} fontWeight="600"
        fontFamily="system-ui, sans-serif">
        {label}
      </text>
      {sublabel && (
        <text x={x + w / 2} y={y + h / 2 + 10}
          textAnchor="middle" fill="#64748b" fontSize={9}
          fontFamily="system-ui, sans-serif">
          {sublabel}
        </text>
      )}
    </g>
  )
}

function Arrow({ x1, y1, x2, y2, color = '#475569' }) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / len
  const uy = dy / len
  const ex = x2 - ux * 8
  const ey = y2 - uy * 8
  return (
    <g>
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" />
      <polygon
        points={`${x2},${y2} ${ex - uy * 4},${ey + ux * 4} ${ex + uy * 4},${ey - ux * 4}`}
        fill={color}
      />
    </g>
  )
}

export default function ArchitectureDiagram() {
  const W = 820
  const H = 380

  // Column X centers
  const colInput = 60
  const colModels = 220
  const colFusion = 430
  const colRAG = 580
  const colLLM = 700
  const colDash = 820 - NODE_W / 2 - 10

  // Row Y centers (top of box)
  const rowTop = 30
  const rowMid = 168
  const rowBot = 306

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-4xl mx-auto"
        style={{ minWidth: 640 }}
      >
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" rx={12} />

        {/* Section labels */}
        <text x={colInput + NODE_W / 2} y={16} textAnchor="middle" fill="#475569" fontSize={9} fontFamily="system-ui">INPUT</text>
        <text x={colModels + NODE_W / 2} y={16} textAnchor="middle" fill="#475569" fontSize={9} fontFamily="system-ui">UPSTREAM MODELS</text>
        <text x={colFusion + NODE_W / 2} y={16} textAnchor="middle" fill="#475569" fontSize={9} fontFamily="system-ui">FUSION</text>
        <text x={colLLM + NODE_W / 2 - 10} y={16} textAnchor="middle" fill="#475569" fontSize={9} fontFamily="system-ui">LLM LAYER</text>

        {/* INPUT */}
        <Box x={colInput} y={rowMid} label="Transaction" sublabel="PaySim / Real" color="slate" />

        {/* Upstream models */}
        <Box x={colModels} y={rowTop}  label="GNN / GraphSAGE" sublabel="Network topology" color="graphTint" />
        <Box x={colModels} y={rowMid}  label="VAE / DSAA"       sublabel="Member 1 · behavioral" color="orange" />
        <Box x={colModels} y={rowBot}  label="TCN / TSCFD"      sublabel="Member 3 · temporal" color="blue" />

        {/* Arrows: input → models */}
        <Arrow x1={colInput + NODE_W} y1={rowMid + NODE_H / 2} x2={colModels} y2={rowTop + NODE_H / 2} color="#6366f1" />
        <Arrow x1={colInput + NODE_W} y1={rowMid + NODE_H / 2} x2={colModels} y2={rowMid + NODE_H / 2} color="#6366f1" />
        <Arrow x1={colInput + NODE_W} y1={rowMid + NODE_H / 2} x2={colModels} y2={rowBot + NODE_H / 2} color="#6366f1" />

        {/* Fusion Engine */}
        <Box x={colFusion} y={rowMid - 10} label="Meta-Classifier" sublabel="Logistic Regression" color="green" />
        <text x={colFusion + NODE_W / 2} y={rowMid + NODE_H + 10} textAnchor="middle" fill="#22c55e" fontSize={9} fontFamily="monospace">Fraud Confidence Score</text>

        {/* Arrows: models → fusion */}
        <Arrow x1={colModels + NODE_W} y1={rowTop + NODE_H / 2}  x2={colFusion} y2={rowMid} color="var(--tw-modality-graph, #0f9b8e)" />
        <Arrow x1={colModels + NODE_W} y1={rowMid + NODE_H / 2}  x2={colFusion} y2={rowMid + NODE_H / 2} color="#f97316" />
        <Arrow x1={colModels + NODE_W} y1={rowBot + NODE_H / 2}  x2={colFusion} y2={rowMid + NODE_H} color="#0f9b8e" />

        {/* RAG */}
        <Box x={colRAG} y={rowTop}   label="ChromaDB" sublabel="FATF Typologies" color="slate" small />
        <Box x={colRAG} y={rowMid - 10} label="RAG Retriever" sublabel="cosine similarity" color="blue" small />

        {/* Arrows: fusion → RAG */}
        <Arrow x1={colFusion + NODE_W} y1={rowMid} x2={colRAG} y2={rowMid - 10 + 18} color="#22c55e" />
        <Arrow x1={colRAG + 60} y1={rowTop + 36} x2={colRAG + 60} y2={rowMid - 10} color="#475569" />

        {/* LLM */}
        <Box x={colLLM - 10} y={rowMid - 10} label="Gemini / Llama3" sublabel="forensic reporter" color="red" small />

        {/* Arrow: RAG → LLM */}
        <Arrow x1={colRAG + 120} y1={rowMid} x2={colLLM - 10} y2={rowMid} color="#0f9b8e" />

        {/* Dashboard */}
        <Box x={W - NODE_W - PADDING} y={rowTop}  label="Gauge Charts"    sublabel="per-modality" color="blue" small />
        <Box x={W - NODE_W - PADDING} y={rowMid - 10} label="Forensic Report" sublabel="RAG-grounded" color="red" small />
        <Box x={W - NODE_W - PADDING} y={rowBot}  label="FATF Typology"   sublabel="matched" color="slate" small />

        {/* Arrow: LLM → dashboard */}
        <Arrow x1={colLLM + 110} y1={rowMid} x2={W - NODE_W - PADDING} y2={rowMid} color="#ef4444" />
        <Arrow x1={colFusion + NODE_W / 2} y1={rowMid - 10 + NODE_H} x2={W - NODE_W - PADDING + 60} y2={rowTop + 36} color="#22c55e" />
        <Arrow x1={colRAG + 60} y1={rowMid + 36} x2={W - NODE_W - PADDING + 60} y2={rowBot} color="#475569" />

        {/* Member 4 bracket */}
        <rect x={colFusion - 4} y={22} width={W - colFusion + 4 - PADDING + 6} height={H - 32}
          fill="none" stroke="#1e3a5f" strokeWidth={1} strokeDasharray="6 3" rx={6} />
        <text x={colFusion + 4} y={H - 8} fill="#1e40af" fontSize={9} fontFamily="system-ui">
        </text>
      </svg>
    </div>
  )
}
