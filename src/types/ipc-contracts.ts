import type { ElectronAPI } from '@shared/types'

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export type {
  ElectronAPI,
  DriveInfo,
  FileNode,
  FileCategory,
  ScanOptions,
  ScanProgress,
  ScanStatus,
  InstalledApp,
  SystemStats,
  FsOperationResult,
} from '@shared/types'
