import type {
  ClipboardEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from 'react'

export type FieldName = 'description' | 'conclusion'

export type TextSegment = {
  id: number
  type: 'text'
  text: string
}

export type VariantSegment = {
  id: number
  type: 'variant'
  value: string
  options: string[]
}

export type NumericSegment = {
  id: number
  type: 'number'
  value: string
}

export type MarkerOption = {
  title: string
  value: string
}

export type MarkerSegment = {
  id: number
  type: 'marker'
  title: string
  options: MarkerOption[]
  selectedOptionIndex: number | null
}

export type EditorSegment =
  | TextSegment
  | VariantSegment
  | NumericSegment
  | MarkerSegment

export type SavedSelection = {
  field: FieldName
  start: number
  end: number
  text: string
}

export type FloatingPosition = {
  x: number
  y: number
}

export type ActiveVariant = {
  field: FieldName
  id: number
}

export type ActiveMarker = {
  id: number
}

export type MarkerMenu = FloatingPosition & {
  id: number
}

export type TextRange = {
  start: number
  end: number
}

export type HighlightRange = TextRange & {
  className: string
}

export type TextChange = {
  nextRange: TextRange
  previousRange: TextRange
}

export type FindingPair = {
  id: number
  description: TextRange
  conclusion: TextRange
}

export type PendingSelection = TextRange & {
  field: FieldName
  focus?: boolean
  afterText?: string
  beforeText?: string
}

export type ProtocolTemplate = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  descriptionContent: EditorSegment[]
  conclusionContent: EditorSegment[]
  findingPairs: FindingPair[]
}

export type SavedFinding = {
  id: string
  name: string
  description: string
  conclusion: string
  folderId: string | null
  createdAt: number
  updatedAt: number
}

export type FindingFolder = {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
}

export type FindingSaveDialog = {
  existingId: string | null
  name: string
  description: string
  conclusion: string
}

export type PatientSex = '' | 'male' | 'female'

export type PassportCustomField = {
  id: string
  label: string
  value: string
}

export type PassportData = {
  fullName: string
  sex: PatientSex
  birthDate: string
  studyDate: string
  studyTime: string
  customFields: PassportCustomField[]
}

export type UserProfile = {
  id: string
  fullName: string
  email: string
  createdAt: number
  updatedAt: number
}

export type ProtocolExportSettings = {
  fileNameTemplate: string
  footerDoctorName: string
  footerSignatureText: string
  headerText: string
}

export type BrowserDragItem = {
  type: 'folder' | 'finding'
  id: string
}

export type EditableAreaProps = {
  ariaLabel: string
  editorRef: RefObject<HTMLDivElement | null>
  html: string
  id: FieldName
  isEmpty: boolean
  onClick: (event: MouseEvent<HTMLDivElement>) => void
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void
  onInput: () => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onKeyUp: () => void
  onMouseUp: () => void
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void
  placeholder: string
}
