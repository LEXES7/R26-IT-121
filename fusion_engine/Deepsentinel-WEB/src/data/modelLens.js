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
      'Builds each account from its neighbours, then weights every transfer by '
      + 'the attention it earned on the way to the destination.',
    reads: 'The account network this transaction sits inside.',
    blind:
      'When anything happened, and what this transaction looks like on its own.',
  },

  behavioural: {
    key: 'behavioural',
    label: 'Behavioural',
    model: 'Stratified VAE with Dual-Signal Anomaly Attribution',
    member: 'Wijesinghe',
    hue: 'var(--modality-behavioral)',
    axis: 'Behaviour',
    question: 'Which part of this behaviour does not fit?',
    mechanism:
      'Encodes the transaction, rebuilds it from that encoding, and measures '
      + 'three separate ways the result failed to match — against a threshold '
      + 'learned for this transaction type alone.',
    reads: "This transaction's own values, against normal for its type.",
    blind: 'Every other account, and everything that came before.',
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
      'Scans the window of transactions ending at this one and names the single '
      + 'earlier transaction it weighted most heavily.',
    reads: 'The run of transactions leading up to this one.',
    blind: 'Who the counterparty is, and how the accounts connect.',
  },
}

export const LENS_ORDER = ['graph', 'behavioural', 'temporal']

/** Availability is three states, not two — see MechanismPanel for why. */
export const STATUS = {
  LIVE: 'live',
  UNREACHABLE: 'unreachable',
  AWAITING: 'awaiting',
}
