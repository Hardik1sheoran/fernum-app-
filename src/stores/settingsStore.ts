import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light' | 'forest' | 'ocean' | 'aurora' | 'rainbow'

interface SettingsState {
  theme: ThemeMode
  excludedPaths: string[]
  isPro: boolean
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  addExcludedPath: (path: string) => void
  removeExcludedPath: (path: string) => void
  setIsPro: (isPro: boolean) => void
}

function getSafeItem(key: string): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

const savedTheme = (getSafeItem('theme') as ThemeMode) || 'dark'

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: savedTheme,
  excludedPaths: ['C:\\Windows\\WinSxS', 'C:\\$Recycle.Bin'],
  isPro: false,
  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme)
    } catch {}
    set({ theme })
  },
  toggleTheme: () => {
    set((state) => {
      const themes: ThemeMode[] = ['dark', 'light', 'forest', 'ocean', 'aurora', 'rainbow']
      const currentIndex = themes.indexOf(state.theme)
      const nextTheme = themes[(currentIndex + 1) % themes.length]
      try {
        localStorage.setItem('theme', nextTheme)
      } catch {}
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
}))
