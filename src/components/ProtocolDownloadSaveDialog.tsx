import type { ReactNode } from 'react'
import type {
  EditorSegment,
  FindingFolder,
  MarkerOption,
  SavedFinding,
  TextRange,
} from '../types'
import {
  findingFolderCreateSelectPrefix,
  findingFolderRootSelectValue,
  findingFolderSelectPrefix,
  getFindingFolderPath,
  getRootFindingFolderByName,
} from '../utils/findingFolders'
import {
  getMarkerOptionVariantOptionsSignature,
  getMarkerTemplateParts,
  hasMarkerOptionVariantChange,
} from '../utils/markerOptions'

type ProtocolDownloadSaveItemBase = {
  checked: boolean
  detail: string
  id: string
  isSectionGroup: boolean
  label: string
  sectionTitle: string
}

export type ProtocolDownloadSectionSaveMode = 'new' | 'update'

type ProtocolDownloadSectionSaveFields = {
  includeFindings: boolean
  newOptionLabel: string
  saveMode: ProtocolDownloadSectionSaveMode
}

export type ProtocolDownloadSectionCurrentSaveItem =
  ProtocolDownloadSaveItemBase & {
    kind: 'section-current'
    markerId: number
    optionIndex: number
    optionLabel: string
    previousValue: string
    range: TextRange
    value: string
  } & ProtocolDownloadSectionSaveFields

export type ProtocolDownloadSectionOptionSaveItem =
  ProtocolDownloadSaveItemBase & {
    isFindingReferenceOnly?: boolean
    isNewOption: boolean
    kind: 'section-option'
    markerId: number
    option: MarkerOption
    optionIndex: number
    optionLabel: string
    previousFindingIds: string[]
    previousOptionLabel: string | null
    previousValue: string
    value: string
  } & ProtocolDownloadSectionSaveFields

export type ProtocolDownloadSectionStructureSaveItem =
  ProtocolDownloadSaveItemBase & {
    addedSectionNames: string[]
    descriptionContent: EditorSegment[]
    kind: 'section-structure'
    removedSectionNames: string[]
  }

export type ProtocolDownloadFindingSaveItem = ProtocolDownloadSaveItemBase & {
  conclusion: string
  conclusionContent: EditorSegment[]
  conclusionRange: TextRange | null
  description: string
  descriptionContent: EditorSegment[]
  descriptionRange: TextRange
  folderId: string | null
  folderName: string | null
  kind: 'finding-new' | 'finding-update'
  markerId: number | null
  name: string
  pairId: number | null
  savedFindingId: string | null
  suggestedFolderName: string | null
}

export type ProtocolDownloadSaveItem =
  | ProtocolDownloadSectionStructureSaveItem
  | ProtocolDownloadSectionCurrentSaveItem
  | ProtocolDownloadSectionOptionSaveItem
  | ProtocolDownloadFindingSaveItem

export type ProtocolDownloadSaveDialogState = {
  items: ProtocolDownloadSaveItem[]
}

type ProtocolDownloadSaveDialogProps = {
  dialog: ProtocolDownloadSaveDialogState
  findingFolders: FindingFolder[]
  onClose: () => void
  onConfirm: () => void | Promise<void>
  onFindingFolderChange: (id: string, value: string) => void
  onFindingModeChange: (id: string, mode: 'new' | 'update') => void
  onFindingNameChange: (id: string, name: string) => void
  onSaveItemCheckChange: (id: string, checked: boolean) => void
  onSectionIncludeFindingsChange: (
    markerId: number,
    includeFindings: boolean,
  ) => void
  onSectionNewOptionLabelChange: (markerId: number, label: string) => void
  onSectionSaveModeChange: (
    markerId: number,
    mode: ProtocolDownloadSectionSaveMode,
  ) => void
  onSkip: () => void | Promise<void>
  savedFindings: SavedFinding[]
}

