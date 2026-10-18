import { Link } from 'react-router-dom'
import Globe from './Globe'
import { ArrowLink } from './Editorial'
import { cx } from './ui'
import { useAuth } from '../context/AuthContext'
import { MODELS, REPORT, REPORT_TITLE, VERDICT, txnField } from '../data/workedExample'

/**
 * The home page hero: the claim, and the platform at work under it.
 *
 * The globe rises over the bottom edge like a planet over a horizon, and the
 * worked example the page follows orbits it: the three detector readings, the
 * report they produced, and two of the findings behind them. The cards read
 * from the same record as the walkthrough further down, so the hero is a
 * preview of the page rather than decoration.
 *
 * The planet is dark in both themes. On the light ground it is the one heavy
 * object in view, which gives a pale hero somewhere for the eye to land.
 */

const TX_ID = txnField('transaction_id')
const SINK = txnField('nameDest')
const MODEL = Object.fromEntries(MODELS.map((m) => [m.key, m]))

// What the sign along the horizon spells out, in the order it passes.
const TICKER = [
  { text: `Screening ${TX_ID}` },
  { text: `Verdict ${VERDICT}`, alert: true },
  { text: 'Report grounded in FATF typology' },
  { text: 'Three detectors · one verdict' },
]

function ScoreCard() {
  return (
    <div className="glass orbit-card orbit-bob w-[18rem] rounded-[18px] p-4" style={{ '--bob': '5.5s' }}>
      <div className="flex items-center justify-between gap-3">
        <span className="numeric text-[11px] text-slate-500">{TX_ID}</span>
        <span className="rounded-md border border-risk-critical/30 bg-risk-critical/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-risk-critical">
          {VERDICT}
        </span>
      </div>
      <div className="mt-3 space-y-2.5">
        {MODELS.map((m, i) => (
          <div key={m.key}
               className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-xs text-slate-300">
            <span>{m.label}</span>
            <span className="h-[5px] overflow-hidden rounded-full bg-surface-overlay">
              <span className="orbit-bar block h-full rounded-full"
                    style={{ width: `${m.score * 100}%`, background: m.colour, '--d': `${1.5 + i * 0.12}s` }} />
            </span>
            <span className="numeric text-right text-slate-200">{m.score.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportCard() {
  // The report's opening sentence, with the account set as data.
  const [before, after] = REPORT.slice(1, 3).join(' ').split(SINK)

  return (
    <div className="glass orbit-card orbit-bob w-[18.75rem] rounded-[18px] p-4" style={{ '--bob': '7s' }}>
      <p className="eyebrow text-slate-500">
        Forensic report · <span className="text-accent-400">grounded</span>
      </p>
      <p className="mt-2.5 text-sm font-semibold leading-snug text-slate-100 first-letter:uppercase">
        {REPORT_TITLE}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
        {before}<span className="numeric text-slate-200">{SINK}</span>{after}
      </p>
    </div>
  )
}

function FindingChip({ model, dot, bob }) {
  return (
    <span className="glass orbit-card orbit-bob inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs text-slate-300"
          style={{ '--bob': bob }}>
      <span aria-hidden className={cx('h-2 w-2 rounded-full', dot)} />
      {model.label} · {model.brief}
    </span>
  )
}

/** The dot-matrix sign. Two identical runs, so the loop has no seam. */
function Ticker() {
  return (
    <div aria-hidden className="ticker">
      <div className="ticker-band">
        <div className="ticker-window">
          <div className="ticker-track">
            {[0, 1].map((copy) => (
              <span key={copy} className="ticker-run">
                {TICKER.map((t) => (
                  <span key={t.text} className={t.alert ? 'ticker-alert' : undefined}>{t.text}</span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomeHero() {
  const { isAuthenticated } = useAuth()

  return (
    // Pulled up under the floating navigation, so the teal field behind the
    // headline is also what the glass bar refracts.
    <section className="hero-cine relative -mt-[4.5rem] overflow-hidden pt-[7.75rem] lg:pt-[9.25rem]">
      <div aria-hidden className="hero-fields" />
      <div aria-hidden className="hero-dots" />
      <div aria-hidden className="hero-grain" />

      {/* The claim arrives in reading order, each line a beat behind the last. */}
      <div className="relative z-[3] mx-auto flex max-w-[88rem] flex-col items-center px-5 text-center sm:px-8">
        <p className="glass enter enter--soft inline-flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5 text-xs text-slate-300"
           style={{ '--d': '0.1s' }}>
          <span aria-hidden className="hero-pulse" />
          Multi-modal fraud detection, screening live
        </p>

        <h1 className="display mt-6 text-[3.25rem] leading-[0.92] tracking-[-0.02em] text-slate-100 sm:text-[5rem] lg:text-[6.5rem] xl:text-[7.375rem]">
          <span className="line-mask">
            <span className="enter enter--mask block" style={{ '--d': '0.22s' }}>
              Detect the fraud.
            </span>
          </span>
          <span className="line-mask">
            <span className="enter enter--mask block" style={{ '--d': '0.4s' }}>
              <span className="display-italic enter-focus text-accent-400">Then prove it.</span>
            </span>
          </span>
        </h1>

        <p className="enter enter--soft mt-6 max-w-[37.5rem] text-base leading-relaxed text-slate-400 sm:text-lg"
           style={{ '--d': '0.64s' }}>
          Three models read every payment. One verdict comes back, with a
          forensic report that cites its own evidence.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
          <Link
            to={isAuthenticated ? '/' : '/login'}
            className="liquid-solid cta-ink enter enter--rise inline-flex items-center rounded-[14px] px-7 py-3.5 text-[15px] font-semibold"
            style={{ '--d': '0.8s' }}
          >
            {isAuthenticated ? 'Open the analyzer' : 'Sign in to run it'}
          </Link>
          <a href="#pipeline"
             className="liquid arrow-slide enter enter--rise inline-flex items-center rounded-[14px] px-6 py-3.5"
             style={{ '--d': '0.9s' }}>
            <ArrowLink>See how it works</ArrowLink>
          </a>
        </div>
      </div>

      {/* The horizon. Only the top of the planet clears it; the sign covers
          the rest. */}
      <div className="relative mx-auto mt-8 h-[19rem] max-w-[88rem] sm:h-[24rem] lg:h-[30rem]">
        <div className="enter enter--planet absolute inset-x-0 top-0 mx-auto aspect-square w-[26rem] sm:w-[34rem] lg:w-[45rem]"
             style={{ '--d': '0.35s' }}>
          <div aria-hidden className="planet-glow" />
          <Globe variant="planet" className="relative" />
        </div>

        {/* The orbit needs room either side of the planet. Below xl the cards
            would cover it, so there the planet stands alone. */}
        <div className="pointer-events-none absolute inset-0 hidden xl:block">
          <div className="enter enter--rise absolute left-[8%] top-[-1.5rem]" style={{ '--d': '1.1s' }}>
            <ScoreCard />
          </div>
          <div className="enter enter--rise absolute right-[8%] top-[-3rem]" style={{ '--d': '1.25s' }}>
            <ReportCard />
          </div>
          <div className="enter enter--rise absolute left-[17%] top-[13.5rem]" style={{ '--d': '1.4s' }}>
            <FindingChip model={MODEL.graph} dot="bg-modality-graph" bob="6.2s" />
          </div>
          <div className="enter enter--rise absolute right-[15%] top-[11.75rem]" style={{ '--d': '1.55s' }}>
            <FindingChip model={MODEL.temporal} dot="bg-modality-temporal" bob="8s" />
          </div>
        </div>
      </div>

      <Ticker />
    </section>
  )
}
