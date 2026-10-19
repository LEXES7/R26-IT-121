import { MODEL_LENS } from './modelLens'

/**
 * The worked example the home page follows: one transfer, what each detector
 * made of it, and the report that came back.
 *
 * The hero and the pinned walkthrough both show it. It is written down once,
 * here, so the scores on the hero cards and the scores in the walkthrough
 * cannot drift apart the way this page's component list once did.
 */

export const TXN = [
  ['transaction_id', 'TX_2026_08_24_0117'],
  ['type', 'TRANSFER'],
  ['amount', '9,060,955.18'],
  ['nameOrig', 'C1360689528'],
  ['nameDest', 'C1674473954'],
  ['step', '389'],
]

/** One field of the record, by name. */
export const txnField = (name) => TXN.find(([key]) => key === name)?.[1]

// `brief` is the finding cut down to fit a chip beside the hero globe.
export const MODELS = [
  { key: 'graph', label: 'Network', model: 'GraphSAGE', score: 0.52, colour: `rgb(${MODEL_LENS.graph.hue})`,
    finding: 'ACCOUNT_TAKEOVER: 2 senders drained into one account',
    brief: '2 senders drained into one account' },
  { key: 'behavioural', label: 'Behaviour', model: 'Stratified VAE', score: 0.88, colour: `rgb(${MODEL_LENS.behavioural.hue})`,
    finding: 'Reconstruction error 4.2σ above this account’s baseline',
    brief: '4.2σ above its own baseline' },
  { key: 'temporal', label: 'Timing', model: 'Transaction-Sequence TCN', score: 0.92, colour: `rgb(${MODEL_LENS.temporal.hue})`,
    finding: 'Burstiness 0.92 — machine-paced, not human',
    brief: 'burstiness 0.92, machine-paced' },
]

export const VERDICT = 'CRITICAL'
export const REPORT_TITLE = 'mule account receiving drained funds'

export const REPORT = [
  `${VERDICT}: ${REPORT_TITLE}`,
  `Sink account ${txnField('nameDest')} received 2 transfers`,
  'that each emptied the sending account.',
  'Pattern matches FATF typology: account takeover,',
  'high-value transfers to a new beneficiary.',
]
