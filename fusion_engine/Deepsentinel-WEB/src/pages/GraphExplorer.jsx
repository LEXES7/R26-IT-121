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
 * A small force layout, written here rather than pulled in: repulsion between
 * nodes, springs along transfers, the searched account pinned to the middle.
 * It is seeded, so the same account always draws the same picture — an
 * investigator comparing two accounts should not have to re-read a new
 * arrangement every visit.
 *
 * Worth knowing what this graph actually looks like, because it shapes the
 * view. Of 2,770,409 transfers, 2,766,854 senders have an out-degree of
 * exactly one, and only 686 accounts in the whole 3.3M have both senders and
 * receivers. So there is no second hop to speak of: the neighbourhood of an
 * account is a star, not a mesh, and asking for two hops returns the same
 * picture as one. The way to fill the frame is to land on a collector that
 * many accounts pay into — the busiest has 75 — not to reach further out.
 */

// Collectors with the most senders converging on them, measured off the
// served bundle. Offered as a starting point because a randomly chosen
// account has five neighbours and looks like nothing much.
// Entry points into the largest connected components — the only places in
// this graph where several collectors are genuinely linked, by senders who
// paid more than one of them. Everywhere else is an isolated star, so a
// randomly chosen account cannot show interconnection that is not there.
const BUSY = [
  ['C1988852187', '90 accounts, 3 collectors'],
  ['C1459757869', '83 accounts, 3 collectors'],
  ['C874023329', '74 accounts, 3 collectors'],
  ['C2083562754', '73 accounts, 2 collectors'],
]

const FRAME_H = 620
// The layout runs on a world larger than the frame, so there is somewhere to
// move to. Packing 90 accounts into 620px makes a dense blob; spreading them
// over twice that and letting the viewer travel makes the structure legible.
const WORLD = 2.1

