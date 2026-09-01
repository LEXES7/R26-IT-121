import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getGraphSettings, setGraphSettings, getNeighbourhood,
  demoScoreAccount, demoScoreCsv,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Input, cx } from '../components/ui'
import ConsoleShell from '../components/ConsoleShell'
import DetectorRuntime from '../components/DetectorRuntime'
import GraphModelPanel from '../components/GraphModelPanel'
import Validation from '../components/Validation'

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

// The hubs sit on an ellipse sized from the frame, but that ellipse is
// width-dominated: dropping from 620 moves the closest pair by 15px and the
// layout was only ever using ~36% of the height. So the frame can be shorter
// without crowding anything, and the page stops needing a scroll to see the
// caption under it.
const FRAME_H = 480
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

  // Closed until asked for. The explorer is the one screen that makes the
  // network detector do real work, and a page that quietly loads a few hundred
  // nodes on every visit is how a demo machine runs out of memory.
  const [expanded, setExpanded] = useState(false)

  /* Move the view rather than jump it.
   *
   * Every recentre used to be an instant setView, which on a graph this size
   * is disorienting: the picture is replaced and you have to find your place
   * again. Gliding costs nothing and keeps the eye anchored — the node you
   * asked for is the one thing that does not move.
   *
   * The tween writes state each frame rather than driving the canvas
   * directly, because the draw effect already depends on `view`; a second
   * path into the canvas would be two sources of truth for where we are. */
  const tweenRef = useRef(0)
  const viewRef = useRef({ x: 0, y: 0, z: 1 })
  const glideTo = useCallback((target, ms = 620) => {
    cancelAnimationFrame(tweenRef.current)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setView((v) => ({ ...v, ...target }))
      return
    }
    let from = null
    const t0 = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms)
      // easeOutCubic: quick to leave, gentle to arrive.
      const e = 1 - (1 - k) ** 3
      setView((v) => {
        if (!from) from = { x: v.x, y: v.y, z: v.z }
        return {
          x: from.x + ((target.x ?? from.x) - from.x) * e,
          y: from.y + ((target.y ?? from.y) - from.y) * e,
          z: from.z + ((target.z ?? from.z) - from.z) * e,
        }
      })
      if (k < 1) tweenRef.current = requestAnimationFrame(step)
    }
    tweenRef.current = requestAnimationFrame(step)
  }, [])

  useEffect(() => () => cancelAnimationFrame(tweenRef.current), [])

  // ── Demo mode ──────────────────────────────────────────────────────────
  // Folded into this page rather than living on its own, because the point of
  // the demo is the picture: an account that did not exist gets scored, and
  // then appears in the graph attached to whoever it transacted with. Split
  // across two pages that story needs a tab change in the middle of the
  // sentence.
  const [demo, setDemo] = useState(false)
  const [csv, setCsv] = useState(null)
  const [csvBusy, setCsvBusy] = useState(false)
  // Kept separate from the page-level error, which renders at the very top:
  // a rejected upload has to say so next to the button that was pressed.
  const [csvError, setCsvError] = useState(null)
  const [addError, setAddError] = useState(null)
  const fileRef = useRef(null)
  const [newAccount, setNewAccount] = useState('DEMO-NEW-001')
  const [from, setFrom] = useState('C1988852187')
  const [amount, setAmount] = useState('404394.04')
  const [runs, setRuns] = useState([])
  const [scoring, setScoring] = useState(false)
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
        glideTo({ z: Math.min(3, viewRef.current.z * 1.35) }, 320)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        glideTo({ z: Math.max(0.35, viewRef.current.z / 1.35) }, 320)
      } else if (e.key === '0') {
        e.preventDefault()
        glideTo({ x: 0, y: 0, z: 1 }, 460)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
    // Re-run when the explorer opens: the frame does not exist while it is
    // closed, so binding once on mount would attach to nothing and the arrow
    // keys would silently do nothing for the rest of the session.
  }, [expanded, glideTo])

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
      // The searched account is laid out at the centre, so the view only has
      // to settle back to the origin — done as a short zoom-out from slightly
      // in, which reads as arriving rather than cutting.
      setView({ x: 0, y: 0, z: 1.22 })
      glideTo({ x: 0, y: 0, z: 1 }, 560)
      if (remember) {
        setTrail((t) => (t[t.length - 1] === account ? t : [...t, account]).slice(-8))
      }
    } catch (err) {
      setError(err?.userMessage ?? `Could not load ${account}.`)
      setGraph(null)
    } finally {
      setLoading(false)
    }
  }, [hops, scope, glideTo])

  /* Score an account that does not exist, then draw it where it landed.
   *
   * The two halves matter equally. The number shows the network answered; the
   * picture shows what it answered *from* — the invented node sitting among
   * real accounts, connected to the one it transacted with. Nothing is written
   * anywhere: the node exists in this response and in this canvas.
   */
  const scoreInvented = useCallback(async () => {
    const account = newAccount.trim()
    const neighbour = from.trim()
    if (!account || !neighbour) return

    // Checked here as well as on the server. These are the values this panel
    // lets someone edit, so this is where a wrong one should be caught — the
    // server refuses the same things, and says so if this is ever bypassed.
    const value = Number(amount)
    if (account === neighbour) {
      setAddError('An account cannot receive from itself. '
                  + 'Name a different sender.')
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setAddError(`'${amount}' is not an amount. Enter a number above zero.`)
      return
    }

    setScoring(true)
    setAddError(null)
    try {
      const r = await demoScoreAccount(account, [{
        step: 705, type: 'TRANSFER', amount: value,
        nameOrig: neighbour, nameDest: account,
        oldbalanceOrg: value, newbalanceOrig: 0,
        oldbalanceDest: 0, newbalanceDest: value,
      }])
      setRuns((prev) => [{ from: neighbour, score: r.raw_score,
                           accounts: r.provenance.neighbourhood_accounts,
                           at: Date.now() }, ...prev].slice(0, 8))

      // Draw it into its neighbour's network. The layout places it by its
      // connections like every other node, which is the point — nothing
      // positions it specially, it lands next to what it is attached to.
      const d = await getNeighbourhood(neighbour, { scope, hops })
      setGraph({
        ...d,
        nodes: [...d.nodes,
                { id: account, score: r.raw_score, in_degree: 1, out_degree: 0,
                  invented: true }],
        edges: [...d.edges, { source: neighbour, target: account, attention: 0 }],
      })
      setCentre(neighbour)
      setView({ x: 0, y: 0, z: 1 })
    } catch (err) {
      setAddError(err?.userMessage ?? 'The relational model did not answer.')
    } finally {
      setScoring(false)
    }
  }, [newAccount, from, amount, scope, hops])

  const onDemoFile = useCallback(async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setCsvBusy(true); setCsvError(null)
    try {
      setCsv(await demoScoreCsv(f))
    } catch (err) {
      setCsvError(err?.userMessage ?? 'That file could not be scored.')
      setCsv(null)
    } finally {
      setCsvBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [])

  /* Closing does not just hide the graph — it drops it.
   *
   * Leaving a loaded neighbourhood in state while the panel is collapsed keeps
   * the nodes, the edges and the layout resident for the rest of the session,
   * which is precisely the cost the switch exists to avoid. */
  const toggleExplorer = useCallback(() => {
    setExpanded((was) => {
      if (was) {
        setGraph(null)
        setCentre(null)
        setTrail([])
        setHover(null)
        setError(null)
        setCsv(null)
        setRuns([])
        setDemo(false)
        setView({ x: 0, y: 0, z: 1 })
      }
      return !was
    })
  }, [])

  // ── layout ────────────────────────────────────────────────────────────
  //
  // Structural, not a force simulation. A generic force pass scatters this
  // graph into a starburst because it has no idea what the nodes mean; the
  // graph is in fact hub-and-spoke — collectors with senders converging — and
  // a layout that knows that reads immediately.
  //
  // Collectors are placed on a ring, well apart. Each collector's senders sit
  // in arcs on the far side of it, facing away from the middle, so no cluster
  // grows into another. Senders that paid more than one collector go on the
  // line between them, which is where they belong: they are the only reason
  // the component is one network rather than several.
  /* A deterministic wobble per node.
   *
   * The layout was exact — every spoke on the same ring, every angle evenly
   * spaced — and exactness is what made it read as a diagram of a network
   * rather than a network. Real ones are irregular. Seeding from the account
   * id rather than Math.random keeps that irregularity identical across
   * redraws, so the picture does not shimmer when you pan. */
  const wobble = (id, salt) => {
    let h = 2166136261
    const str = `${id}:${salt}`
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return ((h >>> 0) % 10000) / 10000        // 0..1
  }

  /* A starfield with depth, tiled so it never runs out.
   *
   * The old field was 150 specks painted in screen space: they did not move
   * when you panned and did not spread when you zoomed, so the graph slid
   * across a fixed backdrop and the zoom felt like scaling a picture.
   *
   * Three layers at different depths fix that. A layer at depth d takes only
   * d of the pan and d of the zoom, so the near field slides past quickly
   * while the far field barely stirs — the parallax the eye reads as distance.
   * Positions are modulo a tile, so panning any distance keeps finding stars
   * instead of running off the edge of a generated patch. */
  const starsRef = useRef(null)
  const stars = (() => {
    if (starsRef.current) return starsRef.current
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const layers = [
      { depth: 0.14, n: 190, size: 0.9, alpha: 0.20 },   // far, almost fixed
      { depth: 0.42, n: 110, size: 1.3, alpha: 0.34 },
      { depth: 0.78, n: 46, size: 2.0, alpha: 0.52 },    // near, races past
    ].map((L) => ({
      ...L,
      pts: Array.from({ length: L.n }, () => ({
        x: rnd(), y: rnd(), r: 0.3 + rnd() * L.size, a: 0.05 + rnd() * L.alpha,
      })),
    }))
    starsRef.current = layers
    return layers
  })()

  const layout = useCallback((g, vw, vh) => {
    const W = vw * WORLD
    const H = vh * WORLD
    const cx = W / 2
    const cy = H / 2
    const byId = new Map(g.nodes.map((n) => [n.id, { ...n, x: cx, y: cy }]))

    // Who a node is attached to, so it can be placed beside them.
    //
    // Both directions, deliberately. Reading only source -> target placed a
    // node by who it *pays*, which is right for a sender and silently wrong
    // for anything that only receives: with no outgoing edge it matched
    // nothing and fell through to the default branch, landing in the first
    // collector's cluster whoever it had actually transacted with. An account
    // added in demo mode only ever receives, so it was placed correctly only
    // by the accident of its sender happening to be the searched account.
    const attachedTo = new Map()
    const link = (a, b) => {
      if (!attachedTo.has(a)) attachedTo.set(a, [])
      attachedTo.get(a).push(b)
    }
    g.edges.forEach((e) => { link(e.source, e.target); link(e.target, e.source) })

    // Collectors: anything two or more accounts pay into, biggest first. The
    // searched account is always treated as one so it keeps the middle.
    const hubs = g.nodes
      .filter((n) => n.in_degree >= 2 || n.is_centre)
      .sort((a, b) => (b.is_centre - a.is_centre) || (b.in_degree - a.in_degree))
    const hubIds = new Set(hubs.map((h) => h.id))

    // Collectors on an ellipse rather than a circle, sized to the frame. A
    // circle in a 2:1 world leaves the sides empty and stacks everything down
    // the middle — with two collectors either side of the centre it put all
    // three on one vertical line and used 15% of the available width.
    // Pushed out from 0.30/0.26: the clusters were compact balls sitting in
    // the middle third of a mostly empty frame.
    const rx = W * 0.36
    const ry = H * 0.32
    const others = hubs.filter((x) => !x.is_centre)
    hubs.forEach((h) => {
      const node = byId.get(h.id)
      if (hubs.length === 1 || h.is_centre) { node.x = cx; node.y = cy; return }
      const k = others.findIndex((x) => x.id === h.id)
      // Tilted off the axes. Two collectors either side of a centre are always
      // collinear with it, so an unrotated ring lays all three along one edge
      // of the frame — vertically at offset 0, horizontally at a quarter turn,
      // using a third of the space either way. 0.6rad puts the line on a
      // diagonal, which measured best across both axes: 62% of the width and
      // 54% of the height, with 23px between the closest pair.
      const a = (k / others.length) * Math.PI * 2 + 0.6
      node.x = cx + Math.cos(a) * rx
      node.y = cy + Math.sin(a) * ry
    })

    // Senders, grouped by the collector they paid.
    const groups = new Map(hubs.map((h) => [h.id, []]))
    const bridges = []
    g.nodes.forEach((n) => {
      if (hubIds.has(n.id)) return
      const targets = [...new Set(attachedTo.get(n.id) ?? [])]
        .filter((t) => hubIds.has(t))
      if (targets.length > 1) bridges.push({ node: n, targets })
      else if (targets.length === 1) groups.get(targets[0]).push(n)
      else (groups.get(hubs[0]?.id) ?? []).push(n)
    })

    groups.forEach((members, hubId) => {
      if (!members.length) return
      const hub = byId.get(hubId)
      // Face away from the middle, so clusters open outward instead of
      // overlapping. A lone hub fans out in every direction.
      const away = hubs.length === 1
        ? 0 : Math.atan2(hub.y - cy, hub.x - cx)
      const full = hubs.length === 1 ? Math.PI * 2 : Math.PI * 1.25
      // Rings sized so arc length between neighbours stays readable rather
      // than packing everything onto one circle.
      const perRing = Math.max(7, Math.ceil(Math.sqrt(members.length) * 2.6))
      members.forEach((m, i) => {
        const ring = Math.floor(i / perRing)
        const inRing = members.slice(ring * perRing, (ring + 1) * perRing).length
        const idx = i % perRing
        const t = inRing === 1 ? 0.5 : idx / (inRing - 1)
        // Both the angle and the distance carry a per-node offset, so the
        // spokes stop landing on a perfect circle at even spacing.
        const jitterA = (wobble(m.id, 'a') - 0.5) * (full / Math.max(6, inRing)) * 1.5
        const jitterR = 0.72 + wobble(m.id, 'r') * 0.62
        const r = (104 + ring * 88) * jitterR
        const a = away + (t - 0.5) * full + jitterA
        const node = byId.get(m.id)
        node.x = hub.x + Math.cos(a) * r
        node.y = hub.y + Math.sin(a) * r
      })
    })

    // Bridges sit midway between the collectors they paid, nudged outward so
    // they are not hidden under the line joining them.
    bridges.forEach(({ node: n, targets }, i) => {
      const pts = targets.map((t) => byId.get(t)).filter(Boolean)
      const mx = pts.reduce((s, p2) => s + p2.x, 0) / pts.length
      const my = pts.reduce((s, p2) => s + p2.y, 0) / pts.length
      const off = (i % 2 ? 1 : -1) * (34 + Math.floor(i / 2) * 26)
      const dx = (pts[1]?.x ?? mx) - (pts[0]?.x ?? mx)
      const dy = (pts[1]?.y ?? my) - (pts[0]?.y ?? my)
      const len = Math.hypot(dx, dy) || 1
      const node = byId.get(n.id)
      node.x = mx + (-dy / len) * off
      node.y = my + (dx / len) * off
      node.is_bridge = true
    })

    const nodes = [...byId.values()]
    const links = g.edges
      .map((e) => ({ a: byId.get(e.source), b: byId.get(e.target), e }))
      .filter((l) => l.a && l.b)
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
    const bg = ctx.createRadialGradient(
      W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7 * (0.62 + view.z * 0.5))
    bg.addColorStop(0, '#0b2430')
    bg.addColorStop(1, '#05121a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // The field, one layer at a time, each taking its own share of the view.
    const TW = W * 1.6
    const TH = H * 1.6
    stars.forEach(({ depth, pts }) => {
      // A layer only feels `depth` of the zoom, so the near field spreads
      // fast and the far field holds — which is what makes moving in read as
      // travelling rather than as scaling.
      const z = 1 + (view.z - 1) * depth
      const px = view.x * depth
      const py = view.y * depth
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i]
        // Tile, so panning keeps finding stars instead of leaving a void.
        let x = (p.x * TW + px) % TW
        let y = (p.y * TH + py) % TH
        if (x < 0) x += TW
        if (y < 0) y += TH
        const sx = W / 2 + (x - TW / 2) * z
        const sy = H / 2 + (y - TH / 2) * z
        if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue
        ctx.fillStyle = `rgba(180,235,255,${p.a})`
        ctx.beginPath()
        ctx.arc(sx, sy, p.r * (0.7 + z * 0.4), 0, Math.PI * 2)
        ctx.fill()
      }
    })
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
      const deg = (n.in_degree ?? 0) + (n.out_degree ?? 0)
      // A wider spread than before. Everything used to land between 5 and 14
      // pixels, so a collector taking forty accounts looked much like the
      // accounts feeding it — and the shape is the whole point.
      const r = n.is_centre ? 26 : n.invented ? 15
        : 3.4 + Math.pow(Math.max(deg, 0) / maxDeg, 0.62) * 17
      const risky = (n.score ?? 0) >= 0.09
      const hot = n.id === hover

      // Halo. An invented account gets its own colour so nobody in the room
      // has to take on trust which node is the one that was just added.
      const g1 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.4)
      // Role, not just risk. A collector, an account that only pays, and one
      // that does both are three different things in a fraud network, and
      // colouring them alike threw that away — every dot was the same blue, so
      // the picture said nothing until you read the labels.
      const collector = (n.in_degree ?? 0) >= 2
      const bridge = (n.in_degree ?? 0) > 0 && (n.out_degree ?? 0) > 0
      const tint = n.invented ? '196,132,252'
        : risky ? '255,176,72'
          : bridge ? '167,139,250'
            : collector ? '56,208,255'
              : '74,222,160'
      g1.addColorStop(0, `rgba(${tint},${n.is_centre ? 0.5 : 0.32})`)
      g1.addColorStop(0.5, `rgba(${tint},0.10)`)
      g1.addColorStop(1, `rgba(${tint},0)`)
      ctx.fillStyle = g1
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.4, 0, Math.PI * 2); ctx.fill()

      // Sphere: a bright core falling off to a rim.
      const g2 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r)
      g2.addColorStop(0, '#f2ffff')
      g2.addColorStop(0.34, `rgb(${tint})`)
      g2.addColorStop(1, `rgba(${tint},.28)`)
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
    ctx.font = '12px ui-monospace, SFMono-Regular, monospace'
    ctx.textAlign = 'center'
    nodes.forEach((n) => {
      const risky = (n.score ?? 0) >= 0.09
      if (!n.is_centre && !risky && !n.invented && n.id !== hover) return
      const deg = (n.in_degree ?? 0) + (n.out_degree ?? 0)
      // A wider spread than before. Everything used to land between 5 and 14
      // pixels, so a collector taking forty accounts looked much like the
      // accounts feeding it — and the shape is the whole point.
      const r = n.is_centre ? 26 : n.invented ? 15
        : 3.4 + Math.pow(Math.max(deg, 0) / maxDeg, 0.62) * 17
      const text = n.id
      const w = ctx.measureText(text).width
      ctx.fillStyle = 'rgba(3,16,22,.72)'
      ctx.fillRect(n.x - w / 2 - 5, n.y - r - 23, w + 10, 17)
      ctx.fillStyle = n.invented ? '#eaddff' : n.is_centre ? '#dffbff' : '#cfe6ee'
      ctx.fillText(text, n.x, n.y - r - 11)
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

  viewRef.current = view

  const counts = graph?.counts
  const off = settings && settings.enabled === false

  return (
    <ConsoleShell
      eyebrow="Explore"
      title="The payment graph"
      subtitle="Search an account to see the network around it."
    >
      {error && <Alert tone="error">{error}</Alert>}

      <div style={{ display: "grid", gap: 18 }}>
      <DetectorRuntime detector="graph" model="Edge-Enhanced GraphSAGE" />
      {/* One switch, at the top, before anything else.
        *
        * The explorer is the only screen here that can put real load on the
        * network detector: every search walks the served graph. Closed it
        * fetches nothing and holds nothing, and closing it drops whatever was
        * loaded rather than leaving a few hundred nodes resident for the rest
        * of the session. So it opens on request, like a map that streams in
        * only once you look at it. */}
      <div className="flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 py-3"
           style={{
             borderColor: 'rgb(var(--ds-line))',
             background: 'rgb(var(--ds-surface-2))',
             // The rail is the state: lit when open, inert when closed, amber
             // when an administrator has taken it away entirely.
             boxShadow: `inset 4px 0 0 0 ${off ? 'rgb(var(--ds-sev-high))'
               : expanded ? 'rgb(var(--ds-accent))' : 'rgb(var(--ds-line))'}`,
           }}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={expanded}
            aria-label="Graph explorer"
            disabled={off}
            onClick={toggleExplorer}
            style={{
              width: 44, height: 24, borderRadius: 999, padding: 3,
              display: 'flex', alignItems: 'center',
              justifyContent: expanded ? 'flex-end' : 'flex-start',
              background: expanded ? 'rgb(var(--ds-accent))' : 'rgb(var(--ds-line))',
              opacity: off ? 0.4 : 1,
              cursor: off ? 'not-allowed' : 'pointer',
              transition: 'background .15s',
            }}
          >
            <span style={{ width: 18, height: 18, borderRadius: 999,
                           background: '#fff', display: 'block' }} />
          </button>
          <div>
            <p className="text-[17px] font-semibold" style={{ color: 'rgb(var(--ds-ink))' }}>
              {off ? 'Switched off by an administrator'
                : expanded ? 'Explorer is open' : 'Explorer is closed'}
            </p>
            <p className="text-[15px]" style={{ color: 'rgb(var(--ds-muted))' }}>
              {off
                ? 'The network detector is reserved for the pipeline.'
                : expanded
                  ? 'Search an account to see its network.'
                  : 'Nothing is loaded until you open it.'}
            </p>
          </div>
        </div>

        {expanded && !off && (
          <Button size="sm" variant={demo ? 'primary' : 'secondary'}
                  onClick={() => setDemo((v) => !v)}>
            {demo ? 'Demo mode is on' : 'Demo mode'}
          </Button>
        )}
      </div>

      {!off && expanded && (
        <>
            <form
              onSubmit={(e) => { e.preventDefault(); load(query.trim()) }}
              className="flex flex-wrap items-center gap-3"
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Account, e.g. C1166671647"
                className="numeric w-64 rounded-md border px-3 py-2 text-[17px]"
                style={{ borderColor: 'rgb(var(--ds-line))',
                         background: 'rgb(var(--ds-surface))',
                         color: 'rgb(var(--ds-ink))' }}
              />
              <Button type="submit" loading={loading} disabled={!query.trim()}>
                {loading ? 'Loading…' : 'Show the network'}
              </Button>
              <span className="text-[15px]" style={{ color: 'rgb(var(--ds-faint))' }}>
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
              <label className="flex items-center gap-2 text-[16px]"
                     style={{ color: 'rgb(var(--ds-muted))' }}>
                Hops
                <select
                  value={hops}
                  onChange={(e) => {
                    const h = Number(e.target.value)
                    setHops(h)
                    if (centre) load(centre, h, false)
                  }}
                  className="rounded-md border px-2 py-1 text-[16px]"
                  style={{ borderColor: 'rgb(var(--ds-line))',
                           background: 'rgb(var(--ds-surface))',
                           color: 'rgb(var(--ds-ink))' }}
                >
                  <option value={1}>1</option>
                  <option value={2} disabled={settings?.max_hops < 2}>2</option>
                </select>
              </label>
            </form>

            {demo && (
              <section className="rounded-xl border"
                       style={{ borderColor: 'rgba(168,85,247,.35)',
                                background: 'rgba(168,85,247,.05)' }}>
                <div className="grid gap-px md:grid-cols-[1.15fr_1fr]"
                     style={{ background: 'rgba(168,85,247,.18)' }}>

                  {/* ── Invent an account ───────────────────────────────────── */}
                  <div className="p-4" style={{ display: 'grid', gap: 12,
                                                background: 'rgb(var(--ds-surface))',
                                                alignContent: 'start' }}>
                    <div>
                      <p className="ds-mono text-[14px] uppercase tracking-wider"
                         style={{ color: 'rgb(var(--ds-faint))' }}>
                        Invent an account
                      </p>
                      <p className="mt-1 text-[15px] leading-relaxed"
                         style={{ color: 'rgb(var(--ds-muted))' }}>
                        Change the sender and score again.
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      {[['New account', newAccount, setNewAccount],
                        ['Received from', from, setFrom],
                        ['Amount', amount, setAmount]].map(([label, value, set]) => (
                        <label key={label} style={{ display: 'grid', gap: 3 }}>
                          <span className="ds-mono text-[13px] uppercase tracking-wider"
                                style={{ color: 'rgb(var(--ds-faint))' }}>{label}</span>
                          <Input value={value} onChange={(e) => set(e.target.value)} />
                        </label>
                      ))}
                    </div>
                    <Button size="sm" onClick={scoreInvented} loading={scoring}
                            disabled={!newAccount.trim() || !from.trim()}>
                      Score and place it in the graph
                    </Button>

                    {/* Why it was not added, said where the button is. Nothing
                        reaches the graph until these transactions describe a
                        ledger that could exist. */}
                    {addError && <Alert tone="error">{addError}</Alert>}

                    {runs.length > 0 && (() => {
                      const top = Math.max(...runs.map((r) => r.score), 0.0001)
                      const spread = new Set(runs.map((r) => r.score)).size
                      return (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div className="flex items-baseline gap-2">
                            <span className="numeric text-[38px] leading-none"
                                  style={{ color: '#c084fc' }}>
                              {runs[0].score.toFixed(4)}
                            </span>
                            <span className="text-[14px]" style={{ color: 'rgb(var(--ds-faint))' }}>
                              raw · from {runs[0].accounts.toLocaleString()} accounts
                            </span>
                          </div>

                          {/* The comparison, drawn. A panel at the back of the room
                              reads bar lengths; it does not read four decimals. */}
                          <div style={{ display: 'grid', gap: 4 }}>
                            {runs.map((r, i) => (
                              <div key={r.at} className="flex items-center gap-2">
                                <span className="numeric w-[110px] shrink-0 truncate text-[14px]"
                                      title={r.from}
                                      style={{ color: 'rgb(var(--ds-muted))' }}>{r.from}</span>
                                <span className="h-[6px] flex-1 rounded"
                                      style={{ background: 'rgb(var(--ds-line))' }}>
                                  <span className="block h-full rounded"
                                        style={{ width: `${Math.max(2, (r.score / top) * 100)}%`,
                                                 background: i === 0 ? '#c084fc'
                                                   : 'rgba(168,85,247,.45)' }} />
                                </span>
                                <span className="numeric w-[62px] shrink-0 text-right text-[14px]"
                                      style={{ color: 'rgb(var(--ds-ink))' }}>
                                  {r.score.toFixed(4)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {runs.length > 1 && (
                            <p className="text-[14px]"
                               style={{ color: spread > 1 ? '#c084fc' : 'rgb(var(--ds-muted))' }}>
                              {spread > 1
                                ? `${spread} different scores across ${runs.length} runs — only the sender changed.`
                                : 'Same score so far. Try a different sender.'}
                            </p>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* ── A file, through this model alone ────────────────────── */}
                  <div className="p-4" style={{ display: 'grid', gap: 10,
                                                background: 'rgb(var(--ds-surface))',
                                                alignContent: 'start' }}>
                    <div>
                      <p className="ds-mono text-[14px] uppercase tracking-wider"
                         style={{ color: 'rgb(var(--ds-faint))' }}>
                        Or score a file
                      </p>
                      <p className="mt-1 text-[15px] leading-relaxed"
                         style={{ color: 'rgb(var(--ds-muted))' }}>
                        This model only. No fusion.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input ref={fileRef} type="file" accept=".csv,text/csv"
                             onChange={onDemoFile} className="hidden" />
                      <Button size="sm" variant="secondary" loading={csvBusy}
                              onClick={() => fileRef.current?.click()}>
                        Upload a CSV
                      </Button>
                      {csv && (
                        <span className="numeric text-[14px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                          {csv.counts.precomputed} looked up · {csv.counts.inductive} new
                          · {csv.counts.unscored} not scoreable
                        </span>
                      )}
                    </div>

                    {/* Why the file was refused, said where the button is. */}
                    {csvError && <Alert tone="error">{csvError}</Alert>}

                    {/* Scored, but with something the reader should know. */}
                    {csv?.notes?.length > 0 && (
                      <p className="text-[14px] leading-relaxed"
                         style={{ color: 'rgb(var(--ds-sev-medium))' }}>
                        {csv.notes.join(' ')}
                      </p>
                    )}

                    {/* Scored at the model's own decision threshold, as it
                        publishes it. This read 0.39 — the critical band, more
                        than twice the line the model actually decides on —
                        which understated recall on every demo file. */}
                    {csv && (
                      <Validation rows={csv.rows}
                                  threshold={csv.bands?.high ?? 0.183}
                                  scoreOf={(r) => r.score} />
                    )}

                    {csv && (
                      <div style={{ overflow: 'auto', maxHeight: 210 }}>
                        <table className="w-full text-[14px]" style={{ borderCollapse: 'collapse' }}>
                          <thead className="sticky top-0"
                                 style={{ background: 'rgb(var(--ds-surface))' }}>
                            <tr style={{ color: 'rgb(var(--ds-faint))' }}>
                              {['To', 'Score', 'How'].map((h) => (
                                <th key={h}
                                    className="ds-mono px-2 py-1 text-left text-[13px] uppercase tracking-wider"
                                    style={{ borderBottom: '1px solid rgb(var(--ds-line))' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csv.rows.map((r) => (
                              <tr key={r.row}>
                                <td className="numeric px-2 py-1"
                                    style={{ color: 'rgb(var(--ds-ink))' }}>{r.nameDest}</td>
                                <td className="numeric px-2 py-1"
                                    style={{ color: r.score == null ? 'rgb(var(--ds-faint))'
                                      : 'rgb(var(--ds-ink))' }}>
                                  {r.score == null ? '—' : r.score.toFixed(4)}
                                </td>
                                <td className="px-2 py-1" style={{
                                  color: r.source === 'inductive' ? '#c084fc'
                                    : 'rgb(var(--ds-muted))' }}>
                                  {r.source === 'precomputed' ? 'in the graph'
                                    : r.source === 'inductive' ? 'new · from neighbours'
                                      : 'not scoreable'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* The caveat belongs with the numbers, but not above them. */}
                <p className="px-4 py-2 text-[14px] leading-relaxed"
                   style={{ color: 'rgb(var(--ds-faint))',
                            borderTop: '1px solid rgba(168,85,247,.18)' }}>
                  Raw model output, not calibrated. Runs are comparable with each other.
                </p>
              </section>
            )}

            {trail.length > 1 && (
              <p className="text-[15px]" style={{ color: 'rgb(var(--ds-faint))' }}>
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
                    if (h && h.id !== centre) {
                      // Glide the node you picked into the middle first, so
                      // the new network arrives where you were already
                      // looking rather than somewhere else entirely.
                      // The draw transform is
                      //   translate(W/2 + x, H/2 + y) · scale(z) · translate(-W/2, -H/2)
                      // so a world point lands at the middle when
                      //   x = -z (wx - W/2).  Solved, not guessed at.
                      const W = canvasRef.current?.clientWidth ?? 0
                      if (W) {
                        glideTo({
                          x: -view.z * (h.x - W / 2),
                          y: -view.z * (h.y - FRAME_H / 2),
                        }, 420)
                      }
                      setQuery(h.id)
                      setTimeout(() => load(h.id), 300)
                    }
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
              <p className="pointer-events-none absolute bottom-2 right-3 text-[14px]"
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
              <p className="text-[15px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                {counts.nodes_returned} accounts, {counts.edges_returned} transfers
                {counts.truncated
                  ? ` — ${counts.edges_in_ball} exist here, showing the ${counts.edges_returned}
                      the model weighted most heavily`
                  : ''}
                . Blue collects from two or more accounts, green only pays out,
                violet does both, and amber scores above the medium band. Size
                follows how many accounts touch it. Click any account to move
                there.
              </p>
            )}
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <GraphModelPanel />
      </div>

      {isAdmin && settings && (
        <div className="mt-6 rounded-xl border p-4"
             style={{ borderColor: 'rgb(var(--ds-line))' }}>
          <p className="text-[17px] font-semibold" style={{ color: 'rgb(var(--ds-ink))' }}>
            Explorer availability
          </p>
          <p className="mt-1 text-[15px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
            Switch off to keep the network detector free for the pipeline.
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
            <span className="text-[15px]" style={{ color: 'rgb(var(--ds-faint))' }}>
              Currently {settings.enabled ? 'on' : 'off'} · up to {settings.max_hops} hop
              {settings.max_hops === 1 ? '' : 's'}, {settings.max_edges} transfers
            </span>
          </div>
        </div>
      )}
      </div>
    </ConsoleShell>
  )
}
