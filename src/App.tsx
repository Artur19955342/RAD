import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'
import EditableArea from './components/EditableArea'
import ProtocolTemplatesDialog from './components/ProtocolTemplatesDialog'
import VariantPopover from './components/VariantPopover'
import { useEvent } from './hooks/useEvent'
import type {
  ActiveMarker,
  ActiveVariant,
  BrowserDragItem,
  EditorSegment,
  FieldName,
  FindingFolder,
  FindingPair,
  FindingSaveDialog,
  HighlightRange,
  MarkerOption,
  MarkerSegment,
  MarkerMenu,
  NumericSegment,
  PendingSelection,
  PassportData,
  PassportCustomField,
  PatientSex,
  ProtocolExportSettings,
  ProtocolTemplate,
  SavedFinding,
  SavedSelection,
  TextChange,
  TextRange,
  TextSegment,
  UserProfile,
  VariantSegment,
} from './types'
import {
  browserDragDataType,
  createFindingFolderId,
  createSavedFindingId,
  findSavedFindingMatch,
  getDefaultFindingName,
  getTimestamp,
  isFolderNestedIn,
  loadStoredFindingFolders,
  loadStoredFindings,
  normalizeSavedFindingText,
  normalizeFolderTree,
  parseBrowserDragItem,
  sanitizeStoredFinding,
  sanitizeStoredFolder,
  storeFindingFolders,
  storeSavedFindings,
} from './utils/findingMemory'
import {
  chooseProtocolDirectory,
  clearStoredProtocolDirectory,
  getStoredProtocolDirectory,
  isProtocolDirectorySaveSupported,
  saveDocFileToStoredProtocolDirectory,
} from './utils/deviceFileSave'
import { escapeHtml } from './utils/html'
import { getLateralityWarning } from './utils/lateralityCheck'
import {
  createDefaultPassportData,
  createPassportFieldId,
  formatDateInputValue,
  formatPatientShortName,
  formatTimeInputValue,
  getPassportCollapsedTitle,
} from './utils/passport'
import {
  buildProtocolFileNameTemplate,
  createDefaultProtocolExportSettings,
  createProtocolDownloadDocument,
  downloadDocFile,
  formatProtocolFileName,
  getProtocolFileNameBlockKeys,
  getProtocolFileNameBlocks,
  loadProtocolExportSettings,
  parseProtocolFileNameDragItem,
  protocolFileNameDragDataType,
  sanitizeProtocolExportSettings,
  storeProtocolExportSettings,
  type ProtocolFileNameDragItem,
} from './utils/protocolExport'
import {
  loadUserDataSnapshot,
  storeUserDataSnapshot,
  type UserDataSnapshot,
} from './utils/userDataStorage'
import {
  clearCurrentUserProfile,
  createUserProfile,
  getUserStorageKey,
  isValidUserEmail,
  loadCurrentUserProfile,
  normalizeUserEmail,
  storeCurrentUserProfile,
} from './utils/userProfiles'

let segmentSeed = 100
let pairSeed = 0
const markerText = '◆'
const templatesStorageKey = 'radiology-app-protocol-templates-v1'
const userTemplatesStorageKey = 'protocol-templates-v1'
const userSavedFindingsStorageKey = 'saved-findings-v1'
const userFindingFoldersStorageKey = 'finding-folders-v1'
const userProtocolExportSettingsStorageKey = 'protocol-export-settings-v1'
const selectionAnchorLength = 32
const defaultSidePanelWidth = 320
const minSidePanelWidth = 260
const maxSidePanelWidth = 620
const minWorkspaceWidth = 520
const defaultConclusionPanelHeight = 280
const minDescriptionPanelHeight = 220
const minConclusionPanelHeight = 160
const resizeHandleSize = 6
const sentenceTerminalPattern = /(?:\.{1,}|\u2026)\s*$/

const clampValue = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max))

const createSegmentId = () => {
  segmentSeed += 1
  return segmentSeed
}

const createPairId = () => {
  pairSeed += 1
  return pairSeed
}

const createTextSegment = (text: string): TextSegment => ({
  id: createSegmentId(),
  type: 'text',
  text,
})

const createNumericSegment = (value: string): NumericSegment => ({
  id: createSegmentId(),
  type: 'number',
  value,
})

const createMarkerSegment = (): MarkerSegment => ({
  id: createSegmentId(),
  type: 'marker',
  title: '',
  options: [{ title: '', value: '' }],
  selectedOptionIndex: null,
})

const createEmptyMarkerOption = (): MarkerOption => ({
  title: '',
  value: '',
})

const getMarkerOptionLabel = (option: MarkerOption, index: number) =>
  option.title.trim() || `Заготовка ${index + 1}`

const createTemplateId = () =>
  `template-${getTimestamp()}-${Math.random().toString(36).slice(2)}`

const createProtocolSessionId = () =>
  `protocol-session-${getTimestamp()}-${Math.random().toString(36).slice(2)}`

type OpenProtocolSession = {
  id: string
  passportData: PassportData
  templateName: string
  currentTemplateId: string | null
  descriptionContent: EditorSegment[]
  conclusionContent: EditorSegment[]
  findingPairs: FindingPair[]
  newDescriptionRanges: TextRange[]
  changedDescriptionRanges: TextRange[]
  changedConclusionRanges: TextRange[]
  hasLoadedTemplate: boolean
  updatedAt: number
}

const copyPassportData = (passportData: PassportData): PassportData => ({
  ...passportData,
  customFields: passportData.customFields.map((field) => ({ ...field })),
})

const copyTextRange = (range: TextRange): TextRange => ({ ...range })

const copyFindingPair = (pair: FindingPair): FindingPair => ({
  ...pair,
  conclusion: copyTextRange(pair.conclusion),
  description: copyTextRange(pair.description),
})

const copyOpenProtocolSession = (
  session: OpenProtocolSession,
): OpenProtocolSession => ({
  ...session,
  changedConclusionRanges: session.changedConclusionRanges.map(copyTextRange),
  changedDescriptionRanges: session.changedDescriptionRanges.map(copyTextRange),
  conclusionContent: copyContent(session.conclusionContent),
  descriptionContent: copyContent(session.descriptionContent),
  findingPairs: session.findingPairs.map(copyFindingPair),
  newDescriptionRanges: session.newDescriptionRanges.map(copyTextRange),
  passportData: copyPassportData(session.passportData),
})

const segmentToText = (segment: EditorSegment) =>
  segment.type === 'text'
    ? segment.text
    : segment.type === 'variant'
      ? segment.value
      : segment.type === 'number'
        ? segment.value
        : markerText

const getContentText = (content: EditorSegment[]) =>
  content.map(segmentToText).join('')

const getFindingLabelText = (value: string) =>
  value.replaceAll(markerText, ' ').replace(/\s+/g, ' ').trim()

const getTemplatePreviewText = (template: ProtocolTemplate) => {
  const previewText = [
    getContentText(template.descriptionContent),
    getContentText(template.conclusionContent),
  ].join(' ')

  return getFindingLabelText(previewText) || 'Пустой шаблон'
}

const segmentToProtocolText = (segment: EditorSegment) => {
  if (segment.type === 'text') {
    return segment.text
  }

  if (segment.type === 'variant' || segment.type === 'number') {
    return segment.value
  }

  const title = segment.title.trim()

  return title ? `\n${title}\n` : ''
}

const getProtocolContentText = (content: EditorSegment[]) =>
  content
    .map(segmentToProtocolText)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const compactContent = (content: EditorSegment[]) => {
  const compacted: EditorSegment[] = []

  content.forEach((segment) => {
    if (segment.type === 'text') {
      if (!segment.text) {
        return
      }

      const previous = compacted.at(-1)

      if (previous?.type === 'text') {
        previous.text += segment.text
        return
      }
    }

    compacted.push(segment.type === 'text' ? { ...segment } : segment)
  })

  return compacted
}

const ensureLeadingMarkerContent = (content: EditorSegment[]) => {
  const compactedContent = compactContent(content)
  const firstMarkerIndex = compactedContent.findIndex(
    (segment) => segment.type === 'marker',
  )

  if (firstMarkerIndex === 0) {
    return compactedContent
  }

  if (firstMarkerIndex === -1) {
    return compactContent([createMarkerSegment(), ...compactedContent])
  }

  const firstMarker = compactedContent[firstMarkerIndex]
  const leadingText = getContentText(
    compactedContent.slice(0, firstMarkerIndex),
  ).trimStart()
  const movedLeadingContent = leadingText ? [createTextSegment(leadingText)] : []

  return compactContent([
    firstMarker,
    ...movedLeadingContent,
    ...compactedContent.slice(firstMarkerIndex + 1),
  ])
}

const getSentenceTerminalEnd = (text: string, index: number) => {
  if (text[index] === '\u2026') {
    return index + 1
  }

  if (text[index] !== '.') {
    return null
  }

  let end = index + 1

  while (text[end] === '.') {
    end += 1
  }

  return end
}

const getSentenceRanges = (text: string) => {
  const ranges: TextRange[] = []
  let start: number | null = null

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (start === null && !/\s/.test(char)) {
      start = index
    }

    if (start === null) {
      continue
    }

    const terminalEnd = getSentenceTerminalEnd(text, index)

    if (terminalEnd !== null) {
      ranges.push({ start, end: terminalEnd })
      start = null
      index = terminalEnd - 1
      continue
    }

    if (char === '\n') {
      ranges.push({ start, end: index })
      start = null
    }
  }

  if (start !== null) {
    ranges.push({ start, end: text.length })
  }

  return ranges.filter((range) => range.end > range.start)
}

const getSentenceRangeAtOffset = (text: string, offset: number) => {
  const ranges = getSentenceRanges(text)

  if (!ranges.length) {
    return null
  }

  const normalizedOffset = Math.max(0, Math.min(offset, text.length - 1))
  const directRange = ranges.find(
    (range) => range.start <= normalizedOffset && normalizedOffset <= range.end,
  )

  if (directRange) {
    return directRange
  }

  return (
    ranges.find(
      (range, index) =>
        range.end <= offset &&
        (!ranges[index + 1] || ranges[index + 1].start >= offset),
    ) ?? null
  )
}

const getRangeText = (text: string, range: TextRange) =>
  text.slice(range.start, range.end)

const trimRangeWhitespace = (text: string, range: TextRange) => {
  let start = Math.max(0, Math.min(range.start, text.length))
  let end = Math.max(start, Math.min(range.end, text.length))

  while (start < end && /\s/.test(text[start])) {
    start += 1
  }

  while (end > start && /\s/.test(text[end - 1])) {
    end -= 1
  }

  return end > start ? { start, end } : null
}

const isFindingText = (text: string, range: TextRange) => {
  const value = getRangeText(text, range).trim()

  return Boolean(value) && value !== markerText && !value.endsWith(':')
}

const getFindingRangeAtOffset = (text: string, offset: number) => {
  const range = getSentenceRangeAtOffset(text, offset)

  return range && isFindingText(text, range) ? range : null
}

const getFindingRanges = (text: string) =>
  getSentenceRanges(text).filter((range) => isFindingText(text, range))

const isSameRange = (first: TextRange, second: TextRange) =>
  first.start === second.start && first.end === second.end

const getRangeOverlap = (first: TextRange, second: TextRange) =>
  Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start))

