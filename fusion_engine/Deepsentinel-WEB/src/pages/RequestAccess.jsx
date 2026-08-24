import { useState } from 'react'
import { Link } from 'react-router-dom'
import { submitEnquiry } from '../services/api'
import { Alert, Button, Field, Input, Select, cx } from '../components/ui'
import AuthLayout from '../components/AuthLayout'

/**
 * Enterprise enquiry.
 *
 * Not a sign-up — the first step of one. The platform reads customer
 * transaction data, so accounts are opened by an administrator after a
 * conversation, and this form starts that conversation. Saying so as a
 * three-step process rather than as "this creates nothing" matters: the same
 * fact reads as a dead end one way and as onboarding the other.
 *
 * The fields are the ones that make the first call useful: who they are, how
 * much volume they run, which part of the platform they care about, and how
 * soon. Everything beyond that belongs in the conversation, not the form.
 */

const ORG_TYPES = [
  ['bank', 'Bank'],
  ['credit_union', 'Credit union'],
  ['payment_processor', 'Payment processor'],
  ['fintech', 'Fintech / neobank'],
  ['regulator', 'Regulator / supervisory body'],
  ['consultancy', 'Consultancy'],
  ['other', 'Other'],
]

const VOLUMES = [
  '', 'Under 100k / month', '100k – 1M / month', '1M – 10M / month', 'Over 10M / month',
]

const TIMELINES = ['', 'Exploring', 'Within 3 months', 'Within 6 months', 'Budgeted, ready now']

const INTERESTS = [
  ['fraud_rings', 'Detecting mule rings and networks'],
  ['explainability', 'Explainable, auditable decisions'],
  ['reporting', 'Automated forensic reporting'],
  ['integration', 'Integrating with our existing stack'],
  ['compliance', 'Regulatory / AML compliance'],
  ['research', 'Research collaboration'],
]

const EMPTY = {
  organisation: '', org_type: 'bank', country: '',
  contact_name: '', job_title: '', work_email: '', phone: '',
  monthly_volume: '', interests: [], timeline: '', message: '',
  website: '',   // honeypot
}

