import type { DragEvent } from 'react'
import type {
  BrowserDragItem,
  EditorSegment,
  FindingFolder,
  MarkerOption,
  SavedFinding,
} from '../types'

export const savedFindingsStorageKey = 'radiology-app-saved-findings-v1'
export const findingFoldersStorageKey = 'radiology-app-finding-folders-v1'
export const browserDragDataType =
  'application/x-radiology-finding-browser-item'

export const getTimestamp = () => Date.now()

const createStorageId = (prefix: string) =>
  `${prefix}-${getTimestamp()}-${Math.random().toString(36).slice(2)}`

export const createSavedFindingId = () => createStorageId('finding')

export const createFindingFolderId = () => createStorageId('folder')

export const normalizeSavedFindingText = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()

export const getDefaultFindingName = (
  description: string,
  conclusion: string,
) => (conclusion || description).trim()

export const findSavedFindingMatch = (
  findings: SavedFinding[],
  description: string,
  conclusion: string,
) => {
  const normalizedDescription = normalizeSavedFindingText(description)
  const normalizedConclusion = normalizeSavedFindingText(conclusion)

  return (
    findings.find(
      (finding) =>
        normalizeSavedFindingText(finding.description) ===
          normalizedDescription &&
        normalizeSavedFindingText(finding.conclusion) === normalizedConclusion,
    ) ?? null
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object'

const createFallbackSegmentId = () =>
  Math.floor(getTimestamp() + Math.random() * 1_000_000)

const sanitizeSegmentId = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : createFallbackSegmentId()

const sanitizeMarkerOptions = (value: unknown): MarkerOption[] =>
  Array.isArray(value)
    ? value.flatMap((option) => {
        if (!isRecord(option)) {
          return []
        }

        return [
          {
            findingIds: Array.isArray(option.findingIds)
              ? option.findingIds.filter(
                  (findingId): findingId is string =>
                    typeof findingId === 'string',
                )
              : [],
            title: typeof option.title === 'string' ? option.title : '',
            value: typeof option.value === 'string' ? option.value : '',
          },
        ]
      })
    : []

const sanitizeStoredEditorSegment = (
  value: unknown,
): EditorSegment | null => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }

  if (value.type === 'text') {
    return typeof value.text === 'string'
      ? {
          id: sanitizeSegmentId(value.id),
          text: value.text,
          type: 'text',
        }
      : null
  }

  if (value.type === 'variant') {
    if (typeof value.value !== 'string') {
      return null
    }

    return {
      id: sanitizeSegmentId(value.id),
      options: Array.isArray(value.options)
        ? value.options.filter(
            (option): option is string => typeof option === 'string',
          )
        : [value.value],
      type: 'variant',
      value: value.value,
    }
  }

  if (value.type === 'number') {
    return typeof value.value === 'string'
      ? {
          id: sanitizeSegmentId(value.id),
          type: 'number',
          value: value.value,
        }
      : null
  }

  if (value.type === 'marker') {
    const options = sanitizeMarkerOptions(value.options)

    return {
      defaultOptionIndex:
        typeof value.defaultOptionIndex === 'number' &&
        Number.isInteger(value.defaultOptionIndex) &&
        value.defaultOptionIndex >= 0 &&
        value.defaultOptionIndex < options.length
          ? value.defaultOptionIndex
          : null,
      id: sanitizeSegmentId(value.id),
      mainBlockValue:
        typeof value.mainBlockValue === 'string' ? value.mainBlockValue : '',
      options,
      selectedOptionIndex:
        typeof value.selectedOptionIndex === 'number' &&
        Number.isInteger(value.selectedOptionIndex) &&
        value.selectedOptionIndex >= 0 &&
        value.selectedOptionIndex < options.length
          ? value.selectedOptionIndex
          : null,
      title: typeof value.title === 'string' ? value.title : '',
      type: 'marker',
    }
  }

  return null
}

const sanitizeStoredEditorContent = (value: unknown) => {
  if (!Array.isArray(value)) {
    return undefined
  }

  const content = value.flatMap((segment) => {
    const sanitizedSegment = sanitizeStoredEditorSegment(segment)

    return sanitizedSegment ? [sanitizedSegment] : []
  })

  return content.length ? content : undefined
}

