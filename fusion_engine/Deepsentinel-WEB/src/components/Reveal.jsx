import { useEffect, useRef, useState } from 'react'
import { cx } from './ui'

/**
 * Scroll-triggered reveal.
 *
 * Deliberately CSS transitions driven by one IntersectionObserver rather than
 * a motion library — the whole effect is a class toggle, so it costs no bundle
 * weight and cannot jank the main thread.
 *
 * Reveals once and then disconnects: content that re-animates every time it
 * scrolls past is distracting, and worse, it hides text from anyone who
 * scrolls back to re-read it.
 */
export default function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className,
  ...props
}) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Anyone who asked for less motion gets the content immediately.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShown(true)
        observer.disconnect()
      },
      // Fire slightly before the element reaches the viewport edge, so the
      // motion has finished by the time it is properly in view.
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cx(
        'transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}
