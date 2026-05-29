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
import ProtocolDownloadSaveDialogPanel, {
  type ProtocolDownloadFindingSaveItem,
  type ProtocolDownloadSaveDialogState,
  type ProtocolDownloadSaveItem,
  type ProtocolDownloadSectionCurrentSaveItem,
  type ProtocolDownloadSectionOptionSaveItem,
  type ProtocolDownloadSectionSaveMode,
  type ProtocolDownloadSectionStructureSaveItem,
} from './components/ProtocolDownloadSaveDialog'
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
  PassportCustomFieldDefinition,
  PatientSex,
  ProtocolExportSettings,
  ProtocolHeaderAlignment,
  ProtocolSectionStyle,
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
  findingFolderCreateSelectPrefix,
  findingFolderRootSelectValue,
  findingFolderSelectPrefix,
  getRootFindingFolderByName,
  normalizeFindingFolderName,
} from './utils/findingFolders'
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
  applyPassportCustomFieldDefinitions,
  createDefaultPassportData,
  createPassportFieldId,
  formatDateInputValue,
  formatPatientShortName,
  formatTimeInputValue,
  getPassportCustomFieldDefinitions,
  getPassportCollapsedTitle,
  mergePassportCustomFieldDefinitions,
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
  protocolDocumentFontOptions,
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
  adjustTrackedRangesForEdit,
  adjustTrackedRangesForReplacement,
  clampTextRange,
  createCollapsedTextRange,
  doesTextChangeTouchRange,
  getAnchoredInsertionTextChange,
  getRangeOverlap,
  getTextChange,
  getTextChangeDelta,
  getTextChangeFromEdit,
  isOffsetInRange,
  isSameRange,
  mapRangeThroughTextChange,
  mergeTextRanges,
  trackTextChangeRange,
} from './utils/textRanges'
import {
  createMarkerOptionVariantToken,
  getMarkerOptionComparableValue,
  getMarkerTemplateParts,
  hasMarkerOptionVariantChange,
  parseMarkerOptionVariantToken,
} from './utils/markerOptions'
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
const terminalMarkerLabel = 'К'
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
const semanticBlockOpen = '{'
const semanticBlockClose = '}'
const protocolHeaderFontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36]
const protocolHeaderAlignments: Array<{
  label: string
  title: string
  value: ProtocolHeaderAlignment
}> = [
  { label: 'Л', title: 'По левому краю', value: 'left' },
  { label: 'Ц', title: 'По центру', value: 'center' },
  { label: 'П', title: 'По правому краю', value: 'right' },
  { label: 'Ш', title: 'По ширине страницы', value: 'justify' },
]
const protocolPageMarginFields: Array<{
  key: keyof ProtocolExportSettings['pageMargins']
  label: string
}> = [
  { key: 'top', label: 'Верхнее' },
  { key: 'right', label: 'Правое' },
  { key: 'bottom', label: 'Нижнее' },
  { key: 'left', label: 'Левое' },
]
type ProtocolSectionStyleKey =
  | 'passportStyle'
  | 'descriptionStyle'
  | 'conclusionStyle'

type ProtocolSectionTextFormatKey = 'bold' | 'italic' | 'underline'

const protocolSectionStyleFields: Array<{
  key: ProtocolSectionStyleKey
  label: string
}> = [
  { key: 'passportStyle', label: 'Паспортная часть' },
  { key: 'descriptionStyle', label: 'Описание' },
  { key: 'conclusionStyle', label: 'Заключение' },
]

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
  defaultOptionIndex: null,
  id: createSegmentId(),
  type: 'marker',
  title: '',
  options: [{ findingIds: [], title: '', value: '' }],
  selectedOptionIndex: null,
})

const createEmptyMarkerOption = (): MarkerOption => ({
  findingIds: [],
  title: '',
  value: '',
})

const createManualMarkerOption = (): MarkerOption => ({
  findingIds: [],
  title: 'Новая заготовка',
  value: '',
})

const standardMarkerOptionTitle = 'Начальная'
const legacyStandardMarkerOptionTitles = new Set(['Стандартный'])
const defaultMarkerOptionIcon = '★'

const markerBoundaryReminderText =
  'Добавьте метку # ниже, чтобы указать границы раздела'

const markerOptionHasContent = (option: MarkerOption) =>
  Boolean(option.title.trim() || option.value.trim() || option.findingIds.length)

const copyMarkerOption = (option: MarkerOption): MarkerOption => ({
  findingIds: [...option.findingIds],
  title: option.title,
  value: option.value,
})

const areMarkerOptionsEqual = (
  firstOptions: MarkerOption[],
  secondOptions: MarkerOption[],
) =>
  firstOptions.length === secondOptions.length &&
  firstOptions.every(
    (option, index) =>
      option.title === secondOptions[index]?.title &&
      option.findingIds.join('\n') ===
        secondOptions[index]?.findingIds.join('\n') &&
      option.value === secondOptions[index]?.value,
  )

const areMarkerOptionsSavedEqual = (
  firstOption: MarkerOption | null | undefined,
  secondOption: MarkerOption | null | undefined,
) => {
  if (!firstOption || !secondOption) {
    return false
  }

  return (
    firstOption.title.trim() === secondOption.title.trim() &&
    getMarkerOptionComparableValue(firstOption.value) ===
      getMarkerOptionComparableValue(secondOption.value) &&
    firstOption.findingIds.join('\n') === secondOption.findingIds.join('\n')
  )
}

const getMarkerOptionState = (
  segment: MarkerSegment,
  blockInfo: ReturnType<typeof getMarkerBlockInfo> | null,
) => {
  const meaningfulOptions = segment.options
    .map((option, originalIndex) => ({ option, originalIndex }))
    .filter(({ option }) => markerOptionHasContent(option))
  const selectedMeaningfulIndex =
    segment.selectedOptionIndex === null
      ? null
      : meaningfulOptions.findIndex(
          ({ originalIndex }) => originalIndex === segment.selectedOptionIndex,
        )
  const normalizedSelectedIndex =
    selectedMeaningfulIndex === -1 ? null : selectedMeaningfulIndex
  const defaultMeaningfulIndex =
    segment.defaultOptionIndex === null
      ? null
      : meaningfulOptions.findIndex(
          ({ originalIndex }) => originalIndex === segment.defaultOptionIndex,
        )
  const normalizedDefaultIndex =
    defaultMeaningfulIndex === -1 ? null : defaultMeaningfulIndex

  if (!blockInfo?.hasNextMarker) {
    return {
      defaultOptionIndex: normalizedDefaultIndex,
      options: meaningfulOptions.map(({ option }) => copyMarkerOption(option)),
      selectedOptionIndex: normalizedSelectedIndex,
    }
  }

  const standardOption: MarkerOption = {
    findingIds: [],
    title: '',
    value: blockInfo.value,
  }

  if (!meaningfulOptions.length) {
    return {
      defaultOptionIndex: 0,
      options: [standardOption],
      selectedOptionIndex: null,
    }
  }

  const options = meaningfulOptions.map(({ option }) => copyMarkerOption(option))
  const standardOptionCandidate = options[0]

  options[0] = {
    ...standardOptionCandidate,
    title: legacyStandardMarkerOptionTitles.has(
      standardOptionCandidate.title.trim(),
    )
      ? standardMarkerOptionTitle
      : standardOptionCandidate.title,
    value: standardOptionCandidate.value.trim()
      ? standardOptionCandidate.value
      : blockInfo.value,
  }

  return {
    defaultOptionIndex: normalizedDefaultIndex ?? 0,
    options,
    selectedOptionIndex: normalizedSelectedIndex,
  }
}

const isStandardMarkerOptionIndex = (
  index: number,
  blockInfo: ReturnType<typeof getMarkerBlockInfo> | null,
) => Boolean(blockInfo?.hasNextMarker && index === 0)

const canDeleteMarkerOption = (
  _option: MarkerOption,
  blockInfo: ReturnType<typeof getMarkerBlockInfo> | null,
  index: number,
) => !isStandardMarkerOptionIndex(index, blockInfo)

const getResolvedMarkerOptionIndex = (
  optionState: ReturnType<typeof getMarkerOptionState>,
  blockInfo: ReturnType<typeof getMarkerBlockInfo> | null,
) => {
  if (
    optionState.selectedOptionIndex !== null &&
    optionState.selectedOptionIndex < optionState.options.length
  ) {
    return optionState.selectedOptionIndex
  }

  if (
    optionState.defaultOptionIndex !== null &&
    optionState.defaultOptionIndex < optionState.options.length
  ) {
    return optionState.defaultOptionIndex
  }

  if (!blockInfo?.hasNextMarker || !optionState.options.length) {
    return null
  }

  return 0
}

const getMarkerOptionLabel = (
  option: MarkerOption,
  index: number,
  blockInfo: ReturnType<typeof getMarkerBlockInfo> | null,
) =>
  option.title.trim() ||
  (isStandardMarkerOptionIndex(index, blockInfo)
    ? standardMarkerOptionTitle
    : `Заготовка ${index + 1}`)

