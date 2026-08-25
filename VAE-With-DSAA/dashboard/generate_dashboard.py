"""Generate a self-contained dashboard.html from the saved results.

Run:  python generate_dashboard.py
Opens: dashboard.html in your browser.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).parent
RESULTS = ROOT / "DeepSentinel-VAE-Results"
R_RESULTS = RESULTS / "DeepSentinel_Results_v2"
R_OUTPUT = RESULTS / "DeepSentinel_Output_v2"
R_DSAA = RESULTS / "DeepSentinel_DSAA_v2"
OUT = ROOT / "dashboard.html"


def load(path: Path) -> dict | list:
    return json.loads(path.read_text())


metrics = [load(p) for p in sorted(R_RESULTS.glob("config_*_metrics.json"))]
stratified_cfg = load(R_RESULTS / "models" / "stratified_config.json")
typologies = load(R_DSAA / "typology_records.json")
dbscan_cfg = load(R_DSAA / "dbscan_config.json")

img_base = "DeepSentinel-VAE-Results"

data = {
    "metrics": metrics,
    "stratified_cfg": stratified_cfg,
    "typologies": typologies,
    "dbscan_cfg": dbscan_cfg,
    "img_paths": {
        "training_history": f"{img_base}/DeepSentinel_Results_v2/training_history.png",
        "stratified_eval": f"{img_base}/DeepSentinel_Results_v2/stratified_vae_evaluation.png",
        "confusion": f"{img_base}/DeepSentinel_Results_v2/confusion_matrices.png",
        "dsaa_dash": f"{img_base}/DeepSentinel_DSAA_v2/dsaa_dashboard.png",
        "typology_radar": f"{img_base}/DeepSentinel_DSAA_v2/typology_radar.png",
        "heatmap_transfer": f"{img_base}/DeepSentinel_Output_v2/feature_heatmap_transfer.png",
        "heatmap_cashout": f"{img_base}/DeepSentinel_Output_v2/feature_heatmap_cashout.png",
        "fraud_by_type": f"{img_base}/DeepSentinel_Output_v2/fraud_by_type.png",
    },
}

DATA_JSON = json.dumps(data, indent=2)

HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>DeepSentinel — VAE + DSAA Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>
  :root{
    --bg:#0b1020; --panel:#111935; --panel2:#16204a; --line:#243068;
    --text:#e6e9f5; --muted:#9aa3c7; --accent:#7c9cff; --green:#10b981;
    --red:#ef4444; --amber:#f59e0b;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:linear-gradient(180deg,#070b1e 0%,#0b1020 100%);color:var(--text);font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}
  a{color:var(--accent)}
  .layout{display:flex;min-height:100vh}
  aside{
    width:240px;flex-shrink:0;background:rgba(16,22,52,0.7);backdrop-filter:blur(8px);
    border-right:1px solid var(--line);padding:1.5rem 1.2rem;position:sticky;top:0;height:100vh;
  }
  aside h1{font-size:1.25rem;margin:0 0 0.25rem;letter-spacing:-0.02em}
  aside .sub{color:var(--muted);font-size:0.82rem;margin-bottom:1.4rem;line-height:1.4}
  nav button{
    display:block;width:100%;text-align:left;background:none;border:none;color:var(--muted);
    padding:0.6rem 0.8rem;border-radius:8px;cursor:pointer;font-size:0.92rem;margin-bottom:0.2rem;
    transition:all 0.15s;font-family:inherit;
  }
  nav button:hover{background:rgba(124,156,255,0.08);color:var(--text)}
  nav button.active{background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;font-weight:600}
  aside .footer{position:absolute;bottom:1.2rem;left:1.2rem;right:1.2rem;color:var(--muted);font-size:0.75rem;line-height:1.5}
  main{flex:1;padding:2rem 2.5rem;max-width:1400px}
  h2{font-size:1.8rem;margin:0 0 0.3rem;letter-spacing:-0.025em}
  h3{font-size:1.1rem;margin:1.5rem 0 0.7rem;color:#cdd4f0}
  .lede{color:var(--muted);margin-bottom:1.5rem;max-width:780px;line-height:1.5}
  .grid{display:grid;gap:1rem}
  .grid-4{grid-template-columns:repeat(4,1fr)}
  .grid-2{grid-template-columns:1fr 1fr}
  .grid-3{grid-template-columns:repeat(3,1fr)}
  @media(max-width:1100px){.grid-4{grid-template-columns:repeat(2,1fr)}.grid-2,.grid-3{grid-template-columns:1fr}}
  .card{
    background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1.2rem 1.3rem;
    box-shadow:0 4px 14px rgba(0,0,0,0.2);
  }
  .stat{background:linear-gradient(135deg,#1e3a8a,#312e81);border:none}
  .stat .label{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85;color:#cfd5f5}
  .stat .value{font-size:2rem;font-weight:700;margin-top:0.25rem;color:#fff}
  .stat .sub{font-size:0.78rem;opacity:0.75;margin-top:0.3rem;color:#cfd5f5}
  table{width:100%;border-collapse:collapse;font-size:0.88rem}
  th,td{padding:0.55rem 0.7rem;text-align:left;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600;text-transform:uppercase;font-size:0.72rem;letter-spacing:0.05em}
  tr:hover td{background:rgba(124,156,255,0.05)}
  .num{font-variant-numeric:tabular-nums;text-align:right}
  img.result{width:100%;border-radius:8px;border:1px solid var(--line);margin-top:0.5rem;background:#fff}
  .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:0.72rem;font-weight:600}
  .pill-g{background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3)}
  .pill-a{background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3)}
  .pill-r{background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3)}
  .typology-row{display:grid;grid-template-columns:200px 1fr;gap:1.2rem;padding:1rem 0;border-bottom:1px solid var(--line)}
  .typology-row:last-child{border-bottom:none}
  .typology-label{font-weight:700;color:#fff;margin:0.2rem 0}
  .typology-desc{color:var(--muted);font-size:0.9rem;line-height:1.5}
  .typology-dims{color:#7c9cff;font-size:0.78rem;margin-top:0.4rem}
  .bar-bg{background:var(--panel2);height:6px;border-radius:3px;margin-top:0.5rem;overflow:hidden}
  .bar-fg{height:100%;background:linear-gradient(90deg,#3b82f6,#10b981);border-radius:3px}
  .section{display:none}
  .section.active{display:block;animation:fadein 0.3s ease}
  @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .controls{display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem}
  .controls label{color:var(--muted);font-size:0.85rem}
  select,input[type=range]{
    background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;
    padding:0.4rem 0.6rem;font-family:inherit;font-size:0.9rem;
  }
  input[type=range]{padding:0;width:240px;accent-color:var(--accent)}
  .verdict{padding:1.5rem;border-radius:12px;text-align:center;color:#fff;margin-bottom:1rem}
  .verdict.fraud{background:linear-gradient(135deg,#dc2626,#7f1d1d)}
  .verdict.ok{background:linear-gradient(135deg,#16a34a,#14532d)}
  .verdict .vlabel{font-size:0.8rem;opacity:0.9}
  .verdict .vmain{font-size:1.6rem;font-weight:700;margin-top:0.3rem}
  .verdict .vsub{font-size:0.85rem;opacity:0.85;margin-top:0.4rem}
  .slider-row{display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.7rem}
  .slider-row .top{display:flex;justify-content:space-between;font-size:0.85rem}
  .slider-row .top .v{color:var(--accent);font-weight:600}
  .quote{border-left:3px solid var(--green);background:rgba(16,185,129,0.08);padding:0.9rem 1.1rem;border-radius:6px}
</style>
</head>
<body>
<div class="layout">
  <aside>
    <h1>🛡️ DeepSentinel</h1>
    <div class="sub">Stratified VAE + DSAA framework for fraud detection on PaySim.</div>
    <nav>
      <button class="nav-btn active" data-target="overview">Overview</button>
      <button class="nav-btn" data-target="comparison">Model Comparison</button>
      <button class="nav-btn" data-target="features">Feature Explorer</button>
      <button class="nav-btn" data-target="dsaa">DSAA Typologies</button>
      <button class="nav-btn" data-target="scoring">Live Scoring Demo</button>
    </nav>
    <div class="footer">
      <b>Team R26-IT-121</b><br/>
      Wijesinghe · Ewaduge<br/>Pathirana · Vidanaarachchi
    </div>
  </aside>

  <main>
    <!-- OVERVIEW -->
    <section id="overview" class="section active">
      <h2>Fraud Detection with Stratified VAE + DSAA</h2>
      <p class="lede">A two-stage anomaly-detection framework: per-transaction-type Variational Autoencoders score every payment, and the DSAA post-processor clusters flagged frauds into named typologies aligned with FATF money-laundering categories.</p>
      <div class="grid grid-4" id="overview-stats"></div>
      <div class="grid grid-2" style="margin-top:1.5rem">
        <div class="card">
          <h3>Pipeline</h3>
          <ol style="color:var(--muted);line-height:1.7;padding-left:1.2rem">
            <li><b style="color:var(--text)">Feature engineering</b> — 13 hand-crafted signals (F1–F13).</li>
            <li><b style="color:var(--text)">Stratified VAEs</b> — one VAE per type (TRANSFER, CASH_OUT, PAYMENT).</li>
            <li><b style="color:var(--text)">Hybrid score</b> — α·recon + β·KL + γ·density, per-type thresholds.</li>
            <li><b style="color:var(--text)">DSAA</b> — fingerprint frauds → DBSCAN → typology labelling.</li>
          </ol>
          <img class="result" id="img-train" alt="training history"/>
        </div>
        <div class="card">
          <h3>Headline result</h3>
          <div class="quote" id="headline"></div>
          <img class="result" id="img-strat" alt="stratified evaluation" style="margin-top:1rem"/>
        </div>
      </div>
    </section>

    <!-- COMPARISON -->
    <section id="comparison" class="section">
      <h2>Model Comparison</h2>
      <p class="lede">Four configurations evaluated on the same held-out PaySim test split.</p>
      <div class="card"><div id="metrics-table"></div></div>
      <div class="grid grid-2" style="margin-top:1rem">
        <div class="card"><h3>Headline metrics</h3><div id="metrics-bars" style="height:380px"></div></div>
        <div class="card"><h3>Recall vs FPR</h3><div id="metrics-scatter" style="height:380px"></div></div>
      </div>
      <div class="card" style="margin-top:1rem"><h3>Confusion matrices</h3><img class="result" id="img-cm" alt="confusion matrices"/></div>
    </section>

    <!-- FEATURES -->
    <section id="features" class="section">
      <h2>Feature Explorer</h2>
      <p class="lede">Saved feature heatmaps and per-type fraud distribution. (Full CSVs are too large for a static page — use the Streamlit app for live exploration.)</p>
      <div class="grid grid-2">
        <div class="card"><h3>Fraud by transaction type</h3><img class="result" id="img-fbt"/></div>
        <div class="card"><h3>TRANSFER feature heatmap</h3><img class="result" id="img-ht"/></div>
      </div>
      <div class="card" style="margin-top:1rem"><h3>CASH_OUT feature heatmap</h3><img class="result" id="img-hc"/></div>
    </section>

    <!-- DSAA -->
    <section id="dsaa" class="section">
      <h2>DSAA — Discovered Fraud Typologies</h2>
      <p class="lede">Each flagged fraud is fingerprinted, clustered with DBSCAN, then labelled against FATF money-laundering categories.</p>
      <div class="grid grid-4" id="dsaa-stats"></div>
      <div class="grid grid-2" style="margin-top:1rem">
        <div class="card"><h3>DSAA dashboard</h3><img class="result" id="img-dsaa"/></div>
        <div class="card"><h3>Typology radar</h3><img class="result" id="img-radar"/></div>
      </div>
      <div class="card" style="margin-top:1rem"><h3>Typology cards</h3><div id="typology-list"></div></div>
    </section>

    <!-- SCORING -->
    <section id="scoring" class="section">
      <h2>Live Scoring Demo</h2>
      <p class="lede">Tune a synthetic transaction and watch the hybrid anomaly score against the trained per-type threshold. Score = α·recon + β·KL + γ·density.</p>
      <div class="card">
        <div class="controls">
          <label>Transaction type
            <select id="tx-type"></select>
          </label>
        </div>
        <div class="grid grid-3">
          <div class="slider-row">
            <div class="top"><span>Reconstruction z-score</span><span class="v" id="v-recon">0.0</span></div>
            <input type="range" id="s-recon" min="-1" max="8" step="0.1" value="0"/>
          </div>
          <div class="slider-row">
            <div class="top"><span>KL z-score</span><span class="v" id="v-kl">0.0</span></div>
            <input type="range" id="s-kl" min="-2" max="8" step="0.1" value="0"/>
          </div>
          <div class="slider-row">
            <div class="top"><span>Density z-score</span><span class="v" id="v-dens">0.0</span></div>
            <input type="range" id="s-dens" min="-2" max="8" step="0.1" value="0"/>
          </div>
        </div>
        <div class="grid grid-2" style="margin-top:1rem">
          <div>
            <div id="verdict"></div>
            <div class="card" style="background:var(--panel2)" id="weights"></div>
          </div>
          <div class="card" style="background:var(--panel2)"><div id="gauge" style="height:280px"></div></div>
        </div>
        <div class="card" style="background:var(--panel2);margin-top:1rem"><div id="decomp" style="height:280px"></div></div>
      </div>
    </section>
  </main>
</div>

<script id="data" type="application/json">__DATA__</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);
const PLOT_LAYOUT = {paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{color:'#cdd4f0'},margin:{t:30,r:20,b:50,l:60}};

// nav
document.querySelectorAll('.nav-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById(b.dataset.target).classList.add('active');
  });
});

// images
const P = DATA.img_paths;
document.getElementById('img-train').src = P.training_history;
document.getElementById('img-strat').src = P.stratified_eval;
document.getElementById('img-cm').src = P.confusion;
document.getElementById('img-dsaa').src = P.dsaa_dash;
document.getElementById('img-radar').src = P.typology_radar;
document.getElementById('img-fbt').src = P.fraud_by_type;
document.getElementById('img-ht').src = P.heatmap_transfer;
document.getElementById('img-hc').src = P.heatmap_cashout;

// overview stats
const metrics = DATA.metrics;
const best = metrics.find(m=>m.config.startsWith('B'));
const strat = metrics.find(m=>m.config.startsWith('D'));
const baseline = metrics.find(m=>m.config.startsWith('A'));
const stats = [
  ['Best F1 (Transfer)', best.f1_score.toFixed(3), 'AUC = '+best.auc_roc.toFixed(3)],
  ['Best Recall', (best.recall*100).toFixed(1)+'%', `${best.tp} / ${best.tp+best.fn} frauds caught`],
  ['Stratified F1', strat.f1_score.toFixed(3), 'AUC = '+strat.auc_roc.toFixed(3)],
  ['Discovered Typologies', DATA.typologies.length, 'DBSCAN on fingerprints'],
];
document.getElementById('overview-stats').innerHTML = stats.map(s=>
  `<div class="card stat"><div class="label">${s[0]}</div><div class="value">${s[1]}</div><div class="sub">${s[2]}</div></div>`
).join('');

document.getElementById('headline').innerHTML =
  `The <b>TRANSFER-specific VAE</b> reaches <b>${(best.recall*100).toFixed(1)}% recall</b>
   at <b>FPR = ${(best.fpr*100).toFixed(2)}%</b> — a ${best.auc_roc.toFixed(2)} AUC,
   dramatically outperforming the global baseline (F1 ${baseline.f1_score.toFixed(3)} → ${best.f1_score.toFixed(3)}).`;

// metrics table
const cols = ['config','precision','recall','f1_score','auc_roc','fpr','tp','fp','fn'];
let html = '<table><thead><tr>'+cols.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>';
metrics.forEach(m=>{
  html += '<tr>'+cols.map(c=>{
    let v=m[c];
    if(typeof v==='number') v = (c==='tp'||c==='fp'||c==='fn') ? v.toLocaleString() : v.toFixed(4);
    return `<td class="${typeof m[c]==='number'?'num':''}">${v}</td>`;
  }).join('')+'</tr>';
});
html += '</tbody></table>';
document.getElementById('metrics-table').innerHTML = html;

// metrics bar chart
const configsShort = metrics.map(m=>m.config[0]);
const metricNames = ['precision','recall','f1_score','auc_roc'];
const barTraces = configsShort.map((c,i)=>({
  name:'Config '+c, type:'bar',
  x:metricNames, y:metricNames.map(n=>metrics[i][n]),
  text:metricNames.map(n=>metrics[i][n].toFixed(3)), textposition:'outside',
}));
Plotly.newPlot('metrics-bars', barTraces, {...PLOT_LAYOUT, barmode:'group', yaxis:{range:[0,1.15]}}, {displayModeBar:false});

// scatter
Plotly.newPlot('metrics-scatter',[{
  x:metrics.map(m=>m.fpr), y:metrics.map(m=>m.recall),
  text:configsShort, mode:'markers+text', textposition:'middle center',
  textfont:{color:'#fff', size:14, family:'Arial Black'},
  marker:{
    size:metrics.map(m=>20+m.f1_score*60),
    color:metrics.map(m=>m.auc_roc), colorscale:'Viridis', showscale:true,
    colorbar:{title:'AUC'}, line:{color:'#fff',width:1},
  },
}], {...PLOT_LAYOUT, xaxis:{title:'FPR'}, yaxis:{title:'Recall'}}, {displayModeBar:false});

// DSAA stats
const cfg = DATA.dbscan_cfg;
const dsaaStats = [
  ['Clusters', cfg.n_clusters_discovered, 'DBSCAN'],
  ['Frauds analysed', cfg.n_fraud_analysed.toLocaleString(), ''],
  ['Silhouette', cfg.silhouette_score.toFixed(3), 'Higher = tighter'],
  ['Noise points', cfg.n_noise_points.toLocaleString(), 'eps = '+cfg.eps.toFixed(3)],
];
document.getElementById('dsaa-stats').innerHTML = dsaaStats.map(s=>
  `<div class="card stat"><div class="label">${s[0]}</div><div class="value">${s[1]}</div><div class="sub">${s[2]}</div></div>`
).join('');

// typology cards
const typs = [...DATA.typologies].sort((a,b)=>b.cluster_size-a.cluster_size);
document.getElementById('typology-list').innerHTML = typs.map(t=>{
  const pill = t.cluster_size>500 ? 'pill-g' : (t.cluster_size>100 ? 'pill-a' : 'pill-r');
  const dims = t.top_dims.slice(0,3).map(d=>d[0]).join(', ');
  const tpct = (t.transfer_pct||0);
  return `<div class="typology-row">
    <div>
      <div style="color:var(--muted);font-size:0.85rem">#${t.cluster_id}</div>
      <div class="typology-label">${t.typology_label}</div>
      <span class="pill ${pill}">${t.cluster_size.toLocaleString()} txns</span>
    </div>
    <div>
      <div class="typology-desc">${t.typology_description}</div>
      <div class="typology-dims">Top dims: ${dims}</div>
      <div style="color:var(--muted);font-size:0.78rem;margin-top:0.6rem">TRANSFER share: ${tpct.toFixed(0)}%</div>
      <div class="bar-bg"><div class="bar-fg" style="width:${tpct}%"></div></div>
    </div>
  </div>`;
}).join('');

// scoring
const sCfg = DATA.stratified_cfg;
const txSelect = document.getElementById('tx-type');
Object.keys(sCfg).forEach(t=>{
  const o = document.createElement('option'); o.value=t; o.textContent=t; txSelect.appendChild(o);
});

function updateScore(){
  const t = txSelect.value;
  const p = sCfg[t];
  const zr = parseFloat(document.getElementById('s-recon').value);
  const zk = parseFloat(document.getElementById('s-kl').value);
  const zd = parseFloat(document.getElementById('s-dens').value);
  document.getElementById('v-recon').textContent = zr.toFixed(1);
  document.getElementById('v-kl').textContent = zk.toFixed(1);
  document.getElementById('v-dens').textContent = zd.toFixed(1);

  const score = p.alpha*zr + p.beta*zk + p.gamma*zd;
  const thr = p.threshold;
  const isFraud = score >= thr;
  const margin = score - thr;

  document.getElementById('verdict').innerHTML =
    `<div class="verdict ${isFraud?'fraud':'ok'}">
      <div class="vlabel">VERDICT</div>
      <div class="vmain">${isFraud?'🚨 FLAGGED AS FRAUD':'✅ NORMAL'}</div>
      <div class="vsub">Score = ${score.toFixed(3)} | Threshold = ${thr.toFixed(3)} | Margin = ${margin>=0?'+':''}${margin.toFixed(3)}</div>
    </div>`;

  document.getElementById('weights').innerHTML =
    `<div style="font-size:0.85rem;color:var(--muted)">Hybrid weights</div>
     <div style="margin-top:0.5rem">α (recon) = <b>${p.alpha}</b> &nbsp; β (KL) = <b>${p.beta}</b> &nbsp; γ (density) = <b>${p.gamma}</b></div>
     <div style="margin-top:0.6rem;color:var(--muted);font-size:0.8rem">Threshold for ${t}: <b style="color:var(--text)">${thr.toFixed(3)}</b></div>`;

  Plotly.newPlot('gauge', [{
    type:'indicator', mode:'gauge+number+delta', value:score,
    delta:{reference:thr, increasing:{color:'#ef4444'}, decreasing:{color:'#10b981'}},
    gauge:{
      axis:{range:[-2, Math.max(8, thr+4)], tickcolor:'#cdd4f0'},
      bar:{color: isFraud?'#ef4444':'#10b981'},
      bgcolor:'rgba(0,0,0,0)',
      steps:[
        {range:[-2,thr], color:'rgba(16,185,129,0.2)'},
        {range:[thr, Math.max(8,thr+4)], color:'rgba(239,68,68,0.2)'},
      ],
      threshold:{line:{color:'#fff',width:3}, value:thr},
    },
    title:{text:'Anomaly Score — '+t},
  }], {...PLOT_LAYOUT, margin:{t:50,b:10,l:30,r:30}}, {displayModeBar:false});

  Plotly.newPlot('decomp', [{
    type:'bar',
    x:['α · recon', 'β · KL', 'γ · density'],
    y:[p.alpha*zr, p.beta*zk, p.gamma*zd],
    text:[(p.alpha*zr).toFixed(3),(p.beta*zk).toFixed(3),(p.gamma*zd).toFixed(3)],
    textposition:'outside',
    marker:{color:[p.alpha*zr,p.beta*zk,p.gamma*zd], colorscale:'RdYlGn', reversescale:true},
  }], {...PLOT_LAYOUT, title:'Score decomposition'}, {displayModeBar:false});
}

['tx-type','s-recon','s-kl','s-dens'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updateScore);
});
updateScore();
</script>
</body>
</html>
"""

html_out = HTML.replace("__DATA__", DATA_JSON)
OUT.write_text(html_out, encoding="utf-8")
print(f"Wrote {OUT}  ({OUT.stat().st_size/1024:.1f} KB)")
print(f"Open in browser:  file:///{OUT.as_posix()}")
