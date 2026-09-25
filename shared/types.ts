/**
 * Shared Type Definitions between Electron Main process and React Renderer
 */

export type FileCategory =
  | 'video'
  | 'image'
  | 'audio'
  | 'document'
  | 'archive'
  | 'code'
  | 'system'
  | 'cache'
  | 'other'

export const FREE_TIER_BYTE_CAP = 70 * 1024 * 1024 * 1024 // 70 GB Free Tier Cap

export interface FileNode {
  id: string
  name: string
  path: string
  size: number
  type: 'file' | 'directory'
  category: FileCategory
  extension?: string
  lastModified?: number
  children?: FileNode[]
  truncatedAtDepth?: boolean
  capped?: boolean
  cappedAtBytes?: number
}

export interface CleanupQueueItem {
  id: string
  name: string
  path: string
  size: number
  category: string
}

export interface DriveInfo {
  id: string
  name: string
  path: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  filesystem?: string
  isSystem?: boolean
}

export interface QuickFolderInfo {
  id: string
  name: string
  path: string
  category: 'user' | 'downloads' | 'documents' | 'desktop' | 'pictures' | 'videos' | 'music' | 'custom'
  exists?: boolean
}

export interface ScanOptions {
  targetPath: string
  excludePaths?: string[]
  maxDepth?: number
  forceRescan?: boolean
  cachedRoot?: FileNode
  deepScan?: boolean
  isPro?: boolean
  maxBytes?: number
}

export type ScanStatus = 'idle' | 'scanning' | 'paused' | 'completed' | 'cancelled' | 'error'

export interface ScanProgress {
  status: ScanStatus
  currentPath: string
  scannedFiles: number
  scannedBytes: number
  percentage: number
  estimatedTimeRemainingMs?: number
  error?: string
  capped?: boolean
  cappedAtBytes?: number
}

export interface InstalledApp {
  id: string
  name: string
  publisher?: string
  version?: string
  installDate?: string
  installLocation?: string
  uninstallString?: string
  estimatedSizeBytes?: number
  icon?: string
}

export interface ProcessStats {
  pid: number
  name: string
  cpuPercent: number
  memoryBytes: number
}

export interface SystemStats {
  timestamp: number
  cpu: {
    usagePercent: number
    model?: string
    cores?: number
    speedGhz?: number
    temperatureC?: number
  }
  memory: {
    totalBytes: number
    usedBytes: number
    freeBytes: number
    usagePercent: number
  }
  disk: {
    readSpeedBytesPerSec: number
    writeSpeedBytesPerSec: number
  }
  network: {
    rxSpeedBytesPerSec: number
    txSpeedBytesPerSec: number
  }
  topProcesses?: ProcessStats[]
}

export interface SystemSpecs {
  os: {
    distro: string
    release: string
    arch: string
    hostname: string
    uptime?: number
  }
  cpu: {
    brand: string
    cores: number
    physicalCores: number
    speed: number
  }
  memory: {
    totalBytes: number
  }
  disks: Array<{
    name: string
    type: string
    size: number
    interfaceType: string
  }>
  graphics?: {
    model: string
    vramMb?: number
  }
  battery?: {
    hasBattery: boolean
    percent: number
    isCharging: boolean
  }
}

export interface FsOperationResult {
  success: boolean
  path: string
  error?: string
}

export interface BatchFsOperationResult {
  success: boolean
  totalRequested: number
  deletedCount: number
  succeeded: string[]
  failed: Array<{ path: string; error: string }>
}

export interface LeftoverResidue {
  path: string
  sizeBytes: number
  category: 'appdata' | 'localappdata' | 'programdata' | 'temp'
  description: string
}

export interface ScanLeftoversResult {
  appName: string
  totalSizeBytes: number
  residues: LeftoverResidue[]
}

export interface CleanLeftoversResult {
  success: boolean
  cleanedBytes: number
  paths: string[]
  failed: Array<{ path: string; reason: string }>
}

export interface SearchQueryOptions {
  query: string
  targetPath?: string
  minSizeBytes?: number
  category?: FileCategory | 'all'
  extension?: string
  limit?: number
  maxDirs?: number
}

export interface SearchResultItem {
  id: string
  name: string
  path: string
  sizeBytes: number
  category: FileCategory
  extension?: string
  lastModified?: number
}

export interface SearchResultResponse {
  items: SearchResultItem[]
  truncated?: boolean
}

