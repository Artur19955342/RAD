import { createDocFileBlob } from './protocolExport'

type PermissionMode = 'read' | 'readwrite'

type FileHandle = {
  createWritable: () => Promise<{
    close: () => Promise<void>
    write: (data: Blob) => Promise<void>
  }>
}

type DirectoryHandle = {
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FileHandle>
  name: string
  queryPermission?: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>
  requestPermission?: (
    descriptor?: { mode?: PermissionMode },
  ) => Promise<PermissionState>
}

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: {
    mode?: PermissionMode
  }) => Promise<DirectoryHandle>
}

const dbName = 'radiology-app-device-files-v1'
const storeName = 'handles'
const protocolDirectoryKey = 'protocol-download-directory'

const getDirectoryPicker = () =>
  typeof window === 'undefined'
    ? null
    : (window as WindowWithDirectoryPicker).showDirectoryPicker ?? null

export const isProtocolDirectorySaveSupported = () =>
  Boolean(getDirectoryPicker()) && typeof indexedDB !== 'undefined'

const openDeviceFileDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName)
      }
    }
  })

const withHandleStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const db = await openDeviceFileDb()

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = action(transaction.objectStore(storeName))

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export const getStoredProtocolDirectory = async () => {
  if (!isProtocolDirectorySaveSupported()) {
    return null
  }

  try {
    const handle = await withHandleStore<DirectoryHandle | undefined>(
      'readonly',
      (store) => store.get(protocolDirectoryKey),
    )

    return handle ?? null
  } catch {
    return null
  }
}

export const clearStoredProtocolDirectory = async () => {
  if (!isProtocolDirectorySaveSupported()) {
    return
  }

  try {
    await withHandleStore('readwrite', (store) =>
      store.delete(protocolDirectoryKey),
    )
  } catch {
    // The chosen folder is a local convenience; export can fall back to download.
  }
}

const hasReadWritePermission = async (handle: DirectoryHandle) => {
  const descriptor = { mode: 'readwrite' as const }

  if ((await handle.queryPermission?.(descriptor)) === 'granted') {
    return true
  }

  return (await handle.requestPermission?.(descriptor)) === 'granted'
}

export const chooseProtocolDirectory = async () => {
  const showDirectoryPicker = getDirectoryPicker()

  if (!showDirectoryPicker) {
    return null
  }

  const handle = await showDirectoryPicker({ mode: 'readwrite' })

  await withHandleStore('readwrite', (store) =>
    store.put(handle, protocolDirectoryKey),
  )

  return handle
}

export const saveDocFileToStoredProtocolDirectory = async (
  fileName: string,
  documentHtml: string,
) => {
  const directory = await getStoredProtocolDirectory()

  if (!directory) {
    return { directoryName: null, saved: false }
  }

  if (!(await hasReadWritePermission(directory))) {
    return { directoryName: directory.name, saved: false }
  }

  const fileHandle = await directory.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()

  await writable.write(createDocFileBlob(documentHtml))
  await writable.close()

  return { directoryName: directory.name, saved: true }
}
