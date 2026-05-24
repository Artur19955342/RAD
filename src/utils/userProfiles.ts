import type { UserProfile } from '../types'
import { getTimestamp } from './findingMemory'

const currentUserStorageKey = 'radiology-app-current-user-v1'
const userStoragePrefix = 'radiology-app-user'

export const normalizeUserEmail = (email: string) =>
  email.trim().toLowerCase()

export const isValidUserEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeUserEmail(email))

export const createUserProfile = (
  fullName: string,
  email: string,
  existingProfile?: UserProfile | null,
): UserProfile => {
  const now = getTimestamp()
  const normalizedEmail = normalizeUserEmail(email)

  return {
    id: normalizedEmail,
    fullName: fullName.trim(),
    email: normalizedEmail,
    createdAt: existingProfile?.createdAt ?? now,
    updatedAt: now,
  }
}

const sanitizeUserProfile = (value: unknown): UserProfile | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const profile = value as Partial<UserProfile>

  if (
    typeof profile.fullName !== 'string' ||
    typeof profile.email !== 'string' ||
    !isValidUserEmail(profile.email)
  ) {
    return null
  }

  const now = getTimestamp()
  const normalizedEmail = normalizeUserEmail(profile.email)

  return {
    id: typeof profile.id === 'string' && profile.id ? profile.id : normalizedEmail,
    fullName: profile.fullName,
    email: normalizedEmail,
    createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : now,
    updatedAt: typeof profile.updatedAt === 'number' ? profile.updatedAt : now,
  }
}

export const loadCurrentUserProfile = () => {
  try {
    const storedValue = window.localStorage.getItem(currentUserStorageKey)

    if (!storedValue) {
      return null
    }

    return sanitizeUserProfile(JSON.parse(storedValue))
  } catch {
    return null
  }
}

export const storeCurrentUserProfile = (profile: UserProfile) => {
  try {
    window.localStorage.setItem(currentUserStorageKey, JSON.stringify(profile))
  } catch {
    // Storage can be unavailable in private modes; login should still work in memory.
  }
}

export const clearCurrentUserProfile = () => {
  try {
    window.localStorage.removeItem(currentUserStorageKey)
  } catch {
    // Storage can be unavailable in private modes; switching user should still work.
  }
}

export const getUserStorageKey = (userId: string, key: string) =>
  `${userStoragePrefix}:${encodeURIComponent(userId)}:${key}`
