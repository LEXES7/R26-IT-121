import { useId } from 'react'
import { cx } from './ui'

/**
 * Text that resolves word by word as it scrolls through the viewport.
 *
 * Driven by a scroll timeline, not a scroll listener. `animation-timeline:
 * view()` hands the whole thing to the compositor: nothing runs on the main
 * thread, nothing recalculates on scroll, and the reveal tracks the scrollbar
 * exactly — including when the reader scrolls back up, which a one-way
 * IntersectionObserver reveal cannot do.
 *
 * Each word gets its own slice of the block's progress through the viewport,
 * so they resolve left to right at reading pace rather than all at once.
 *
 * Where scroll timelines are unsupported, every word simply renders at full
 * opacity. The effect is the enhancement; the text is the content, and it is
 * never conditional on the effect working.
 */
export default function ScrollRevealText({
  children,
  as: Tag = 'p',
  className,
  dim = 0.16,
}) {
  const id = useId()
  const text = typeof children === 'string' ? children : String(children ?? '')
  const words = text.split(/(\s+)/)          // capture the gaps, so spacing survives
  const count = words.filter((w) => w.trim()).length || 1

  let index = -1
  return (
    <Tag className={cx('reveal-text', className)} style={{ '--dim': dim }} data-reveal={id}>
      {words.map((w, i) => {
        if (!w.trim()) return <span key={i}>{w}</span>
        index += 1
        return (
          <span key={i} className="reveal-word" style={{ '--i': index, '--n': count }}>
            {w}
          </span>
        )
      })}
    </Tag>
  )
}
