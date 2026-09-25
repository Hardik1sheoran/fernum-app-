import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

export function useTheme() {
  const { theme, toggleTheme, setTheme } = useSettingsStore()

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const classesToRemove = ['dark', 'light', 'theme-forest', 'theme-ocean', 'theme-aurora', 'theme-rainbow', 'theme-light']
    root.classList.remove(...classesToRemove)
    if (body) body.classList.remove(...classesToRemove)

    if (theme === 'dark') {
      root.classList.add('dark')
      if (body) body.classList.add('dark')
    } else if (theme === 'forest') {
      root.classList.add('theme-forest')
      if (body) body.classList.add('theme-forest')
    } else if (theme === 'ocean') {
      root.classList.add('theme-ocean')
      if (body) body.classList.add('theme-ocean')
    } else if (theme === 'aurora') {
      root.classList.add('dark', 'theme-aurora')
      if (body) body.classList.add('dark', 'theme-aurora')
    } else if (theme === 'rainbow') {
      root.classList.add('dark', 'theme-rainbow')
      if (body) body.classList.add('dark', 'theme-rainbow')
    } else if (theme === 'light') {
      root.classList.add('light', 'theme-light')
      if (body) body.classList.add('light', 'theme-light')
    }

    root.setAttribute('data-theme', theme)
    if (body) body.setAttribute('data-theme', theme)

    if (window.electronAPI?.setTheme) {
      const electronTheme = (theme === 'light' || theme === 'ocean' || theme === 'forest') ? 'light' : 'dark'
      window.electronAPI.setTheme(electronTheme).catch(() => {})
    }
  }, [theme])

  const isDark = theme === 'dark' || theme === 'aurora' || theme === 'rainbow'
  return { theme, toggleTheme, setTheme, isDark }
}
