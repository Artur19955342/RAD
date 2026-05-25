import type { DragEvent } from 'react'
import type {
  PassportData,
  ProtocolExportSettings,
  ProtocolHeaderAlignment,
  ProtocolPageMargins,
  ProtocolSectionStyle,
} from '../types'
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
const defaultProtocolPageMargins: ProtocolPageMargins = {
  bottom: 2,
  left: 2,
  right: 1.5,
  top: 2,
}
const defaultProtocolSectionStyle: ProtocolSectionStyle = {
  align: 'left',
  bold: false,
  fontSize: 12,
  italic: false,
  underline: false,
}

export const protocolDocumentFontOptions = [
  'Times New Roman',
  'Arial',
  'Calibri',
  'Cambria',
  'Georgia',
  'Courier New',
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
    conclusionStyle: { ...defaultProtocolSectionStyle },
    descriptionStyle: { ...defaultProtocolSectionStyle },
    documentFontFamily: protocolDocumentFontOptions[0],
    fileNameTemplate: buildProtocolFileNameTemplate(
      defaultProtocolFileNameBlockKeys,
    ),
    footerDoctorName: '',
    footerSignatureText: 'Подпись',
    headerAlign: 'center',
    headerBold: false,
    headerFontSize: 12,
    headerItalic: false,
    headerText: '',
    headerUnderline: false,
    pageMargins: { ...defaultProtocolPageMargins },
    passportStyle: { ...defaultProtocolSectionStyle },
  })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const sanitizeHeaderAlignment = (value: unknown): ProtocolHeaderAlignment =>
  value === 'left' ||
  value === 'right' ||
  value === 'center' ||
  value === 'justify'
    ? value
    : 'center'

const sanitizeHeaderFontSize = (value: unknown) => {
  const size =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  return Number.isFinite(size)
    ? Math.max(8, Math.min(36, Math.round(size)))
    : 12
}

const sanitizeProtocolFontSize = (value: unknown, fallback = 12) => {
  const size =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  return Number.isFinite(size)
    ? Math.max(8, Math.min(36, Math.round(size)))
    : fallback
}

const sanitizeProtocolSectionStyle = (
  value: unknown,
): ProtocolSectionStyle => {
  if (!isRecord(value)) {
    return { ...defaultProtocolSectionStyle }
  }

  return {
    align: sanitizeHeaderAlignment(value.align),
    bold:
      typeof value.bold === 'boolean'
        ? value.bold
        : defaultProtocolSectionStyle.bold,
    fontSize: sanitizeProtocolFontSize(
      value.fontSize,
      defaultProtocolSectionStyle.fontSize,
    ),
    italic:
      typeof value.italic === 'boolean'
        ? value.italic
        : defaultProtocolSectionStyle.italic,
    underline:
      typeof value.underline === 'boolean'
        ? value.underline
        : defaultProtocolSectionStyle.underline,
  }
}

const sanitizeDocumentFontFamily = (value: unknown) =>
  typeof value === 'string' && protocolDocumentFontOptions.includes(value)
    ? value
    : protocolDocumentFontOptions[0]

const sanitizePageMarginValue = (value: unknown, fallback: number) => {
  const margin =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  return Number.isFinite(margin)
    ? Math.max(0, Math.min(5, Math.round(margin * 10) / 10))
    : fallback
}

const sanitizeProtocolPageMargins = (
  value: unknown,
): ProtocolPageMargins => {
  if (!isRecord(value)) {
    return { ...defaultProtocolPageMargins }
  }

  return {
    bottom: sanitizePageMarginValue(
      value.bottom,
      defaultProtocolPageMargins.bottom,
    ),
    left: sanitizePageMarginValue(value.left, defaultProtocolPageMargins.left),
    right: sanitizePageMarginValue(
      value.right,
      defaultProtocolPageMargins.right,
    ),
    top: sanitizePageMarginValue(value.top, defaultProtocolPageMargins.top),
  }
}

