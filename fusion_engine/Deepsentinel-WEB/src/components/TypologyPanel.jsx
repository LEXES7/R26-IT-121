/**
 * The typology this fingerprint landed in, and what that cluster is.
 *
 * The label alone reads as a category someone chose from a list. It is not:
 * the clusters were found by running DBSCAN over the fingerprints of flagged
 * transactions, with no labels involved, and the names were written afterwards
 * by reading what each cluster's centroid was made of. The difference between
 * "we sorted these into our categories" and "these sorted themselves and we
 * named what came out" is the whole claim, and it only survives if the panel
 * shows the evidence — how many rows are in the cluster, how many of them were
 * actually fraud, and how close this transaction sits to the middle of it.
 *
 * Purity is the number to read first. A cluster whose members are all fraud is
 * a pattern worth a name; one at half is a region the fingerprints share for
 * some other reason, and saying so is more useful than hiding it.
 */

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)

function Cell({ label, value, tone }) {
  return (
    <div>
      <p className="ds-mono text-[11px] uppercase tracking-wider"
         style={{ color: 'rgb(var(--ds-faint))' }}>{label}</p>
      <p className="numeric mt-0.5 text-[20px] leading-none"
         style={{ color: tone ?? 'rgb(var(--ds-ink))' }}>{value}</p>
    </div>
  )
}

export default function TypologyPanel({ typology }) {
  if (!typology?.typology_label) return null

  const {
    typology_label: label, cluster_id: id, cluster_size: size,
    cluster_fraud_purity: purity, confidence, fatf_hint: fatf,
    rationale, discovery,
  } = typology

  const unassigned = label === 'UNASSIGNED' || id === -1
  const pureTone = purity == null ? undefined
    : purity >= 0.9 ? 'rgb(var(--ds-sev-critical))'
      : purity >= 0.5 ? 'rgb(var(--ds-warn))'
        : 'rgb(var(--ds-muted))'

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h3 className="ds-mono text-[14px] uppercase tracking-wider"
          style={{ color: 'rgb(var(--ds-faint))' }}>
        Discovered typology
      </h3>

      <div className="rounded-lg border p-4" style={{ borderColor: 'rgb(var(--ds-line))' }}>
        {unassigned ? (
          <p className="text-[15px]" style={{ color: 'rgb(var(--ds-muted))' }}>
            This fingerprint did not fall inside any discovered cluster. DBSCAN
            leaves such rows as noise rather than forcing them into the nearest
            one, which is the reason it was chosen over k-means: a genuinely
            one-off anomaly should be reported as one.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="ds-mono text-[19px]" style={{ color: 'rgb(var(--ds-ink))' }}>
                {label}
              </span>
              {fatf && (
                <span className="ds-mono rounded px-1.5 py-0.5 text-[12px]"
                      style={{
                        color: 'rgb(var(--ds-accent-strong))',
                        background: 'rgb(var(--ds-accent) / 0.10)',
                      }}>
                  {fatf}
                </span>
              )}
            </div>

            {rationale && (
              <p className="mt-2 text-[14px] leading-relaxed"
                 style={{ color: 'rgb(var(--ds-muted))' }}>
                {rationale}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-3 sm:grid-cols-4"
                 style={{ borderColor: 'rgb(var(--ds-line))' }}>
              <Cell label="cluster" value={id ?? '—'} />
              <Cell label="rows in it" value={size ?? '—'} />
              <Cell label="were fraud" value={pct(purity)} tone={pureTone} />
              <Cell label="closeness" value={pct(confidence)} />
            </div>

            {/* Said plainly, because the alternative reading — that these are
                categories the model was taught — is the one a reviewer will
                assume unless told otherwise. */}
            <p className="mt-3 text-[13px] leading-relaxed"
               style={{ color: 'rgb(var(--ds-faint))' }}>
              {discovery
                ?? 'Found by clustering the fingerprints of flagged transactions '
                   + 'with no labels involved; the name was written afterwards '
                   + 'from what the cluster centroid was made of.'}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