export type JunkCategoryType =
  | 'userTemp'
  | 'systemTemp'
  | 'recycleBin'
  | 'windowsUpdate'
  | 'crashDumps'
  | 'shaderCache'
  | 'thumbnailCache'
  | 'browserCache'
  | 'devCaches'

export interface JunkCategoryItem {
  id: JunkCategoryType
  name: string
  description: string
  icon: string
  sizeBytes: number
  fileCount: number
  safeToClean: boolean
  paths: string[]
}

export interface JunkScanResult {
  totalSizeBytes: number
  totalFileCount: number
  categories: JunkCategoryItem[]
}

export interface JunkCleanResult {
  success: boolean
  reclaimedBytes: number
  deletedFileCount: number
  skippedCount: number
  failed: Array<{ path: string; reason: string }>
}

export interface DuplicateFileItem {
  id: string
  path: string
  name: string
  sizeBytes: number
  category: FileCategory
  extension?: string
  lastModified?: number
  hash: string
}

export interface DuplicateGroup {
  hash: string
  sizeBytes: number
  wastedBytes: number
  files: DuplicateFileItem[]
}

export interface DuplicateScanOptions {
  targetPath?: string
  minSizeBytes?: number
  category?: FileCategory | 'all'
  limit?: number
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[]
  totalDuplicateFiles: number
  totalWastedBytes: number
  scannedFilesCount: number
}

/**
 * Strongly typed IPC contract exposed on window.electronAPI
 */
export interface ElectronAPI {
  // Scan IPC
  startScan: (options: ScanOptions) => Promise<boolean>
  cancelScan: () => Promise<boolean>
  getCachedScan?: (targetPath: string) => Promise<FileNode | null>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  onScanComplete: (callback: (rootNode: FileNode) => void) => () => void
  onScanPartial?: (callback: (partialNode: FileNode) => void) => () => void
  onScanError: (callback: (error: string) => void) => () => void

  // File System Operations IPC
  getDrives: () => Promise<DriveInfo[]>
  getQuickAccessFolders: () => Promise<QuickFolderInfo[]>
  selectFolder: () => Promise<string | null>
  revealInExplorer: (targetPath: string) => Promise<FsOperationResult>
  moveToTrash: (targetPath: string) => Promise<FsOperationResult>
  deletePermanently: (targetPath: string) => Promise<FsOperationResult>
  trashMany?: (targetPaths: string[]) => Promise<BatchFsOperationResult>
  deleteManyPermanently?: (targetPaths: string[]) => Promise<BatchFsOperationResult>

  // Search IPC
  searchFiles: (options: SearchQueryOptions) => Promise<SearchResultItem[] | SearchResultResponse>

  // Duplicates IPC
  scanDuplicates?: (options?: DuplicateScanOptions) => Promise<DuplicateScanResult>

  // Applications IPC
  listInstalledApps: (forceRefresh?: boolean) => Promise<InstalledApp[]>
  uninstallApp: (appId: string) => Promise<{ success: boolean; message?: string }>
  scanLeftovers: (appName: string, publisher?: string) => Promise<ScanLeftoversResult>
  cleanLeftovers: (paths: string[]) => Promise<CleanLeftoversResult>

  // System Junk Cleaner IPC
  scanJunk: (categories?: JunkCategoryType[], forceRescan?: boolean) => Promise<JunkScanResult>
  cleanJunk: (categoryIds: JunkCategoryType[]) => Promise<JunkCleanResult>

  // Monitor IPC
  getSystemStats: () => Promise<SystemStats>
  getSystemSpecs?: () => Promise<SystemSpecs>
  subscribeSystemStats: (callback: (stats: SystemStats) => void) => () => void
  subscribeProcesses: (callback: (processes: ProcessStats[]) => void) => () => void
  startMonitoring: () => Promise<boolean>
  stopMonitoring: () => Promise<boolean>

  // System, Licensing & Window IPC
  setTheme: (theme: 'dark' | 'light') => Promise<boolean>
  openExternalUrl?: (url: string) => Promise<boolean>
  onDeepLinkLicense?: (callback: (licenseKey: string) => void) => () => void
}

export interface DodoActivationResult {
  success: boolean
  message: string
  licenseId?: string
  status?: string
}

export interface DodoValidationResult {
  valid: boolean
  message?: string
}

