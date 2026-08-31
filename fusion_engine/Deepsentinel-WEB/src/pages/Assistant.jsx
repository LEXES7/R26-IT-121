import { useCallback, useEffect, useRef, useState } from 'react'
import {
  askOperatorAssistant,
  getAssistantCapabilities,
} from '../services/api'
import {
  Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Spinner, cx,
} from '../components/ui'
import { Panel } from '../components/ConsoleShell'

/**
 * Operator assistant — Professional package.
 *
 * Distinct from the public project chatbot: this one acts on the live platform.
 * It can score a transaction through all three detectors, pull the relational
 * fraud ring, and search analysis history.
 *
 * Because it acts rather than describes, every answer exposes the tools it ran
 * and what they returned. An analyst is going to act on a fraud verdict, so an
 * unexplained answer about someone's account is not usable evidence.
 */

const EXAMPLES = [
  'Is there a fraud ring around C1697378157?',
  'Are all three detection models reachable right now?',
  'Show me the most recent CRITICAL cases.',
  'Have we analysed account C1697378157 before?',
]

export default function Assistant() {
  const [caps, setCaps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    getAssistantCapabilities()
      .then(setCaps)
      .catch(() => setCaps({ available: false, reason: 'Could not reach the server.' }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = useCallback(
    async (question) => {
      const text = (question ?? input).trim()
      if (!text || busy) return
      setError(null)
      setInput('')
      const next = [...messages, { role: 'user', content: text }]
      setMessages(next)
      setBusy(true)
      try {
        const history = next
          .slice(0, -1)
          .map(({ role, content }) => ({ role, content }))
          .slice(-6)
        const res = await askOperatorAssistant(text, history)
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: res.answer,
            steps: res.steps || [],
            usedLlm: res.used_llm,
            truncated: res.truncated,
          },
        ])
      } catch (err) {
        setError(
          err?.response?.status === 403
            ? err.response.data?.detail || 'Your package does not include the assistant.'
            : 'Could not reach the assistant.',
        )
        setMessages((m) => m.slice(0, -1))
        setInput(text)
      } finally {
        setBusy(false)
      }
    },
    [busy, input, messages],
  )

  if (loading) {
    return (
          <div className="ds-fade-up" style={{ display: 'grid', gap: 15 }}>
        <Spinner className="mx-auto h-6 w-6" />
      </div>
    )
  }

  if (!caps?.available) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Panel className="ds-panel-pad">
          <EmptyState
            icon="◆"
            title="Not included in your package"
            description={caps?.reason || 'The AI assistant is not enabled for this account.'}
          />
        </Panel>
      </div>
    )
  }

  const composer = {
    input, setInput, send, busy,
    tools: (caps?.tools ?? []).map((t) => t.description || t.name),
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">

      {!caps.llm_configured && (
        <Alert tone="warning" title="Running without a language model" className="mt-4">
          Tools still execute and return real data, but answers are raw results rather
          than written explanations. Configure a Gemini key or an Ollama endpoint for
          full answers.
        </Alert>
      )}

      {/* Empty until asked. The composer is the page when there is nothing to
          read yet, and drops to the foot of the thread once there is — the
          shape every assistant now uses, because a chat box pinned to the
          bottom of an empty panel looks like it is waiting for something that
          has already happened. */}
      {messages.length === 0 ? (
        <div className="flex min-h-[52vh] flex-col items-center justify-center">
          <h1 className="text-center text-[34px] tracking-tight"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            How can I help you?
          </h1>
          <Composer {...composer} className="mt-8 w-full max-w-2xl" />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => send(e)}
                      className="rounded-full border px-3.5 py-2 text-[14px] transition-colors"
                      style={{ borderColor: 'rgb(var(--ds-line))',
                               color: 'rgb(var(--ds-muted))' }}>
                {e}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef}
               className="max-h-[58vh] space-y-4 overflow-y-auto pb-4">
            {messages.map((m, i) => (
              <Turn key={i} message={m} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Spinner className="h-3.5 w-3.5" />
                Running tools…
              </div>
            )}
            {error && <Alert tone="error">{error}</Alert>}
          </div>
          <Composer {...composer} className="mt-2" />
        </>
      )}
    </div>
  )
}

/* One composer, used centred on the empty page and at the foot of a thread.
 *
 * The row under the field is not decoration: "Tools" opens what the assistant
 * can actually do, read from the server rather than listed here, so it cannot
 * promise a capability the deployment does not have. There is no microphone
 * button — dictation is not wired up, and a control that does nothing is worse
 * than an absent one. */
function Composer({ input, setInput, send, busy, tools, className = '' }) {
  const [showTools, setShowTools] = useState(false)
  return (
    <div className={className}>
      {showTools && tools?.length > 0 && (
        <div className="mb-2 rounded-xl border p-3"
             style={{ borderColor: 'rgb(var(--ds-line))',
                      background: 'rgb(var(--ds-surface))' }}>
          <p className="ds-mono text-[11px] uppercase tracking-[.14em]"
             style={{ color: 'rgb(var(--ds-faint))' }}>What it can do</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {tools.map((t) => (
              <li key={t} className="text-[14px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send() }}
            className="rounded-2xl border p-3 transition-colors focus-within:border-accent-400/50"
            style={{ borderColor: 'rgb(var(--ds-line))',
                     background: 'rgb(var(--ds-surface-2))' }}>
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
          placeholder="Message…"
          className="w-full resize-none bg-transparent px-2 py-1 text-[16px] outline-none"
          style={{ color: 'rgb(var(--ds-ink))' }}
        />
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={() => setShowTools((v) => !v)}
                  aria-expanded={showTools}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
                  style={{ borderColor: 'rgb(var(--ds-line))',
                           color: 'rgb(var(--ds-muted))' }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                 stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 8h10M18 8h2M4 16h4M12 16h8M14 5v6M8 13v6" />
            </svg>
            Tools
          </button>
          <span className="ml-auto text-[12px]" style={{ color: 'rgb(var(--ds-faint))' }}>
            Enter to send
          </span>
          <button type="submit" disabled={busy || !input.trim()}
                  className="btn-shader rounded-lg px-4 py-2 text-[14px] disabled:opacity-40">
            Ask
          </button>
        </div>
      </form>
    </div>
  )
}

function Turn({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={cx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed',
          isUser ? 'bg-accent-500/20 text-slate-200' : 'border border-subtle bg-surface-raised text-slate-200',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {message.truncated && (
          <p className="mt-2 text-[15px] text-amber-400">
            Stopped at the configured step limit — the answer may be partial.
          </p>
        )}

        {message.steps?.length > 0 && (
          <details className="mt-3 border-t border-subtle pt-2">
            <summary className="cursor-pointer text-[15px] text-slate-400 hover:text-slate-200">
              {message.steps.length} tool call{message.steps.length > 1 ? 's' : ''} — show evidence
            </summary>
            <div className="mt-2 space-y-2">
              {message.steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-subtle bg-sentinel-900/60 p-2">
                  <p className="text-[15px] font-semibold text-slate-300">
                    {s.tool}
                    {s.error && <span className="ml-2 text-red-400">failed</span>}
                  </p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[14px] leading-snug text-slate-500">
                    {s.error || JSON.stringify(s.result, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
