import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

export function useTheme() {
  const { theme, toggleTheme, setTheme } = useSettingsStore()

  useEffect(() => {
    const root = document.documentElement
    // Remove all theme classes first
    root.classList.remove('dark', 'theme-forest', 'theme-ocean', 'theme-aurora')

    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'forest') {
      root.classList.add('dark', 'theme-forest')
    } else if (theme === 'ocean') {
      root.classList.add('dark', 'theme-ocean')
    } else if (theme === 'aurora') {
      root.classList.add('dark', 'theme-aurora')
    }

    if (window.electronAPI?.setTheme) {
      window.electronAPI.setTheme(theme === 'light' ? 'light' : 'dark').catch(() => {})
    }
  }, [theme])

  return { theme, toggleTheme, setTheme, isDark: theme === 'dark' }
}
