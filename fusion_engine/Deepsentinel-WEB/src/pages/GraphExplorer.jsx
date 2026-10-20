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

// The score at which an account is drawn as high risk on the map.
const RISKY = 0.09

// What an account is in this network, by how money moves through it. Kept in
// one table so the map, the legend, the hover card and the inspector agree.
const ROLE = {
  invented: { rgb: '196,132,252', label: 'Added in demo' },
  risky: { rgb: '255,107,92', label: 'High risk' },
  bridge: { rgb: '179,166,245', label: 'Pays and receives' },
  collector: { rgb: '125,180,255', label: 'Collects from 2+' },
  pays: { rgb: '190,244,228', label: 'Only pays' },
}
const roleOf = (n) => (n.invented ? 'invented'
  : (n.score ?? 0) >= RISKY ? 'risky'
    : (n.in_degree ?? 0) > 0 && (n.out_degree ?? 0) > 0 ? 'bridge'
      : (n.in_degree ?? 0) >= 2 ? 'collector' : 'pays')

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
      setAddError('Pick a different sender.')
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setAddError('Enter an amount above zero.')
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
  //
  // Same layout, same data. What changed is how it reads: each collector sits
  // in a soft halo with its sender count, transfers are curved and weighted by
  // the attention the model gave them, every account carries a thin arc for
  // its score, and pointing at an account dims everything it is not connected
  // to, so its own transfers stand out.
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

    // Ground: the console's near-black, a touch lighter behind the centre.
    const bg = ctx.createRadialGradient(
      W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7 * (0.62 + view.z * 0.5))
    bg.addColorStop(0, '#1b1917')
    bg.addColorStop(1, '#0b0a09')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // The field, one layer at a time, each taking its own share of the view.
    const TW = W * 1.6
    const TH = H * 1.6
    stars.forEach(({ depth, pts }) => {
      const z = 1 + (view.z - 1) * depth
      const px = view.x * depth
      const py = view.y * depth
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i]
        let x = (p.x * TW + px) % TW
        let y = (p.y * TH + py) % TH
        if (x < 0) x += TW
        if (y < 0) y += TH
        const sx = W / 2 + (x - TW / 2) * z
        const sy = H / 2 + (y - TH / 2) * z
        if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue
        ctx.fillStyle = `rgba(240,237,231,${p.a * 0.8})`
        ctx.beginPath()
        ctx.arc(sx, sy, p.r * (0.7 + z * 0.4), 0, Math.PI * 2)
        ctx.fill()
      }
    })
    if (!graph) return

    // The layout runs on a world WORLD times the frame, with the searched
    // account at the world's middle. The view is centred on that middle, not
    // on the frame's: centring on the frame put the searched account off the
    // bottom-right of the screen on arrival.
    const CX = (W * WORLD) / 2
    const CY = (H * WORLD) / 2
    ctx.save()
    ctx.translate(W / 2 + view.x, H / 2 + view.y)
    ctx.scale(view.z, view.z)
    ctx.translate(-CX, -CY)

    const { nodes, links } = layout(graph, W, H)
    const maxAtt = Math.max(...graph.edges.map((e) => e.attention ?? 0), 0.0001)
    const maxDeg = Math.max(...nodes.map((n) => n.in_degree + n.out_degree), 1)
    const sizeOf = (n) => {
      const deg = (n.in_degree ?? 0) + (n.out_degree ?? 0)
      return n.is_centre ? 22 : n.invented ? 15
        : 3.4 + Math.pow(Math.max(deg, 0) / maxDeg, 0.62) * 15
    }

    // What the pointer is on, and everything one transfer from it.
    const near = hover ? new Set([hover]) : null
    if (near) {
      links.forEach(({ a, b }) => {
        if (a.id === hover) near.add(b.id)
        if (b.id === hover) near.add(a.id)
      })
    }
    const fade = (id) => (near && !near.has(id) ? 0.28 : 1)

    // Halos: one per collector and one behind the searched account.
    nodes.forEach((n) => {
      const collector = (n.in_degree ?? 0) >= 2
      if (!collector && !n.is_centre) return
      const rgb = n.is_centre || (n.score ?? 0) >= RISKY ? '255,107,92' : '125,180,255'
      const rad = 46 + Math.sqrt(n.in_degree ?? 1) * 24
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rad)
      g.addColorStop(0, `rgba(${rgb},${0.2 * fade(n.id)})`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(n.x, n.y, rad, 0, Math.PI * 2); ctx.fill()
    })

    // Transfers, curved and weighted. The ones the model leaned on most are
    // drawn warm, so the evidence is visible before anything is read.
    links.forEach(({ a, b, e }) => {
      const w = (e.attention ?? 0) / maxAtt
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const bend = (wobble(`${e.source}>${e.target}`, 'b') - 0.5) * 0.32 * len
      const cx = (a.x + b.x) / 2 - (dy / len) * bend
      const cy = (a.y + b.y) / 2 + (dx / len) * bend
      const lit = !near || (near.has(a.id) && near.has(b.id) && (a.id === hover || b.id === hover))
      const f = lit ? 1 : 0.22
      const hot = w >= 0.5
      ctx.lineCap = 'round'
      ctx.strokeStyle = hot ? `rgba(255,107,92,${(0.08 + w * 0.12) * f})`
        : `rgba(214,209,201,${0.05 * f})`
      ctx.lineWidth = 3 + w * 5
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke()
      if (hot) {
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        g.addColorStop(0, `rgba(179,166,245,${0.9 * f})`)
        g.addColorStop(1, `rgba(255,107,92,${0.95 * f})`)
        ctx.strokeStyle = g
      } else {
        ctx.strokeStyle = `rgba(214,209,201,${(0.22 + w * 0.45) * f})`
      }
      ctx.lineWidth = 0.8 + w * 2.6
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke()
    })

    nodes.forEach((n) => {
      const r = sizeOf(n)
      const rgb = ROLE[roleOf(n)].rgb
      const f = fade(n.id)

      const g1 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 2.6)
      g1.addColorStop(0, `rgba(${rgb},${0.34 * f})`)
      g1.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = g1
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.6, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle = `rgba(${rgb},${f})`
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `rgba(11,10,9,${0.9 * f})`
      ctx.lineWidth = 2
      ctx.stroke()

      // The score as an arc: a full ring would be a score of one.
      if (r >= 5 && typeof n.score === 'number') {
        const ra = r + 5
        ctx.lineWidth = 2.2
        ctx.strokeStyle = `rgba(255,255,255,${0.1 * f})`
        ctx.beginPath(); ctx.arc(n.x, n.y, ra, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = n.score >= RISKY ? `rgba(255,107,92,${f})` : `rgba(255,180,84,${f})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, ra, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0.02, n.score)))
        ctx.stroke()
      }
      if (n.is_centre) {
        ctx.strokeStyle = '#D6F068'
        ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 11, 0, Math.PI * 2); ctx.stroke()
      }
      if (n.id === hover && !n.is_centre) {
        ctx.strokeStyle = 'rgba(255,255,255,.9)'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 10, 0, Math.PI * 2); ctx.stroke()
      }
      layoutRef.current.push({ id: n.id, x: n.x, y: n.y, r: Math.max(r, 9), node: n })
    })

    // Cluster names, then account labels, so nothing is drawn over them.
    ctx.textAlign = 'center'
    ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif'
    nodes.forEach((n) => {
      if (n.is_centre || (n.in_degree ?? 0) < 3) return
      ctx.fillStyle = `rgba(214,209,201,${0.62 * fade(n.id)})`
      ctx.fillText(`collector · ${n.in_degree} senders`, n.x, n.y - sizeOf(n) - 34)
    })
    ctx.font = '12px "JetBrains Mono", ui-monospace, monospace'
    nodes.forEach((n) => {
      const risky = (n.score ?? 0) >= RISKY
      if (!n.is_centre && !risky && !n.invented && n.id !== hover) return
      if (fade(n.id) < 1) return
      const r = sizeOf(n)
      const w = ctx.measureText(n.id).width
      ctx.fillStyle = 'rgba(11,10,9,.78)'
      ctx.beginPath()
      ctx.roundRect?.(n.x - w / 2 - 7, n.y + r + 14, w + 14, 19, 9.5)
      if (!ctx.roundRect) ctx.rect(n.x - w / 2 - 7, n.y + r + 14, w + 14, 19)
      ctx.fill()
      ctx.fillStyle = n.invented ? '#eaddff' : '#F2EFE9'
      ctx.fillText(n.id, n.x, n.y + r + 28)
    })
    ctx.restore()

    // Minimap: the whole neighbourhood, and the part of it in view.
    if (nodes.length > 1) {
      const MW = 120, MH = 80, mx = W - MW - 14, my = H - MH - 14
      const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y)
      const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30
      const y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30
      const k = Math.min((MW - 12) / (x1 - x0), (MH - 12) / (y1 - y0))
      const ox = mx + (MW - (x1 - x0) * k) / 2
      const oy = my + (MH - (y1 - y0) * k) / 2
      const toMap = (x, y) => [ox + (x - x0) * k, oy + (y - y0) * k]
      ctx.fillStyle = 'rgba(27,25,23,.92)'
      ctx.strokeStyle = 'rgba(214,209,201,.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect?.(mx, my, MW, MH, 12)
      if (!ctx.roundRect) ctx.rect(mx, my, MW, MH)
      ctx.fill(); ctx.stroke()
      ctx.save()
      ctx.beginPath(); ctx.rect(mx, my, MW, MH); ctx.clip()
      nodes.forEach((n) => {
        const [px, py] = toMap(n.x, n.y)
        ctx.fillStyle = `rgb(${ROLE[roleOf(n)].rgb})`
        ctx.beginPath(); ctx.arc(px, py, n.is_centre ? 2.6 : 1.4, 0, Math.PI * 2); ctx.fill()
      })
      // The screen's corners, taken back into the world.
      const wx = (sx) => (sx - W / 2 - view.x) / view.z + CX
      const wy = (sy) => (sy - H / 2 - view.y) / view.z + CY
      const [ax, ay] = toMap(wx(0), wy(0))
      const [bx, by] = toMap(wx(W), wy(H))
      ctx.strokeStyle = '#D6F068'
      ctx.lineWidth = 1.5
      ctx.strokeRect(ax, ay, bx - ax, by - ay)
      ctx.restore()
    }
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
      x: (sx - W / 2 - view.x) / view.z + (W * WORLD) / 2,
      y: (sy - H / 2 - view.y) / view.z + (H * WORLD) / 2,
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

  // The account the inspector describes: whatever the pointer is on, else the
  // searched one.
  const focusId = hover ?? centre
  const focusNode = graph?.nodes?.find((n) => n.id === focusId) ?? null
  const focusEdges = graph && focusNode
    ? graph.edges
      .filter((e) => e.source === focusNode.id || e.target === focusNode.id)
      .sort((a, b) => (b.attention ?? 0) - (a.attention ?? 0))
      .slice(0, 3)
    : []
  const maxAttention = Math.max(...(graph?.edges ?? []).map((e) => e.attention ?? 0), 0.0001)
  const hoverPoint = hover ? layoutRef.current.find((p) => p.id === hover) : null
  const canvasW = canvasRef.current?.clientWidth ?? 0
  const hoverScreen = hoverPoint && canvasW ? {
    x: (hoverPoint.x - (canvasW * WORLD) / 2) * view.z + canvasW / 2 + view.x,
    y: (hoverPoint.y - (FRAME_H * WORLD) / 2) * view.z + FRAME_H / 2 + view.y,
  } : null

  const zoomBy = (k) => glideTo({ z: Math.max(0.35, Math.min(3, viewRef.current.z * k)) }, 320)
  const card = 'dash-card'

  return (
    <ConsoleShell
      eyebrow="Detector · Network"
      title={<>The payment graph. <em>Who paid whom.</em></>}
      subtitle="Search an account to see the network around it."
    >
      {error && <Alert tone="error">{error}</Alert>}

      <div className="dash" style={{ gap: 18 }}>
      <DetectorRuntime detector="graph" model="Edge-Enhanced GraphSAGE" />

      {/* One switch, before anything else: the explorer is the only screen
          here that puts real load on the network detector, so it loads
          nothing until it is opened, and closing it drops what was loaded. */}
      <div className="dash-chips">
        <span className="dash-chip" style={{ gap: 12 }}>
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
              background: expanded ? 'rgb(var(--dash-line))' : 'rgb(var(--ds-line))',
              opacity: off ? 0.4 : 1,
              cursor: off ? 'not-allowed' : 'pointer',
              transition: 'background .15s',
            }}
          >
            <span style={{ width: 18, height: 18, borderRadius: 999, background: '#fff', display: 'block' }} />
          </button>
          <b style={{ fontSize: 14 }}>
            {off ? 'Switched off by an administrator' : expanded ? 'Explorer open' : 'Explorer closed'}
          </b>
          <span>{off ? 'Reserved for live screening.' : expanded ? '' : 'Open it to load.'}</span>
        </span>

        {!off && expanded && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); load(query.trim()) }}
                  className="dash-chip dash-search" role="search" style={{ width: 340, paddingRight: 6 }}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
                   strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" />
              </svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                     placeholder="Account, e.g. C1166671647" aria-label="Account"
                     className="ds-mono" />
              <button type="submit" className="ds-btn ds-btn-primary" disabled={loading || !query.trim()}
                      style={{ minHeight: 36, padding: '6px 16px' }}>
                {loading ? 'Loading…' : 'Find'}
              </button>
            </form>
            <span className="dash-chip" role="group" aria-label="Hops" style={{ padding: 4, gap: 2 }}>
              {[1, 2].map((h) => (
                <button key={h} type="button" aria-pressed={hops === h}
                        disabled={h === 2 && settings?.max_hops < 2}
                        onClick={() => { setHops(h); if (centre) load(centre, h, false) }}
                        style={{ border: 0, cursor: 'pointer', borderRadius: 12, padding: '8px 14px', fontSize: 13,
                                 fontWeight: hops === h ? 600 : 500,
                                 background: hops === h ? 'rgb(var(--dash-mint))' : 'transparent',
                                 color: hops === h ? 'rgb(var(--dash-on-mint))' : 'rgb(var(--ds-muted))' }}>
                  {h} hop{h === 1 ? '' : 's'}
                </button>
              ))}
            </span>
            <button type="button" className={`ds-btn ${demo ? 'ds-btn-primary' : ''}`}
                    onClick={() => setDemo((v) => !v)}>
              {demo ? 'Demo mode is on' : 'Demo mode'}
            </button>
          </>
        )}
      </div>

      {!off && expanded && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13,
                        color: 'rgb(var(--ds-faint))', marginTop: -6 }}>
            Largest networks:
            {BUSY.map(([a, note]) => (
              <button key={a} type="button" title={note} className="dash-mini ds-mono"
                      onClick={() => { setQuery(a); load(a) }}>{a}</button>
            ))}
            {trail.length > 1 && (
              <span style={{ marginLeft: 'auto' }}>
                {trail.map((a, i) => (
                  <span key={`${a}-${i}`}>
                    {i > 0 && ' → '}
                    <button onClick={() => load(a, hops, false)} className="ds-mono"
                            style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer',
                                     textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                      {a}
                    </button>
                  </span>
                ))}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18,
                        alignItems: 'start' }} className="ds-split">
            <div className={card} style={{ overflow: 'hidden', padding: 0 }}>
              <div
                ref={frameRef}
                tabIndex={0}
                className="relative outline-none"
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
                        // the new network arrives where you were already looking.
                        // The draw transform is
                        //   translate(W/2 + x, H/2 + y) · scale(z) · translate(-CX, -CY)
                        // so a world point lands at the middle when
                        //   x = -z (wx - CX).
                        const W = canvasRef.current?.clientWidth ?? 0
                        if (W) {
                          glideTo({
                            x: -view.z * (h.x - (W * WORLD) / 2),
                            y: -view.z * (h.y - (FRAME_H * WORLD) / 2),
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

                {counts && (
                  <span className="dash-mini" style={{ position: 'absolute', left: 16, top: 14, cursor: 'default',
                                                       background: 'rgba(27,25,23,.85)', color: '#F2EFE9' }}>
                    {counts.nodes_returned} accounts · {counts.edges_returned} transfers
                    {counts.truncated ? ` (top ${counts.edges_returned} of ${counts.edges_in_ball})` : ''}
                  </span>
                )}
                <div style={{ position: 'absolute', right: 14, top: 14, display: 'grid', gap: 8 }}>
                  {[['+', 'Zoom in', () => zoomBy(1.35)], ['−', 'Zoom out', () => zoomBy(1 / 1.35)],
                    ['⟲', 'Recentre', () => glideTo({ x: 0, y: 0, z: 1 }, 460)]].map(([t, label, fn]) => (
                    <button key={label} type="button" aria-label={label} title={label} onClick={fn}
                            style={{ width: 40, height: 40, borderRadius: 99, cursor: 'pointer', fontSize: 17,
                                     border: '1px solid rgba(214,209,201,.22)', color: '#F2EFE9',
                                     background: 'rgba(27,25,23,.85)' }}>{t}</button>
                  ))}
                </div>

                {/* What the pointer is on, without leaving the map. */}
                {hoverScreen && hoverPoint && (
                  <div style={{
                    position: 'absolute', pointerEvents: 'none', zIndex: 2,
                    left: Math.min(Math.max(hoverScreen.x + 18, 8), Math.max(8, canvasW - 230)),
                    top: Math.min(Math.max(hoverScreen.y - 46, 8), FRAME_H - 96),
                    width: 214, padding: '11px 14px', borderRadius: 16,
                    background: 'rgba(27,25,23,.94)', border: '1px solid rgba(214,209,201,.22)', color: '#F2EFE9',
                  }}>
                    <div className="ds-mono" style={{ fontSize: 12 }}>{hoverPoint.id}</div>
                    <div style={{ fontSize: 12, color: '#A39C92', marginTop: 3 }}>
                      {ROLE[roleOf(hoverPoint.node)].label} · {hoverPoint.node.in_degree ?? 0} in, {hoverPoint.node.out_degree ?? 0} out
                    </div>
                    {typeof hoverPoint.node.score === 'number' && (
                      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4,
                                    color: hoverPoint.node.score >= RISKY ? '#FF6B5C' : '#FFB454' }}>
                        score {hoverPoint.node.score.toFixed(4)}
                      </div>
                    )}
                  </div>
                )}

                {!graph && !loading && (
                  <p style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', margin: 0,
                              color: '#A39C92', fontSize: 14, pointerEvents: 'none' }}>
                    Nothing loaded. Search an account, or pick one of the largest networks.
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: '12px 18px',
                            fontSize: 12, color: 'rgb(var(--ds-muted))', borderTop: '1px solid rgb(var(--ds-line))' }}>
                {['risky', 'collector', 'pays', 'bridge', 'invented'].map((k) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 99, background: `rgb(${ROLE[k].rgb})` }} />
                    {ROLE[k].label}
                  </span>
                ))}
                <span>arc = score · warm line = weighted most</span>
                <span className="ds-mono" style={{ marginLeft: 'auto', color: 'rgb(var(--ds-faint))' }}>
                  arrows move · +/− zoom · 0 recentres · drag to pan
                </span>
              </div>
            </div>

            <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <section className={card} style={{ padding: 22 }}>
                <div className="ds-section-label">{hover ? 'Pointing at' : 'Selected account'}</div>
                {focusNode ? (
                  <>
                    <div className="ds-mono" style={{ fontSize: 16, marginTop: 8, wordBreak: 'break-all' }}>{focusNode.id}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
                      {typeof focusNode.score === 'number' && (
                        <div style={{ width: 84, height: 84, borderRadius: 99, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                                      background: `conic-gradient(${focusNode.score >= RISKY ? '#FF6B5C' : '#FFB454'} 0 ${Math.max(1, focusNode.score * 100)}%, rgb(var(--ds-surface-3)) 0 100%)` }}>
                          <div style={{ width: 68, height: 68, borderRadius: 99, display: 'grid', placeItems: 'center',
                                        background: 'rgb(var(--dash-card-top))', textAlign: 'center' }}>
                            <div>
                              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.03em' }}>{focusNode.score.toFixed(3)}</div>
                              <div style={{ fontSize: 9, letterSpacing: '.1em', color: 'rgb(var(--ds-faint))' }}>SCORE</div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div>
                        <span className="ds-badge" style={{ color: `rgb(${ROLE[roleOf(focusNode)].rgb})`,
                                                            borderColor: `rgba(${ROLE[roleOf(focusNode)].rgb},.4)` }}>
                          {ROLE[roleOf(focusNode)].label}
                        </span>
                        <div style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', marginTop: 8 }}>
                          {focusNode.is_centre ? 'The account you searched' : 'Click it on the map to move there'}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, fontSize: 14 }}>
                      {[['Receives from', `${focusNode.in_degree ?? 0} account${focusNode.in_degree === 1 ? '' : 's'}`],
                        ['Pays', `${focusNode.out_degree ?? 0} account${focusNode.out_degree === 1 ? '' : 's'}`]].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0',
                                              borderTop: '1px solid rgb(var(--ds-line))' }}>
                          <span style={{ color: 'rgb(var(--ds-muted))' }}>{k}</span><span>{v}</span>
                        </div>
                      ))}
                    </div>
                    {!focusNode.is_centre && (
                      <button type="button" className="ds-btn ds-btn-primary" style={{ width: '100%', marginTop: 12 }}
                              onClick={() => { setQuery(focusNode.id); load(focusNode.id) }}>
                        Move to this account
                      </button>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', marginTop: 10 }}>
                    Search an account to see it here. Point at any account on the map to read it.
                  </p>
                )}
              </section>

              {focusEdges.length > 0 && (
                <section className={card} style={{ padding: 22 }}>
                  <div className="ds-section-label" style={{ marginBottom: 12 }}>Transfers that mattered</div>
                  <div style={{ display: 'grid', gap: 14 }}>
                    {focusEdges.map((e, i) => {
                      const w = (e.attention ?? 0) / maxAttention
                      return (
                        <div key={`${e.source}-${e.target}-${i}`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                            <span className="ds-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.source} → {e.target}
                            </span>
                            <span className="ds-mono" style={{ color: 'rgb(var(--ds-muted))' }}>
                              {(e.attention ?? 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="ds-progress" style={{ marginTop: 7 }}>
                            <span style={{ width: `${Math.max(3, w * 100)}%`,
                                           background: 'linear-gradient(90deg, rgb(179,166,245), rgb(255,107,92))' }} />
                          </div>
                          {(typeof e.amount === 'number' || e.step != null) && (
                            <div style={{ fontSize: 12, color: 'rgb(var(--ds-muted))', marginTop: 5 }}>
                              {typeof e.amount === 'number' ? e.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ''}
                              {typeof e.amount === 'number' && e.step != null ? ' · ' : ''}
                              {e.step != null ? `step ${e.step}` : ''}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </aside>
          </div>

          {demo && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
              {/* ── What if: an account the graph has never seen ─────────── */}
              <section className={card} style={{ padding: 22, display: 'grid', gap: 12, alignContent: 'start' }}>
                <div>
                  <h2 className="dash-h dash-h-sm">What if</h2>
                  <p style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', margin: '4px 0 0' }}>
                    Score an account the graph has never seen. Change the sender and score again.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[['New account', newAccount, setNewAccount],
                    ['Received from', from, setFrom],
                    ['Amount', amount, setAmount]].map(([label, value, set]) => (
                    <label key={label} style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontSize: 12, color: 'rgb(var(--ds-muted))' }}>{label}</span>
                      <Input value={value} onChange={(e) => set(e.target.value)} />
                    </label>
                  ))}
                </div>
                <Button size="sm" onClick={scoreInvented} loading={scoring}
                        disabled={!newAccount.trim() || !from.trim()}>
                  Score and place it in the graph
                </Button>
                {addError && <Alert tone="error">{addError}</Alert>}

                {runs.length > 0 && (() => {
                  const top = Math.max(...runs.map((r) => r.score), 0.0001)
                  const spread = new Set(runs.map((r) => r.score)).size
                  return (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="flex items-baseline gap-2">
                        <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.04em',
                                       color: 'rgb(var(--dash-line-ink))' }}>
                          {runs[0].score.toFixed(4)}
                        </span>
                        <span style={{ fontSize: 13, color: 'rgb(var(--ds-faint))' }}>
                          raw · from {runs[0].accounts.toLocaleString()} accounts
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: 5 }}>
                        {runs.map((r, i) => (
                          <div key={r.at} className="flex items-center gap-2">
                            <span className="ds-mono w-[110px] shrink-0 truncate" title={r.from}
                                  style={{ fontSize: 12, color: 'rgb(var(--ds-muted))' }}>{r.from}</span>
                            <span className="ds-progress flex-1">
                              <span style={{ width: `${Math.max(2, (r.score / top) * 100)}%`,
                                             background: i === 0 ? 'rgb(var(--dash-line))' : 'rgb(var(--dash-line) / .45)' }} />
                            </span>
                            <span className="ds-mono w-[62px] shrink-0 text-right" style={{ fontSize: 12 }}>
                              {r.score.toFixed(4)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {runs.length > 1 && (
                        <p style={{ fontSize: 13, margin: 0,
                                    color: spread > 1 ? 'rgb(var(--dash-line-ink))' : 'rgb(var(--ds-muted))' }}>
                          {spread > 1
                            ? `${spread} different scores in ${runs.length} runs, with only the sender changed.`
                            : 'Same score so far. Try a different sender.'}
                        </p>
                      )}
                    </div>
                  )
                })()}
                <p style={{ fontSize: 12, color: 'rgb(var(--ds-faint))', margin: 0 }}>
                  Raw scores. Compare runs with each other.
                </p>
              </section>

              {/* ── A file, through this model alone ─────────────────────── */}
              <section className={card} style={{ padding: 22, display: 'grid', gap: 10, alignContent: 'start' }}>
                <div>
                  <h2 className="dash-h dash-h-sm">Score a file</h2>
                  <p style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', margin: '4px 0 0' }}>
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
                    <span className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-muted))' }}>
                      {csv.counts.precomputed} looked up · {csv.counts.inductive} new
                      · {csv.counts.unscored} not scoreable
                    </span>
                  )}
                </div>
                {csvError && <Alert tone="error">{csvError}</Alert>}
                {csv?.notes?.length > 0 && (
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgb(var(--ds-sev-medium))', margin: 0 }}>
                    {csv.notes.join(' ')}
                  </p>
                )}
                {/* Scored at the model's own decision threshold, as it publishes it. */}
                {csv && (
                  <Validation rows={csv.rows}
                              threshold={csv.bands?.high ?? 0.183}
                              scoreOf={(r) => r.score} />
                )}
                {csv && (
                  <div style={{ overflow: 'auto', maxHeight: 210 }}>
                    <table className="ds-table">
                      <thead>
                        <tr>{['To', 'Score', 'How'].map((h) => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {csv.rows.map((r) => (
                          <tr key={r.row}>
                            <td className="ds-mono">{r.nameDest}</td>
                            <td className="ds-mono" style={{ color: r.score == null ? 'rgb(var(--ds-faint))' : undefined }}>
                              {r.score == null ? '-' : r.score.toFixed(4)}
                            </td>
                            <td style={{ color: r.source === 'inductive' ? 'rgb(196,132,252)' : 'rgb(var(--ds-muted))' }}>
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
              </section>
            </div>
          )}
        </>
      )}

      <GraphModelPanel />

      {isAdmin && settings && (
        <section className={card} style={{ padding: 22 }}>
          <h2 className="dash-h dash-h-sm">Explorer availability</h2>
          <p style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', margin: '4px 0 0' }}>
            Switch off to free the detector for live screening.
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
            <span style={{ fontSize: 14, color: 'rgb(var(--ds-faint))' }}>
              Currently {settings.enabled ? 'on' : 'off'} · up to {settings.max_hops} hop
              {settings.max_hops === 1 ? '' : 's'}, {settings.max_edges} transfers
            </span>
          </div>
        </section>
      )}
      </div>
    </ConsoleShell>
  )
}