export const sanitizeProtocolExportSettings = (
  value: unknown,
): ProtocolExportSettings => {
  const defaults = createDefaultProtocolExportSettings()

  if (!isRecord(value)) {
    return defaults
  }

  return {
    conclusionStyle: sanitizeProtocolSectionStyle(value.conclusionStyle),
    descriptionStyle: sanitizeProtocolSectionStyle(value.descriptionStyle),
    documentFontFamily: sanitizeDocumentFontFamily(value.documentFontFamily),
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
    headerAlign: sanitizeHeaderAlignment(value.headerAlign),
    headerBold:
      typeof value.headerBold === 'boolean'
        ? value.headerBold
        : defaults.headerBold,
    headerFontSize: sanitizeHeaderFontSize(value.headerFontSize),
    headerItalic:
      typeof value.headerItalic === 'boolean'
        ? value.headerItalic
        : defaults.headerItalic,
    headerText:
      typeof value.headerText === 'string' ? value.headerText : defaults.headerText,
    headerUnderline:
      typeof value.headerUnderline === 'boolean'
        ? value.headerUnderline
        : defaults.headerUnderline,
    pageMargins: sanitizeProtocolPageMargins(value.pageMargins),
    passportStyle: sanitizeProtocolSectionStyle(value.passportStyle),
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

const normalizeDocumentText = (value: string) =>
  value.replace(/\r\n?/g, '\n')

const removeEmptyDocumentLines = (value: string) =>
  normalizeDocumentText(value)
    .split('\n')
    .filter((line) => line.trim())
    .join('\n')

const textToDocumentLineBreaks = (value: string) => {
  const normalizedValue = normalizeDocumentText(value)

  return normalizedValue
    ? escapeHtml(normalizedValue).replace(/\n/g, '<br>')
    : '&nbsp;'
}

const textToDocumentParagraphs = (value: string) =>
  `<p class="doc-text-block">${textToDocumentLineBreaks(value)}</p>`

const descriptionToDocumentParagraphs = (value: string) =>
  textToDocumentParagraphs(removeEmptyDocumentLines(value))

const protocolSectionStyleToCss = (style: ProtocolSectionStyle) => {
  const normalizedStyle = sanitizeProtocolSectionStyle(style)

  return [
    `text-align: ${normalizedStyle.align};`,
    `font-size: ${normalizedStyle.fontSize}pt;`,
    `font-weight: ${normalizedStyle.bold ? 'bold' : 'normal'};`,
    `font-style: ${normalizedStyle.italic ? 'italic' : 'normal'};`,
    `text-decoration: ${normalizedStyle.underline ? 'underline' : 'none'};`,
  ].join(' ')
}

const protocolHeaderToHtml = (exportSettings: ProtocolExportSettings) => {
  const headerText = normalizeDocumentText(exportSettings.headerText).trim()

  if (!headerText) {
    return ''
  }

  const style = [
    `text-align: ${exportSettings.headerAlign};`,
    `font-size: ${exportSettings.headerFontSize}pt;`,
    `font-weight: ${exportSettings.headerBold ? 'bold' : 'normal'};`,
    `font-style: ${exportSettings.headerItalic ? 'italic' : 'normal'};`,
    `text-decoration: ${exportSettings.headerUnderline ? 'underline' : 'none'};`,
  ].join(' ')
  const headerContent = textToDocumentLineBreaks(headerText)

  return `<p class="doc-header" style="${style}">${headerContent}</p>`
}

export const createProtocolDownloadDocument = (
  passportData: PassportData,
  templateName: string,
  descriptionValue: string,
  conclusionValue: string,
  exportSettings: ProtocolExportSettings,
) => {
  const passportLines = getPassportProtocolLines(passportData)
  const protocolTitle = templateName.trim() || 'Рентгенография'
  const headerHtml = protocolHeaderToHtml(exportSettings)
  const documentFontFamily = sanitizeDocumentFontFamily(
    exportSettings.documentFontFamily,
  )
  const pageMargins = sanitizeProtocolPageMargins(exportSettings.pageMargins)
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
  const passportStyle = protocolSectionStyleToCss(exportSettings.passportStyle)
  const descriptionStyle = protocolSectionStyleToCss(
    exportSettings.descriptionStyle,
  )
  const conclusionStyle = protocolSectionStyleToCss(
    exportSettings.conclusionStyle,
  )

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="ProgId" content="Word.Document">
  <title>${escapeHtml(protocolTitle)}</title>
  <style>
    @page { margin: ${pageMargins.top}cm ${pageMargins.right}cm ${pageMargins.bottom}cm ${pageMargins.left}cm; }
    body { margin: 0; font-family: "${documentFontFamily}", serif; font-size: 12pt; line-height: 1.35; color: #111; }
    h1 { margin: 0; font-size: 16pt; text-align: center; }
    h2 { margin: 0; font-size: 13pt; }
    p { margin: 0; }
    .doc-header { margin: 0; padding-bottom: 0; border-bottom: 1pt solid #888; color: #333; }
    .doc-text-block { margin: 0; }
    .empty-line { margin: 0; }
    .doc-footer { margin-top: 0; padding-top: 0; border-top: 1pt solid #888; }
    .signature-line { margin-top: 0; display: flex; justify-content: space-between; gap: 24pt; }
    table { width: 100%; margin: 0; border-collapse: collapse; }
    th, td { padding: 2pt 6pt 2pt 0; text-align: left; vertical-align: top; }
    th { width: 34%; font-weight: bold; }
    .doc-section h2 { font-size: inherit; font-weight: inherit; text-align: inherit; }
    .doc-section table,
    .doc-section th,
    .doc-section td,
    .doc-section p { font-size: inherit; font-weight: inherit; text-align: inherit; }
  </style>
</head>
<body>
  ${headerHtml}
  ${
    passportRows
      ? `<div class="doc-section doc-passport-section" style="${passportStyle}"><table>${passportRows}</table></div>`
      : ''
  }
  <div class="doc-section doc-description-section" style="${descriptionStyle}"><h2>Описание</h2>${descriptionToDocumentParagraphs(descriptionValue)}</div>
  <div class="doc-section doc-conclusion-section" style="${conclusionStyle}"><h2>Заключение</h2>${textToDocumentParagraphs(conclusionValue)}</div>
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

export const createDocFileBlob = (documentHtml: string) =>
  new Blob(['\ufeff', documentHtml], {
    type: 'application/msword;charset=utf-8',
  })

export const downloadDocFile = (fileName: string, documentHtml: string) => {
  const blob = createDocFileBlob(documentHtml)
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