export const sanitizeStoredFinding = (value: unknown): SavedFinding | null => {
  if (!isRecord(value)) {
    return null
  }

  const finding = value

  if (
    typeof finding.id !== 'string' ||
    typeof finding.name !== 'string' ||
    typeof finding.description !== 'string' ||
    typeof finding.conclusion !== 'string'
  ) {
    return null
  }

  const now = getTimestamp()

  return {
    id: finding.id,
    name: finding.name,
    description: finding.description,
    descriptionContent: sanitizeStoredEditorContent(finding.descriptionContent),
    conclusion: finding.conclusion,
    conclusionContent: sanitizeStoredEditorContent(finding.conclusionContent),
    folderId: typeof finding.folderId === 'string' ? finding.folderId : null,
    createdAt: typeof finding.createdAt === 'number' ? finding.createdAt : now,
    updatedAt: typeof finding.updatedAt === 'number' ? finding.updatedAt : now,
  }
}

export const sanitizeStoredFolder = (value: unknown): FindingFolder | null => {
  if (!isRecord(value)) {
    return null
  }

  const folder = value

  if (typeof folder.id !== 'string' || typeof folder.name !== 'string') {
    return null
  }

  const now = getTimestamp()

  return {
    id: folder.id,
    name: folder.name,
    parentId: typeof folder.parentId === 'string' ? folder.parentId : null,
    createdAt: typeof folder.createdAt === 'number' ? folder.createdAt : now,
    updatedAt: typeof folder.updatedAt === 'number' ? folder.updatedAt : now,
  }
}

export const normalizeFolderTree = (folders: FindingFolder[]) => {
  const normalizedFolders = folders.map((folder) => ({ ...folder }))
  const folderById = new Map(
    normalizedFolders.map((folder) => [folder.id, folder]),
  )

  normalizedFolders.forEach((folder) => {
    if (
      folder.parentId === folder.id ||
      (folder.parentId && !folderById.has(folder.parentId))
    ) {
      folder.parentId = null
    }
  })

  normalizedFolders.forEach((folder) => {
    const seenIds = new Set([folder.id])
    let parentId = folder.parentId

    while (parentId) {
      if (seenIds.has(parentId)) {
        folder.parentId = null
        return
      }

      seenIds.add(parentId)
      parentId = folderById.get(parentId)?.parentId ?? null
    }
  })

  return normalizedFolders
}

const loadStoredArray = (storageKey: string) => {
  try {
    const storedValue = window.localStorage.getItem(storageKey)

    if (!storedValue) {
      return []
    }

    const parsedValue = JSON.parse(storedValue)

    return Array.isArray(parsedValue) ? parsedValue : []
  } catch {
    return []
  }
}

export const loadStoredFindings = (
  storageKey = savedFindingsStorageKey,
): SavedFinding[] =>
  loadStoredArray(storageKey).flatMap((item) => {
    const finding = sanitizeStoredFinding(item)

    return finding ? [finding] : []
  })

export const loadStoredFindingFolders = (
  storageKey = findingFoldersStorageKey,
): FindingFolder[] =>
  normalizeFolderTree(
    loadStoredArray(storageKey).flatMap((item) => {
      const folder = sanitizeStoredFolder(item)

      return folder ? [folder] : []
    }),
  )

export const storeSavedFindings = (
  findings: SavedFinding[],
  storageKey = savedFindingsStorageKey,
) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(findings))
  } catch {
    // Storage can be unavailable in private modes; the editor should keep working.
  }
}

export const storeFindingFolders = (
  folders: FindingFolder[],
  storageKey = findingFoldersStorageKey,
) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(folders))
  } catch {
    // Storage can be unavailable in private modes; the editor should keep working.
  }
}

export const isFolderNestedIn = (
  folders: FindingFolder[],
  folderId: string,
  possibleParentId: string | null,
) => {
  if (!possibleParentId) {
    return false
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]))
  let currentFolder = folderById.get(possibleParentId) ?? null

  while (currentFolder) {
    if (currentFolder.id === folderId) {
      return true
    }

    currentFolder = currentFolder.parentId
      ? folderById.get(currentFolder.parentId) ?? null
      : null
  }

  return false
}

export const parseBrowserDragItem = (
  event: DragEvent<HTMLElement>,
): BrowserDragItem | null => {
  const rawValue =
    event.dataTransfer.getData(browserDragDataType) ||
    event.dataTransfer.getData('text/plain')

  if (!rawValue) {
    return null
  }

  try {
    const value = JSON.parse(rawValue) as BrowserDragItem

    return (value.type === 'folder' || value.type === 'finding') &&
      typeof value.id === 'string'
      ? value
      : null
  } catch {
    return null
  }
}
