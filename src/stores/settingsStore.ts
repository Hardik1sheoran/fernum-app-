import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light' | 'forest' | 'ocean' | 'aurora'

interface SettingsState {
  theme: ThemeMode
  excludedPaths: string[]
  isPro: boolean
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  addExcludedPath: (path: string) => void
  removeExcludedPath: (path: string) => void
  setIsPro: (isPro: boolean) => void
  togglePro: () => void
}

const savedTheme = (localStorage.getItem('theme') as ThemeMode) || 'dark'
const savedIsPro = localStorage.getItem('fernum_is_pro') === 'true'

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: savedTheme,
  excludedPaths: ['C:\\Windows\\WinSxS', 'C:\\$Recycle.Bin'],
  isPro: savedIsPro,
  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },
  toggleTheme: () => {
    set((state) => {
      const themes: ThemeMode[] = ['dark', 'light', 'forest', 'ocean', 'aurora']
      const currentIndex = themes.indexOf(state.theme)
      const nextTheme = themes[(currentIndex + 1) % themes.length]
      localStorage.setItem('theme', nextTheme)
      return { theme: nextTheme }
    })
  },
  addExcludedPath: (path) =>
    set((state) => ({
      excludedPaths: state.excludedPaths.includes(path)
        ? state.excludedPaths
        : [...state.excludedPaths, path],
    })),
  removeExcludedPath: (path) =>
    set((state) => ({
      excludedPaths: state.excludedPaths.filter((p) => p !== path),
    })),
  setIsPro: (isPro) => {
    try {
      localStorage.setItem('fernum_is_pro', String(isPro))
    } catch {}
    set({ isPro })
  },
  togglePro: () => {
    set((state) => {
      const next = !state.isPro
      try {
        localStorage.setItem('fernum_is_pro', String(next))
      } catch {}
      return { isPro: next }
    })
  },
}))
