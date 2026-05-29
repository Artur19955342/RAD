import type { TextChange, TextRange } from '../types'

export const isSameRange = (first: TextRange, second: TextRange) =>
  first.start === second.start && first.end === second.end

export const getRangeOverlap = (first: TextRange, second: TextRange) =>
  Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start))

export const getTextChange = (
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

export const getAnchoredInsertionTextChange = (
  previousText: string,
  nextText: string,
  insertionEnd: number,
): TextChange | null => {
  const delta = nextText.length - previousText.length

  if (delta <= 0) {
    return null
  }

  const editStart = Math.max(
    0,
    Math.min(insertionEnd - delta, previousText.length, nextText.length),
  )
  const nextRange = {
    start: editStart,
    end: Math.min(nextText.length, editStart + delta),
  }
  const textWithoutInsertion =
    nextText.slice(0, nextRange.start) + nextText.slice(nextRange.end)

  if (textWithoutInsertion !== previousText) {
    return null
  }

  return {
    nextRange,
    previousRange: { start: editStart, end: editStart },
  }
}

export const mergeTextRanges = (ranges: TextRange[]) => {
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

export const adjustTrackedRangesForEdit = (
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

export const adjustTrackedRangesForReplacement = (
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

export const trackTextChangeRange = (ranges: TextRange[], change: TextChange) =>
  mergeTextRanges([
    ...adjustTrackedRangesForReplacement(
      ranges,
      change.previousRange,
      change.nextRange,
    ),
    ...(change.nextRange.end > change.nextRange.start ? [change.nextRange] : []),
  ])

export const getTextChangeDelta = (change: TextChange) =>
  change.nextRange.end -
  change.nextRange.start -
  (change.previousRange.end - change.previousRange.start)

export const getTextChangeFromEdit = (
  editStart: number,
  delta: number,
): TextChange => ({
  nextRange:
    delta > 0
      ? { start: editStart, end: editStart + delta }
      : { start: editStart, end: editStart },
  previousRange:
    delta < 0
      ? { start: editStart, end: editStart - delta }
      : { start: editStart, end: editStart },
})

export const clampTextRange = (range: TextRange, text: string): TextRange => {
  const start = Math.max(0, Math.min(range.start, text.length))
  const end = Math.max(start, Math.min(range.end, text.length))

  return { start, end }
}

export const createCollapsedTextRange = (offset: number, text: string) => {
  const safeOffset = Math.max(0, Math.min(offset, text.length))

  return { start: safeOffset, end: safeOffset }
}

export const mapRangeThroughTextChange = (
  range: TextRange,
  change: TextChange,
): TextRange => {
  const delta = getTextChangeDelta(change)

  if (range.end <= change.previousRange.start) {
    return { ...range }
  }

  if (range.start >= change.previousRange.end) {
    return {
      start: Math.max(0, range.start + delta),
      end: Math.max(0, range.end + delta),
    }
  }

  const start =
    range.start < change.previousRange.start
      ? range.start
      : change.nextRange.start
  const end =
    range.end > change.previousRange.end
      ? range.end + delta
      : change.nextRange.end

  return {
    start: Math.max(0, start),
    end: Math.max(Math.max(0, start), end),
  }
}

export const isOffsetInRange = (range: TextRange, offset: number) =>
  offset >= range.start && offset <= Math.max(range.start, range.end)

export const doesTextChangeTouchRange = (
  range: TextRange,
  change: TextChange,
) => {
  const isInsertion = change.previousRange.start === change.previousRange.end

  if (isInsertion) {
    return isOffsetInRange(range, change.previousRange.start)
  }

  return getRangeOverlap(range, change.previousRange) > 0
}
