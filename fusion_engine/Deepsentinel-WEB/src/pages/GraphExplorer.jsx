import { useCallback, useEffect, useRef, useState } from 'react'
import { getGraphSettings, setGraphSettings, getNeighbourhood } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, cx } from '../components/ui'
import ConsoleShell from '../components/ConsoleShell'

/**
 * Walk the payment graph one account at a time.
 *
 * The served graph is 3,277,509 accounts and 2,770,409 transfers. Nothing here
 * ever tries to draw that: you name an account, the server returns the ring
 * immediately around it, and clicking any neighbour re-centres and fetches the
 * next ring. The same reason a game streams the map it is standing on rather
 * than the whole world — the interesting part is always local, and the rest
 * costs memory to hold and time to draw.
 *
 * Radial rather than force-directed. A force layout looks better on a dense
 * mesh but needs a library and a second or two to settle, and this graph is
 * overwhelmingly hub-and-spoke: senders converging on one collector. A ring
 * around a centre draws that instantly and reads correctly, and the shape of
 * the answer is the finding.
 */

const FRAME_H = 460

export default function GraphExplorer() {
  const { isAdmin } = useAuth()
  const [settings, setSettings] = useState(null)
  const [query, setQuery] = useState('')
  const [graph, setGraph] = useState(null)
  const [centre, setCentre] = useState(null)
  const [hops, setHops] = useState(1)
  const [trail, setTrail] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hover, setHover] = useState(null)
  const canvasRef = useRef(null)
  const layoutRef = useRef([])          // [{id, x, y, r, node}] for hit-testing

  useEffect(() => {
    getGraphSettings().then(setSettings).catch(() => setSettings({ enabled: true }))
  }, [])

  const load = useCallback(async (account, h = hops, remember = true) => {
    if (!account) return
    setLoading(true)
    setError(null)
    try {
      const d = await getNeighbourhood(account, h)
      setGraph(d)
      setCentre(account)
      if (remember) {
        setTrail((t) => (t[t.length - 1] === account ? t : [...t, account]).slice(-8))
      }
    } catch (err) {
      setError(err?.userMessage ?? `Could not load ${account}.`)
      setGraph(null)
    } finally {
      setLoading(false)
    }
  }, [hops])

  // ── draw ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(FRAME_H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, FRAME_H)
    layoutRef.current = []
    if (!graph) return

    const cx0 = rect.width / 2
    const cy0 = FRAME_H / 2
    const others = graph.nodes.filter((n) => !n.is_centre)
    const hub = graph.nodes.find((n) => n.is_centre)
    // Two rings once there are more than a dozen neighbours, so labels have
    // somewhere to go and the ring does not become a solid band of circles.
    const split = others.length > 14
    const radius = Math.min(cx0, cy0) - 54

    const pos = new Map()
    if (hub) pos.set(hub.id, { x: cx0, y: cy0, r: 13, node: hub })
    others.forEach((n, i) => {
      const ring = split && i % 2 ? 0.66 : 1
      const count = split
        ? (i % 2 ? Math.floor(others.length / 2) : Math.ceil(others.length / 2))
        : others.length
      const idx = split ? Math.floor(i / 2) : i
      const a = (idx / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2
      pos.set(n.id, {
        x: cx0 + Math.cos(a) * radius * ring,
        y: cy0 + Math.sin(a) * radius * ring,
        r: 7, node: n,
      })
    })

    // Edges first, so nodes sit on top. Width and brightness follow the
    // model's own attention — the thing it thought mattered is the thing
    // drawn most strongly.
    const maxAtt = Math.max(...graph.edges.map((e) => e.attention ?? 0), 0.0001)
    graph.edges.forEach((e) => {
      const a = pos.get(e.source)
      const b = pos.get(e.target)
      if (!a || !b) return
      const w = (e.attention ?? 0) / maxAtt
      ctx.strokeStyle = `rgba(56,189,178,${0.16 + w * 0.6})`
      ctx.lineWidth = 0.7 + w * 2.1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    })

    pos.forEach((p, id) => {
      const n = p.node
      const risky = (n.score ?? 0) >= 0.09
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = n.is_centre ? '#2dd4bf' : risky ? '#d97706' : '#334155'
      ctx.fill()
      if (id === hover) {
        ctx.strokeStyle = 'rgba(255,255,255,.85)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      layoutRef.current.push({ id, ...p })
    })

    // Label the centre and anything scoring above the medium band. Labelling
    // every node turns the ring into unreadable overlap.
    ctx.font = '11px ui-monospace, SFMono-Regular, monospace'
    ctx.textAlign = 'center'
    pos.forEach((p, id) => {
      const n = p.node
      if (!n.is_centre && (n.score ?? 0) < 0.09 && id !== hover) return
      ctx.fillStyle = n.is_centre ? '#e2e8f0' : '#cbd5e1'
      ctx.fillText(id, p.x, p.y - p.r - 6)
    })
  }, [graph, hover])

  const hit = (evt) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const r = canvas.getBoundingClientRect()
    const x = evt.clientX - r.left
    const y = evt.clientY - r.top
    return layoutRef.current.find(
      (p) => (x - p.x) ** 2 + (y - p.y) ** 2 <= (p.r + 5) ** 2) ?? null
  }

  const counts = graph?.counts
  const off = settings && settings.enabled === false

  return (
    <ConsoleShell
      eyebrow="Explore"
      title="The payment graph"
      lede="Search an account to see the network around it. The graph is 3.27M accounts; this loads only what you are looking at."
    >
      {error && <Alert tone="danger">{error}</Alert>}

      {off ? (
        <Alert tone="warning">
          The graph explorer is switched off.{' '}
          {isAdmin ? 'Turn it back on below.' : 'An administrator can turn it back on.'}
        </Alert>
      ) : (
        <>
          <form
            onSubmit={(e) => { e.preventDefault(); load(query.trim()) }}
            className="flex flex-wrap items-center gap-3"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Account, e.g. C1166671647"
              className="numeric w-64 rounded-md border px-3 py-2 text-[13px]"
              style={{ borderColor: 'rgb(var(--ds-line))',
                       background: 'rgb(var(--ds-surface))',
                       color: 'rgb(var(--ds-ink))' }}
            />
            <Button type="submit" loading={loading} disabled={!query.trim()}>
              {loading ? 'Loading…' : 'Show the network'}
            </Button>
            <label className="flex items-center gap-2 text-[12px]"
                   style={{ color: 'rgb(var(--ds-muted))' }}>
              Hops
              <select
                value={hops}
                onChange={(e) => {
                  const h = Number(e.target.value)
                  setHops(h)
                  if (centre) load(centre, h, false)
                }}
                className="rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: 'rgb(var(--ds-line))',
                         background: 'rgb(var(--ds-surface))',
                         color: 'rgb(var(--ds-ink))' }}
              >
                <option value={1}>1</option>
                <option value={2} disabled={settings?.max_hops < 2}>2</option>
              </select>
            </label>
          </form>

          {trail.length > 1 && (
            <p className="text-[11px]" style={{ color: 'rgb(var(--ds-faint))' }}>
              {trail.map((a, i) => (
                <span key={`${a}-${i}`}>
                  {i > 0 && ' → '}
                  <button onClick={() => load(a, hops, false)}
                          className="underline decoration-dotted underline-offset-2">
                    {a}
                  </button>
                </span>
              ))}
            </p>
          )}

          <div className="overflow-hidden rounded-xl border"
               style={{ borderColor: 'rgb(var(--ds-line))',
                        background: 'rgb(var(--ds-surface))' }}>
            <canvas
              ref={canvasRef}
              style={{ display: 'block', width: '100%', height: FRAME_H,
                       cursor: hover ? 'pointer' : 'default' }}
              onMouseMove={(e) => setHover(hit(e)?.id ?? null)}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                const h = hit(e)
                if (h && h.id !== centre) { setQuery(h.id); load(h.id) }
              }}
            />
            {!graph && !loading && (
              <p className="pb-6 text-center text-xs" style={{ color: 'rgb(var(--ds-faint))' }}>
                Nothing loaded. Search an account above.
              </p>
            )}
          </div>

          {counts && (
            <p className="text-[11px]" style={{ color: 'rgb(var(--ds-muted))' }}>
              {counts.nodes_returned} accounts, {counts.edges_returned} transfers
              {counts.truncated
                ? ` — ${counts.edges_in_ball} exist here, showing the ${counts.edges_returned}
                    the model weighted most heavily`
                : ''}
              . Teal is the account you searched, amber scores above the medium
              band, and a thicker line is an edge the model attended to more.
              Click any account to move there.
            </p>
          )}
        </>
      )}

      {isAdmin && settings && (
        <div className="mt-6 rounded-xl border p-4"
             style={{ borderColor: 'rgb(var(--ds-line))' }}>
          <p className="text-[13px] font-semibold" style={{ color: 'rgb(var(--ds-ink))' }}>
            Explorer availability
          </p>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
            Every search walks the served graph. Switching this off during a
            demo keeps the network detector free for the pipeline.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              variant={settings.enabled ? 'ghost' : 'primary'}
              onClick={async () => {
                const next = await setGraphSettings({ enabled: !settings.enabled })
                setSettings(next)
              }}
            >
              {settings.enabled ? 'Switch off' : 'Switch on'}
            </Button>
            <span className="text-[11px]" style={{ color: 'rgb(var(--ds-faint))' }}>
              Currently {settings.enabled ? 'on' : 'off'} · up to {settings.max_hops} hop
              {settings.max_hops === 1 ? '' : 's'}, {settings.max_edges} transfers
            </span>
          </div>
        </div>
      )}
    </ConsoleShell>
  )
}
