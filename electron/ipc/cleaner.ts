import { ipcMain } from 'electron'
import type { JunkCategoryType } from '../../shared/types'
import {
  scanSystemJunk,
  cleanSystemJunk,
  isAllowedJunkPath,
  inspectDirectoryJunk,
  inspectRecycleBin,
  invalidateJunkScanCache,
  clearRecycleBinNative,
  cleanDirectoryContents,
  getCategoryConfigs,
} from '../services/cleanerService'

export {
  scanSystemJunk,
  cleanSystemJunk,
  isAllowedJunkPath,
  inspectDirectoryJunk,
  inspectRecycleBin,
  invalidateJunkScanCache,
  clearRecycleBinNative,
  cleanDirectoryContents,
  getCategoryConfigs,
}

/**
 * Registers Cleaner IPC handlers.
 */
export function registerCleanerIpc(): void {
  ipcMain.handle('cleaner:scan', async (_event, categories?: JunkCategoryType[], forceRescan?: boolean) => {
    return scanSystemJunk(categories, forceRescan)
  })

  ipcMain.handle('cleaner:clean', async (_event, categoryIds: JunkCategoryType[]) => {
    return cleanSystemJunk(categoryIds)
  })
}
