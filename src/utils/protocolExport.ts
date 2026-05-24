import type { DragEvent } from 'react'
import type { PassportData, ProtocolExportSettings } from '../types'
import { escapeHtml } from './html'
import {
  formatPatientShortName,
  getPassportProtocolLines,
  getPatientSexLabel,
} from './passport'

export const protocolFileNameDragDataType =
  'application/x-radiology-protocol-file-name-block'

const customFileNameBlockPrefix = 'custom:'
const defaultProtocolFileNameBlockKeys = [
  'template',
  'fullName',
  'studyDate',
]

export type ProtocolFileNameBlock = {
  key: string
  label: string
}

export type ProtocolFileNameDragItem = {
  key: string
  source: 'available' | 'selected'
  index?: number
}

const baseProtocolFileNameBlocks: ProtocolFileNameBlock[] = [
  { key: 'template', label: 'Название шаблона' },
  { key: 'fullName', label: 'ФИО' },
  { key: 'sex', label: 'Пол' },
  { key: 'birthDate', label: 'Возраст' },
  { key: 'studyDate', label: 'Дата исследования' },
  { key: 'studyTime', label: 'Время' },
]

export const buildProtocolFileNameTemplate = (keys: string[]) =>
  keys.map((key) => `{${key}}`).join(' ')

export const createDefaultProtocolExportSettings =
  (): ProtocolExportSettings => ({
    fileNameTemplate: buildProtocolFileNameTemplate(
      defaultProtocolFileNameBlockKeys,
    ),
    footerDoctorName: '',
    footerSignatureText: 'Подпись',
    headerText: '',
  })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

export const sanitizeProtocolExportSettings = (
  value: unknown,
): ProtocolExportSettings => {
  const defaults = createDefaultProtocolExportSettings()

  if (!isRecord(value)) {
    return defaults
  }

  return {
    fileNameTemplate:
      typeof value.fileNameTemplate === 'string'
        ? value.fileNameTemplate
        : defaults.fileNameTemplate,
    footerDoctorName:
      typeof value.footerDoctorName === 'string'
        ? value.footerDoctorName
        : defaults.footerDoctorName,
    footerSignatureText:
      typeof value.footerSignatureText === 'string'
        ? value.footerSignatureText
        : defaults.footerSignatureText,
    headerText:
      typeof value.headerText === 'string' ? value.headerText : defaults.headerText,
  }
}

export const loadProtocolExportSettings = (storageKey?: string) => {
  if (!storageKey) {
    return createDefaultProtocolExportSettings()
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey)

    if (!storedValue) {
      return createDefaultProtocolExportSettings()
    }

    return sanitizeProtocolExportSettings(JSON.parse(storedValue))
  } catch {
    return createDefaultProtocolExportSettings()
  }
}

export const storeProtocolExportSettings = (
  settings: ProtocolExportSettings,
  storageKey: string,
) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    // Storage can be unavailable in private modes; export settings stay in memory.
  }
}

const createCustomFileNameBlockKey = (id: string) =>
  `${customFileNameBlockPrefix}${id}`

const normalizeProtocolFileNameBlockKey = (key: string) => {
  if (key === 'patient') {
    return 'fullName'
  }

  if (key === 'date') {
    return 'studyDate'
  }

  return key
}

export const getProtocolFileNameBlocks = (
  passportData: PassportData,
): ProtocolFileNameBlock[] => [
  ...baseProtocolFileNameBlocks,
  ...passportData.customFields.map((field) => ({
    key: createCustomFileNameBlockKey(field.id),
    label: field.label.trim() || 'Поле',
  })),
]

export const getProtocolFileNameBlockKeys = (
  template: string,
  blocks: ProtocolFileNameBlock[],
) => {
  const validKeys = new Set(blocks.map((block) => block.key))
  const seenKeys = new Set<string>()
  const keys = Array.from(template.matchAll(/\{([^{}]+)\}/g))
    .map((match) => normalizeProtocolFileNameBlockKey(match[1] ?? ''))
    .filter((key) => {
      if (!validKeys.has(key) || seenKeys.has(key)) {
        return false
      }

      seenKeys.add(key)
      return true
    })

  if (keys.length) {
    return keys
  }

  return defaultProtocolFileNameBlockKeys.filter((key) => validKeys.has(key))
}

export const parseProtocolFileNameDragItem = (
  event: DragEvent<HTMLElement>,
): ProtocolFileNameDragItem | null => {
  const rawValue =
    event.dataTransfer.getData(protocolFileNameDragDataType) ||
    event.dataTransfer.getData('text/plain')

  if (!rawValue) {
    return null
  }

  try {
    const value = JSON.parse(rawValue) as ProtocolFileNameDragItem

    return typeof value.key === 'string' &&
      (value.source === 'available' || value.source === 'selected')
      ? value
      : null
  } catch {
    return null
  }
}

