"""DeepSentinel — VAE + DSAA results dashboard.

Run:  streamlit run streamlit_app.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

ROOT = Path(__file__).parent
RESULTS = ROOT / "DeepSentinel-VAE-Results"
R_RESULTS = RESULTS / "DeepSentinel_Results_v2"
R_OUTPUT = RESULTS / "DeepSentinel_Output_v2"
R_DSAA = RESULTS / "DeepSentinel_DSAA_v2"

st.set_page_config(
    page_title="DeepSentinel — VAE + DSAA",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------- styling ----------
st.markdown(
    """
    <style>
      .main .block-container {padding-top: 1.5rem; padding-bottom: 2rem; max-width: 1400px;}
      h1, h2, h3 {letter-spacing: -0.02em;}
      .metric-card {
        background: linear-gradient(135deg, #1e3a8a 0%, #312e81 100%);
        padding: 1.2rem 1.4rem; border-radius: 12px; color: white;
        box-shadow: 0 4px 14px rgba(0,0,0,0.15);
      }
      .metric-card .label {font-size: 0.78rem; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.08em;}
      .metric-card .value {font-size: 2rem; font-weight: 700; margin-top: 0.25rem;}
      .metric-card .sub {font-size: 0.8rem; opacity: 0.75; margin-top: 0.3rem;}
      .pill {display:inline-block; padding:2px 10px; border-radius:999px; font-size:0.75rem; font-weight:600;}
      .pill-green {background:#dcfce7; color:#166534;}
      .pill-amber {background:#fef3c7; color:#92400e;}
      .pill-red   {background:#fee2e2; color:#991b1b;}
    </style>
    """,
    unsafe_allow_html=True,
)


# ---------- data loaders ----------
@st.cache_data
def load_metrics() -> pd.DataFrame:
    rows = []
    for path in sorted(R_RESULTS.glob("config_*_metrics.json")):
        d = json.loads(path.read_text())
        d["_file"] = path.name
        rows.append(d)
    return pd.DataFrame(rows)


@st.cache_data
def load_json(path: Path) -> dict:
    return json.loads(Path(path).read_text())


@st.cache_data
def load_features(tx_type: str, n: int = 20000) -> pd.DataFrame:
    path = R_OUTPUT / f"{tx_type}_all_features.csv"
    df = pd.read_csv(path)
    if len(df) > n:
        fraud = df[df["isFraud"] == 1]
        normal = df[df["isFraud"] == 0].sample(min(n - len(fraud), len(df[df["isFraud"] == 0])), random_state=0)
        df = pd.concat([fraud, normal]).sample(frac=1, random_state=0).reset_index(drop=True)
    return df


def metric_card(label: str, value: str, sub: str = "") -> None:
    st.markdown(
        f"<div class='metric-card'><div class='label'>{label}</div>"
        f"<div class='value'>{value}</div><div class='sub'>{sub}</div></div>",
        unsafe_allow_html=True,
    )


# ---------- sidebar ----------
with st.sidebar:
    st.markdown("## 🛡️ DeepSentinel")
    st.caption("Stratified VAE + DSAA framework for fraud detection on PaySim transactions.")
    section = st.radio(
        "Navigate",
        ["Overview", "Model Comparison", "Feature Explorer", "DSAA Typologies", "Live Scoring Demo"],
        label_visibility="collapsed",
    )
    st.divider()
    st.markdown("**Team — R26-IT-121**")
    st.caption("Wijesinghe · Ewaduge · Pathirana · Vidanaarachchi")
    st.divider()
    st.caption(f"Results dir: `{R_RESULTS.relative_to(ROOT)}`")


metrics_df = load_metrics()


# ===================================================================
# OVERVIEW
# ===================================================================
if section == "Overview":
    st.title("Fraud Detection with Stratified VAE + DSAA")
    st.markdown(
        "A two-stage anomaly-detection framework: per-transaction-type Variational Autoencoders "
        "score every payment, and the **DSAA** post-processor clusters flagged frauds into named typologies "
        "aligned with FATF money-laundering categories."
    )

    best = metrics_df[metrics_df["config"].str.startswith("B")].iloc[0]
    stratified = metrics_df[metrics_df["config"].str.startswith("D")].iloc[0]

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        metric_card("Best F1 (Transfer VAE)", f"{best['f1_score']:.3f}", f"AUC = {best['auc_roc']:.3f}")
    with c2:
        metric_card("Best Recall", f"{best['recall']*100:.1f}%", f"{int(best['tp'])} / {int(best['tp']+best['fn'])} frauds caught")
    with c3:
        metric_card("Stratified Ensemble F1", f"{stratified['f1_score']:.3f}", f"AUC = {stratified['auc_roc']:.3f}")
    with c4:
        try:
            n_typ = len(load_json(R_DSAA / "typology_records.json"))
        except Exception:
            n_typ = 0
        metric_card("Discovered Typologies", str(n_typ), "DBSCAN on fraud fingerprints")

    st.divider()

    left, right = st.columns([1.1, 1])
    with left:
        st.subheader("Pipeline")
        st.markdown(
            """
            1. **Feature engineering** — 13 hand-crafted signals (`F1`–`F13`) per transaction.
            2. **Stratified VAEs** — one VAE per transaction type (`TRANSFER`, `CASH_OUT`, `PAYMENT`).
            3. **Hybrid anomaly score** — `α·recon + β·KL + γ·density` with per-type thresholds.
            4. **DSAA** — fingerprint flagged frauds → DBSCAN clustering → typology labelling
               (e.g. *MULE_NETWORK_FRESH*, *STRUCTURED_LARGE*).
            """
        )
        try:
            st.image(str(R_RESULTS / "training_history.png"), caption="VAE training history", use_container_width=True)
        except Exception:
            st.info("training_history.png not found")

    with right:
        st.subheader("Headline result")
        st.markdown(
            f"""
            <div style='padding:1rem 1.2rem;border-left:4px solid #10b981;background:#f0fdf4;border-radius:6px;'>
              The <b>TRANSFER-specific VAE</b> reaches <b>{best['recall']*100:.1f}% recall</b>
              at <b>FPR = {best['fpr']*100:.2f}%</b> — a {best['auc_roc']:.2f} AUC,
              dramatically outperforming the global baseline
              (F1 {metrics_df.iloc[0]['f1_score']:.3f} → {best['f1_score']:.3f}).
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(" ")
        try:
            st.image(str(R_RESULTS / "stratified_vae_evaluation.png"), caption="Stratified evaluation", use_container_width=True)
        except Exception:
            pass


# ===================================================================
# MODEL COMPARISON
# ===================================================================
elif section == "Model Comparison":
    st.title("Model Comparison")
    st.caption("Four configurations evaluated on the same held-out PaySim test split.")

    display = metrics_df[["config", "precision", "recall", "f1_score", "auc_roc", "fpr", "tp", "fp", "fn"]].copy()
    for col in ["precision", "recall", "f1_score", "auc_roc", "fpr"]:
        display[col] = display[col].round(4)
    st.dataframe(display, use_container_width=True, hide_index=True)

    st.divider()

    c1, c2 = st.columns(2)
    with c1:
        st.subheader("Headline metrics")
        long = metrics_df.melt(
            id_vars="config",
            value_vars=["precision", "recall", "f1_score", "auc_roc"],
            var_name="metric",
            value_name="value",
        )
        long["config_short"] = long["config"].str.extract(r"^([A-D])")
        fig = px.bar(
            long, x="metric", y="value", color="config_short",
            barmode="group", text=long["value"].round(3),
            color_discrete_sequence=px.colors.qualitative.Set2,
        )
        fig.update_traces(textposition="outside")
        fig.update_layout(yaxis_range=[0, 1.1], legend_title="Config", height=420)
        st.plotly_chart(fig, use_container_width=True)

    with c2:
        st.subheader("Recall vs FPR")
        scatter = metrics_df.copy()
        scatter["config_short"] = scatter["config"].str.extract(r"^([A-D])")
        fig = px.scatter(
            scatter, x="fpr", y="recall", text="config_short", size="f1_score",
            size_max=55, color="auc_roc", color_continuous_scale="Viridis",
        )
        fig.update_traces(textposition="middle center", textfont=dict(color="white", size=14, family="Arial Black"))
        fig.update_layout(height=420, xaxis_title="False Positive Rate", yaxis_title="Recall")
        st.plotly_chart(fig, use_container_width=True)

    st.divider()
    st.subheader("Confusion matrices")
    try:
        st.image(str(R_RESULTS / "confusion_matrices.png"), use_container_width=True)
    except Exception:
        st.info("confusion_matrices.png not found")


# ===================================================================
# FEATURE EXPLORER
# ===================================================================
elif section == "Feature Explorer":
    st.title("Feature Explorer")
    st.caption("Engineered features (F1–F13) across fraud vs. normal transactions, per type.")

    c1, c2 = st.columns([1, 3])
    with c1:
        tx_type = st.selectbox("Transaction type", ["TRANSFER", "CASH_OUT", "PAYMENT"])
    df = load_features(tx_type)
    feature_cols = [c for c in df.columns if c.startswith("F")]
    with c2:
        feature = st.selectbox("Feature", feature_cols, index=0)

    n_fraud = int((df["isFraud"] == 1).sum())
    n_normal = int((df["isFraud"] == 0).sum())
    c1, c2, c3 = st.columns(3)
    with c1:
        metric_card("Samples", f"{len(df):,}", f"{tx_type} subset")
    with c2:
        metric_card("Fraud", f"{n_fraud:,}", f"{n_fraud/len(df)*100:.2f}%")
    with c3:
        metric_card("Normal", f"{n_normal:,}", f"{n_normal/len(df)*100:.2f}%")

    st.divider()

    left, right = st.columns(2)
    with left:
        st.subheader(f"Distribution — {feature}")
        plot_df = df.copy()
        plot_df["label"] = plot_df["isFraud"].map({0: "Normal", 1: "Fraud"})
        fig = px.histogram(
            plot_df, x=feature, color="label", barmode="overlay",
            nbins=60, opacity=0.7,
            color_discrete_map={"Normal": "#3b82f6", "Fraud": "#ef4444"},
        )
        fig.update_layout(height=420)
        st.plotly_chart(fig, use_container_width=True)

    with right:
        st.subheader("Feature correlation with isFraud")
        corr = df[feature_cols + ["isFraud"]].corr()["isFraud"].drop("isFraud").sort_values()
        fig = go.Figure(go.Bar(
            x=corr.values, y=corr.index, orientation="h",
            marker=dict(color=corr.values, colorscale="RdBu", cmin=-1, cmax=1),
        ))
        fig.update_layout(height=420, xaxis_title="Pearson correlation")
        st.plotly_chart(fig, use_container_width=True)

    st.divider()
    st.subheader("Feature heatmaps")
    img_map = {
        "TRANSFER": R_OUTPUT / "feature_heatmap_transfer.png",
        "CASH_OUT": R_OUTPUT / "feature_heatmap_cashout.png",
    }
    img = img_map.get(tx_type)
    if img and img.exists():
        st.image(str(img), use_container_width=True)
    else:
        st.info("No heatmap available for this type.")


# ===================================================================
# DSAA TYPOLOGIES
# ===================================================================
elif section == "DSAA Typologies":
    st.title("DSAA — Discovered Fraud Typologies")
    st.caption("Each flagged fraud is fingerprinted, then clustered with DBSCAN; clusters are labelled against FATF money-laundering categories.")

    try:
        typologies = load_json(R_DSAA / "typology_records.json")
        cfg = load_json(R_DSAA / "dbscan_config.json")
    except Exception as e:
        st.error(f"Could not load DSAA outputs: {e}")
        st.stop()

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        metric_card("Clusters", str(cfg["n_clusters_discovered"]), "DBSCAN")
    with c2:
        metric_card("Frauds analysed", f"{cfg['n_fraud_analysed']:,}", "")
    with c3:
        metric_card("Silhouette", f"{cfg['silhouette_score']:.3f}", "Higher = tighter clusters")
    with c4:
        metric_card("Noise points", f"{cfg['n_noise_points']:,}", f"eps = {cfg['eps']:.3f}")

    st.divider()

    left, right = st.columns([1, 1])
    with left:
        try:
            st.image(str(R_DSAA / "dsaa_dashboard.png"), caption="DSAA dashboard", use_container_width=True)
        except Exception:
            pass
    with right:
        try:
            st.image(str(R_DSAA / "typology_radar.png"), caption="Typology radar", use_container_width=True)
        except Exception:
            pass

    st.divider()
    st.subheader("Typology cards")

    typ_df = pd.DataFrame([
        {
            "id": t["cluster_id"],
            "label": t["typology_label"],
            "size": t["cluster_size"],
            "transfer_pct": t.get("transfer_pct", 0),
            "cashout_pct": t.get("cashout_pct", 0),
            "description": t["typology_description"],
            "top_dims": ", ".join(d[0] for d in t["top_dims"][:3]),
        }
        for t in typologies
    ]).sort_values("size", ascending=False)

    for _, t in typ_df.iterrows():
        with st.container():
            c1, c2 = st.columns([1, 3])
            with c1:
                st.markdown(f"### `#{t['id']}`")
                st.markdown(f"**{t['label']}**")
                pill_color = "pill-green" if t["size"] > 500 else "pill-amber" if t["size"] > 100 else "pill-red"
                st.markdown(f"<span class='pill {pill_color}'>{t['size']:,} txns</span>", unsafe_allow_html=True)
            with c2:
                st.markdown(t["description"])
                st.caption(f"Top driving dims: {t['top_dims']}")
                st.progress(min(t["transfer_pct"] / 100, 1.0), text=f"TRANSFER share: {t['transfer_pct']:.0f}%")
            st.markdown("---")


# ===================================================================
# LIVE SCORING DEMO
# ===================================================================
elif section == "Live Scoring Demo":
    st.title("Live Scoring Demo")
    st.caption(
        "Tune a synthetic transaction and watch the hybrid anomaly score against the trained per-type threshold. "
        "Score = α·recon + β·KL + γ·density, using the saved statistics from `stratified_config.json`."
    )

    cfg = load_json(R_RESULTS / "models" / "stratified_config.json")

    tx_type = st.selectbox("Transaction type", list(cfg.keys()))
    p = cfg[tx_type]

    c1, c2, c3 = st.columns(3)
    with c1:
        z_recon = st.slider("Reconstruction z-score (how unusual the values are)", -1.0, 8.0, 0.0, 0.1)
    with c2:
        z_kl = st.slider("KL z-score (latent-space deviation)", -2.0, 8.0, 0.0, 0.1)
    with c3:
        z_dens = st.slider("Density z-score (rarity in latent space)", -2.0, 8.0, 0.0, 0.1)

    recon = p["recon_mean"] + z_recon * p["recon_std"]
    kl = p["kl_mean"] + z_kl * p["kl_std"]
    dens = p["dens_mean"] + z_dens * p["dens_std"]

    alpha, beta, gamma = p["alpha"], p["beta"], p["gamma"]
    recon_norm = (recon - p["recon_mean"]) / (p["recon_std"] + 1e-9)
    kl_norm = (kl - p["kl_mean"]) / (p["kl_std"] + 1e-9)
    dens_norm = (dens - p["dens_mean"]) / (p["dens_std"] + 1e-9)
    score = alpha * recon_norm + beta * kl_norm + gamma * dens_norm
    threshold = p["threshold"]

    is_fraud = score >= threshold
    margin = score - threshold

    st.divider()

    c1, c2 = st.columns([1, 1.3])
    with c1:
        verdict_color = "#dc2626" if is_fraud else "#16a34a"
        verdict = "🚨 FLAGGED AS FRAUD" if is_fraud else "✅ NORMAL"
        st.markdown(
            f"<div style='padding:1.5rem;border-radius:12px;background:{verdict_color};"
            f"color:white;text-align:center;'>"
            f"<div style='font-size:0.85rem;opacity:0.9;'>VERDICT</div>"
            f"<div style='font-size:1.8rem;font-weight:700;margin-top:0.3rem;'>{verdict}</div>"
            f"<div style='margin-top:0.5rem;'>Score = {score:.3f} &nbsp;|&nbsp; Threshold = {threshold:.3f}</div>"
            f"<div style='font-size:0.85rem;opacity:0.85;'>Margin = {margin:+.3f}</div>"
            f"</div>",
            unsafe_allow_html=True,
        )
        st.markdown(" ")
        st.markdown(
            f"**Weights** &nbsp; α (recon) = `{alpha}` &nbsp; β (KL) = `{beta}` &nbsp; γ (density) = `{gamma}`"
        )

    with c2:
        fig = go.Figure(go.Indicator(
            mode="gauge+number+delta",
            value=score,
            delta={"reference": threshold, "increasing": {"color": "#dc2626"}, "decreasing": {"color": "#16a34a"}},
            gauge={
                "axis": {"range": [-2, max(8, threshold + 4)]},
                "bar": {"color": verdict_color},
                "steps": [
                    {"range": [-2, threshold], "color": "#dcfce7"},
                    {"range": [threshold, max(8, threshold + 4)], "color": "#fee2e2"},
                ],
                "threshold": {"line": {"color": "black", "width": 3}, "value": threshold},
            },
            title={"text": f"Hybrid anomaly score — {tx_type}"},
        ))
        fig.update_layout(height=340, margin=dict(t=40, b=10))
        st.plotly_chart(fig, use_container_width=True)

    st.divider()
    contrib_df = pd.DataFrame({
        "component": ["α · recon", "β · KL", "γ · density"],
        "contribution": [alpha * recon_norm, beta * kl_norm, gamma * dens_norm],
    })
    fig = px.bar(
        contrib_df, x="component", y="contribution",
        color="contribution", color_continuous_scale="RdYlGn_r",
        text=contrib_df["contribution"].round(3),
    )
    fig.update_traces(textposition="outside")
    fig.update_layout(height=320, title="Score decomposition")
    st.plotly_chart(fig, use_container_width=True)
