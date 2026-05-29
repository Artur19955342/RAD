import type { FindingFolder } from '../types'

export const findingFolderRootSelectValue = 'root'
export const findingFolderSelectPrefix = 'folder:'
export const findingFolderCreateSelectPrefix = 'create:'

export const normalizeFindingFolderName = (value: string) =>
  value.replace(/\s+/g, ' ').trim()

export const getRootFindingFolderByName = (
  folders: FindingFolder[],
  name: string | null,
) => {
  const normalizedName = name ? normalizeFindingFolderName(name) : ''

  if (!normalizedName) {
    return null
  }

  return (
    folders.find(
      (folder) =>
        !folder.parentId &&
        normalizeFindingFolderName(folder.name).toLocaleLowerCase() ===
          normalizedName.toLocaleLowerCase(),
    ) ?? null
  )
}

export const getFindingFolderPath = (
  folder: FindingFolder,
  folders: FindingFolder[],
) => {
  const folderById = new Map(folders.map((item) => [item.id, item]))
  const names: string[] = []
  const seenIds = new Set<string>()
  let currentFolder: FindingFolder | null = folder

  while (currentFolder && !seenIds.has(currentFolder.id)) {
    seenIds.add(currentFolder.id)
    names.unshift(currentFolder.name.trim() || 'Папка')
    currentFolder = currentFolder.parentId
      ? folderById.get(currentFolder.parentId) ?? null
      : null
  }

  return names.join(' / ') || folder.name
}
