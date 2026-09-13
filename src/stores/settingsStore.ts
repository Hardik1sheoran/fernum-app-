import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light' | 'forest' | 'ocean' | 'aurora'

interface SettingsState {
  theme: ThemeMode
  excludedPaths: string[]
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  addExcludedPath: (path: string) => void
  removeExcludedPath: (path: string) => void
}

const savedTheme = (localStorage.getItem('theme') as ThemeMode) || 'dark'

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: savedTheme,
  excludedPaths: ['C:\\Windows\\WinSxS', 'C:\\$Recycle.Bin'],
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
}))
