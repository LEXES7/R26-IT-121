/**
 * Component reference data.
 *
 * Metrics appear ONLY where they have actually been measured. The network
 * component has been through a five-seed leakage-free evaluation, so its
 * numbers are real and quotable; the other detectors are described by design
 * rather than by score. Inventing placeholder metrics for a research platform
 * would be the single worst thing this page could do.
 */

export const COMPONENTS = {
  network: {
    slug: 'network',
    modality: 'Network',
    color: 'graph',
    title: 'Edge-Enhanced GraphSAGE',
    tagline: 'Fraud is a shape, not a number',
    question: 'Who pays whom?',
    intro:
      'A transaction that looks ordinary on its own can be one spoke of a mule ring. '
      + 'This component builds the payment network — accounts as nodes, transfers as '
      + 'directed edges — and learns structure that per-transaction models are blind to.',
    detects: [
      ['Hub-and-spoke', 'Many senders converging on one collection account'],
      ['Smurfing', 'Deliberately similar amounts split to stay under attention'],
      ['Layering', 'Funds chained through intermediaries to obscure origin'],
      ['Account takeover', 'A dormant account drained in one move'],
    ],
    metrics: [
      { label: 'Test F1', value: '0.406', note: 'leakage-free, 5 seeds' },
      { label: 'PR-AUC', value: '0.448', note: '9× the 4.7% base rate' },
      { label: 'Seed variance', value: '33× lower', note: 'vs the baseline' },
      { label: 'Response time', value: '<150 ms', note: 'p95, 500 ms budget' },
    ],
    findings: [
      {
        title: 'We found and removed a data leak',
        body:
          'The original pipeline computed features over the whole timeline before '
          + 'splitting, so test-window accounts carried information from their own '
          + 'future. Fixing it cost about 0.20 F1. The lower number is the honest one.',
      },
      {
        title: 'Balanced sampling beats class weighting',
        body:
          'At 773:1 imbalance the aggregate weight of millions of legitimate accounts '
          + 'drowns any per-example weighting. Sampling balanced mini-batches over k-hop '
          + 'fraud subgraphs made training essentially deterministic — five seeds land '
          + 'within 0.005 of each other, against a baseline that swings from 0.17 to 0.38.',
      },
      {
        title: 'Attention buys explanation, not accuracy',
        body:
          'A leave-one-out arm showed the edge-attention layer does not improve '
          + 'accuracy. It stays because it produces the per-edge weights the forensic '
          + 'narrative is built on — a measured trade of ~0.01 F1 for attribution.',
      },
    ],
    pipeline: ['Transaction', 'k=2 neighbourhood', 'Edge-aware message passing', 'Calibrated score', 'Ring + pattern'],
    output: 'A relational risk score plus the extracted ring: sink account, money-laundering pattern, per-account roles, and the transfers the model weighted most.',
    status: 'delivered',
  },

  behavioural: {
    slug: 'behavioural',
    modality: 'Behaviour',
    color: 'behavioral',
    title: 'Stratified VAE with Dual-Signal Anomaly Attribution',
    tagline: 'Unusual is not an explanation',
    question: 'Which part of this behaviour does not fit?',
    intro:
      'An anomaly detector that only emits a number tells an investigator nothing '
      + 'they can act on. This component trains one variational autoencoder per '
      + 'transaction type on non-fraud traffic alone, then decomposes every alert '
      + 'back through the model’s own objective — which input features it could '
      + 'not reconstruct, and which latent dimensions diverged — so the score '
      + 'arrives with the reason attached.',
    detects: [
      ['Balance-shape anomalies', 'Origin-side movement that does not match the type’s normal pattern'],
      ['Off-pattern value', 'Amounts outside the learned range for that transaction type'],
      ['Behavioural typologies', 'Recurring attribution patterns, discovered without labels'],
    ],
    metrics: [
      { label: 'Typology quality', value: '0.72', note: 'DBCV, TRANSFER; 0.67 CASH_OUT' },
      { label: 'Cluster stability', value: '0.9996', note: 'bootstrap ARI, 10 resamples' },
      { label: 'Calibration', value: 'ECE 0.013–0.039', note: 'out-of-sample, per stratum' },
      { label: 'Response time', value: '1–3 ms', note: '50 ms budget' },
    ],
    findings: [
      {
        title: 'The headline detection result is a dataset artifact',
        body:
          'A single PaySim column, newbalanceDest == 0, separates fraudulent transfers '
          + 'perfectly with no model at all — 821 of 821 fraud, 0 of 10,725 normal. '
          + 'A three-tier feature ablation quantified how much of the component’s '
          + 'performance rested on it. The detection claim was withdrawn rather than '
          + 'defended; the attribution and typology results, which do not depend on it, '
          + 'were kept.',
      },
      {
        title: 'Evaluation leakage inflated results by an order of magnitude',
        body:
          'The original protocol fitted the scaler and the model on rows that were then '
          + 'evaluated on. Correcting it to a chronological split, with framework and '
          + 'features held constant, reduced average-precision lift by 9.1x on TRANSFER '
          + 'and 11.3x on CASH_OUT. The lower numbers are the honest ones.',
      },
      {
        title: 'Attribution is read from the objective, not added on top',
        body:
          'Reconstruction error per feature and KL divergence per latent dimension are '
          + 'already present in the VAE loss. Decomposing them costs no extra inference '
          + 'and needs no auxiliary explainer, which is why a full forensic fingerprint '
          + 'still returns in single-digit milliseconds.',
      },
      {
        title: 'Typologies are discovered, then named — not the other way round',
        body:
          'DBSCAN over the attribution fingerprints finds 6 clusters on TRANSFER and 11 '
          + 'on CASH_OUT with no label used at any point, and they separate by fraud rate '
          + 'rather than by transaction type. The human-readable names are a post-hoc '
          + 'reading of what distinguishes each cluster.',
      },
    ],
    pipeline: ['Transaction', 'Type stratum', 'VAE reconstruction', 'Signal 1 + 2 + 3', 'Typology match'],
    output:
      'A calibrated behavioural risk score, the per-feature and per-latent-dimension '
      + 'attribution behind it, and the nearest discovered typology — or an explicit '
      + 'statement that none matched.',
    status: 'delivered',
  },

  temporal: {
    slug: 'temporal',
    modality: 'Timing',
    color: 'temporal',
    title: 'System-Context Temporal CNN',
    tagline: 'Scripts have a rhythm people do not',
    question: 'When, and how fast?',
    intro:
      'Automated fraud betrays itself in timing. This component reads sequences of '
      + 'activity with a temporal convolutional network, looking for machine-paced '
      + 'regularity, bursts and off-hours behaviour that a single transaction cannot show.',
    detects: [
      ['Burst activity', 'Many transfers compressed into a short window'],
      ['Mechanical regularity', 'Intervals too even to be human'],
      ['Off-hours patterns', 'Activity inconsistent with the account’s usual clock'],
    ],
    metrics: [],
    findings: [
      {
        title: 'Dilated convolutions see long context cheaply',
        body:
          'A TCN widens its receptive field without the sequential cost of a recurrent '
          + 'model, so a long transaction history can be scored fast enough for an '
          + 'interactive verdict.',
      },
      {
        title: 'System context separates load from intent',
        body:
          'Timing features are meaningless without knowing what the platform was doing. '
          + 'System context distinguishes a genuinely unusual burst from ordinary '
          + 'peak-hour traffic.',
      },
    ],
    pipeline: ['Transaction history', 'Sequence window', 'Dilated convolutions', 'Attention over time', 'Temporal score'],
    output: 'A temporal risk score with the window that triggered it.',
    status: 'in-progress',
  },

  fusion: {
    slug: 'fusion',
    modality: 'Fusion',
    color: 'fusion',
    title: 'Fusion Engine & Forensic Reporting',
    tagline: 'Three opinions, one defensible verdict',
    question: 'So what should we do about it?',
    intro:
      'Three detectors can disagree, and one can be unavailable. The fusion engine '
      + 'weighs the signals it actually has into a single score, then retrieves the '
      + 'matching money-laundering typology and writes a narrative that cites the '
      + 'evidence behind every claim.',
    detects: [
      ['Weighted fusion', 'A meta-classifier over the available modalities'],
      ['Graceful degradation', 'A missing detector abstains rather than voting zero'],
      ['Grounded reporting', 'Retrieval ties each statement to a typology and a score'],
    ],
    metrics: [],
    findings: [
      {
        title: 'Absence is not innocence',
        body:
          'When a detector is unreachable its signal is excluded rather than counted '
          + 'as a low score — otherwise an outage would quietly look like safety.',
      },
      {
        title: 'Every sentence traces to evidence',
        body:
          'The report is generated from retrieved typologies and the actual model '
          + 'outputs, so an analyst can check any claim rather than trusting prose.',
      },
    ],
    pipeline: ['Three scores', 'Weighted fusion', 'Typology retrieval', 'Grounded generation', 'Forensic report'],
    output: 'A fused verdict, a risk classification, and a cited case narrative.',
    status: 'delivered',
  },
}

export const COMPONENT_ORDER = ['network', 'behavioural', 'temporal', 'fusion']
