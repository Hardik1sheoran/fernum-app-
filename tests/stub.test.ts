import { describe, it, expect } from 'vitest'
import { CATEGORY_COLORS } from '../src/components/Treemap/treemapLayout'
import { useSettingsStore, type ThemeMode } from '../src/stores/settingsStore'

describe('Fernum Architecture Sanity', () => {
  it('defines file category color mappings', () => {
    expect(CATEGORY_COLORS).toBeDefined()
    expect(CATEGORY_COLORS.video).toBe('#8b5cf6')
    expect(CATEGORY_COLORS.code).toBe('#06b6d4')
    expect(CATEGORY_COLORS.archive).toBe('#10b981')
  })

  it('supports the new Rainbow liquid marbling theme', () => {
    const store = useSettingsStore.getState()
    store.setTheme('rainbow')
    expect(useSettingsStore.getState().theme).toBe('rainbow')

    // Cycle through themes
    store.toggleTheme()
    const nextTheme = useSettingsStore.getState().theme
    expect(['dark', 'light', 'forest', 'ocean', 'aurora', 'rainbow']).toContain(nextTheme)
  })
})
