/* One place that owns smooth scrolling (Lenis) and its GSAP wiring. */

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

/**
 * Read at call time, never cached: someone can change the setting while the
 * page is open, and a stale answer would keep animating at a person who just
 * asked us to stop.
 */
export const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

let lenis = null
let tick = null

/**
 * Smooth scroll, wired to GSAP's ticker so ScrollTrigger stays in sync.
 * Returns null when the visitor asked for reduced motion — hijacking the
 * scroll wheel is exactly what that setting is asking us not to do.
 */
export function initSmoothScroll() {
  if (prefersReducedMotion()) return null
  if (lenis) return lenis

  lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)

  // Kept in a variable so teardown can remove it. Without that the callback
  // outlives the Lenis instance it closes over, and React's strict-mode
  // double-invoke leaves a second one running against a destroyed instance.
  tick = (time) => lenis?.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return lenis
}

/** Safe to call when init returned null or was never called. */
export function destroySmoothScroll() {
  if (tick) {
    gsap.ticker.remove(tick)
    tick = null
  }
  if (lenis) {
    lenis.off('scroll', ScrollTrigger.update)
    lenis.destroy()
    lenis = null
  }
  gsap.ticker.lagSmoothing(500, 33) // GSAP's default
}

export { gsap, ScrollTrigger }
