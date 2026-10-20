import { Link } from 'react-router-dom'
import Logo from './Logo'
import markOnDark from '../assets/deepsentinel-logo-light.png'
import { PHOTOS } from '../data/photos'
import { MODELS, VERDICT, txnField } from '../data/workedExample'

/**
 * Split layout shared by sign in and request access.
 *
 * The left panel carries the product argument so the page still says what
 * DeepSentinel is to someone who arrived on a deep link: a photograph of a
 * city in evening light, the claim, and the worked example's scores in a card
 * over it, read from the same record the home page follows. Below `lg` the
 * panel drops away entirely rather than stacking; on a phone, marketing above
 * a login form is just something to scroll past.
 *
 * The panel is a photograph on both themes, so its text uses fixed colours.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative m-4 hidden overflow-hidden rounded-[30px] bg-[#1a1410] lg:block">
        <img src={PHOTOS.cityGolden.src} alt={PHOTOS.cityGolden.alt}
             className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0"
             style={{ background: 'linear-gradient(180deg, rgb(14 11 9 / 0.55) 0%, rgb(14 11 9 / 0) 30%, rgb(14 11 9 / 0) 48%, rgb(14 11 9 / 0.85) 100%)' }} />

        <div className="relative flex h-full flex-col justify-between gap-8 p-10">
          <Link to="/" aria-label="DeepSentinel home" className="flex items-center gap-2.5 self-start">
            <img src={markOnDark} alt="" width={36} height={36} className="object-contain" draggable={false} />
            <span className="text-base font-semibold text-[#FBFAF7]">Deep<span className="text-[#2DD4BF]">Sentinel</span></span>
          </Link>

          <div className="orbit-bob w-[19rem] self-end rounded-[20px] border border-black/5 bg-white p-4 text-[#1A1815] shadow-[0_1px_2px_rgb(20_17_15/0.08),0_30px_60px_-28px_rgb(20_17_15/0.5)]">
            <div className="flex items-center justify-between">
              <span className="numeric text-[11px] text-[#6E655C]">{txnField('transaction_id')}</span>
              <span className="rounded-md border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-[#B91C1C]">
                {VERDICT}
              </span>
            </div>
            <div className="mt-3 space-y-2.5">
              {MODELS.map((m, i) => (
                <div key={m.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-xs">
                  <span>{m.label}</span>
                  <span className="h-[5px] overflow-hidden rounded-full bg-[#EFE9DF]">
                    <span className="block h-full rounded-full"
                          style={{ width: `${m.score * 100}%`, background: ['#00998C', '#BE123C', '#A45A06'][i] }} />
                  </span>
                  <span className="numeric text-right">{m.score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="max-w-md">
            <p className="display text-[4rem] leading-[0.95] text-[#FBFAF7]">
              Detect the fraud.
              <br />
              <span className="display-italic text-[#2DD4BF]">Then prove it.</span>
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-[#D6D1C9]">
              Three detectors, one verdict, and a report that cites its evidence.
            </p>
          </div>
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden" aria-label="DeepSentinel home">
            <Logo />
          </Link>

          <p className="eyebrow text-slate-500">Analyst console</p>
          <h1 className="display mt-3 text-[3.25rem] leading-[0.98] text-slate-100">{title}</h1>
          {subtitle && (
            <p className="mt-4 text-[15px] leading-relaxed text-slate-400">{subtitle}</p>
          )}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 border-t border-subtle pt-6 text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
