import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui'

/**
 * Ask before doing something the user cannot take back.
 *
 * This exists to replace `window.confirm`, which the console still uses in two
 * places. That dialog cannot be styled, announces the site's domain above the
 * question, and blocks the whole browser tab while it is open — acceptable in a
 * script, out of place in an operator console that has a visual language of its
 * own.
 *
 * Rendered through a portal to `document.body` rather than in place. The
 * sidebar it is called from is `position: sticky` with a stacking context of
 * its own, so a dialog rendered inside it would be trapped under the sidebar's
 * own layer and clipped at its edge however high its z-index went.
 *
 * The keyboard behaviour is the part worth having. Escape closes, Tab cycles
 * within the dialog rather than wandering into the page behind it, the
 * confirming button takes focus on open so Enter is enough, and focus returns
 * to whatever opened it on close — so a keyboard user is not dropped back at
 * the top of the document.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)
  const panelRef = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    if (!open) return

    // Remember who opened it, so focus can go back there afterwards.
    openerRef.current = document.activeElement
    confirmRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel?.()
        return
      }
      if (e.key !== 'Tab') return

      // Keep Tab inside the dialog. Without this the next Tab lands on the
      // page behind, which is still there and still clickable to a keyboard —
      // the visual overlay stops a mouse, not a keyboard.
      const focusable = panelRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      // Only if the opener is still in the document — the click may have
      // unmounted it.
      if (openerRef.current?.isConnected) openerRef.current.focus()
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center p-4"
      // A click that starts on the backdrop and ends on the backdrop cancels.
      // Testing the target rather than using a bare onClick matters: a drag
      // that begins inside the panel and releases outside it would otherwise
      // read as a backdrop click and close the dialog mid-selection.
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        // `bg-surface-raised` was the obvious token and the wrong one: it
        // resolves to 4% white, which is a tint meant to lift a panel off a
        // page, not a fill. Over a backdrop it is effectively transparent and
        // the page reads straight through the dialog. `sentinel-900` is a
        // solid colour in both themes.
        className="relative w-full max-w-md rounded-xl border border-subtle
                   bg-sentinel-900 p-6 shadow-2xl"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold tracking-tight text-slate-100"
        >
          {title}
        </h2>

        {children && (
          <div className="mt-2.5 text-sm leading-relaxed text-slate-400">{children}</div>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button ref={confirmRef} variant={tone} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
