export type MarkerTemplatePart =
  | { rawEnd: number; rawStart: number; text: string; type: 'text' }
  | {
      options: string[]
      rawEnd: number
      rawStart: number
      type: 'variant'
      value: string
    }

export const parseMarkerOptionVariantToken = (
  value: string,
  start: number,
  end: number,
) => {
  const token = value.slice(start, end)

  if (!token.startsWith('[[') || !token.endsWith(']]')) {
    return null
  }

  const options = token
    .slice(2, -2)
    .split('|')
    .map((option) => option.trim())

  return options.some(Boolean)
    ? {
        options,
        value: options.find(Boolean) ?? '',
      }
    : null
}

export const createMarkerOptionVariantToken = (options: string[]) =>
  `[[${options.map((option) => option.trim()).join('|')}]]`

export const getMarkerTemplateParts = (value: string) => {
  const parts: MarkerTemplatePart[] = []
  let cursor = 0

  while (cursor < value.length) {
    const variantStart = value.indexOf('[[', cursor)

    if (variantStart === -1) {
      const text = value.slice(cursor)

      if (text) {
        parts.push({
          rawEnd: value.length,
          rawStart: cursor,
          text,
          type: 'text',
        })
      }
      break
    }

    if (variantStart > cursor) {
      parts.push({
        rawEnd: variantStart,
        rawStart: cursor,
        text: value.slice(cursor, variantStart),
        type: 'text',
      })
    }

    const variantEnd = value.indexOf(']]', variantStart + 2)

    if (variantEnd === -1) {
      parts.push({
        rawEnd: value.length,
        rawStart: variantStart,
        text: value.slice(variantStart),
        type: 'text',
      })
      break
    }

    const tokenEnd = variantEnd + 2
    const options = value
      .slice(variantStart + 2, variantEnd)
      .split('|')
      .map((option) => option.trim())

    if (options.some(Boolean)) {
      parts.push({
        options,
        rawEnd: tokenEnd,
        rawStart: variantStart,
        type: 'variant',
        value: options.find(Boolean) ?? '',
      })
    } else {
      parts.push({
        rawEnd: tokenEnd,
        rawStart: variantStart,
        text: value.slice(variantStart, tokenEnd),
        type: 'text',
      })
    }

    cursor = tokenEnd
  }

  return parts
}

export const getMarkerOptionComparableValue = (value: string) =>
  getMarkerTemplateParts(value)
    .map((part) => {
      if (part.type === 'text') {
        return part.text
      }

      const options = [...new Set(part.options.map((option) => option.trim()))]
        .filter(Boolean)
        .sort((first, second) => first.localeCompare(second))

      return createMarkerOptionVariantToken(options)
    })
    .join('')
    .trim()

export const getMarkerOptionVariantOptionsSignature = (options: string[]) =>
  [...new Set(options.map((option) => option.trim()))]
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second))
    .join('|')

export const getMarkerOptionVariantSignature = (value: string) =>
  getMarkerTemplateParts(value)
    .filter((part) => part.type === 'variant')
    .map((part) => getMarkerOptionVariantOptionsSignature(part.options))
    .join('\n')

export const hasMarkerOptionVariantChange = (
  firstValue: string,
  secondValue: string,
) =>
  getMarkerOptionVariantSignature(firstValue) !==
  getMarkerOptionVariantSignature(secondValue)
