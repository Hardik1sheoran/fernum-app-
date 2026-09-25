import { ipcMain } from 'electron'
import type { SearchQueryOptions, SearchResultItem, SearchResultResponse } from '../../shared/types'
import { searchDiskFiles } from '../services/searchService'

export { searchDiskFiles }

/**
 * Registers Search IPC handler.
 */
export function registerSearchIpc(): void {
  ipcMain.handle(
    'search:files',
    async (
      _event,
      options: SearchQueryOptions
    ): Promise<SearchResultItem[] | SearchResultResponse> => {
      return searchDiskFiles(options)
    }
  )
}
