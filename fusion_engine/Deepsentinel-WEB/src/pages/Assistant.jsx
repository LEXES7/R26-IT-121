import { useCallback, useEffect, useRef, useState } from 'react'
import {
  askOperatorAssistant,
  getAssistantCapabilities,
} from '../services/api'
import {
  Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Spinner, cx,
} from '../components/ui'

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
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <Spinner className="mx-auto h-6 w-6" />
      </div>
    )
  }

  if (!caps?.available) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <PageHeader
          title="AI assistant"
          description="Ask questions about live transactions, fraud rings and case history."
        />
        <Card className="mt-6">
          <EmptyState
            icon="◆"
            title="Not included in your package"
            description={caps?.reason || 'The AI assistant is not enabled for this account.'}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <PageHeader
        title="AI assistant"
        description="Acts on live platform data — scores transactions, inspects fraud rings, searches case history."
        action={
          caps.llm_configured ? (
            <Badge tone="low">Model connected</Badge>
          ) : (
            <Badge tone="medium">No model configured</Badge>
          )
        }
      />

      {!caps.llm_configured && (
        <Alert tone="warning" title="Running without a language model" className="mt-4">
          Tools still execute and return real data, but answers are raw results rather
          than written explanations. Configure a Gemini key or an Ollama endpoint for
          full answers.
        </Alert>
      )}

      <Card className="mt-6 flex h-[min(32rem,65vh)] flex-col overflow-hidden p-0">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">
                Ask about a transaction, an account, or the state of the system.
              </p>
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => send(e)}
                  className="block w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-left text-sm text-slate-300 transition hover:border-strong hover:bg-surface-hover hover:text-white"
                >
                  {e}
                </button>
              ))}
            </div>
          )}

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

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex items-end gap-2 border-t border-subtle p-3"
        >
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask about a transaction, account or system state…"
            className="max-h-32 flex-1 resize-none rounded-lg border border-subtle bg-sentinel-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-strong focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </Card>
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
          isUser ? 'bg-blue-600/20 text-white' : 'border border-subtle bg-surface-raised text-slate-200',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {message.truncated && (
          <p className="mt-2 text-[11px] text-amber-400">
            Stopped at the configured step limit — the answer may be partial.
          </p>
        )}

        {message.steps?.length > 0 && (
          <details className="mt-3 border-t border-subtle pt-2">
            <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-200">
              {message.steps.length} tool call{message.steps.length > 1 ? 's' : ''} — show evidence
            </summary>
            <div className="mt-2 space-y-2">
              {message.steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-subtle bg-sentinel-900/60 p-2">
                  <p className="text-[11px] font-semibold text-slate-300">
                    {s.tool}
                    {s.error && <span className="ml-2 text-red-400">failed</span>}
                  </p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-snug text-slate-500">
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