export default function GraphExplorer() {
  const { isAdmin } = useAuth()
  const [settings, setSettings] = useState(null)
  const [query, setQuery] = useState('')
  const [graph, setGraph] = useState(null)
  const [centre, setCentre] = useState(null)
  const [hops, setHops] = useState(1)
  const [scope, setScope] = useState('component')
  const [trail, setTrail] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hover, setHover] = useState(null)
  // Where the viewer is looking. Kept in a ref as well as state: the draw
  // effect reads it every frame, and a drag would otherwise re-run the force
  // layout on every mouse move.
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const dragRef = useRef(null)
  const frameRef = useRef(null)
  const canvasRef = useRef(null)
  const layoutRef = useRef([])          // [{id, x, y, r, node}] for hit-testing

  // Arrow keys move the view; +/- zoom; 0 returns to the searched account.
  // Bound to the frame rather than the window so typing an account name in
  // the search box does not scroll the graph out from under you.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return undefined
    const onKey = (e) => {
      const step = e.shiftKey ? 160 : 60
      const moves = {
        ArrowLeft: [step, 0], ArrowRight: [-step, 0],
        ArrowUp: [0, step], ArrowDown: [0, -step],
      }
      if (moves[e.key]) {
        e.preventDefault()
        const [dx, dy] = moves[e.key]
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setView((v) => ({ ...v, z: Math.min(3, v.z * 1.18) }))
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        setView((v) => ({ ...v, z: Math.max(0.35, v.z / 1.18) }))
      } else if (e.key === '0') {
        e.preventDefault()
        setView({ x: 0, y: 0, z: 1 })
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    getGraphSettings().then(setSettings).catch(() => setSettings({ enabled: true }))
  }, [])

  const load = useCallback(async (account, h = hops, remember = true) => {
    if (!account) return
    setLoading(true)
    setError(null)
    try {
      const d = await getNeighbourhood(account, { scope, hops: h })
      setGraph(d)
      setCentre(account)
      setView({ x: 0, y: 0, z: 1 })
      if (remember) {
        setTrail((t) => (t[t.length - 1] === account ? t : [...t, account]).slice(-8))
      }
    } catch (err) {
      setError(err?.userMessage ?? `Could not load ${account}.`)
      setGraph(null)
    } finally {
      setLoading(false)
    }
  }, [hops, scope])

  // ── layout ────────────────────────────────────────────────────────────
  // A small force pass: neighbours repel, edges pull, and the whole thing is
  // held toward the middle. Deterministic — same graph, same picture — because
  // an investigator comparing two accounts should not have to re-read a new
  // arrangement each time.
  const layout = useCallback((g, vw, vh) => {
    const w = vw * WORLD
    const h = vh * WORLD
    const nodes = g.nodes.map((n, i) => {
      // Seeded spiral start. Random starts settle to a different shape on
      // every render, which makes the same account look like a different
      // network each time you visit it.
      const a = i * 2.399963
      const r = Math.sqrt(i + 0.5) * (Math.min(w, h) / 2.6) / Math.sqrt(g.nodes.length)
      return {
        ...n,
        x: n.is_centre ? w / 2 : w / 2 + Math.cos(a) * r,
        y: n.is_centre ? h / 2 : h / 2 + Math.sin(a) * r,
        vx: 0, vy: 0,
      }
    })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const links = g.edges
      .map((e) => ({ a: byId.get(e.source), b: byId.get(e.target), e }))
      .filter((l) => l.a && l.b)

    const pad = 60
    for (let step = 0; step < 190; step += 1) {
      const cool = 1 - step / 190
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const A = nodes[i]; const B = nodes[j]
          let dx = B.x - A.x; let dy = B.y - A.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) { dx = (i - j) || 1; dy = 1; d2 = 1 }
          // Collectors push each other apart much harder than leaves do.
          // Without this the hubs settle next to one another and the picture
          // reads as one blob when it is actually three lobes joined by two
          // accounts — which is the finding.
          const hubbish = (A.in_degree >= 3 ? 5 : 1) * (B.in_degree >= 3 ? 5 : 1)
          const f = (5200 * hubbish) / d2
          const d = Math.sqrt(d2)
          A.vx -= (dx / d) * f; A.vy -= (dy / d) * f
          B.vx += (dx / d) * f; B.vy += (dy / d) * f
        }
      }
      links.forEach(({ a, b }) => {
        const dx = b.x - a.x; const dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 1
        const f = (d - Math.min(w, h) / 7) * 0.012
        a.vx += (dx / d) * f; a.vy += (dy / d) * f
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      })
      nodes.forEach((n) => {
        if (n.is_centre) { n.x = w / 2; n.y = h / 2; n.vx = 0; n.vy = 0; return }
        n.x += (n.vx *= 0.82) * cool
        n.y += (n.vy *= 0.82) * cool
        n.x = Math.max(pad, Math.min(w - pad, n.x))
        n.y = Math.max(pad, Math.min(h - pad, n.y))
      })
    }
    return { nodes, links, byId }
  }, [])

  // ── draw ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    const W = rect.width
    const H = FRAME_H
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    layoutRef.current = []

    // Ground: a deep teal wash, brightest behind the centre.
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7)
    bg.addColorStop(0, '#0b2430')
    bg.addColorStop(1, '#05121a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Distant specks. Seeded, so they do not crawl between renders.
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let i = 0; i < 150; i += 1) {
      const x = rnd() * W; const y = rnd() * H; const r = rnd() * 1.1 + 0.3
      ctx.fillStyle = `rgba(180,235,255,${0.05 + rnd() * 0.22})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    if (!graph) return

    // Everything after this is drawn in world space; the viewer's pan and zoom
    // are one transform rather than an offset threaded through every call.
    ctx.save()
    ctx.translate(W / 2 + view.x, H / 2 + view.y)
    ctx.scale(view.z, view.z)
    ctx.translate(-W / 2, -H / 2)

    const { nodes, links } = layout(graph, W, H)
    const maxAtt = Math.max(...graph.edges.map((e) => e.attention ?? 0), 0.0001)
    const maxDeg = Math.max(...nodes.map((n) => n.in_degree + n.out_degree), 1)

    // Edges, drawn twice: a wide soft pass for the bloom, a thin bright core.
    links.forEach(({ a, b, e }) => {
      const w = (e.attention ?? 0) / maxAtt
      ctx.strokeStyle = `rgba(80,200,230,${0.05 + w * 0.10})`
      ctx.lineWidth = 3.5 + w * 4
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      ctx.strokeStyle = `rgba(150,240,255,${0.22 + w * 0.55})`
      ctx.lineWidth = 0.6 + w * 1.1
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    })

    nodes.forEach((n) => {
      const deg = n.in_degree + n.out_degree
      const r = n.is_centre ? 21 : 5 + Math.sqrt(deg / maxDeg) * 9
      const risky = (n.score ?? 0) >= 0.09
      const hot = n.id === hover

      // Halo.
      const g1 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.4)
      const tint = risky ? '255,176,72' : '64,224,240'
      g1.addColorStop(0, `rgba(${tint},${n.is_centre ? 0.5 : 0.32})`)
      g1.addColorStop(0.5, `rgba(${tint},0.10)`)
      g1.addColorStop(1, `rgba(${tint},0)`)
      ctx.fillStyle = g1
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.4, 0, Math.PI * 2); ctx.fill()

      // Sphere: a bright core falling off to a rim.
      const g2 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r)
      g2.addColorStop(0, risky ? '#fff0d0' : '#e8fdff')
      g2.addColorStop(0.35, risky ? '#ffb448' : '#43e0f0')
      g2.addColorStop(1, risky ? 'rgba(255,150,40,.30)' : 'rgba(40,190,220,.28)')
      ctx.fillStyle = g2
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill()

      // Wireframe, on the larger spheres only — meridians read as a globe at
      // 20px and as noise at 6px.
      if (r > 9) {
        ctx.strokeStyle = `rgba(190,250,255,${n.is_centre ? 0.5 : 0.32})`
        ctx.lineWidth = 0.6
        for (let k = 1; k <= 3; k += 1) {
          const rx = r * (k / 3.4)
          ctx.beginPath(); ctx.ellipse(n.x, n.y, rx, r, 0, 0, Math.PI * 2); ctx.stroke()
          ctx.beginPath(); ctx.ellipse(n.x, n.y, r, rx, 0, 0, Math.PI * 2); ctx.stroke()
        }
      }
      ctx.strokeStyle = hot ? 'rgba(255,255,255,.95)' : `rgba(${tint},.75)`
      ctx.lineWidth = hot ? 2 : 1
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.stroke()

      layoutRef.current.push({ id: n.id, x: n.x, y: n.y, r: Math.max(r, 9), node: n })
    })

    // Labels last, so nothing is drawn over them. The centre, anything risky,
    // and whatever is under the cursor — labelling every node turns a full
    // frame into overlapping text.
    ctx.font = '10px ui-monospace, SFMono-Regular, monospace'
    ctx.textAlign = 'center'
    nodes.forEach((n) => {
      const risky = (n.score ?? 0) >= 0.09
      if (!n.is_centre && !risky && n.id !== hover) return
      const deg = n.in_degree + n.out_degree
      const r = n.is_centre ? 21 : 5 + Math.sqrt(deg / maxDeg) * 9
      const text = n.id
      const w = ctx.measureText(text).width
      ctx.fillStyle = 'rgba(3,16,22,.72)'
      ctx.fillRect(n.x - w / 2 - 4, n.y - r - 20, w + 8, 14)
      ctx.fillStyle = n.is_centre ? '#dffbff' : '#cfe6ee'
      ctx.fillText(text, n.x, n.y - r - 9)
    })
    ctx.restore()
  }, [graph, hover, layout, view])

  // Screen point back to world point — the inverse of the transform the draw
  // applies. Without this, hit-testing is correct only at zoom 1 with no pan,
  // which is exactly the state nobody is in after they start looking around.
  const toWorld = (evt) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const r = canvas.getBoundingClientRect()
    const W = r.width
    const H = FRAME_H
    const sx = evt.clientX - r.left
    const sy = evt.clientY - r.top
    return {
      x: (sx - W / 2 - view.x) / view.z + W / 2,
      y: (sy - H / 2 - view.y) / view.z + H / 2,
    }
  }

  const hit = (evt) => {
    const w = toWorld(evt)
    if (!w) return null
    // The hit radius grows as you zoom out, so a node stays clickable when it
    // is drawn at four pixels.
    const slack = 5 / view.z
    return layoutRef.current.find(
      (p) => (w.x - p.x) ** 2 + (w.y - p.y) ** 2 <= (p.r + slack) ** 2) ?? null
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
            <span className="text-[11px]" style={{ color: 'rgb(var(--ds-faint))' }}>
              largest networks:{' '}
              {BUSY.map(([a, note], i) => (
                <span key={a}>
                  {i > 0 && ' · '}
                  <button type="button" title={note}
                          onClick={() => { setQuery(a); load(a) }}
                          className="numeric underline decoration-dotted underline-offset-2">
                    {a}
                  </button>
                </span>
              ))}
            </span>
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

          <div
            ref={frameRef}
            tabIndex={0}
            className="relative overflow-hidden rounded-xl border outline-none"
            style={{ borderColor: 'rgb(var(--ds-line))',
                     background: 'rgb(var(--ds-surface))' }}
          >
            <canvas
              ref={canvasRef}
              style={{ display: 'block', width: '100%', height: FRAME_H,
                       cursor: dragRef.current ? 'grabbing'
                             : hover ? 'pointer' : 'grab' }}
              onMouseDown={(e) => {
                frameRef.current?.focus()
                dragRef.current = { x: e.clientX, y: e.clientY,
                                    vx: view.x, vy: view.y, moved: false }
              }}
              onMouseMove={(e) => {
                const d = dragRef.current
                if (d) {
                  const dx = e.clientX - d.x
                  const dy = e.clientY - d.y
                  if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
                  setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
                  return
                }
                setHover(hit(e)?.id ?? null)
              }}
              onMouseUp={(e) => {
                const d = dragRef.current
                dragRef.current = null
                // A drag that happened to end on a node is not a click on it.
                if (d && !d.moved) {
                  const h = hit(e)
                  if (h && h.id !== centre) { setQuery(h.id); load(h.id) }
                }
              }}
              onMouseLeave={() => { dragRef.current = null; setHover(null) }}
              onWheel={(e) => {
                e.preventDefault()
                setView((v) => ({
                  ...v,
                  z: Math.max(0.35, Math.min(3, v.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))),
                }))
              }}
            />
            <p className="pointer-events-none absolute bottom-2 right-3 text-[10px]"
               style={{ color: 'rgb(var(--ds-faint))' }}>
              arrow keys move · +/− zoom · 0 recentres · drag to pan
            </p>
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