const textToDocumentParagraphs = (value: string) =>
  (value ? value.split('\n') : [''])
    .map((line) =>
      line.trim()
        ? `<p>${escapeHtml(line)}</p>`
        : '<p class="empty-line">&nbsp;</p>',
    )
    .join('')

export const createProtocolDownloadDocument = (
  passportData: PassportData,
  templateName: string,
  descriptionValue: string,
  conclusionValue: string,
  exportSettings: ProtocolExportSettings,
) => {
  const passportLines = getPassportProtocolLines(passportData)
  const protocolTitle = templateName.trim() || 'Рентгенография'
  const headerText = exportSettings.headerText.trim()
  const doctorName = exportSettings.footerDoctorName.trim()
  const signatureText = exportSettings.footerSignatureText.trim()
  const passportRows = passportLines
    .map((line) => {
      const separatorIndex = line.indexOf(':')
      const label =
        separatorIndex === -1 ? line : line.slice(0, separatorIndex).trim()
      const value =
        separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).trim()

      return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    })
    .join('')

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="ProgId" content="Word.Document">
  <title>${escapeHtml(protocolTitle)}</title>
  <style>
    body { font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.35; color: #111; }
    h1 { margin: 0 0 6pt; font-size: 16pt; text-align: center; }
    h2 { margin: 18pt 0 6pt; font-size: 13pt; }
    p { margin: 0 0 6pt; }
    .doc-header { margin: 0 0 14pt; padding-bottom: 8pt; border-bottom: 1pt solid #888; color: #333; text-align: center; }
    .subtitle { margin: 0 0 14pt; text-align: center; font-weight: bold; }
    .empty-line { margin-bottom: 6pt; }
    .doc-footer { margin-top: 28pt; padding-top: 8pt; border-top: 1pt solid #888; }
    .signature-line { margin-top: 18pt; display: flex; justify-content: space-between; gap: 24pt; }
    table { width: 100%; margin: 0 0 12pt; border-collapse: collapse; }
    th, td { padding: 2pt 6pt 2pt 0; text-align: left; vertical-align: top; }
    th { width: 34%; font-weight: bold; }
  </style>
</head>
<body>
  ${headerText ? `<p class="doc-header">${escapeHtml(headerText)}</p>` : ''}
  <h1>Протокол</h1>
  <p class="subtitle">${escapeHtml(protocolTitle)}</p>
  ${
    passportRows
      ? `<h2>Паспортная часть</h2><table>${passportRows}</table>`
      : ''
  }
  <h2>Описание</h2>
  ${textToDocumentParagraphs(descriptionValue)}
  <h2>Заключение</h2>
  ${textToDocumentParagraphs(conclusionValue)}
  ${
    doctorName || signatureText
      ? `<div class="doc-footer"><p>${doctorName ? `Врач: ${escapeHtml(doctorName)}` : ''}</p><p class="signature-line"><span>${escapeHtml(signatureText || 'Подпись')}</span><span>__________________</span></p></div>`
      : ''
  }
</body>
</html>`
}

const sanitizeDownloadFileName = (value: string) =>
  value
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'protocol'

const getProtocolFileNameBlockValue = (
  key: string,
  passportData: PassportData,
  templateName: string,
  doctorName: string,
) => {
  const normalizedKey = normalizeProtocolFileNameBlockKey(key)

  if (normalizedKey.startsWith(customFileNameBlockPrefix)) {
    const customFieldId = normalizedKey.slice(customFileNameBlockPrefix.length)
    return (
      passportData.customFields.find((field) => field.id === customFieldId)
        ?.value ?? ''
    ).trim()
  }

  if (normalizedKey === 'template') {
    return templateName.trim()
  }

  if (normalizedKey === 'fullName') {
    return passportData.fullName.trim()
      ? formatPatientShortName(passportData.fullName)
      : ''
  }

  if (normalizedKey === 'sex') {
    return getPatientSexLabel(passportData.sex)
  }

  if (normalizedKey === 'birthDate') {
    return passportData.birthDate.trim()
  }

  if (normalizedKey === 'studyDate') {
    return passportData.studyDate.trim()
  }

  if (normalizedKey === 'studyTime') {
    return passportData.studyTime.trim()
  }

  if (normalizedKey === 'doctor') {
    return doctorName.trim()
  }

  return ''
}

export const formatProtocolFileName = (
  template: string,
  passportData: PassportData,
  templateName: string,
  doctorName: string,
) => {
  const rawTemplate =
    template.trim() ||
    buildProtocolFileNameTemplate(defaultProtocolFileNameBlockKeys)
  const rawName = rawTemplate.replace(/\{([^{}]+)\}/g, (_, key: string) =>
    getProtocolFileNameBlockValue(key, passportData, templateName, doctorName),
  )

  return sanitizeDownloadFileName(rawName)
}

export const downloadDocFile = (fileName: string, documentHtml: string) => {
  const blob = new Blob(['\ufeff', documentHtml], {
    type: 'application/msword;charset=utf-8',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
