import { Component } from 'react'
import { Button, Card } from './ui'

/**
 * Catches render errors so one broken component does not blank the whole app.
 *
 * React has no hook equivalent for error boundaries, so this stays a class.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surfaces in the browser console for diagnosis. A production deployment
    // would forward this to an error tracker instead.
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Card className="p-8">
          <h1 className="text-lg font-semibold text-slate-200">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">
            This section failed to render. The rest of the application is unaffected.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-subtle bg-surface p-3 text-xs text-slate-500">
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => this.setState({ error: null })} variant="secondary" size="sm">
              Try again
            </Button>
            <Button onClick={() => window.location.assign('/')} size="sm">
              Back to overview
            </Button>
          </div>
        </Card>
      </div>
    )
  }
}