const getMarkerOptionTextareaKey = (markerId: number, index: number) =>
  `${markerId}:${index}`

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
  value
    .replaceAll(markerText, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const getProtocolSavePreviewText = (value: string, maxLength = 120) => {
  const text = getFindingLabelText(value)

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text
}

const stripSemanticBlockBraces = (value: string) => value.replace(/[{}]/g, '')

const getTemplatePreviewText = (template: ProtocolTemplate) => {
  const previewText = [
    getContentText(template.descriptionContent),
    getContentText(template.conclusionContent),
  ].join(' ')

  return getFindingLabelText(previewText) || 'Пустой шаблон'
}

const segmentToProtocolText = (segment: EditorSegment) => {
  if (segment.type === 'text') {
    return stripSemanticBlockBraces(segment.text)
  }

  if (segment.type === 'variant' || segment.type === 'number') {
    return segment.value
  }

  return '\n'
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

const getLegacySentenceRanges = (text: string) => {
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

const hasSemanticBlockSyntax = (text: string) =>
  text.includes(semanticBlockOpen) || text.includes(semanticBlockClose)

const getSemanticBlockInfos = (text: string) => {
  const blocks: Array<TextRange & { contentEnd: number; contentStart: number }> = []
  let blockStart: number | null = null

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (char === semanticBlockOpen && blockStart === null) {
      blockStart = index
      continue
    }

    if (char === semanticBlockClose && blockStart !== null) {
      const contentStart = blockStart + 1
      const contentEnd = index
      const trimmedRange = trimRangeWhitespace(text, {
        start: contentStart,
        end: contentEnd,
      })

      if (trimmedRange) {
        blocks.push({
          ...trimmedRange,
          contentEnd,
          contentStart,
        })
      }

      blockStart = null
    }
  }

  return blocks
}

const getSemanticBlockRanges = (text: string) =>
  getSemanticBlockInfos(text).map(({ start, end }) => ({ start, end }))

const getSemanticBlockAtOffset = (text: string, offset: number) => {
  const normalizedOffset = Math.max(0, Math.min(offset, text.length))
  let blockStart: number | null = null

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (char === semanticBlockOpen && blockStart === null) {
      blockStart = index
      continue
    }

    if (char === semanticBlockClose && blockStart !== null) {
      if (normalizedOffset > blockStart && normalizedOffset <= index) {
        return {
          contentEnd: index,
          contentStart: blockStart + 1,
          end: index + 1,
          start: blockStart,
        }
      }

      blockStart = null
    }
  }

  return null
}

const getPreviousSemanticBlock = (text: string, offset: number) => {
  const normalizedOffset = Math.max(0, Math.min(offset, text.length))

  return (
    getSemanticBlockInfos(text)
      .map((block) => ({
        contentEnd: block.contentEnd,
        contentStart: block.contentStart,
        end: block.contentEnd + 1,
        start: block.contentStart - 1,
      }))
      .filter((block) => block.end <= normalizedOffset)
      .at(-1) ?? null
  )
}

const getOffsetAfterActiveSemanticBlock = (text: string, offset: number) => {
  const block = getSemanticBlockAtOffset(text, offset)

  if (!block) {
    return offset
  }

  let nextOffset = block.end

  while (text[nextOffset] === ' ' || text[nextOffset] === '\t') {
    nextOffset += 1
  }

  return nextOffset
}

const getSentenceRanges = (text: string) => getSemanticBlockRanges(text)

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

const expandRangeToSemanticBlock = (text: string, range: TextRange) => {
  const block =
    getSemanticBlockAtOffset(text, range.start) ??
    getSemanticBlockAtOffset(text, range.end)

  if (block) {
    return (
      trimRangeWhitespace(text, {
        start: block.contentStart,
        end: block.contentEnd,
      }) ?? { start: block.contentStart, end: block.contentStart }
    )
  }

  return getBestOverlappingFindingRange(text, range) ?? range
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

const excludeSemanticBlockBracesFromHighlightRanges = (
  text: string,
  ranges: TextRange[],
) =>
  ranges.flatMap((range) => {
    const start = Math.max(0, Math.min(range.start, text.length))
    const end = Math.max(start, Math.min(range.end, text.length))
    const pieces: TextRange[] = []
    let pieceStart: number | null = null

    for (let index = start; index < end; index += 1) {
      const char = text[index]

      if (char === semanticBlockOpen || char === semanticBlockClose) {
        if (pieceStart !== null && pieceStart < index) {
          pieces.push({ start: pieceStart, end: index })
        }

        pieceStart = null
        continue
      }

      pieceStart ??= index
    }

    if (pieceStart !== null && pieceStart < end) {
      pieces.push({ start: pieceStart, end })
    }

    return pieces.flatMap((piece) => {
      const trimmedPiece = trimRangeWhitespace(text, piece)

      return trimmedPiece ? [trimmedPiece] : []
    })
  })

const getPreviousNonWhitespaceIndex = (text: string, index: number) => {
  for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
    if (!/\s/.test(text[currentIndex])) {
      return currentIndex
    }
  }

  return null
}

const getNextNonWhitespaceIndex = (text: string, index: number) => {
  for (
    let currentIndex = Math.max(0, index);
    currentIndex < text.length;
    currentIndex += 1
  ) {
    if (!/\s/.test(text[currentIndex])) {
      return currentIndex
    }
  }

  return null
}

const isSentenceTerminalChar = (char: string | undefined) =>
  char === '.' || char === '\u2026'

const isSentenceGapWhitespace = (
  text: string,
  start: number,
  end: number,
) => {
  const previousIndex = getPreviousNonWhitespaceIndex(text, start)
  const nextIndex = getNextNonWhitespaceIndex(text, end)

  return (
    previousIndex !== null &&
    nextIndex !== null &&
    isSentenceTerminalChar(text[previousIndex])
  )
}

const getProtocolChangeHighlightRanges = (text: string, range: TextRange) => {
  const trimmedRange = trimRangeWhitespace(text, range)

  if (!trimmedRange) {
    return []
  }

  const ranges: TextRange[] = []
  let cursor = trimmedRange.start
  let index = trimmedRange.start

  while (index < trimmedRange.end) {
    if (!/\s/.test(text[index])) {
      index += 1
      continue
    }

    const whitespaceStart = index

    while (index < trimmedRange.end && /\s/.test(text[index])) {
      index += 1
    }

    if (isSentenceGapWhitespace(text, whitespaceStart, index)) {
      if (cursor < whitespaceStart) {
        ranges.push({ start: cursor, end: whitespaceStart })
      }

      cursor = index
    }
  }

  if (cursor < trimmedRange.end) {
    ranges.push({ start: cursor, end: trimmedRange.end })
  }

  return excludeSemanticBlockBracesFromHighlightRanges(text, ranges)
}

const hasFindingContent = (value: string) =>
  /[0-9A-Za-zА-Яа-яЁё]/.test(value)

const isFindingText = (text: string, range: TextRange) => {
  const value = getRangeText(text, range).trim()

  return (
    Boolean(value) &&
    value !== markerText &&
    !value.endsWith(':') &&
    hasFindingContent(value)
  )
}

const getFindingRangeAtOffset = (text: string, offset: number) => {
  const range = getSentenceRangeAtOffset(text, offset)

  return range && isFindingText(text, range) ? range : null
}

const getFindingRanges = (text: string) =>
  getSentenceRanges(text).filter((range) => isFindingText(text, range))

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
  Boolean(getFindingLabelText(getRangeText(text, range)))

const getSentenceCompletionEdit = (
  text: string,
  range: TextRange,
): { previousRange: TextRange; text: string } | null => {
  void text
  void range

  return null
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

const findPairAtOffset = (
  pairs: FindingPair[],
  field: FieldName,
  offset: number,
) =>
  pairs.find((pair) => isOffsetInRange(getPairRange(pair, field), offset)) ??
  null

const getBestOverlappingFindingRange = (text: string, range: TextRange) =>
  getFindingRanges(text)
    .map((findingRange) => ({
      overlap: getRangeOverlap(findingRange, range),
      range: findingRange,
    }))
    .filter((item) => item.overlap > 0)
    .sort((first, second) => second.overlap - first.overlap)[0]?.range ?? null

const normalizePairRangeCandidate = (
  field: FieldName,
  range: TextRange,
  text: string,
) => {
  const candidate = clampTextRange(range, text)

  if (candidate.end <= candidate.start) {
    return field === 'conclusion'
      ? createCollapsedTextRange(candidate.start, text)
      : null
  }

  const findingRange = getBestOverlappingFindingRange(text, candidate)

  if (findingRange) {
    return findingRange
  }

  return field === 'conclusion'
    ? createCollapsedTextRange(candidate.start, text)
    : null
}

const adjustPairRangeForTextChange = (
  range: TextRange,
  field: FieldName,
  change: TextChange,
  nextText: string,
  isEditedPair: boolean,
) => {
  const isInsertion = change.previousRange.start === change.previousRange.end
  const insertedLength = change.nextRange.end - change.nextRange.start
  const deletedPairRange =
    !insertedLength &&
    range.end > range.start &&
    change.previousRange.start <= range.start &&
    change.previousRange.end >= range.end

  if (deletedPairRange) {
    return field === 'conclusion'
      ? createCollapsedTextRange(change.nextRange.start, nextText)
      : null
  }

  if (isInsertion && isEditedPair) {
    const start =
      change.previousRange.start <= range.start
        ? change.previousRange.start
        : range.start
    const nextRange = {
      start,
      end: Math.max(start, range.end + insertedLength),
    }

    return normalizePairRangeCandidate(field, nextRange, nextText)
  }

  const nextRange = mapRangeThroughTextChange(range, change)

  return isEditedPair
    ? normalizePairRangeCandidate(field, nextRange, nextText)
    : clampTextRange(nextRange, nextText)
}

const dedupeFindingPairsByDescription = (pairs: FindingPair[]) => {
  const result: FindingPair[] = []

  pairs.forEach((pair) => {
    const key = `${pair.description.start}:${pair.description.end}`
    const existingIndex = result.findIndex(
      (item) => `${item.description.start}:${item.description.end}` === key,
    )

    if (existingIndex === -1) {
      result.push(pair)
      return
    }

    const existing = result[existingIndex]
    const existingConclusionLength =
      existing.conclusion.end - existing.conclusion.start
    const conclusionLength = pair.conclusion.end - pair.conclusion.start

    if (
      conclusionLength > existingConclusionLength ||
      (!existing.savedFindingId && pair.savedFindingId)
    ) {
      result[existingIndex] = pair
    }
  })

  return result
}

const adjustPairsForFieldTextChange = (
  pairs: FindingPair[],
  field: FieldName,
  change: TextChange,
  preferredPairId: number | null,
  nextText: string,
) =>
  dedupeFindingPairsByDescription(
    pairs.flatMap((pair) => {
      const range = getPairRange(pair, field)
      const isPreferredPair = preferredPairId === pair.id
      const isEditedPair =
        doesTextChangeTouchRange(range, change) ||
        (isPreferredPair &&
          isOffsetInRange(range, change.previousRange.start))
      const nextRange = adjustPairRangeForTextChange(
        range,
        field,
        change,
        nextText,
        isEditedPair,
      )

      return nextRange ? [setPairRange(pair, field, nextRange)] : []
    }),
  )

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

  return adjustPairsForFieldTextChange(
    pairs,
    field,
    getTextChangeFromEdit(editStart, delta),
    preferredPairId,
    nextText,
  )
}

const createNumericTokenPattern = () => /( )(\d+(?:[.,]\d+)?)(?= )/g

const parseMarkerTemplateContent = (value: string) => {
  const segments: EditorSegment[] = []
  let cursor = 0

  while (cursor < value.length) {
    const variantStart = value.indexOf('[[', cursor)

    if (variantStart === -1) {
      const text = value.slice(cursor)

      if (text) {
        segments.push(createTextSegment(text))
      }
      break
    }

    if (variantStart > cursor) {
      segments.push(createTextSegment(value.slice(cursor, variantStart)))
    }

    const variantEnd = value.indexOf(']]', variantStart + 2)

    if (variantEnd === -1) {
      segments.push(createTextSegment(value.slice(variantStart)))
      break
    }

    const options = value
      .slice(variantStart + 2, variantEnd)
      .split('|')
      .map((option) => option.trim())
      .filter(Boolean)

    if (options.length) {
      segments.push({
        id: createSegmentId(),
        options,
        type: 'variant',
        value: options[0],
      })
    } else {
      segments.push(createTextSegment(value.slice(variantStart, variantEnd + 2)))
    }

    cursor = variantEnd + 2
  }

  return tokenizeNumericTextSegments(compactContent(segments))
}

const markerOptionValueToHtml = (value: string) =>
  getMarkerTemplateParts(value)
    .map((part) => {
      if (part.type === 'text') {
        return escapeHtml(part.text)
      }

      return `<span class="variant-token marker-option-variant-token" data-marker-option-variant="true" data-raw-start="${part.rawStart}" data-raw-end="${part.rawEnd}" data-options="${escapeHtml(
        JSON.stringify(part.options),
      )}" title="Варианты">${renderVariantValueHtml(part.value)}</span>`
    })
    .join('')

const parseMarkerOptionEditorValue = (editor: HTMLElement) => {
  let value = ''

  const appendLineBreak = () => {
    if (!value.endsWith('\n')) {
      value += '\n'
    }
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      value += node.textContent ?? ''
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    const element = node as HTMLElement

    if (element.dataset.markerOptionVariant) {
      let options: string[]

      try {
        const parsedOptions = JSON.parse(element.dataset.options ?? '[]')

        options = Array.isArray(parsedOptions)
          ? parsedOptions.map((option) =>
              typeof option === 'string' ? option : '',
            )
          : []
      } catch {
        options = []
      }

      const text = element.textContent?.trim() ?? ''
      const nextOptions = options.length
        ? options.map((option, index) => (index === 0 ? text : option))
        : [text]

      value += createMarkerOptionVariantToken(nextOptions)
      return
    }

    if (element.tagName === 'BR') {
      appendLineBreak()
      return
    }

    const isBlockElement = element.tagName === 'DIV' || element.tagName === 'P'

    if (isBlockElement && value) {
      appendLineBreak()
    }

    const valueBeforeBlock = value

    Array.from(element.childNodes).forEach(walk)

    if (isBlockElement) {
      if (value === valueBeforeBlock) {
        value += '\n'
      } else {
        appendLineBreak()
      }
    }
  }

  Array.from(editor.childNodes).forEach(walk)

  return value.endsWith('\n') ? value.slice(0, -1) : value
}

const getRawOffsetFromMarkerOptionDisplayOffset = (
  value: string,
  displayOffset: number,
) => {
  let rawCursor = 0
  let displayCursor = 0

  for (const part of getMarkerTemplateParts(value)) {
    if (part.type === 'text') {
      const length = part.text.length

      if (displayOffset <= displayCursor + length) {
        return part.rawStart + Math.max(0, displayOffset - displayCursor)
      }

      rawCursor = part.rawEnd
      displayCursor += length
      continue
    }

    const displayValue = part.value
    const length = displayValue.length

    if (displayOffset <= displayCursor + length) {
      return part.rawStart + 2 + Math.max(0, displayOffset - displayCursor)
    }

    rawCursor = part.rawEnd
    displayCursor += length
  }

  return rawCursor
}

const renderVariantValueHtml = (value: string) => {
  const numericPattern = createNumericTokenPattern()
  let cursor = 0
  let html = ''
  let match = numericPattern.exec(value)

  while (match) {
    const numberStart = match.index + match[1].length
    const numberEnd = numberStart + match[2].length

    html += escapeHtml(value.slice(cursor, numberStart))
    html += `<span class="variant-number-token">${escapeHtml(match[2])}</span>`
    cursor = numberEnd
    match = numericPattern.exec(value)
  }

  html += escapeHtml(value.slice(cursor))
  return html
}

const variantToHtml = (segment: VariantSegment) =>
  `<span class="variant-token" data-variant-id="${segment.id}" title="Варианты">${renderVariantValueHtml(segment.value)}</span>`

const numberToHtml = (segment: NumericSegment) =>
  `<span class="number-token" data-number-id="${segment.id}" title="Числовое значение">${escapeHtml(segment.value)}</span>`

const markerToHtml = (
  segment: MarkerSegment,
  markerNumber: number,
  activeMarkerId: number | null,
  isTerminalMarker = false,
) => {
  const label = isTerminalMarker ? terminalMarkerLabel : String(markerNumber)
  const className = [
    'section-marker-token',
    activeMarkerId === segment.id ? 'is-active' : '',
    activeMarkerId !== null && activeMarkerId !== segment.id ? 'is-muted' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const title = segment.title.trim()
  const titleText = isTerminalMarker
    ? 'Конец раздела'
    : title
      ? `Метка ${label}: ${title}`
      : `Метка ${label}`

  return `<span class="${className}" contenteditable="false" data-marker-id="${segment.id}" data-marker-label="${escapeHtml(label)}" aria-label="${escapeHtml(titleText)}" title="${escapeHtml(titleText)}">${markerText}</span>`
}

const textToEditorHtml = (value: string) =>
  escapeHtml(value)
    .replaceAll(
      semanticBlockOpen,
      `<span class="semantic-block-brace">${semanticBlockOpen}</span>`,
    )
    .replaceAll(
      semanticBlockClose,
      `<span class="semantic-block-brace">${semanticBlockClose}</span>`,
    )

const segmentToHtml = (
  segment: EditorSegment,
  markerNumber = 0,
  activeMarkerId: number | null = null,
  isTerminalMarker = false,
) => {
  if (segment.type === 'text') {
    return textToEditorHtml(segment.text)
  }

  if (segment.type === 'variant') {
    return variantToHtml(segment)
  }

  return segment.type === 'number'
    ? numberToHtml(segment)
    : markerToHtml(segment, markerNumber, activeMarkerId, isTerminalMarker)
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
  const contentText = getContentText(content)

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
    const isTerminalMarker =
      segment.type === 'marker' &&
      currentMarkerNumber > 1 &&
      !contentText.slice(segmentEnd).trim()

    if (!activeHighlights.length || !segmentClassName) {
      html += segmentToHtml(
        segment,
        currentMarkerNumber,
        activeMarkerId,
        isTerminalMarker,
      )
      return
    }

    if (segment.type !== 'text') {
      html +=
        segment.type === 'marker'
          ? segmentToHtml(
              segment,
              currentMarkerNumber,
              activeMarkerId,
              isTerminalMarker,
            )
          : wrapHtml(
              segmentToHtml(
                segment,
                currentMarkerNumber,
                activeMarkerId,
                isTerminalMarker,
              ),
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
        textToEditorHtml(value),
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

const getFindingRemovalRange = (text: string, range: TextRange) => {
  const block =
    getSemanticBlockAtOffset(text, range.start) ??
    getSemanticBlockAtOffset(text, Math.max(range.start, range.end - 1))

  if (!block) {
    return clampTextRange(range, text)
  }

  let end = block.end

  while (end < text.length && /[ \t]/.test(text[end])) {
    end += 1
  }

  return { start: block.start, end }
}

const removeTextRangesFromContent = (
  content: EditorSegment[],
  ranges: TextRange[],
) => {
  let nextContent = content
  const changes: Array<TextChange & { nextText: string }> = []
  const removalRanges = mergeTextRanges(ranges).sort(
    (first, second) => second.start - first.start,
  )

  removalRanges.forEach((range) => {
    const text = getContentText(nextContent)
    const safeRange = clampTextRange(range, text)

    if (safeRange.end <= safeRange.start) {
      return
    }

    nextContent = removeRangeFromContent(
      nextContent,
      safeRange.start,
      safeRange.end,
    )

    changes.push({
      nextRange: { start: safeRange.start, end: safeRange.start },
      nextText: getContentText(nextContent),
      previousRange: safeRange,
    })
  })

  return { changes, content: nextContent }
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

const ensureSemanticBlockSpacesInContent = (content: EditorSegment[]) => {
  const text = getContentText(content)
  let nextContent = content
  let shift = 0

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== semanticBlockClose) {
      continue
    }

    const nextChar = text[index + 1]

    if (nextChar && /\s/.test(nextChar)) {
      continue
    }

    nextContent = insertContentAtOffset(nextContent, index + 1 + shift, [
      createTextSegment(' '),
    ])
    shift += 1
  }

  return compactContent(nextContent)
}

const getSemanticWrapIntervals = (text: string) => {
  const intervals: TextRange[] = []
  let start = 0

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== markerText) {
      continue
    }

    if (start < index) {
      intervals.push({ start, end: index })
    }

    start = index + markerText.length
  }

  if (start < text.length) {
    intervals.push({ start, end: text.length })
  }

  return intervals
}

const wrapPlainTextInSemanticBlocks = (content: EditorSegment[]) => {
  const text = getContentText(content)

  if (!text.trim() || hasSemanticBlockSyntax(text)) {
    return ensureSemanticBlockSpacesInContent(content)
  }

  const ranges = getSemanticWrapIntervals(text).flatMap((interval) => {
    const intervalText = text.slice(interval.start, interval.end)

    return getLegacySentenceRanges(intervalText).flatMap((range) => {
      const trimmedRange = trimRangeWhitespace(intervalText, range)

      return trimmedRange
        ? [
            {
              start: interval.start + trimmedRange.start,
              end: interval.start + trimmedRange.end,
            },
          ]
        : []
    })
  })

  if (!ranges.length) {
    return content
  }

  let nextContent = content
  let shift = 0

  ranges.forEach((range) => {
    nextContent = insertContentAtOffset(nextContent, range.start + shift, [
      createTextSegment(semanticBlockOpen),
    ])
    shift += semanticBlockOpen.length
    nextContent = insertContentAtOffset(nextContent, range.end + shift, [
      createTextSegment(`${semanticBlockClose} `),
    ])
    shift += semanticBlockClose.length + 1
  })

  return ensureSemanticBlockSpacesInContent(compactContent(nextContent))
}

const ensureSemanticBlocksInContent = (content: EditorSegment[]) =>
  wrapPlainTextInSemanticBlocks(compactContent(content))

const completeFinalFindingInContent = (content: EditorSegment[]) =>
  ensureSemanticBlocksInContent(content)

const stripSemanticBlockBracesFromContent = (content: EditorSegment[]) =>
  compactContent(
    content.flatMap((segment): EditorSegment[] => {
      if (segment.type !== 'text') {
        return [segment]
      }

      const text = stripSemanticBlockBraces(segment.text)

      return text ? [{ ...segment, text }] : []
    }),
  )

const hasMalformedSemanticBlockSyntax = (text: string) => {
  let hasOpenBlock = false

  for (const char of text) {
    if (char === semanticBlockOpen) {
      if (hasOpenBlock) {
        return true
      }

      hasOpenBlock = true
      continue
    }

    if (char === semanticBlockClose) {
      if (!hasOpenBlock) {
        return true
      }

      hasOpenBlock = false
    }
  }

  return hasOpenBlock
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
    options: segment.options.map(copyMarkerOption),
  }
}

const copyContent = (content: EditorSegment[]) => content.map(copySegment)

const copySegmentWithFreshId = (segment: EditorSegment): EditorSegment => {
  if (segment.type === 'text') {
    return createTextSegment(segment.text)
  }

  if (segment.type === 'variant') {
    return {
      id: createSegmentId(),
      options: [...segment.options],
      type: 'variant',
      value: segment.value,
    }
  }

  if (segment.type === 'number') {
    return createNumericSegment(segment.value)
  }

  return {
    id: createSegmentId(),
    defaultOptionIndex: segment.defaultOptionIndex,
    options: segment.options.map(copyMarkerOption),
    selectedOptionIndex: segment.selectedOptionIndex,
    title: segment.title,
    type: 'marker',
  }
}

const copyContentWithFreshIds = (content: EditorSegment[]) =>
  content.map(copySegmentWithFreshId)

const sliceContentRange = (
  content: EditorSegment[],
  range: TextRange,
): EditorSegment[] => {
  let cursor = 0
  const fragment: EditorSegment[] = []

  content.forEach((segment) => {
    const text = segmentToText(segment)
    const segmentStart = cursor
    const segmentEnd = cursor + text.length
    cursor = segmentEnd

    if (segmentEnd <= range.start || segmentStart >= range.end) {
      return
    }

    if (segment.type === 'text') {
      const start = Math.max(0, range.start - segmentStart)
      const end = Math.min(text.length, range.end - segmentStart)
      const slicedText = text.slice(start, end)

      if (slicedText) {
        fragment.push(createTextSegment(slicedText))
      }

      return
    }

    fragment.push(copySegmentWithFreshId(segment))
  })

  return compactContent(fragment)
}

const getMarkerBlockValueRange = (
  content: EditorSegment[],
  blockInfo: NonNullable<ReturnType<typeof getMarkerBlockInfo>>,
) => {
  const text = getContentText(content)
  const start =
    text[blockInfo.blockStart] === '\n'
      ? blockInfo.blockStart + 1
      : blockInfo.blockStart
  const rawText = text.slice(start, blockInfo.blockEnd)
  const end =
    blockInfo.hasNextMarker && rawText.endsWith('\n')
      ? blockInfo.blockEnd - 1
      : blockInfo.blockEnd

  return { start, end: Math.max(start, end) }
}

const getMarkerMainBlockReplacementRange = (
  content: EditorSegment[],
  blockInfo: NonNullable<ReturnType<typeof getMarkerBlockInfo>>,
) => {
  const text = getContentText(content)
  const valueRange = getMarkerBlockValueRange(content, blockInfo)
  const mainBlock =
    getSemanticBlockInfos(text).find(
      (block) =>
        block.contentStart >= valueRange.start &&
        block.contentEnd <= valueRange.end,
    ) ?? null

  return mainBlock
    ? getFindingRemovalRange(text, mainBlock)
    : valueRange
}

const getVariantMarkerOptionValues = (segment: VariantSegment) => {
  const selectedValue = segment.value.trim()
  const values = [
    selectedValue,
    ...segment.options.filter((option) => option.trim() !== selectedValue),
  ].filter((option) => option.trim())

  return values.length ? values : [segment.value]
}

const segmentToMarkerOptionTemplateValue = (segment: EditorSegment) => {
  if (segment.type === 'text') {
    return stripSemanticBlockBraces(segment.text)
  }

  if (segment.type === 'variant') {
    return createMarkerOptionVariantToken(getVariantMarkerOptionValues(segment))
  }

  if (segment.type === 'number') {
    return segment.value
  }

  return ''
}

const getSingleSemanticBlockMarkerOptionValue = (
  content: EditorSegment[],
  blockInfo: NonNullable<ReturnType<typeof getMarkerBlockInfo>>,
) => {
  const valueRange = getMarkerBlockValueRange(content, blockInfo)
  const text = getContentText(content)
  const mainBlockRange =
    getSemanticBlockInfos(text).find(
      (block) =>
        block.contentStart >= valueRange.start &&
        block.contentEnd <= valueRange.end,
    ) ?? null
  const mainRange = mainBlockRange
    ? { start: mainBlockRange.start, end: mainBlockRange.end }
    : valueRange
  const value = sliceContentRange(content, mainRange)
    .map(segmentToMarkerOptionTemplateValue)
    .join('')
    .trim()

  return `${semanticBlockOpen}${value}${semanticBlockClose} `
}

const normalizeMarkerOptionStateForSectionSave = (
  content: EditorSegment[],
  blockInfo: NonNullable<ReturnType<typeof getMarkerBlockInfo>>,
  optionState: ReturnType<typeof getMarkerOptionState>,
) => {
  if (!blockInfo.hasNextMarker || !optionState.options.length) {
    return optionState
  }

  const mainBlockValue = getSingleSemanticBlockMarkerOptionValue(
    content,
    blockInfo,
  )

  return {
    ...optionState,
    options: optionState.options.map((option, index) =>
      index === 0 ? { ...option, value: mainBlockValue } : option,
    ),
  }
}

const areMarkerOptionTitlesAndFindingsEqual = (
  firstOption: MarkerOption | null | undefined,
  secondOption: MarkerOption | null | undefined,
) =>
  Boolean(
    firstOption &&
      secondOption &&
      firstOption.title.trim() === secondOption.title.trim() &&
      firstOption.findingIds.join('\n') === secondOption.findingIds.join('\n'),
  )

const getMarkerFindingRanges = (
  content: EditorSegment[],
  blockInfo: NonNullable<ReturnType<typeof getMarkerBlockInfo>>,
) => {
  const text = getContentText(content)
  const valueRange = getMarkerBlockValueRange(content, blockInfo)
  const blocks = getSemanticBlockInfos(text).filter(
    (block) =>
      block.contentStart >= valueRange.start &&
      block.contentEnd <= valueRange.end,
  )

  return blocks
    .slice(1)
    .map((block) => ({ start: block.start, end: block.end }))
    .filter((range) => hasFindingContent(getRangeText(text, range)))
}

const isAdditionalMarkerFindingRange = (
  content: EditorSegment[],
  range: TextRange,
) => {
  const markerId = getMarkerIdAtOffset(content, range.start)

  if (markerId === null) {
    return true
  }

  const blockInfo = getMarkerBlockInfo(content, markerId)

  if (!blockInfo) {
    return true
  }

  return getMarkerFindingRanges(content, blockInfo).some(
    (findingRange) => getRangeOverlap(findingRange, range) > 0,
  )
}

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

      return `marker:${segment.id}:${segment.title}:${segment.selectedOptionIndex}:${segment.defaultOptionIndex}:${JSON.stringify(
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

const getTerminalMarkerRange = (content: EditorSegment[]) => {
  const text = getContentText(content)
  const markerRanges = getMarkerRanges(content)

  if (markerRanges.length < 2) {
    return null
  }

  const lastMarkerRange = markerRanges.at(-1)

  return lastMarkerRange && !text.slice(lastMarkerRange.end).trim()
    ? lastMarkerRange
    : null
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

const ensureTerminalMarkerContent = (content: EditorSegment[]) => {
  const normalizedContent = ensureLeadingMarkerContent(content)

  if (getTerminalMarkerRange(normalizedContent)) {
    return normalizedContent
  }

  const text = getContentText(normalizedContent)
  const prefix = text && text[text.length - 1] !== '\n' ? '\n' : ''

  return compactContent([
    ...normalizedContent,
    ...(prefix ? [createTextSegment(prefix)] : []),
    createMarkerSegment(),
  ])
}

const getDescriptionParagraphs = (description: string) =>
  description
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

const createStartTemplateDescriptionContent = (description: string) => {
  const paragraphs = getDescriptionParagraphs(description)

  if (!paragraphs.length) {
    return ensureTerminalMarkerContent([])
  }

  return compactContent([
    ...paragraphs.flatMap((paragraph): EditorSegment[] => [
      createMarkerSegment(),
      createTextSegment(
        `${semanticBlockOpen}${paragraph}${semanticBlockClose}\n`,
      ),
    ]),
    createMarkerSegment(),
  ])
}

const getTemplateBuilderSectionMarkers = (content: EditorSegment[]) => {
  const markers = getMarkerMap(content)
  const terminalMarkerId = getTerminalMarkerRange(content)?.id ?? null

  return getMarkerRanges(content).flatMap((range, index) => {
    if (range.id === terminalMarkerId) {
      return []
    }

    const segment = markers.get(range.id)

    return segment ? [{ number: index + 1, segment }] : []
  })
}

const getSectionStructureMarkerEntries = (content: EditorSegment[]) => {
  const markers = getMarkerMap(content)
  const terminalMarkerId = getTerminalMarkerRange(content)?.id ?? null

  return getMarkerRanges(content).flatMap((range, index) => {
    if (range.id === terminalMarkerId) {
      return []
    }

    const segment = markers.get(range.id)

    return segment ? [{ id: range.id, number: index + 1, segment }] : []
  })
}

const getSectionStructureMarkerTitle = (
  segment: MarkerSegment,
  number: number,
) => segment.title.trim() || `Раздел ${number}`

const getSectionStructureChanges = (
  templateContent: EditorSegment[],
  currentContent: EditorSegment[],
) => {
  const templateEntries = getSectionStructureMarkerEntries(templateContent)
  const currentEntries = getSectionStructureMarkerEntries(currentContent)
  const templateIds = new Set(templateEntries.map((entry) => entry.id))
  const currentIds = new Set(currentEntries.map((entry) => entry.id))
  const addedSectionNames = currentEntries
    .filter((entry) => !templateIds.has(entry.id))
    .map((entry) =>
      getSectionStructureMarkerTitle(entry.segment, entry.number),
    )
  const removedSectionNames = templateEntries
    .filter((entry) => !currentIds.has(entry.id))
    .map((entry) =>
      getSectionStructureMarkerTitle(entry.segment, entry.number),
    )

  return addedSectionNames.length || removedSectionNames.length
    ? { addedSectionNames, removedSectionNames }
    : null
}

const formatSectionStructureChangeDetail = (
  changes: NonNullable<ReturnType<typeof getSectionStructureChanges>>,
) =>
  [
    changes.addedSectionNames.length
      ? `Добавлены: ${changes.addedSectionNames.join(', ')}`
      : '',
    changes.removedSectionNames.length
      ? `Удалены: ${changes.removedSectionNames.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('; ')

const insertSectionMarkerIntoContent = (
  content: EditorSegment[],
  offset: number,
) => {
  const normalizedContent = ensureLeadingMarkerContent(content)
  const text = getContentText(normalizedContent)
  const safeOffset = Math.max(0, Math.min(offset, text.length))
  const semanticBlock = getSemanticBlockAtOffset(text, safeOffset)
  const isInsideSemanticBlock =
    semanticBlock &&
    safeOffset > semanticBlock.contentStart &&
    safeOffset < semanticBlock.contentEnd
  const splitStart =
    isInsideSemanticBlock
      ? (() => {
          let index = safeOffset

          while (
            index > semanticBlock.contentStart &&
            /\s/.test(text[index - 1])
          ) {
            index -= 1
          }

          return index
        })()
      : safeOffset
  const splitEnd =
    isInsideSemanticBlock
      ? (() => {
          let index = safeOffset

          while (
            index < semanticBlock.contentEnd &&
            /\s/.test(text[index])
          ) {
            index += 1
          }

          return index
        })()
      : safeOffset
  const hasSplitLeftText =
    isInsideSemanticBlock &&
    getFindingLabelText(text.slice(semanticBlock.contentStart, splitStart))
  const hasSplitRightText =
    isInsideSemanticBlock &&
    getFindingLabelText(text.slice(splitEnd, semanticBlock.contentEnd))
  const shouldSplitSemanticBlock = Boolean(
    isInsideSemanticBlock && hasSplitLeftText && hasSplitRightText,
  )
  const terminalMarkerRange = getTerminalMarkerRange(normalizedContent)
  const baseInsertionOffset = shouldSplitSemanticBlock
    ? splitStart
    : isInsideSemanticBlock && !hasSplitLeftText && semanticBlock
      ? semanticBlock.start
      : isInsideSemanticBlock && !hasSplitRightText && semanticBlock
        ? semanticBlock.end
        : safeOffset
  const insertionOffset =
    terminalMarkerRange && baseInsertionOffset >= terminalMarkerRange.start
      ? terminalMarkerRange.start
      : baseInsertionOffset
  const marker = createMarkerSegment()
  const prefix =
    insertionOffset > 0 && text[insertionOffset - 1] !== '\n' ? '\n' : ''
  const insertedContent: EditorSegment[] = shouldSplitSemanticBlock
    ? [
        createTextSegment(`${semanticBlockClose}\n`),
        marker,
        createTextSegment(semanticBlockOpen),
      ]
    : prefix
      ? [createTextSegment(prefix), marker]
      : [marker]
  const nextContent = shouldSplitSemanticBlock
    ? replaceRangeWithContent(
        normalizedContent,
        splitStart,
        splitEnd,
        insertedContent,
      )
    : insertContentAtOffset(
        normalizedContent,
        insertionOffset,
        insertedContent,
      )
  const nextOffset = shouldSplitSemanticBlock
    ? splitStart +
      semanticBlockClose.length +
      1 +
      markerText.length +
      semanticBlockOpen.length
    : insertionOffset + prefix.length + markerText.length

  return {
    content: ensureLeadingMarkerContent(nextContent),
    marker,
    offset: nextOffset,
  }
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
      const numericPattern = createNumericTokenPattern()
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
        defaultOptionIndex: previousMarker?.defaultOptionIndex ?? null,
        id: Number.isNaN(id) ? createSegmentId() : id,
        title: previousMarker?.title ?? '',
        options: previousMarker?.options.length
          ? previousMarker.options.map(copyMarkerOption)
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
      return [{ findingIds: [], title: '', value: option }]
    }

    if (!isRecord(option)) {
      return []
    }

    return [
      {
        findingIds: Array.isArray(option.findingIds)
          ? option.findingIds.filter(
              (findingId): findingId is string => typeof findingId === 'string',
            )
          : [],
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
    const defaultOptionIndex =
      typeof value.defaultOptionIndex === 'number' &&
      Number.isInteger(value.defaultOptionIndex) &&
      value.defaultOptionIndex >= 0 &&
      value.defaultOptionIndex < options.length
        ? value.defaultOptionIndex
        : null

    return {
      defaultOptionIndex,
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
  ensureSemanticBlocksInContent(
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
    savedFindingId:
      typeof value.savedFindingId === 'string' && value.savedFindingId
        ? value.savedFindingId
        : null,
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

const sanitizePassportCustomFieldDefinitions = (value: unknown) =>
  mergePassportCustomFieldDefinitions(
    Array.isArray(value)
      ? value.flatMap((field): PassportCustomFieldDefinition[] => {
          if (!isRecord(field)) {
            return []
          }

          const label = sanitizeString(field.label).trim()

          if (!label) {
            return []
          }

          return [
            {
              id:
                typeof field.id === 'string' && field.id
                  ? field.id
                  : createPassportFieldId(),
              label,
            },
          ]
        })
      : [],
  )

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

type ProtocolSaveNotice = {
  fileName: string
  message: string
}

type MarkerOptionSelection = {
  markerId: number
  optionIndex: number
  start: number
  end: number
  text: string
}

type ActiveMarkerOptionVariant = {
  markerId: number
  optionIndex: number
  start: number
  end: number
}

type FindingNavigationState = {
  field: FieldName
  key: string
}

type NavigationHighlight = {
  field: FieldName
  range: TextRange
}

type SearchBrowserItem =
  | {
      folder: FindingFolder
      hasChildren: boolean
      isExpanded: boolean
      key: string
      level: number
      type: 'folder'
    }
  | {
      finding: SavedFinding
      key: string
      level: number
      type: 'finding'
    }

type PendingMarkerOptionSaveAction = {
  action: 'new' | 'update'
  markerId: number
}

function App() {
  const workspaceRef = useRef<HTMLElement>(null)
  const descriptionRef = useRef<HTMLDivElement>(null)
  const conclusionRef = useRef<HTMLDivElement>(null)
  const startTemplateDescriptionRef = useRef<HTMLDivElement>(null)
  const startTemplatePendingSelectionRef = useRef<TextRange | null>(null)
  const markerOptionTitleRefs = useRef(new Map<string, HTMLInputElement>())
  const markerOptionValueRefs = useRef(new Map<string, HTMLDivElement>())
  const markerOptionSelectionRef = useRef<MarkerOptionSelection | null>(null)
  const pendingSelectionRef = useRef<PendingSelection | null>(null)
  const lastActiveEditorRef = useRef<FieldName | null>(null)
  const lastDescriptionSelectionRef = useRef<PendingSelection | null>(null)
  const lastConclusionSelectionRef = useRef<PendingSelection | null>(null)
  const findingNavigationRef = useRef<FindingNavigationState | null>(null)
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
  const [
    passportCustomFieldDefinitions,
    setPassportCustomFieldDefinitions,
  ] = useState<PassportCustomFieldDefinition[]>([])
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
  const [startTemplateStep, setStartTemplateStep] = useState<1 | 2>(1)
  const [startTemplateDraft, setStartTemplateDraft] = useState(
    createEmptyStartTemplateDraft,
  )
  const [
    startTemplateDescriptionContent,
    setStartTemplateDescriptionContent,
  ] = useState<EditorSegment[]>(() => createStartTemplateDescriptionContent(''))
  const [startTemplateActiveMarkerId, setStartTemplateActiveMarkerId] =
    useState<number | null>(null)
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
  const [protocolSaveNotice, setProtocolSaveNotice] =
    useState<ProtocolSaveNotice | null>(null)
  const [protocolDownloadSaveDialog, setProtocolDownloadSaveDialog] =
    useState<ProtocolDownloadSaveDialogState | null>(null)
  const [findingSearchQuery, setFindingSearchQuery] = useState('')
  const [findingSearchWarning, setFindingSearchWarning] = useState('')
  const [expandedSearchFolderIds, setExpandedSearchFolderIds] = useState<
    string[]
  >([])
  const [activeSearchBrowserKey, setActiveSearchBrowserKey] = useState<
    string | null
  >(null)
  const [findingBrowserWarning, setFindingBrowserWarning] = useState('')
  const [editorWarning, setEditorWarning] = useState('')
  const [activeMarker, setActiveMarker] = useState<ActiveMarker | null>(null)
  const [markerDialogId, setMarkerDialogId] = useState<number | null>(null)
  const [
    pendingMarkerOptionSaveAction,
    setPendingMarkerOptionSaveAction,
  ] = useState<PendingMarkerOptionSaveAction | null>(null)
  const [pendingMarkerOptionTitleFocus, setPendingMarkerOptionTitleFocus] =
    useState<{ markerId: number; optionIndex: number } | null>(null)
  const [activeVariant, setActiveVariant] = useState<ActiveVariant | null>(null)
  const [activeMarkerOptionVariant, setActiveMarkerOptionVariant] =
    useState<ActiveMarkerOptionVariant | null>(null)
  const [activePairId, setActivePairId] = useState<number | null>(null)
  const [highlightedPairId, setHighlightedPairId] = useState<number | null>(null)
  const [navigationHighlight, setNavigationHighlight] =
    useState<NavigationHighlight | null>(null)
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

  useEffect(() => {
    if (!editorWarning) {
      return
    }

    const timeoutId = window.setTimeout(() => setEditorWarning(''), 2400)

    return () => window.clearTimeout(timeoutId)
  }, [editorWarning])

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
  const findingSearchBrowserItems = useMemo(() => {
    const expandedIds = new Set(expandedSearchFolderIds)
    const folderIds = new Set(findingFolders.map((folder) => folder.id))
    const getNormalizedParentId = (parentId: string | null) =>
      parentId && folderIds.has(parentId) ? parentId : null
    const getChildFolders = (parentId: string | null) =>
      findingFolders.filter(
        (folder) => getNormalizedParentId(folder.parentId) === parentId,
      )
    const getChildFindings = (parentId: string | null) =>
      savedFindings.filter(
        (finding) => getNormalizedParentId(finding.folderId) === parentId,
      )
    const items: SearchBrowserItem[] = []
    const addLevel = (parentId: string | null, level: number) => {
      getChildFolders(parentId).forEach((folder) => {
        const childFolders = getChildFolders(folder.id)
        const childFindings = getChildFindings(folder.id)
        const isExpanded = expandedIds.has(folder.id)

        items.push({
          folder,
          hasChildren: Boolean(childFolders.length || childFindings.length),
          isExpanded,
          key: `folder:${folder.id}`,
          level,
          type: 'folder',
        })

        if (isExpanded) {
          addLevel(folder.id, level + 1)
        }
      })

      getChildFindings(parentId).forEach((finding) => {
        items.push({
          finding,
          key: `finding:${finding.id}`,
          level,
          type: 'finding',
        })
      })
    }

    addLevel(null, 0)

    return items
  }, [expandedSearchFolderIds, findingFolders, savedFindings])
  const activeSearchBrowserItem = useMemo(
    () =>
      findingSearchBrowserItems.find(
        (item) => item.key === activeSearchBrowserKey,
      ) ??
      findingSearchBrowserItems[0] ??
      null,
    [activeSearchBrowserKey, findingSearchBrowserItems],
  )

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
  const protocolHeaderEditorStyle = useMemo(
    () =>
      ({
        fontFamily: `"${protocolExportSettingsDraft.documentFontFamily}", serif`,
        fontSize: `${protocolExportSettingsDraft.headerFontSize}pt`,
        fontStyle: protocolExportSettingsDraft.headerItalic
          ? 'italic'
          : 'normal',
        fontWeight: protocolExportSettingsDraft.headerBold ? 700 : 400,
        textAlign: protocolExportSettingsDraft.headerAlign,
        textDecoration: protocolExportSettingsDraft.headerUnderline
          ? 'underline'
          : 'none',
      }) as CSSProperties,
    [
      protocolExportSettingsDraft.documentFontFamily,
      protocolExportSettingsDraft.headerAlign,
      protocolExportSettingsDraft.headerBold,
      protocolExportSettingsDraft.headerFontSize,
      protocolExportSettingsDraft.headerItalic,
      protocolExportSettingsDraft.headerUnderline,
    ],
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

  const activeMarkerOptionVariantSegment = useMemo(() => {
    if (!activeMarkerOptionVariant) {
      return null
    }

    const markerSegment = descriptionContent.find(
      (segment): segment is MarkerSegment =>
        segment.type === 'marker' &&
        segment.id === activeMarkerOptionVariant.markerId,
    )
    const blockInfo = getMarkerBlockInfo(
      descriptionContent,
      activeMarkerOptionVariant.markerId,
    )
    const value = markerSegment
      ? getMarkerOptionState(markerSegment, blockInfo).options[
          activeMarkerOptionVariant.optionIndex
        ]?.value ?? ''
      : ''

    return parseMarkerOptionVariantToken(
      value,
      activeMarkerOptionVariant.start,
      activeMarkerOptionVariant.end,
    )
  }, [activeMarkerOptionVariant, descriptionContent])

  const visibleVariantSegment =
    activeMarkerOptionVariantSegment ?? activeVariantSegment

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

  const markerMenuBlock = useMemo(() => {
    if (!markerMenu) {
      return null
    }

    return getMarkerBlockInfo(descriptionContent, markerMenu.id)
  }, [descriptionContent, markerMenu])

  const markerMenuOptionState = useMemo(
    () =>
      markerMenuSegment
        ? getMarkerOptionState(markerMenuSegment, markerMenuBlock)
        : { defaultOptionIndex: null, options: [], selectedOptionIndex: null },
    [markerMenuBlock, markerMenuSegment],
  )
  const markerMenuOptions = markerMenuOptionState.options

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

  const markerContextMenuBlock = useMemo(() => {
    if (!markerContextMenu) {
      return null
    }

    return getMarkerBlockInfo(descriptionContent, markerContextMenu.id)
  }, [descriptionContent, markerContextMenu])

  const markerContextMenuOptionState = useMemo(
    () =>
      markerContextMenuSegment
        ? getMarkerOptionState(
            markerContextMenuSegment,
            markerContextMenuBlock,
          )
        : { defaultOptionIndex: null, options: [], selectedOptionIndex: null },
    [markerContextMenuBlock, markerContextMenuSegment],
  )
  const markerContextMenuSelectedOptionIndex = getResolvedMarkerOptionIndex(
    markerContextMenuOptionState,
    markerContextMenuBlock,
  )
  const markerContextMenuSelectedOption =
    markerContextMenuSelectedOptionIndex === null
      ? null
      : markerContextMenuOptionState.options[
          markerContextMenuSelectedOptionIndex
        ] ?? null
  const markerContextMenuSelectedOptionLabel = markerContextMenuSelectedOption
    ? getMarkerOptionLabel(
        markerContextMenuSelectedOption,
        markerContextMenuSelectedOptionIndex ?? 0,
        markerContextMenuBlock,
      )
    : 'Не выбрана'

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

  const markerDialogOptionState = useMemo(
    () =>
      markerDialogSegment
        ? getMarkerOptionState(markerDialogSegment, markerDialogBlock)
        : { defaultOptionIndex: null, options: [], selectedOptionIndex: null },
    [markerDialogBlock, markerDialogSegment],
  )
  const markerDialogOptions = markerDialogOptionState.options
  const shouldShowMarkerBoundaryReminder = Boolean(
    markerDialogBlock &&
      !markerDialogBlock.hasNextMarker &&
      markerDialogOptions.length === 0,
  )

  const descriptionHighlights = useMemo(() => {
    const highlights: HighlightRange[] = changedDescriptionRanges.flatMap(
      (range) =>
        getProtocolChangeHighlightRanges(descriptionText, range).map(
          (highlightRange) => ({
            ...highlightRange,
            className: 'protocol-change',
          }),
        ),
    )

    if (highlightedPair) {
      highlights.push({
        ...expandRangeToSemanticBlock(descriptionText, highlightedPair.description),
        className: 'finding-active',
      })
    }

    if (navigationHighlight?.field === 'description') {
      highlights.push({
        ...expandRangeToSemanticBlock(descriptionText, navigationHighlight.range),
        className: 'finding-active',
      })
    }

    return highlights
  }, [
    changedDescriptionRanges,
    descriptionText,
    highlightedPair,
    navigationHighlight,
  ])

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
      (range) =>
        getProtocolChangeHighlightRanges(conclusionText, range).map(
          (highlightRange) => ({
            ...highlightRange,
            className: 'protocol-change',
          }),
        ),
    )

    if (
      highlightedPair &&
      highlightedPair.conclusion.end > highlightedPair.conclusion.start
    ) {
      highlights.push({
        ...expandRangeToSemanticBlock(conclusionText, highlightedPair.conclusion),
        className: 'finding-active',
      })
    }

    if (navigationHighlight?.field === 'conclusion') {
      highlights.push({
        ...expandRangeToSemanticBlock(conclusionText, navigationHighlight.range),
        className: 'finding-active',
      })
    }

    return highlights
  }, [
    changedConclusionRanges,
    conclusionText,
    highlightedPair,
    navigationHighlight,
  ])

  const conclusionHtml = useMemo(
    () => contentToHtml(conclusionContent, conclusionHighlights),
    [conclusionContent, conclusionHighlights],
  )

  const startTemplateDescriptionHtml = useMemo(
    () =>
      contentToHtml(
        startTemplateDescriptionContent,
        [],
        startTemplateActiveMarkerId,
      ),
    [startTemplateActiveMarkerId, startTemplateDescriptionContent],
  )

  const startTemplateDescriptionText = useMemo(
    () => getContentText(startTemplateDescriptionContent),
    [startTemplateDescriptionContent],
  )

  const startTemplateSectionMarkers = useMemo(
    () => getTemplateBuilderSectionMarkers(startTemplateDescriptionContent),
    [startTemplateDescriptionContent],
  )

  const resetProtocolWorkspace = useCallback(() => {
    pendingSelectionRef.current = null
    lastActiveEditorRef.current = null
    lastDescriptionSelectionRef.current = null
    lastConclusionSelectionRef.current = null
    findingNavigationRef.current = null
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
    setStartTemplateStep(1)
    setStartTemplateDraft(createEmptyStartTemplateDraft())
    setStartTemplateDescriptionContent(createStartTemplateDescriptionContent(''))
    setStartTemplateActiveMarkerId(null)
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
    setNavigationHighlight(null)
    setActiveCursorField(null)
    setActiveDescriptionFindingRange(null)
    setEditorWarning('')
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

  useLayoutEffect(() => {
    const pendingSelection = startTemplatePendingSelectionRef.current

    if (
      !pendingSelection ||
      !isStartCreateDialogOpen ||
      startTemplateStep !== 2
    ) {
      return
    }

    const editor = startTemplateDescriptionRef.current

    if (editor) {
      editor.focus()
      const safeRange = keepRangeAfterLeadingMarker(
        startTemplateDescriptionContent,
        pendingSelection,
      )

      restoreSelection(editor, safeRange.start, safeRange.end)
    }

    startTemplatePendingSelectionRef.current = null
  }, [
    isStartCreateDialogOpen,
    startTemplateDescriptionContent,
    startTemplateStep,
  ])

  useLayoutEffect(() => {
    if (!pendingMarkerOptionTitleFocus) {
      return
    }

    const key = getMarkerOptionTextareaKey(
      pendingMarkerOptionTitleFocus.markerId,
      pendingMarkerOptionTitleFocus.optionIndex,
    )
    const input = markerOptionTitleRefs.current.get(key)

    if (!input) {
      return
    }

    input.focus()
    input.select()
    setPendingMarkerOptionTitleFocus(null)
  }, [markerDialogOptions, pendingMarkerOptionTitleFocus])

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
    if (!protocolSaveNotice) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setProtocolSaveNotice(null)
    }, 9000)

    return () => window.clearTimeout(timeoutId)
  }, [protocolSaveNotice])

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

  const rememberMarkerOptionSelection = (
    markerId: number,
    optionIndex: number,
    editor: HTMLDivElement,
  ) => {
    const selection = getSelectionOffsets(editor)
    const start = selection?.start ?? editor.textContent?.length ?? 0
    const end = selection?.end ?? start

    setContextMenu(null)
    markerOptionSelectionRef.current = {
      end,
      markerId,
      optionIndex,
      start,
      text: selection?.text ?? '',
    }
  }

  const getCurrentContent = (field: FieldName) =>
    field === 'description' ? descriptionContent : conclusionContent

  const getFreshContent = (field: FieldName) => {
    const editor = getEditor(field)
    const content = getCurrentContent(field)

    const freshContent = editor
      ? ensureSemanticBlockSpacesInContent(parseEditorContent(editor, content))
      : ensureSemanticBlockSpacesInContent(content)

    return field === 'description'
      ? ensureLeadingMarkerContent(freshContent)
      : freshContent
  }

  const applyPassportFieldDefinitionsToSession = (
    session: OpenProtocolSession,
    definitions = passportCustomFieldDefinitions,
  ): OpenProtocolSession => ({
    ...session,
    passportData: applyPassportCustomFieldDefinitions(
      session.passportData,
      definitions,
    ),
  })

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
    passportData: copyPassportData(
      applyPassportCustomFieldDefinitions(
        passportData,
        passportCustomFieldDefinitions,
      ),
    ),
    templateName,
    currentTemplateId,
    descriptionContent: copyContent(
      ensureSemanticBlocksInContent(getFreshContent('description')),
    ),
    conclusionContent: copyContent(
      ensureSemanticBlocksInContent(getFreshContent('conclusion')),
    ),
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
      passportCustomFields: passportCustomFieldDefinitions.map((field) => ({
        ...field,
      })),
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
    const sanitizedSessions = snapshot.openProtocolSessions.flatMap((item) => {
      const session = sanitizeOpenProtocolSession(item)

      return session ? [session] : []
    })
    const nextPassportCustomFieldDefinitions =
      mergePassportCustomFieldDefinitions(
        sanitizePassportCustomFieldDefinitions(snapshot.passportCustomFields),
        ...sanitizedSessions.map((session) =>
          getPassportCustomFieldDefinitions(session.passportData),
        ),
      )
    const nextSessions = sanitizedSessions.map((session) =>
      applyPassportFieldDefinitionsToSession(
        session,
        nextPassportCustomFieldDefinitions,
      ),
    )
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
    setPassportCustomFieldDefinitions(nextPassportCustomFieldDefinitions)
    setOpenProtocolSessions(nextSessions)
    setProtocolSessionCloseId(null)

    if (snapshot.hasOpenedProtocol && activeSession) {
      applyProtocolSession(activeSession, nextPassportCustomFieldDefinitions)
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
    passportCustomFieldDefinitions,
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

  function applyProtocolSession(
    session: OpenProtocolSession,
    definitions = passportCustomFieldDefinitions,
  ) {
    const normalizedSession = applyPassportFieldDefinitionsToSession(
      session,
      definitions,
    )

    syncSeedsFromProtocolContent(
      normalizedSession.descriptionContent,
      normalizedSession.conclusionContent,
      normalizedSession.findingPairs,
    )
    pendingSelectionRef.current = null
    lastActiveEditorRef.current = null
    lastDescriptionSelectionRef.current = null
    lastConclusionSelectionRef.current = null
    findingNavigationRef.current = null
    activeIncompleteFindingRef.current = null
    setDescriptionContent(copyContent(normalizedSession.descriptionContent))
    setConclusionContent(copyContent(normalizedSession.conclusionContent))
    setPassportData(copyPassportData(normalizedSession.passportData))
    setFindingPairs(normalizedSession.findingPairs.map(copyFindingPair))
    setNewDescriptionRanges(
      normalizedSession.newDescriptionRanges.map(copyTextRange),
    )
    setChangedDescriptionRanges(
      normalizedSession.changedDescriptionRanges.map(copyTextRange),
    )
    setChangedConclusionRanges(
      normalizedSession.changedConclusionRanges.map(copyTextRange),
    )
    setHasLoadedTemplate(normalizedSession.hasLoadedTemplate)
    setHasOpenedProtocol(true)
    setTemplateName(normalizedSession.templateName)
    setCurrentTemplateId(normalizedSession.currentTemplateId)
    setActiveProtocolSessionId(normalizedSession.id)
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
    setNavigationHighlight(null)
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

  const rememberConclusionSelection = (selection: TextRange, text: string) => {
    lastConclusionSelectionRef.current = createPendingSelection(
      'conclusion',
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

    if (
      passportCustomFieldDefinitions.some(
        (field) => field.label.trim().toLocaleLowerCase('ru-RU') ===
          label.toLocaleLowerCase('ru-RU'),
      )
    ) {
      setPassportCustomFieldDraft(null)
      return
    }

    const field: PassportCustomFieldDefinition = {
      id: createPassportFieldId(),
      label,
    }
    const nextDefinitions = mergePassportCustomFieldDefinitions(
      passportCustomFieldDefinitions,
      [field],
    )

    setPassportCustomFieldDefinitions(nextDefinitions)
    setPassportData((currentData) =>
      applyPassportCustomFieldDefinitions(currentData, nextDefinitions),
    )
    setOpenProtocolSessions((sessions) =>
      sessions.map((session) =>
        applyPassportFieldDefinitionsToSession(session, nextDefinitions),
      ),
    )
    setPassportCustomFieldDraft(null)
  }

  const deletePassportCustomField = (id: string) => {
    const nextDefinitions = passportCustomFieldDefinitions.filter(
      (field) => field.id !== id,
    )

    setPassportCustomFieldDefinitions(nextDefinitions)
    setPassportData((currentData) =>
      applyPassportCustomFieldDefinitions(currentData, nextDefinitions),
    )
    setOpenProtocolSessions((sessions) =>
      sessions.map((session) =>
        applyPassportFieldDefinitionsToSession(session, nextDefinitions),
      ),
    )
  }

  const updatePassportCustomField = (
    id: string,
    field: 'label' | 'value',
    value: string,
  ) => {
    if (field === 'label') {
      const nextDefinitions = passportCustomFieldDefinitions.map(
        (customField) =>
          customField.id === id ? { ...customField, label: value } : customField,
      )

      setPassportCustomFieldDefinitions(nextDefinitions)
      setOpenProtocolSessions((sessions) =>
        sessions.map((session) =>
          applyPassportFieldDefinitionsToSession(session, nextDefinitions),
        ),
      )
    }

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

  const getFindingSavedOrigin = (
    pair: FindingPair | null | undefined,
    description: string,
    conclusion: string,
  ) => {
    const linkedFinding = pair?.savedFindingId
      ? savedFindings.find((finding) => finding.id === pair.savedFindingId) ??
        null
      : null

    return (
      linkedFinding ??
      findSavedFindingMatch(savedFindings, description, conclusion)
    )
  }

  const removeLinkedConclusionsForDescriptionRanges = (
    content: EditorSegment[],
    pairs: FindingPair[],
    descriptionRanges: TextRange[],
  ) => {
    if (!descriptionRanges.length) {
      return { changes: [], content }
    }

    const text = getContentText(content)
    const removalRanges = pairs
      .filter(
        (pair) =>
          pair.conclusion.end > pair.conclusion.start &&
          descriptionRanges.some(
            (range) => getRangeOverlap(pair.description, range) > 0,
          ),
      )
      .map((pair) => getFindingRemovalRange(text, pair.conclusion))

    return removeTextRangesFromContent(content, removalRanges)
  }

  const getMarkerOptionDescriptionRemovalRanges = (
    content: EditorSegment[],
    blockInfo: NonNullable<ReturnType<typeof getMarkerBlockInfo>>,
    option: MarkerOption | null | undefined,
  ) => {
    if (!option?.findingIds.length) {
      return []
    }

    const text = getContentText(content)
    const remainingIds = new Map<string, number>()

    option.findingIds.forEach((findingId) => {
      remainingIds.set(findingId, (remainingIds.get(findingId) ?? 0) + 1)
    })

    return getMarkerFindingRanges(content, blockInfo).flatMap((range) => {
      const pair =
        findingPairs.find(
          (item) => getRangeOverlap(item.description, range) > 0,
        ) ?? null
      const savedFindingId = pair?.savedFindingId ?? null
      const remainingCount = savedFindingId
        ? remainingIds.get(savedFindingId) ?? 0
        : 0

      if (!savedFindingId || remainingCount <= 0) {
        return []
      }

      remainingIds.set(savedFindingId, remainingCount - 1)
      return [getFindingRemovalRange(text, range)]
    })
  }

  const deleteFindingSummary = (range: TextRange) => {
    const freshDescriptionContent = getFreshContent('description')
    const freshDescriptionText = getContentText(freshDescriptionContent)
    const descriptionRange =
      getBestOverlappingFindingRange(freshDescriptionText, range) ??
      clampTextRange(range, freshDescriptionText)

    if (descriptionRange.end <= descriptionRange.start) {
      return
    }

    const descriptionRemovalRange = getFindingRemovalRange(
      freshDescriptionText,
      descriptionRange,
    )
    const pairsToDelete = findingPairs.filter(
      (item) => getRangeOverlap(item.description, descriptionRemovalRange) > 0,
    )
    const descriptionRemoval = removeTextRangesFromContent(
      freshDescriptionContent,
      [descriptionRemovalRange],
    )
    const freshConclusionContent = getFreshContent('conclusion')
    const freshConclusionText = getContentText(freshConclusionContent)
    const conclusionRemovalRanges = pairsToDelete
      .filter((pair) => pair.conclusion.end > pair.conclusion.start)
      .map((pair) =>
        getFindingRemovalRange(freshConclusionText, pair.conclusion),
      )
    const conclusionRemoval = removeTextRangesFromContent(
      freshConclusionContent,
      conclusionRemovalRanges,
    )
    const nextDescriptionText = getContentText(descriptionRemoval.content)

    setDescriptionContent(
      ensureLeadingMarkerContent(descriptionRemoval.content),
    )
    setConclusionContent(conclusionRemoval.content)
    setFindingPairs((pairs) => {
      const survivingPairs = pairs.filter(
        (item) =>
          getRangeOverlap(item.description, descriptionRemovalRange) === 0,
      )
      const conclusionAdjustedPairs = conclusionRemoval.changes.reduce(
        (nextPairs, change) =>
          adjustPairsForFieldTextChange(
            nextPairs,
            'conclusion',
            change,
            null,
            change.nextText,
          ),
        survivingPairs,
      )

      return descriptionRemoval.changes.reduce(
        (nextPairs, change) =>
          adjustPairsForFieldTextChange(
            nextPairs,
            'description',
            change,
            null,
            change.nextText,
          ),
        conclusionAdjustedPairs,
      )
    })
    setNewDescriptionRanges((ranges) =>
      descriptionRemoval.changes.reduce(
        (nextRanges, change) =>
          adjustTrackedRangesForReplacement(
            nextRanges,
            change.previousRange,
            change.nextRange,
          ),
        ranges,
      ),
    )
    setChangedDescriptionRanges((ranges) =>
      descriptionRemoval.changes.reduce(
        (nextRanges, change) =>
          adjustTrackedRangesForReplacement(
            nextRanges,
            change.previousRange,
            change.nextRange,
          ),
        ranges,
      ),
    )
    setChangedConclusionRanges((ranges) =>
      conclusionRemoval.changes.reduce(
        (nextRanges, change) =>
          adjustTrackedRangesForReplacement(
            nextRanges,
            change.previousRange,
            change.nextRange,
          ),
        ranges,
      ),
    )

    const nextCursorOffset = Math.max(
      0,
      Math.min(descriptionRemovalRange.start, nextDescriptionText.length),
    )
    const nextSelection = createPendingSelection(
      'description',
      { start: nextCursorOffset, end: nextCursorOffset },
      nextDescriptionText,
      true,
    )

    pendingSelectionRef.current = nextSelection
    lastDescriptionSelectionRef.current = nextSelection
    lastActiveEditorRef.current = 'description'
    findingNavigationRef.current = null
    setActiveCursorField('description')
    setActiveDescriptionFindingRange(null)
    setActivePairId((current) =>
      current && pairsToDelete.some((pair) => pair.id === current)
        ? null
        : current,
    )
    setHighlightedPairId((current) =>
      current && pairsToDelete.some((pair) => pair.id === current)
        ? null
        : current,
    )
    setNavigationHighlight(null)
    setContextMenu(null)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setActiveVariant(null)
    setActiveMarkerOptionVariant(null)
  }

  const ensureMarkerBlockFindingReferences = (
    content: EditorSegment[],
    blockInfo: NonNullable<ReturnType<typeof getMarkerBlockInfo>>,
  ) => {
    const ranges = getMarkerFindingRanges(content, blockInfo)

    if (!ranges.length) {
      return []
    }

    const freshConclusionContent = getFreshContent('conclusion')
    const descriptionTextValue = getContentText(content)
    const conclusionTextValue = getContentText(freshConclusionContent)
    let nextFindings = savedFindings
    let hasNewFindings = false
    const pairLinks = new Map<number, string>()
    const findingIds: string[] = []

    ranges.forEach((range) => {
      const pair =
        findingPairs.find((item) => isSameRange(item.description, range)) ??
        getBestOverlappingPair(findingPairs, 'description', range)
      const conclusionRange =
        pair && pair.conclusion.end > pair.conclusion.start
          ? getBestOverlappingFindingRange(
              conclusionTextValue,
              pair.conclusion,
            ) ?? pair.conclusion
          : null
      const description = getFindingLabelText(
        getRangeText(descriptionTextValue, range),
      )
      const conclusion = conclusionRange
        ? getFindingLabelText(getRangeText(conclusionTextValue, conclusionRange))
        : ''

      if (!description && !conclusion) {
        return
      }

      const existingFinding = findSavedFindingMatch(
        nextFindings,
        description,
        conclusion,
      )
      const savedFindingId = existingFinding?.id ?? createSavedFindingId()

      if (!existingFinding) {
        const now = getTimestamp()

        nextFindings = [
          {
            id: savedFindingId,
            name: getDefaultFindingName(description, conclusion),
            description,
            descriptionContent: sliceContentRange(content, range),
            conclusion,
            conclusionContent: conclusionRange
              ? sliceContentRange(freshConclusionContent, conclusionRange)
              : [],
            folderId: null,
            createdAt: now,
            updatedAt: now,
          },
          ...nextFindings,
        ]
        hasNewFindings = true
      }

      findingIds.push(savedFindingId)

      if (pair) {
        pairLinks.set(pair.id, savedFindingId)
      }
    })

    if (hasNewFindings) {
      setSavedFindings(nextFindings)
    }

    if (pairLinks.size) {
      setFindingPairs((pairs) =>
        pairs.map((pair) =>
          pairLinks.has(pair.id)
            ? { ...pair, savedFindingId: pairLinks.get(pair.id) ?? null }
            : pair,
        ),
      )
    }

    return findingIds.filter(
      (findingId, index, ids) => ids.indexOf(findingId) === index,
    )
  }

  const getSavedFindingContent = (
    finding: SavedFinding,
    field: FieldName,
  ) => {
    const storedContent =
      field === 'description'
        ? finding.descriptionContent
        : finding.conclusionContent
    const fallbackText =
      field === 'description' ? finding.description : finding.conclusion

    if (storedContent?.length) {
      return copyContentWithFreshIds(storedContent)
    }

    return fallbackText.trim() ? [createTextSegment(fallbackText)] : []
  }

  const getSavedFindingDescriptionInsertContent = (finding: SavedFinding) => {
    const descriptionContent = getSavedFindingContent(finding, 'description')

    if (getContentText(descriptionContent).trim()) {
      return descriptionContent
    }

    return getSavedFindingContent(finding, 'conclusion')
  }

  const createSemanticFindingContent = (content: EditorSegment[]) =>
    ensureSemanticBlocksInContent(
      stripSemanticBlockBracesFromContent(copyContentWithFreshIds(content)),
    )

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

  const clearNavigationHighlightOutsideSelection = (
    field: FieldName,
    selection: TextRange,
  ) => {
    if (!navigationHighlight) {
      return
    }

    if (
      navigationHighlight.field !== field ||
      !isOffsetInRange(navigationHighlight.range, selection.end)
    ) {
      findingNavigationRef.current = null
      setNavigationHighlight(null)
    }
  }

  const getFindingNavigationKey = (range: TextRange) =>
    `${range.start}:${range.end}`

  const focusFindingFromSidebar = (
    field: FieldName,
    range: TextRange,
    text: string,
  ) => {
    const cursorOffset = Math.max(
      0,
      Math.min(range.start, range.end, text.length),
    )
    const cursorRange = { start: cursorOffset, end: cursorOffset }

    pendingSelectionRef.current = createPendingSelection(
      field,
      cursorRange,
      text,
      true,
    )
    lastActiveEditorRef.current = field
    setActiveCursorField(field)

    if (field === 'description') {
      rememberDescriptionSelection(cursorRange, text)
      return
    }

    rememberConclusionSelection(cursorRange, text)
  }

  const navigateFindingSummary = (range: TextRange) => {
    const pair = findPairForDescription(range)
    const key = getFindingNavigationKey(range)
    const hasConclusion = Boolean(
      pair && getFindingLabelText(getRangeText(conclusionText, pair.conclusion)),
    )
    const shouldGoToConclusion =
      findingNavigationRef.current?.key === key &&
      findingNavigationRef.current.field === 'description' &&
      hasConclusion
    const targetField: FieldName = shouldGoToConclusion
      ? 'conclusion'
      : 'description'
    const targetRange =
      targetField === 'conclusion' && pair ? pair.conclusion : range
    const targetText =
      targetField === 'conclusion' ? conclusionText : descriptionText

    focusFindingFromSidebar(targetField, targetRange, targetText)
    findingNavigationRef.current = { field: targetField, key }
    setActivePairId(pair?.id ?? null)
    setHighlightedPairId(pair?.id ?? null)
    setNavigationHighlight({ field: targetField, range: targetRange })
    setActiveDescriptionFindingRange(
      targetField === 'description' ? range : null,
    )
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant(null)
  }

  const closeFindingSaveDialog = () => {
    setFindingSaveDialog(null)
  }

  const linkFindingSaveDialogToSavedFinding = (savedFindingId: string) => {
    const dialog = findingSaveDialog

    if (!dialog) {
      return
    }

    setFindingPairs((pairs) => {
      const existingIndex = pairs.findIndex(
        (pair) =>
          (dialog.pairId !== null && pair.id === dialog.pairId) ||
          isSameRange(pair.description, dialog.descriptionRange) ||
          getRangeOverlap(pair.description, dialog.descriptionRange) > 0,
      )

      if (existingIndex !== -1) {
        return pairs.map((pair, index) =>
          index === existingIndex ? { ...pair, savedFindingId } : pair,
        )
      }

      return [
        ...pairs,
        {
          id: createPairId(),
          description: copyTextRange(dialog.descriptionRange),
          conclusion: { start: 0, end: 0 },
          savedFindingId,
        },
      ]
    })
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
              descriptionContent: copyContent(
                findingSaveDialog.descriptionContent,
              ),
              conclusion: findingSaveDialog.conclusion,
              conclusionContent: copyContent(findingSaveDialog.conclusionContent),
              folderId: finding.folderId,
              updatedAt: now,
            }
          : finding,
      ),
    )
    linkFindingSaveDialogToSavedFinding(findingSaveDialog.existingId)
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

    const savedFindingId = createSavedFindingId()

    setSavedFindings((findings) => [
      {
        id: savedFindingId,
        name,
        description: findingSaveDialog.description,
        descriptionContent: copyContent(findingSaveDialog.descriptionContent),
        conclusion: findingSaveDialog.conclusion,
        conclusionContent: copyContent(findingSaveDialog.conclusionContent),
        folderId: null,
        createdAt: now,
        updatedAt: now,
      },
      ...findings,
    ])
    linkFindingSaveDialogToSavedFinding(savedFindingId)
    setFindingSaveDialog(null)
  }

  const openFindingSearch = () => {
    setFindingSearchQuery('')
    setFindingSearchWarning('')
    setExpandedSearchFolderIds([])
    setActiveSearchBrowserKey(null)
    setIsFindingSearchOpen(true)
    setIsFindingBrowserOpen(false)
    setIsAppMenuOpen(false)
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant(null)
  }

  const closeFindingSearch = () => {
    setIsFindingSearchOpen(false)
    setFindingSearchWarning('')
  }

  const toggleSearchBrowserFolder = (folderId: string, forceOpen?: boolean) => {
    setExpandedSearchFolderIds((ids) => {
      const isExpanded = ids.includes(folderId)

      if (forceOpen === true || !isExpanded) {
        return isExpanded ? ids : [...ids, folderId]
      }

      return ids.filter((id) => id !== folderId)
    })
    setActiveSearchBrowserKey(`folder:${folderId}`)
  }

  const activateSearchBrowserItem = (item: SearchBrowserItem | null) => {
    if (!item) {
      return
    }

    setActiveSearchBrowserKey(item.key)

    if (item.type === 'folder') {
      if (item.hasChildren) {
        toggleSearchBrowserFolder(item.folder.id)
      }
      return
    }

    insertSavedFindingFromSearch(item.finding)
  }

  const moveSearchBrowserSelection = (direction: 1 | -1) => {
    if (!findingSearchBrowserItems.length) {
      return
    }

    const currentIndex = Math.max(
      0,
      findingSearchBrowserItems.findIndex(
        (item) => item.key === activeSearchBrowserKey,
      ),
    )
    const nextIndex = clampValue(
      currentIndex + direction,
      0,
      findingSearchBrowserItems.length - 1,
    )

    setActiveSearchBrowserKey(findingSearchBrowserItems[nextIndex].key)
  }

  const handleSearchBrowserKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (findingSearchQuery.trim() || !findingSearchBrowserItems.length) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSearchBrowserSelection(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSearchBrowserSelection(-1)
      return
    }

    if (event.key === 'ArrowRight' && activeSearchBrowserItem?.type === 'folder') {
      event.preventDefault()
      toggleSearchBrowserFolder(activeSearchBrowserItem.folder.id, true)
      return
    }

    if (
      event.key === 'ArrowLeft' &&
      activeSearchBrowserItem?.type === 'folder' &&
      activeSearchBrowserItem.isExpanded
    ) {
      event.preventDefault()
      toggleSearchBrowserFolder(activeSearchBrowserItem.folder.id, false)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      activateSearchBrowserItem(activeSearchBrowserItem)
    }
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
    const descriptionContentToInsert =
      getSavedFindingDescriptionInsertContent(finding)
    const conclusionContentToInsert = getSavedFindingContent(
      finding,
      'conclusion',
    )
    const textToInsert = getContentText(descriptionContentToInsert).trim()
    const conclusionToInsert = getContentText(conclusionContentToInsert).trim()

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
    const offset = getOffsetAfterActiveSemanticBlock(
      text,
      resolvedSelection.end,
    )
    const prefix = offset > 0 && !/\s/.test(text[offset - 1]) ? ' ' : ''
    const semanticInsertedContent = createSemanticFindingContent(
      descriptionContentToInsert,
    )
    const semanticInsertedText = getContentText(semanticInsertedContent)
    const suffix =
      text[offset] &&
      !/\s/.test(text[offset]) &&
      !/\s$/.test(semanticInsertedText)
        ? ' '
        : ''
    const insertedText = `${prefix}${semanticInsertedText}${suffix}`
    const insertedContent = compactContent([
      ...(prefix ? [createTextSegment(prefix)] : []),
      ...semanticInsertedContent,
      ...(suffix ? [createTextSegment(suffix)] : []),
    ])
    const nextContent = insertContentAtOffset(content, offset, insertedContent)
    const nextText = getContentText(nextContent)
    const insertedRange =
      getBestOverlappingFindingRange(nextText, {
        start: offset + prefix.length,
        end: offset + prefix.length + semanticInsertedText.length,
      }) ?? {
        start: offset + prefix.length,
        end: offset + prefix.length + semanticInsertedText.length,
      }
    const conclusionEditor = conclusionRef.current
    const freshConclusionContent = conclusionEditor
      ? parseEditorContent(conclusionEditor, conclusionContent)
      : conclusionContent
    const semanticConclusionContent = createSemanticFindingContent(
      conclusionContentToInsert,
    )
    const appendConclusionResult = conclusionToInsert
      ? appendContent(freshConclusionContent, semanticConclusionContent)
      : null
    const appendedConclusionText = appendConclusionResult
      ? getContentText(appendConclusionResult.content)
      : ''
    const appendedConclusionRange =
      appendConclusionResult &&
      appendConclusionResult.range.end > appendConclusionResult.range.start
        ? getBestOverlappingFindingRange(
            appendedConclusionText,
            appendConclusionResult.range,
          ) ?? appendConclusionResult.range
        : null
    const collapsedConclusionOffset = getContentText(freshConclusionContent).length
    const pairId = createPairId()

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

      return insertedRange.end > insertedRange.start
        ? [
            ...adjustedPairs,
            {
              id: pairId,
              description: insertedRange,
              conclusion: appendedConclusionRange ?? {
                start: collapsedConclusionOffset,
                end: collapsedConclusionOffset,
              },
              savedFindingId: finding.id,
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
    setActivePairId(pairId)
    setHighlightedPairId(pairId)
    findingNavigationRef.current = null
    setNavigationHighlight(null)
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
    } else {
      rememberConclusionSelection(selection, currentFieldText)
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
    clearNavigationHighlightOutsideSelection(field, selection)

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
      const delta = getTextChangeDelta(change)

      if (delta !== 0) {
        setFindingPairs((pairs) =>
          adjustPairsForFieldTextChange(
            pairs,
            field,
            change,
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

  const insertSpaceAfterVariantToken = (
    field: FieldName,
    editor: HTMLElement,
    variantToken: HTMLElement,
  ) => {
    const variantRange = getElementTextRange(editor, variantToken)
    const currentContent = parseEditorContent(editor, getCurrentContent(field))
    const currentText = getContentText(currentContent)
    const nextChar = currentText[variantRange.end]

    if (nextChar === ' ') {
      restoreSelection(editor, variantRange.end + 1, variantRange.end + 1)
      setActiveVariant(null)
      return
    }

    const nextContent = insertContentAtOffset(currentContent, variantRange.end, [
      createTextSegment(' '),
    ])
    const normalizedContent =
      field === 'description' ? ensureLeadingMarkerContent(nextContent) : nextContent
    const nextText = getContentText(normalizedContent)
    const nextOffset = Math.min(variantRange.end + 1, nextText.length)

    updateContent(field, () => normalizedContent)
    setFindingPairs((pairs) =>
      adjustPairsForFieldEdit(
        pairs,
        field,
        variantRange.end,
        1,
        activePairId,
        nextText,
      ),
    )

    if (field === 'description') {
      setNewDescriptionRanges((ranges) =>
        adjustTrackedRangesForEdit(ranges, variantRange.end, 1),
      )
      if (hasLoadedTemplate) {
        setChangedDescriptionRanges((ranges) =>
          adjustTrackedRangesForEdit(ranges, variantRange.end, 1),
        )
      }
    } else if (hasLoadedTemplate) {
      setChangedConclusionRanges((ranges) =>
        adjustTrackedRangesForEdit(ranges, variantRange.end, 1),
      )
    }

    pendingSelectionRef.current = createPendingSelection(
      field,
      { start: nextOffset, end: nextOffset },
      nextText,
      true,
    )
    setActiveVariant(null)
  }

  const applySemanticBlockContentChange = (
    field: FieldName,
    nextContent: EditorSegment[],
    nextCursorOffset: number,
  ) => {
    const previousText =
      field === 'description' ? descriptionText : conclusionText
    const normalizedContent =
      field === 'description' ? ensureLeadingMarkerContent(nextContent) : nextContent
    const nextText = getContentText(normalizedContent)
    const change = trackManualTextChange(field, previousText, nextText)

    if (change) {
      setFindingPairs((pairs) =>
        adjustPairsForFieldTextChange(
          pairs,
          field,
          change,
          activePairId,
          nextText,
        ),
      )
    }

    updateContent(field, () => normalizedContent)
    pendingSelectionRef.current = createPendingSelection(
      field,
      {
        start: Math.max(0, Math.min(nextCursorOffset, nextText.length)),
        end: Math.max(0, Math.min(nextCursorOffset, nextText.length)),
      },
      nextText,
      true,
    )
    lastActiveEditorRef.current = field
    setActiveCursorField(field)
  }

  const handleSemanticBlockKeyDown = (
    field: FieldName,
    editor: HTMLElement,
    event: KeyboardEvent<HTMLDivElement>,
    isPlainTextKey: boolean,
  ) => {
    const selection = getSelectionOffsets(editor)

    if (!selection) {
      return false
    }

    const currentContent = parseEditorContent(editor, getCurrentContent(field))
    const currentText = getContentText(currentContent)
    const blockAtCursor =
      selection.start === selection.end
        ? getSemanticBlockAtOffset(currentText, selection.end)
        : null

    if (event.key === ' ') {
      if (
        blockAtCursor &&
        selection.end <= blockAtCursor.contentEnd &&
        currentText[selection.end - 1] === ' '
      ) {
        event.preventDefault()

        let nextContent = removeRangeFromContent(
          currentContent,
          selection.end - 1,
          selection.end,
        )
        let nextText = getContentText(nextContent)
        const nextBlock =
          getSemanticBlockAtOffset(nextText, selection.end - 1) ??
          getPreviousSemanticBlock(nextText, selection.end - 1)

        if (!nextBlock) {
          return true
        }

        let nextCursorOffset: number

        if (nextText[nextBlock.end] !== ' ') {
          nextContent = insertContentAtOffset(nextContent, nextBlock.end, [
            createTextSegment(' '),
          ])
          nextText = getContentText(nextContent)
          nextCursorOffset = nextBlock.end + 1
        } else {
          nextCursorOffset = nextBlock.end + 1
        }

        applySemanticBlockContentChange(
          field,
          nextContent,
          Math.min(nextCursorOffset, nextText.length),
        )
        return true
      }

      if (!blockAtCursor) {
        event.preventDefault()
        return true
      }

      return false
    }

    if (!isPlainTextKey || blockAtCursor) {
      return false
    }

    event.preventDefault()

    const insertedText = `${semanticBlockOpen}${event.key}${semanticBlockClose} `
    const nextContent = replaceRangeWithContent(
      currentContent,
      selection.start,
      selection.end,
      [createTextSegment(insertedText)],
    )

    applySemanticBlockContentChange(
      field,
      nextContent,
      selection.start + semanticBlockOpen.length + event.key.length,
    )

    return true
  }

  const getSemanticMergeBoundary = (
    text: string,
    selection: TextRange,
    key: string,
  ) => {
    const boundaryPattern = /\}\s*\{/g
    let match = boundaryPattern.exec(text)

    while (match) {
      const boundary = {
        start: match.index,
        end: match.index + match[0].length,
      }

      if (selection.start === selection.end) {
        const offset = selection.end
        const isBackspaceBoundary =
          key === 'Backspace' && offset > boundary.start && offset <= boundary.end
        const isDeleteBoundary =
          key === 'Delete' && offset >= boundary.start && offset < boundary.end

        if (isBackspaceBoundary || isDeleteBoundary) {
          return boundary
        }
      } else if (
        selection.start >= boundary.start &&
        selection.end <= boundary.end &&
        getRangeOverlap(selection, boundary) > 0
      ) {
        return boundary
      }

      match = boundaryPattern.exec(text)
    }

    return null
  }

  const handleSemanticBlockBoundaryDelete = (
    field: FieldName,
    editor: HTMLElement,
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') {
      return false
    }

    const selection = getSelectionOffsets(editor)

    if (!selection) {
      return false
    }

    const currentContent = parseEditorContent(editor, getCurrentContent(field))
    const currentText = getContentText(currentContent)
    const boundary = getSemanticMergeBoundary(
      currentText,
      selection,
      event.key,
    )

    if (boundary) {
      event.preventDefault()
      applySemanticBlockContentChange(
        field,
        replaceRangeWithContent(currentContent, boundary.start, boundary.end, [
          createTextSegment(' '),
        ]),
        boundary.start + 1,
      )
      return true
    }

    if (selection.start !== selection.end) {
      if (/[{}]/.test(currentText.slice(selection.start, selection.end))) {
        event.preventDefault()

        let nextContent = removeRangeFromContent(
          currentContent,
          selection.start,
          selection.end,
        )
        let nextText = getContentText(nextContent)

        nextContent = hasMalformedSemanticBlockSyntax(nextText)
          ? ensureSemanticBlocksInContent(
              stripSemanticBlockBracesFromContent(nextContent),
            )
          : ensureSemanticBlockSpacesInContent(nextContent)
        nextText = getContentText(nextContent)

        applySemanticBlockContentChange(
          field,
          nextContent,
          Math.min(selection.start, nextText.length),
        )
        return true
      }

      return false
    }

    if (selection.start === selection.end) {
      const targetIndex =
        event.key === 'Backspace' ? selection.start - 1 : selection.start
      const targetChar = currentText[targetIndex]

      if (
        targetChar === semanticBlockOpen ||
        targetChar === semanticBlockClose
      ) {
        event.preventDefault()
        return true
      }

      return false
    }

    return false
  }

  const handleSemanticBlockSplit = (
    field: FieldName,
    editor: HTMLElement,
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (
      event.key !== semanticBlockClose ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return false
    }

    const selection = getSelectionOffsets(editor)

    if (!selection || selection.start !== selection.end) {
      return false
    }

    const currentContent = parseEditorContent(editor, getCurrentContent(field))
    const currentText = getContentText(currentContent)
    const block = getSemanticBlockAtOffset(currentText, selection.end)

    if (!block) {
      return false
    }

    const leftText = currentText
      .slice(block.contentStart, selection.end)
      .trim()
    const rightText = currentText
      .slice(selection.end, block.contentEnd)
      .trim()

    if (!leftText || !rightText) {
      event.preventDefault()
      return true
    }

    event.preventDefault()

    const replacementText = `${semanticBlockOpen}${leftText}${semanticBlockClose} ${semanticBlockOpen}${rightText}${semanticBlockClose} `
    const nextContent = replaceRangeWithContent(
      currentContent,
      block.start,
      block.end,
      [createTextSegment(replacementText)],
    )
    const nextCursorOffset =
      block.start +
      semanticBlockOpen.length +
      leftText.length +
      semanticBlockClose.length +
      1 +
      semanticBlockOpen.length

    applySemanticBlockContentChange(field, nextContent, nextCursorOffset)
    return true
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
    const parsedEditorContent = ensureSemanticBlockSpacesInContent(
      parseEditorContent(editor, currentContent),
    )
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
      ? selection
        ? getAnchoredInsertionTextChange(
            previousText,
            nextEditorText,
            selection.end,
          ) ?? getTextChange(previousText, nextEditorText)
        : getTextChange(previousText, nextEditorText)
      : null
    const nextNewDescriptionRanges =
      field === 'description' && textChange
        ? trackTextChangeRange(newDescriptionRanges, textChange)
        : newDescriptionRanges

    lastActiveEditorRef.current = field
    setActiveCursorField(field)

    if (field === 'description' && rawSelection) {
      rememberDescriptionSelection(rawSelection, nextEditorText)
    } else if (field === 'conclusion' && rawSelection) {
      rememberConclusionSelection(rawSelection, nextEditorText)
    }

    const editAnchor = textChange?.previousRange.start ?? editStart
    const pairAtEdit = selection
      ? findPairAtOffset(findingPairs, field, editAnchor)
      : null
    const pairIdForEdit = activePairId ?? pairAtEdit?.id ?? null
    const adjustedPairs =
      selection && textChange
        ? adjustPairsForFieldTextChange(
            findingPairs,
            field,
            textChange,
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
      clearNavigationHighlightOutsideSelection(field, selection)
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

    if (
      editor &&
      handleSemanticBlockBoundaryDelete(field, editor, event)
    ) {
      return
    }

    if (editor && handleSemanticBlockSplit(field, editor, event)) {
      return
    }

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

    if (token && editor && event.key === ' ') {
      const selectionOffsets = getSelectionOffsets(editor)
      const tokenRange = getElementTextRange(editor, token)

      if (
        selectionOffsets &&
        selectionOffsets.start === selectionOffsets.end
      ) {
        if (selectionOffsets.end >= tokenRange.end) {
          event.preventDefault()
          insertSpaceAfterVariantToken(field, editor, token)
        }

        return
      }
    }

    if (token && event.key === 'Enter') {
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

    if (
      editor &&
      !currentInteractiveToken &&
      handleSemanticBlockKeyDown(field, editor, event, isPlainTextKey)
    ) {
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
    const pastedText = event.clipboardData.getData('text/plain')
    const selection = getSelectionOffsets(event.currentTarget)
    const editorText = event.currentTarget.textContent ?? ''
    const isInsideBlock = selection
      ? Boolean(getSemanticBlockAtOffset(editorText, selection.end))
      : false
    const insertedText = isInsideBlock
      ? stripSemanticBlockBraces(pastedText)
      : getContentText(ensureSemanticBlocksInContent([
          createTextSegment(pastedText),
        ]))

    document.execCommand(
      'insertText',
      false,
      insertedText,
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

    if (!actionSelection && createMarkerOptionVariantFromSelection()) {
      return
    }

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

    if (/[{}]/.test(trimmedSelection.text)) {
      setEditorWarning('Недопустимый диапазон')
      setContextMenu(null)
      setMarkerMenu(null)
      setActiveMarkerOptionVariant(null)
      return
    }

    setEditorWarning('')
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
    setActiveMarkerOptionVariant(null)
    setActiveVariant({
      field: actionSelection.field,
      id: variant.id,
    })
  }

  const getConclusionFindingRangeFromSavedCursor = (
    content: EditorSegment[],
  ) => {
    if (
      lastActiveEditorRef.current !== 'conclusion' ||
      !lastConclusionSelectionRef.current
    ) {
      return null
    }

    const text = getContentText(content)
    const selection = resolvePendingSelection(
      text,
      lastConclusionSelectionRef.current,
    )
    const range = getFindingRangeAtOffset(text, selection.end)

    return range && isFindingText(text, range) ? { range, selection, text } : null
  }

  const activateFindingCapsule = (range: TextRange) => {
    const { completedConclusionContent, descriptionRange } =
      completeActiveIncompleteFindingForAction(range)
    const pair = findPairForDescription(descriptionRange)
    const conclusionEditor = getEditor('conclusion')
    const freshConclusionContent =
      completedConclusionContent ??
      (conclusionEditor
        ? parseEditorContent(conclusionEditor, conclusionContent)
        : conclusionContent)
    const conclusionCursorFinding =
      getConclusionFindingRangeFromSavedCursor(freshConclusionContent)

    if (conclusionCursorFinding) {
      const existingPairAtConclusion = getBestOverlappingPair(
        findingPairs,
        'conclusion',
        conclusionCursorFinding.range,
      )
      const nextPairId =
        pair?.id ?? existingPairAtConclusion?.id ?? createPairId()
      const savedFindingId =
        pair?.savedFindingId ?? existingPairAtConclusion?.savedFindingId ?? null

      setConclusionContent(freshConclusionContent)
      setFindingPairs((pairs) => {
        const nextPair: FindingPair = {
          id: nextPairId,
          description: descriptionRange,
          conclusion: conclusionCursorFinding.range,
          savedFindingId,
        }

        return [
          ...pairs.filter(
            (item) =>
              item.id !== nextPairId &&
              !isSameRange(item.description, descriptionRange) &&
              !isSameRange(item.conclusion, conclusionCursorFinding.range),
          ),
          nextPair,
        ]
      })
      setActivePairId(nextPairId)
      setHighlightedPairId(nextPairId)
      findingNavigationRef.current = null
      setNavigationHighlight(null)
      setContextMenu(null)
      setMarkerMenu(null)
      setActiveVariant(null)
      pendingSelectionRef.current = createPendingSelection(
        'conclusion',
        conclusionCursorFinding.selection,
        conclusionCursorFinding.text,
        true,
      )
      return
    }

    const pairConclusionText = pair
      ? getRangeText(conclusionText, pair.conclusion).trim()
      : ''

    if (pair && pairConclusionText) {
      setActivePairId(pair.id)
      setHighlightedPairId(pair.id)
      findingNavigationRef.current = null
      setNavigationHighlight(null)
      setContextMenu(null)
      setActiveVariant(null)
      return
    }

    const freshConclusionText = getContentText(freshConclusionContent)
    const separatorText =
      freshConclusionText && !/\s$/.test(freshConclusionText) ? ' ' : ''
    const insertionStart = freshConclusionText.length + separatorText.length
    const insertedBlockText = `${separatorText}${semanticBlockOpen}${semanticBlockClose} `
    const nextConclusionContent = insertContentAtOffset(
      freshConclusionContent,
      freshConclusionText.length,
      [createTextSegment(insertedBlockText)],
    )
    const nextConclusionText = getContentText(nextConclusionContent)
    const nextCursorOffset = insertionStart + semanticBlockOpen.length
    const nextPairId = pair?.id ?? createPairId()

    setConclusionContent(nextConclusionContent)
    setFindingPairs((pairs) =>
      pair
        ? pairs.map((item) =>
            item.id === pair.id
              ? {
                  ...item,
                  description: descriptionRange,
                  conclusion: {
                    start: nextCursorOffset,
                    end: nextCursorOffset,
                  },
                }
              : item,
          )
        : [
            ...pairs,
            {
              id: nextPairId,
              description: descriptionRange,
              conclusion: {
                start: nextCursorOffset,
                end: nextCursorOffset,
              },
            },
          ],
    )
    setActivePairId(nextPairId)
    setHighlightedPairId(nextPairId)
    findingNavigationRef.current = null
    setNavigationHighlight(null)
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveVariant(null)
    pendingSelectionRef.current = createPendingSelection(
      'conclusion',
      {
        start: nextCursorOffset,
        end: nextCursorOffset,
      },
      nextConclusionText,
      true,
    )
  }

  const openVariantPanel = (field: FieldName, id: number) => {
    setContextMenu(null)
    setMarkerMenu(null)
    setActiveMarker(null)
    setActiveMarkerOptionVariant(null)
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
        const markerBlock = getMarkerBlockInfo(descriptionContent, id)
        const options = getMarkerOptionState(markerSegment, markerBlock).options

        ensureMarkerStandardOption(id)
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
            Math.min(320, Math.max(1, options.length) * 40 + 12),
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
      const delta = getTextChangeDelta(change)

      if (delta !== 0) {
        setFindingPairs((pairs) =>
          adjustPairsForFieldTextChange(
            pairs,
            field,
            change,
            activePairId,
            nextText,
          ),
        )
      }
    }

    updateContent(field, () => nextContent)
  }

  const updateActiveMarkerOptionVariant = (
    updater: (variant: { value: string; options: string[] }) => {
      value: string
      options: string[]
    },
  ) => {
    if (!activeMarkerOptionVariant || !activeMarkerOptionVariantSegment) {
      return
    }

    const markerSegment = descriptionContent.find(
      (segment): segment is MarkerSegment =>
        segment.type === 'marker' &&
        segment.id === activeMarkerOptionVariant.markerId,
    )
    const blockInfo = getMarkerBlockInfo(
      descriptionContent,
      activeMarkerOptionVariant.markerId,
    )
    const option = markerSegment
      ? getMarkerOptionState(markerSegment, blockInfo).options[
          activeMarkerOptionVariant.optionIndex
        ] ?? null
      : null

    if (!option) {
      return
    }

    const nextVariant = updater({
      options: [...activeMarkerOptionVariantSegment.options],
      value: activeMarkerOptionVariantSegment.value,
    })
    const normalizedOptions = nextVariant.options.length
      ? nextVariant.options
      : [nextVariant.value]
    const nextToken = createMarkerOptionVariantToken(normalizedOptions)
    const nextValue = `${option.value.slice(
      0,
      activeMarkerOptionVariant.start,
    )}${nextToken}${option.value.slice(activeMarkerOptionVariant.end)}`

    changeMarkerOptionValue(
      activeMarkerOptionVariant.markerId,
      activeMarkerOptionVariant.optionIndex,
      nextValue,
    )
    setActiveMarkerOptionVariant({
      ...activeMarkerOptionVariant,
      end: activeMarkerOptionVariant.start + nextToken.length,
    })
  }

  const chooseVariantOption = (index: number) => {
    if (activeMarkerOptionVariant) {
      updateActiveMarkerOptionVariant((variant) => {
        const selectedOption = variant.options[index] ?? variant.value

        return {
          options: [
            selectedOption,
            ...variant.options.filter((_, optionIndex) => optionIndex !== index),
          ],
          value: selectedOption,
        }
      })
      return
    }

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
    if (activeMarkerOptionVariant) {
      updateActiveMarkerOptionVariant((variant) => ({
        ...variant,
        options: variant.options.map((option, optionIndex) =>
          optionIndex === index ? value : option,
        ),
        value: index === 0 ? value : variant.value,
      }))
      return
    }

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

  const deleteVariantOption = (index: number) => {
    if (activeMarkerOptionVariant) {
      updateActiveMarkerOptionVariant((variant) => {
        if (variant.options.length <= 1) {
          return variant
        }

        const options = variant.options.filter(
          (_, optionIndex) => optionIndex !== index,
        )

        return {
          options,
          value: options[0] ?? variant.value,
        }
      })
      return
    }

    if (!activeVariant) {
      return
    }

    updateVariant(
      activeVariant.field,
      activeVariant.id,
      (variant) => {
        if (index < 0 || index >= variant.options.length) {
          return variant
        }

        const deletedOption = variant.options[index]
        const options = variant.options.filter(
          (_, optionIndex) => optionIndex !== index,
        )
        const isSelectedOption = deletedOption === variant.value
        const nextValue = isSelectedOption
          ? options[Math.min(index, options.length - 1)] ?? variant.value
          : variant.value

        return {
          ...variant,
          options,
          value: nextValue,
        }
      },
      true,
    )
  }

  const addVariantOption = () => {
    if (activeMarkerOptionVariant) {
      updateActiveMarkerOptionVariant((variant) => ({
        ...variant,
        options: variant.options.includes('')
          ? variant.options
          : [...variant.options, ''],
      }))
      return
    }

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
    const insertion = insertSectionMarkerIntoContent(content, offset)
    const nextContent = insertion.content
    const nextText = getContentText(nextContent)
    const textChange = getTextChange(text, nextText)

    setDescriptionContent(nextContent)
    if (textChange) {
      setFindingPairs((pairs) =>
        adjustPairsForFieldTextChange(
          pairs,
          'description',
          textChange,
          activePairId,
          nextText,
        ),
      )
      setNewDescriptionRanges((ranges) =>
        adjustTrackedRangesForReplacement(
          ranges,
          textChange.previousRange,
          textChange.nextRange,
        ),
      )
      setChangedDescriptionRanges((ranges) =>
        adjustTrackedRangesForReplacement(
          ranges,
          textChange.previousRange,
          textChange.nextRange,
        ),
      )
    }
    setActiveMarker({ id: insertion.marker.id })
    setActiveVariant(null)
    setContextMenu(null)
    pendingSelectionRef.current = createPendingSelection(
      'description',
      {
        start: insertion.offset,
        end: insertion.offset,
      },
      nextText,
      true,
    )
  }

  const insertSemanticBlockAfterCursor = () => {
    const field = lastActiveEditorRef.current ?? 'description'
    const editor = getEditor(field)
    const content = getFreshContent(field)
    const text = getContentText(content)
    const selection = editor ? getSelectionOffsets(editor) : null
    const offset = selection?.end ?? text.length
    const activeBlock = getSemanticBlockAtOffset(text, offset)
    const insertionOffset = activeBlock?.end ?? offset
    const needsLeadingSpace =
      insertionOffset > 0 && text[insertionOffset - 1] !== ' '
    const insertedText = `${needsLeadingSpace ? ' ' : ''}${semanticBlockOpen}${semanticBlockClose} `
    const insertedContent = [createTextSegment(insertedText)]
    const nextContent = insertContentAtOffset(
      content,
      insertionOffset,
      insertedContent,
    )
    const nextText = getContentText(nextContent)
    const textChange = getTextChange(text, nextText)
    const nextOffset =
      insertionOffset +
      (needsLeadingSpace ? 1 : 0) +
      semanticBlockOpen.length

    updateContent(field, () => nextContent)

    if (textChange) {
      setFindingPairs((pairs) =>
        adjustPairsForFieldTextChange(
          pairs,
          field,
          textChange,
          activePairId,
          nextText,
        ),
      )

      if (field === 'description') {
        setNewDescriptionRanges((ranges) =>
          adjustTrackedRangesForReplacement(
            ranges,
            textChange.previousRange,
            textChange.nextRange,
          ),
        )
        setChangedDescriptionRanges((ranges) =>
          adjustTrackedRangesForReplacement(
            ranges,
            textChange.previousRange,
            textChange.nextRange,
          ),
        )
      } else {
        setChangedConclusionRanges((ranges) =>
          adjustTrackedRangesForReplacement(
            ranges,
            textChange.previousRange,
            textChange.nextRange,
          ),
        )
      }
    }

    pendingSelectionRef.current = createPendingSelection(
      field,
      {
        start: nextOffset,
        end: nextOffset,
      },
      nextText,
      true,
    )
    lastActiveEditorRef.current = field
    setActiveCursorField(field)
    setActiveVariant(null)
    setContextMenu(null)
    setMarkerMenu(null)
  }

  const replaceMarkerBlock = (
    id: number,
    value: string,
    selectedOptionIndex?: number | null,
    options?: MarkerOption[],
    defaultOptionIndex?: number | null,
    sourceContent?: EditorSegment[],
  ) => {
    const content = sourceContent ?? descriptionContent
    const blockInfo = getMarkerBlockInfo(content, id)

    if (!blockInfo) {
      return
    }

    const markerSegment = content.find(
      (segment): segment is MarkerSegment =>
        segment.type === 'marker' && segment.id === id,
    )
    const optionState = markerSegment
      ? getMarkerOptionState(markerSegment, blockInfo)
      : { defaultOptionIndex: null, options: [], selectedOptionIndex: null }
    const previousOptionIndex = getResolvedMarkerOptionIndex(
      optionState,
      blockInfo,
    )
    const previousOption =
      previousOptionIndex === null
        ? null
        : optionState.options[previousOptionIndex] ?? null
    const mainReplacementRange = getMarkerMainBlockReplacementRange(
      content,
      blockInfo,
    )
    const optionFindingRemovalRanges =
      getMarkerOptionDescriptionRemovalRanges(content, blockInfo, previousOption)
    const descriptionRemoval = removeTextRangesFromContent(
      content,
      optionFindingRemovalRanges,
    )
    const adjustedMainReplacementRange = descriptionRemoval.changes.reduce(
      (range, change) => mapRangeThroughTextChange(range, change),
      mainReplacementRange,
    )
    const normalizedReplacementContent = parseMarkerTemplateContent(value)
    const textBeforeReplacement = getContentText(descriptionRemoval.content)
    const nextContent = replaceRangeWithContent(
      descriptionRemoval.content,
      adjustedMainReplacementRange.start,
      adjustedMainReplacementRange.end,
      normalizedReplacementContent,
    ).map((segment) =>
      segment.type === 'marker' &&
      segment.id === id &&
      selectedOptionIndex !== undefined
        ? {
            ...segment,
            defaultOptionIndex:
              defaultOptionIndex !== undefined
                ? defaultOptionIndex
                : segment.defaultOptionIndex,
            options: options ?? segment.options,
            selectedOptionIndex,
          }
        : segment,
    )
    const nextText = getContentText(nextContent)
    const replacementChange = getTextChange(textBeforeReplacement, nextText)
    const removedDescriptionRanges = [
      mainReplacementRange,
      ...optionFindingRemovalRanges,
    ]
    const conclusionCleanup = removeLinkedConclusionsForDescriptionRanges(
      getFreshContent('conclusion'),
      findingPairs,
      removedDescriptionRanges,
    )

    pendingSelectionRef.current = null
    setDescriptionContent(ensureLeadingMarkerContent(nextContent))
    setConclusionContent(conclusionCleanup.content)
    setChangedConclusionRanges((ranges) =>
      conclusionCleanup.changes.reduce(
        (nextRanges, change) =>
          adjustTrackedRangesForReplacement(
            nextRanges,
            change.previousRange,
            change.nextRange,
          ),
        ranges,
      ),
    )
    setNewDescriptionRanges((ranges) =>
      (replacementChange
        ? adjustTrackedRangesForReplacement(
            descriptionRemoval.changes.reduce(
              (nextRanges, change) =>
                adjustTrackedRangesForReplacement(
                  nextRanges,
                  change.previousRange,
                  change.nextRange,
                ),
              ranges.filter(
                (range) =>
                  !removedDescriptionRanges.some(
                    (removedRange) =>
                      getRangeOverlap(range, removedRange) > 0,
                  ),
              ),
            ),
            replacementChange.previousRange,
            replacementChange.nextRange,
          )
        : descriptionRemoval.changes.reduce(
            (nextRanges, change) =>
              adjustTrackedRangesForReplacement(
                nextRanges,
                change.previousRange,
                change.nextRange,
              ),
            ranges.filter(
              (range) =>
                !removedDescriptionRanges.some(
                  (removedRange) => getRangeOverlap(range, removedRange) > 0,
                ),
            ),
          ))
    )
    setChangedDescriptionRanges((ranges) =>
      (replacementChange
        ? adjustTrackedRangesForReplacement(
            descriptionRemoval.changes.reduce(
              (nextRanges, change) =>
                adjustTrackedRangesForReplacement(
                  nextRanges,
                  change.previousRange,
                  change.nextRange,
                ),
              ranges.filter(
                (range) =>
                  !removedDescriptionRanges.some(
                    (removedRange) =>
                      getRangeOverlap(range, removedRange) > 0,
                  ),
              ),
            ),
            replacementChange.previousRange,
            replacementChange.nextRange,
          )
        : descriptionRemoval.changes.reduce(
            (nextRanges, change) =>
              adjustTrackedRangesForReplacement(
                nextRanges,
                change.previousRange,
                change.nextRange,
              ),
            ranges.filter(
              (range) =>
                !removedDescriptionRanges.some(
                  (removedRange) => getRangeOverlap(range, removedRange) > 0,
                ),
            ),
          ))
    )
    setFindingPairs((pairs) => {
      const survivingPairs = pairs.filter(
        (pair) =>
          !removedDescriptionRanges.some(
            (range) => getRangeOverlap(pair.description, range) > 0,
          ),
      )
      const conclusionAdjustedPairs = conclusionCleanup.changes.reduce(
        (nextPairs, change) =>
          adjustPairsForFieldTextChange(
            nextPairs,
            'conclusion',
            change,
            null,
            change.nextText,
          ),
        survivingPairs,
      )
      const removalAdjustedPairs = descriptionRemoval.changes.reduce(
        (nextPairs, change) =>
          adjustPairsForFieldTextChange(
            nextPairs,
            'description',
            change,
            null,
            change.nextText,
          ),
        conclusionAdjustedPairs,
      )

      return replacementChange
        ? adjustPairsForFieldTextChange(
            removalAdjustedPairs,
            'description',
            replacementChange,
            null,
            nextText,
          )
        : removalAdjustedPairs
    })
  }

  const updateMarkerOptions = (
    id: number,
    updater: (options: MarkerOption[]) => MarkerOption[],
  ) => {
    setDescriptionContent((content) =>
      ensureLeadingMarkerContent(
        content.map((segment) => {
          if (segment.type !== 'marker' || segment.id !== id) {
            return segment
          }

          const blockInfo = getMarkerBlockInfo(content, id)
          const optionState = getMarkerOptionState(segment, blockInfo)
          const options = updater(optionState.options.map(copyMarkerOption))
          const selectedOptionIndex =
            optionState.selectedOptionIndex !== null &&
            optionState.selectedOptionIndex < options.length
              ? optionState.selectedOptionIndex
              : null
          const defaultOptionIndex =
            optionState.defaultOptionIndex !== null &&
            optionState.defaultOptionIndex < options.length
              ? optionState.defaultOptionIndex
              : blockInfo?.hasNextMarker && options.length
                ? 0
                : null

          return {
            ...segment,
            defaultOptionIndex,
            options,
            selectedOptionIndex,
          }
        }),
      ),
    )
  }

  const ensureMarkerStandardOption = (id: number) => {
    setDescriptionContent((content) => {
      const blockInfo = getMarkerBlockInfo(content, id)

      if (!blockInfo?.hasNextMarker) {
        return content
      }

      let changed = false
      const nextContent = content.map((segment) => {
        if (segment.type !== 'marker' || segment.id !== id) {
          return segment
        }

        const optionState = getMarkerOptionState(segment, blockInfo)

        if (
          areMarkerOptionsEqual(segment.options, optionState.options) &&
          segment.selectedOptionIndex === optionState.selectedOptionIndex &&
          segment.defaultOptionIndex === optionState.defaultOptionIndex
        ) {
          return segment
        }

        changed = true
        return {
          ...segment,
          defaultOptionIndex: optionState.defaultOptionIndex,
          options: optionState.options,
          selectedOptionIndex: optionState.selectedOptionIndex,
        }
      })

      return changed ? ensureLeadingMarkerContent(nextContent) : content
    })
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

  const removeMarkerOptionFinding = (
    markerId: number,
    optionIndex: number,
    findingId: string,
  ) => {
    updateMarkerOptions(markerId, (options) =>
      options.map((option, index) =>
        index === optionIndex
          ? {
              ...option,
              findingIds: option.findingIds.filter((id) => id !== findingId),
            }
          : option,
      ),
    )
  }

  const makeMarkerOptionDefault = (markerId: number, index: number) => {
    setDescriptionContent((content) =>
      ensureLeadingMarkerContent(
        content.map((segment) => {
          if (segment.type !== 'marker' || segment.id !== markerId) {
            return segment
          }

          const blockInfo = getMarkerBlockInfo(content, markerId)
          const optionState = getMarkerOptionState(segment, blockInfo)

          if (!blockInfo?.hasNextMarker || !optionState.options[index]) {
            return segment
          }

          return {
            ...segment,
            defaultOptionIndex: index,
            options: optionState.options,
            selectedOptionIndex: optionState.selectedOptionIndex,
          }
        }),
      ),
    )
  }

  const deleteMarkerOption = (markerId: number, index: number) => {
    setDescriptionContent((content) =>
      ensureLeadingMarkerContent(
        content.map((segment) => {
          if (segment.type !== 'marker' || segment.id !== markerId) {
            return segment
          }

          const blockInfo = getMarkerBlockInfo(content, markerId)
          const optionState = getMarkerOptionState(segment, blockInfo)
          const optionToDelete = optionState.options[index]

          if (
            !optionToDelete ||
            !canDeleteMarkerOption(optionToDelete, blockInfo, index)
          ) {
            return segment
          }

          const options = optionState.options.filter(
            (_, optionIndex) => optionIndex !== index,
          )
          const selectedOptionIndex =
            optionState.selectedOptionIndex === null
              ? null
              : optionState.selectedOptionIndex === index
                ? null
                : optionState.selectedOptionIndex > index
                  ? optionState.selectedOptionIndex - 1
                  : optionState.selectedOptionIndex
          const defaultOptionIndex =
            optionState.defaultOptionIndex === null
              ? blockInfo?.hasNextMarker && options.length
                ? 0
                : null
              : optionState.defaultOptionIndex === index
                ? options.length
                  ? 0
                  : null
                : optionState.defaultOptionIndex > index
                  ? optionState.defaultOptionIndex - 1
                  : optionState.defaultOptionIndex

          return {
            ...segment,
            defaultOptionIndex,
            options,
            selectedOptionIndex,
          }
        }),
      ),
    )

    setActiveMarkerOptionVariant((current) => {
      if (!current || current.markerId !== markerId) {
        return current
      }

      if (current.optionIndex === index) {
        return null
      }

      return current.optionIndex > index
        ? { ...current, optionIndex: current.optionIndex - 1 }
        : current
    })

    const rememberedSelection = markerOptionSelectionRef.current

    if (
      rememberedSelection?.markerId === markerId &&
      rememberedSelection.optionIndex >= index
    ) {
      markerOptionSelectionRef.current = null
    }

    setPendingMarkerOptionTitleFocus((current) =>
      current?.markerId === markerId && current.optionIndex >= index
        ? null
        : current,
    )
  }

  const handleMarkerOptionValueInput = (
    markerId: number,
    index: number,
    editor: HTMLDivElement,
  ) => {
    const selection = getSelectionOffsets(editor)
    const nextValue = parseMarkerOptionEditorValue(editor)
    const nextOffset = selection?.end ?? editor.textContent?.length ?? 0

    changeMarkerOptionValue(markerId, index, nextValue)
    markerOptionSelectionRef.current = {
      end: nextOffset,
      markerId,
      optionIndex: index,
      start: nextOffset,
      text: '',
    }
    window.requestAnimationFrame(() => {
      restoreSelection(editor, nextOffset, nextOffset)
    })
  }

  const wrapMarkerOptionSelectionAsVariant = (
    markerId: number,
    index: number,
  ) => {
    const key = getMarkerOptionTextareaKey(markerId, index)
    const editor = markerOptionValueRefs.current.get(key)
    const markerSegment = descriptionContent.find(
      (segment): segment is MarkerSegment =>
        segment.type === 'marker' && segment.id === markerId,
    )
    const blockInfo = getMarkerBlockInfo(descriptionContent, markerId)
    const option = markerSegment
      ? getMarkerOptionState(markerSegment, blockInfo).options[index]
      : null

    if (!editor || !option) {
      return false
    }

    const displaySelection = getSelectionOffsets(editor)
    const displayText = editor.textContent ?? ''
    const rememberedSelection = markerOptionSelectionRef.current
    const selectionStart =
      displaySelection?.start ?? rememberedSelection?.start ?? 0
    const selectionEnd =
      displaySelection?.end ?? rememberedSelection?.end ?? selectionStart
    const selectedRange =
      selectionStart !== selectionEnd
        ? { start: selectionStart, end: selectionEnd }
        : getWordRangeAtOffset(displayText, selectionStart)

    if (!selectedRange) {
      return false
    }

    const selectedText = displayText.slice(selectedRange.start, selectedRange.end)
    const leadingSpace = selectedText.match(/^\s*/)?.[0].length ?? 0
    const trailingSpace = selectedText.match(/\s*$/)?.[0].length ?? 0
    const variantText = selectedText
      .slice(leadingSpace, selectedText.length - trailingSpace)
      .trim()

    if (!variantText) {
      return false
    }

    const displayVariantStart = selectedRange.start + leadingSpace
    const displayVariantEnd = selectedRange.end - trailingSpace
    const variantStart = getRawOffsetFromMarkerOptionDisplayOffset(
      option.value,
      displayVariantStart,
    )
    const variantEnd = getRawOffsetFromMarkerOptionDisplayOffset(
      option.value,
      displayVariantEnd,
    )
    const overlapsExistingVariant = getMarkerTemplateParts(option.value).some(
      (part) =>
        part.type === 'variant' &&
        Math.max(part.rawStart, variantStart) < Math.min(part.rawEnd, variantEnd),
    )

    if (overlapsExistingVariant || variantEnd <= variantStart) {
      return false
    }

    const replacement = `[[${variantText}]]`
    const nextValue = `${option.value.slice(0, variantStart)}${replacement}${option.value.slice(
      variantEnd,
    )}`
    const selectionOffset = displayVariantStart + variantText.length

    changeMarkerOptionValue(markerId, index, nextValue)
    setActiveVariant(null)
    setActiveMarkerOptionVariant({
      end: variantStart + replacement.length,
      markerId,
      optionIndex: index,
      start: variantStart,
    })
    markerOptionSelectionRef.current = {
      end: selectionOffset,
      markerId,
      optionIndex: index,
      start: selectionOffset,
      text: '',
    }
    window.requestAnimationFrame(() => {
      const nextEditor = markerOptionValueRefs.current.get(key)

      if (!nextEditor) {
        return
      }

      nextEditor.focus()
      restoreSelection(nextEditor, selectionOffset, selectionOffset)
    })
    return true
  }

  const createMarkerOptionVariantFromSelection = () => {
    const markerOptionSelection = markerOptionSelectionRef.current

    if (!markerOptionSelection) {
      return false
    }

    const key = getMarkerOptionTextareaKey(
      markerOptionSelection.markerId,
      markerOptionSelection.optionIndex,
    )
    const editor = markerOptionValueRefs.current.get(key)

    if (editor && document.activeElement === editor) {
      rememberMarkerOptionSelection(
        markerOptionSelection.markerId,
        markerOptionSelection.optionIndex,
        editor,
      )
    }

    return wrapMarkerOptionSelectionAsVariant(
      markerOptionSelection.markerId,
      markerOptionSelection.optionIndex,
    )
  }

  const addMarkerOption = (markerId: number) => {
    updateMarkerOptions(markerId, (options) => [
      ...options,
      createManualMarkerOption(),
    ])
  }

  const openMarkerDialog = (id: number) => {
    ensureMarkerStandardOption(id)
    setActiveMarker({ id })
    setMarkerDialogId(id)
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setContextMenu(null)
    setActiveVariant(null)
    setActiveMarkerOptionVariant(null)
  }

  const closeMarkerDialog = () => {
    setMarkerDialogId(null)
    markerOptionSelectionRef.current = null
    setActiveMarkerOptionVariant(null)
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

    const blockInfo = getMarkerBlockInfo(descriptionContent, markerId)
    const optionState = getMarkerOptionState(markerSegment, blockInfo)
    const option = optionState.options[index]

    if (!option) {
      return
    }

    if (option.findingIds.length) {
      const currentBlockInfo = getMarkerBlockInfo(descriptionContent, markerId)

      if (!currentBlockInfo) {
        return
      }

      const previousOptionIndex = getResolvedMarkerOptionIndex(
        optionState,
        currentBlockInfo,
      )
      const previousOption =
        previousOptionIndex === null
          ? null
          : optionState.options[previousOptionIndex] ?? null
      const mainReplacementRange = getMarkerMainBlockReplacementRange(
        descriptionContent,
        currentBlockInfo,
      )
      const optionFindingRemovalRanges =
        getMarkerOptionDescriptionRemovalRanges(
          descriptionContent,
          currentBlockInfo,
          previousOption,
        )
      const descriptionRemoval = removeTextRangesFromContent(
        descriptionContent,
        optionFindingRemovalRanges,
      )
      const adjustedMainReplacementRange = descriptionRemoval.changes.reduce(
        (range, change) => mapRangeThroughTextChange(range, change),
        mainReplacementRange,
      )
      let replacementContent = parseMarkerTemplateContent(option.value)
      let replacementText = getContentText(replacementContent)
      const insertedFindings: Array<{
        finding: SavedFinding
        range: TextRange
      }> = []

      option.findingIds.forEach((findingId) => {
        const finding =
          savedFindings.find((item) => item.id === findingId) ?? null
        const findingContent = finding
          ? createSemanticFindingContent(
              getSavedFindingDescriptionInsertContent(finding),
            )
          : []
        const findingText = getContentText(findingContent)

        if (!finding || !findingText.trim()) {
          return
        }

        const separator =
          replacementText && !/\s$/.test(replacementText)
            ? [createTextSegment(' ')]
            : []
        const start = replacementText.length + getContentText(separator).length

        replacementContent = compactContent([
          ...replacementContent,
          ...separator,
          ...findingContent,
        ])
        replacementText = getContentText(replacementContent)
        insertedFindings.push({
          finding,
          range:
            getBestOverlappingFindingRange(replacementText, {
              start,
              end: start + findingText.length,
            }) ?? { start, end: start + findingText.length },
        })
      })

      const normalizedReplacementContent = replacementContent
      const textBeforeReplacement = getContentText(descriptionRemoval.content)
      const nextDescriptionContent = replaceRangeWithContent(
        descriptionRemoval.content,
        adjustedMainReplacementRange.start,
        adjustedMainReplacementRange.end,
        normalizedReplacementContent,
      ).map((segment) =>
        segment.type === 'marker' && segment.id === markerId
          ? {
              ...segment,
              defaultOptionIndex: optionState.defaultOptionIndex,
              options: optionState.options,
              selectedOptionIndex: index,
            }
          : segment,
      )
      const nextDescriptionText = getContentText(nextDescriptionContent)
      const replacementChange = getTextChange(
        textBeforeReplacement,
        nextDescriptionText,
      )
      const removedDescriptionRanges = [
        mainReplacementRange,
        ...optionFindingRemovalRanges,
      ]
      const conclusionCleanup = removeLinkedConclusionsForDescriptionRanges(
        getFreshContent('conclusion'),
        findingPairs,
        removedDescriptionRanges,
      )
      let nextConclusionContent = conclusionCleanup.content
      const nextPairs: FindingPair[] = []
      const adjustTrackedDescriptionRanges = (ranges: TextRange[]) => {
        const rangesAfterRemoval = descriptionRemoval.changes.reduce(
          (nextRanges, change) =>
            adjustTrackedRangesForReplacement(
              nextRanges,
              change.previousRange,
              change.nextRange,
            ),
          ranges.filter(
            (range) =>
              !removedDescriptionRanges.some(
                (removedRange) => getRangeOverlap(range, removedRange) > 0,
              ),
          ),
        )

        return replacementChange
          ? adjustTrackedRangesForReplacement(
              rangesAfterRemoval,
              replacementChange.previousRange,
              replacementChange.nextRange,
            )
          : rangesAfterRemoval
      }

      insertedFindings.forEach(({ finding, range }) => {
        const conclusionContentToInsert = createSemanticFindingContent(
          getSavedFindingContent(finding, 'conclusion'),
        )
        const conclusionTextToInsert = getContentText(
          conclusionContentToInsert,
        )
        const collapsedConclusionOffset =
          getContentText(nextConclusionContent).length
        const appendConclusionResult = conclusionTextToInsert.trim()
          ? appendContent(nextConclusionContent, conclusionContentToInsert)
          : null

        if (appendConclusionResult) {
          nextConclusionContent = appendConclusionResult.content
        }

        const nextConclusionText = getContentText(nextConclusionContent)
        const conclusionRange =
          appendConclusionResult &&
          appendConclusionResult.range.end > appendConclusionResult.range.start
            ? getBestOverlappingFindingRange(
                nextConclusionText,
                appendConclusionResult.range,
              ) ?? appendConclusionResult.range
            : {
                start: collapsedConclusionOffset,
                end: collapsedConclusionOffset,
              }

        nextPairs.push({
          id: createPairId(),
          description: {
            start: adjustedMainReplacementRange.start + range.start,
            end: adjustedMainReplacementRange.start + range.end,
          },
          conclusion: conclusionRange,
          savedFindingId: finding.id,
        })
      })

      setDescriptionContent(ensureLeadingMarkerContent(nextDescriptionContent))
      setConclusionContent(nextConclusionContent)
      setFindingPairs((pairs) => {
        const survivingPairs = pairs.filter(
          (pair) =>
            !removedDescriptionRanges.some(
              (range) => getRangeOverlap(pair.description, range) > 0,
            ),
        )
        const conclusionAdjustedPairs = conclusionCleanup.changes.reduce(
          (adjustedPairs, change) =>
            adjustPairsForFieldTextChange(
              adjustedPairs,
              'conclusion',
              change,
              null,
              change.nextText,
          ),
          survivingPairs,
        )
        const removalAdjustedPairs = descriptionRemoval.changes.reduce(
          (adjustedPairs, change) =>
            adjustPairsForFieldTextChange(
              adjustedPairs,
              'description',
              change,
              null,
              change.nextText,
            ),
          conclusionAdjustedPairs,
        )
        const adjustedPairs = replacementChange
          ? adjustPairsForFieldTextChange(
              removalAdjustedPairs,
              'description',
              replacementChange,
              null,
              nextDescriptionText,
            )
          : removalAdjustedPairs

        return [...adjustedPairs, ...nextPairs]
      })
      setNewDescriptionRanges((ranges) =>
        mergeTextRanges([
          ...adjustTrackedDescriptionRanges(ranges),
          ...nextPairs.map((pair) => pair.description),
        ]),
      )
      setChangedDescriptionRanges((ranges) =>
        adjustTrackedDescriptionRanges(ranges),
      )
      setChangedConclusionRanges((ranges) => {
        return conclusionCleanup.changes.reduce(
          (nextRanges, change) =>
            adjustTrackedRangesForReplacement(
              nextRanges,
              change.previousRange,
              change.nextRange,
          ),
          ranges,
        )
      })
      setActiveMarker({ id: markerId })
      setMarkerMenu(null)
      setMarkerContextMenu(null)
      return
    }

    replaceMarkerBlock(
      markerId,
      option.value,
      index,
      optionState.options,
      optionState.defaultOptionIndex,
    )
    setActiveMarker({ id: markerId })
    setMarkerMenu(null)
    setMarkerContextMenu(null)
  }

  const updateSelectedMarkerOptionFromBlock = (
    markerId: number,
    includeFindings = false,
  ) => {
    const content = getFreshContent('description')
    const markerSegment = content.find(
      (segment): segment is MarkerSegment =>
        segment.type === 'marker' && segment.id === markerId,
    )
    const blockInfo = getMarkerBlockInfo(content, markerId)

    if (!markerSegment || !blockInfo?.hasNextMarker) {
      return
    }

    const optionState = getMarkerOptionState(markerSegment, blockInfo)
    const selectedOptionIndex = getResolvedMarkerOptionIndex(
      optionState,
      blockInfo,
    )

    if (selectedOptionIndex === null) {
      return
    }

    const normalizedValue = getSingleSemanticBlockMarkerOptionValue(
      content,
      blockInfo,
    )
    const findingIds = includeFindings
      ? ensureMarkerBlockFindingReferences(content, blockInfo)
      : []
    const nextOptions = optionState.options.map((option, optionIndex) =>
      optionIndex === selectedOptionIndex
        ? { ...option, findingIds, value: normalizedValue }
        : option,
    )
    const nextContent = ensureLeadingMarkerContent(
      content.map((segment) =>
        segment.type === 'marker' && segment.id === markerId
          ? {
              ...segment,
              defaultOptionIndex: optionState.defaultOptionIndex,
              options: nextOptions,
              selectedOptionIndex,
            }
          : segment,
      ),
    )

    setDescriptionContent(nextContent)
    setActiveMarker({ id: markerId })
    setMarkerContextMenu(null)
  }

  const saveMarkerBlockAsNewOption = (
    markerId: number,
    includeFindings = false,
  ) => {
    const content = getFreshContent('description')
    const markerSegment = content.find(
      (segment): segment is MarkerSegment =>
        segment.type === 'marker' && segment.id === markerId,
    )
    const blockInfo = getMarkerBlockInfo(content, markerId)

    if (!markerSegment || !blockInfo?.hasNextMarker) {
      return
    }

    const optionState = getMarkerOptionState(markerSegment, blockInfo)
    const newOptionIndex = optionState.options.length
    const normalizedValue = getSingleSemanticBlockMarkerOptionValue(
      content,
      blockInfo,
    )
    const findingIds = includeFindings
      ? ensureMarkerBlockFindingReferences(content, blockInfo)
      : []
    const nextOptions = [
      ...optionState.options,
      {
        findingIds,
        title: 'Новая заготовка',
        value: normalizedValue,
      },
    ]
    const nextContent = ensureLeadingMarkerContent(
      content.map((segment) =>
        segment.type === 'marker' && segment.id === markerId
          ? {
              ...segment,
              defaultOptionIndex: optionState.defaultOptionIndex,
              options: nextOptions,
              selectedOptionIndex: newOptionIndex,
            }
          : segment,
      ),
    )

    setDescriptionContent(nextContent)
    setActiveMarker({ id: markerId })
    setMarkerDialogId(markerId)
    setPendingMarkerOptionTitleFocus({
      markerId,
      optionIndex: newOptionIndex,
    })
    setMarkerMenu(null)
    setMarkerContextMenu(null)
    setContextMenu(null)
    setActiveVariant(null)
    setActiveMarkerOptionVariant(null)
  }

  const requestMarkerOptionSave = (
    markerId: number,
    action: PendingMarkerOptionSaveAction['action'],
  ) => {
    setPendingMarkerOptionSaveAction({ action, markerId })
    setMarkerContextMenu(null)
  }

  const completePendingMarkerOptionSave = (includeFindings: boolean) => {
    const pendingAction = pendingMarkerOptionSaveAction

    if (!pendingAction) {
      return
    }

    if (pendingAction.action === 'update') {
      updateSelectedMarkerOptionFromBlock(
        pendingAction.markerId,
        includeFindings,
      )
    } else {
      saveMarkerBlockAsNewOption(pendingAction.markerId, includeFindings)
    }

    setPendingMarkerOptionSaveAction(null)
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
    const freshDescriptionContent = ensureSemanticBlocksInContent(
      getFreshContent('description'),
    )
    const freshConclusionContent = ensureSemanticBlocksInContent(
      getFreshContent('conclusion'),
    )

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
      ? createDefaultPassportData(passportCustomFieldDefinitions)
      : applyPassportCustomFieldDefinitions(
          passportData,
          passportCustomFieldDefinitions,
        )
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
    lastConclusionSelectionRef.current = null
    findingNavigationRef.current = null
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
    setNavigationHighlight(null)
    setActiveCursorField(null)
    setActiveDescriptionFindingRange(null)
  }

  const openStartScreenForNewProtocol = () => {
    saveCurrentProtocolSession()
    pendingSelectionRef.current = null
    lastActiveEditorRef.current = null
    lastDescriptionSelectionRef.current = null
    lastConclusionSelectionRef.current = null
    findingNavigationRef.current = null
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
    setNavigationHighlight(null)
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

  const showProtocolSaveNotice = (fileName: string, message: string) => {
    setProtocolSaveNotice({ fileName, message })
  }

  const closeProtocolSaveNotice = () => {
    setProtocolSaveNotice(null)
  }

  const getMarkerSectionTitle = (
    marker: MarkerSegment | null | undefined,
    fallback = 'Раздел',
  ) => marker?.title.trim() || fallback

  const getMarkerSectionTitleInContent = (
    content: EditorSegment[],
    markerId: number | null,
    fallback = 'Находки',
  ) => {
    if (markerId === null) {
      return fallback
    }

    const markerEntry =
      getSectionStructureMarkerEntries(content).find(
        (entry) => entry.id === markerId,
      ) ?? null

    if (markerEntry) {
      return getMarkerSectionTitle(
        markerEntry.segment,
        `Раздел ${markerEntry.number}`,
      )
    }

    const marker =
      content.find(
        (segment): segment is MarkerSegment =>
          segment.type === 'marker' && segment.id === markerId,
      ) ?? null

    return getMarkerSectionTitle(marker, fallback)
  }

  const getSectionInfoForDescriptionRange = (
    content: EditorSegment[],
    range: TextRange,
  ) => {
    const markerId = getMarkerIdAtOffset(content, range.start)

    return {
      isSectionGroup: markerId !== null,
      markerId,
      title: getMarkerSectionTitleInContent(content, markerId),
    }
  }

  const getSectionFolderNameForDescriptionRange = (
    content: EditorSegment[],
    range: TextRange,
  ) => {
    const markerId = getMarkerIdAtOffset(content, range.start)
    const marker =
      markerId === null
        ? null
        : content.find(
            (segment): segment is MarkerSegment =>
              segment.type === 'marker' && segment.id === markerId,
          ) ?? null
    const title = normalizeFindingFolderName(marker?.title ?? '')

    return title || null
  }

  const collectProtocolDownloadSaveItems = () => {
    const freshDescriptionContent = getFreshContent('description')
    const freshConclusionContent = getFreshContent('conclusion')
    const freshDescriptionText = getContentText(freshDescriptionContent)
    const freshConclusionText = getContentText(freshConclusionContent)
    const currentTemplate =
      currentTemplateId === null
        ? null
        : templates.find((template) => template.id === currentTemplateId) ??
          null
    const items: ProtocolDownloadSaveItem[] = []
    const sectionStructureChanges = currentTemplate
      ? getSectionStructureChanges(
          currentTemplate.descriptionContent,
          freshDescriptionContent,
        )
      : null

    if (sectionStructureChanges) {
      items.push({
        ...sectionStructureChanges,
        checked: true,
        descriptionContent: copyContent(freshDescriptionContent),
        detail: formatSectionStructureChangeDetail(sectionStructureChanges),
        id: 'section-structure',
        isSectionGroup: false,
        kind: 'section-structure',
        label: 'Сохранить структуру разделов в шаблон',
        sectionTitle: 'Изменения разделов',
      })
    }

    freshDescriptionContent.forEach((segment) => {
      if (segment.type !== 'marker') {
        return
      }

      const blockInfo = getMarkerBlockInfo(freshDescriptionContent, segment.id)

      if (!blockInfo?.hasNextMarker) {
        return
      }

      const sectionTitle = getMarkerSectionTitleInContent(
        freshDescriptionContent,
        segment.id,
      )
      const rawOptionState = getMarkerOptionState(segment, blockInfo)
      const optionState = normalizeMarkerOptionStateForSectionSave(
        freshDescriptionContent,
        blockInfo,
        rawOptionState,
      )
      const selectedOptionIndex = getResolvedMarkerOptionIndex(
        optionState,
        blockInfo,
      )
      const templateMarker =
        currentTemplate?.descriptionContent.find(
          (templateSegment): templateSegment is MarkerSegment =>
            templateSegment.type === 'marker' && templateSegment.id === segment.id,
        ) ?? null
      const templateBlockInfo =
        currentTemplate && templateMarker
          ? getMarkerBlockInfo(currentTemplate.descriptionContent, segment.id)
          : null
      const templateOptionState =
        currentTemplate && templateMarker && templateBlockInfo
          ? normalizeMarkerOptionStateForSectionSave(
              currentTemplate.descriptionContent,
              templateBlockInfo,
              getMarkerOptionState(templateMarker, templateBlockInfo),
            )
          : null

      if (selectedOptionIndex !== null) {
        const selectedOption = optionState.options[selectedOptionIndex] ?? null
        const baselineOption =
          templateOptionState?.options[selectedOptionIndex] ?? selectedOption
        const currentValue = getSingleSemanticBlockMarkerOptionValue(
          freshDescriptionContent,
          blockInfo,
        )

        if (
          selectedOption &&
          baselineOption &&
          getMarkerOptionComparableValue(currentValue) !==
            getMarkerOptionComparableValue(baselineOption.value)
        ) {
          const valueRange = getMarkerBlockValueRange(
            freshDescriptionContent,
            blockInfo,
          )
          const selectedOptionLabel = getMarkerOptionLabel(
            selectedOption,
            selectedOptionIndex,
            blockInfo,
          )

          items.push({
            checked: true,
            detail:
              getProtocolSavePreviewText(currentValue) ||
              'Текст раздела пустой',
            id: `section-current:${segment.id}:${selectedOptionIndex}`,
            includeFindings: true,
            isSectionGroup: true,
            kind: 'section-current',
            label: `Обновить заготовку «${selectedOptionLabel}»`,
            markerId: segment.id,
            newOptionLabel: '',
            optionIndex: selectedOptionIndex,
            optionLabel: selectedOptionLabel,
            previousValue: baselineOption.value,
            range: valueRange,
            saveMode: 'update',
            sectionTitle,
            value: currentValue,
          })
        }
      }

      if (!templateOptionState) {
        return
      }

      optionState.options.forEach((option, optionIndex) => {
        const templateOption = templateOptionState.options[optionIndex] ?? null
        const hasVariantChange = hasMarkerOptionVariantChange(
          option.value,
          templateOption?.value ?? '',
        )
        const duplicatesSelectedTextChange =
          optionIndex === selectedOptionIndex &&
          !hasVariantChange &&
          areMarkerOptionTitlesAndFindingsEqual(option, templateOption) &&
          getMarkerOptionComparableValue(option.value) !==
            getMarkerOptionComparableValue(templateOption?.value ?? '') &&
          getMarkerOptionComparableValue(option.value) ===
            getMarkerOptionComparableValue(
              getSingleSemanticBlockMarkerOptionValue(
                freshDescriptionContent,
                blockInfo,
              ),
            )

        if (duplicatesSelectedTextChange) {
          return
        }

        if (areMarkerOptionsSavedEqual(option, templateOption)) {
          return
        }

        const optionLabel = getMarkerOptionLabel(option, optionIndex, blockInfo)
        const previousOptionLabel = templateOption
          ? getMarkerOptionLabel(templateOption, optionIndex, blockInfo)
          : null

        items.push({
          checked: true,
          detail:
            getProtocolSavePreviewText(option.value) ||
            'Заготовка без текста',
          id: `section-option:${segment.id}:${optionIndex}`,
          includeFindings: true,
          isSectionGroup: true,
          kind: 'section-option',
          label: templateOption
            ? `Сохранить изменения заготовки «${optionLabel}»`
            : `Сохранить новую заготовку «${optionLabel}»`,
          isNewOption: !templateOption,
          markerId: segment.id,
          newOptionLabel: '',
          option: copyMarkerOption(option),
          optionIndex,
          optionLabel,
          previousFindingIds: templateOption ? [...templateOption.findingIds] : [],
          previousOptionLabel,
          previousValue: templateOption?.value ?? '',
          saveMode: 'update',
          sectionTitle,
          value: option.value,
        })
      })
    })

    completedDescriptionFindingRanges.forEach((range, index) => {
      const pair = findPairForDescription(range)
      const description = getFindingLabelText(
        getRangeText(freshDescriptionText, range),
      )
      const conclusionRange =
        pair && pair.conclusion.end > pair.conclusion.start
          ? getBestOverlappingFindingRange(
              freshConclusionText,
              pair.conclusion,
            ) ?? pair.conclusion
          : null
      const conclusion = conclusionRange
        ? getFindingLabelText(getRangeText(freshConclusionText, conclusionRange))
        : ''
      const linkedFinding =
        pair?.savedFindingId
          ? savedFindings.find((finding) => finding.id === pair.savedFindingId) ??
            null
          : null
      const savedOrigin =
        linkedFinding ?? findSavedFindingMatch(savedFindings, description, conclusion)
      const isLinkedFindingChanged =
        Boolean(linkedFinding) &&
        (normalizeSavedFindingText(linkedFinding?.description ?? '') !==
          normalizeSavedFindingText(description) ||
          normalizeSavedFindingText(linkedFinding?.conclusion ?? '') !==
            normalizeSavedFindingText(conclusion))
      const shouldTreatAsFinding =
        isAdditionalMarkerFindingRange(freshDescriptionContent, range) ||
        isLinkedFindingChanged

      if (!shouldTreatAsFinding) {
        return
      }

      if (savedOrigin && !isLinkedFindingChanged) {
        return
      }

      const name =
        linkedFinding?.name ?? getDefaultFindingName(description, conclusion)
      const sectionInfo = getSectionInfoForDescriptionRange(
        freshDescriptionContent,
        range,
      )
      const sectionFolderName = getSectionFolderNameForDescriptionRange(
        freshDescriptionContent,
        range,
      )
      const sectionFolder = getRootFindingFolderByName(
        findingFolders,
        sectionFolderName,
      )

      items.push({
        checked: true,
        conclusion,
        conclusionContent: conclusionRange
          ? sliceContentRange(freshConclusionContent, conclusionRange)
          : [],
        conclusionRange: conclusionRange ? copyTextRange(conclusionRange) : null,
        description,
        descriptionContent: sliceContentRange(freshDescriptionContent, range),
        descriptionRange: copyTextRange(range),
        detail: conclusion
          ? `${description} → ${conclusion}`
          : description || 'Описание пустое',
        id: `finding:${pair?.id ?? 'new'}:${range.start}:${range.end}:${index}`,
        folderId: sectionFolder?.id ?? null,
        folderName: sectionFolder ? null : sectionFolderName,
        isSectionGroup: sectionInfo.isSectionGroup,
        kind: linkedFinding ? 'finding-update' : 'finding-new',
        label: linkedFinding
          ? `Обновить находку «${name}»`
          : `Сохранить находку «${name}»`,
        markerId: sectionInfo.markerId,
        name,
        pairId: pair?.id ?? null,
        savedFindingId: linkedFinding?.id ?? null,
        sectionTitle: sectionInfo.title,
        suggestedFolderName: sectionFolderName,
      })
    })

    const sectionFindingItems = items.filter(
      (item): item is ProtocolDownloadFindingSaveItem =>
        (item.kind === 'finding-new' || item.kind === 'finding-update') &&
        item.isSectionGroup &&
        item.markerId !== null,
    )

    freshDescriptionContent.forEach((segment) => {
      if (
        segment.type !== 'marker' ||
        !currentTemplate ||
        !sectionFindingItems.some((item) => item.markerId === segment.id) ||
        items.some(
          (item) =>
            (item.kind === 'section-current' ||
              item.kind === 'section-option') &&
            item.markerId === segment.id,
        )
      ) {
        return
      }

      const blockInfo = getMarkerBlockInfo(freshDescriptionContent, segment.id)
      const optionState = getMarkerOptionState(segment, blockInfo)
      const selectedOptionIndex = getResolvedMarkerOptionIndex(
        optionState,
        blockInfo,
      )

      if (selectedOptionIndex === null) {
        return
      }

      const selectedOption = optionState.options[selectedOptionIndex] ?? null

      if (!selectedOption) {
        return
      }

      const sectionTitle = getMarkerSectionTitleInContent(
        freshDescriptionContent,
        segment.id,
      )
      const optionLabel = getMarkerOptionLabel(
        selectedOption,
        selectedOptionIndex,
        blockInfo,
      )

      items.push({
        checked: true,
        detail: 'Добавить отмеченные находки в заготовку',
        id: `section-findings:${segment.id}:${selectedOptionIndex}`,
        includeFindings: true,
        isFindingReferenceOnly: true,
        isNewOption: false,
        isSectionGroup: true,
        kind: 'section-option',
        label: `Обновить находки заготовки «${optionLabel}»`,
        markerId: segment.id,
        newOptionLabel: '',
        option: copyMarkerOption(selectedOption),
        optionIndex: selectedOptionIndex,
        optionLabel,
        previousFindingIds: [...selectedOption.findingIds],
        previousOptionLabel: optionLabel,
        previousValue: selectedOption.value,
        saveMode: 'update',
        sectionTitle,
        value: selectedOption.value,
      })
    })

    return items
  }

  const updateProtocolDownloadSaveItem = (id: string, checked: boolean) => {
    setProtocolDownloadSaveDialog((dialog) =>
      dialog
        ? {
            ...dialog,
            items: dialog.items.map((item) =>
              item.id === id ? { ...item, checked } : item,
            ),
          }
        : dialog,
    )
  }

  const updateProtocolDownloadSectionIncludeFindings = (
    markerId: number,
    includeFindings: boolean,
  ) => {
    setProtocolDownloadSaveDialog((dialog) =>
      dialog
        ? {
            ...dialog,
            items: dialog.items.map((item) =>
              (item.kind === 'section-current' ||
                item.kind === 'section-option') &&
              item.markerId === markerId
                ? { ...item, includeFindings }
                : item,
            ),
          }
        : dialog,
    )
  }

  const updateProtocolDownloadFindingMode = (
    id: string,
    mode: 'new' | 'update',
  ) => {
    setProtocolDownloadSaveDialog((dialog) =>
      dialog
        ? {
            ...dialog,
            items: dialog.items.map((item) => {
              if (
                item.id !== id ||
                (item.kind !== 'finding-new' && item.kind !== 'finding-update')
              ) {
                return item
              }

              if (mode === 'update') {
                if (!item.savedFindingId) {
                  return item
                }

                const savedFinding =
                  savedFindings.find(
                    (finding) => finding.id === item.savedFindingId,
                  ) ?? null

                return {
                  ...item,
                  kind: 'finding-update',
                  name: savedFinding?.name ?? item.name,
                }
              }

              return {
                ...item,
                kind: 'finding-new',
              }
            }),
          }
        : dialog,
    )
  }

  const updateProtocolDownloadFindingName = (id: string, name: string) => {
    setProtocolDownloadSaveDialog((dialog) =>
      dialog
        ? {
            ...dialog,
            items: dialog.items.map((item) =>
              item.id === id &&
              (item.kind === 'finding-new' || item.kind === 'finding-update')
                ? { ...item, name }
                : item,
            ),
          }
        : dialog,
    )
  }

  const updateProtocolDownloadFindingFolder = (id: string, value: string) => {
    setProtocolDownloadSaveDialog((dialog) =>
      dialog
        ? {
            ...dialog,
            items: dialog.items.map((item) => {
              if (
                item.id !== id ||
                (item.kind !== 'finding-new' && item.kind !== 'finding-update')
              ) {
                return item
              }

              if (value === findingFolderRootSelectValue) {
                return { ...item, folderId: null, folderName: null }
              }

              if (value.startsWith(findingFolderSelectPrefix)) {
                return {
                  ...item,
                  folderId: value.slice(findingFolderSelectPrefix.length),
                  folderName: null,
                }
              }

              if (value.startsWith(findingFolderCreateSelectPrefix)) {
                const folderName = normalizeFindingFolderName(
                  value.slice(findingFolderCreateSelectPrefix.length),
                )

                return {
                  ...item,
                  folderId: null,
                  folderName: folderName || null,
                }
              }

              return item
            }),
          }
        : dialog,
    )
  }

  const updateProtocolDownloadSectionSaveMode = (
    markerId: number,
    mode: ProtocolDownloadSectionSaveMode,
  ) => {
    setProtocolDownloadSaveDialog((dialog) =>
      dialog
        ? {
            ...dialog,
            items: dialog.items.map((item) =>
              (item.kind === 'section-current' ||
                item.kind === 'section-option') &&
              item.markerId === markerId
                ? { ...item, saveMode: mode }
                : item,
            ),
          }
        : dialog,
    )
  }

  const updateProtocolDownloadSectionNewOptionLabel = (
    markerId: number,
    newOptionLabel: string,
  ) => {
    setProtocolDownloadSaveDialog((dialog) =>
      dialog
        ? {
            ...dialog,
            items: dialog.items.map((item) =>
              (item.kind === 'section-current' ||
                item.kind === 'section-option') &&
              item.markerId === markerId
                ? { ...item, newOptionLabel }
                : item,
            ),
          }
        : dialog,
    )
  }

  const closeProtocolDownloadSaveDialog = () => {
    setProtocolDownloadSaveDialog(null)
  }

  const applySectionDownloadSaveItems = (
    content: EditorSegment[],
    items: Array<
      | ProtocolDownloadSectionCurrentSaveItem
      | ProtocolDownloadSectionOptionSaveItem
    >,
    findingIdsByMarkerId = new Map<number, string[]>(),
  ) =>
    ensureLeadingMarkerContent(
      content.map((segment) => {
        if (segment.type !== 'marker') {
          return segment
        }

        const markerItems = items.filter((item) => item.markerId === segment.id)

        if (!markerItems.length) {
          return segment
        }

        const shouldIncludeFindings = markerItems.some(
          (item) => item.includeFindings,
        )
        const sectionFindingIds = shouldIncludeFindings
          ? findingIdsByMarkerId.get(segment.id) ?? []
          : []
        const actionableMarkerItems = markerItems.filter(
          (item) =>
            !(
              item.kind === 'section-option' &&
              item.isFindingReferenceOnly &&
              (!item.includeFindings || !sectionFindingIds.length)
            ),
        )

        if (!actionableMarkerItems.length) {
          return segment
        }

        const blockInfo = getMarkerBlockInfo(content, segment.id)
        const optionState = getMarkerOptionState(segment, blockInfo)
        const options = optionState.options.map(copyMarkerOption)
        let selectedOptionIndex = optionState.selectedOptionIndex
        const shouldSaveAsNew = actionableMarkerItems.some(
          (item) => item.saveMode === 'new',
        )
        const mergeFindingIds = (
          baseFindingIds: string[],
          optionFindingIds: string[] = [],
        ) => {
          const nextFindingIds = shouldIncludeFindings
            ? [...baseFindingIds, ...optionFindingIds, ...sectionFindingIds]
            : baseFindingIds

          return Array.from(
            new Set(nextFindingIds.filter((findingId) => findingId.trim())),
          )
        }

        if (shouldSaveAsNew) {
          const currentItem =
            actionableMarkerItems.find(
              (item): item is ProtocolDownloadSectionCurrentSaveItem =>
                item.kind === 'section-current',
            ) ?? null
          const optionItem =
            actionableMarkerItems.find(
              (item): item is ProtocolDownloadSectionOptionSaveItem =>
                item.kind === 'section-option',
            ) ?? null
          const firstItem = actionableMarkerItems[0]
          const baseOption =
            optionItem?.option ??
            options[firstItem.optionIndex] ??
            createEmptyMarkerOption()
          const newOptionTitle =
            firstItem.newOptionLabel.trim() ||
            `${firstItem.optionLabel} копия`
          const nextOption: MarkerOption = {
            ...copyMarkerOption(baseOption),
            findingIds: mergeFindingIds(baseOption.findingIds),
            title: newOptionTitle,
            value: currentItem?.value ?? optionItem?.option.value ?? baseOption.value,
          }
          const newOptionIndex = options.length

          options.push(nextOption)
          selectedOptionIndex = newOptionIndex
        } else {
          actionableMarkerItems.forEach((item) => {
            if (item.kind === 'section-current') {
              const previousOption =
                options[item.optionIndex] ?? createEmptyMarkerOption()

              options[item.optionIndex] = {
                ...previousOption,
                findingIds: mergeFindingIds(previousOption.findingIds),
                value: item.value,
              }
              selectedOptionIndex = item.optionIndex
              return
            }

            const previousOption =
              options[item.optionIndex] ?? createEmptyMarkerOption()
            const nextOption = copyMarkerOption(item.option)

            options[item.optionIndex] = {
              ...nextOption,
              findingIds: mergeFindingIds(
                previousOption.findingIds,
                nextOption.findingIds,
              ),
            }
          })
        }

        return {
          ...segment,
          defaultOptionIndex: optionState.defaultOptionIndex,
          options,
          selectedOptionIndex,
        }
      }),
    )

  const saveSelectedProtocolDownloadItems = (
    items: ProtocolDownloadSaveItem[],
  ) => {
    const selectedItems = items.filter((item) => item.checked)
    const structureItems = selectedItems.filter(
      (item): item is ProtocolDownloadSectionStructureSaveItem =>
        item.kind === 'section-structure',
    )
    const sectionItems = selectedItems.filter(
      (
        item,
      ): item is
        | ProtocolDownloadSectionCurrentSaveItem
        | ProtocolDownloadSectionOptionSaveItem =>
        item.kind === 'section-current' || item.kind === 'section-option',
    )
    const findingItems = selectedItems.filter(
      (item): item is ProtocolDownloadFindingSaveItem =>
        item.kind === 'finding-new' || item.kind === 'finding-update',
    )
    const now = getTimestamp()
    const findingSaveRecords = findingItems.map((item) => ({
      item,
      savedFindingId:
        item.kind === 'finding-update' && item.savedFindingId
          ? item.savedFindingId
          : createSavedFindingId(),
    }))
    const findingIdsByMarkerId = findingSaveRecords.reduce(
      (result, { item, savedFindingId }) => {
        if (item.isSectionGroup && item.markerId !== null) {
          result.set(item.markerId, [
            ...(result.get(item.markerId) ?? []),
            savedFindingId,
          ])
        }

        return result
      },
      new Map<number, string[]>(),
    )

    if (structureItems.length && currentTemplateId !== null) {
      const structureItem = structureItems.at(-1)

      if (structureItem) {
        const nextDescriptionContent = ensureLeadingMarkerContent(
          copyContent(structureItem.descriptionContent),
        )

        setDescriptionContent(nextDescriptionContent)
        setTemplates((currentTemplates) =>
          currentTemplates.map((template) =>
            template.id === currentTemplateId
              ? {
                  ...template,
                  descriptionContent: copyContent(nextDescriptionContent),
                  updatedAt: now,
                }
              : template,
          ),
        )
      }
    }

    if (sectionItems.length) {
      const freshDescriptionContent = getFreshContent('description')
      const nextDescriptionContent = applySectionDownloadSaveItems(
        freshDescriptionContent,
        sectionItems,
        findingIdsByMarkerId,
      )
      const savedRanges = sectionItems.flatMap((item) =>
        item.kind === 'section-current' ? [item.range] : [],
      )

      setDescriptionContent(nextDescriptionContent)
      setChangedDescriptionRanges((ranges) =>
        savedRanges.length
          ? ranges.filter(
              (range) =>
                !savedRanges.some(
                  (savedRange) => getRangeOverlap(range, savedRange) > 0,
                ),
            )
          : ranges,
      )

      if (currentTemplateId !== null) {
        setTemplates((currentTemplates) =>
          currentTemplates.map((template) =>
            template.id === currentTemplateId
              ? {
                  ...template,
                  descriptionContent: applySectionDownloadSaveItems(
                    template.descriptionContent,
                    sectionItems,
                    findingIdsByMarkerId,
                  ),
                  updatedAt: now,
                }
              : template,
          ),
        )
      }
    }

    if (findingItems.length) {
      let resolvedFolders = normalizeFolderTree(findingFolders)
      let hasCreatedFolder = false
      const folderByItemId = new Map<string, string | null>()

      findingItems.forEach((item) => {
        if (
          item.folderId &&
          resolvedFolders.some((folder) => folder.id === item.folderId)
        ) {
          folderByItemId.set(item.id, item.folderId)
          return
        }

        const folderName = normalizeFindingFolderName(item.folderName ?? '')

        if (!folderName) {
          folderByItemId.set(item.id, null)
          return
        }

        const existingFolder = getRootFindingFolderByName(
          resolvedFolders,
          folderName,
        )

        if (existingFolder) {
          folderByItemId.set(item.id, existingFolder.id)
          return
        }

        const newFolder: FindingFolder = {
          id: createFindingFolderId(),
          name: folderName,
          parentId: null,
          createdAt: now,
          updatedAt: now,
        }

        resolvedFolders = [...resolvedFolders, newFolder]
        hasCreatedFolder = true
        folderByItemId.set(item.id, newFolder.id)
      })

      if (hasCreatedFolder) {
        setFindingFolders(resolvedFolders)
      }

      setSavedFindings((findings) => {
        let nextFindings = findings

        findingSaveRecords.forEach(({ item, savedFindingId }) => {
          const existing =
            nextFindings.find((finding) => finding.id === savedFindingId) ??
            null
          const nextFinding: SavedFinding = {
            id: savedFindingId,
            name: item.name,
            description: item.description,
            descriptionContent: copyContent(item.descriptionContent),
            conclusion: item.conclusion,
            conclusionContent: copyContent(item.conclusionContent),
            folderId: folderByItemId.get(item.id) ?? null,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          }

          nextFindings = existing
            ? nextFindings.map((finding) =>
                finding.id === savedFindingId ? nextFinding : finding,
              )
            : [nextFinding, ...nextFindings]
        })

        return nextFindings
      })
      setFindingPairs((pairs) =>
        pairs.map((pair) => {
          const record = findingSaveRecords.find(({ item }) =>
            item.pairId !== null
              ? item.pairId === pair.id
              : getRangeOverlap(item.descriptionRange, pair.description) > 0,
          )

          return record
            ? { ...pair, savedFindingId: record.savedFindingId }
            : pair
        }),
      )
      setChangedDescriptionRanges((ranges) =>
        ranges.filter(
          (range) =>
            !findingItems.some(
              (item) => getRangeOverlap(range, item.descriptionRange) > 0,
            ),
        ),
      )
      setChangedConclusionRanges((ranges) =>
        ranges.filter(
          (range) =>
            !findingItems.some(
              (item) =>
                item.conclusionRange &&
                getRangeOverlap(range, item.conclusionRange) > 0,
            ),
        ),
      )
    }
  }

  const confirmProtocolDownloadSave = async () => {
    const dialog = protocolDownloadSaveDialog

    if (!dialog) {
      return
    }

    saveSelectedProtocolDownloadItems(dialog.items)
    setProtocolDownloadSaveDialog(null)
    await performProtocolDownload()
  }

  const skipProtocolDownloadSave = async () => {
    setProtocolDownloadSaveDialog(null)
    await performProtocolDownload()
  }

  const downloadProtocol = async () => {
    const items = collectProtocolDownloadSaveItems()

    if (items.length) {
      setProtocolDownloadSaveDialog({ items })
      return
    }

    await performProtocolDownload()
  }

  const performProtocolDownload = async () => {
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
          showProtocolSaveNotice(
            fileName,
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
    showProtocolSaveNotice(
      fileName,
      'Файл скачан обычным способом.',
    )
  }

  const closeStartCreateDialog = () => {
    setIsStartCreateDialogOpen(false)
    setStartTemplateStep(1)
    setStartTemplateDraft(createEmptyStartTemplateDraft())
    setStartTemplateDescriptionContent(createStartTemplateDescriptionContent(''))
    setStartTemplateActiveMarkerId(null)
    startTemplatePendingSelectionRef.current = null
  }

  const openStartCreateDialog = () => {
    setStartTemplateStep(1)
    setStartTemplateDraft(createEmptyStartTemplateDraft())
    setStartTemplateDescriptionContent(createStartTemplateDescriptionContent(''))
    setStartTemplateActiveMarkerId(null)
    startTemplatePendingSelectionRef.current = null
    setIsStartCreateDialogOpen(true)
  }

  const getFreshStartTemplateDescriptionContent = () => {
    const editor = startTemplateDescriptionRef.current
    const content = editor
      ? parseEditorContent(editor, startTemplateDescriptionContent)
      : startTemplateDescriptionContent

    return ensureTerminalMarkerContent(
      ensureSemanticBlockSpacesInContent(content),
    )
  }

  const goToStartTemplateMarkerStep = () => {
    if (!startTemplateDraft.name.trim()) {
      return
    }

    const nextContent = createStartTemplateDescriptionContent(
      startTemplateDraft.description,
    )
    const leadingMarkerId = getLeadingMarkerRange(nextContent)?.id ?? null

    setStartTemplateDescriptionContent(nextContent)
    setStartTemplateActiveMarkerId(leadingMarkerId)
    startTemplatePendingSelectionRef.current = {
      start: markerText.length,
      end: markerText.length,
    }
    setStartTemplateStep(2)
  }

  const returnToStartTemplateTextStep = () => {
    const content = getFreshStartTemplateDescriptionContent()

    setStartTemplateDraft((draft) => ({
      ...draft,
      description: getProtocolContentText(content),
    }))
    setStartTemplateDescriptionContent(content)
    setStartTemplateActiveMarkerId(null)
    setStartTemplateStep(1)
  }

  const handleStartTemplateDescriptionInput = () => {
    const editor = startTemplateDescriptionRef.current

    if (!editor) {
      return
    }

    const selection = getSelectionOffsets(editor)
    const parsedContent = ensureTerminalMarkerContent(
      ensureSemanticBlockSpacesInContent(
        parseEditorContent(editor, startTemplateDescriptionContent),
      ),
    )
    const safeSelection = selection
      ? keepRangeAfterLeadingMarker(parsedContent, {
          start: selection.end,
          end: selection.end,
        })
      : null

    if (safeSelection) {
      startTemplatePendingSelectionRef.current = safeSelection
    }

    setStartTemplateDescriptionContent(parsedContent)
    setStartTemplateActiveMarkerId(
      safeSelection
        ? getMarkerIdAtOffset(parsedContent, safeSelection.end)
        : null,
    )
  }

  const updateStartTemplateActiveMarker = () => {
    const editor = startTemplateDescriptionRef.current
    const selection = editor ? getSelectionOffsets(editor) : null

    setStartTemplateActiveMarkerId(
      selection
        ? getMarkerIdAtOffset(startTemplateDescriptionContent, selection.end)
        : null,
    )
  }

  const handleStartTemplateDescriptionClick = (
    event: MouseEvent<HTMLDivElement>,
  ) => {
    const editor = startTemplateDescriptionRef.current
    const marker = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '.section-marker-token',
    )

    if (editor && marker && editor.contains(marker)) {
      const id = Number(marker.dataset.markerId)

      setStartTemplateActiveMarkerId(Number.isNaN(id) ? null : id)
      return
    }

    window.requestAnimationFrame(updateStartTemplateActiveMarker)
  }

  const handleStartTemplateDescriptionKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    const editor = startTemplateDescriptionRef.current
    const selection = editor ? getSelectionOffsets(editor) : null
    const leadingMarkerRange = getLeadingMarkerRange(
      startTemplateDescriptionContent,
    )

    if (
      editor &&
      selection &&
      leadingMarkerRange &&
      selection.start === selection.end &&
      selection.start < leadingMarkerRange.end
    ) {
      moveCollapsedSelectionAfterLeadingMarker(
        editor,
        startTemplateDescriptionContent,
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
        (event.key === 'Delete' && selection.start < leadingMarkerRange.end))
    ) {
      event.preventDefault()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      document.execCommand('insertText', false, '\n')
    }
  }

  const insertStartTemplateSectionMarker = () => {
    const editor = startTemplateDescriptionRef.current
    const content = getFreshStartTemplateDescriptionContent()
    const text = getContentText(content)
    const selection = editor ? getSelectionOffsets(editor) : null
    const offset =
      selection?.end ?? getTerminalMarkerRange(content)?.start ?? text.length
    const insertion = insertSectionMarkerIntoContent(content, offset)
    const nextContent = ensureTerminalMarkerContent(insertion.content)

    setStartTemplateDescriptionContent(nextContent)
    setStartTemplateActiveMarkerId(insertion.marker.id)
    startTemplatePendingSelectionRef.current = {
      start: insertion.offset,
      end: insertion.offset,
    }
  }

  const changeStartTemplateMarkerTitle = (id: number, title: string) => {
    setStartTemplateDescriptionContent((content) =>
      ensureTerminalMarkerContent(
        content.map((segment) =>
          segment.type === 'marker' && segment.id === id
            ? { ...segment, title }
            : segment,
        ),
      ),
    )
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
      descriptionContent: ensureTerminalMarkerContent(
        completeFinalFindingInContent(
          copyContent(getFreshStartTemplateDescriptionContent()),
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
    setPassportCustomFieldDefinitions([])
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
    setPassportCustomFieldDefinitions([])
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

  const changeProtocolDocumentFontFamily = (documentFontFamily: string) => {
    setProtocolExportSettingsDraft((settings) => ({
      ...settings,
      documentFontFamily,
    }))
  }

  const changeProtocolPageMargin = (
    key: keyof ProtocolExportSettings['pageMargins'],
    value: string,
  ) => {
    const margin = Number(value)

    if (!Number.isFinite(margin)) {
      return
    }

    setProtocolExportSettingsDraft((settings) => ({
      ...settings,
      pageMargins: {
        ...settings.pageMargins,
        [key]: margin,
      },
    }))
  }

  const updateProtocolSectionStyle = (
    key: ProtocolSectionStyleKey,
    updater: (style: ProtocolSectionStyle) => ProtocolSectionStyle,
  ) => {
    setProtocolExportSettingsDraft((settings) => ({
      ...settings,
      [key]: updater(settings[key]),
    }))
  }

  const toggleProtocolSectionFormat = (
    key: ProtocolSectionStyleKey,
    formatKey: ProtocolSectionTextFormatKey,
  ) => {
    updateProtocolSectionStyle(key, (style) => ({
      ...style,
      [formatKey]: !style[formatKey],
    }))
  }

  const changeProtocolSectionAlignment = (
    key: ProtocolSectionStyleKey,
    align: ProtocolHeaderAlignment,
  ) => {
    updateProtocolSectionStyle(key, (style) => ({
      ...style,
      align,
    }))
  }

  const changeProtocolSectionFontSize = (
    key: ProtocolSectionStyleKey,
    value: string,
  ) => {
    const fontSize = Number(value)

    if (!Number.isFinite(fontSize)) {
      return
    }

    updateProtocolSectionStyle(key, (style) => ({
      ...style,
      fontSize,
    }))
  }

  const toggleProtocolHeaderFormat = (
    key: 'headerBold' | 'headerItalic' | 'headerUnderline',
  ) => {
    setProtocolExportSettingsDraft((settings) => ({
      ...settings,
      [key]: !settings[key],
    }))
  }

  const changeProtocolHeaderAlignment = (
    headerAlign: ProtocolHeaderAlignment,
  ) => {
    setProtocolExportSettingsDraft((settings) => ({
      ...settings,
      headerAlign,
    }))
  }

  const changeProtocolHeaderFontSize = (value: string) => {
    const headerFontSize = Number(value)

    if (!Number.isFinite(headerFontSize)) {
      return
    }

    setProtocolExportSettingsDraft((settings) => ({
      ...settings,
      headerFontSize,
    }))
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

  const renderFindingSearchBrowser = () => (
    <div
      aria-activedescendant={activeSearchBrowserItem?.key}
      aria-label="Браузер находок"
      className="search-browser-tree"
      onKeyDown={handleSearchBrowserKeyDown}
      role="tree"
      tabIndex={0}
    >
      {findingSearchBrowserItems.length > 0 ? (
        findingSearchBrowserItems.map((item) =>
          item.type === 'folder' ? (
            <button
              aria-expanded={item.hasChildren ? item.isExpanded : undefined}
              className={[
                'search-browser-row',
                'is-folder',
                item.key === activeSearchBrowserItem?.key ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              id={item.key}
              key={item.key}
              onClick={() => activateSearchBrowserItem(item)}
              role="treeitem"
              style={{ paddingLeft: 10 + item.level * 16 }}
              type="button"
            >
              <span className="search-browser-icon">
                {item.hasChildren ? (item.isExpanded ? '-' : '+') : ''}
              </span>
              <span className="search-browser-folder-icon" aria-hidden="true" />
              <strong>{item.folder.name}</strong>
            </button>
          ) : (
            <button
              className={[
                'search-browser-row',
                'is-finding',
                item.key === activeSearchBrowserItem?.key ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              id={item.key}
              key={item.key}
              onClick={() => activateSearchBrowserItem(item)}
              role="treeitem"
              style={{ paddingLeft: 10 + item.level * 16 }}
              type="button"
            >
              <span className="search-browser-icon">•</span>
              <span className="search-browser-text">
                <strong>{item.finding.name}</strong>
                {item.finding.description && (
                  <span>{item.finding.description}</span>
                )}
              </span>
            </button>
          ),
        )
      ) : (
        <p className="saved-finding-empty">Нет сохраненных находок</p>
      )}
    </div>
  )

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

  const renderProtocolDownloadSaveDialog = () =>
    protocolDownloadSaveDialog ? (
      <ProtocolDownloadSaveDialogPanel
        dialog={protocolDownloadSaveDialog}
        findingFolders={findingFolders}
        onClose={closeProtocolDownloadSaveDialog}
        onConfirm={confirmProtocolDownloadSave}
        onFindingFolderChange={updateProtocolDownloadFindingFolder}
        onFindingModeChange={updateProtocolDownloadFindingMode}
        onFindingNameChange={updateProtocolDownloadFindingName}
        onSaveItemCheckChange={updateProtocolDownloadSaveItem}
        onSectionIncludeFindingsChange={
          updateProtocolDownloadSectionIncludeFindings
        }
        onSectionNewOptionLabelChange={
          updateProtocolDownloadSectionNewOptionLabel
        }
        onSectionSaveModeChange={updateProtocolDownloadSectionSaveMode}
        onSkip={skipProtocolDownloadSave}
        savedFindings={savedFindings}
      />
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

          <div className="protocol-general-settings">
            <label className="modal-field protocol-font-field">
              <span>Шрифт протокола</span>
              <select
                onChange={(event) =>
                  changeProtocolDocumentFontFamily(event.target.value)
                }
                value={protocolExportSettingsDraft.documentFontFamily}
              >
                {protocolDocumentFontOptions.map((fontFamily) => (
                  <option key={fontFamily} value={fontFamily}>
                    {fontFamily}
                  </option>
                ))}
              </select>
            </label>

            <div className="modal-field protocol-page-margins-field">
              <span>Поля страницы, см</span>
              <div className="protocol-page-margins-grid">
                {protocolPageMarginFields.map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    <input
                      min="0"
                      max="5"
                      onChange={(event) =>
                        changeProtocolPageMargin(field.key, event.target.value)
                      }
                      step="0.1"
                      type="number"
                      value={protocolExportSettingsDraft.pageMargins[field.key]}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-field protocol-header-field">
            <span>Верхний колонтитул</span>
            <div
              aria-label="Форматирование верхнего колонтитула"
              className="protocol-header-toolbar"
            >
              <div className="protocol-header-toolbar-group">
                <button
                  aria-pressed={protocolExportSettingsDraft.headerBold}
                  className={
                    protocolExportSettingsDraft.headerBold ? 'is-active' : ''
                  }
                  onClick={() => toggleProtocolHeaderFormat('headerBold')}
                  title="Жирный"
                  type="button"
                >
                  <strong>B</strong>
                </button>
                <button
                  aria-pressed={protocolExportSettingsDraft.headerItalic}
                  className={
                    protocolExportSettingsDraft.headerItalic ? 'is-active' : ''
                  }
                  onClick={() => toggleProtocolHeaderFormat('headerItalic')}
                  title="Курсив"
                  type="button"
                >
                  <em>I</em>
                </button>
                <button
                  aria-pressed={protocolExportSettingsDraft.headerUnderline}
                  className={
                    protocolExportSettingsDraft.headerUnderline
                      ? 'is-active'
                      : ''
                  }
                  onClick={() => toggleProtocolHeaderFormat('headerUnderline')}
                  title="Подчеркивание"
                  type="button"
                >
                  <u>U</u>
                </button>
              </div>

              <label className="protocol-header-size-select">
                <span>Размер</span>
                <select
                  aria-label="Размер шрифта"
                  onChange={(event) =>
                    changeProtocolHeaderFontSize(event.target.value)
                  }
                  value={protocolExportSettingsDraft.headerFontSize}
                >
                  {protocolHeaderFontSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>

              <div className="protocol-header-toolbar-group">
                {protocolHeaderAlignments.map((alignment) => (
                  <button
                    aria-pressed={
                      protocolExportSettingsDraft.headerAlign ===
                      alignment.value
                    }
                    className={
                      protocolExportSettingsDraft.headerAlign ===
                      alignment.value
                        ? 'is-active'
                        : ''
                    }
                    key={alignment.value}
                    onClick={() =>
                      changeProtocolHeaderAlignment(alignment.value)
                    }
                    title={alignment.title}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`protocol-align-icon is-${alignment.value}`}
                    />
                    <span className="sr-only">{alignment.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="protocol-header-textarea"
              onChange={(event) =>
                setProtocolExportSettingsDraft((settings) => ({
                  ...settings,
                  headerText: event.target.value,
                }))
              }
              placeholder="Текст шапки протокола"
              style={protocolHeaderEditorStyle}
              value={protocolExportSettingsDraft.headerText}
            />
          </div>

          <div className="modal-field protocol-section-settings">
            <span>Оформление разделов</span>
            <div className="protocol-section-style-grid">
              {protocolSectionStyleFields.map((section) => {
                const style = protocolExportSettingsDraft[section.key]

                return (
                  <div className="protocol-section-style-card" key={section.key}>
                    <strong>{section.label}</strong>
                    <div className="protocol-section-style-controls">
                      <button
                        aria-pressed={style.bold}
                        className={style.bold ? 'is-active' : ''}
                        onClick={() =>
                          toggleProtocolSectionFormat(section.key, 'bold')
                        }
                        title="Жирный"
                        type="button"
                      >
                        <strong>B</strong>
                      </button>
                      <button
                        aria-pressed={style.italic}
                        className={style.italic ? 'is-active' : ''}
                        onClick={() =>
                          toggleProtocolSectionFormat(section.key, 'italic')
                        }
                        title="Курсив"
                        type="button"
                      >
                        <em>I</em>
                      </button>
                      <button
                        aria-pressed={style.underline}
                        className={style.underline ? 'is-active' : ''}
                        onClick={() =>
                          toggleProtocolSectionFormat(section.key, 'underline')
                        }
                        title="Подчеркивание"
                        type="button"
                      >
                        <u>U</u>
                      </button>
                      <label className="protocol-section-size-select">
                        <span>Размер</span>
                        <select
                          aria-label={`Размер шрифта: ${section.label}`}
                          onChange={(event) =>
                            changeProtocolSectionFontSize(
                              section.key,
                              event.target.value,
                            )
                          }
                          value={style.fontSize}
                        >
                          {protocolHeaderFontSizes.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="protocol-section-align-group">
                        {protocolHeaderAlignments.map((alignment) => (
                          <button
                            aria-pressed={style.align === alignment.value}
                            className={
                              style.align === alignment.value ? 'is-active' : ''
                            }
                            key={alignment.value}
                            onClick={() =>
                              changeProtocolSectionAlignment(
                                section.key,
                                alignment.value,
                              )
                            }
                            title={`${section.label}: ${alignment.title}`}
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className={`protocol-align-icon is-${alignment.value}`}
                            />
                            <span className="sr-only">{alignment.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

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
      <section
        aria-labelledby="marker-settings-title"
        className="modal-panel marker-settings-modal marker-settings-floating"
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

          {shouldShowMarkerBoundaryReminder ? (
            <div className="marker-boundary-reminder" role="note">
              {markerBoundaryReminderText}
            </div>
          ) : (
            <div className="marker-option-list">
              {markerDialogOptions.map((option, index) => (
              <div className="marker-option-row" key={index}>
                <div className="marker-option-fields">
                  <div className="marker-option-title-wrap">
                    <input
                      aria-label={`Название заготовки ${index + 1}`}
                      onChange={(event) =>
                        changeMarkerOptionTitle(
                          markerDialogSegment.id,
                          index,
                          event.target.value,
                        )
                      }
                      placeholder={
                        isStandardMarkerOptionIndex(index, markerDialogBlock)
                          ? standardMarkerOptionTitle
                          : 'Название'
                      }
                      ref={(element) => {
                        const key = getMarkerOptionTextareaKey(
                          markerDialogSegment.id,
                          index,
                        )

                        if (element) {
                          markerOptionTitleRefs.current.set(key, element)
                        } else {
                          markerOptionTitleRefs.current.delete(key)
                        }
                      }}
                      type="text"
                      value={option.title}
                    />
                    <button
                      aria-label={
                        markerDialogOptionState.defaultOptionIndex === index
                          ? `Заготовка ${index + 1} по умолчанию`
                          : `Сделать заготовку ${index + 1} по умолчанию`
                      }
                      className={[
                        'marker-option-default-button',
                        markerDialogOptionState.defaultOptionIndex === index
                          ? 'is-active'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={!markerDialogBlock?.hasNextMarker}
                      onClick={() =>
                        makeMarkerOptionDefault(markerDialogSegment.id, index)
                      }
                      title={
                        markerDialogOptionState.defaultOptionIndex === index
                          ? 'По умолчанию'
                          : 'Сделать по умолчанию'
                      }
                      type="button"
                    >
                      {defaultMarkerOptionIcon}
                    </button>
                    <button
                      aria-label={`Удалить заготовку ${index + 1}`}
                      className="marker-option-delete-button"
                      disabled={
                        !canDeleteMarkerOption(
                          option,
                          markerDialogBlock,
                          index,
                        )
                      }
                      onClick={() =>
                        deleteMarkerOption(markerDialogSegment.id, index)
                      }
                      title={
                        canDeleteMarkerOption(
                          option,
                          markerDialogBlock,
                          index,
                        )
                          ? 'Удалить заготовку'
                          : 'Начальная заготовка нужна как исходная'
                      }
                      type="button"
                    >
                      x
                    </button>
                  </div>
                  <div className="marker-option-textarea-wrap">
                    <div
                      aria-label={`Текст заготовки ${index + 1}`}
                      aria-multiline="true"
                      className="marker-option-editor"
                      contentEditable
                      data-empty={option.value.trim() ? undefined : 'true'}
                      data-placeholder="Заготовка"
                      dangerouslySetInnerHTML={{
                        __html: markerOptionValueToHtml(option.value),
                      }}
                      onClick={(event) => {
                        const token = (
                          event.target as HTMLElement | null
                        )?.closest<HTMLElement>('.marker-option-variant-token')
                        const rawStart = Number(token?.dataset.rawStart)
                        const rawEnd = Number(token?.dataset.rawEnd)

                        if (
                          token &&
                          event.currentTarget.contains(token) &&
                          Number.isFinite(rawStart) &&
                          Number.isFinite(rawEnd)
                        ) {
                          setActiveVariant(null)
                          setActiveMarkerOptionVariant({
                            end: rawEnd,
                            markerId: markerDialogSegment.id,
                            optionIndex: index,
                            start: rawStart,
                          })
                        }
                      }}
                      onFocus={(event) =>
                        rememberMarkerOptionSelection(
                          markerDialogSegment.id,
                          index,
                          event.currentTarget,
                        )
                      }
                      onInput={(event) =>
                        handleMarkerOptionValueInput(
                          markerDialogSegment.id,
                          index,
                          event.currentTarget,
                        )
                      }
                      onKeyUp={(event) =>
                        rememberMarkerOptionSelection(
                          markerDialogSegment.id,
                          index,
                          event.currentTarget,
                        )
                      }
                      onMouseUp={(event) =>
                        rememberMarkerOptionSelection(
                          markerDialogSegment.id,
                          index,
                          event.currentTarget,
                        )
                      }
                      onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
                        event.preventDefault()
                        document.execCommand(
                          'insertText',
                          false,
                          event.clipboardData.getData('text/plain'),
                        )
                      }}
                      ref={(element) => {
                        const key = getMarkerOptionTextareaKey(
                          markerDialogSegment.id,
                          index,
                        )

                        if (element) {
                          markerOptionValueRefs.current.set(key, element)
                        } else {
                          markerOptionValueRefs.current.delete(key)
                        }
                      }}
                      role="textbox"
                      spellCheck
                      suppressContentEditableWarning
                    />
                    <div className="marker-option-findings-box">
                      <span className="marker-option-findings-title">
                        Находки
                      </span>
                      <div className="marker-option-finding-capsules">
                        {option.findingIds.length ? (
                          option.findingIds.map((findingId) => {
                            const finding =
                              savedFindings.find(
                                (item) => item.id === findingId,
                              ) ?? null

                            return (
                              <span
                                className="marker-option-finding-chip"
                                key={findingId}
                                title={
                                  finding?.name ?? 'Находка не найдена'
                                }
                              >
                                <span>
                                  {finding?.name ?? 'Находка не найдена'}
                                </span>
                                <button
                                  aria-label="Убрать находку из заготовки"
                                  onClick={() =>
                                    removeMarkerOptionFinding(
                                      markerDialogSegment.id,
                                      index,
                                      findingId,
                                    )
                                  }
                                  type="button"
                                >
                                  x
                                </button>
                              </span>
                            )
                          })
                        ) : (
                          <span className="marker-option-findings-empty">
                            Нет связанных находок
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <label className="variant-check marker-option-check">
                  <input
                    checked={
                      markerDialogOptionState.selectedOptionIndex === index
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
          )}

          <button
            aria-label="Добавить заготовку"
            className="marker-add-button"
            onClick={() => addMarkerOption(markerDialogSegment.id)}
            type="button"
          >
            +
          </button>
      </section>
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
            {passportCustomFieldDefinitions.length > 0 ? (
              passportCustomFieldDefinitions.map((field) => (
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
                onClick={openStartCreateDialog}
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
              className={[
                'modal-panel',
                'start-create-modal',
                startTemplateStep === 2 ? 'is-marker-step' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-header">
                <h2 id="start-create-template-title">
                  {startTemplateStep === 1
                    ? 'Новый шаблон'
                    : 'Разметка шаблона'}
                </h2>
                <button
                  aria-label="Закрыть"
                  className="modal-close-button"
                  onClick={closeStartCreateDialog}
                  type="button"
                >
                  x
                </button>
              </div>

              <div className="start-create-progress" aria-label="Этап создания">
                <span className={startTemplateStep === 1 ? 'is-active' : ''}>
                  1. Текст
                </span>
                <span className={startTemplateStep === 2 ? 'is-active' : ''}>
                  2. Метки
                </span>
              </div>

              {startTemplateStep === 1 ? (
                <>
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
                      onClick={goToStartTemplateMarkerStep}
                      type="button"
                    >
                      Далее
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="start-marker-hint">
                    Абзацы из описания уже разбиты на разделы: каждый раздел
                    хранится одним блоком. Добавьте метки вручную, если нужно
                    разделить блок точнее; метка К закрывает последний раздел.
                  </p>

                  <div className="start-marker-builder">
                    <div className="start-marker-workspace">
                      <div className="start-marker-toolbar">
                        <button
                          onClick={insertStartTemplateSectionMarker}
                          type="button"
                        >
                          Поставить метку
                        </button>
                        <span>{startTemplateDescriptionText.length} знаков</span>
                      </div>

                      <div className="start-marker-field">
                        <span>Описание</span>
                        <div
                          aria-label="Описание шаблона"
                          aria-multiline="true"
                          className="editor start-template-editor"
                          contentEditable
                          data-empty={
                            startTemplateDescriptionText.trim()
                              ? undefined
                              : 'true'
                          }
                          data-placeholder="Описание шаблона"
                          dangerouslySetInnerHTML={{
                            __html: startTemplateDescriptionHtml,
                          }}
                          onClick={handleStartTemplateDescriptionClick}
                          onInput={handleStartTemplateDescriptionInput}
                          onKeyDown={handleStartTemplateDescriptionKeyDown}
                          onKeyUp={updateStartTemplateActiveMarker}
                          onMouseUp={updateStartTemplateActiveMarker}
                          onPaste={handleEditorPaste}
                          ref={startTemplateDescriptionRef}
                          role="textbox"
                          spellCheck
                          suppressContentEditableWarning
                        />
                      </div>

                    </div>

                    <aside className="start-section-panel">
                      <h3>Разделы</h3>
                      <div className="start-section-list">
                        {startTemplateSectionMarkers.map(({ number, segment }) => (
                          <label
                            className={[
                              'start-section-row',
                              startTemplateActiveMarkerId === segment.id
                                ? 'is-active'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            key={segment.id}
                          >
                            <span>{number}</span>
                            <input
                              onChange={(event) =>
                                changeStartTemplateMarkerTitle(
                                  segment.id,
                                  event.target.value,
                                )
                              }
                              placeholder={`Раздел ${number}`}
                              type="text"
                              value={segment.title}
                            />
                          </label>
                        ))}
                      </div>
                    </aside>
                  </div>

                  <div className="modal-actions">
                    <button
                      onClick={returnToStartTemplateTextStep}
                      type="button"
                    >
                      Назад
                    </button>
                    <button
                      disabled={!startTemplateDraft.name.trim()}
                      onClick={createStartTemplate}
                      type="button"
                    >
                      Создать шаблон
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {renderFindingBrowserDialog()}
        {renderProtocolExportSettingsDialog()}
        {renderPassportSettingsDialog()}
        {renderUserSwitchConfirmDialog()}
        {renderProtocolSessionCloseDialog()}
        {renderProtocolDownloadSaveDialog()}
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
                aria-label="Добавить смысловой блок"
                className="field-tool-button"
                onClick={insertSemanticBlockAfterCursor}
                onMouseDown={(event) => event.preventDefault()}
                title="Добавить смысловой блок"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="field-tool-icon semantic-block-icon"
                >
                  {'{}'}
                </span>
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

      {editorWarning && (
        <div className="editor-warning-toast" role="status">
          {editorWarning}
        </div>
      )}

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
                const isNavigationActive =
                  navigationHighlight?.field === 'description' &&
                  isSameRange(navigationHighlight.range, range)
                const isActive =
                  pair?.id === highlightedPairId || isNavigationActive
                const savedOrigin = getFindingSavedOrigin(
                  pair,
                  descriptionValue,
                  conclusionValue,
                )
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
                    <div className="finding-summary-badges">
                      <button
                        aria-label={`Находка ${index + 1}`}
                        className="finding-summary-number finding-summary-number-button"
                        onClick={() => activateFindingCapsule(range)}
                        title={descriptionValue}
                        type="button"
                      >
                        {index + 1}
                      </button>
                      <span
                        aria-label={
                          savedOrigin ? 'Saved finding' : 'Unsaved finding'
                        }
                        className={[
                          'finding-summary-saved-status',
                          savedOrigin ? 'is-saved' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        role="img"
                        title={
                          savedOrigin
                            ? `Saved: ${savedOrigin.name}`
                            : 'Not saved'
                        }
                      >
                        {'\u2713'}
                      </span>
                    </div>
                    <button
                      aria-label={`Находка ${index + 1}`}
                      className="finding-summary-content"
                      onClick={() => navigateFindingSummary(range)}
                      title={[
                        descriptionValue,
                        conclusionValue,
                        lateralityWarning
                          ? `Проверьте сторону: ${lateralityWarning}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join('\n')}
                      type="button"
                    >
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
                            <span
                              aria-hidden="true"
                              className="finding-summary-warning-icon"
                            >
                              !
                            </span>
                            <span className="finding-summary-warning-text">
                              Проверьте сторону: {lateralityWarning}
                            </span>
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      aria-label={`Удалить находку ${index + 1}`}
                      className="finding-delete-button"
                      onClick={() => deleteFindingSummary(range)}
                      title="Удалить находку"
                      type="button"
                    >
                      Удалить
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </aside>

      {visibleVariantSegment && (
        <VariantPopover
          onAddOption={addVariantOption}
          onChangeOption={changeVariantOption}
          onDeleteOption={deleteVariantOption}
          onSelectOption={chooseVariantOption}
          panelWidth={sidePanelWidth}
          variant={visibleVariantSegment}
        />
      )}

      {markerMenu && markerMenuSegment && (
        <div
          className="context-menu marker-context-menu"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: markerMenu.x, top: markerMenu.y }}
        >
          {markerMenuOptions.length ? (
            markerMenuOptions.map((option, index) => (
              <button
                className="marker-menu-option"
                key={index}
                onClick={() => applyMarkerOption(markerMenu.id, index)}
                title={option.value}
                type="button"
              >
                <span className="marker-menu-option-label">
                  {getMarkerOptionLabel(option, index, markerMenuBlock)}
                </span>
                {markerMenuOptionState.defaultOptionIndex === index && (
                  <span
                    aria-label="По умолчанию"
                    className="marker-default-badge"
                    title="По умолчанию"
                  >
                    {defaultMarkerOptionIcon}
                  </span>
                )}
              </button>
            ))
          ) : (
            <span className="marker-context-note">
              {markerBoundaryReminderText}
            </span>
          )}
        </div>
      )}

      {markerContextMenu && markerContextMenuSegment && (
        <div
          className="context-menu marker-action-menu"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: markerContextMenu.x, top: markerContextMenu.y }}
        >
          <div className="marker-action-selected-option">
            <span>Выбрано</span>
            <strong>{markerContextMenuSelectedOptionLabel}</strong>
          </div>
          <button
            disabled={
              !markerContextMenuBlock?.hasNextMarker ||
              markerContextMenuSelectedOptionIndex === null
            }
            onClick={() =>
              requestMarkerOptionSave(markerContextMenu.id, 'update')
            }
            title={
              markerContextMenuSelectedOptionIndex === null
                ? 'Сначала выберите заготовку'
                : !markerContextMenuBlock?.hasNextMarker
                  ? 'Добавьте следующую метку, чтобы указать границы раздела'
                  : 'Перезаписать выбранную заготовку текущим текстом раздела'
            }
            type="button"
          >
            Обновить
          </button>
          <button
            disabled={!markerContextMenuBlock?.hasNextMarker}
            onClick={() => requestMarkerOptionSave(markerContextMenu.id, 'new')}
            title={
              markerContextMenuBlock?.hasNextMarker
                ? 'Создать новую заготовку из текущего текста раздела'
                : 'Добавьте следующую метку, чтобы указать границы раздела'
            }
            type="button"
          >
            Сохранить как новый
          </button>
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

      {pendingMarkerOptionSaveAction && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setPendingMarkerOptionSaveAction(null)}
        >
          <section
            aria-labelledby="marker-save-mode-title"
            aria-modal="true"
            className="modal-panel marker-save-mode-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <h2 id="marker-save-mode-title">
                Включить находки в шаблон раздела?
              </h2>
              <button
                aria-label="Закрыть"
                className="modal-close-button"
                onClick={() => setPendingMarkerOptionSaveAction(null)}
                type="button"
              >
                x
              </button>
            </div>
            <p className="marker-save-mode-text">
              Нет сохранит только основной блок раздела. Да добавит находки
              отдельными ссылками на память.
            </p>
            <div className="modal-actions">
              <button
                onClick={() => completePendingMarkerOptionSave(false)}
                type="button"
              >
                Нет
              </button>
              <button
                onClick={() => completePendingMarkerOptionSave(true)}
                type="button"
              >
                Да
              </button>
            </div>
          </section>
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
            <div
              aria-label="Предпросмотр сохраняемой находки"
              className="finding-save-preview"
            >
              <div className="finding-save-preview-block">
                <strong>Описание</strong>
                <p>
                  {findingSaveDialog.description.trim() || 'Описание пустое'}
                </p>
              </div>
              <div className="finding-save-preview-block">
                <strong>Заключение</strong>
                <p>
                  {findingSaveDialog.conclusion.trim() ||
                    'Заключение не добавлено'}
                </p>
              </div>
            </div>
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
      {renderProtocolDownloadSaveDialog()}

      {isFindingSearchOpen && (
        <div className="modal-backdrop" onMouseDown={closeFindingSearch}>
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
                onClick={closeFindingSearch}
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
              onKeyDown={handleSearchBrowserKeyDown}
              placeholder="Поиск"
              type="text"
              value={findingSearchQuery}
            />
            {findingSearchWarning && (
              <p className="search-warning">{findingSearchWarning}</p>
            )}
            {findingSearchQuery.trim() ? (
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
            ) : (
              renderFindingSearchBrowser()
            )}
          </section>
        </div>
      )}

      {protocolSaveNotice && (
        <div className="protocol-save-toast" role="status" aria-live="polite">
          <div className="protocol-save-toast-body">
            <strong>Протокол сохранен</strong>
            <span>{protocolSaveNotice.message}</span>
            <small>{protocolSaveNotice.fileName}</small>
          </div>
          <button
            aria-label="Закрыть уведомление"
            className="protocol-save-toast-close"
            onClick={closeProtocolSaveNotice}
            type="button"
          >
            x
          </button>
        </div>
      )}

    </main>
  )
}

export default App
