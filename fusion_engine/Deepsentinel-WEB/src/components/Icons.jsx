/**
 * Line icons.
 *
 * Hand-built strokes rather than an icon package or emoji: emoji render
 * differently on every platform and read as informal, which undercuts a
 * forensic tool. These inherit currentColor and stroke width, so they sit
 * consistently with the type around them.
 */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function IconBlackBox({ className = 'h-6 w-6' }) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M8 5v14" />
      <circle cx="15.5" cy="14.5" r="1.6" />
    </svg>
  )
}

export function IconHallucination({ className = 'h-6 w-6' }) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 17V9a3 3 0 0 1 3-3h7l4 4v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" />
      <path d="M14 6v4h4" />
      <path d="M8.5 13.5h5M8.5 16h3" strokeDasharray="2 2.5" />
    </svg>
  )
}

export function IconLink({ className = 'h-6 w-6' }) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M10 13.5a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
      <path d="M14 10.5a4 4 0 0 0-5.7-.3l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.5-1.5" />
    </svg>
  )
}

export function IconGraph({ className = 'h-6 w-6' }) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="5" cy="6" r="1.8" />
      <circle cx="19" cy="6" r="1.8" />
      <circle cx="6" cy="19" r="1.8" />
      <circle cx="18" cy="18" r="1.8" />
      <path d="M6.4 7.2 10.2 10.4M17.6 7.2 13.8 10.4M7.2 17.8l3.2-3.6M16.6 16.7 13.6 13.7" />
    </svg>
  )
}

export function IconPulse({ className = 'h-6 w-6' }) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M3 12h3.5l2-6 3.5 12 2.5-7 1.6 3h4.9" />
    </svg>
  )
}

export function IconShield({ className = 'h-6 w-6' }) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3.5 5 6.2v5.3c0 4 2.9 7.6 7 9 4.1-1.4 7-5 7-9V6.2Z" />
      <path d="m9.2 12.2 2 2 3.6-3.9" />
    </svg>
  )
}
