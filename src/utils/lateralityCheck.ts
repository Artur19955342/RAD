import {
  bilateralLateralityTerms,
  leftLateralityTerms,
  rightLateralityTerms,
} from '../data/lateralityDictionary'

type LateralityState = 'none' | 'right' | 'left' | 'both'

type LateralityDetection = {
  left: boolean
  right: boolean
  state: LateralityState
}

const normalizeLateralityText = (value: string) =>
  value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const termToRegExp = (term: string) => {
  const normalizedTerm = normalizeLateralityText(term).trim()
  const isPrefix = normalizedTerm.endsWith('-')
  const source = normalizedTerm.split(/\s+/).map(escapeRegExp).join('\\s+')
  const rightBoundary = isPrefix ? '' : '(?=$|[^\\p{L}\\p{N}_])'

  return new RegExp(`(^|[^\\p{L}\\p{N}_])${source}${rightBoundary}`, 'iu')
}

const hasAnyTerm = (text: string, terms: string[]) =>
  terms.some((term) => termToRegExp(term).test(text))

const getLateralityState = (left: boolean, right: boolean): LateralityState => {
  if (left && right) {
    return 'both'
  }

  if (right) {
    return 'right'
  }

  if (left) {
    return 'left'
  }

  return 'none'
}

export const detectLaterality = (value: string): LateralityDetection => {
  const text = normalizeLateralityText(value)
  const bilateral = hasAnyTerm(text, bilateralLateralityTerms)
  const right = bilateral || hasAnyTerm(text, rightLateralityTerms)
  const left = bilateral || hasAnyTerm(text, leftLateralityTerms)

  return {
    left,
    right,
    state: getLateralityState(left, right),
  }
}

const sideLabel = (state: LateralityState) => {
  switch (state) {
    case 'right':
      return 'правая'
    case 'left':
      return 'левая'
    case 'both':
      return 'обе стороны'
    default:
      return 'сторона не указана'
  }
}

export const getLateralityWarning = (
  description: string,
  conclusion: string,
) => {
  if (!conclusion.trim()) {
    return null
  }

  const descriptionLaterality = detectLaterality(description)
  const conclusionLaterality = detectLaterality(conclusion)
  const descriptionState = descriptionLaterality.state
  const conclusionState = conclusionLaterality.state

  if (descriptionState === 'none' && conclusionState === 'none') {
    return null
  }

  if (descriptionState === 'none') {
    return `в заключении указана сторона (${sideLabel(conclusionState)}), а в описании сторона не указана`
  }

  if (descriptionState === 'both') {
    return conclusionState === 'right' || conclusionState === 'left'
      ? `в описании указаны обе стороны, а в заключении только ${sideLabel(conclusionState)}`
      : null
  }

  if (conclusionState === 'none') {
    return `в описании указана ${sideLabel(descriptionState)} сторона, а в заключении сторона не указана`
  }

  if (conclusionState === 'both') {
    return `в описании указана ${sideLabel(descriptionState)} сторона, а в заключении указаны обе стороны`
  }

  return descriptionState === conclusionState
    ? null
    : `в описании указана ${sideLabel(descriptionState)} сторона, а в заключении ${sideLabel(conclusionState)}`
}
