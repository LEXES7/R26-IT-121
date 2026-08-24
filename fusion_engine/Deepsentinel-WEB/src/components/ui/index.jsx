/**
 * UI primitives.
 *
 * Every page composes these rather than repeating utility-class strings, so
 * spacing, focus rings and disabled states stay consistent and change in one
 * place. Each primitive forwards className so a caller can extend without
 * forking the component.
 */

import { forwardRef } from 'react'

const cx = (...parts) => parts.filter(Boolean).join(' ')

// ── Button ───────────────────────────────────────────────────────────────────

const BUTTON_VARIANTS = {
  primary:
    'bg-accent-500 text-white hover:bg-accent-400 focus-visible:ring-blue-400 shadow-lg shadow-accent-500/20',
  secondary:
    'bg-surface-raised text-slate-200 border border-subtle hover:bg-surface-hover hover:border-strong focus-visible:ring-slate-400',
  danger:
    'bg-red-600/90 text-white hover:bg-red-500 focus-visible:ring-red-400',
  ghost:
    'text-slate-400 hover:text-slate-200 hover:bg-surface-raised focus-visible:ring-slate-500',
}

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-sm gap-2',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-semibold',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-sentinel-950',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
})

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cx('rounded-2xl border border-subtle bg-surface', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 flex-wrap', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-200">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function SectionLabel({ children, className }) {
  return (
    <p className={cx('text-xs font-semibold uppercase tracking-widest text-slate-500', className)}>
      {children}
    </p>
  )
}

// ── Form controls ────────────────────────────────────────────────────────────

const FIELD_BASE =
  'w-full rounded-lg bg-surface-raised px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 ' +
  'border transition-colors focus:outline-none focus:ring-1 disabled:opacity-50'

export const Input = forwardRef(function Input({ error, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      className={cx(
        FIELD_BASE,
        error
          ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500'
          : 'border-subtle focus:border-blue-500 focus:ring-blue-500',
        className,
      )}
      {...props}
    />
  )
})

export const Select = forwardRef(function Select({ error, className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cx(
        FIELD_BASE,
        error
          ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500'
          : 'border-subtle focus:border-blue-500 focus:ring-blue-500',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
})

export function Field({ label, error, hint, htmlFor, children, className }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-400">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-600">{hint}</p>
      ) : null}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label
      className={cx(
        'flex items-start justify-between gap-4 rounded-xl border border-subtle bg-surface p-4',
        disabled ? 'opacity-50' : 'cursor-pointer hover:border-strong transition-colors',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-sentinel-950',
          checked ? 'bg-accent-500' : 'bg-slate-700',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}

// ── Feedback ─────────────────────────────────────────────────────────────────

const ALERT_TONES = {
  success: 'border-green-500/25 bg-green-500/10 text-green-300',
  error: 'border-red-500/25 bg-red-500/10 text-red-300',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  info: 'border-blue-500/25 bg-accent-500/10 text-accent-400',
}

export function Alert({ tone = 'info', title, children, onDismiss, className }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-xl border px-4 py-3 text-sm', ALERT_TONES[tone], className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

const BADGE_TONES = {
  neutral: 'bg-surface-overlay text-slate-300 border-subtle',
  critical: 'bg-risk-critical/15 text-risk-critical border-risk-critical/30',
  high: 'bg-risk-high/15 text-risk-high border-risk-high/30',
  medium: 'bg-risk-medium/15 text-risk-medium border-risk-medium/30',
  low: 'bg-risk-low/15 text-risk-low border-risk-low/30',
  admin: 'bg-role-admin/15 text-role-admin border-role-admin/30',
  manager: 'bg-role-manager/15 text-role-manager border-role-manager/30',
  analyst: 'bg-role-analyst/15 text-slate-400 border-role-analyst/30',
}

export function Badge({ tone = 'neutral', children, className }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone] ?? BADGE_TONES.neutral,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({ icon = '○', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-subtle py-16 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-subtle bg-surface text-2xl">
        {icon}
      </div>
      <div>
        <p className="font-medium text-slate-400">{title}</p>
        {description && <p className="mt-1 text-xs text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-lg bg-surface-raised', className)} />
}

// ── Layout ───────────────────────────────────────────────────────────────────

export function PageHeader({ title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-200 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export { cx }
