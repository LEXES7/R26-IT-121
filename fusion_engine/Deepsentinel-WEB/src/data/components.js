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
      { label: 'Accounts mapped', value: '3.3M', note: 'nodes in the payment graph' },
      { label: 'Transfers mapped', value: '2.8M', note: 'directed edges between them' },
      { label: 'Neighbourhood', value: '2 hops', note: 'read around every transaction' },
      { label: 'Serving', value: 'precomputed', note: 'no graph traversal at request time' },
    ],
    findings: [
      {
        title: 'It scores accounts it has never seen',
        body:
          'New accounts appear constantly, and retraining for each one is not an '
          + 'option. The model applies the structure it has learned elsewhere to an '
          + 'account opened this morning.',
      },
      {
        title: 'The ring comes back with the score',
        body:
          'A flag is not useful on its own. Every alert arrives with the accounts '
          + 'around it, the role each played, the transfers that carried the most '
          + 'weight, and the account the money ended up in.',
      },
      {
        title: 'It says which transfers implicated the account',
        body:
          'Each transfer is weighted as the model reads it, and those weights rank '
          + 'the evidence. An investigator sees the two or three movements that '
          + 'mattered, not a list of forty.',
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
      { label: 'Models', value: '4', note: 'one per transaction type' },
      { label: 'Response', value: '~5 ms', note: 'score and full attribution' },
      { label: 'Attribution', value: 'per feature', note: 'and per latent dimension' },
      { label: 'Patterns found', value: '17', note: 'recurring behavioural signatures' },
    ],
    findings: [
      {
        title: 'A cash withdrawal is not a bill payment',
        body:
          'One model for everything means everything is judged against an average '
          + 'that describes nothing. There is a separate model per transaction type, '
          + 'so each is measured against its own normal.',
      },
      {
        title: 'The reason arrives with the score',
        body:
          'It reports which parts of the transaction it could not account for \u2014 the '
          + 'balance movement rather than the amount, say. That decomposition comes '
          + 'from the model\u2019s own workings, which is why a full explanation still '
          + 'returns in single-digit milliseconds.',
      },
      {
        title: 'Recurring signatures are grouped, then named',
        body:
          'Explanations that look alike are clustered together, and the groups that '
          + 'emerge are given readable names. The patterns are found first and '
          + 'labelled second, not invented and then looked for.',
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
    title: 'Transaction-Sequence TCN with fraud_attention',
    tagline: 'No transaction happens in isolation',
    question: 'What happened right before this?',
    intro:
      'A transaction scored on its own looks unremarkable; the same transaction after '
      + 'two prior partial drains from the same account is a pattern. This component '
      + 'reads every transaction as one step in a system-wide 32-transaction sliding '
      + 'window — not a per-account history, which PaySim cannot support — and a dilated '
      + 'causal TCN with a self-attention layer, fraud_attention, names the single prior '
      + 'transaction that drove the score.',
    detects: [
      ['Escalating drains', 'A partial drain from an account followed by a full one shortly after'],
      ['Mule priming', 'A destination account emptied shortly before receiving a large transfer'],
      ['Fraud clustering', 'Multiple fraud transactions falling inside the same short window'],
    ],
    metrics: [
      { label: 'Context', value: '32', note: 'preceding transactions read with each one' },
      { label: 'Direction', value: 'causal', note: 'it cannot see what has not happened' },
      { label: 'Evidence', value: 'named', note: 'returns the prior transaction itself' },
      { label: 'Deployment', value: 'stateless', note: 'no per-account history to store' },
    ],
    findings: [
      {
        title: 'It reads the run, not the transaction',
        body:
          'A transfer on its own can be unremarkable. The same transfer arriving '
          + 'after two partial drains is a pattern. Each transaction is read '
          + 'alongside the thirty-two that came before it.',
      },
      {
        title: 'It hands back a transaction, not a timestamp',
        body:
          'Most attention mechanisms report which position in a sequence mattered. '
          + 'This one returns the whole prior transaction \u2014 its amount, its accounts, '
          + 'its balances \u2014 so the evidence is something a reviewer can open.',
      },
      {
        title: 'Nothing to store per account',
        body:
          'The window runs over arrival order across the whole stream rather than '
          + 'per-account history, so deploying it needs no customer log and no '
          + 'migration.',
      },
    ],
    pipeline: ['Transaction stream', '32-tx sliding window', 'Dilated causal TCN', 'fraud_attention', 'Risk + predecessor'],
    output:
      'A temporal risk score plus the one prior transaction fraud_attention weighted '
      + 'most heavily — its own feature vector, not just a position — for the forensic '
      + 'layer to cite by name.',
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
      'Three detectors can disagree, and one can be unavailable. The fusion engine '
      + 'weighs the signals it actually has into a single score, then retrieves the '
      + 'matching money-laundering typology and writes a narrative that cites the '
      + 'evidence behind every claim.',
    detects: [
      ['Weighted fusion', 'A meta-classifier over the available modalities'],
      ['Graceful degradation', 'A missing detector abstains rather than voting zero'],
      ['Grounded reporting', 'Retrieval ties each statement to a typology and a score'],
    ],
    metrics: [
      { label: 'Signals combined', value: '3', note: 'network, behaviour and timing' },
      { label: 'Typologies indexed', value: '10', note: 'recognised laundering methods' },
      { label: 'Report', value: 'cited', note: 'every claim traced to a stored input' },
      { label: 'Export', value: 'PDF', note: 'plus a regulatory filing draft' },
    ],
    findings: [
      {
        title: 'Absence is not innocence',
        body:
          'When a detector cannot be reached its signal is excluded rather than '
          + 'counted as a low score, and the verdict says so. Otherwise an outage '
          + 'would quietly start looking like safety.',
      },
      {
        title: 'Every sentence traces to something recorded',
        body:
          'The narrative is written from the retrieved laundering method and the '
          + 'scores actually produced. It cannot introduce a fact absent from the '
          + 'record, so an analyst can check any claim instead of trusting prose.',
      },
      {
        title: 'The filing is drafted for you',
        body:
          'A confirmed alert arrives with a suspicious-activity report already '
          + 'written \u2014 subject accounts, the transaction chain, the method and the '
          + 'narrative. Watermarked as a draft, never filed automatically, and it '
          + 'records who approved it.',
      },
    ],
    pipeline: ['Three scores', 'Weighted fusion', 'Typology retrieval', 'Grounded generation', 'Forensic report'],
    output: 'A fused verdict, a risk classification, and a cited case narrative.',
    status: 'delivered',
  },
}

export const COMPONENT_ORDER = ['network', 'behavioural', 'temporal', 'fusion']
