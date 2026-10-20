/**
 * Component reference data.
 *
 * These pages describe a product, so they describe what each detector does
 * and what it hands back — not how its evaluation was designed. Scores,
 * protocols, seed counts and comparisons against baselines belong to the
 * technical write-up; on a page a prospective customer reads, they answer a
 * question nobody asked and invite one nobody wants.
 *
 * Every figure below is still a real, measured property of the running
 * system. Nothing here is aspirational, and nothing here should be added
 * unless it can be pointed at in the console.
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
      'A normal-looking payment can be one spoke of a mule ring. This model maps who '
      + 'pays whom and spots the shapes fraud makes.',
    detects: [
      ['Hub-and-spoke', 'Many senders paying one collection account'],
      ['Smurfing', 'Money split into similar small amounts'],
      ['Layering', 'Money passed through middle accounts to hide its source'],
      ['Account takeover', 'A dormant account drained in one move'],
    ],
    metrics: [
      { label: 'Accounts mapped', value: '3.3M', note: 'in the payment network' },
      { label: 'Transfers mapped', value: '2.8M', note: 'between those accounts' },
      { label: 'Neighbourhood', value: '2 hops', note: 'read around each payment' },
      { label: 'Serving', value: 'precomputed', note: 'fast answers, no live search' },
    ],
    findings: [
      {
        title: 'It scores accounts it has never seen',
        body: 'An account opened this morning is scored without retraining.',
      },
      {
        title: 'The ring comes back with the score',
        body: 'Every alert lists the accounts involved, their roles, and where the money ended up.',
      },
      {
        title: 'It says which transfers implicated the account',
        body: 'You see the two or three transfers that mattered, not a list of forty.',
      },
    ],
    pipeline: ['Transaction', 'k=2 neighbourhood', 'Edge-aware message passing', 'Calibrated score', 'Ring + pattern'],
    output: 'A risk score, plus the ring: where the money ended up, the pattern, each account’s role and the key transfers.',
    status: 'delivered',
  },

  behavioural: {
    slug: 'behavioural',
    modality: 'Behaviour',
    color: 'behavioral',
    title: 'Stratified VAE with Dual-Signal Anomaly Attribution',
    tagline: 'Unusual is not an explanation',
    question: 'What does not fit?',
    intro:
      'A score alone tells an investigator nothing. This model learns what normal '
      + 'looks like for each transaction type, then says which parts of a payment '
      + 'did not fit.',
    detects: [
      ['Odd balance changes', 'The sender’s balance moves in an unusual way'],
      ['Unusual amounts', 'Far outside the normal range for that type'],
      ['Repeat patterns', 'Recurring kinds of oddity, found automatically'],
    ],
    metrics: [
      { label: 'Models', value: '4', note: 'one per transaction type' },
      { label: 'Response', value: '~5 ms', note: 'score and reasons' },
      { label: 'Reasons', value: 'per feature', note: 'what did not fit' },
      { label: 'Patterns found', value: '17', note: 'recurring kinds of oddity' },
    ],
    findings: [
      {
        title: 'A cash withdrawal is not a bill payment',
        body: 'Each transaction type has its own model, so each is judged against its own normal.',
      },
      {
        title: 'The reason arrives with the score',
        body: 'It says which part did not fit, such as the balance rather than the amount, in milliseconds.',
      },
      {
        title: 'Repeat patterns get names',
        body: 'Similar oddities are grouped and named, so you can recognise them next time.',
      },
    ],
    pipeline: ['Transaction', 'Type stratum', 'VAE reconstruction', 'Signal 1 + 2 + 3', 'Typology match'],
    output: 'A risk score, the reasons behind it, and the closest known pattern (or a note that none matched).',
    status: 'delivered',
  },

  temporal: {
    slug: 'temporal',
    modality: 'Timing',
    color: 'temporal',
    title: 'Transaction-Sequence TCN with fraud_attention',
    tagline: 'No transaction happens in isolation',
    question: 'What happened right before this?',
    intro:
      'One payment can look fine on its own and suspicious after what came before it. '
      + 'This model reads each payment with the 32 before it and names the one that '
      + 'mattered most.',
    detects: [
      ['Escalating drains', 'A partial drain, then a full one soon after'],
      ['Mule priming', 'An account emptied just before a large payment arrives'],
      ['Fraud bursts', 'Several fraud payments close together'],
    ],
    metrics: [
      { label: 'Context', value: '32', note: 'earlier payments read each time' },
      { label: 'Direction', value: 'causal', note: 'never looks ahead' },
      { label: 'Evidence', value: 'named', note: 'points to the earlier payment' },
      { label: 'Deployment', value: 'stateless', note: 'no account history stored' },
    ],
    findings: [
      {
        title: 'It reads the run, not the transaction',
        body: 'Each payment is read together with the 32 that came before it.',
      },
      {
        title: 'It points to the payment that mattered',
        body: 'You get the earlier payment itself, with its amount and accounts, ready to open.',
      },
      {
        title: 'Nothing to store per account',
        body: 'It reads the live stream in order, so there is no customer history to keep.',
      },
    ],
    pipeline: ['Transaction stream', '32-tx sliding window', 'Dilated causal TCN', 'fraud_attention', 'Risk + predecessor'],
    output: 'A risk score plus the one earlier payment that mattered most, for the report to cite.',
    status: 'delivered',
  },

  fusion: {
    slug: 'fusion',
    modality: 'Fusion',
    color: 'fusion',
    title: 'Fusion Engine & Forensic Reporting',
    tagline: 'Three opinions, one defensible verdict',
    question: 'So what should we do about it?',
    intro:
      'The three detectors are combined into one score. Then the matching laundering '
      + 'method is found and a report is written that cites its evidence.',
    detects: [
      ['Weighted fusion', 'A trained model combines the three scores'],
      ['Handles outages', 'A missing detector is left out, not counted as safe'],
      ['Cited reports', 'Every statement points to a score or a known method'],
    ],
    metrics: [
      { label: 'Signals combined', value: '3', note: 'network, behaviour and timing' },
      { label: 'Methods indexed', value: '10', note: 'known laundering methods' },
      { label: 'Report', value: 'cited', note: 'every claim has a source' },
      { label: 'Export', value: 'PDF', note: 'plus a draft filing' },
    ],
    findings: [
      {
        title: 'Absence is not innocence',
        body: 'If a detector is down, it is left out and the verdict says so.',
      },
      {
        title: 'Every sentence has a source',
        body: 'The report only uses recorded scores and the matched method, so every claim can be checked.',
      },
      {
        title: 'The filing is drafted for you',
        body: 'A suspicious-activity report is drafted for you. A person approves it; nothing is filed automatically.',
      },
    ],
    pipeline: ['Three scores', 'Weighted fusion', 'Typology retrieval', 'Grounded generation', 'Forensic report'],
    output: 'One verdict, a risk level and a cited report.',
    status: 'delivered',
  },
}

export const COMPONENT_ORDER = ['network', 'behavioural', 'temporal', 'fusion']