const getTextChange = (
  previousText: string,
  nextText: string,
): TextChange | null => {
  if (previousText === nextText) {
    return null
  }

  let start = 0

  while (
    start < previousText.length &&
    start < nextText.length &&
    previousText[start] === nextText[start]
  ) {
    start += 1
  }

  let suffixLength = 0

  while (
    suffixLength < previousText.length - start &&
    suffixLength < nextText.length - start &&
    previousText[previousText.length - 1 - suffixLength] ===
      nextText[nextText.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  return {
    nextRange: {
      start,
      end: nextText.length - suffixLength,
    },
    previousRange: {
      start,
      end: previousText.length - suffixLength,
    },
  }
}

const mergeTextRanges = (ranges: TextRange[]) => {
  const sortedRanges = ranges
    .filter((range) => range.end > range.start)
    .sort((first, second) => first.start - second.start)
  const mergedRanges: TextRange[] = []

  sortedRanges.forEach((range) => {
    const previous = mergedRanges.at(-1)

    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
      return
    }

    mergedRanges.push({ ...range })
  })

  return mergedRanges
}

const adjustTrackedRangesForEdit = (
  ranges: TextRange[],
  editStart: number,
  delta: number,
) => {
  if (delta === 0) {
    return ranges
  }

  const deletionEnd = delta < 0 ? editStart - delta : editStart

  return mergeTextRanges(
    ranges.flatMap((range) => {
      if (delta > 0) {
        if (range.start >= editStart) {
          return [{ start: range.start + delta, end: range.end + delta }]
        }

        if (range.end > editStart) {
          return [{ start: range.start, end: range.end + delta }]
        }

        return [range]
      }

      if (range.end <= editStart) {
        return [range]
      }

      if (range.start >= deletionEnd) {
        return [{ start: range.start + delta, end: range.end + delta }]
      }

      const nextRange = {
        start: range.start,
        end: Math.max(editStart, range.end + delta),
      }

      return nextRange.end > nextRange.start ? [nextRange] : []
    }),
  )
}

const adjustTrackedRangesForReplacement = (
  ranges: TextRange[],
  previousRange: TextRange,
  nextRange: TextRange,
) => {
  const delta =
    nextRange.end -
    nextRange.start -
    (previousRange.end - previousRange.start)

  return mergeTextRanges(
    ranges.flatMap((range) => {
      if (range.end <= previousRange.start) {
        return [range]
      }

      if (range.start >= previousRange.end) {
        return [{ start: range.start + delta, end: range.end + delta }]
      }

      const nextRanges: TextRange[] = []

      if (range.start < previousRange.start) {
        nextRanges.push({ start: range.start, end: previousRange.start })
      }

      if (range.end > previousRange.end) {
        nextRanges.push({
          start: nextRange.end,
          end: range.end + delta,
        })
      }

      return nextRanges
    }),
  )
}

const trackTextChangeRange = (ranges: TextRange[], change: TextChange) =>
  mergeTextRanges([
    ...adjustTrackedRangesForReplacement(
      ranges,
      change.previousRange,
      change.nextRange,
    ),
    ...(change.nextRange.end > change.nextRange.start ? [change.nextRange] : []),
  ])

const getTrackedFindingRanges = (text: string, trackedRanges: TextRange[]) =>
  getFindingRanges(text).filter((findingRange) =>
    trackedRanges.some((trackedRange) => getRangeOverlap(findingRange, trackedRange) > 0),
  )

const getTrackedFindingRangeAtOffset = (
  text: string,
  offset: number,
  trackedRanges: TextRange[],
) => {
  const range = getFindingRangeAtOffset(text, offset)

  return range &&
    trackedRanges.some((trackedRange) => getRangeOverlap(range, trackedRange) > 0)
    ? range
    : null
}

const getBestOverlappingPair = (
  pairs: FindingPair[],
  field: FieldName,
  range: TextRange,
) =>
  pairs
    .map((pair) => ({
      overlap: getRangeOverlap(getPairRange(pair, field), range),
      pair,
    }))
    .filter((item) => item.overlap > 0)
    .sort((first, second) => second.overlap - first.overlap)[0]?.pair ?? null

const isCompletedConclusion = (text: string, range: TextRange) =>
  sentenceTerminalPattern.test(getRangeText(text, range).trim())

const getSentenceCompletionEdit = (text: string, range: TextRange) => {
  if (!isFindingText(text, range) || isCompletedConclusion(text, range)) {
    return null
  }

  const value = getRangeText(text, range)
  const trailingSpaceLength = value.match(/\s*$/)?.[0].length ?? 0
  const editEnd = range.end - trailingSpaceLength

  if (editEnd <= range.start) {
    return null
  }

  const lastChar = text[editEnd - 1]
  const replaceTrailingSoftPunctuation = lastChar === ',' || lastChar === ';'

  return {
    previousRange: replaceTrailingSoftPunctuation
      ? { start: editEnd - 1, end: editEnd }
      : { start: editEnd, end: editEnd },
    text: '.',
  }
}

const getPairRange = (pair: FindingPair, field: FieldName) =>
  field === 'description' ? pair.description : pair.conclusion

const setPairRange = (
  pair: FindingPair,
  field: FieldName,
  range: TextRange,
) =>
  field === 'description'
    ? { ...pair, description: range }
    : { ...pair, conclusion: range }

const isOffsetInRange = (range: TextRange, offset: number) =>
  offset >= range.start && offset <= Math.max(range.start, range.end)

const findPairAtOffset = (
  pairs: FindingPair[],
  field: FieldName,
  offset: number,
) =>
  pairs.find((pair) => isOffsetInRange(getPairRange(pair, field), offset)) ??
  null

const getTrimmedSelectionRange = (selection: SavedSelection) => {
  const leadingSpace = selection.text.match(/^\s*/)?.[0].length ?? 0
  const trailingSpace = selection.text.match(/\s*$/)?.[0].length ?? 0
  const value = selection.text.slice(
    leadingSpace,
    selection.text.length - trailingSpace,
  )

  if (!value) {
    return null
  }

  return {
    start: selection.start + leadingSpace,
    end: selection.end - trailingSpace,
    text: value,
  }
}

const normalizeEditedRangeToSentence = (
  text: string,
  range: TextRange,
  editStart: number,
) =>
  getSentenceRangeAtOffset(text, editStart) ??
  getSentenceRangeAtOffset(text, range.start) ??
  range

const adjustPairsForFieldEdit = (
  pairs: FindingPair[],
  field: FieldName,
  editStart: number,
  delta: number,
  preferredPairId: number | null,
  nextText: string,
) => {
  if (delta === 0) {
    return pairs
  }

  const preferredPair =
    preferredPairId !== null
      ? pairs.find((pair) => pair.id === preferredPairId) ?? null
      : null
  const touchedPair =
    preferredPair && isOffsetInRange(getPairRange(preferredPair, field), editStart)
      ? preferredPair
      : findPairAtOffset(pairs, field, editStart)

  return pairs.map((pair) => {
    const range = getPairRange(pair, field)

    if (touchedPair?.id === pair.id) {
      const editedRange = {
        start: range.start,
        end: Math.max(range.start, range.end + delta),
      }

      return setPairRange(
        pair,
        field,
        normalizeEditedRangeToSentence(nextText, editedRange, editStart),
      )
    }

    if (range.start >= editStart) {
      return setPairRange(pair, field, {
        start: Math.max(0, range.start + delta),
        end: Math.max(0, range.end + delta),
      })
    }

    if (range.end > editStart) {
      return setPairRange(pair, field, {
        start: range.start,
        end: Math.max(range.start, range.end + delta),
      })
    }

    return pair
  })
}

const variantToHtml = (segment: VariantSegment) =>
  `<span class="variant-token" data-variant-id="${segment.id}" title="Варианты">${escapeHtml(segment.value)}</span>`

const numberToHtml = (segment: NumericSegment) =>
  `<span class="number-token" data-number-id="${segment.id}" title="Числовое значение">${escapeHtml(segment.value)}</span>`

const markerToHtml = (
  segment: MarkerSegment,
  markerNumber: number,
  activeMarkerId: number | null,
) => {
  const label = String(markerNumber)
  const className = [
    'section-marker-token',
    activeMarkerId === segment.id ? 'is-active' : '',
    activeMarkerId !== null && activeMarkerId !== segment.id ? 'is-muted' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const title = segment.title.trim()
  const titleText = title ? `Метка ${label}: ${title}` : `Метка ${label}`

  return `<span class="${className}" contenteditable="false" data-marker-id="${segment.id}" data-marker-label="${escapeHtml(label)}" aria-label="${escapeHtml(titleText)}" title="${escapeHtml(titleText)}">${markerText}</span>`
}

const segmentToHtml = (
  segment: EditorSegment,
  markerNumber = 0,
  activeMarkerId: number | null = null,
) => {
  if (segment.type === 'text') {
    return escapeHtml(segment.text)
  }

  if (segment.type === 'variant') {
    return variantToHtml(segment)
  }

  return segment.type === 'number'
    ? numberToHtml(segment)
    : markerToHtml(segment, markerNumber, activeMarkerId)
}

const contentToHtml = (
  content: EditorSegment[],
  highlights: HighlightRange[] = [],
  activeMarkerId: number | null = null,
) => {
  const activeHighlights = highlights.filter(
    (highlight) => highlight.end > highlight.start,
  )
  let cursor = 0
  let html = ''
  let markerNumber = 0

  const getClassName = (start: number, end: number) =>
    activeHighlights
      .filter(
        (highlight) => Math.max(start, highlight.start) < Math.min(end, highlight.end),
      )
      .map((highlight) => highlight.className)
      .filter((className, index, classNames) => classNames.indexOf(className) === index)
      .join(' ')

  const wrapHtml = (value: string, className: string) =>
    className ? `<span class="${className}">${value}</span>` : value

  content.forEach((segment) => {
    const text = segmentToText(segment)
    const segmentStart = cursor
    const segmentEnd = cursor + text.length
    cursor = segmentEnd
    const segmentClassName = getClassName(segmentStart, segmentEnd)
    const currentMarkerNumber =
      segment.type === 'marker' ? (markerNumber += 1) : markerNumber

    if (!activeHighlights.length || !segmentClassName) {
      html += segmentToHtml(segment, currentMarkerNumber, activeMarkerId)
      return
    }

    if (segment.type !== 'text') {
      html +=
        segment.type === 'marker'
          ? segmentToHtml(segment, currentMarkerNumber, activeMarkerId)
          : wrapHtml(
              segmentToHtml(segment, currentMarkerNumber, activeMarkerId),
              segmentClassName,
            )
      return
    }

    const boundaries = new Set([0, text.length])

    activeHighlights.forEach((highlight) => {
      const start = Math.max(0, highlight.start - segmentStart)
      const end = Math.min(text.length, highlight.end - segmentStart)

      if (start > 0 && start < text.length) {
        boundaries.add(start)
      }

      if (end > 0 && end < text.length) {
        boundaries.add(end)
      }
    })

    const sortedBoundaries = Array.from(boundaries).sort((first, second) => first - second)

    sortedBoundaries.slice(0, -1).forEach((start, index) => {
      const end = sortedBoundaries[index + 1]
      const value = text.slice(start, end)

      if (!value) {
        return
      }

      html += wrapHtml(
        escapeHtml(value),
        getClassName(segmentStart + start, segmentStart + end),
      )
    })
  })

  return html
}

const replaceRangeWithVariant = (
  content: EditorSegment[],
  start: number,
  end: number,
  variant: VariantSegment,
) => {
  let cursor = 0
  let inserted = false
  const nextContent: EditorSegment[] = []

  content.forEach((segment) => {
    const text = segmentToText(segment)
    const segmentStart = cursor
    const segmentEnd = cursor + text.length
    cursor = segmentEnd

    if (segmentEnd <= start || segmentStart >= end) {
      nextContent.push(segment)
      return
    }

    if (segment.type !== 'text') {
      if (!inserted) {
        nextContent.push(variant)
        inserted = true
      }
      return
    }

    const before = text.slice(0, Math.max(0, start - segmentStart))
    const after = text.slice(Math.max(0, end - segmentStart))

    if (before) {
      nextContent.push(createTextSegment(before))
    }

    if (!inserted) {
      nextContent.push(variant)
      inserted = true
    }

    if (after) {
      nextContent.push(createTextSegment(after))
    }
  })

  if (!inserted) {
    nextContent.push(variant)
  }

  return compactContent(nextContent)
}

const removeRangeFromContent = (
  content: EditorSegment[],
  start: number,
  end: number,
) => {
  let cursor = 0
  const nextContent: EditorSegment[] = []

  content.forEach((segment) => {
    const text = segmentToText(segment)
    const segmentStart = cursor
    const segmentEnd = cursor + text.length
    cursor = segmentEnd

    if (segmentEnd <= start || segmentStart >= end) {
      nextContent.push(segment)
      return
    }

    if (segment.type !== 'text') {
      return
    }

    const before = text.slice(0, Math.max(0, start - segmentStart))
    const after = text.slice(Math.max(0, end - segmentStart))

    if (before) {
      nextContent.push(createTextSegment(before))
    }

    if (after) {
      nextContent.push(createTextSegment(after))
    }
  })

  return compactContent(nextContent)
}

const insertContentAtOffset = (
  content: EditorSegment[],
  offset: number,
  insertedContent: EditorSegment[],
) => {
  if (!insertedContent.length) {
    return content
  }

  let cursor = 0
  let inserted = false
  const nextContent: EditorSegment[] = []

  content.forEach((segment) => {
    const text = segmentToText(segment)
    const segmentStart = cursor
    const segmentEnd = cursor + text.length
    cursor = segmentEnd

    if (inserted || offset > segmentEnd) {
      nextContent.push(segment)
      return
    }

    if (segment.type !== 'text') {
      if (offset <= segmentStart) {
        nextContent.push(...insertedContent, segment)
      } else {
        nextContent.push(segment, ...insertedContent)
      }

      inserted = true
      return
    }

    const localOffset = Math.max(0, Math.min(text.length, offset - segmentStart))
    const before = text.slice(0, localOffset)
    const after = text.slice(localOffset)

    if (before) {
      nextContent.push(createTextSegment(before))
    }

    nextContent.push(...insertedContent)

    if (after) {
      nextContent.push(createTextSegment(after))
    }

    inserted = true
  })

  if (!inserted) {
    nextContent.push(...insertedContent)
  }

  return compactContent(nextContent)
}

const replaceRangeWithContent = (
  content: EditorSegment[],
  start: number,
  end: number,
  insertedContent: EditorSegment[],
) =>
  insertContentAtOffset(
    removeRangeFromContent(content, start, end),
    start,
    insertedContent,
  )

const getLastNonWhitespaceOffset = (text: string) => {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (!/\s/.test(text[index])) {
      return index
    }
  }

  return null
}

const completeFinalFindingInContent = (content: EditorSegment[]) => {
  const text = getContentText(content)
  const lastOffset = getLastNonWhitespaceOffset(text)

  if (lastOffset === null) {
    return content
  }

  const finalRange = getFindingRangeAtOffset(text, lastOffset)
  const completionEdit = finalRange
    ? getSentenceCompletionEdit(text, finalRange)
    : null

  return completionEdit
    ? replaceRangeWithContent(
        content,
        completionEdit.previousRange.start,
        completionEdit.previousRange.end,
        [createTextSegment(completionEdit.text)],
      )
    : content
}

const cloneSegment = (segment: EditorSegment): EditorSegment =>
  segment.type === 'text'
    ? createTextSegment(segment.text)
    : segment.type === 'variant'
      ? {
          ...segment,
          id: createSegmentId(),
          options: [...segment.options],
        }
      : segment.type === 'number'
        ? createNumericSegment(segment.value)
        : {
            ...segment,
            id: createSegmentId(),
            title: segment.title ?? '',
            options: segment.options.map((option) => ({ ...option })),
          }

const copySegment = (segment: EditorSegment): EditorSegment => {
  if (segment.type === 'text') {
    return { ...segment }
  }

  if (segment.type === 'variant') {
    return {
      ...segment,
      options: [...segment.options],
    }
  }

  if (segment.type === 'number') {
    return { ...segment }
  }

  return {
    ...segment,
    title: segment.title ?? '',
    options: segment.options.map((option) => ({ ...option })),
  }
}

const copyContent = (content: EditorSegment[]) => content.map(copySegment)

const getContentStructureSignature = (content: EditorSegment[]) =>
  content
    .map((segment) => {
      if (segment.type === 'text') {
        return `text:${segment.text}`
      }

      if (segment.type === 'variant') {
        return `variant:${segment.id}:${segment.value}:${JSON.stringify(
          segment.options,
        )}`
      }

      if (segment.type === 'number') {
        return `number:${segment.id}:${segment.value}`
      }

      return `marker:${segment.id}:${segment.title}:${segment.selectedOptionIndex}:${JSON.stringify(
        segment.options,
      )}`
    })
    .join('\n')

const getMaxContentSegmentId = (content: EditorSegment[]) =>
  content.reduce(
    (maxId, segment) =>
      Number.isFinite(segment.id) ? Math.max(maxId, segment.id) : maxId,
    0,
  )

const syncSeedsFromProtocolContent = (
  descriptionContent: EditorSegment[],
  conclusionContent: EditorSegment[],
  findingPairs: FindingPair[],
) => {
  segmentSeed = Math.max(
    segmentSeed,
    getMaxContentSegmentId(descriptionContent),
    getMaxContentSegmentId(conclusionContent),
  )
  pairSeed = Math.max(
    pairSeed,
    findingPairs.reduce(
      (maxId, pair) =>
        Number.isFinite(pair.id) ? Math.max(maxId, pair.id) : maxId,
      0,
    ),
  )
}

const syncSeedsFromTemplate = (template: ProtocolTemplate) => {
  syncSeedsFromProtocolContent(
    template.descriptionContent,
    template.conclusionContent,
    template.findingPairs,
  )
}

const sliceContentRange = (
  content: EditorSegment[],
  start: number,
  end: number,
) => {
  let cursor = 0
  const selectedContent: EditorSegment[] = []

  content.forEach((segment) => {
    const text = segmentToText(segment)
    const segmentStart = cursor
    const segmentEnd = cursor + text.length
    cursor = segmentEnd

    if (segmentEnd <= start || segmentStart >= end) {
      return
    }

    if (segment.type === 'marker') {
      return
    }

    if (segment.type === 'variant' || segment.type === 'number') {
      selectedContent.push(cloneSegment(segment))
      return
    }

    const selectedStart = Math.max(0, start - segmentStart)
    const selectedEnd = Math.min(text.length, end - segmentStart)
    const selectedText = text.slice(selectedStart, selectedEnd)

    if (selectedText) {
      selectedContent.push(createTextSegment(selectedText))
    }
  })

  return compactContent(selectedContent)
}

const appendContent = (
  targetContent: EditorSegment[],
  contentToAppend: EditorSegment[],
) => {
  const targetText = getContentText(targetContent)
  const appendedText = getContentText(contentToAppend)

  if (!appendedText.trim()) {
    return {
      content: targetContent,
      range: { start: targetText.length, end: targetText.length },
    }
  }

  const separator =
    targetText && !/\s$/.test(targetText) && !/^\s/.test(appendedText)
      ? [createTextSegment(' ')]
      : []
  const start = targetText.length + getContentText(separator).length

  return {
    content: compactContent([...targetContent, ...separator, ...contentToAppend]),
    range: { start, end: start + appendedText.length },
  }
}

const getVariantMap = (content: EditorSegment[]) => {
  const map = new Map<number, VariantSegment>()

  content.forEach((segment) => {
    if (segment.type === 'variant') {
      map.set(segment.id, segment)
    }
  })

  return map
}

const getNumberMap = (content: EditorSegment[]) => {
  const map = new Map<number, NumericSegment>()

  content.forEach((segment) => {
    if (segment.type === 'number') {
      map.set(segment.id, segment)
    }
  })

  return map
}

const getMarkerMap = (content: EditorSegment[]) => {
  const map = new Map<number, MarkerSegment>()

  content.forEach((segment) => {
    if (segment.type === 'marker') {
      map.set(segment.id, segment)
    }
  })

  return map
}

const getMarkerRanges = (content: EditorSegment[]) => {
  let cursor = 0
  const ranges: Array<TextRange & { id: number }> = []

  content.forEach((segment) => {
    const text = segmentToText(segment)
    const start = cursor
    cursor += text.length

    if (segment.type === 'marker') {
      ranges.push({ id: segment.id, start, end: cursor })
    }
  })

  return ranges
}

const getLeadingMarkerRange = (content: EditorSegment[]) => {
  const firstMarkerRange = getMarkerRanges(content)[0] ?? null

  return firstMarkerRange?.start === 0 ? firstMarkerRange : null
}

const getMarkerBlockInfo = (content: EditorSegment[], id: number) => {
  const markerRanges = getMarkerRanges(content)
  const markerIndex = markerRanges.findIndex((range) => range.id === id)

  if (markerIndex === -1) {
    return null
  }

  const text = getContentText(content)
  const markerRange = markerRanges[markerIndex]
  const nextMarkerRange = markerRanges[markerIndex + 1] ?? null
  const blockStart = markerRange.end
  const blockEnd = nextMarkerRange?.start ?? text.length
  const textStart = text[blockStart] === '\n' ? blockStart + 1 : blockStart
  const rawText = text.slice(textStart, blockEnd)
  const value =
    nextMarkerRange && rawText.endsWith('\n')
      ? rawText.slice(0, -1)
      : rawText

  return {
    blockEnd,
    blockStart,
    hasNextMarker: Boolean(nextMarkerRange),
    markerRange,
    value,
  }
}

const getMarkerIdAtOffset = (content: EditorSegment[], offset: number) => {
  const text = getContentText(content)
  const markerRanges = getMarkerRanges(content)
  const normalizedOffset = Math.max(0, Math.min(offset, text.length))

  for (let index = 0; index < markerRanges.length; index += 1) {
    const markerRange = markerRanges[index]
    const nextMarkerRange = markerRanges[index + 1] ?? null
    const blockStart = markerRange.end
    const blockEnd = nextMarkerRange?.start ?? text.length
    const textStart = text[blockStart] === '\n' ? blockStart + 1 : blockStart

    if (normalizedOffset >= textStart && normalizedOffset <= blockEnd) {
      return markerRange.id
    }
  }

  return null
}

const syncVariantText = (
  previousVariant: VariantSegment | undefined,
  id: number,
  value: string,
): VariantSegment => {
  if (!previousVariant) {
    return {
      id,
      type: 'variant',
      value,
      options: [value],
    }
  }

  const selectedOptionIndex = previousVariant.options.findIndex(
    (option) => option === previousVariant.value,
  )

  if (selectedOptionIndex === -1) {
    return {
      ...previousVariant,
      value,
      options: previousVariant.options.includes(value)
        ? previousVariant.options
        : [value, ...previousVariant.options],
    }
  }

  return {
    ...previousVariant,
    value,
    options: previousVariant.options.map((option, index) =>
      index === selectedOptionIndex ? value : option,
    ),
  }
}

const syncNumberText = (
  previousNumber: NumericSegment | undefined,
  id: number,
  value: string,
): NumericSegment => ({
  id: Number.isNaN(id) ? previousNumber?.id ?? createSegmentId() : id,
  type: 'number',
  value: value.trim(),
})

const tokenizeNumericTextSegments = (content: EditorSegment[]) =>
  compactContent(
    content.flatMap((segment) => {
      if (segment.type !== 'text') {
        return [segment]
      }

      const segments: EditorSegment[] = []
      const numericPattern = /( )(\d+(?:[.,]\d+)?)(?= )/g
      let cursor = 0
      let match = numericPattern.exec(segment.text)

      while (match) {
        const numberStart = match.index + match[1].length
        const numberEnd = numberStart + match[2].length
        const before = segment.text.slice(cursor, numberStart)

        if (before) {
          segments.push(createTextSegment(before))
        }

        segments.push(createNumericSegment(match[2]))
        cursor = numberEnd
        match = numericPattern.exec(segment.text)
      }

      const after = segment.text.slice(cursor)

      if (after) {
        segments.push(createTextSegment(after))
      }

      return segments.length ? segments : [segment]
    }),
  )

const isSelectionInside = (editor: HTMLElement, selection: Selection) => {
  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode

  return Boolean(
    anchorNode &&
      focusNode &&
      editor.contains(anchorNode) &&
      editor.contains(focusNode),
  )
}

const getTokenElementFromNode = (
  editor: HTMLElement,
  node: Node | null,
  selector: string,
) => {
  if (!node || !editor.contains(node)) {
    return null
  }

  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement

  const tokenElement = element?.closest<HTMLElement>(selector) ?? null

  return tokenElement && editor.contains(tokenElement)
    ? tokenElement
    : null
}

const getVariantElementFromNode = (editor: HTMLElement, node: Node | null) =>
  getTokenElementFromNode(editor, node, '.variant-token')

const getNumberElementFromNode = (editor: HTMLElement, node: Node | null) =>
  getTokenElementFromNode(editor, node, '.number-token')

const getInteractiveElementFromNode = (
  editor: HTMLElement,
  node: Node | null,
) => getTokenElementFromNode(editor, node, '.variant-token, .number-token')

const getVariantIdFromSelection = (editor: HTMLElement) => {
  const selection = window.getSelection()
  const variantElement = getVariantElementFromNode(
    editor,
    selection?.focusNode ?? null,
  )
  const id = Number(variantElement?.dataset.variantId)

  return Number.isNaN(id) ? null : id
}

const getOffsetFromPoint = (editor: HTMLElement, x: number, y: number) => {
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const caretPosition = caretDocument.caretPositionFromPoint?.(x, y)
  const caretRange = caretPosition
    ? null
    : caretDocument.caretRangeFromPoint?.(x, y)
  const node = caretPosition?.offsetNode ?? caretRange?.startContainer
  const offset = caretPosition?.offset ?? caretRange?.startOffset

  if (!node || offset === undefined || !editor.contains(node)) {
    return null
  }

  const range = document.createRange()
  range.selectNodeContents(editor)
  range.setEnd(node, offset)

  return range.toString().length
}

const isWordCharacter = (char: string) => /[\p{L}\p{N}_-]/u.test(char)

const getWordRangeAtOffset = (text: string, offset: number) => {
  if (!text) {
    return null
  }

  let index = Math.max(0, Math.min(offset, text.length - 1))

  if (!isWordCharacter(text[index]) && offset > 0 && isWordCharacter(text[offset - 1])) {
    index = offset - 1
  }

  if (!isWordCharacter(text[index])) {
    return null
  }

  let start = index
  let end = index + 1

  while (start > 0 && isWordCharacter(text[start - 1])) {
    start -= 1
  }

  while (end < text.length && isWordCharacter(text[end])) {
    end += 1
  }

  return { start, end }
}

const getSelectionOffsets = (editor: HTMLElement) => {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)

  if (!isSelectionInside(editor, selection)) {
    return null
  }

  const beforeStart = range.cloneRange()
  beforeStart.selectNodeContents(editor)
  beforeStart.setEnd(range.startContainer, range.startOffset)

  const beforeEnd = range.cloneRange()
  beforeEnd.selectNodeContents(editor)
  beforeEnd.setEnd(range.endContainer, range.endOffset)

  const start = beforeStart.toString().length
  const end = beforeEnd.toString().length

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    text: range.toString(),
  }
}

const getElementTextRange = (editor: HTMLElement, element: HTMLElement) => {
  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(editor)
  beforeRange.setEndBefore(element)

  const start = beforeRange.toString().length

  return {
    start,
    end: start + (element.textContent?.length ?? 0),
  }
}

const selectElementText = (editor: HTMLElement, element: HTMLElement) => {
  const range = getElementTextRange(editor, element)
  restoreSelection(editor, range.start, range.end)

  return range
}

const createPendingSelection = (
  field: FieldName,
  range: TextRange,
  text: string,
  focus?: boolean,
): PendingSelection => ({
  field,
  start: range.start,
  end: range.end,
  beforeText: text.slice(
    Math.max(0, range.start - selectionAnchorLength),
    range.start,
  ),
  afterText: text.slice(range.end, range.end + selectionAnchorLength),
  focus,
})

const findNearestIndex = (
  text: string,
  pattern: string,
  preferredIndex: number,
) => {
  let index = text.indexOf(pattern)
  let nearestIndex = -1
  let nearestDistance = Infinity

  while (index !== -1) {
    const distance = Math.abs(index - preferredIndex)

    if (distance < nearestDistance) {
      nearestIndex = index
      nearestDistance = distance
    }

    index = text.indexOf(pattern, index + 1)
  }

  return nearestIndex
}

const resolveAnchoredOffset = (
  text: string,
  preferredOffset: number,
  beforeText?: string,
  afterText?: string,
) => {
  const fallbackOffset = Math.max(0, Math.min(preferredOffset, text.length))
  const before = beforeText ?? ''
  const after = afterText ?? ''

  if (before && after) {
    const combinedIndex = findNearestIndex(
      text,
      before + after,
      Math.max(0, fallbackOffset - before.length),
    )

    if (combinedIndex !== -1) {
      return combinedIndex + before.length
    }
  }

  if (before) {
    const beforeIndex = findNearestIndex(
      text,
      before,
      Math.max(0, fallbackOffset - before.length),
    )

    if (beforeIndex !== -1) {
      return beforeIndex + before.length
    }
  }

  if (after) {
    const afterIndex = findNearestIndex(text, after, fallbackOffset)

    if (afterIndex !== -1) {
      return afterIndex
    }
  }

  return fallbackOffset
}

const resolvePendingSelection = (
  text: string,
  pendingSelection: PendingSelection,
) => {
  const start = resolveAnchoredOffset(
    text,
    pendingSelection.start,
    pendingSelection.beforeText,
    pendingSelection.afterText,
  )

  if (pendingSelection.start === pendingSelection.end) {
    return { start, end: start }
  }

  return {
    start,
    end: Math.max(
      start,
      Math.min(
        text.length,
        start + Math.max(0, pendingSelection.end - pendingSelection.start),
      ),
    ),
  }
}

const restoreSelection = (editor: HTMLElement, start: number, end: number) => {
  const range = document.createRange()
  let cursor = 0

  const setRangePoint = (
    targetOffset: number,
    setter: (node: Node, offset: number) => void,
  ) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()

    while (node) {
      const length = node.textContent?.length ?? 0
      const markerElement =
        node.parentElement?.closest<HTMLElement>('.section-marker-token') ??
        null

      if (cursor + length >= targetOffset) {
        if (markerElement && editor.contains(markerElement)) {
          const parent = markerElement.parentNode

          if (!parent) {
            return false
          }

          const markerIndex = Array.from(parent.childNodes).indexOf(
            markerElement,
          )

          setter(parent, markerIndex + 1)
          return true
        }

        setter(node, Math.max(0, targetOffset - cursor))
        return true
      }

      cursor += length
      node = walker.nextNode()
    }

    setter(editor, editor.childNodes.length)
    return true
  }

  cursor = 0
  const startSet = setRangePoint(start, (node, offset) =>
    range.setStart(node, offset),
  )
  cursor = 0
  const endSet = setRangePoint(end, (node, offset) =>
    range.setEnd(node, offset),
  )

  if (!startSet || !endSet) {
    return
  }

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const moveCollapsedSelectionAfterLeadingMarker = (
  editor: HTMLElement,
  content: EditorSegment[],
  selection: TextRange & { text: string },
) => {
  const leadingMarkerRange = getLeadingMarkerRange(content)

  if (
    !leadingMarkerRange ||
    selection.start !== selection.end ||
    selection.start >= leadingMarkerRange.end
  ) {
    return selection
  }

  restoreSelection(editor, leadingMarkerRange.end, leadingMarkerRange.end)

  return {
    start: leadingMarkerRange.end,
    end: leadingMarkerRange.end,
    text: '',
  }
}

const keepRangeAfterLeadingMarker = (
  content: EditorSegment[],
  range: TextRange,
) => {
  const leadingMarkerRange = getLeadingMarkerRange(content)

  if (
    !leadingMarkerRange ||
    range.start !== range.end ||
    range.start >= leadingMarkerRange.end
  ) {
    return range
  }

  return {
    start: leadingMarkerRange.end,
    end: leadingMarkerRange.end,
  }
}

const getDescriptionSelectionOffsetAfterNormalization = (
  parsedContent: EditorSegment[],
  normalizedContent: EditorSegment[],
  selection: TextRange,
) => {
  const parsedMarkerRange = getMarkerRanges(parsedContent)[0] ?? null
  const normalizedMarkerRange = getLeadingMarkerRange(normalizedContent)

  if (
    parsedMarkerRange &&
    normalizedMarkerRange &&
    parsedMarkerRange.start > 0 &&
    selection.start === selection.end &&
    selection.end <= parsedMarkerRange.start
  ) {
    const leadingText = getContentText(parsedContent).slice(
      0,
      parsedMarkerRange.start,
    )
    const removedLeadingWhitespace =
      leadingText.length - leadingText.trimStart().length

    return (
      normalizedMarkerRange.end +
      Math.max(0, selection.end - removedLeadingWhitespace)
    )
  }

  return keepRangeAfterLeadingMarker(normalizedContent, {
    start: selection.end,
    end: selection.end,
  }).end
}

const parseEditorContent = (
  editor: HTMLElement,
  previousContent: EditorSegment[],
) => {
  const variants = getVariantMap(previousContent)
  const numbers = getNumberMap(previousContent)
  const markers = getMarkerMap(previousContent)
  const parsed: EditorSegment[] = []

  const appendText = (text: string) => {
    if (!text) {
      return
    }

    const previous = parsed.at(-1)

    if (previous?.type === 'text') {
      previous.text += text
      return
    }

    parsed.push(createTextSegment(text))
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? '')
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    const element = node as HTMLElement
    const variantId = element.dataset.variantId
    const numberId = element.dataset.numberId
    const markerId = element.dataset.markerId

    if (markerId) {
      const id = Number(markerId)
      const previousMarker = markers.get(id)

      parsed.push({
        id: Number.isNaN(id) ? createSegmentId() : id,
        title: previousMarker?.title ?? '',
        options: previousMarker?.options.length
          ? previousMarker.options.map((option) => ({ ...option }))
          : [createEmptyMarkerOption()],
        selectedOptionIndex: previousMarker?.selectedOptionIndex ?? null,
        type: 'marker',
      })
      return
    }

    if (variantId) {
      const id = Number(variantId)
      const previousVariant = variants.get(id)
      const value = element.textContent ?? ''

      parsed.push(syncVariantText(previousVariant, id, value))
      return
    }

    if (numberId) {
      const id = Number(numberId)
      const previousNumber = numbers.get(id)
      const value = element.textContent ?? ''

      if (value) {
        parsed.push(syncNumberText(previousNumber, id, value))
      }
      return
    }

    if (element.tagName === 'BR') {
      appendText('\n')
      return
    }

    Array.from(element.childNodes).forEach(walk)
  }

  Array.from(editor.childNodes).forEach(walk)

  return tokenizeNumericTextSegments(compactContent(parsed))
}

