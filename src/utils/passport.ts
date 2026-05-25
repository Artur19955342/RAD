import type {
  PassportCustomFieldDefinition,
  PassportData,
  PatientSex,
} from '../types'

const padDatePart = (value: number) => String(value).padStart(2, '0')

const formatDateValue = (date: Date) =>
  `${padDatePart(date.getDate())}.${padDatePart(
    date.getMonth() + 1,
  )}.${date.getFullYear()}`

const getDigitsOnly = (value: string, maxLength: number) =>
  value.replace(/\D/g, '').slice(0, maxLength)

export const createPassportFieldId = () =>
  `passport-field-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const normalizePassportCustomFieldDefinition = (
  field: PassportCustomFieldDefinition,
): PassportCustomFieldDefinition | null => {
  const id = field.id.trim()
  const label = field.label.trim()

  return id && label ? { id, label } : null
}

export const mergePassportCustomFieldDefinitions = (
  ...definitionLists: PassportCustomFieldDefinition[][]
) => {
  const definitions: PassportCustomFieldDefinition[] = []
  const usedIds = new Set<string>()

  definitionLists.forEach((definitionList) => {
    definitionList.forEach((field) => {
      const definition = normalizePassportCustomFieldDefinition(field)

      if (!definition || usedIds.has(definition.id)) {
        return
      }

      usedIds.add(definition.id)
      definitions.push(definition)
    })
  })

  return definitions
}

export const applyPassportCustomFieldDefinitions = (
  passportData: PassportData,
  definitions: PassportCustomFieldDefinition[],
): PassportData => {
  const valuesById = new Map(
    passportData.customFields.map((field) => [field.id, field.value]),
  )

  return {
    ...passportData,
    customFields: mergePassportCustomFieldDefinitions(definitions).map(
      (field) => ({
        ...field,
        value: valuesById.get(field.id) ?? '',
      }),
    ),
  }
}

export const getPassportCustomFieldDefinitions = (
  passportData: PassportData,
) =>
  mergePassportCustomFieldDefinitions(
    passportData.customFields.map(({ id, label }) => ({ id, label })),
  )

export const formatDateInputValue = (value: string) => {
  const digits = getDigitsOnly(value, 8)
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 4),
    digits.slice(4, 8),
  ].filter(Boolean)

  return parts.join('.')
}

export const formatTimeInputValue = (value: string) => {
  const digits = getDigitsOnly(value, 4)
  const parts = [digits.slice(0, 2), digits.slice(2, 4)].filter(Boolean)

  return parts.join(':')
}

export const createDefaultPassportData = (
  customFieldDefinitions: PassportCustomFieldDefinition[] = [],
): PassportData => ({
  fullName: '',
  sex: '',
  birthDate: '',
  studyDate: formatDateValue(new Date()),
  studyTime: '',
  customFields: mergePassportCustomFieldDefinitions(
    customFieldDefinitions,
  ).map((field) => ({ ...field, value: '' })),
})

export const formatPatientShortName = (fullName: string) => {
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean)

  if (!nameParts.length) {
    return 'Пациент'
  }

  const [lastName, ...restNameParts] = nameParts
  const initials = restNameParts
    .map((part) => part[0]?.toLocaleUpperCase('ru-RU'))
    .filter(Boolean)
    .map((letter) => `${letter}.`)
    .join('')

  return initials ? `${lastName} ${initials}` : lastName
}

export const getPassportCollapsedTitle = (
  passportData: PassportData,
  templateName: string,
) =>
  `${formatPatientShortName(passportData.fullName)} · ${
    templateName.trim() || 'Без шаблона'
  }`

export const getPatientSexLabel = (sex: PatientSex) => {
  if (sex === 'male') {
    return 'Муж.'
  }

  if (sex === 'female') {
    return 'Жен.'
  }

  return ''
}

export const getPassportProtocolLines = (passportData: PassportData) => {
  const defaultLines = [
    ['ФИО', passportData.fullName],
    ['Пол', getPatientSexLabel(passportData.sex)],
    ['Возраст', passportData.birthDate],
    ['Дата исследования', passportData.studyDate],
    ['Время', passportData.studyTime],
  ]
  const customLines = passportData.customFields.map((field) => [
    field.label.trim() || 'Поле',
    field.value,
  ])

  return [...defaultLines, ...customLines]
    .map(([label, value]) => [label, value.trim()])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
}
