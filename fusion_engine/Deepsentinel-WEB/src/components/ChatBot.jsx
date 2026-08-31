import { useEffect, useRef, useState } from 'react'
import { askAssistant, getAssistantSuggestions } from '../services/api'
import { Spinner, cx } from './ui'
import SentinelBot from './SentinelBot'

/**
 * Floating project assistant.
 *
 * Answers questions about DeepSentinel from the project's own documentation.
 * Every reply carries the sources it was drawn from — an ungrounded answer
 * about your own research is worse than no answer, so citations are shown
 * rather than hidden behind a disclosure.
 *
 * Deliberately self-contained: no route, no global state, no auth requirement.
 * It renders on every page for reviewers and examiners who are reading the
 * showcase, not just signed-in operators.
 */

const GREETING = {
  role: 'assistant',
  at: Date.now(),
  content:
    "Ask me about DeepSentinel — the architecture, the GraphSAGE results and how " +
    'they were measured, the API contract, or the dataset. I answer only from the ' +
    "project's documentation and show you where each answer came from.",
  sources: [],
}

export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Starter questions double as a demo script; failure here is non-fatal.
  useEffect(() => {
    if (!open || suggestions.length) return
    getAssistantSuggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
  }, [open, suggestions.length])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Escape closes the panel — expected of any overlay.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function send(question) {
    const text = (question ?? input).trim()
    if (!text || busy) return

    setError(null)
    setInput('')
    const next = [...messages, { role: 'user', content: text, at: Date.now() }]
    setMessages(next)
    setBusy(true)

    try {
      // Send prior turns only — the greeting is UI, not conversation.
      const history = next
        .slice(1, -1)
        .map(({ role, content }) => ({ role, content }))
        .slice(-6)
      const res = await askAssistant(text, history)
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          at: Date.now(),
          content: res.answer,
          sources: res.sources || [],
          grounded: res.grounded,
          confident: res.confident,
        },
      ])
    } catch (err) {
      setError(
        err?.response?.status === 503
          ? 'The assistant is not available on this server yet.'
          : 'Could not reach the assistant. Is the backend running?',
      )
      setMessages((m) => m.slice(0, -1))
      setInput(text)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the project assistant"
        className="fixed bottom-5 right-5 z-40 grid h-16 w-16 place-items-center rounded-full border transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-sentinel-950"
        style={{ borderColor: 'rgba(45,212,191,.35)',
                 background: 'rgb(var(--ds-surface))',
                 boxShadow: '0 12px 34px -12px rgba(45,212,191,.5)' }}
      >
        {/* Him, not a speech bubble. A named character people can recognise
            beats a generic glyph, and he is the same face that answers. */}
        <SentinelBot size={52} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[min(34rem,80vh)] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-subtle bg-sentinel-900 shadow-2xl ring-1 ring-black/5">
      <header className="flex items-center justify-between border-b border-subtle px-4 py-3">
        <div className="flex items-center gap-2.5">
          <SentinelBot size={34} awake />
          <div>
            <p className="text-sm font-semibold text-slate-200">DeepSentinel</p>
            <p className="text-xs text-slate-400">Answers from the project documentation</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close the assistant"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-surface-raised hover:text-slate-200"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <Message key={i} message={m} />
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Spinner className="h-3.5 w-3.5" />
            Searching the documentation…
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {messages.length === 1 && suggestions.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[15px] uppercase tracking-wide text-slate-500">Try asking</p>
            {suggestions.slice(0, 4).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-left text-xs text-slate-300 transition hover:border-accent-500/40 hover:bg-surface-hover hover:text-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="flex items-end gap-2 border-t border-subtle p-3"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Ask about the project…"
          className="max-h-28 flex-1 resize-none rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent-500/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition enabled:hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-slate-500"
        >
          Send
        </button>
      </form>
    </div>
  )
}

/* A message thread rather than a log.
 *
 * A bubble with a tail on the sender's side, an avatar beside each turn, the
 * time underneath — the arrangement everyone already knows how to read, so
 * nobody has to work out who said what. The bot's own face is the avatar.
 *
 * The asymmetric corner is what makes a rounded rectangle read as speech: the
 * corner nearest its own avatar is square, the other three are not. */
function Message({ message }) {
  const isUser = message.role === 'user'
  const time = message.at
    ? new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  return (
    <div className={cx('flex items-end gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {isUser ? (
        <span className="mb-4 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-raised text-[11px] font-semibold text-slate-300">
          You
        </span>
      ) : (
        <span className="mb-4 shrink-0"><SentinelBot size={28} /></span>
      )}
      <div className={cx('flex max-w-[78%] flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cx(
          'px-3.5 py-2 text-sm leading-relaxed',
          isUser
            ? 'rounded-2xl rounded-br-sm bg-accent-500 text-white'
            : 'rounded-2xl rounded-bl-sm bg-surface-raised text-slate-200',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {message.sources?.length > 0 && (
          <details className="mt-2 border-t border-subtle pt-2">
            <summary className="cursor-pointer text-[15px] text-slate-400 hover:text-slate-200">
              {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
              {message.grounded === false && ' · quoted directly'}
            </summary>
            <ul className="mt-1.5 space-y-1">
              {message.sources.map((s) => (
                <li key={s} className="text-[15px] leading-snug text-slate-500">
                  {s}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
        {time && <span className="mt-1 px-1 text-[11px] text-slate-500">{time}</span>}
      </div>
    </div>
  )
}
