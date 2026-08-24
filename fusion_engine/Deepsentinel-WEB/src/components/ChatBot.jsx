import { useEffect, useRef, useState } from 'react'
import { askAssistant, getAssistantSuggestions } from '../services/api'
import { Spinner, cx } from './ui'

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
    const next = [...messages, { role: 'user', content: text }]
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
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg shadow-accent-500/25 transition hover:scale-105 hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-sentinel-950"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[min(34rem,80vh)] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-subtle bg-sentinel-900 shadow-2xl ring-1 ring-black/5">
      <header className="flex items-center justify-between border-b border-subtle px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-200">Project assistant</p>
          <p className="text-xs text-slate-400">Answers from the project documentation</p>
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
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Try asking</p>
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
          className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition enabled:hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}

function Message({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={cx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-accent-500/15 text-slate-200'
            : 'border border-subtle bg-surface-raised text-slate-300',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {message.sources?.length > 0 && (
          <details className="mt-2 border-t border-subtle pt-2">
            <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-200">
              {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
              {message.grounded === false && ' · quoted directly'}
            </summary>
            <ul className="mt-1.5 space-y-1">
              {message.sources.map((s) => (
                <li key={s} className="text-[11px] leading-snug text-slate-500">
                  {s}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