type ProtocolChangeExcerpt =
  | {
      after: string
      before: string
      changed: string
      hasLeadingEllipsis: boolean
      hasTrailingEllipsis: boolean
      kind: 'changed'
    }
  | {
      after: string
      before: string
      deleted: string
      hasLeadingEllipsis: boolean
      hasTrailingEllipsis: boolean
      kind: 'deleted'
    }
  | {
      kind: 'unchanged'
      text: string
    }

type ProtocolChangeWord = TextRange & {
  text: string
}

const getFindingLabelText = (value: string) =>
  value.replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim()

const getChangePreviewText = (value: string) =>
  getFindingLabelText(
    getMarkerTemplateParts(value)
      .map((part) =>
        part.type === 'variant'
          ? part.options
              .map((option) => option.trim())
              .filter(Boolean)
              .join('/')
          : part.text,
      )
      .join(''),
  )

const getWordRanges = (value: string) => {
  const ranges: ProtocolChangeWord[] = []
  const pattern = /\S+/g
  let match = pattern.exec(value)

  while (match) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    })
    match = pattern.exec(value)
  }

  return ranges
}

const getTokenMatches = (
  previousWords: ProtocolChangeWord[],
  nextWords: ProtocolChangeWord[],
) => {
  const previousLength = previousWords.length
  const nextLength = nextWords.length
  const scores = Array.from({ length: previousLength + 1 }, () =>
    Array<number>(nextLength + 1).fill(0),
  )

  for (let previousIndex = previousLength - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let nextIndex = nextLength - 1; nextIndex >= 0; nextIndex -= 1) {
      scores[previousIndex][nextIndex] =
        previousWords[previousIndex].text === nextWords[nextIndex].text
          ? scores[previousIndex + 1][nextIndex + 1] + 1
          : Math.max(
              scores[previousIndex + 1][nextIndex],
              scores[previousIndex][nextIndex + 1],
            )
    }
  }

  const matches: Array<{ nextIndex: number; previousIndex: number }> = []
  let previousIndex = 0
  let nextIndex = 0

  while (previousIndex < previousLength && nextIndex < nextLength) {
    if (previousWords[previousIndex].text === nextWords[nextIndex].text) {
      matches.push({ nextIndex, previousIndex })
      previousIndex += 1
      nextIndex += 1
      continue
    }

    if (
      scores[previousIndex + 1][nextIndex] >=
      scores[previousIndex][nextIndex + 1]
    ) {
      previousIndex += 1
    } else {
      nextIndex += 1
    }
  }

  return matches
}

const createChangedExcerpt = (
  value: string,
  words: ProtocolChangeWord[],
  changedIndexes: { endIndex: number; startIndex: number },
) => {
  const contextStartIndex = Math.max(0, changedIndexes.startIndex - 1)
  const contextEndIndex = Math.min(
    words.length - 1,
    changedIndexes.endIndex + 1,
  )
  const excerptStart = words[contextStartIndex]?.start ?? 0
  const excerptEnd = words[contextEndIndex]?.end ?? value.length
  const changedStart = words[changedIndexes.startIndex]?.start ?? excerptStart
  const changedEnd = words[changedIndexes.endIndex]?.end ?? excerptEnd

  return {
    after: value.slice(changedEnd, excerptEnd),
    before: value.slice(excerptStart, changedStart),
    changed: value.slice(changedStart, changedEnd),
    hasLeadingEllipsis: excerptStart > 0,
    hasTrailingEllipsis: excerptEnd < value.length,
    kind: 'changed' as const,
  }
}

