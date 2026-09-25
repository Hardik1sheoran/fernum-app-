import { ipcMain } from 'electron'
import type { DuplicateScanOptions, DuplicateScanResult } from '../../shared/types'
import { findDuplicateFiles } from '../services/duplicateService'

export function registerDuplicatesIpc(): void {
  ipcMain.handle(
    'duplicates:scan',
    async (_event, options?: DuplicateScanOptions): Promise<DuplicateScanResult> => {
      return findDuplicateFiles(options)
    }
  )
}
