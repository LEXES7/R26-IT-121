import { useEffect, useRef } from 'react'

export default function NetworkBackground({ opacity = 0.35 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const NODE_COUNT = 55
    const MAX_DIST = 140

    const nodes = Array.from({ length: NODE_COUNT }, () => {
      const r = Math.random()
      const type = r < 0.06 ? 'fraud' : r < 0.22 ? 'suspicious' : 'normal'
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: type === 'fraud' ? 2.5 : type === 'suspicious' ? 2 : Math.random() * 1.2 + 0.6,
        type,
        phase: Math.random() * Math.PI * 2,
      }
    })

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      nodes.forEach(n => {
        n.x += n.vx
        n.y += n.vy
        n.phase += 0.018
        if (n.x < 0 || n.x > canvas.width)  n.vx *= -1
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1
      })

      // Edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist >= MAX_DIST) continue

          const t = 1 - dist / MAX_DIST
          const hasFraud = nodes[i].type === 'fraud' || nodes[j].type === 'fraud'
          const hasSupect = nodes[i].type === 'suspicious' || nodes[j].type === 'suspicious'

          if (hasFraud) {
            ctx.strokeStyle = `rgba(239,68,68,${t * 0.22})`
            ctx.lineWidth = 0.8
          } else if (hasSupect) {
            ctx.strokeStyle = `rgba(59,130,246,${t * 0.18})`
            ctx.lineWidth = 0.6
          } else {
            ctx.strokeStyle = `rgba(148,163,184,${t * 0.07})`
            ctx.lineWidth = 0.4
          }

          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.stroke()
        }
      }

      // Nodes
      nodes.forEach(n => {
        const pulse = Math.sin(n.phase)

        if (n.type === 'fraud') {
          // Outer glow ring
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 14 + pulse * 3)
          glow.addColorStop(0, 'rgba(239,68,68,0.25)')
          glow.addColorStop(1, 'rgba(239,68,68,0)')
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(n.x, n.y, 14 + pulse * 3, 0, Math.PI * 2)
          ctx.fill()
          // Core
          ctx.fillStyle = `rgba(239,68,68,${0.75 + pulse * 0.2})`
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r + pulse * 0.5, 0, Math.PI * 2)
          ctx.fill()
        } else if (n.type === 'suspicious') {
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 10)
          glow.addColorStop(0, 'rgba(59,130,246,0.15)')
          glow.addColorStop(1, 'rgba(59,130,246,0)')
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(n.x, n.y, 10, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(59,130,246,0.7)'
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillStyle = 'rgba(148,163,184,0.3)'
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      animId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }}
    />
  )
}
