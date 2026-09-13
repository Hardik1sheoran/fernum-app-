import { create } from 'zustand'
import type { InstalledApp } from '@shared/types'

interface AppsState {
  apps: InstalledApp[]
  searchQuery: string
  sortBy: 'size' | 'name' | 'date'
  isLoading: boolean
  selectedApp: InstalledApp | null

  setApps: (apps: InstalledApp[]) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sort: 'size' | 'name' | 'date') => void
  setIsLoading: (loading: boolean) => void
  setSelectedApp: (app: InstalledApp | null) => void
}

export const useAppsStore = create<AppsState>((set) => ({
  apps: [],
  searchQuery: '',
  sortBy: 'size',
  isLoading: false,
  selectedApp: null,

  setApps: (apps) => set({ apps }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSortBy: (sortBy) => set({ sortBy }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setSelectedApp: (selectedApp) => set({ selectedApp }),
}))
