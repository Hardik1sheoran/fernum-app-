import { describe, it, expect } from 'vitest'
import { CATEGORY_COLORS } from '../src/components/Treemap/treemapLayout'

describe('Fernum Architecture Sanity', () => {
  it('defines file category color mappings', () => {
    expect(CATEGORY_COLORS).toBeDefined()
    expect(CATEGORY_COLORS.video).toBe('#8b5cf6')
    expect(CATEGORY_COLORS.code).toBe('#06b6d4')
    expect(CATEGORY_COLORS.archive).toBe('#10b981')
  })
})