export default function RequestAccess() {
  const [form, setForm] = useState(EMPTY)
  const [state, setState] = useState('idle')   // idle | sending | sent | error
  const [error, setError] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const toggleInterest = (key) =>
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(key)
        ? f.interests.filter((i) => i !== key)
        : [...f.interests, key],
    }))

  const submit = async (e) => {
    e.preventDefault()
    if (state === 'sending') return

    setState('sending')
    setError(null)
    try {
      await submitEnquiry(form)
      setState('sent')
    } catch (err) {
      setState('error')
      setError(
        err?.response?.status === 429
          ? 'That is a lot of enquiries from this address. Please try again later, or email us directly.'
          : 'We could not send that just now. Please try again, or email us directly.',
      )
    }
  }

  if (state === 'sent') {
    return (
      <AuthLayout
        title="Thank you"
        subtitle="Your enquiry has reached the team."
        footer={
          <Link to="/" className="font-medium text-accent-500 hover:text-accent-400">
            Back to overview
          </Link>
        }
      >
        <Alert tone="success" title="We will be in touch">
          Someone will reply to <strong>{form.work_email}</strong> to arrange a
          call. Once we understand how your team works, we will set up your
          accounts and assign roles before you sign in for the first time.
        </Alert>

        <div className="mt-6 rounded-xl border border-subtle bg-surface p-5">
          <p className="text-sm font-medium text-slate-300">While you wait</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            The architecture, the evaluation methodology and the honest results —
            including where the models fall short — are all public.
          </p>
          <Link
            to="/about"
            className="mt-3 inline-block text-sm font-medium text-accent-500 hover:text-accent-400"
          >
            Read the architecture →
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Talk to us"
      subtitle="Tell us about your institution and what you need. We will arrange a call, then set up accounts for your team."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-500 hover:text-accent-400">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}

        {/* Honeypot — hidden from people, irresistible to bots. */}
        <input
          type="text" name="website" tabIndex={-1} autoComplete="off"
          aria-hidden value={form.website} onChange={set('website')}
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wider text-accent-500">
            Your institution
          </legend>

          <Field label="Organisation" htmlFor="organisation">
            <Input id="organisation" required value={form.organisation}
              onChange={set('organisation')} placeholder="Northbank plc" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="org_type">
              <Select id="org_type" value={form.org_type} onChange={set('org_type')}>
                {ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Country" htmlFor="country">
              <Input id="country" value={form.country} onChange={set('country')} placeholder="United Kingdom" />
            </Field>
          </div>

          <Field
            label="Transaction volume"
            htmlFor="monthly_volume"
            hint="Rough scale is enough — it tells us what deployment shape to discuss."
          >
            <Select id="monthly_volume" value={form.monthly_volume} onChange={set('monthly_volume')}>
              {VOLUMES.map((v) => (
                <option key={v} value={v}>{v || 'Select…'}</option>
              ))}
            </Select>
          </Field>
        </fieldset>

        <fieldset className="space-y-4 border-t border-subtle pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-accent-500">
            Who we should speak to
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="contact_name">
              <Input id="contact_name" required value={form.contact_name}
                onChange={set('contact_name')} placeholder="Jane Cooper" />
            </Field>
            <Field label="Job title" htmlFor="job_title">
              <Input id="job_title" value={form.job_title} onChange={set('job_title')}
                placeholder="Head of Financial Crime" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Work email" htmlFor="work_email">
              <Input id="work_email" type="email" required value={form.work_email}
                onChange={set('work_email')} placeholder="jane@northbank.com" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" value={form.phone} onChange={set('phone')} placeholder="Optional" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-subtle pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-accent-500">
            What you need
          </legend>

          <div className="flex flex-wrap gap-2">
            {INTERESTS.map(([key, label]) => {
              const on = form.interests.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleInterest(key)}
                  className={cx(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    on
                      ? 'border-accent-500/50 bg-accent-500/10 text-accent-500'
                      : 'border-subtle text-slate-500 hover:border-strong hover:text-slate-300',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <Field label="Timeline" htmlFor="timeline">
            <Select id="timeline" value={form.timeline} onChange={set('timeline')}>
              {TIMELINES.map((t) => (
                <option key={t} value={t}>{t || 'Select…'}</option>
              ))}
            </Select>
          </Field>

          <Field label="Anything else?" htmlFor="message">
            <textarea
              id="message"
              rows={4}
              value={form.message}
              onChange={set('message')}
              placeholder="We are seeing coordinated mule activity across newly opened accounts and our current rules engine flags too much to review."
              className="w-full resize-none rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent-500/50 focus:outline-none"
            />
          </Field>
        </fieldset>

        <Button type="submit" size="lg" loading={state === 'sending'} className="w-full">
          {state === 'sending' ? 'Sending…' : 'Send enquiry'}
        </Button>

        <div className="rounded-xl border border-subtle bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            What happens next
          </p>
          <ol className="mt-3 space-y-2.5">
            {[
              ['1', 'We read your enquiry', 'Usually the same working day.'],
              ['2', 'We arrange a call', 'To understand your data, volume and constraints.'],
              ['3', 'We set up your accounts', 'Configured for your team, with roles assigned.'],
            ].map(([n, title, detail]) => (
              <li key={n} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-[10px] font-bold text-accent-500">
                  {n}
                </span>
                <span>
                  <span className="block text-xs font-medium text-slate-300">{title}</span>
                  <span className="block text-[11px] leading-relaxed text-slate-600">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-subtle pt-3 text-[11px] leading-relaxed text-slate-600">
            Your details are used only to respond to this enquiry.
          </p>
        </div>
      </form>
    </AuthLayout>
  )
}
