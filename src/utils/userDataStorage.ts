import { getUserStorageKey } from './userProfiles'

export const userDataSnapshotStorageKey = 'user-data-snapshot-v1'

export type UserDataSnapshot = {
  activeProtocolSessionId: string | null
  findingFolders: unknown[]
  hasOpenedProtocol: boolean
  openProtocolSessions: unknown[]
  protocolExportSettings: unknown
  savedFindings: unknown[]
  templates: unknown[]
  updatedAt: number
  version: 1
}

const userStorageApiPath = '/api/user-storage'

const isRemoteStorageEnabled = () =>
  import.meta.env.PROD || import.meta.env.VITE_ENABLE_REMOTE_STORAGE === 'true'

const getLocalSnapshotStorageKey = (userId: string) =>
  getUserStorageKey(userId, userDataSnapshotStorageKey)

const isSnapshot = (value: unknown): value is UserDataSnapshot => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<UserDataSnapshot>

  return (
    snapshot.version === 1 &&
    Array.isArray(snapshot.templates) &&
    Array.isArray(snapshot.savedFindings) &&
    Array.isArray(snapshot.findingFolders) &&
    Array.isArray(snapshot.openProtocolSessions)
  )
}

const normalizeSnapshot = (value: unknown): UserDataSnapshot | null => {
  if (!isSnapshot(value)) {
    return null
  }

  return {
    activeProtocolSessionId:
      typeof value.activeProtocolSessionId === 'string'
        ? value.activeProtocolSessionId
        : null,
    findingFolders: value.findingFolders,
    hasOpenedProtocol: Boolean(value.hasOpenedProtocol),
    openProtocolSessions: value.openProtocolSessions,
    protocolExportSettings: value.protocolExportSettings,
    savedFindings: value.savedFindings,
    templates: value.templates,
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : Date.now(),
    version: 1,
  }
}

export const loadLocalUserDataSnapshot = (
  userId: string,
): UserDataSnapshot | null => {
  try {
    const storedValue = window.localStorage.getItem(
      getLocalSnapshotStorageKey(userId),
    )

    return storedValue ? normalizeSnapshot(JSON.parse(storedValue)) : null
  } catch {
    return null
  }
}

export const storeLocalUserDataSnapshot = (
  userId: string,
  snapshot: UserDataSnapshot,
) => {
  try {
    window.localStorage.setItem(
      getLocalSnapshotStorageKey(userId),
      JSON.stringify(snapshot),
    )
  } catch {
    // The app can continue with in-memory state if local storage is blocked.
  }
}

const loadRemoteUserDataSnapshot = async (
  userId: string,
): Promise<UserDataSnapshot | null> => {
  if (!isRemoteStorageEnabled()) {
    return null
  }

  try {
    const response = await fetch(
      `${userStorageApiPath}?userId=${encodeURIComponent(userId)}`,
      {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        method: 'GET',
      },
    )

    if (response.status === 404 || response.status === 204) {
      return null
    }

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as { data?: unknown }

    return normalizeSnapshot(payload.data)
  } catch {
    return null
  }
}

const storeRemoteUserDataSnapshot = async (
  userId: string,
  snapshot: UserDataSnapshot,
) => {
  if (!isRemoteStorageEnabled()) {
    return
  }

  try {
    await fetch(userStorageApiPath, {
      body: JSON.stringify({ data: snapshot, userId }),
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  } catch {
    // Remote storage is optional; local storage remains the fallback.
  }
}

export const loadUserDataSnapshot = async (userId: string) =>
  (await loadRemoteUserDataSnapshot(userId)) ??
  loadLocalUserDataSnapshot(userId)

export const storeUserDataSnapshot = async (
  userId: string,
  snapshot: UserDataSnapshot,
) => {
  storeLocalUserDataSnapshot(userId, snapshot)
  await storeRemoteUserDataSnapshot(userId, snapshot)
}