const createDeletedExcerpt = (
  value: string,
  words: ProtocolChangeWord[],
  deletedIndexes: { endIndex: number; startIndex: number },
) => {
  const contextStartIndex = Math.max(0, deletedIndexes.startIndex - 1)
  const contextEndIndex = Math.min(
    words.length - 1,
    deletedIndexes.endIndex + 1,
  )
  const excerptStart = words[contextStartIndex]?.start ?? 0
  const excerptEnd = words[contextEndIndex]?.end ?? value.length
  const deletedStart = words[deletedIndexes.startIndex]?.start ?? excerptStart
  const deletedEnd = words[deletedIndexes.endIndex]?.end ?? excerptEnd

  return {
    after: value.slice(deletedEnd, excerptEnd),
    before: value.slice(excerptStart, deletedStart),
    deleted: value.slice(deletedStart, deletedEnd),
    hasLeadingEllipsis: excerptStart > 0,
    hasTrailingEllipsis: excerptEnd < value.length,
    kind: 'deleted' as const,
  }
}

const getChangeExcerptParts = (
  previousValue: string,
  nextValue: string,
): ProtocolChangeExcerpt[] => {
  const previous = getChangePreviewText(previousValue)
  const next = getChangePreviewText(nextValue)

  if (previous === next) {
    return [{ kind: 'unchanged', text: next }]
  }

  const previousWords = getWordRanges(previous)
  const nextWords = getWordRanges(next)

  if (!previousWords.length && !nextWords.length) {
    return [{ kind: 'unchanged', text: next }]
  }

  if (!previousWords.length) {
    return nextWords.length
      ? [
          createChangedExcerpt(next, nextWords, {
            endIndex: nextWords.length - 1,
            startIndex: 0,
          }),
        ]
      : [{ kind: 'unchanged', text: next }]
  }

  if (!nextWords.length) {
    return [
      createDeletedExcerpt(previous, previousWords, {
        endIndex: previousWords.length - 1,
        startIndex: 0,
      }),
    ]
  }

  const matches = [
    ...getTokenMatches(previousWords, nextWords),
    { nextIndex: nextWords.length, previousIndex: previousWords.length },
  ]
  const excerpts: ProtocolChangeExcerpt[] = []
  let previousCursor = 0
  let nextCursor = 0

  matches.forEach((match) => {
    const hasPreviousChange = previousCursor < match.previousIndex
    const hasNextChange = nextCursor < match.nextIndex

    if (hasNextChange) {
      excerpts.push(
        createChangedExcerpt(next, nextWords, {
          endIndex: match.nextIndex - 1,
          startIndex: nextCursor,
        }),
      )
    } else if (hasPreviousChange) {
      excerpts.push(
        createDeletedExcerpt(previous, previousWords, {
          endIndex: match.previousIndex - 1,
          startIndex: previousCursor,
        }),
      )
    }

    previousCursor = match.previousIndex + 1
    nextCursor = match.nextIndex + 1
  })

  return excerpts.length ? excerpts : [{ kind: 'unchanged', text: next }]
}

const isFindingSaveItem = (
  item: ProtocolDownloadSaveItem,
): item is ProtocolDownloadFindingSaveItem =>
  item.kind === 'finding-new' || item.kind === 'finding-update'

const isSectionSaveItem = (
  item: ProtocolDownloadSaveItem,
): item is
  | ProtocolDownloadSectionCurrentSaveItem
  | ProtocolDownloadSectionOptionSaveItem =>
  item.kind === 'section-current' || item.kind === 'section-option'

