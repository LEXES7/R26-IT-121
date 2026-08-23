import { useState } from 'react'
import { Button, Field, Input, Select } from './ui'

const TRANSACTION_TYPES = ['TRANSFER', 'CASH_OUT', 'CASH_IN', 'PAYMENT', 'DEBIT']

const randomAccount = () => 'C' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0')

const DEFAULTS = {
  step: 1,
  type: 'TRANSFER',
  amount: 50000,
  nameOrig: randomAccount(),
  nameDest: randomAccount(),
  oldbalanceOrg: 50000,
  newbalanceOrig: 0,
  oldbalanceDest: 0,
  newbalanceDest: 50000,
  isFlaggedFraud: 0,
}

// Only the fields the backend's TransactionData accepts. Anything else is
// silently dropped by Pydantic, so it is built explicitly rather than spread.
const NUMERIC = [
  'amount',
  'oldbalanceOrg',
  'newbalanceOrig',
  'oldbalanceDest',
  'newbalanceDest',
]

export default function TransactionForm({ onSubmit, loading }) {
  const [form, setForm] = useState(DEFAULTS)
  const [errors, setErrors] = useState({})

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
  }

  const validate = () => {
    const e = {}
    const step = Number(form.step)
    if (!Number.isInteger(step) || step < 1 || step > 744)
      e.step = 'Whole number between 1 and 744'
    if (!(Number(form.amount) > 0)) e.amount = 'Must be greater than zero'
    if (!/^[A-Za-z]\d{6,}$/.test(String(form.nameOrig).trim()))
      e.nameOrig = 'Letter followed by at least 6 digits, e.g. C123456789'
    if (!/^[A-Za-z]\d{6,}$/.test(String(form.nameDest).trim()))
      e.nameDest = 'Letter followed by at least 6 digits'
    if (String(form.nameOrig).trim() === String(form.nameDest).trim())
      e.nameDest = 'Sender and recipient must differ'

    for (const key of NUMERIC) {
      if (Number(form[key]) < 0) e[key] = 'Cannot be negative'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!validate()) return

    onSubmit({
      step: Number(form.step),
      type: form.type,
      amount: Number(form.amount),
      nameOrig: String(form.nameOrig).trim(),
      nameDest: String(form.nameDest).trim(),
      oldbalanceOrg: Number(form.oldbalanceOrg),
      newbalanceOrig: Number(form.newbalanceOrig),
      oldbalanceDest: Number(form.oldbalanceDest),
      newbalanceDest: Number(form.newbalanceDest),
      isFlaggedFraud: Number(form.isFlaggedFraud) || 0,
    })
  }

  // A drained originating account paired with a matching credit is the shape a
  // mule transfer takes, so the generator produces something worth scoring
  // rather than uniform noise.
  const randomise = () => {
    const amount = Math.floor(Math.random() * 200000) + 1000
    const openingBalance = amount + Math.floor(Math.random() * 5000)
    setForm({
      step: Math.floor(Math.random() * 744) + 1,
      type: TRANSACTION_TYPES[Math.floor(Math.random() * 2)], // TRANSFER or CASH_OUT
      amount,
      nameOrig: randomAccount(),
      nameDest: randomAccount(),
      oldbalanceOrg: openingBalance,
      newbalanceOrig: openingBalance - amount,
      oldbalanceDest: Math.floor(Math.random() * 20000),
      newbalanceDest: Math.floor(Math.random() * 20000) + amount,
      isFlaggedFraud: 0,
    })
    setErrors({})
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="tx-type">
          <Select id="tx-type" value={form.type} onChange={set('type')}>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Amount" error={errors.amount} htmlFor="tx-amount">
          <Input
            id="tx-amount"
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={set('amount')}
            error={errors.amount}
          />
        </Field>
      </div>

      <Field label="Sender account" error={errors.nameOrig} htmlFor="tx-orig">
        <Input
          id="tx-orig"
          value={form.nameOrig}
          onChange={set('nameOrig')}
          placeholder="C123456789"
          className="font-mono"
          error={errors.nameOrig}
        />
      </Field>

      <Field label="Recipient account" error={errors.nameDest} htmlFor="tx-dest">
        <Input
          id="tx-dest"
          value={form.nameDest}
          onChange={set('nameDest')}
          placeholder="C987654321"
          className="font-mono"
          error={errors.nameDest}
        />
      </Field>

      <div className="space-y-3 rounded-xl border border-subtle bg-surface p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Balances
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sender before" error={errors.oldbalanceOrg}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.oldbalanceOrg}
              onChange={set('oldbalanceOrg')}
              error={errors.oldbalanceOrg}
            />
          </Field>
          <Field label="Sender after" error={errors.newbalanceOrig}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.newbalanceOrig}
              onChange={set('newbalanceOrig')}
              error={errors.newbalanceOrig}
            />
          </Field>
          <Field label="Recipient before" error={errors.oldbalanceDest}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.oldbalanceDest}
              onChange={set('oldbalanceDest')}
              error={errors.oldbalanceDest}
            />
          </Field>
          <Field label="Recipient after" error={errors.newbalanceDest}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.newbalanceDest}
              onChange={set('newbalanceDest')}
              error={errors.newbalanceDest}
            />
          </Field>
        </div>
      </div>

      <Field
        label="Time step"
        error={errors.step}
        hint="PaySim simulation hour, 1–744"
        htmlFor="tx-step"
      >
        <Input
          id="tx-step"
          type="number"
          min="1"
          max="744"
          value={form.step}
          onChange={set('step')}
          error={errors.step}
        />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" loading={loading} className="flex-1">
          {loading ? 'Analyzing…' : 'Analyze transaction'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={randomise}
          title="Generate a plausible test transaction"
        >
          🎲
        </Button>
      </div>
    </form>
  )
}
