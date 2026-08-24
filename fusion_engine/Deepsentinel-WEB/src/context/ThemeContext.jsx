import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * Theme, persisted per browser.
 *
 * Defaults to the operating system preference rather than forcing dark: an
 * analyst on a bright trading floor and one working at night want opposite
 * things, and the OS already knows which.
 *
 * Every storage access is guarded — localStorage throws in private browsing
 * and sandboxed frames, and a failure there should cost the theme, not the app.
 */

const ThemeContext = createContext({ theme: 'dark', toggle: () => {}, setTheme: () => {} })
const KEY = 'ds.theme'

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function stored() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function apply(theme) {
  document.documentElement.dataset.theme = theme
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => stored() ?? systemTheme())

  // Paint before first content so there is no flash of the wrong theme.
  useEffect(() => { apply(theme) }, [theme])

  // Follow the OS while the user has expressed no preference of their own.
  useEffect(() => {
    if (stored()) return
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!mq) return
    const onChange = () => setThemeState(systemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next) => {
    // Transition only while switching, so the class cannot interfere with
    // scroll-pinned animations during normal use.
    const root = document.documentElement
    root.classList.add('theme-transition')
    window.setTimeout(() => root.classList.remove('theme-transition'), 260)

    setThemeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* preference simply will not persist */
    }
  }, [])

  const toggle = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  )

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