const getSafePosition = (x: number, y: number, width = 280, height = 240) => ({
  x: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
  y: Math.max(12, Math.min(y, window.innerHeight - height - 12)),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const sanitizeId = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : createSegmentId()

const sanitizeString = (value: unknown) =>
  typeof value === 'string' ? value : ''

const sanitizeMarkerOptions = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [createEmptyMarkerOption()]
  }

  const options = value.flatMap((option): MarkerOption[] => {
    if (typeof option === 'string') {
      return [{ title: '', value: option }]
    }

    if (!isRecord(option)) {
      return []
    }

    return [
      {
        title: sanitizeString(option.title),
        value: sanitizeString(option.value),
      },
    ]
  })

  return options.length ? options : [createEmptyMarkerOption()]
}

const sanitizeEditorSegment = (value: unknown): EditorSegment | null => {
  if (!isRecord(value)) {
    return null
  }

  const id = sanitizeId(value.id)

  if (value.type === 'text') {
    return {
      id,
      text: sanitizeString(value.text),
      type: 'text',
    }
  }

  if (value.type === 'variant') {
    const variantValue = sanitizeString(value.value)
    const options = Array.isArray(value.options)
      ? value.options.filter(
          (option): option is string => typeof option === 'string',
        )
      : []

    return {
      id,
      options: options.length ? options : [variantValue],
      type: 'variant',
      value: variantValue,
    }
  }

  if (value.type === 'number') {
    const numberValue = sanitizeString(value.value).trim()

    return numberValue
      ? {
          id,
          type: 'number',
          value: numberValue,
        }
      : null
  }

  if (value.type === 'marker') {
    const options = sanitizeMarkerOptions(value.options)
    const selectedOptionIndex =
      typeof value.selectedOptionIndex === 'number' &&
      Number.isInteger(value.selectedOptionIndex) &&
      value.selectedOptionIndex >= 0 &&
      value.selectedOptionIndex < options.length
        ? value.selectedOptionIndex
        : null

    return {
      id,
      options,
      selectedOptionIndex,
      title: sanitizeString(value.title),
      type: 'marker',
    }
  }

  return null
}

const sanitizeEditorContent = (value: unknown) =>
  compactContent(
    Array.isArray(value)
      ? value.flatMap((item) => {
          const segment = sanitizeEditorSegment(item)

          return segment ? [segment] : []
        })
      : [],
  )

const sanitizeTextRange = (value: unknown): TextRange => {
  if (!isRecord(value)) {
    return { start: 0, end: 0 }
  }

  const start =
    typeof value.start === 'number' && Number.isFinite(value.start)
      ? Math.max(0, value.start)
      : 0
  const end =
    typeof value.end === 'number' && Number.isFinite(value.end)
      ? Math.max(start, value.end)
      : start

  return { start, end }
}

const sanitizeFindingPair = (value: unknown): FindingPair | null => {
  if (!isRecord(value)) {
    return null
  }

  return {
    conclusion: sanitizeTextRange(value.conclusion),
    description: sanitizeTextRange(value.description),
    id:
      typeof value.id === 'number' && Number.isFinite(value.id)
        ? value.id
        : createPairId(),
  }
}

const sanitizeProtocolTemplate = (value: unknown): ProtocolTemplate | null => {
  if (!isRecord(value)) {
    return null
  }

  const now = getTimestamp()
  const name = sanitizeString(value.name).trim()

  return {
    conclusionContent: sanitizeEditorContent(value.conclusionContent),
    createdAt:
      typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
        ? value.createdAt
        : now,
    descriptionContent: ensureLeadingMarkerContent(
      sanitizeEditorContent(value.descriptionContent),
    ),
    findingPairs: Array.isArray(value.findingPairs)
      ? value.findingPairs.flatMap((item) => {
          const pair = sanitizeFindingPair(item)

          return pair ? [pair] : []
        })
      : [],
    id: typeof value.id === 'string' && value.id ? value.id : createTemplateId(),
    name: name || 'Без названия',
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : now,
  }
}

const sanitizePassportData = (value: unknown): PassportData => {
  const defaults = createDefaultPassportData()

  if (!isRecord(value)) {
    return defaults
  }

  const customFields = Array.isArray(value.customFields)
    ? value.customFields.flatMap((field) => {
        if (!isRecord(field)) {
          return []
        }

        const id = typeof field.id === 'string' && field.id ? field.id : ''
        const label = sanitizeString(field.label).trim()

        return id && label
          ? [
              {
                id,
                label,
                value: sanitizeString(field.value),
              },
            ]
          : []
      })
    : []

  return {
    birthDate: formatDateInputValue(sanitizeString(value.birthDate)),
    customFields,
    fullName: sanitizeString(value.fullName),
    sex:
      value.sex === 'male' || value.sex === 'female' ? value.sex : defaults.sex,
    studyDate:
      formatDateInputValue(sanitizeString(value.studyDate)) ||
      defaults.studyDate,
    studyTime: formatTimeInputValue(sanitizeString(value.studyTime)),
  }
}

const sanitizeOpenProtocolSession = (
  value: unknown,
): OpenProtocolSession | null => {
  if (!isRecord(value)) {
    return null
  }

  const id = typeof value.id === 'string' && value.id ? value.id : ''

  if (!id) {
    return null
  }

  return {
    changedConclusionRanges: Array.isArray(value.changedConclusionRanges)
      ? value.changedConclusionRanges.map(sanitizeTextRange)
      : [],
    changedDescriptionRanges: Array.isArray(value.changedDescriptionRanges)
      ? value.changedDescriptionRanges.map(sanitizeTextRange)
      : [],
    conclusionContent: sanitizeEditorContent(value.conclusionContent),
    currentTemplateId:
      typeof value.currentTemplateId === 'string'
        ? value.currentTemplateId
        : null,
    descriptionContent: ensureLeadingMarkerContent(
      sanitizeEditorContent(value.descriptionContent),
    ),
    findingPairs: Array.isArray(value.findingPairs)
      ? value.findingPairs.flatMap((item) => {
          const pair = sanitizeFindingPair(item)

          return pair ? [pair] : []
        })
      : [],
    hasLoadedTemplate: Boolean(value.hasLoadedTemplate),
    id,
    newDescriptionRanges: Array.isArray(value.newDescriptionRanges)
      ? value.newDescriptionRanges.map(sanitizeTextRange)
      : [],
    passportData: sanitizePassportData(value.passportData),
    templateName: sanitizeString(value.templateName).trim(),
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : getTimestamp(),
  }
}

const getProtocolTemplatesStorageKey = (userId?: string | null) =>
  userId ? getUserStorageKey(userId, userTemplatesStorageKey) : templatesStorageKey

const getSavedFindingsStorageKey = (userId: string) =>
  getUserStorageKey(userId, userSavedFindingsStorageKey)

const getFindingFoldersStorageKey = (userId: string) =>
  getUserStorageKey(userId, userFindingFoldersStorageKey)

const getProtocolExportSettingsStorageKey = (userId: string) =>
  getUserStorageKey(userId, userProtocolExportSettingsStorageKey)

const loadStoredTemplates = (
  storageKey = templatesStorageKey,
): ProtocolTemplate[] => {
  try {
    const storedValue = window.localStorage.getItem(storageKey)

    if (!storedValue) {
      return []
    }

    const parsedValue = JSON.parse(storedValue)

    return Array.isArray(parsedValue)
      ? parsedValue.flatMap((item) => {
          const template = sanitizeProtocolTemplate(item)

          return template ? [template] : []
        })
      : []
  } catch {
    return []
  }
}

const storeTemplates = (
  templates: ProtocolTemplate[],
  storageKey = templatesStorageKey,
) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(templates))
  } catch {
    // Storage can be unavailable in private modes; the editor should keep working.
  }
}

const createEmptyStartTemplateDraft = () => ({
  conclusion: '',
  description: '',
  name: '',
})

