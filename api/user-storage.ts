type VercelRequest = {
  method?: string
  query?: Record<string, string | string[] | undefined>
  body?: unknown
}

type VercelResponse = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

type StorageRequestBody = {
  data?: unknown
  userId?: unknown
}

declare const process: {
  env: Record<string, string | undefined>
}

const storageKeyPrefix = 'radiology-app:user-data:'

const getSingleQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const getUserId = (request: VercelRequest) => {
  const body = request.body as StorageRequestBody | undefined
  const rawUserId =
    typeof body?.userId === 'string'
      ? body.userId
      : getSingleQueryValue(request.query?.userId)

  return rawUserId?.trim() ?? ''
}

const createStorageKey = (userId: string) =>
  `${storageKeyPrefix}${encodeURIComponent(userId)}`

const runKvCommand = async (command: unknown[]) => {
  const apiUrl = process.env.KV_REST_API_URL
  const apiToken = process.env.KV_REST_API_TOKEN

  if (!apiUrl || !apiToken) {
    return { isConfigured: false, result: null }
  }

  const response = await fetch(apiUrl, {
    body: JSON.stringify(command),
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`KV request failed: ${response.status}`)
  }

  const payload = (await response.json()) as { result?: unknown }

  return { isConfigured: true, result: payload.result ?? null }
}

const readStoredData = async (userId: string) => {
  const { isConfigured, result } = await runKvCommand([
    'GET',
    createStorageKey(userId),
  ])

  if (!isConfigured) {
    return { status: 503, body: { data: null, storage: 'not_configured' } }
  }

  if (typeof result !== 'string') {
    return { status: 404, body: { data: null } }
  }

  try {
    return { status: 200, body: { data: JSON.parse(result) } }
  } catch {
    return { status: 500, body: { data: null, error: 'invalid_storage_json' } }
  }
}

const writeStoredData = async (userId: string, data: unknown) => {
  const { isConfigured } = await runKvCommand([
    'SET',
    createStorageKey(userId),
    JSON.stringify(data),
  ])

  if (!isConfigured) {
    return { status: 503, body: { ok: false, storage: 'not_configured' } }
  }

  return { status: 200, body: { ok: true } }
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  response.setHeader('Cache-Control', 'no-store')

  const userId = getUserId(request)

  if (!userId) {
    response.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    if (request.method === 'GET') {
      const result = await readStoredData(userId)
      response.status(result.status).json(result.body)
      return
    }

    if (request.method === 'POST') {
      const body = request.body as StorageRequestBody | undefined
      const result = await writeStoredData(userId, body?.data ?? null)
      response.status(result.status).json(result.body)
      return
    }

    response.setHeader('Allow', 'GET, POST')
    response.status(405).json({ error: 'method_not_allowed' })
  } catch {
    response.status(500).json({ error: 'storage_failed' })
  }
}