const ProtocolDownloadSaveDialogPanel = ({
  dialog,
  findingFolders,
  onClose,
  onConfirm,
  onFindingFolderChange,
  onFindingModeChange,
  onFindingNameChange,
  onSaveItemCheckChange,
  onSectionIncludeFindingsChange,
  onSectionNewOptionLabelChange,
  onSectionSaveModeChange,
  onSkip,
  savedFindings,
}: ProtocolDownloadSaveDialogProps) => {
  const allFindingItems = dialog.items.filter(isFindingSaveItem)
  const groups = dialog.items
    .filter((item) => !isFindingSaveItem(item))
    .reduce<Array<{ items: ProtocolDownloadSaveItem[]; title: string }>>(
      (result, item) => {
        const existingGroup = result.find(
          (group) => group.title === item.sectionTitle,
        )

        if (existingGroup) {
          existingGroup.items.push(item)
          return result
        }

        result.push({ items: [item], title: item.sectionTitle })
        return result
      },
      [],
    )
  const selectedCount = dialog.items.filter((item) => item.checked).length
  const folderOptions = findingFolders
    .map((folder) => ({
      id: folder.id,
      label: getFindingFolderPath(folder, findingFolders),
    }))
    .sort((first, second) => first.label.localeCompare(second.label))

  const renderFindingFolderSelect = (
    item: ProtocolDownloadFindingSaveItem,
    showLabel = true,
  ) => {
    const selectedValue = item.folderName
      ? `${findingFolderCreateSelectPrefix}${item.folderName}`
      : item.folderId
        ? `${findingFolderSelectPrefix}${item.folderId}`
        : findingFolderRootSelectValue
    const createFolderName =
      item.suggestedFolderName &&
      !getRootFindingFolderByName(findingFolders, item.suggestedFolderName)
        ? item.suggestedFolderName
        : null

    return (
      <label className="protocol-download-save-folder">
        {showLabel && <span>Папка</span>}
        <select
          onChange={(event) =>
            onFindingFolderChange(item.id, event.target.value)
          }
          value={selectedValue}
        >
          <option value={findingFolderRootSelectValue}>Корневая</option>
          {folderOptions.map((option) => (
            <option
              key={option.id}
              value={`${findingFolderSelectPrefix}${option.id}`}
            >
              {option.label}
            </option>
          ))}
          {createFolderName && (
            <option
              value={`${findingFolderCreateSelectPrefix}${createFolderName}`}
            >
              {createFolderName} (создать)
            </option>
          )}
        </select>
      </label>
    )
  }

  const getItemChangeType = (item: ProtocolDownloadSaveItem) => {
    if (item.kind === 'section-current') {
      return 'Текст'
    }

    if (item.kind === 'section-option') {
      const hasFindingChange =
        item.previousFindingIds.join('\n') !== item.option.findingIds.join('\n')

      if (item.isFindingReferenceOnly || hasFindingChange) {
        return 'Находки'
      }

      return hasMarkerOptionVariantChange(item.value, item.previousValue)
        ? 'Вариант'
        : 'Текст'
    }

    if (item.kind === 'section-structure') {
      return 'Разделы'
    }

    return item.kind === 'finding-update' ? 'Находка' : 'Новая находка'
  }

  const getFindingSaveLabel = (item: ProtocolDownloadFindingSaveItem) =>
    item.kind === 'finding-update'
      ? `Обновить находку «${item.name}»`
      : `Сохранить как новую «${item.name}»`

  const renderChangeExcerptNode = (
    excerpt: ProtocolChangeExcerpt,
    key: string,
    emptyLabel: string,
  ) => {
    if (excerpt.kind === 'unchanged') {
      return <span key={key}>{excerpt.text || emptyLabel}</span>
    }

    if (excerpt.kind === 'deleted') {
      return (
        <span className="protocol-change-excerpt" key={key}>
          {excerpt.hasLeadingEllipsis && <span>... </span>}
          {excerpt.before}
          <del>{excerpt.deleted}</del>
          {excerpt.after}
          {excerpt.hasTrailingEllipsis && <span> ...</span>}
        </span>
      )
    }

    return (
      <span className="protocol-change-excerpt" key={key}>
        {excerpt.hasLeadingEllipsis && <span>... </span>}
        {excerpt.before}
        <span className="protocol-change">{excerpt.changed}</span>
        {excerpt.after}
        {excerpt.hasTrailingEllipsis && <span> ...</span>}
      </span>
    )
  }

  const renderChangeExcerpts = (
    previousValue: string,
    nextValue: string,
    emptyLabel: string,
  ) =>
    getChangeExcerptParts(previousValue, nextValue).map((excerpt, index) =>
      renderChangeExcerptNode(excerpt, `change-${index}`, emptyLabel),
    )

  const renderTextChangeDetail = (
    item: ProtocolDownloadSectionCurrentSaveItem,
  ) =>
    renderChangeExcerpts(
      item.previousValue,
      item.value,
      'Текст раздела пустой',
    )

  const renderFindingNameField = (item: ProtocolDownloadFindingSaveItem) =>
    item.kind === 'finding-new' ? (
      <label className="protocol-download-finding-name-field">
        <span>Название</span>
        <input
          onChange={(event) => onFindingNameChange(item.id, event.target.value)}
          placeholder="Название находки"
          type="text"
          value={item.name}
        />
      </label>
    ) : null

  const renderFindingTextLine = (
    label: string,
    value: string,
    emptyLabel: string,
    key: string,
  ) => (
    <div className="protocol-download-save-finding-line" key={key}>
      <span className="protocol-download-save-finding-line-label">
        {label}
      </span>
      <span>{value || emptyLabel}</span>
    </div>
  )

  const renderFindingChangeLine = (
    label: string,
    previousValue: string,
    nextValue: string,
    emptyLabel: string,
    key: string,
  ) => (
    <div className="protocol-download-save-finding-line" key={key}>
      <span className="protocol-download-save-finding-line-label">
        {label}
      </span>
      <span>{renderChangeExcerpts(previousValue, nextValue, emptyLabel)}</span>
    </div>
  )

  const renderFindingChangeDetail = (
    item: ProtocolDownloadFindingSaveItem,
  ): ReactNode[] => {
    const savedFinding =
      item.kind === 'finding-update' && item.savedFindingId
        ? savedFindings.find((finding) => finding.id === item.savedFindingId) ??
          null
        : null

    if (!savedFinding) {
      return [
        <div className="protocol-download-save-finding-detail" key="finding">
          {renderFindingTextLine(
            'Описание',
            item.description,
            'Описание пустое',
            'description',
          )}
          {item.conclusion
            ? renderFindingTextLine(
                'Заключение',
                item.conclusion,
                'Заключение пустое',
                'conclusion',
              )
            : null}
          {renderFindingNameField(item)}
        </div>,
      ]
    }

    const details: ReactNode[] = []

    if (
      getChangePreviewText(savedFinding.description) !==
      getChangePreviewText(item.description)
    ) {
      details.push(
        renderFindingChangeLine(
          'Описание',
          savedFinding.description,
          item.description,
          'Описание пустое',
          'description',
        ),
      )
    }

    if (
      getChangePreviewText(savedFinding.conclusion) !==
      getChangePreviewText(item.conclusion)
    ) {
      details.push(
        renderFindingChangeLine(
          'Заключение',
          savedFinding.conclusion,
          item.conclusion,
          'Заключение пустое',
          'conclusion',
        ),
      )
    }

    return [
      <div className="protocol-download-save-finding-detail" key="finding">
        {details.length
          ? details
          : renderFindingTextLine(
              'Находка',
              item.detail,
              'Изменений в тексте нет',
              'fallback',
            )}
      </div>,
    ]
  }

  const getMarkerOptionVariantLabel = (options: string[]) =>
    options
      .map((option) => option.trim())
      .filter(Boolean)
      .join(' / ') || 'Пустой вариант'

  const getMarkerOptionVariantParts = (value: string) =>
    getMarkerTemplateParts(value).filter((part) => part.type === 'variant')

  const renderVariantChangeDetails = (
    previousValue: string,
    nextValue: string,
  ) => {
    const previousVariants = getMarkerOptionVariantParts(previousValue)
    const nextVariants = getMarkerOptionVariantParts(nextValue)
    const maxLength = Math.max(previousVariants.length, nextVariants.length)
    const details: ReactNode[] = []

    for (let index = 0; index < maxLength; index += 1) {
      const previousVariant = previousVariants[index] ?? null
      const nextVariant = nextVariants[index] ?? null
      const previousSignature = previousVariant
        ? getMarkerOptionVariantOptionsSignature(previousVariant.options)
        : ''
      const nextSignature = nextVariant
        ? getMarkerOptionVariantOptionsSignature(nextVariant.options)
        : ''

      if (previousSignature === nextSignature) {
        continue
      }

      if (nextVariant) {
        details.push(
          <span className="protocol-change-excerpt" key={`variant-${index}`}>
            <span className="protocol-change">
              {getMarkerOptionVariantLabel(nextVariant.options)}
            </span>
          </span>,
        )
        continue
      }

      if (previousVariant) {
        details.push(
          <span className="protocol-change-excerpt" key={`variant-${index}`}>
            <del>{getMarkerOptionVariantLabel(previousVariant.options)}</del>
          </span>,
        )
      }
    }

    return details
  }

  const renderOptionChangeDetail = (
    item: ProtocolDownloadSectionOptionSaveItem,
  ): ReactNode[] => {
    if (item.isFindingReferenceOnly) {
      return [
        <span key="findings">
          {item.includeFindings
            ? 'Отмеченные находки будут добавлены в заготовку'
            : 'Находки не будут добавлены в заготовку'}
        </span>,
      ]
    }

    const variantDetails = renderVariantChangeDetails(
      item.previousValue,
      item.value,
    )

    if (variantDetails.length) {
      return variantDetails
    }

    const hasTextChange =
      getChangePreviewText(item.previousValue) !==
      getChangePreviewText(item.value)

    if (hasTextChange || item.isNewOption) {
      return renderChangeExcerpts(
        item.previousValue,
        item.value,
        'Заготовка без текста',
      )
    }

    if (
      item.previousOptionLabel !== null &&
      item.previousOptionLabel !== item.optionLabel
    ) {
      return [
        <span className="protocol-change-excerpt" key="title">
          Название: {item.previousOptionLabel} →{' '}
          <span className="protocol-change">{item.optionLabel}</span>
        </span>,
      ]
    }

    if (
      item.previousFindingIds.join('\n') !== item.option.findingIds.join('\n')
    ) {
      return [
        <span key="findings">
          Изменен список находок в заготовке
        </span>,
      ]
    }

    return [
      <span key="fallback">
        {item.detail || 'Изменения заготовки'}
      </span>,
    ]
  }

  const renderSaveItemDetails = (
    item: ProtocolDownloadSaveItem,
  ): ReactNode[] => {
    if (item.kind === 'section-current') {
      return renderTextChangeDetail(item)
    }

    if (item.kind === 'section-option') {
      return renderOptionChangeDetail(item)
    }

    if (item.kind === 'section-structure') {
      const structureDetails: ReactNode[] = [
        ...item.addedSectionNames.map((name, index) => (
          <span className="protocol-change-excerpt" key={`added-${index}`}>
            Добавлен раздел: <span className="protocol-change">{name}</span>
          </span>
        )),
        ...item.removedSectionNames.map((name, index) => (
          <span className="protocol-change-excerpt" key={`removed-${index}`}>
            Удален раздел: <del>{name}</del>
          </span>
        )),
      ]

      return structureDetails.length
        ? structureDetails
        : [<span key="structure">{item.detail}</span>]
    }

    return renderFindingChangeDetail(item)
  }

  const renderSaveItemTypeControl = (item: ProtocolDownloadSaveItem) =>
    isFindingSaveItem(item) ? (
      <button
        className={[
          'protocol-save-finding-mode-badge',
          item.kind === 'finding-update' ? 'is-update' : 'is-new',
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={!item.savedFindingId}
        onClick={() =>
          onFindingModeChange(
            item.id,
            item.kind === 'finding-update' ? 'new' : 'update',
          )
        }
        title={
          item.savedFindingId
            ? 'Переключить режим сохранения'
            : 'Нет сохраненной находки для обновления'
        }
        type="button"
      >
        {item.kind === 'finding-update' ? 'Обновить' : 'Новый'}
      </button>
    ) : (
      <span className="protocol-save-type-badge">
        {getItemChangeType(item)}
      </span>
    )

  const renderSaveItemRows = (
    item: ProtocolDownloadSaveItem,
    includeFolderColumn: boolean,
  ) => {
    const details = renderSaveItemDetails(item)
    const rowSpan = Math.max(1, details.length)
    const rowClassName =
      item.kind === 'section-structure' ? 'is-structure' : ''

    return details.map((detail, index) => (
      <tr className={rowClassName} key={`${item.id}:${index}`}>
        {index === 0 && (
          <td rowSpan={rowSpan}>
            <input
              checked={item.checked}
              onChange={(event) =>
                onSaveItemCheckChange(item.id, event.target.checked)
              }
              type="checkbox"
            />
          </td>
        )}
        {index === 0 && (
          <td rowSpan={rowSpan}>{renderSaveItemTypeControl(item)}</td>
        )}
        <td>
          <div
            className={[
              'protocol-save-change-cell',
              index > 0 ? 'is-continuation' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {index === 0 &&
              isFindingSaveItem(item) &&
              item.kind === 'finding-update' && (
              <strong>
                {getFindingSaveLabel(item)}
              </strong>
            )}
            <div>{detail}</div>
          </div>
        </td>
        {includeFolderColumn && index === 0 && (
          <td rowSpan={rowSpan}>
            {isFindingSaveItem(item) ? (
              renderFindingFolderSelect(item, false)
            ) : (
              <span className="protocol-download-save-empty-cell">-</span>
            )}
          </td>
        )}
      </tr>
    ))
  }

  const renderProtocolSaveTable = (
    items: ProtocolDownloadSaveItem[],
    includeFolderColumn: boolean,
  ) => {
    if (!items.length) {
      return null
    }

    return (
      <div className="protocol-download-save-table-wrap">
        <table
          className={[
            'protocol-download-save-table',
            includeFolderColumn ? 'has-folder-column' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <thead>
            <tr>
              <th aria-label="Сохранить" />
              <th>Тип</th>
              <th>Что изменилось</th>
              {includeFolderColumn && <th>Папка</th>}
            </tr>
          </thead>
          <tbody>
            {items.flatMap((item) =>
              renderSaveItemRows(item, includeFolderColumn),
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const getSectionSaveHeaderState = (
    sectionItems: Array<
      | ProtocolDownloadSectionCurrentSaveItem
      | ProtocolDownloadSectionOptionSaveItem
    >,
  ) => {
    const firstItem = sectionItems[0] ?? null

    if (!firstItem) {
      return null
    }

    const uniqueOptionLabels = Array.from(
      new Set(
        sectionItems
          .map((item) => item.optionLabel.trim())
          .filter(Boolean),
      ),
    )
    const optionLabel =
      uniqueOptionLabels.length > 1
        ? `${uniqueOptionLabels[0]} +${uniqueOptionLabels.length - 1}`
        : uniqueOptionLabels[0] || firstItem.optionLabel

    return {
      includeFindings: firstItem.includeFindings,
      markerId: firstItem.markerId,
      mode: firstItem.saveMode,
      newOptionLabel: firstItem.newOptionLabel,
      optionLabel,
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="protocol-download-save-title"
        aria-modal="true"
        className="modal-panel protocol-download-save-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <h2 id="protocol-download-save-title">
            Сохранить изменения перед скачиванием
          </h2>
          <button
            aria-label="Закрыть"
            className="modal-close-button"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>
        <p className="protocol-download-save-hint">
          Отметьте только то, что нужно сохранить в шаблоны и память находок.
          Выбор другого раздела или готовой заготовки сюда не попадает.
        </p>
        <div className="protocol-download-save-list">
          {groups.map((group) => {
            const sectionItems = group.items
            const sectionSaveItems = group.items.filter(isSectionSaveItem)
            const sectionSaveHeaderState =
              getSectionSaveHeaderState(sectionSaveItems)
            const sectionFindingItems = sectionSaveHeaderState
              ? allFindingItems.filter(
                  (item) =>
                    item.isSectionGroup &&
                    item.markerId === sectionSaveHeaderState.markerId,
                )
              : []
            const checkedFindingItems = sectionFindingItems.filter(
              (item) => item.checked,
            )

            return (
              <section
                className="protocol-download-save-section"
                key={group.title}
              >
                <div className="protocol-download-save-section-header">
                  <div className="protocol-download-save-section-title">
                    <h3>{group.title}</h3>
                    {sectionSaveHeaderState &&
                      sectionFindingItems.length > 0 && (
                      <div className="protocol-section-findings-control">
                        <label className="protocol-section-finding-switch">
                          <input
                            checked={sectionSaveHeaderState.includeFindings}
                            onChange={(event) =>
                              onSectionIncludeFindingsChange(
                                sectionSaveHeaderState.markerId,
                                event.target.checked,
                              )
                            }
                            type="checkbox"
                          />
                          <span />
                          <strong>Находки</strong>
                        </label>
                        {sectionSaveHeaderState.includeFindings &&
                          checkedFindingItems.length > 0 && (
                          <div className="protocol-section-finding-chips">
                            {checkedFindingItems.map((item) => (
                              <span
                                className="protocol-section-finding-chip"
                                key={item.id}
                                title={item.detail}
                              >
                                <span>{item.name}</span>
                                <button
                                  aria-label={`Убрать находку ${item.name}`}
                                  className="protocol-section-finding-remove"
                                  onClick={() =>
                                    onSaveItemCheckChange(item.id, false)
                                  }
                                  type="button"
                                >
                                  x
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {sectionSaveHeaderState && (
                    <div className="protocol-section-save-control">
                      <span className="protocol-section-option-chip">
                        {sectionSaveHeaderState.optionLabel}
                      </span>
                      <div
                        aria-label="Режим сохранения заготовки"
                        className="protocol-section-save-mode"
                        role="group"
                      >
                        <button
                          className={
                            sectionSaveHeaderState.mode === 'update'
                              ? 'is-active'
                              : ''
                          }
                          onClick={() =>
                            onSectionSaveModeChange(
                              sectionSaveHeaderState.markerId,
                              'update',
                            )
                          }
                          type="button"
                        >
                          Обновить
                        </button>
                        <button
                          className={
                            sectionSaveHeaderState.mode === 'new'
                              ? 'is-active'
                              : ''
                          }
                          onClick={() =>
                            onSectionSaveModeChange(
                              sectionSaveHeaderState.markerId,
                              'new',
                            )
                          }
                          type="button"
                        >
                          Новый
                        </button>
                      </div>
                      {sectionSaveHeaderState.mode === 'new' && (
                        <input
                          className="protocol-section-new-option-input"
                          onChange={(event) =>
                            onSectionNewOptionLabelChange(
                              sectionSaveHeaderState.markerId,
                              event.target.value,
                            )
                          }
                          placeholder="Название новой заготовки"
                          type="text"
                          value={sectionSaveHeaderState.newOptionLabel}
                        />
                      )}
                    </div>
                  )}
                </div>

                {renderProtocolSaveTable(sectionItems, false)}
              </section>
            )
          })}
          {allFindingItems.length > 0 && (
            <section
              className="protocol-download-save-section protocol-download-findings-section"
              key="findings"
            >
              <div className="protocol-download-save-section-header">
                <div className="protocol-download-save-section-title">
                  <h3>Находки</h3>
                </div>
              </div>

              {renderProtocolSaveTable(allFindingItems, true)}
            </section>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={() => void onSkip()} type="button">
            Только скачать
          </button>
          <button onClick={() => void onConfirm()} type="button">
            {selectedCount
              ? `Сохранить выбранное (${selectedCount}) и скачать`
              : 'Скачать без сохранения'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default ProtocolDownloadSaveDialogPanel