function App() {
  const workspaceRef = useRef<HTMLElement>(null)
  const descriptionRef = useRef<HTMLDivElement>(null)
  const conclusionRef = useRef<HTMLDivElement>(null)
  const pendingSelectionRef = useRef<PendingSelection | null>(null)
  const lastActiveEditorRef = useRef<FieldName | null>(null)
  const lastDescriptionSelectionRef = useRef<PendingSelection | null>(null)
  const activeIncompleteFindingRef = useRef<{
    field: FieldName
    range: TextRange
  } | null>(null)

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(
    loadCurrentUserProfile,
  )
  const [storageUserId, setStorageUserId] = useState<string | null>(null)
  const [authDraft, setAuthDraft] = useState(() => ({
    email: currentUser?.email ?? '',
    fullName: currentUser?.fullName ?? '',
  }))
  const [authError, setAuthError] = useState('')
  const [descriptionContent, setDescriptionContent] = useState<
    EditorSegment[]
  >(() => ensureLeadingMarkerContent([]))
  const [conclusionContent, setConclusionContent] = useState<EditorSegment[]>(
    [],
  )
  const [contextMenu, setContextMenu] = useState<SavedSelection | null>(null)
  const [markerMenu, setMarkerMenu] = useState<MarkerMenu | null>(null)
  const [markerContextMenu, setMarkerContextMenu] =
    useState<MarkerMenu | null>(null)
  const [passportData, setPassportData] = useState<PassportData>(
    createDefaultPassportData,
  )
  const [templateName, setTemplateName] = useState('')
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(
    null,
  )
  const [openProtocolSessions, setOpenProtocolSessions] = useState<
    OpenProtocolSession[]
  >([])
  const [activeProtocolSessionId, setActiveProtocolSessionId] = useState<
    string | null
  >(null)
  const [protocolSessionCloseId, setProtocolSessionCloseId] = useState<
    string | null
  >(null)
  const [templates, setTemplates] = useState<ProtocolTemplate[]>(() =>
    currentUser
      ? loadStoredTemplates(getProtocolTemplatesStorageKey(currentUser.id))
      : [],
  )
  const [hasOpenedProtocol, setHasOpenedProtocol] = useState(false)
  const [isStartCreateDialogOpen, setIsStartCreateDialogOpen] =
    useState(false)
  const [startTemplateDraft, setStartTemplateDraft] = useState(
    createEmptyStartTemplateDraft,
  )
  const [savedFindings, setSavedFindings] = useState<SavedFinding[]>(() =>
    currentUser ? loadStoredFindings(getSavedFindingsStorageKey(currentUser.id)) : [],
  )
  const [findingFolders, setFindingFolders] = useState<FindingFolder[]>(() =>
    currentUser
      ? loadStoredFindingFolders(getFindingFoldersStorageKey(currentUser.id))
      : [],
  )
  const [protocolExportSettings, setProtocolExportSettings] =
    useState<ProtocolExportSettings>(() =>
      loadProtocolExportSettings(
        currentUser
          ? getProtocolExportSettingsStorageKey(currentUser.id)
          : undefined,
      ),
    )
  const [protocolExportSettingsDraft, setProtocolExportSettingsDraft] =
    useState<ProtocolExportSettings>(protocolExportSettings)
  const [isProtocolExportSettingsOpen, setIsProtocolExportSettingsOpen] =
    useState(false)
  const [findingSaveDialog, setFindingSaveDialog] =
    useState<FindingSaveDialog | null>(null)
  const [isTemplatesDialogOpen, setIsTemplatesDialogOpen] = useState(false)
  const [templatesDialogMode, setTemplatesDialogMode] = useState<
    'browse' | 'save'
  >('browse')
  const [isFindingSearchOpen, setIsFindingSearchOpen] = useState(false)
  const [isFindingBrowserOpen, setIsFindingBrowserOpen] = useState(false)
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false)
  const [isUserSwitchConfirmOpen, setIsUserSwitchConfirmOpen] = useState(false)
  const [isPassportCollapsed, setIsPassportCollapsed] = useState(false)
  const [isPassportSettingsOpen, setIsPassportSettingsOpen] = useState(false)
  const [passportCustomFieldDraft, setPassportCustomFieldDraft] = useState<
    string | null
  >(null)
  const [sidePanelWidth, setSidePanelWidth] = useState(defaultSidePanelWidth)
  const [conclusionPanelHeight, setConclusionPanelHeight] = useState(
    defaultConclusionPanelHeight,
  )
  const [isProtocolDirectorySaveAvailable] = useState(() =>
    isProtocolDirectorySaveSupported(),
  )
  const [protocolDirectoryName, setProtocolDirectoryName] = useState<
    string | null
  >(null)
  const [protocolDirectoryStatus, setProtocolDirectoryStatus] = useState('')
  const [findingSearchQuery, setFindingSearchQuery] = useState('')
  const [findingSearchWarning, setFindingSearchWarning] = useState('')
  const [findingBrowserWarning, setFindingBrowserWarning] = useState('')
  const [activeMarker, setActiveMarker] = useState<ActiveMarker | null>(null)
  const [markerDialogId, setMarkerDialogId] = useState<number | null>(null)
  const [activeVariant, setActiveVariant] = useState<ActiveVariant | null>(null)
  const [activePairId, setActivePairId] = useState<number | null>(null)
  const [highlightedPairId, setHighlightedPairId] = useState<number | null>(null)
  const [activeCursorField, setActiveCursorField] = useState<FieldName | null>(
    null,
  )
  const [activeDescriptionFindingRange, setActiveDescriptionFindingRange] =
    useState<TextRange | null>(null)
  const [findingPairs, setFindingPairs] = useState<FindingPair[]>([])
  const [newDescriptionRanges, setNewDescriptionRanges] = useState<TextRange[]>(
    [],
  )
  const [hasLoadedTemplate, setHasLoadedTemplate] = useState(false)
  const [changedDescriptionRanges, setChangedDescriptionRanges] = useState<
    TextRange[]
  >([])
  const [changedConclusionRanges, setChangedConclusionRanges] = useState<
    TextRange[]
  >([])

  const descriptionText = useMemo(
    () => getContentText(descriptionContent),
    [descriptionContent],
  )
  const conclusionText = useMemo(
    () => getContentText(conclusionContent),
    [conclusionContent],
  )
  const protocolSessionTabs = useMemo(
    () =>
      openProtocolSessions.map((session) =>
        session.id === activeProtocolSessionId
          ? {
              ...session,
              currentTemplateId,
              passportData,
              templateName,
            }
          : session,
      ),
    [
      activeProtocolSessionId,
      currentTemplateId,
      openProtocolSessions,
      passportData,
      templateName,
    ],
  )
  const protocolSessionCloseTarget =
    protocolSessionTabs.find((session) => session.id === protocolSessionCloseId) ??
    null
  const descriptionFindingRanges = useMemo(
    () => getTrackedFindingRanges(descriptionText, newDescriptionRanges),
    [descriptionText, newDescriptionRanges],
  )
  const completedDescriptionFindingRanges = useMemo(
    () =>
      descriptionFindingRanges.filter((range) =>
        isCompletedConclusion(descriptionText, range),
      ),
    [descriptionFindingRanges, descriptionText],
  )
  const filteredSavedFindings = useMemo(() => {
    const query = normalizeSavedFindingText(findingSearchQuery)

    if (!query) {
      return savedFindings
    }

    return savedFindings.filter((finding) =>
      normalizeSavedFindingText(
        `${finding.name} ${finding.description} ${finding.conclusion}`,
      ).includes(query),
    )
  }, [findingSearchQuery, savedFindings])
  const activePair = useMemo(
    () => findingPairs.find((pair) => pair.id === activePairId) ?? null,
    [activePairId, findingPairs],
  )
  const passportCollapsedTitle = useMemo(
    () => getPassportCollapsedTitle(passportData, templateName),
    [passportData, templateName],
  )
  const protocolFileNameBlocks = useMemo(
    () => getProtocolFileNameBlocks(passportData),
    [passportData],
  )
  const selectedProtocolFileNameBlockKeys = useMemo(
    () =>
      getProtocolFileNameBlockKeys(
        protocolExportSettingsDraft.fileNameTemplate,
        protocolFileNameBlocks,
      ),
    [protocolExportSettingsDraft.fileNameTemplate, protocolFileNameBlocks],
  )
  const selectedProtocolFileNameBlocks = useMemo(
    () =>
      selectedProtocolFileNameBlockKeys.flatMap((key) => {
        const block = protocolFileNameBlocks.find((item) => item.key === key)

        return block ? [block] : []
      }),
    [protocolFileNameBlocks, selectedProtocolFileNameBlockKeys],
  )
  const availableProtocolFileNameBlocks = useMemo(
    () =>
      protocolFileNameBlocks.filter(
        (block) => !selectedProtocolFileNameBlockKeys.includes(block.key),
      ),
    [protocolFileNameBlocks, selectedProtocolFileNameBlockKeys],
  )
  const layoutStyle = useMemo(
    () =>
      ({
        '--conclusion-panel-height': `${conclusionPanelHeight}px`,
        '--side-panel-width': `${sidePanelWidth}px`,
      }) as CSSProperties,
    [conclusionPanelHeight, sidePanelWidth],
  )
  const highlightedPair = useMemo(
    () => findingPairs.find((pair) => pair.id === highlightedPairId) ?? null,
    [findingPairs, highlightedPairId],
  )

  const activeVariantSegment = useMemo(() => {
    if (!activeVariant) {
      return null
    }

    const content =
      activeVariant.field === 'description'
        ? descriptionContent
        : conclusionContent

    return (
      content.find(
        (segment): segment is VariantSegment =>
          segment.type === 'variant' && segment.id === activeVariant.id,
      ) ?? null
    )
  }, [activeVariant, conclusionContent, descriptionContent])

  const markerMenuSegment = useMemo(() => {
    if (!markerMenu) {
      return null
    }

    return (
      descriptionContent.find(
        (segment): segment is MarkerSegment =>
          segment.type === 'marker' && segment.id === markerMenu.id,
      ) ?? null
    )
  }, [descriptionContent, markerMenu])

  const markerContextMenuSegment = useMemo(() => {
    if (!markerContextMenu) {
      return null
    }

    return (
      descriptionContent.find(
        (segment): segment is MarkerSegment =>
          segment.type === 'marker' && segment.id === markerContextMenu.id,
      ) ?? null
    )
  }, [descriptionContent, markerContextMenu])

  const markerContextMenuRange = useMemo(() => {
    if (!markerContextMenu) {
      return null
    }

    return (
      getMarkerRanges(descriptionContent).find(
        (range) => range.id === markerContextMenu.id,
      ) ?? null
    )
  }, [descriptionContent, markerContextMenu])

  const markerDialogSegment = useMemo(() => {
    if (markerDialogId === null) {
      return null
    }

    return (
      descriptionContent.find(
        (segment): segment is MarkerSegment =>
          segment.type === 'marker' && segment.id === markerDialogId,
      ) ?? null
    )
  }, [descriptionContent, markerDialogId])

  const markerDialogBlock = useMemo(() => {
    if (markerDialogId === null) {
      return null
    }

    return getMarkerBlockInfo(descriptionContent, markerDialogId)
  }, [descriptionContent, markerDialogId])

  const descriptionHighlights = useMemo(() => {
    const highlights: HighlightRange[] = changedDescriptionRanges.flatMap(
      (range) => {
        const trimmedRange = trimRangeWhitespace(descriptionText, range)

        return trimmedRange
          ? [{ ...trimmedRange, className: 'protocol-change' }]
          : []
      },
    )

    if (highlightedPair) {
      highlights.push({
        ...highlightedPair.description,
        className: 'finding-active',
      })
    }

    return highlights
  }, [changedDescriptionRanges, descriptionText, highlightedPair])

  const descriptionHtml = useMemo(
    () =>
      contentToHtml(
        descriptionContent,
        descriptionHighlights,
        activeMarker?.id ?? null,
      ),
    [activeMarker, descriptionContent, descriptionHighlights],
  )

  const conclusionHighlights = useMemo(() => {
    const highlights: HighlightRange[] = changedConclusionRanges.flatMap(
      (range) => {
        const trimmedRange = trimRangeWhitespace(conclusionText, range)

        return trimmedRange
          ? [{ ...trimmedRange, className: 'protocol-change' }]
          : []
      },
    )

    if (
      highlightedPair &&
      highlightedPair.conclusion.end > highlightedPair.conclusion.start
    ) {
      highlights.push({
        ...highlightedPair.conclusion,
        className: 'finding-active',
      })
    }

    return highlights
  }, [changedConclusionRanges, conclusionText, highlightedPair])

  const conclusionHtml = useMemo(
    () => contentToHtml(conclusionContent, conclusionHighlights),
    [conclusionContent, conclusionHighlights],
  )

  const resetProtocolWorkspace = useCallback(() => {
    pendingSelectionRef.current = null
    lastActiveEditorRef.current = null
    lastDescriptionSelectionRef.current = null
    activeIncompleteFindingRef.current = null
    setDescriptionContent(ensureLeadingMarkerContent([]))
    setConclusionContent([])
    setContextMenu(null)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setMarkerDialogId(null)
    setPassportData(createDefaultPassportData())
    setTemplateName('')
    setCurrentTemplateId(null)
    setOpenProtocolSessions([])
    setActiveProtocolSessionId(null)
    setProtocolSessionCloseId(null)
    setHasOpenedProtocol(false)
    setIsStartCreateDialogOpen(false)
    setStartTemplateDraft(createEmptyStartTemplateDraft())
    setFindingSaveDialog(null)
    setIsTemplatesDialogOpen(false)
    setIsFindingSearchOpen(false)
    setIsFindingBrowserOpen(false)
    setIsProtocolExportSettingsOpen(false)
    setIsAppMenuOpen(false)
    setIsUserSwitchConfirmOpen(false)
    setIsPassportCollapsed(false)
    setIsPassportSettingsOpen(false)
    setPassportCustomFieldDraft(null)
    setFindingSearchQuery('')
    setFindingSearchWarning('')
    setFindingBrowserWarning('')
    setActiveMarker(null)
    setActiveVariant(null)
    setActivePairId(null)
    setHighlightedPairId(null)
    setActiveCursorField(null)
    setActiveDescriptionFindingRange(null)
    setFindingPairs([])
    setNewDescriptionRanges([])
    setHasLoadedTemplate(false)
    setChangedDescriptionRanges([])
    setChangedConclusionRanges([])
  }, [])

  useLayoutEffect(() => {
    const pendingSelection = pendingSelectionRef.current

    if (!pendingSelection) {
      return
    }

    const editor =
      pendingSelection.field === 'description'
        ? descriptionRef.current
        : conclusionRef.current

    if (editor) {
      const activeElement = document.activeElement
      const shouldKeepPanelFocus =
        !pendingSelection.focus &&
        activeElement &&
        activeElement !== document.body &&
        activeElement !== editor &&
        !editor.contains(activeElement)

      if (shouldKeepPanelFocus) {
        pendingSelectionRef.current = null
        return
      }

      if (pendingSelection.focus) {
        editor.focus()
      }

      const restoredRange = resolvePendingSelection(
        editor.textContent ?? '',
        pendingSelection,
      )
      const safeRestoredRange =
        pendingSelection.field === 'description'
          ? keepRangeAfterLeadingMarker(descriptionContent, restoredRange)
          : restoredRange

      restoreSelection(editor, safeRestoredRange.start, safeRestoredRange.end)
    }

    pendingSelectionRef.current = null
  }, [
    activeMarker,
    activeVariant,
    descriptionContent,
    conclusionContent,
    highlightedPair,
  ])

  useEffect(() => {
    let isMounted = true

    if (!isProtocolDirectorySaveAvailable) {
      return
    }

    void getStoredProtocolDirectory().then((directory) => {
      if (isMounted) {
        setProtocolDirectoryName(directory?.name ?? null)
      }
    })

    return () => {
      isMounted = false
    }
  }, [isProtocolDirectorySaveAvailable])

  useEffect(() => {
    if (!currentUser || storageUserId !== currentUser.id) {
      return
    }

    storeTemplates(templates, getProtocolTemplatesStorageKey(currentUser.id))
  }, [currentUser, storageUserId, templates])

  useEffect(() => {
    if (!currentUser || storageUserId !== currentUser.id) {
      return
    }

    storeSavedFindings(
      savedFindings,
      getSavedFindingsStorageKey(currentUser.id),
    )
  }, [currentUser, savedFindings, storageUserId])

  useEffect(() => {
    if (!currentUser || storageUserId !== currentUser.id) {
      return
    }

    storeFindingFolders(
      findingFolders,
      getFindingFoldersStorageKey(currentUser.id),
    )
  }, [currentUser, findingFolders, storageUserId])

  useEffect(() => {
    const closeFloatingPanels = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      const isAppMenuTarget = Boolean(
        target?.closest('.app-context-menu, .app-menu-button'),
      )
      const isFieldActionTarget = Boolean(
        target?.closest('.field-header-actions, .description-tool-rail'),
      )

      if (!isAppMenuTarget && !isFieldActionTarget) {
        setIsAppMenuOpen(false)
      }

      if (isAppMenuTarget || isFieldActionTarget) {
        setMarkerContextMenu(null)
      }

      if (
        isAppMenuTarget ||
        isFieldActionTarget ||
        target?.closest('.context-menu, .variant-popover')
      ) {
        return
      }

      setContextMenu(null)
      setActiveVariant(null)
      setMarkerMenu(null)
      setMarkerContextMenu(null)
    }

    document.addEventListener('mousedown', closeFloatingPanels)

    return () => document.removeEventListener('mousedown', closeFloatingPanels)
  }, [])

  const getEditor = (field: FieldName) =>
    field === 'description' ? descriptionRef.current : conclusionRef.current

  const getEditorSelection = (field: FieldName): SavedSelection | null => {
    const editor = getEditor(field)
    const selection = window.getSelection()

    if (
      !editor ||
      !selection ||
      selection.isCollapsed ||
      !isSelectionInside(editor, selection)
    ) {
      return null
    }

    const offsets = getSelectionOffsets(editor)

    if (!offsets || offsets.start === offsets.end || !offsets.text.trim()) {
      return null
    }

    return {
      field,
      start: offsets.start,
      end: offsets.end,
      text: offsets.text,
    }
  }

  const getActionSelection = (preferredField?: FieldName) => {
    const fields: FieldName[] = preferredField
      ? [preferredField]
      : ['description', 'conclusion']

    for (const field of fields) {
      const selection = getEditorSelection(field)

      if (selection) {
        return selection
      }
    }

    return contextMenu && (!preferredField || contextMenu.field === preferredField)
      ? contextMenu
      : null
  }

  const rememberActionSelection = (selection: SavedSelection) => {
    if (selection.start === selection.end || !selection.text.trim()) {
      setContextMenu(null)
      return
    }

    setContextMenu(selection)
  }

  const getCurrentContent = (field: FieldName) =>
    field === 'description' ? descriptionContent : conclusionContent

  const getFreshContent = (field: FieldName) => {
    const editor = getEditor(field)
    const content = getCurrentContent(field)

    const freshContent = editor ? parseEditorContent(editor, content) : content

    return field === 'description'
      ? ensureLeadingMarkerContent(freshContent)
      : freshContent
  }

  const upsertProtocolSession = (
    sessions: OpenProtocolSession[],
    session: OpenProtocolSession,
  ) =>
    sessions.some((item) => item.id === session.id)
      ? sessions.map((item) => (item.id === session.id ? session : item))
      : [...sessions, session]

  const createCurrentProtocolSession = (
    sessionId = activeProtocolSessionId ?? createProtocolSessionId(),
  ): OpenProtocolSession => ({
    id: sessionId,
    passportData: copyPassportData(passportData),
    templateName,
    currentTemplateId,
    descriptionContent: copyContent(getFreshContent('description')),
    conclusionContent: copyContent(getFreshContent('conclusion')),
    findingPairs: findingPairs.map(copyFindingPair),
    newDescriptionRanges: newDescriptionRanges.map(copyTextRange),
    changedDescriptionRanges: changedDescriptionRanges.map(copyTextRange),
    changedConclusionRanges: changedConclusionRanges.map(copyTextRange),
    hasLoadedTemplate,
    updatedAt: getTimestamp(),
  })

  const getProtocolSessionsForStorage = () => {
    const currentSession = hasOpenedProtocol
      ? createCurrentProtocolSession()
      : null
    const sessions = currentSession
      ? upsertProtocolSession(openProtocolSessions, currentSession)
      : openProtocolSessions

    return sessions.map(copyOpenProtocolSession)
  }

  const createUserDataSnapshot = (): UserDataSnapshot => {
    const sessions = getProtocolSessionsForStorage()

    return {
      activeProtocolSessionId:
        activeProtocolSessionId &&
        sessions.some((session) => session.id === activeProtocolSessionId)
          ? activeProtocolSessionId
          : null,
      findingFolders: findingFolders.map((folder) => ({ ...folder })),
      hasOpenedProtocol,
      openProtocolSessions: sessions,
      protocolExportSettings: { ...protocolExportSettings },
      savedFindings: savedFindings.map((finding) => ({ ...finding })),
      templates: templates.map((template) => ({
        ...template,
        conclusionContent: copyContent(template.conclusionContent),
        descriptionContent: copyContent(template.descriptionContent),
        findingPairs: template.findingPairs.map(copyFindingPair),
      })),
      updatedAt: getTimestamp(),
      version: 1,
    }
  }

  const applyUserDataSnapshot = (snapshot: UserDataSnapshot) => {
    const nextTemplates = snapshot.templates.flatMap((item) => {
      const template = sanitizeProtocolTemplate(item)

      return template ? [template] : []
    })
    const nextSavedFindings = snapshot.savedFindings.flatMap((item) => {
      const finding = sanitizeStoredFinding(item)

      return finding ? [finding] : []
    })
    const nextFindingFolders = normalizeFolderTree(
      snapshot.findingFolders.flatMap((item) => {
        const folder = sanitizeStoredFolder(item)

        return folder ? [folder] : []
      }),
    )
    const nextExportSettings = sanitizeProtocolExportSettings(
      snapshot.protocolExportSettings,
    )
    const nextSessions = snapshot.openProtocolSessions.flatMap((item) => {
      const session = sanitizeOpenProtocolSession(item)

      return session ? [session] : []
    })
    const activeSession =
      nextSessions.find(
        (session) => session.id === snapshot.activeProtocolSessionId,
      ) ??
      nextSessions[0] ??
      null

    setTemplates(nextTemplates)
    setSavedFindings(nextSavedFindings)
    setFindingFolders(nextFindingFolders)
    setProtocolExportSettings(nextExportSettings)
    setProtocolExportSettingsDraft(nextExportSettings)
    setOpenProtocolSessions(nextSessions)
    setProtocolSessionCloseId(null)

    if (snapshot.hasOpenedProtocol && activeSession) {
      applyProtocolSession(activeSession)
      return
    }

    setActiveProtocolSessionId(activeSession?.id ?? null)
    setHasOpenedProtocol(false)
  }

  const createUserDataSnapshotEvent = useEvent(createUserDataSnapshot)
  const applyUserDataSnapshotEvent = useEvent(applyUserDataSnapshot)

  useEffect(() => {
    if (!currentUser) {
      return
    }

    let isCancelled = false
    const userId = currentUser.id

    void loadUserDataSnapshot(userId).then((snapshot) => {
      if (isCancelled) {
        return
      }

      if (snapshot) {
        applyUserDataSnapshotEvent(snapshot)
      }

      setStorageUserId(userId)
    })

    return () => {
      isCancelled = true
    }
  }, [applyUserDataSnapshotEvent, currentUser])

  useEffect(() => {
    if (!currentUser || storageUserId !== currentUser.id) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void storeUserDataSnapshot(
        currentUser.id,
        createUserDataSnapshotEvent(),
      )
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [
    activeProtocolSessionId,
    changedConclusionRanges,
    changedDescriptionRanges,
    conclusionContent,
    createUserDataSnapshotEvent,
    currentTemplateId,
    currentUser,
    descriptionContent,
    findingFolders,
    findingPairs,
    hasLoadedTemplate,
    hasOpenedProtocol,
    newDescriptionRanges,
    openProtocolSessions,
    passportData,
    protocolExportSettings,
    savedFindings,
    storageUserId,
    templateName,
    templates,
  ])

  const saveCurrentProtocolSession = () => {
    if (!hasOpenedProtocol) {
      return activeProtocolSessionId
    }

    const session = createCurrentProtocolSession()

    setOpenProtocolSessions((sessions) =>
      upsertProtocolSession(sessions, session),
    )
    setActiveProtocolSessionId(session.id)

    return session.id
  }

  function applyProtocolSession(session: OpenProtocolSession) {
    syncSeedsFromProtocolContent(
      session.descriptionContent,
      session.conclusionContent,
      session.findingPairs,
    )
    pendingSelectionRef.current = null
    lastActiveEditorRef.current = null
    lastDescriptionSelectionRef.current = null
    activeIncompleteFindingRef.current = null
    setDescriptionContent(copyContent(session.descriptionContent))
    setConclusionContent(copyContent(session.conclusionContent))
    setPassportData(copyPassportData(session.passportData))
    setFindingPairs(session.findingPairs.map(copyFindingPair))
    setNewDescriptionRanges(session.newDescriptionRanges.map(copyTextRange))
    setChangedDescriptionRanges(
      session.changedDescriptionRanges.map(copyTextRange),
    )
    setChangedConclusionRanges(
      session.changedConclusionRanges.map(copyTextRange),
    )
    setHasLoadedTemplate(session.hasLoadedTemplate)
    setHasOpenedProtocol(true)
    setTemplateName(session.templateName)
    setCurrentTemplateId(session.currentTemplateId)
    setActiveProtocolSessionId(session.id)
    setContextMenu(null)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setMarkerDialogId(null)
    setFindingSaveDialog(null)
    setIsTemplatesDialogOpen(false)
    setIsFindingSearchOpen(false)
    setIsFindingBrowserOpen(false)
    setFindingSearchWarning('')
    setFindingBrowserWarning('')
    setActiveMarker(null)
    setActiveVariant(null)
    setActivePairId(null)
    setHighlightedPairId(null)
    setActiveCursorField(null)
    setActiveDescriptionFindingRange(null)
  }

  const switchProtocolSession = (sessionId: string) => {
    if (sessionId === activeProtocolSessionId && hasOpenedProtocol) {
      return
    }

    const nextSession = openProtocolSessions.find(
      (session) => session.id === sessionId,
    )

    if (!nextSession) {
      return
    }

    saveCurrentProtocolSession()
    applyProtocolSession(nextSession)
  }

  const requestCloseProtocolSession = (sessionId: string) => {
    setProtocolSessionCloseId(sessionId)
    setIsAppMenuOpen(false)
    setContextMenu(null)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setActiveVariant(null)
  }

  const cancelCloseProtocolSession = () => {
    setProtocolSessionCloseId(null)
  }

  const confirmCloseProtocolSession = () => {
    if (!protocolSessionCloseId) {
      return
    }

    const savedSessions =
      hasOpenedProtocol && activeProtocolSessionId
        ? upsertProtocolSession(
            openProtocolSessions,
            createCurrentProtocolSession(),
          )
        : openProtocolSessions
    const closedSessionIndex = savedSessions.findIndex(
      (session) => session.id === protocolSessionCloseId,
    )

    if (closedSessionIndex === -1) {
      setProtocolSessionCloseId(null)
      return
    }

    const remainingSessions = savedSessions.filter(
      (session) => session.id !== protocolSessionCloseId,
    )
    const isClosingActive = protocolSessionCloseId === activeProtocolSessionId
    const nextSession = isClosingActive
      ? (remainingSessions[
          Math.min(closedSessionIndex, remainingSessions.length - 1)
        ] ?? null)
      : null

    setProtocolSessionCloseId(null)
    setOpenProtocolSessions(remainingSessions)

    if (hasOpenedProtocol && nextSession) {
      applyProtocolSession(nextSession)
      return
    }

    if (isClosingActive) {
      setActiveProtocolSessionId(nextSession?.id ?? null)
    }

    if (hasOpenedProtocol && isClosingActive) {
      resetProtocolWorkspace()
    }
  }

  const rememberDescriptionSelection = (selection: TextRange, text: string) => {
    lastDescriptionSelectionRef.current = createPendingSelection(
      'description',
      {
        start: selection.end,
        end: selection.end,
      },
      text,
    )
  }

  const updatePassportValue = (
    field: Exclude<keyof PassportData, 'customFields'>,
    value: string,
  ) => {
    const formattedValue =
      field === 'birthDate' || field === 'studyDate'
        ? formatDateInputValue(value)
        : field === 'studyTime'
          ? formatTimeInputValue(value)
          : value

    setPassportData((currentData) => ({
      ...currentData,
      [field]: formattedValue,
    }))
  }

  const updatePassportSex = (sex: PatientSex) => {
    setPassportData((currentData) => ({
      ...currentData,
      sex: currentData.sex === sex ? '' : sex,
    }))
  }

  const addPassportCustomField = () => {
    setIsPassportCollapsed(false)
    setPassportCustomFieldDraft((draft) => draft ?? '')
  }

  const confirmPassportCustomField = () => {
    const label = passportCustomFieldDraft?.trim()

    if (!label) {
      return
    }

    const field: PassportCustomField = {
      id: createPassportFieldId(),
      label,
      value: '',
    }

    setPassportData((currentData) => ({
      ...currentData,
      customFields: [...currentData.customFields, field],
    }))
    setPassportCustomFieldDraft(null)
  }

  const deletePassportCustomField = (id: string) => {
    setPassportData((currentData) => ({
      ...currentData,
      customFields: currentData.customFields.filter(
        (customField) => customField.id !== id,
      ),
    }))
  }

  const updatePassportCustomField = (
    id: string,
    field: 'label' | 'value',
    value: string,
  ) => {
    setPassportData((currentData) => ({
      ...currentData,
      customFields: currentData.customFields.map((customField) =>
        customField.id === id
          ? { ...customField, [field]: value }
          : customField,
      ),
    }))
  }

  const trackManualTextChange = (
    field: FieldName,
    previousText: string,
    nextText: string,
  ) => {
    const change = getTextChange(previousText, nextText)

    if (!change) {
      return null
    }

    if (field === 'description') {
      setNewDescriptionRanges((ranges) =>
        trackTextChangeRange(ranges, change),
      )

      if (hasLoadedTemplate) {
        setChangedDescriptionRanges((ranges) =>
          trackTextChangeRange(ranges, change),
        )
      }
    } else if (hasLoadedTemplate) {
      setChangedConclusionRanges((ranges) =>
        trackTextChangeRange(ranges, change),
      )
    }

    return change
  }

  const findPairForDescription = (range: TextRange) =>
    findingPairs.find((pair) => isSameRange(pair.description, range)) ??
    getBestOverlappingPair(findingPairs, 'description', range)

  const getFindingSnapshot = (range: TextRange) => {
    const pair = findPairForDescription(range)
    const description = getFindingLabelText(getRangeText(descriptionText, range))
    const conclusion =
      pair && pair.conclusion.end > pair.conclusion.start
        ? getFindingLabelText(getRangeText(conclusionText, pair.conclusion))
        : ''

    return { pair, description, conclusion }
  }

  const clearHighlightedPairOutsideSelection = (
    field: FieldName,
    selection: TextRange,
    pairs = findingPairs,
  ) => {
    if (highlightedPairId === null) {
      return
    }

    const highlightedPair = pairs.find((pair) => pair.id === highlightedPairId)

    if (
      !highlightedPair ||
      !isOffsetInRange(getPairRange(highlightedPair, field), selection.end)
    ) {
      setHighlightedPairId(null)
    }
  }

  const openFindingSaveDialog = (range: TextRange) => {
    const { description, conclusion } = getFindingSnapshot(range)
    const existingFinding = findSavedFindingMatch(
      savedFindings,
      description,
      conclusion,
    )
    const defaultName =
      existingFinding?.name ?? getDefaultFindingName(description, conclusion)

    setFindingSaveDialog({
      existingId: existingFinding?.id ?? null,
      name: defaultName,
      description,
      conclusion,
    })
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant(null)
  }

  const closeFindingSaveDialog = () => {
    setFindingSaveDialog(null)
  }

  const saveExistingFinding = () => {
    if (!findingSaveDialog?.existingId) {
      return
    }

    const name = findingSaveDialog.name.trim()

    if (!name) {
      return
    }

    const now = getTimestamp()

    setSavedFindings((findings) =>
      findings.map((finding) =>
        finding.id === findingSaveDialog.existingId
          ? {
              ...finding,
              name,
              description: findingSaveDialog.description,
              conclusion: findingSaveDialog.conclusion,
              folderId: finding.folderId,
              updatedAt: now,
            }
          : finding,
      ),
    )
    setFindingSaveDialog(null)
  }

  const saveFindingAsNew = () => {
    if (!findingSaveDialog) {
      return
    }

    const name = findingSaveDialog.name.trim()

    if (!name) {
      return
    }

    const now = getTimestamp()

    setSavedFindings((findings) => [
      {
        id: createSavedFindingId(),
        name,
        description: findingSaveDialog.description,
        conclusion: findingSaveDialog.conclusion,
        folderId: null,
        createdAt: now,
        updatedAt: now,
      },
      ...findings,
    ])
    setFindingSaveDialog(null)
  }

  const openFindingSearch = () => {
    setFindingSearchQuery('')
    setFindingSearchWarning('')
    setIsFindingSearchOpen(true)
    setIsFindingBrowserOpen(false)
    setIsAppMenuOpen(false)
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant(null)
  }

  const openFindingBrowser = () => {
    setFindingBrowserWarning('')
    setIsFindingBrowserOpen(true)
    setIsFindingSearchOpen(false)
    setIsAppMenuOpen(false)
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant(null)
  }

  const createFindingFolder = (parentId: string | null) => {
    const now = getTimestamp()
    const hasParent = Boolean(
      parentId && findingFolders.some((folder) => folder.id === parentId),
    )

    setFindingFolders((folders) => [
      ...folders,
      {
        id: createFindingFolderId(),
        name: hasParent ? 'Новая подпапка' : 'Новая папка',
        parentId: hasParent ? parentId : null,
        createdAt: now,
        updatedAt: now,
      },
    ])
    setFindingBrowserWarning('')
  }

  const renameFindingFolder = (id: string, name: string) => {
    setFindingFolders((folders) =>
      folders.map((folder) =>
        folder.id === id
          ? { ...folder, name, updatedAt: getTimestamp() }
          : folder,
      ),
    )
  }

  const startBrowserDrag = (
    event: DragEvent<HTMLElement>,
    item: BrowserDragItem,
  ) => {
    const value = JSON.stringify(item)

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(browserDragDataType, value)
    event.dataTransfer.setData('text/plain', value)
  }

  const moveBrowserItem = (
    event: DragEvent<HTMLElement>,
    parentId: string | null,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const item = parseBrowserDragItem(event)
    const nextParentId =
      parentId && findingFolders.some((folder) => folder.id === parentId)
        ? parentId
        : null

    if (!item) {
      return
    }

    if (item.type === 'folder') {
      if (
        item.id === nextParentId ||
        isFolderNestedIn(findingFolders, item.id, nextParentId)
      ) {
        setFindingBrowserWarning('Папку нельзя переместить внутрь самой себя')
        return
      }

      setFindingFolders((folders) =>
        folders.map((folder) =>
          folder.id === item.id
            ? { ...folder, parentId: nextParentId, updatedAt: getTimestamp() }
            : folder,
        ),
      )
      setFindingBrowserWarning('')
      return
    }

    setSavedFindings((findings) =>
      findings.map((finding) =>
        finding.id === item.id
          ? { ...finding, folderId: nextParentId, updatedAt: getTimestamp() }
          : finding,
      ),
    )
    setFindingBrowserWarning('')
  }

  const insertSavedFindingFromSearch = (finding: SavedFinding) => {
    const editor = descriptionRef.current
    const textToInsert = (finding.description || finding.conclusion).trim()
    const conclusionToInsert = finding.conclusion.trim()

    if (
      !editor ||
      !textToInsert ||
      lastActiveEditorRef.current !== 'description' ||
      !lastDescriptionSelectionRef.current
    ) {
      setFindingSearchWarning('Выберите место для вставки в описании')
      return
    }

    const content = parseEditorContent(editor, descriptionContent)
    const text = getContentText(content)
    const selection = getSelectionOffsets(editor)
    const insertionSelection =
      selection && document.activeElement === editor
        ? createPendingSelection(
            'description',
            { start: selection.end, end: selection.end },
            text,
          )
        : lastDescriptionSelectionRef.current
    const resolvedSelection = resolvePendingSelection(text, insertionSelection)
    const offset = resolvedSelection.end
    const prefix = offset > 0 && !/\s/.test(text[offset - 1]) ? ' ' : ''
    const suffix = text[offset] && !/\s/.test(text[offset]) ? ' ' : ''
    const insertedText = `${prefix}${textToInsert}${suffix}`
    const insertedContent = [createTextSegment(insertedText)]
    const nextContent = insertContentAtOffset(content, offset, insertedContent)
    const nextText = getContentText(nextContent)
    const insertedRange = {
      start: offset + prefix.length,
      end: offset + prefix.length + textToInsert.length,
    }
    const conclusionEditor = conclusionRef.current
    const freshConclusionContent = conclusionEditor
      ? parseEditorContent(conclusionEditor, conclusionContent)
      : conclusionContent
    const appendConclusionResult = conclusionToInsert
      ? appendContent(freshConclusionContent, [
          createTextSegment(conclusionToInsert),
        ])
      : null
    const appendedConclusionRange =
      appendConclusionResult &&
      appendConclusionResult.range.end > appendConclusionResult.range.start
        ? appendConclusionResult.range
        : null
    const pairId = appendedConclusionRange ? createPairId() : null

    setDescriptionContent(ensureLeadingMarkerContent(nextContent))
    if (appendConclusionResult) {
      setConclusionContent(appendConclusionResult.content)
    }
    setFindingPairs((pairs) => {
      const adjustedPairs = adjustPairsForFieldEdit(
        pairs,
        'description',
        offset,
        insertedText.length,
        activePairId,
        nextText,
      )

      return pairId && appendedConclusionRange
        ? [
            ...adjustedPairs,
            {
              id: pairId,
              description: insertedRange,
              conclusion: appendedConclusionRange,
            },
          ]
        : adjustedPairs
    })
    setNewDescriptionRanges((ranges) =>
      mergeTextRanges([
        ...adjustTrackedRangesForEdit(ranges, offset, insertedText.length),
        insertedRange,
      ]),
    )

    if (hasLoadedTemplate && insertedRange.end > insertedRange.start) {
      setChangedDescriptionRanges((ranges) =>
        mergeTextRanges([
          ...adjustTrackedRangesForEdit(ranges, offset, insertedText.length),
          insertedRange,
        ]),
      )
    } else {
      setChangedDescriptionRanges((ranges) =>
        adjustTrackedRangesForEdit(ranges, offset, insertedText.length),
      )
    }

    if (
      hasLoadedTemplate &&
      appendedConclusionRange
    ) {
      setChangedConclusionRanges((ranges) =>
        mergeTextRanges([...ranges, appendedConclusionRange]),
      )
    }

    const nextOffset = offset + insertedText.length
    const nextSelection = createPendingSelection(
      'description',
      { start: nextOffset, end: nextOffset },
      nextText,
      true,
    )

    pendingSelectionRef.current = nextSelection
    lastDescriptionSelectionRef.current = nextSelection
    lastActiveEditorRef.current = 'description'
    setFindingSearchWarning('')
    setIsFindingSearchOpen(false)
  }

  const updateActiveFinding = (field: FieldName) => {
    const editor = getEditor(field)

    if (!editor) {
      return
    }

    const rawSelection = getSelectionOffsets(editor)

    if (!rawSelection) {
      setActiveCursorField(null)
      setActiveDescriptionFindingRange(null)
      return
    }

    let currentFieldContent = getCurrentContent(field)
    let selection =
      field === 'description'
        ? moveCollapsedSelectionAfterLeadingMarker(
            editor,
            currentFieldContent,
            rawSelection,
          )
        : rawSelection

    selection = completePreviousIncompleteFindingIfNeeded(field, selection)
    currentFieldContent = getFreshContent(field)
    const currentFieldText = getContentText(currentFieldContent)

    lastActiveEditorRef.current = field
    setActiveCursorField(field)

    if (selection.start === selection.end || !selection.text.trim()) {
      setContextMenu(null)
    } else {
      rememberActionSelection({ field, ...selection })
    }

    if (field === 'description') {
      rememberDescriptionSelection(
        selection,
        currentFieldText,
      )
    }
    setActiveDescriptionFindingRange(
      field === 'description'
        ? getTrackedFindingRangeAtOffset(
            currentFieldText,
            selection.end,
            newDescriptionRanges,
          )
        : null,
    )

    const pairAtCursor = findPairAtOffset(findingPairs, field, selection.end)

    if (pairAtCursor) {
      setActivePairId(pairAtCursor.id)
    } else if (
      !activePair ||
      !isOffsetInRange(getPairRange(activePair, field), selection.end)
    ) {
      setActivePairId(null)
    }

    clearHighlightedPairOutsideSelection(field, selection)

    const variantId = getVariantIdFromSelection(editor)
    setActiveVariant(variantId ? { field, id: variantId } : null)

    const markerId =
      field === 'description'
        ? getMarkerIdAtOffset(currentFieldContent, selection.end)
        : null

    if (
      field === 'description' &&
      (markerId ?? null) !== (activeMarker?.id ?? null) &&
      document.activeElement === editor
    ) {
      const safeSelection = keepRangeAfterLeadingMarker(currentFieldContent, {
        start: selection.start,
        end: selection.end,
      })

      pendingSelectionRef.current = createPendingSelection(
          'description',
          safeSelection,
          currentFieldText,
        )
    }

    setActiveMarker((current) =>
      current?.id === markerId ? current : markerId ? { id: markerId } : null,
    )
    rememberIncompleteFindingAtOffset(field, currentFieldText, selection.end)
  }

  const updateContent = (
    field: FieldName,
    updater: (content: EditorSegment[]) => EditorSegment[],
  ) => {
    if (field === 'description') {
      setDescriptionContent((content) =>
        ensureLeadingMarkerContent(updater(content)),
      )
      return
    }

    setConclusionContent(updater)
  }

  const rememberIncompleteFindingAtOffset = (
    field: FieldName,
    text: string,
    offset: number,
  ) => {
    const range = getFindingRangeAtOffset(text, offset)

    activeIncompleteFindingRef.current =
      range && !isCompletedConclusion(text, range) ? { field, range } : null
  }

  const adjustSelectionForCompletionChange = (
    selection: TextRange & { text: string },
    change: TextChange,
  ) => {
    const delta =
      change.nextRange.end -
      change.nextRange.start -
      (change.previousRange.end - change.previousRange.start)
    const adjustOffset = (offset: number) => {
      if (offset <= change.previousRange.start) {
        return offset
      }

      if (offset >= change.previousRange.end) {
        return offset + delta
      }

      return change.nextRange.end
    }

    return {
      ...selection,
      start: adjustOffset(selection.start),
      end: adjustOffset(selection.end),
    }
  }

  const completeIncompleteFindingRange = (
    field: FieldName,
    range: TextRange,
  ) => {
    const content = getFreshContent(field)
    const previousText = getContentText(content)
    const currentRange =
      getFindingRangeAtOffset(
        previousText,
        Math.max(0, Math.min(range.start, previousText.length - 1)),
      ) ?? range
    const completionEdit = getSentenceCompletionEdit(previousText, currentRange)

    if (!completionEdit) {
      return null
    }

    const nextContent = replaceRangeWithContent(
      content,
      completionEdit.previousRange.start,
      completionEdit.previousRange.end,
      [createTextSegment(completionEdit.text)],
    )
    const normalizedContent =
      field === 'description' ? ensureLeadingMarkerContent(nextContent) : nextContent
    const nextText = getContentText(normalizedContent)
    const change = trackManualTextChange(field, previousText, nextText)

    updateContent(field, () => normalizedContent)

    if (change) {
      const delta =
        change.nextRange.end -
        change.nextRange.start -
        (change.previousRange.end - change.previousRange.start)

      if (delta !== 0) {
        setFindingPairs((pairs) =>
          adjustPairsForFieldEdit(
            pairs,
            field,
            change.previousRange.start,
            delta,
            activePairId,
            nextText,
          ),
        )
      }
    }

    return change ? { change, nextContent: normalizedContent, nextText } : null
  }

  const adjustRangeForCompletionChange = (
    range: TextRange,
    change: TextChange,
  ) => {
    const delta =
      change.nextRange.end -
      change.nextRange.start -
      (change.previousRange.end - change.previousRange.start)

    if (delta === 0) {
      return range
    }

    const editStart = change.previousRange.start
    const start = range.start > editStart ? range.start + delta : range.start
    const end = range.end >= editStart ? range.end + delta : range.end

    return {
      start,
      end: Math.max(start, end),
    }
  }

  const completeActiveIncompleteFindingForAction = (
    targetDescriptionRange: TextRange,
  ) => {
    const previous = activeIncompleteFindingRef.current

    activeIncompleteFindingRef.current = null

    if (!previous) {
      return {
        completedConclusionContent: null,
        descriptionRange: targetDescriptionRange,
      }
    }

    const completion = completeIncompleteFindingRange(
      previous.field,
      previous.range,
    )

    return {
      completedConclusionContent:
        previous.field === 'conclusion' ? completion?.nextContent ?? null : null,
      descriptionRange:
        completion && previous.field === 'description'
          ? adjustRangeForCompletionChange(
              targetDescriptionRange,
              completion.change,
            )
          : targetDescriptionRange,
    }
  }

  const completePreviousIncompleteFindingIfNeeded = (
    field: FieldName,
    selection: TextRange & { text: string },
  ) => {
    const previous = activeIncompleteFindingRef.current

    if (
      !previous ||
      (previous.field === field && isOffsetInRange(previous.range, selection.end))
    ) {
      return selection
    }

    activeIncompleteFindingRef.current = null
    const completion = completeIncompleteFindingRange(previous.field, previous.range)

    if (!completion || previous.field !== field) {
      return selection
    }

    const nextSelection = adjustSelectionForCompletionChange(
      selection,
      completion.change,
    )

    pendingSelectionRef.current = createPendingSelection(
      field,
      nextSelection,
      completion.nextText,
      document.activeElement === getEditor(field),
    )

    return nextSelection
  }

  const insertSpaceAfterNumberToken = (
    field: FieldName,
    editor: HTMLElement,
    numberToken: HTMLElement,
  ) => {
    const numberRange = getElementTextRange(editor, numberToken)
    const currentContent = parseEditorContent(editor, getCurrentContent(field))
    const currentText = getContentText(currentContent)
    const nextChar = currentText[numberRange.end]

    if (nextChar === ' ') {
      restoreSelection(editor, numberRange.end + 1, numberRange.end + 1)
      return
    }

    const nextContent = insertContentAtOffset(currentContent, numberRange.end, [
      createTextSegment(' '),
    ])
    const normalizedContent =
      field === 'description' ? ensureLeadingMarkerContent(nextContent) : nextContent
    const nextText = getContentText(normalizedContent)
    const nextOffset = Math.min(numberRange.end + 1, nextText.length)

    updateContent(field, () => normalizedContent)
    pendingSelectionRef.current = createPendingSelection(
      field,
      { start: nextOffset, end: nextOffset },
      nextText,
      true,
    )
  }

  const getInteractiveItems = () => {
    const fields: FieldName[] = ['description', 'conclusion']

    return fields.flatMap((field) => {
      const editor = getEditor(field)

      if (!editor) {
        return []
      }

      return Array.from(
        editor.querySelectorAll<HTMLElement>('.variant-token, .number-token'),
      ).map((element) => ({
        editor,
        element,
        field,
        id: Number(
          element.classList.contains('variant-token')
            ? element.dataset.variantId
            : element.dataset.numberId,
        ),
        range: getElementTextRange(editor, element),
        type: element.classList.contains('variant-token')
          ? 'variant'
          : 'number',
      }))
    })
  }

  const getCurrentInteractiveIndex = (
    items: ReturnType<typeof getInteractiveItems>,
  ) => {
    const selection = window.getSelection()
    const focusNode = selection?.focusNode ?? null
    const anchorNode = selection?.anchorNode ?? null

    return items.findIndex((item) => {
      const focusToken = getInteractiveElementFromNode(item.editor, focusNode)
      const anchorToken = getInteractiveElementFromNode(item.editor, anchorNode)

      return focusToken === item.element || anchorToken === item.element
    })
  }

  const focusInteractiveItem = (
    item: ReturnType<typeof getInteractiveItems>[number],
  ) => {
    item.editor.focus()
    const range = selectElementText(item.editor, item.element)
    pendingSelectionRef.current = createPendingSelection(
      item.field,
      range,
      item.editor.textContent ?? '',
      true,
    )
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveMarker(null)

    if (item.type === 'variant' && !Number.isNaN(item.id)) {
      setActiveVariant({ field: item.field, id: item.id })
      return
    }

    setActiveVariant(null)
  }

  const moveInteractiveFocus = (direction: 1 | -1, preferredField: FieldName) => {
    const items = getInteractiveItems()

    if (!items.length) {
      return false
    }

    const currentIndex = getCurrentInteractiveIndex(items)
    let targetIndex =
      currentIndex === -1
        ? -1
        : (currentIndex + direction + items.length) % items.length

    if (targetIndex === -1) {
      const editor = getEditor(preferredField)
      const selection = editor ? getSelectionOffsets(editor) : null

      if (selection) {
        if (direction === 1) {
          targetIndex = items.findIndex(
            (item) =>
              item.field === preferredField &&
              item.range.start >= selection.end,
          )
        } else {
          for (let index = items.length - 1; index >= 0; index -= 1) {
            const item = items[index]

            if (
              item.field === preferredField &&
              item.range.end <= selection.start
            ) {
              targetIndex = index
              break
            }
          }
        }
      }
    }

    if (targetIndex === -1) {
      targetIndex = direction === 1 ? 0 : items.length - 1
    }

    focusInteractiveItem(items[targetIndex])
    return true
  }

  const handleEditorInput = (field: FieldName) => {
    const editor = getEditor(field)

    if (!editor) {
      return
    }

    const rawSelection = getSelectionOffsets(editor)
    const previousText =
      field === 'description' ? descriptionText : conclusionText
    const currentContent = getCurrentContent(field)
    const parsedEditorContent = parseEditorContent(editor, currentContent)
    const parsedContent =
      field === 'description'
        ? ensureLeadingMarkerContent(parsedEditorContent)
        : parsedEditorContent
    const selection = rawSelection
    const nextEditorText = getContentText(parsedContent)
    const parsedEditorText = getContentText(parsedEditorContent)
    const textChanged = nextEditorText !== previousText
    const contentNormalized =
      parsedEditorText !== nextEditorText ||
      getContentStructureSignature(currentContent) !==
        getContentStructureSignature(parsedContent)
    const textDelta = nextEditorText.length - previousText.length
    const editStart =
      selection && textDelta > 0
        ? Math.max(0, selection.end - textDelta)
        : selection?.end ?? 0
    const textChange = textChanged
      ? getTextChange(previousText, nextEditorText)
      : null
    const nextNewDescriptionRanges =
      field === 'description' && textChange
        ? trackTextChangeRange(newDescriptionRanges, textChange)
        : newDescriptionRanges

    lastActiveEditorRef.current = field
    setActiveCursorField(field)

    if (field === 'description' && rawSelection) {
      rememberDescriptionSelection(rawSelection, nextEditorText)
    }

    const pairAtEdit = selection
      ? findPairAtOffset(findingPairs, field, editStart)
      : null
    const pairIdForEdit = activePairId ?? pairAtEdit?.id ?? null
    const adjustedPairs =
      selection && textDelta !== 0
        ? adjustPairsForFieldEdit(
            findingPairs,
            field,
            editStart,
            textDelta,
            pairIdForEdit,
            nextEditorText,
          )
        : findingPairs
    const nextPairs = adjustedPairs

    const nextSelectionOffset = selection
      ? field === 'description'
        ? getDescriptionSelectionOffsetAfterNormalization(
            parsedEditorContent,
            parsedContent,
            selection,
          )
        : selection.end
      : null

    if (selection && nextSelectionOffset !== null && (textChanged || contentNormalized)) {
      pendingSelectionRef.current = createPendingSelection(
        field,
        {
          start: nextSelectionOffset,
          end: nextSelectionOffset,
        },
        nextEditorText,
      )
    }

    if (textChanged || contentNormalized) {
      updateContent(field, () => parsedContent)
    }

    if (nextPairs !== findingPairs) {
      setFindingPairs(nextPairs)
    }

    if (nextNewDescriptionRanges !== newDescriptionRanges) {
      setNewDescriptionRanges(nextNewDescriptionRanges)
    }

    if (textChange && hasLoadedTemplate) {
      if (field === 'description') {
        setChangedDescriptionRanges((ranges) =>
          trackTextChangeRange(ranges, textChange),
        )
      } else {
        setChangedConclusionRanges((ranges) =>
          trackTextChangeRange(ranges, textChange),
        )
      }
    }

    if (selection) {
      const pairAtCursor = findPairAtOffset(nextPairs, field, selection.end)
      setActivePairId(pairAtCursor?.id ?? null)
      clearHighlightedPairOutsideSelection(field, selection, nextPairs)
    }
    setActiveDescriptionFindingRange(
      field === 'description' && nextSelectionOffset !== null
        ? getTrackedFindingRangeAtOffset(
            nextEditorText,
            nextSelectionOffset,
            nextNewDescriptionRanges,
          )
        : null,
    )

    const variantId = getVariantIdFromSelection(editor)
    setActiveVariant(variantId ? { field, id: variantId } : null)

    const markerId =
      field === 'description' && selection
        ? getMarkerIdAtOffset(parsedContent, selection.end)
        : null
    setActiveMarker((current) =>
      current?.id === markerId ? current : markerId ? { id: markerId } : null,
    )

    if (selection && nextSelectionOffset !== null) {
      rememberIncompleteFindingAtOffset(field, nextEditorText, nextSelectionOffset)
    }
  }

  const handleEditorKeyDown = (
    field: FieldName,
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (field === 'description') {
      const editor = getEditor('description')
      const selection = editor ? getSelectionOffsets(editor) : null
      const leadingMarkerRange = getLeadingMarkerRange(descriptionContent)

      if (
        editor &&
        selection &&
        leadingMarkerRange &&
        selection.start === selection.end &&
        selection.start < leadingMarkerRange.end
      ) {
        moveCollapsedSelectionAfterLeadingMarker(
          editor,
          descriptionContent,
          selection,
        )
      }

      if (
        selection &&
        leadingMarkerRange &&
        selection.start === selection.end &&
        selection.start <= leadingMarkerRange.end &&
        (event.key === 'ArrowLeft' || event.key === 'Home')
      ) {
        event.preventDefault()
        if (editor) {
          restoreSelection(editor, leadingMarkerRange.end, leadingMarkerRange.end)
        }
        return
      }

      if (
        selection &&
        leadingMarkerRange &&
        selection.start === selection.end &&
        ((event.key === 'Backspace' &&
          selection.start <= leadingMarkerRange.end) ||
          (event.key === 'Delete' &&
            selection.start < leadingMarkerRange.end))
      ) {
        event.preventDefault()
        return
      }
    }

    const editor = getEditor(field)
    const selection = window.getSelection()
    const currentInteractiveToken = editor
      ? getInteractiveElementFromNode(editor, selection?.focusNode ?? null)
      : null
    const numberToken = editor
      ? getNumberElementFromNode(editor, selection?.focusNode ?? null)
      : null
    const isPlainTextKey =
      event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey

    if (numberToken && editor && event.key === ' ') {
      event.preventDefault()
      insertSpaceAfterNumberToken(field, editor, numberToken)
      return
    }

    if (numberToken && isPlainTextKey && !/[0-9.,]/.test(event.key)) {
      event.preventDefault()
      return
    }

    if (
      currentInteractiveToken &&
      (event.key === 'Enter' || event.key === 'Tab')
    ) {
      if (moveInteractiveFocus(event.key === 'Enter' ? 1 : -1, field)) {
        event.preventDefault()
        return
      }
    }

    const token = currentInteractiveToken?.classList.contains('variant-token')
      ? currentInteractiveToken
      : null

    if (token && (event.key === 'Enter' || event.key === ' ')) {
      const id = Number(token.dataset.variantId)

      if (!Number.isNaN(id)) {
        event.preventDefault()
        if (editor) {
          const range = selectElementText(editor, token)
          pendingSelectionRef.current = createPendingSelection(
            field,
            range,
            editor.textContent ?? '',
            true,
          )
        }
        openVariantPanel(field, id)
      }

      return
    }

    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    document.execCommand('insertText', false, '\n')
  }

  const handleEditorPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    document.execCommand(
      'insertText',
      false,
      event.clipboardData.getData('text/plain'),
    )
  }

  const openContextMenu = (
    field: FieldName,
    event: MouseEvent<HTMLDivElement>,
  ) => {
    const editor = getEditor(field)
    const target = event.target as HTMLElement | null
    const marker =
      field === 'description'
        ? target?.closest<HTMLElement>('.section-marker-token')
        : null

    if (!editor) {
      return
    }

    event.preventDefault()

    if (marker && editor.contains(marker)) {
      const id = Number(marker.dataset.markerId)
      const markerSegment = descriptionContent.find(
        (segment): segment is MarkerSegment =>
          segment.type === 'marker' && segment.id === id,
      )

      if (!Number.isNaN(id) && markerSegment) {
        setActiveMarker({ id })
        setActiveVariant(null)
        setContextMenu(null)
        setMarkerMenu(null)
        setMarkerContextMenu({
          id,
          ...getSafePosition(event.clientX, event.clientY, 240, 88),
        })
      }

      return
    }

    const selection = window.getSelection()
    const hasSelection = Boolean(
      selection && !selection.isCollapsed && isSelectionInside(editor, selection),
    )
    const editorText = editor.textContent ?? ''
    let offsets = hasSelection ? getSelectionOffsets(editor) : null

    if (!offsets) {
      const clickedOffset = getOffsetFromPoint(editor, event.clientX, event.clientY)
      const wordRange =
        clickedOffset === null
          ? null
          : getWordRangeAtOffset(editorText, clickedOffset)

      if (!wordRange) {
        setContextMenu(null)
        return
      }

      restoreSelection(editor, wordRange.start, wordRange.end)
      offsets = {
        ...wordRange,
        text: editorText.slice(wordRange.start, wordRange.end),
      }
    }

    if (offsets.start === offsets.end || !offsets.text.trim()) {
      setContextMenu(null)
      return
    }

    rememberActionSelection({ field, ...offsets })
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setActiveVariant(null)
  }

  const createVariantFromSelection = () => {
    const actionSelection = getActionSelection()

    if (!actionSelection) {
      return
    }

    const trimmedSelection = getTrimmedSelectionRange(actionSelection)
    const editor = getEditor(actionSelection.field)
    const contentText = getContentText(getFreshContent(actionSelection.field))
    const sentenceRange =
      trimmedSelection
        ? actionSelection.field === 'description'
          ? getTrackedFindingRangeAtOffset(
              contentText,
              trimmedSelection.start,
              newDescriptionRanges,
            )
          : getSentenceRangeAtOffset(contentText, trimmedSelection.start)
        : null

    if (!trimmedSelection) {
      return
    }

    const variant: VariantSegment = {
      id: createSegmentId(),
      type: 'variant',
      value: trimmedSelection.text,
      options: [trimmedSelection.text],
    }

    updateContent(actionSelection.field, (content) =>
      replaceRangeWithVariant(
        editor ? parseEditorContent(editor, content) : content,
        trimmedSelection.start,
        trimmedSelection.end,
        variant,
      ),
    )
    if (sentenceRange && actionSelection.field === 'description') {
      const existingPair = findPairForDescription(sentenceRange)

      if (existingPair) {
        setFindingPairs((pairs) =>
          pairs.map((pair) =>
            pair.id === existingPair.id
              ? { ...pair, description: sentenceRange }
              : pair,
          ),
        )
        setActivePairId(existingPair.id)
      }

    } else if (sentenceRange && actionSelection.field === 'conclusion') {
      const pairAtSentence = findPairAtOffset(
        findingPairs,
        'conclusion',
        trimmedSelection.start,
      ) ?? getBestOverlappingPair(findingPairs, 'conclusion', sentenceRange)

      if (pairAtSentence) {
        setFindingPairs((pairs) =>
          pairs.map((pair) =>
            pair.id === pairAtSentence.id
              ? { ...pair, conclusion: sentenceRange }
              : pair,
          ),
        )
        setActivePairId(pairAtSentence.id)
      }

    }
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant({
      field: actionSelection.field,
      id: variant.id,
    })
  }

  const copySelectionToConclusion = () => {
    const actionSelection = getActionSelection('description')

    if (!actionSelection) {
      return
    }

    const sourceContent = getFreshContent(actionSelection.field)
    const copiedContent = sliceContentRange(
      sourceContent,
      actionSelection.start,
      actionSelection.end,
    )

    if (!getContentText(copiedContent).trim()) {
      return
    }

    const sourceText = getContentText(sourceContent)
    const sourceFindingRange =
      getTrackedFindingRangeAtOffset(
        sourceText,
        actionSelection.start,
        newDescriptionRanges,
      ) ??
      {
        start: actionSelection.start,
        end: actionSelection.end,
      }
    const existingPair = findPairForDescription(sourceFindingRange)
    const existingConclusionText = existingPair
      ? getRangeText(conclusionText, existingPair.conclusion).trim()
      : ''

    if (existingPair && existingConclusionText) {
      setActivePairId(existingPair.id)
      setContextMenu(null)
      setActiveVariant(null)
      return
    }

    const conclusionEditor = getEditor('conclusion')
    const freshConclusionContent = conclusionEditor
      ? parseEditorContent(conclusionEditor, conclusionContent)
      : conclusionContent
    const appendResult = appendContent(freshConclusionContent, copiedContent)
    const pairId = existingPair?.id ?? createPairId()

    setConclusionContent(appendResult.content)
    if (hasLoadedTemplate && appendResult.range.end > appendResult.range.start) {
      setChangedConclusionRanges((ranges) =>
        mergeTextRanges([...ranges, appendResult.range]),
      )
    }
    setFindingPairs((pairs) =>
      existingPair
        ? pairs.map((pair) =>
            pair.id === existingPair.id
              ? {
                  ...pair,
                  description: sourceFindingRange,
                  conclusion: appendResult.range,
                }
              : pair,
          )
        : [
            ...pairs,
            {
              id: pairId,
              description: sourceFindingRange,
              conclusion: appendResult.range,
            },
          ],
    )
    setActivePairId(pairId)
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant(null)
  }

  const activateFindingCapsule = (range: TextRange) => {
    const { completedConclusionContent, descriptionRange } =
      completeActiveIncompleteFindingForAction(range)
    const pair = findPairForDescription(descriptionRange)
    const pairConclusionText = pair
      ? getRangeText(conclusionText, pair.conclusion).trim()
      : ''

    if (pair && pairConclusionText) {
      setActivePairId(pair.id)
      setHighlightedPairId(pair.id)
      setContextMenu(null)
      setActiveVariant(null)
      return
    }

    const conclusionEditor = getEditor('conclusion')
    const freshConclusionContent =
      completedConclusionContent ??
      (conclusionEditor
        ? parseEditorContent(conclusionEditor, conclusionContent)
        : conclusionContent)
    const freshConclusionText = getContentText(freshConclusionContent)
    const separator =
      freshConclusionText && !/\s$/.test(freshConclusionText)
        ? createTextSegment(' ')
        : null
    const insertionStart = freshConclusionText.length + (separator ? 1 : 0)
    const nextPairId = pair?.id ?? createPairId()

    setConclusionContent(
      separator
        ? compactContent([...freshConclusionContent, separator])
        : freshConclusionContent,
    )
    setFindingPairs((pairs) =>
      pair
        ? pairs.map((item) =>
            item.id === pair.id
              ? {
                  ...item,
                  description: descriptionRange,
                  conclusion: { start: insertionStart, end: insertionStart },
                }
              : item,
          )
        : [
            ...pairs,
            {
              id: nextPairId,
              description: descriptionRange,
              conclusion: { start: insertionStart, end: insertionStart },
            },
          ],
    )
    setActivePairId(nextPairId)
    setHighlightedPairId(nextPairId)
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant(null)
    pendingSelectionRef.current = createPendingSelection(
      'conclusion',
      {
        start: insertionStart,
        end: insertionStart,
      },
      freshConclusionText + (separator ? ' ' : ''),
      true,
    )
  }

  const openVariantPanel = (field: FieldName, id: number) => {
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveMarker(null)
    setActiveVariant({
      field,
      id,
    })
  }

  const handleEditorClick = (
    field: FieldName,
    event: MouseEvent<HTMLDivElement>,
  ) => {
    const editor = getEditor(field)
    const target = event.target as HTMLElement | null
    const marker = target?.closest<HTMLElement>('.section-marker-token')
    const token = target?.closest<HTMLElement>('.variant-token')
    const numberToken = target?.closest<HTMLElement>('.number-token')

    if (!editor) {
      return
    }

    if (field === 'description' && marker && editor.contains(marker)) {
      const id = Number(marker.dataset.markerId)
      const markerSegment = descriptionContent.find(
        (segment): segment is MarkerSegment =>
          segment.type === 'marker' && segment.id === id,
      )

      if (!Number.isNaN(id) && markerSegment) {
        setActiveMarker({ id })
        setActiveVariant(null)
        setContextMenu(null)
        setMarkerContextMenu(null)
        setMarkerMenu({
          id,
          ...getSafePosition(
            event.clientX,
            event.clientY,
            260,
            Math.min(320, Math.max(1, markerSegment.options.length) * 40 + 12),
          ),
        })
      }

      return
    }

    const selection = window.getSelection()

    if (selection && !selection.isCollapsed && isSelectionInside(editor, selection)) {
      return
    }

    if (numberToken && editor.contains(numberToken)) {
      editor.focus()
      const range = selectElementText(editor, numberToken)
      pendingSelectionRef.current = createPendingSelection(
        field,
        range,
        editor.textContent ?? '',
        true,
      )
      setActiveVariant(null)
      setActiveMarker(null)
      setContextMenu(null)
      setMarkerMenu(null)
      return
    }

    if (!token || !editor.contains(token)) {
      if (field === 'description') {
        window.requestAnimationFrame(() => updateActiveFinding('description'))
      }

      return
    }

    const id = Number(token.dataset.variantId)

    if (Number.isNaN(id)) {
      return
    }

    const range = selectElementText(editor, token)
    pendingSelectionRef.current = createPendingSelection(
      field,
      range,
      editor.textContent ?? '',
      true,
    )
    openVariantPanel(field, id)
    setActiveMarker(null)
  }

  const updateVariant = (
    field: FieldName,
    id: number,
    updater: (variant: VariantSegment) => VariantSegment,
    trackChange = false,
  ) => {
    const content = getFreshContent(field)
    const previousText = getContentText(content)
    const nextContent = content.map((segment) =>
      segment.type === 'variant' && segment.id === id
        ? updater(segment)
        : segment,
    )
    const nextText = getContentText(nextContent)
    const change = getTextChange(previousText, nextText)

    if (trackChange && change) {
      trackManualTextChange(field, previousText, nextText)
    }

    if (change) {
      const delta =
        change.nextRange.end -
        change.nextRange.start -
        (change.previousRange.end - change.previousRange.start)

      if (delta !== 0) {
        setFindingPairs((pairs) =>
          adjustPairsForFieldEdit(
            pairs,
            field,
            change.previousRange.start,
            delta,
            activePairId,
            nextText,
          ),
        )
      }
    }

    updateContent(field, () => nextContent)
  }

  const chooseVariantOption = (index: number) => {
    if (!activeVariant) {
      return
    }

    updateVariant(
      activeVariant.field,
      activeVariant.id,
      (variant) => ({
        ...variant,
        value: variant.options[index] ?? variant.value,
      }),
      true,
    )
  }

  const changeVariantOption = (index: number, value: string) => {
    if (!activeVariant) {
      return
    }

    updateVariant(
      activeVariant.field,
      activeVariant.id,
      (variant) => {
        const isSelectedOption = variant.options[index] === variant.value
        const options = variant.options.map((option, optionIndex) =>
          optionIndex === index ? value : option,
        )

        return {
          ...variant,
          options,
          value: isSelectedOption ? value : variant.value,
        }
      },
      true,
    )
  }

  const addVariantOption = () => {
    if (!activeVariant) {
      return
    }

    updateVariant(activeVariant.field, activeVariant.id, (variant) => ({
      ...variant,
      options: variant.options.includes('')
        ? variant.options
        : [...variant.options, ''],
    }))
  }

  const insertSectionMarker = () => {
    const editor = getEditor('description')
    const content = getFreshContent('description')
    const text = getContentText(content)
    const selection = editor ? getSelectionOffsets(editor) : null
    const offset = selection?.end ?? text.length
    const marker = createMarkerSegment()
    const prefix = offset > 0 && text[offset - 1] !== '\n' ? '\n' : ''
    const insertedContent: EditorSegment[] = prefix
      ? [createTextSegment(prefix), marker]
      : [marker]
    const insertedLength = prefix.length + markerText.length
    const nextContent = insertContentAtOffset(content, offset, insertedContent)
    const nextText = getContentText(nextContent)
    const nextOffset = offset + insertedLength

    setDescriptionContent(ensureLeadingMarkerContent(nextContent))
    setFindingPairs((pairs) =>
      adjustPairsForFieldEdit(
        pairs,
        'description',
        offset,
        insertedLength,
        activePairId,
        nextText,
      ),
    )
    setNewDescriptionRanges((ranges) =>
      adjustTrackedRangesForEdit(ranges, offset, insertedLength),
    )
    setChangedDescriptionRanges((ranges) =>
      adjustTrackedRangesForEdit(ranges, offset, insertedLength),
    )
    setActiveMarker({ id: marker.id })
    setActiveVariant(null)
    setContextMenu(null)
    pendingSelectionRef.current = createPendingSelection(
      'description',
      {
        start: nextOffset,
        end: nextOffset,
      },
      nextText,
      true,
    )
  }

  const replaceMarkerBlock = (
    id: number,
    value: string,
    selectedOptionIndex?: number | null,
  ) => {
    const content = descriptionContent
    const blockInfo = getMarkerBlockInfo(content, id)

    if (!blockInfo) {
      return
    }

    const replacementText =
      blockInfo.hasNextMarker && !value.endsWith('\n') ? `${value}\n` : value
    const nextContent = replaceRangeWithContent(
      content,
      blockInfo.blockStart,
      blockInfo.blockEnd,
      replacementText ? [createTextSegment(replacementText)] : [],
    ).map((segment) =>
      segment.type === 'marker' &&
      segment.id === id &&
      selectedOptionIndex !== undefined
        ? { ...segment, selectedOptionIndex }
        : segment,
    )
    const nextText = getContentText(nextContent)
    const editDelta =
      replacementText.length - (blockInfo.blockEnd - blockInfo.blockStart)
    const replacedRange = {
      start: blockInfo.blockStart,
      end: blockInfo.blockEnd,
    }

    pendingSelectionRef.current = null
    setDescriptionContent(ensureLeadingMarkerContent(nextContent))
    setNewDescriptionRanges((ranges) =>
      adjustTrackedRangesForEdit(
        ranges.filter(
          (range) => getRangeOverlap(range, replacedRange) === 0,
        ),
        blockInfo.blockStart,
        editDelta,
      ),
    )
    setChangedDescriptionRanges((ranges) =>
      adjustTrackedRangesForEdit(
        ranges.filter(
          (range) => getRangeOverlap(range, replacedRange) === 0,
        ),
        blockInfo.blockStart,
        editDelta,
      ),
    )
    setFindingPairs((pairs) => {
      const survivingPairs = pairs.filter(
        (pair) => getRangeOverlap(pair.description, replacedRange) === 0,
      )

      return editDelta
        ? adjustPairsForFieldEdit(
            survivingPairs,
            'description',
            blockInfo.blockStart,
            editDelta,
            null,
            nextText,
          )
        : survivingPairs
    })
  }

  const updateMarkerOptions = (
    id: number,
    updater: (options: MarkerOption[]) => MarkerOption[],
  ) => {
    setDescriptionContent((content) =>
      ensureLeadingMarkerContent(
        content.map((segment) =>
          segment.type === 'marker' && segment.id === id
            ? {
                ...segment,
                options: updater(
                  segment.options.length
                    ? segment.options.map((option) => ({ ...option }))
                    : [createEmptyMarkerOption()],
                ),
              }
            : segment,
        ),
      ),
    )
  }

  const changeMarkerTitle = (id: number, title: string) => {
    setDescriptionContent((content) =>
      ensureLeadingMarkerContent(
        content.map((segment) =>
          segment.type === 'marker' && segment.id === id
            ? { ...segment, title }
            : segment,
        ),
      ),
    )
  }

  const changeMarkerOptionTitle = (
    markerId: number,
    index: number,
    title: string,
  ) => {
    updateMarkerOptions(markerId, (options) =>
      options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, title } : option,
      ),
    )
  }

  const changeMarkerOptionValue = (
    markerId: number,
    index: number,
    value: string,
  ) => {
    updateMarkerOptions(markerId, (options) =>
      options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, value } : option,
      ),
    )
  }

  const addMarkerOption = (markerId: number) => {
    updateMarkerOptions(markerId, (options) => [
      ...options,
      createEmptyMarkerOption(),
    ])
  }

  const openMarkerDialog = (id: number) => {
    setActiveMarker({ id })
    setMarkerDialogId(id)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setContextMenu(null)
    setActiveVariant(null)
  }

  const closeMarkerDialog = () => {
    setMarkerDialogId(null)
  }

  const deleteSectionMarker = (id: number) => {
    const content = getFreshContent('description')
    const markerRange =
      getMarkerRanges(content).find((range) => range.id === id) ?? null

    if (!markerRange || markerRange.start === 0) {
      return
    }

    const nextContent = ensureLeadingMarkerContent(
      removeRangeFromContent(content, markerRange.start, markerRange.end),
    )
    const nextText = getContentText(nextContent)
    const delta = markerRange.start - markerRange.end
    const nextSelection = createPendingSelection(
      'description',
      {
        start: markerRange.start,
        end: markerRange.start,
      },
      nextText,
      true,
    )

    setDescriptionContent(nextContent)
    setFindingPairs((pairs) =>
      adjustPairsForFieldEdit(
        pairs,
        'description',
        markerRange.start,
        delta,
        activePairId,
        nextText,
      ),
    )
    setNewDescriptionRanges((ranges) =>
      adjustTrackedRangesForEdit(ranges, markerRange.start, delta),
    )
    setChangedDescriptionRanges((ranges) =>
      adjustTrackedRangesForEdit(ranges, markerRange.start, delta),
    )
    setActiveMarker((current) => (current?.id === id ? null : current))
    setMarkerDialogId((current) => (current === id ? null : current))
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setContextMenu(null)
    pendingSelectionRef.current = nextSelection
    lastDescriptionSelectionRef.current = nextSelection
    lastActiveEditorRef.current = 'description'
  }

  const applyMarkerOption = (markerId: number, index: number) => {
    const markerSegment = descriptionContent.find(
      (segment): segment is MarkerSegment =>
        segment.type === 'marker' && segment.id === markerId,
    )

    if (!markerSegment) {
      return
    }

    replaceMarkerBlock(
      markerId,
      markerSegment.options[index]?.value ?? '',
      index,
    )
    setActiveMarker({ id: markerId })
    setMarkerMenu(null)
    setMarkerContextMenu(null)
  }

  const saveProtocolTemplate = (nameValue = templateName, templateId?: string) => {
    const name = nameValue.trim()

    if (!name) {
      return
    }

    const now = getTimestamp()
    const templateToUpdate = templateId
      ? templates.find((template) => template.id === templateId) ?? null
      : null
    const nextTemplateId = templateToUpdate?.id ?? createTemplateId()
    const freshDescriptionContent = getFreshContent('description')
    const freshConclusionContent = getFreshContent('conclusion')

    setTemplates((currentTemplates) => {
      const existingTemplate = templateId
        ? currentTemplates.find((template) => template.id === templateId)
        : null
      const nextTemplate: ProtocolTemplate = {
        id: existingTemplate?.id ?? nextTemplateId,
        name,
        createdAt: existingTemplate?.createdAt ?? now,
        updatedAt: now,
        descriptionContent: copyContent(freshDescriptionContent),
        conclusionContent: copyContent(freshConclusionContent),
        findingPairs: [],
      }

      return existingTemplate
        ? [
            nextTemplate,
            ...currentTemplates.filter(
              (template) => template.id !== existingTemplate.id,
            ),
          ]
        : [nextTemplate, ...currentTemplates]
    })
    setTemplateName(name)
    setCurrentTemplateId(nextTemplateId)
  }

  const loadProtocolTemplate = (
    template: ProtocolTemplate,
    options: { createSession?: boolean; resetPassport?: boolean } = {},
  ) => {
    if (options.createSession) {
      saveCurrentProtocolSession()
    }

    syncSeedsFromTemplate(template)
    const loadedDescriptionContent = ensureLeadingMarkerContent(
      completeFinalFindingInContent(copyContent(template.descriptionContent)),
    )
    const loadedConclusionContent = completeFinalFindingInContent(
      copyContent(template.conclusionContent),
    )
    const nextPassportData = options.resetPassport
      ? createDefaultPassportData()
      : copyPassportData(passportData)
    const nextSessionId =
      options.createSession || options.resetPassport || !activeProtocolSessionId
        ? createProtocolSessionId()
        : activeProtocolSessionId
    const nextSession: OpenProtocolSession = {
      id: nextSessionId,
      passportData: copyPassportData(nextPassportData),
      templateName: template.name,
      currentTemplateId: template.id,
      descriptionContent: copyContent(loadedDescriptionContent),
      conclusionContent: copyContent(loadedConclusionContent),
      findingPairs: [],
      newDescriptionRanges: [],
      changedDescriptionRanges: [],
      changedConclusionRanges: [],
      hasLoadedTemplate: true,
      updatedAt: getTimestamp(),
    }

    pendingSelectionRef.current = null
    lastActiveEditorRef.current = null
    lastDescriptionSelectionRef.current = null
    activeIncompleteFindingRef.current = null
    setDescriptionContent(loadedDescriptionContent)
    setConclusionContent(loadedConclusionContent)
    setFindingPairs([])
    setNewDescriptionRanges([])
    setChangedDescriptionRanges([])
    setChangedConclusionRanges([])
    setPassportData(nextPassportData)
    setOpenProtocolSessions((sessions) =>
      upsertProtocolSession(sessions, nextSession),
    )
    setActiveProtocolSessionId(nextSessionId)
    setHasLoadedTemplate(true)
    setHasOpenedProtocol(true)
    setTemplateName(template.name)
    setCurrentTemplateId(template.id)
    setContextMenu(null)
    setMarkerMenu(null)
    setMarkerDialogId(null)
    setFindingSaveDialog(null)
    setIsTemplatesDialogOpen(false)
    setIsFindingSearchOpen(false)
    setIsFindingBrowserOpen(false)
    setFindingSearchWarning('')
    setFindingBrowserWarning('')
    setActiveMarker(null)
    setActiveVariant(null)
    setActivePairId(null)
    setHighlightedPairId(null)
    setActiveCursorField(null)
    setActiveDescriptionFindingRange(null)
  }

  const openStartScreenForNewProtocol = () => {
    saveCurrentProtocolSession()
    pendingSelectionRef.current = null
    lastActiveEditorRef.current = null
    lastDescriptionSelectionRef.current = null
    activeIncompleteFindingRef.current = null
    setHasOpenedProtocol(false)
    setIsStartCreateDialogOpen(false)
    setStartTemplateDraft(createEmptyStartTemplateDraft())
    setIsAppMenuOpen(false)
    setContextMenu(null)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setFindingSaveDialog(null)
    setIsTemplatesDialogOpen(false)
    setIsFindingSearchOpen(false)
    setIsFindingBrowserOpen(false)
    setIsProtocolExportSettingsOpen(false)
    setIsPassportSettingsOpen(false)
    setActiveMarker(null)
    setActiveVariant(null)
    setActivePairId(null)
    setHighlightedPairId(null)
  }

  const deleteProtocolTemplate = (id: string) => {
    setTemplates((currentTemplates) =>
      currentTemplates.filter((template) => template.id !== id),
    )
    setOpenProtocolSessions((sessions) =>
      sessions.map((session) =>
        session.currentTemplateId === id
          ? { ...session, currentTemplateId: null }
          : session,
      ),
    )
    if (currentTemplateId === id) {
      setCurrentTemplateId(null)
    }
  }

  const downloadProtocol = async () => {
    const freshDescriptionContent = getFreshContent('description')
    const freshConclusionContent = getFreshContent('conclusion')
    const protocolDocument = createProtocolDownloadDocument(
      passportData,
      templateName,
      getProtocolContentText(freshDescriptionContent),
      getProtocolContentText(freshConclusionContent),
      protocolExportSettings,
    )
    const fileNameBase = formatProtocolFileName(
      protocolExportSettings.fileNameTemplate,
      passportData,
      templateName.trim() || 'Протокол',
      protocolExportSettings.footerDoctorName,
    )
    const fileName = `${fileNameBase}.doc`

    if (isProtocolDirectorySaveAvailable && protocolDirectoryName) {
      try {
        const result = await saveDocFileToStoredProtocolDirectory(
          fileName,
          protocolDocument,
        )

        if (result.saved) {
          setProtocolDirectoryName(result.directoryName)
          setProtocolDirectoryStatus(
            result.directoryName
              ? `Сохранено в папку «${result.directoryName}».`
              : 'Сохранено в выбранную папку.',
          )
          return
        }

        setProtocolDirectoryStatus(
          result.directoryName
            ? `Нет доступа к папке «${result.directoryName}», файл скачан обычным способом.`
            : 'Папка не выбрана, файл скачан обычным способом.',
        )
      } catch {
        setProtocolDirectoryStatus(
          'Не удалось сохранить в выбранную папку, файл скачан обычным способом.',
        )
      }
    }

    downloadDocFile(fileName, protocolDocument)
  }

  const closeStartCreateDialog = () => {
    setIsStartCreateDialogOpen(false)
    setStartTemplateDraft(createEmptyStartTemplateDraft())
  }

  const createStartTemplate = () => {
    const name = startTemplateDraft.name.trim()

    if (!name) {
      return
    }

    const now = getTimestamp()
    const nextTemplate: ProtocolTemplate = {
      id: createTemplateId(),
      name,
      createdAt: now,
      updatedAt: now,
      descriptionContent: ensureLeadingMarkerContent(
        completeFinalFindingInContent(
          startTemplateDraft.description
            ? [createTextSegment(startTemplateDraft.description)]
            : [],
        ),
      ),
      conclusionContent: completeFinalFindingInContent(
        startTemplateDraft.conclusion
          ? [createTextSegment(startTemplateDraft.conclusion)]
          : [],
      ),
      findingPairs: [],
    }

    setTemplates((currentTemplates) => [nextTemplate, ...currentTemplates])
    loadProtocolTemplate(nextTemplate, { resetPassport: true })
    closeStartCreateDialog()
  }

  const handleDescriptionClick = useEvent((event: MouseEvent<HTMLDivElement>) =>
    handleEditorClick('description', event),
  )
  const handleDescriptionContextMenu = useEvent(
    (event: MouseEvent<HTMLDivElement>) =>
      openContextMenu('description', event),
  )
  const handleDescriptionInput = useEvent(() =>
    handleEditorInput('description'),
  )
  const handleDescriptionKeyDown = useEvent(
    (event: KeyboardEvent<HTMLDivElement>) =>
      handleEditorKeyDown('description', event),
  )
  const handleDescriptionKeyUp = useEvent(() =>
    updateActiveFinding('description'),
  )
  const handleDescriptionMouseUp = useEvent(() =>
    updateActiveFinding('description'),
  )

  const handleConclusionClick = useEvent((event: MouseEvent<HTMLDivElement>) =>
    handleEditorClick('conclusion', event),
  )
  const handleConclusionContextMenu = useEvent(
    (event: MouseEvent<HTMLDivElement>) => openContextMenu('conclusion', event),
  )
  const handleConclusionInput = useEvent(() => handleEditorInput('conclusion'))
  const handleConclusionKeyDown = useEvent(
    (event: KeyboardEvent<HTMLDivElement>) =>
      handleEditorKeyDown('conclusion', event),
  )
  const handleConclusionKeyUp = useEvent(() =>
    updateActiveFinding('conclusion'),
  )
  const handleConclusionMouseUp = useEvent(() =>
    updateActiveFinding('conclusion'),
  )

  const startLayoutResize = (
    event: ReactPointerEvent<HTMLElement>,
    onMove: (event: globalThis.PointerEvent) => void,
    cursor: string,
  ) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = cursor
    document.body.classList.add('is-resizing-layout')
    onMove(event.nativeEvent)

    const stopResize = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
      document.body.classList.remove('is-resizing-layout')
      document.body.style.cursor = previousCursor
    }
    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      onMove(moveEvent)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  const startSidePanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    startLayoutResize(
      event,
      (moveEvent) => {
        const maxWidth = Math.max(
          minSidePanelWidth,
          Math.min(maxSidePanelWidth, window.innerWidth - minWorkspaceWidth),
        )

        setSidePanelWidth(
          clampValue(
            window.innerWidth - moveEvent.clientX,
            minSidePanelWidth,
            maxWidth,
          ),
        )
      },
      'col-resize',
    )
  }

  const startConclusionResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    startLayoutResize(
      event,
      (moveEvent) => {
        const rect = workspaceRef.current?.getBoundingClientRect()

        if (!rect) {
          return
        }

        const maxHeight = Math.max(
          minConclusionPanelHeight,
          rect.height - minDescriptionPanelHeight - resizeHandleSize,
        )

        setConclusionPanelHeight(
          clampValue(
            rect.bottom - moveEvent.clientY,
            minConclusionPanelHeight,
            maxHeight,
          ),
        )
      },
      'row-resize',
    )
  }

  const handleAuthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const fullName = authDraft.fullName.trim()
    const email = normalizeUserEmail(authDraft.email)

    if (!fullName || !isValidUserEmail(email)) {
      setAuthError('Введите ФИО и корректный email')
      return
    }

    const profile = createUserProfile(
      fullName,
      email,
      currentUser?.id === email ? currentUser : null,
    )

    resetProtocolWorkspace()
    setTemplates(loadStoredTemplates(getProtocolTemplatesStorageKey(profile.id)))
    setSavedFindings(loadStoredFindings(getSavedFindingsStorageKey(profile.id)))
    setFindingFolders(
      loadStoredFindingFolders(getFindingFoldersStorageKey(profile.id)),
    )
    const nextExportSettings = loadProtocolExportSettings(
      getProtocolExportSettingsStorageKey(profile.id),
    )
    setProtocolExportSettings(nextExportSettings)
    setProtocolExportSettingsDraft(nextExportSettings)
    setStorageUserId(null)
    storeCurrentUserProfile(profile)
    setCurrentUser(profile)
    setAuthDraft({ email: profile.email, fullName: profile.fullName })
    setAuthError('')
  }

  const signOutCurrentUser = () => {
    clearCurrentUserProfile()
    resetProtocolWorkspace()
    setTemplates([])
    setSavedFindings([])
    setFindingFolders([])
    const defaultExportSettings = createDefaultProtocolExportSettings()
    setProtocolExportSettings(defaultExportSettings)
    setProtocolExportSettingsDraft(defaultExportSettings)
    setStorageUserId(null)
    setCurrentUser(null)
    setAuthDraft({ email: '', fullName: '' })
    setAuthError('')
    setIsUserSwitchConfirmOpen(false)
  }

  const openUserSwitchConfirm = () => {
    setContextMenu(null)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setActiveVariant(null)
    setIsAppMenuOpen(false)
    setIsUserSwitchConfirmOpen(true)
  }

  const closeUserSwitchConfirm = () => {
    setIsUserSwitchConfirmOpen(false)
  }

  const confirmUserSwitch = () => {
    signOutCurrentUser()
  }

  const openProtocolExportSettings = () => {
    setProtocolExportSettingsDraft(protocolExportSettings)
    setIsProtocolExportSettingsOpen(true)
    setIsAppMenuOpen(false)
  }

  const chooseProtocolDownloadDirectory = async () => {
    if (!isProtocolDirectorySaveAvailable) {
      setProtocolDirectoryStatus(
        'Выбор папки поддерживается в Chrome и Edge. Сейчас файл будет скачиваться обычным способом.',
      )
      return
    }

    try {
      const directory = await chooseProtocolDirectory()

      if (directory) {
        setProtocolDirectoryName(directory.name)
        setProtocolDirectoryStatus(
          `Папка для этого устройства: «${directory.name}».`,
        )
      }
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setProtocolDirectoryStatus(
          'Не удалось сохранить выбранную папку. Можно продолжить обычное скачивание.',
        )
      }
    }
  }

  const resetProtocolDownloadDirectory = async () => {
    await clearStoredProtocolDirectory()
    setProtocolDirectoryName(null)
    setProtocolDirectoryStatus('Папка сброшена. Файл будет скачиваться обычным способом.')
  }

  const openPassportSettings = () => {
    setIsPassportSettingsOpen(true)
    setIsAppMenuOpen(false)
    setContextMenu(null)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setActiveVariant(null)
  }

  const closePassportSettings = () => {
    setIsPassportSettingsOpen(false)
    setPassportCustomFieldDraft(null)
  }

  const closeProtocolExportSettings = () => {
    setIsProtocolExportSettingsOpen(false)
    setProtocolExportSettingsDraft(protocolExportSettings)
  }

  const saveProtocolExportSettings = () => {
    const nextSettings = sanitizeProtocolExportSettings({
      ...protocolExportSettingsDraft,
      fileNameTemplate: buildProtocolFileNameTemplate(
        selectedProtocolFileNameBlockKeys,
      ),
    })

    setProtocolExportSettings(nextSettings)
    setProtocolExportSettingsDraft(nextSettings)
    setIsProtocolExportSettingsOpen(false)

    if (currentUser) {
      storeProtocolExportSettings(
        nextSettings,
        getProtocolExportSettingsStorageKey(currentUser.id),
      )
    }
  }

  const updateProtocolFileNameBlockKeys = (keys: string[]) => {
    setProtocolExportSettingsDraft((settings) => ({
      ...settings,
      fileNameTemplate: buildProtocolFileNameTemplate(keys),
    }))
  }

  const startProtocolFileNameBlockDrag = (
    event: DragEvent<HTMLElement>,
    item: ProtocolFileNameDragItem,
  ) => {
    const value = JSON.stringify(item)

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(protocolFileNameDragDataType, value)
    event.dataTransfer.setData('text/plain', value)
  }

  const addProtocolFileNameBlock = (key: string, targetIndex?: number) => {
    if (selectedProtocolFileNameBlockKeys.includes(key)) {
      return
    }

    const nextKeys = [...selectedProtocolFileNameBlockKeys]
    const insertIndex = clampValue(
      targetIndex ?? nextKeys.length,
      0,
      nextKeys.length,
    )

    nextKeys.splice(insertIndex, 0, key)
    updateProtocolFileNameBlockKeys(nextKeys)
  }

  const moveProtocolFileNameBlock = (
    sourceIndex: number,
    targetIndex: number,
  ) => {
    if (
      sourceIndex < 0 ||
      sourceIndex >= selectedProtocolFileNameBlockKeys.length
    ) {
      return
    }

    const nextKeys = selectedProtocolFileNameBlockKeys.filter(
      (_, index) => index !== sourceIndex,
    )
    const insertIndex = clampValue(
      sourceIndex < targetIndex ? targetIndex - 1 : targetIndex,
      0,
      nextKeys.length,
    )

    nextKeys.splice(insertIndex, 0, selectedProtocolFileNameBlockKeys[sourceIndex])
    updateProtocolFileNameBlockKeys(nextKeys)
  }

  const removeProtocolFileNameBlock = (key: string) => {
    if (selectedProtocolFileNameBlockKeys.length <= 1) {
      return
    }

    updateProtocolFileNameBlockKeys(
      selectedProtocolFileNameBlockKeys.filter((item) => item !== key),
    )
  }

  const dropProtocolFileNameBlock = (
    event: DragEvent<HTMLElement>,
    targetIndex?: number,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const item = parseProtocolFileNameDragItem(event)

    if (!item) {
      return
    }

    if (item.source === 'selected' && typeof item.index === 'number') {
      moveProtocolFileNameBlock(
        item.index,
        targetIndex ?? selectedProtocolFileNameBlockKeys.length,
      )
      return
    }

    addProtocolFileNameBlock(item.key, targetIndex)
  }

  const renderFindingBrowserTree = (parentId: string | null, level = 0) => {
    const folderIds = new Set(findingFolders.map((folder) => folder.id))
    const childFolders = findingFolders.filter(
      (folder) => (folder.parentId ?? null) === parentId,
    )
    const childFindings = savedFindings.filter((finding) => {
      const folderId =
        finding.folderId && folderIds.has(finding.folderId)
          ? finding.folderId
          : null

      return folderId === parentId
    })

    return (
      <>
        {childFolders.map((folder) => (
          <div className="browser-folder" key={folder.id}>
            <div
              className="browser-folder-row"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => moveBrowserItem(event, folder.id)}
              style={{ paddingLeft: 10 + level * 18 }}
            >
              <span
                className="browser-drag-handle"
                draggable
                onDragStart={(event) =>
                  startBrowserDrag(event, { type: 'folder', id: folder.id })
                }
              >
                ::
              </span>
              <input
                aria-label="Название папки"
                onChange={(event) =>
                  renameFindingFolder(folder.id, event.target.value)
                }
                value={folder.name}
              />
              <button
                aria-label={`Создать подпапку в ${folder.name}`}
                onClick={() => createFindingFolder(folder.id)}
                type="button"
              >
                +
              </button>
            </div>
            {renderFindingBrowserTree(folder.id, level + 1)}
          </div>
        ))}

        {childFindings.map((finding) => (
          <button
            className="browser-finding-item"
            draggable
            key={finding.id}
            onClick={() => insertSavedFindingFromSearch(finding)}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={(event) =>
              startBrowserDrag(event, { type: 'finding', id: finding.id })
            }
            onDrop={(event) => moveBrowserItem(event, finding.folderId)}
            style={{ marginLeft: 10 + level * 18 }}
            type="button"
          >
            <strong>{finding.name}</strong>
            {finding.description && <span>{finding.description}</span>}
            {finding.conclusion && (
              <span className="browser-finding-conclusion">
                {finding.conclusion}
              </span>
            )}
          </button>
        ))}
      </>
    )
  }

  const renderAppTopbar = () => (
    <header className="app-topbar">
      <div className="app-topbar-main">
        <h1>Программа</h1>
        {currentUser && protocolSessionTabs.length > 0 && (
          <div className="patient-tabs" aria-label="Пациенты">
            {protocolSessionTabs.map((session) => {
              const isActive = session.id === activeProtocolSessionId

              return (
                <div
                  className={['patient-tab', isActive ? 'is-active' : '']
                    .filter(Boolean)
                    .join(' ')}
                  key={session.id}
                  title={session.passportData.fullName.trim() || 'Пациент'}
                >
                  <button
                    aria-current={isActive ? 'page' : undefined}
                    className="patient-tab-main"
                    onClick={() => switchProtocolSession(session.id)}
                    type="button"
                  >
                    <strong>
                      {formatPatientShortName(session.passportData.fullName)}
                    </strong>
                    <span>{session.templateName.trim() || 'Без шаблона'}</span>
                  </button>
                  <button
                    aria-label={`Закрыть случай ${formatPatientShortName(
                      session.passportData.fullName,
                    )}`}
                    className="patient-tab-close"
                    onClick={(event) => {
                      event.stopPropagation()
                      requestCloseProtocolSession(session.id)
                    }}
                    title="Закрыть случай"
                    type="button"
                  >
                    x
                  </button>
                </div>
              )
            })}
            <button
              aria-label="Новый протокол"
              className="patient-add-button"
              onClick={openStartScreenForNewProtocol}
              title="Новый протокол"
              type="button"
            >
              +
            </button>
          </div>
        )}
      </div>
      {currentUser && (
        <div className="app-topbar-actions">
          <button
            aria-label="Сменить пользователя"
            className="app-user-switch"
            onClick={openUserSwitchConfirm}
            title="Сменить пользователя"
            type="button"
          >
            <strong>{formatPatientShortName(currentUser.fullName)}</strong>
            <span>{currentUser.email}</span>
          </button>
          <button
            aria-expanded={isAppMenuOpen}
            aria-haspopup="menu"
            aria-label="Меню"
            className="app-menu-button"
            onClick={() => {
              setContextMenu(null)
              setMarkerMenu(null)
              setMarkerContextMenu(null)
              setActiveVariant(null)
              setIsAppMenuOpen((isOpen) => !isOpen)
            }}
            title="Меню"
            type="button"
          >
            <span aria-hidden="true">•••</span>
          </button>
        </div>
      )}
      {currentUser && isAppMenuOpen && (
        <div
          className="app-context-menu"
          onMouseDown={(event) => event.stopPropagation()}
          role="menu"
        >
          {currentUser && (
            <>
              <button type="button" onClick={openFindingBrowser} role="menuitem">
                Браузер находок
              </button>
              <button
                type="button"
                onClick={openProtocolExportSettings}
                role="menuitem"
              >
                Настройки итогового протокола
              </button>
              <button
                type="button"
                onClick={openPassportSettings}
                role="menuitem"
              >
                Настройка паспортной части
              </button>
            </>
          )}
        </div>
      )}
    </header>
  )

  const renderUserSwitchConfirmDialog = () =>
    isUserSwitchConfirmOpen && currentUser ? (
      <div className="modal-backdrop" onMouseDown={closeUserSwitchConfirm}>
        <section
          aria-labelledby="user-switch-confirm-title"
          aria-modal="true"
          className="modal-panel user-switch-confirm-modal"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="modal-header">
            <h2 id="user-switch-confirm-title">Сменить пользователя?</h2>
            <button
              aria-label="Закрыть"
              className="modal-close-button"
              onClick={closeUserSwitchConfirm}
              type="button"
            >
              x
            </button>
          </div>

          <p className="modal-warning-text">
            Текущий протокол будет закрыт. Перед сменой пользователя сохраните
            нужные данные как шаблон или находку.
          </p>

          <div className="modal-actions">
            <button onClick={closeUserSwitchConfirm} type="button">
              Остаться
            </button>
            <button onClick={confirmUserSwitch} type="button">
              Сменить пользователя
            </button>
          </div>
        </section>
      </div>
    ) : null

  const renderProtocolSessionCloseDialog = () =>
    protocolSessionCloseTarget ? (
      <div className="modal-backdrop" onMouseDown={cancelCloseProtocolSession}>
        <section
          aria-labelledby="protocol-session-close-title"
          aria-modal="true"
          className="modal-panel protocol-session-close-modal"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="modal-header">
            <h2 id="protocol-session-close-title">Закрыть случай?</h2>
            <button
              aria-label="Закрыть"
              className="modal-close-button"
              onClick={cancelCloseProtocolSession}
              type="button"
            >
              x
            </button>
          </div>

          <p className="modal-warning-text">
            {formatPatientShortName(
              protocolSessionCloseTarget.passportData.fullName,
            )}{' '}
            будет убран из верхней панели. Шаблоны и сохраненные находки не
            изменятся.
          </p>

          <div className="modal-actions">
            <button onClick={cancelCloseProtocolSession} type="button">
              Отмена
            </button>
            <button
              className="danger-action-button"
              onClick={confirmCloseProtocolSession}
              type="button"
            >
              Закрыть случай
            </button>
          </div>
        </section>
      </div>
    ) : null

  const renderFindingBrowserDialog = () =>
    isFindingBrowserOpen ? (
      <div
        className="modal-backdrop"
        onMouseDown={() => {
          setIsFindingBrowserOpen(false)
          setFindingBrowserWarning('')
        }}
      >
        <section
          aria-labelledby="finding-browser-title"
          aria-modal="true"
          className="modal-panel finding-browser-modal"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="modal-header">
            <h2 id="finding-browser-title">Браузер находок</h2>
            <button
              aria-label="Закрыть"
              className="modal-close-button"
              onClick={() => {
                setIsFindingBrowserOpen(false)
                setFindingBrowserWarning('')
              }}
              type="button"
            >
              x
            </button>
          </div>

          <div className="browser-toolbar">
            <button type="button" onClick={() => createFindingFolder(null)}>
              Создать папку
            </button>
          </div>

          {findingBrowserWarning && (
            <p className="search-warning">{findingBrowserWarning}</p>
          )}

          <div
            className="browser-root-drop"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => moveBrowserItem(event, null)}
          >
            Корень
          </div>

          <div
            className="finding-browser-tree"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => moveBrowserItem(event, null)}
          >
            {findingFolders.length || savedFindings.length ? (
              renderFindingBrowserTree(null)
            ) : (
              <p className="saved-finding-empty">Сохраненных находок нет</p>
            )}
          </div>
        </section>
      </div>
    ) : null

  const renderProtocolExportSettingsDialog = () =>
    isProtocolExportSettingsOpen ? (
      <div className="modal-backdrop" onMouseDown={closeProtocolExportSettings}>
        <section
          aria-labelledby="protocol-export-settings-title"
          aria-modal="true"
          className="modal-panel protocol-export-settings-modal"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="modal-header">
            <h2 id="protocol-export-settings-title">
              Настройки итогового протокола
            </h2>
            <button
              aria-label="Закрыть"
              className="modal-close-button"
              onClick={closeProtocolExportSettings}
              type="button"
            >
              x
            </button>
          </div>

          <label className="modal-field">
            <span>Верхний колонтитул</span>
            <textarea
              onChange={(event) =>
                setProtocolExportSettingsDraft((settings) => ({
                  ...settings,
                  headerText: event.target.value,
                }))
              }
              placeholder="Текст шапки протокола"
              value={protocolExportSettingsDraft.headerText}
            />
          </label>

          <div className="protocol-export-settings-grid">
            <label className="modal-field">
              <span>Фамилия врача</span>
              <input
                onChange={(event) =>
                  setProtocolExportSettingsDraft((settings) => ({
                    ...settings,
                    footerDoctorName: event.target.value,
                  }))
                }
                placeholder="Фамилия И.О."
                type="text"
                value={protocolExportSettingsDraft.footerDoctorName}
              />
            </label>

            <label className="modal-field">
              <span>Надпись подписи</span>
              <input
                onChange={(event) =>
                  setProtocolExportSettingsDraft((settings) => ({
                    ...settings,
                    footerSignatureText: event.target.value,
                  }))
                }
                placeholder="Подпись"
                type="text"
                value={protocolExportSettingsDraft.footerSignatureText}
              />
            </label>
          </div>

          <div className="modal-field protocol-file-name-builder">
            <span>Название сохраненного файла</span>
            <div
              className="protocol-file-name-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropProtocolFileNameBlock(event)}
            >
              {selectedProtocolFileNameBlocks.map((block, index) => (
                <div
                  className="protocol-file-name-block is-selected"
                  draggable
                  key={block.key}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={(event) =>
                    startProtocolFileNameBlockDrag(event, {
                      index,
                      key: block.key,
                      source: 'selected',
                    })
                  }
                  onDrop={(event) => dropProtocolFileNameBlock(event, index)}
                >
                  <span>{block.label}</span>
                  {selectedProtocolFileNameBlocks.length > 1 && (
                    <button
                      aria-label="Убрать блок"
                      onClick={() => removeProtocolFileNameBlock(block.key)}
                      type="button"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>

            {availableProtocolFileNameBlocks.length > 0 && (
              <div className="protocol-file-name-palette">
                {availableProtocolFileNameBlocks.map((block) => (
                  <button
                    className="protocol-file-name-block"
                    draggable
                    key={block.key}
                    onClick={() => addProtocolFileNameBlock(block.key)}
                    onDragStart={(event) =>
                      startProtocolFileNameBlockDrag(event, {
                        key: block.key,
                        source: 'available',
                      })
                    }
                    type="button"
                  >
                    {block.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="modal-field protocol-save-folder-field">
            <span>Папка сохранения на этом устройстве</span>
            <div className="protocol-save-folder-row">
              <button
                onClick={() => void chooseProtocolDownloadDirectory()}
                type="button"
              >
                Выбрать папку
              </button>
              <button
                disabled={!protocolDirectoryName}
                onClick={() => void resetProtocolDownloadDirectory()}
                type="button"
              >
                Сбросить
              </button>
            </div>
            <p className="protocol-export-settings-hint">
              {isProtocolDirectorySaveAvailable
                ? protocolDirectoryName
                  ? `Выбрана папка «${protocolDirectoryName}». Настройка хранится только в этом браузере и на этом устройстве.`
                  : 'Папка не выбрана. Пока протокол скачивается обычным способом.'
                : 'Браузер не поддерживает выбор папки. Будет использоваться обычное скачивание.'}
            </p>
            {protocolDirectoryStatus && (
              <p className="protocol-save-folder-status">
                {protocolDirectoryStatus}
              </p>
            )}
          </div>

          <div className="modal-actions">
            <button onClick={saveProtocolExportSettings} type="button">
              Сохранить
            </button>
          </div>
        </section>
      </div>
    ) : null

  const renderMarkerSettingsDialog = () =>
    markerDialogId !== null && markerDialogSegment && markerDialogBlock ? (
      <div className="modal-backdrop" onMouseDown={closeMarkerDialog}>
        <section
          aria-labelledby="marker-settings-title"
          aria-modal="true"
          className="modal-panel marker-settings-modal"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="modal-header">
            <h2 id="marker-settings-title">Раздел</h2>
            <button
              aria-label="Закрыть"
              className="modal-close-button"
              onClick={closeMarkerDialog}
              type="button"
            >
              x
            </button>
          </div>

          <label className="modal-field">
            <span>Название раздела</span>
            <input
              autoFocus
              onChange={(event) =>
                changeMarkerTitle(markerDialogSegment.id, event.target.value)
              }
              placeholder="Название раздела"
              type="text"
              value={markerDialogSegment.title}
            />
          </label>

          <div className="marker-option-list">
            {(markerDialogSegment.options.length
              ? markerDialogSegment.options
              : [createEmptyMarkerOption()]
            ).map((option, index) => (
              <div className="marker-option-row" key={index}>
                <div className="marker-option-fields">
                  <input
                    aria-label={`Название заготовки ${index + 1}`}
                    onChange={(event) =>
                      changeMarkerOptionTitle(
                        markerDialogSegment.id,
                        index,
                        event.target.value,
                      )
                    }
                    placeholder="Название"
                    type="text"
                    value={option.title}
                  />
                  <textarea
                    aria-label={`Текст заготовки ${index + 1}`}
                    onChange={(event) =>
                      changeMarkerOptionValue(
                        markerDialogSegment.id,
                        index,
                        event.target.value,
                      )
                    }
                    placeholder="Заготовка"
                    value={option.value}
                  />
                </div>
                <label className="variant-check marker-option-check">
                  <input
                    checked={
                      markerDialogSegment.selectedOptionIndex === index &&
                      markerDialogBlock.value === option.value
                    }
                    onChange={() =>
                      applyMarkerOption(markerDialogSegment.id, index)
                    }
                    type="checkbox"
                  />
                  <span>✓</span>
                </label>
              </div>
            ))}
          </div>

          <button
            aria-label="Добавить заготовку"
            className="marker-add-button"
            onClick={() => addMarkerOption(markerDialogSegment.id)}
            type="button"
          >
            +
          </button>
        </section>
      </div>
    ) : null

  const renderPassportSettingsDialog = () =>
    isPassportSettingsOpen ? (
      <div className="modal-backdrop" onMouseDown={closePassportSettings}>
        <section
          aria-labelledby="passport-settings-title"
          aria-modal="true"
          className="modal-panel passport-settings-modal"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="modal-header">
            <h2 id="passport-settings-title">Настройка паспортной части</h2>
            <button
              aria-label="Закрыть"
              className="modal-close-button"
              onClick={closePassportSettings}
              type="button"
            >
              x
            </button>
          </div>

          {passportCustomFieldDraft === null ? (
            <div className="passport-settings-actions">
              <button onClick={addPassportCustomField} type="button">
                Добавить поле
              </button>
            </div>
          ) : (
            <div className="passport-add-field-form">
              <input
                aria-label="Название нового поля"
                autoFocus
                onChange={(event) =>
                  setPassportCustomFieldDraft(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    confirmPassportCustomField()
                  }
                }}
                placeholder="Название поля"
                type="text"
                value={passportCustomFieldDraft}
              />
              <button
                disabled={!passportCustomFieldDraft.trim()}
                onClick={confirmPassportCustomField}
                type="button"
              >
                Подтвердить
              </button>
            </div>
          )}

          <div className="passport-settings-field-list">
            <span className="passport-settings-section-title">
              Дополнительные поля
            </span>
            {passportData.customFields.length > 0 ? (
              passportData.customFields.map((field) => (
                <div className="passport-settings-field-item" key={field.id}>
                  <span>{field.label.trim() || 'Поле'}</span>
                  <button
                    className="passport-settings-delete-button"
                    onClick={() => deletePassportCustomField(field.id)}
                    type="button"
                  >
                    Удалить
                  </button>
                </div>
              ))
            ) : (
              <p className="passport-settings-empty">
                Дополнительных полей нет
              </p>
            )}
          </div>
        </section>
      </div>
    ) : null

  if (!currentUser) {
    return (
      <main className="auth-shell">
        {renderAppTopbar()}

        <section className="auth-screen" aria-labelledby="auth-title">
          <form className="auth-card" onSubmit={handleAuthSubmit}>
            <div className="auth-card-header">
              <span>Авторизация</span>
              <h1 id="auth-title">Войдите в программу</h1>
            </div>

            <label className="auth-field">
              <span>ФИО</span>
              <input
                autoComplete="name"
                autoFocus
                onChange={(event) => {
                  setAuthDraft((draft) => ({
                    ...draft,
                    fullName: event.target.value,
                  }))
                  setAuthError('')
                }}
                placeholder="Фамилия Имя Отчество"
                type="text"
                value={authDraft.fullName}
              />
            </label>

            <label className="auth-field">
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => {
                  setAuthDraft((draft) => ({
                    ...draft,
                    email: event.target.value,
                  }))
                  setAuthError('')
                }}
                placeholder="doctor@example.com"
                type="email"
                value={authDraft.email}
              />
            </label>

            {authError && <p className="auth-error">{authError}</p>}

            <button
              disabled={
                !authDraft.fullName.trim() ||
                !isValidUserEmail(authDraft.email)
              }
              type="submit"
            >
              Войти
            </button>
          </form>
        </section>
      </main>
    )
  }

  if (!hasOpenedProtocol) {
    return (
      <main className="start-shell">
        {renderAppTopbar()}

        <section
          aria-labelledby="start-screen-title"
          className="start-screen"
        >
          <div className="start-screen-panel">
            <div className="start-screen-header">
              <h1 id="start-screen-title">Выберите шаблон</h1>
            </div>

            <div className="start-template-grid">
              <button
                className="start-template-card start-template-create-card"
                onClick={() => setIsStartCreateDialogOpen(true)}
                type="button"
              >
                <strong>New</strong>
                <span>Создать новый</span>
              </button>

              {templates.map((template) => (
                <button
                  className="start-template-card"
                  key={template.id}
                  onClick={() =>
                    loadProtocolTemplate(template, { resetPassport: true })
                  }
                  title={template.name}
                  type="button"
                >
                  <strong>{template.name}</strong>
                  <span>{getTemplatePreviewText(template)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {isStartCreateDialogOpen && (
          <div className="modal-backdrop" onMouseDown={closeStartCreateDialog}>
            <section
              aria-labelledby="start-create-template-title"
              aria-modal="true"
              className="modal-panel start-create-modal"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-header">
                <h2 id="start-create-template-title">Новый шаблон</h2>
                <button
                  aria-label="Закрыть"
                  className="modal-close-button"
                  onClick={closeStartCreateDialog}
                  type="button"
                >
                  x
                </button>
              </div>

              <label className="modal-field">
                <span>Название</span>
                <input
                  autoFocus
                  onChange={(event) =>
                    setStartTemplateDraft((draft) => ({
                      ...draft,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Например, Рентгенография ОГК"
                  type="text"
                  value={startTemplateDraft.name}
                />
              </label>

              <label className="modal-field">
                <span>Описание</span>
                <textarea
                  onChange={(event) =>
                    setStartTemplateDraft((draft) => ({
                      ...draft,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Стартовый текст описания"
                  value={startTemplateDraft.description}
                />
              </label>

              <label className="modal-field">
                <span>Заключение</span>
                <textarea
                  onChange={(event) =>
                    setStartTemplateDraft((draft) => ({
                      ...draft,
                      conclusion: event.target.value,
                    }))
                  }
                  placeholder="Стартовый текст заключения"
                  value={startTemplateDraft.conclusion}
                />
              </label>

              <div className="modal-actions">
                <button
                  disabled={!startTemplateDraft.name.trim()}
                  onClick={createStartTemplate}
                  type="button"
                >
                  Создать
                </button>
              </div>
            </section>
          </div>
        )}

        {renderFindingBrowserDialog()}
        {renderProtocolExportSettingsDialog()}
        {renderPassportSettingsDialog()}
        {renderUserSwitchConfirmDialog()}
        {renderProtocolSessionCloseDialog()}
      </main>
    )
  }

  return (
    <main className="radiology-app" style={layoutStyle}>
      {renderAppTopbar()}

      <section
        className="workspace"
        aria-label="Рабочая область протокола"
        ref={workspaceRef}
      >
        <div className="field-block description-block">
          <div className="field-header">
            <label htmlFor="description">Описание</label>
            <span className="field-header-counter">
              {descriptionText.length} знаков
            </span>
          </div>
          <div className="description-editor-shell">
            <EditableArea
              ariaLabel="Описание"
              editorRef={descriptionRef}
              html={descriptionHtml}
              id="description"
              isEmpty={!descriptionText}
              onClick={handleDescriptionClick}
              onContextMenu={handleDescriptionContextMenu}
              onInput={handleDescriptionInput}
              onKeyDown={handleDescriptionKeyDown}
              onKeyUp={handleDescriptionKeyUp}
              onMouseUp={handleDescriptionMouseUp}
              onPaste={handleEditorPaste}
              placeholder="Опишите рентгенологическую картину..."
            />
            <div
              aria-label="Инструменты описания"
              className="description-tool-rail"
            >
              <button
                aria-label="Поиск"
                className="field-tool-button"
                onClick={openFindingSearch}
                title="Поиск"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="field-tool-icon search-icon"
                />
              </button>
              <button
                aria-label="Копировать в заключение"
                className="field-tool-button"
                onClick={copySelectionToConclusion}
                onMouseDown={(event) => event.preventDefault()}
                title="Копировать в заключение"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="field-tool-icon copy-to-conclusion-icon"
                />
              </button>
              <button
                aria-label="Создать список вариантов"
                className="field-tool-button"
                onClick={createVariantFromSelection}
                onMouseDown={(event) => event.preventDefault()}
                title="Создать список вариантов"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="field-tool-icon variant-list-icon"
                />
              </button>
              <button
                aria-label="Метка раздела"
                className="field-tool-button"
                onClick={insertSectionMarker}
                title="Метка раздела"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="field-tool-icon marker-icon"
                >
                  #
                </span>
              </button>
            </div>
          </div>
        </div>

        <div
          aria-label="Изменить размер заключения"
          aria-orientation="horizontal"
          className="horizontal-rule resize-handle"
          onPointerDown={startConclusionResize}
          role="separator"
        />

        <div className="field-block conclusion-block">
          <div className="field-header">
            <div className="field-title">
              <label htmlFor="conclusion">Заключение</label>
              <div className="finding-capsules" aria-label="Находки для заключения">
                {descriptionFindingRanges.map((range, index) => {
                  const pair = findPairForDescription(range)
                  const descriptionValue = getFindingLabelText(
                    getRangeText(descriptionText, range),
                  )
                  const conclusionValue =
                    pair && pair.conclusion.end > pair.conclusion.start
                      ? getFindingLabelText(
                          getRangeText(conclusionText, pair.conclusion),
                        )
                      : ''
                  const lateralityWarning = getLateralityWarning(
                    descriptionValue,
                    conclusionValue,
                  )
                  const isComplete = pair
                    ? isCompletedConclusion(conclusionText, pair.conclusion)
                    : false
                  const isActive = pair?.id === highlightedPairId
                  const isDescriptionOnlyCursorFinding =
                    activeCursorField === 'description' &&
                    !pair &&
                    activeDescriptionFindingRange !== null &&
                    isSameRange(activeDescriptionFindingRange, range)
                  const isCursorPair =
                    (activeCursorField !== null && pair?.id === activePairId) ||
                    isDescriptionOnlyCursorFinding
                  const label = String(index + 1)

                  return (
                    <button
                      aria-label={`Находка ${label}`}
                      className={[
                        'finding-pill',
                        isComplete ? 'is-complete' : 'is-pending',
                        isActive ? 'is-active' : '',
                        isCursorPair ? 'is-cursor-pair' : '',
                        lateralityWarning ? 'has-side-warning' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={`${range.start}-${range.end}`}
                      onClick={() => activateFindingCapsule(range)}
                      title={
                        lateralityWarning
                          ? `${descriptionValue}\nПроверьте сторону: ${lateralityWarning}`
                          : descriptionValue
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <span>{conclusionText.length} знаков</span>
          </div>
          <EditableArea
            ariaLabel="Заключение"
            editorRef={conclusionRef}
            html={conclusionHtml}
            id="conclusion"
            isEmpty={!conclusionText}
            onClick={handleConclusionClick}
            onContextMenu={handleConclusionContextMenu}
            onInput={handleConclusionInput}
            onKeyDown={handleConclusionKeyDown}
            onKeyUp={handleConclusionKeyUp}
            onMouseUp={handleConclusionMouseUp}
            onPaste={handleEditorPaste}
            placeholder="Сформулируйте заключение..."
          />
        </div>
      </section>

      <div
        aria-label="Изменить ширину боковой панели"
        aria-orientation="vertical"
        className="side-resize-handle resize-handle"
        onPointerDown={startSidePanelResize}
        role="separator"
      />

      <aside className="side-panel" aria-label="Панель вариантов">
        <div className="panel-heading">
          <div className="panel-heading-actions">
            <button
              aria-label="Скачать протокол"
              className="template-open-button"
              onClick={() => void downloadProtocol()}
              title="Скачать протокол"
              type="button"
            >
              <span
                aria-hidden="true"
                className="template-button-icon template-download-icon"
              />
            </button>
            <button
              aria-label="Сохранить шаблон"
              className="template-open-button"
              onClick={() => {
                setTemplatesDialogMode('save')
                setIsTemplatesDialogOpen(true)
              }}
              title="Сохранить шаблон"
              type="button"
            >
              <span
                aria-hidden="true"
                className="template-button-icon template-save-icon"
              />
            </button>
            <button
              aria-label="Открыть шаблоны"
              className="template-open-button"
              onClick={() => {
                setTemplatesDialogMode('browse')
                setIsTemplatesDialogOpen(true)
              }}
              title="Шаблоны"
              type="button"
            >
              <span
                aria-hidden="true"
                className="template-button-icon template-library-icon"
              />
            </button>
          </div>
        </div>

        <div
          className={[
            'passport-panel',
            isPassportCollapsed ? 'is-collapsed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="passport-panel-header">
            <button
              aria-expanded={!isPassportCollapsed}
              aria-label={
                isPassportCollapsed
                  ? 'Развернуть паспортную часть'
                  : 'Свернуть паспортную часть'
              }
              className="collapsible-panel-title"
              onClick={() =>
                setIsPassportCollapsed((isCollapsed) => !isCollapsed)
              }
              title={
                isPassportCollapsed
                  ? 'Развернуть паспортную часть'
                  : 'Свернуть паспортную часть'
              }
              type="button"
            >
              <span aria-hidden="true" className="collapsible-panel-arrow">
                {isPassportCollapsed ? '▸' : '▾'}
              </span>
              <span className="collapsible-panel-title-text">
                {isPassportCollapsed
                  ? passportCollapsedTitle
                  : 'Паспортная часть'}
              </span>
            </button>
          </div>

          {!isPassportCollapsed && (
            <>
              <label className="passport-field passport-field-wide">
                <span>ФИО</span>
                <input
                  autoComplete="name"
                  onChange={(event) =>
                    updatePassportValue('fullName', event.target.value)
                  }
                  placeholder="Фамилия Имя Отчество"
                  type="text"
                  value={passportData.fullName}
                />
              </label>

              <div className="passport-grid">
                <div className="passport-field">
                  <span>Пол</span>
                  <div className="passport-sex-control">
                    <button
                      className={passportData.sex === 'male' ? 'is-active' : ''}
                      onClick={() => updatePassportSex('male')}
                      type="button"
                    >
                      Муж.
                    </button>
                    <button
                      className={
                        passportData.sex === 'female' ? 'is-active' : ''
                      }
                      onClick={() => updatePassportSex('female')}
                      type="button"
                    >
                      Жен.
                    </button>
                  </div>
                </div>
                <label className="passport-field">
                  <span>Возраст</span>
                  <input
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      updatePassportValue('birthDate', event.target.value)
                    }
                    placeholder="дд.мм.гггг"
                    type="text"
                    value={passportData.birthDate}
                  />
                </label>
                <label className="passport-field">
                  <span>Дата исследования</span>
                  <input
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      updatePassportValue('studyDate', event.target.value)
                    }
                    placeholder="дд.мм.гггг"
                    type="text"
                    value={passportData.studyDate}
                  />
                </label>
                <label className="passport-field">
                  <span>Время</span>
                  <input
                    inputMode="numeric"
                    maxLength={5}
                    onChange={(event) =>
                      updatePassportValue('studyTime', event.target.value)
                    }
                    placeholder="чч:мм"
                    type="text"
                    value={passportData.studyTime}
                  />
                </label>
                {passportData.customFields.map((field) => (
                  <label className="passport-field" key={field.id}>
                    <span>{field.label.trim() || 'Поле'}</span>
                    <input
                      aria-label={field.label.trim() || 'Поле'}
                      onChange={(event) =>
                        updatePassportCustomField(
                          field.id,
                          'value',
                          event.target.value,
                        )
                      }
                      placeholder="Значение"
                      type="text"
                      value={field.value}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {completedDescriptionFindingRanges.length > 0 && (
          <div className="findings-panel">
            <div className="findings-panel-header">
              <h2>Находки</h2>
            </div>
            <div className="finding-summary-list">
              {completedDescriptionFindingRanges.map((range, index) => {
                const {
                  pair,
                  description: descriptionValue,
                  conclusion: conclusionValue,
                } = getFindingSnapshot(range)
                const isActive = pair?.id === highlightedPairId
                const lateralityWarning = getLateralityWarning(
                  descriptionValue,
                  conclusionValue,
                )

                return (
                  <div
                    className={[
                      'finding-summary-item',
                      conclusionValue ? 'has-conclusion' : '',
                      isActive ? 'is-active' : '',
                      lateralityWarning ? 'has-side-warning' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={`${range.start}-${range.end}`}
                  >
                    <button
                      aria-label={`Находка ${index + 1}`}
                      className="finding-summary-content"
                      onClick={() => activateFindingCapsule(range)}
                      type="button"
                    >
                      <span className="finding-summary-number">
                        {index + 1}
                      </span>
                      <span className="finding-summary-body">
                        <span className="finding-summary-description">
                          {descriptionValue}
                        </span>
                        {conclusionValue && (
                          <span className="finding-summary-conclusion">
                            {conclusionValue}
                          </span>
                        )}
                        {lateralityWarning && (
                          <span className="finding-summary-warning">
                            Проверьте сторону: {lateralityWarning}
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      className="finding-save-button"
                      onClick={() => openFindingSaveDialog(range)}
                      type="button"
                    >
                      Сохранить
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </aside>

      {activeVariant && activeVariantSegment && (
        <VariantPopover
          onAddOption={addVariantOption}
          onChangeOption={changeVariantOption}
          onSelectOption={chooseVariantOption}
          variant={activeVariantSegment}
        />
      )}

      {markerMenu && markerMenuSegment && (
        <div
          className="context-menu marker-context-menu"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: markerMenu.x, top: markerMenu.y }}
        >
          {(markerMenuSegment.options.length
            ? markerMenuSegment.options
            : [createEmptyMarkerOption()]
          ).map((option, index) => (
            <button
              key={index}
              onClick={() => applyMarkerOption(markerMenu.id, index)}
              title={option.value}
              type="button"
            >
              {getMarkerOptionLabel(option, index)}
            </button>
          ))}
        </div>
      )}

      {markerContextMenu && markerContextMenuSegment && (
        <div
          className="context-menu marker-action-menu"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: markerContextMenu.x, top: markerContextMenu.y }}
        >
          <button
            onClick={() => openMarkerDialog(markerContextMenu.id)}
            type="button"
          >
            Настроить раздел
          </button>
          <button
            className="is-danger"
            disabled={markerContextMenuRange?.start === 0}
            onClick={() => deleteSectionMarker(markerContextMenu.id)}
            title={
              markerContextMenuRange?.start === 0
                ? 'Первый раздел нужен как начало протокола'
                : 'Удалить значок раздела'
            }
            type="button"
          >
            Удалить раздел
          </button>
        </div>
      )}

      {renderMarkerSettingsDialog()}

      {isTemplatesDialogOpen && (
        <ProtocolTemplatesDialog
          currentTemplateId={currentTemplateId}
          currentTemplateName={templateName}
          initialMode={templatesDialogMode}
          onClose={() => setIsTemplatesDialogOpen(false)}
          onDeleteTemplate={deleteProtocolTemplate}
          onSaveTemplate={saveProtocolTemplate}
          onSelectTemplate={(template) =>
            loadProtocolTemplate(template, { createSession: true })
          }
          templates={templates}
        />
      )}

      {findingSaveDialog && (
        <div className="modal-backdrop" onMouseDown={closeFindingSaveDialog}>
          <section
            aria-labelledby="finding-save-title"
            aria-modal="true"
            className="modal-panel finding-save-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <h2 id="finding-save-title">Сохранить находку</h2>
              <button
                aria-label="Закрыть"
                className="modal-close-button"
                onClick={closeFindingSaveDialog}
                type="button"
              >
                x
              </button>
            </div>
            <label className="modal-field">
              <span>Название</span>
              <input
                autoFocus
                onChange={(event) =>
                  setFindingSaveDialog((dialog) =>
                    dialog ? { ...dialog, name: event.target.value } : dialog,
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    findingSaveDialog.existingId &&
                    findingSaveDialog.name.trim()
                  ) {
                    saveExistingFinding()
                  }
                }}
                type="text"
                value={findingSaveDialog.name}
              />
            </label>
            <div className="modal-actions">
              <button
                disabled={
                  !findingSaveDialog.existingId ||
                  !findingSaveDialog.name.trim()
                }
                onClick={saveExistingFinding}
                type="button"
              >
                Сохранить
              </button>
              <button
                disabled={!findingSaveDialog.name.trim()}
                onClick={saveFindingAsNew}
                type="button"
              >
                Сохранить как новый
              </button>
            </div>
          </section>
        </div>
      )}

      {renderFindingBrowserDialog()}
      {renderProtocolExportSettingsDialog()}
      {renderPassportSettingsDialog()}
      {renderUserSwitchConfirmDialog()}
      {renderProtocolSessionCloseDialog()}

      {isFindingSearchOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => {
            setIsFindingSearchOpen(false)
            setFindingSearchWarning('')
          }}
        >
          <section
            aria-labelledby="finding-search-title"
            aria-modal="true"
            className="modal-panel finding-search-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <h2 id="finding-search-title">Поиск</h2>
              <button
                aria-label="Закрыть"
                className="modal-close-button"
                onClick={() => {
                  setIsFindingSearchOpen(false)
                  setFindingSearchWarning('')
                }}
                type="button"
              >
                x
              </button>
            </div>
            <input
              autoFocus
              aria-label="Поиск находки"
              onChange={(event) => {
                setFindingSearchQuery(event.target.value)
                setFindingSearchWarning('')
              }}
              placeholder="Поиск"
              type="text"
              value={findingSearchQuery}
            />
            {findingSearchWarning && (
              <p className="search-warning">{findingSearchWarning}</p>
            )}
            <div className="saved-finding-list">
              {filteredSavedFindings.length > 0 ? (
                filteredSavedFindings.map((finding) => (
                  <button
                    className="saved-finding-item"
                    key={finding.id}
                    onClick={() => insertSavedFindingFromSearch(finding)}
                    type="button"
                  >
                    <strong>{finding.name}</strong>
                    {finding.description && (
                      <span>{finding.description}</span>
                    )}
                    {finding.conclusion && (
                      <span className="saved-finding-conclusion">
                        {finding.conclusion}
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <p className="saved-finding-empty">Ничего не найдено</p>
              )}
            </div>
          </section>
        </div>
      )}

    </main>
  )
}

export default App
