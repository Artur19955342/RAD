import { memo } from 'react'
import type { EditableAreaProps } from '../types'

const EditableArea = memo(
  function EditableArea({
    ariaLabel,
    editorRef,
    html,
    id,
    isEmpty,
    onClick,
    onContextMenu,
    onInput,
    onKeyDown,
    onKeyUp,
    onMouseUp,
    onPaste,
    placeholder,
  }: EditableAreaProps) {
    return (
      <div
        aria-label={ariaLabel}
        aria-multiline="true"
        className="editor"
        contentEditable
        data-empty={isEmpty ? 'true' : undefined}
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: html }}
        id={id}
        lang="ru-RU"
        onClick={onClick}
        onContextMenu={onContextMenu}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onMouseUp={onMouseUp}
        onPaste={onPaste}
        ref={editorRef}
        role="textbox"
        spellCheck
        suppressContentEditableWarning
      />
    )
  },
  (previous, next) =>
    previous.ariaLabel === next.ariaLabel &&
    previous.html === next.html &&
    previous.id === next.id &&
    previous.isEmpty === next.isEmpty &&
    previous.placeholder === next.placeholder,
)

export default EditableArea
