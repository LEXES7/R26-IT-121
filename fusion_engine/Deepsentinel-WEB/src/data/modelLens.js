/**
 * What each detector can see, and what it cannot.
 *
 * This is the one fact that justifies running three models instead of one:
 * they do not disagree because one is better, they disagree because each is
 * reading a different slice of the same event. A relational model has no
 * notion of when; a sequence model has no notion of who; a per-transaction
 * model has neither. Fusion exists to put those three readings back together.
 *
 * Written down once and read from two places — the mechanism panel on a case,
 * and the system map that explains the architecture — so the claim made in the
 * paper and the claim made on screen cannot drift apart.
 */

export const MODEL_LENS = {
  graph: {
    key: 'graph',
    label: 'Relational',
    model: 'Edge-Enhanced GraphSAGE',
    member: 'Ewaduge',
    hue: 'var(--modality-graph)',
    axis: 'Structure',
    question: 'Who paid whom?',
    mechanism:
      'Reads each account through its neighbours and weighs each transfer.',
    reads: 'The network of accounts around it.',
    blind:
      'Timing, and the payment on its own.',
  },

  behavioural: {
    key: 'behavioural',
    label: 'Behavioural',
    model: 'Stratified VAE with Dual-Signal Anomaly Attribution',
    member: 'Wijesinghe',
    hue: 'var(--modality-behavioral)',
    axis: 'Behaviour',
    question: 'What does not fit?',
    mechanism:
      'Rebuilds the payment and measures how it fails to match normal for its type.',
    reads: "The payment itself, against normal for its type.",
    blind: 'Other accounts, and what came before.',
  },

  temporal: {
    key: 'temporal',
    label: 'Temporal',
    model: 'Transaction-Sequence TCN with fraud_attention',
    member: 'Pathirana',
    hue: 'var(--modality-temporal)',
    axis: 'Time',
    question: 'What came before this?',
    mechanism:
      'Reads the payments before it and names the one that mattered most.',
    reads: 'The payments leading up to it.',
    blind: 'Who the accounts are and how they connect.',
  },
}

export const LENS_ORDER = ['graph', 'behavioural', 'temporal']

/** Availability is three states, not two — see MechanismPanel for why. */
export const STATUS = {
  LIVE: 'live',
  UNREACHABLE: 'unreachable',
  AWAITING: 'awaiting',
}
