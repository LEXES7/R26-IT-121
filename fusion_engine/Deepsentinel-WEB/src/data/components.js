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
    tagline: 'Is this account acting like itself?',
    question: 'Does this behaviour fit the account?',
    intro:
      'A £9,000 transfer is unremarkable for one account and alarming for another. '
      + 'This component learns a per-account baseline with a variational autoencoder '
      + 'and measures how far a transaction departs from it — so the threshold adapts '
      + 'to the customer rather than the population.',
    detects: [
      ['Sudden escalation', 'Amounts far outside the account’s learned range'],
      ['Behaviour change', 'A spending shape that stops matching the customer'],
      ['Dormant reactivation', 'A quiet account abruptly transacting'],
    ],
    metrics: [],
    findings: [
      {
        title: 'Stratification handles customer diversity',
        body:
          'One global model would treat every account as average. Stratifying the '
          + 'population lets the reconstruction error mean the same thing for a '
          + 'high-volume merchant and a dormant personal account.',
      },
      {
        title: 'Dual-signal attribution explains the flag',
        body:
          'Reconstruction error alone says "unusual" without saying why. Attributing '
          + 'the error back to contributing features turns an anomaly score into a '
          + 'reason the fusion engine can cite.',
      },
    ],
    pipeline: ['Transaction', 'Account stratum', 'VAE reconstruction', 'Error attribution', 'Behavioural score'],
    output: 'A behavioural risk score with the features that drove it.',
    status: 'in-progress',
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
