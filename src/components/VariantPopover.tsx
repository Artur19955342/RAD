import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react'

type VariantPopoverOption = {
  value: string
  options: string[]
}

type VariantPopoverProps = {
  onAddOption: () => void
  onChangeOption: (index: number, value: string) => void
  onSelectOption: (index: number) => void
  variant: VariantPopoverOption
}

type VariantWindowPosition = {
  x: number
  y: number
}

type DragState = {
  offsetX: number
  offsetY: number
  pointerId: number
}

const getInitialPosition = (): VariantWindowPosition => {
  if (typeof window === 'undefined') {
    return { x: 420, y: 88 }
  }

  return {
    x: Math.max(12, window.innerWidth - 380),
    y: 88,
  }
}

const clampPosition = (
  position: VariantWindowPosition,
  element: HTMLElement | null,
) => {
  if (typeof window === 'undefined') {
    return position
  }

  const width = element?.offsetWidth ?? 340
  const height = element?.offsetHeight ?? 320

  return {
    x: Math.max(12, Math.min(position.x, window.innerWidth - width - 12)),
    y: Math.max(12, Math.min(position.y, window.innerHeight - height - 12)),
  }
}

function VariantPopover({
  onAddOption,
  onChangeOption,
  onSelectOption,
  variant,
}: VariantPopoverProps) {
  const windowRef = useRef<HTMLDivElement | null>(null)
  const optionRefs = useRef<Array<HTMLInputElement | null>>([])
  const previousOptionCount = useRef(variant.options.length)
  const dragState = useRef<DragState | null>(null)
  const [position, setPosition] = useState(getInitialPosition)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (variant.options.length > previousOptionCount.current) {
      optionRefs.current[variant.options.length - 1]?.focus()
    }

    previousOptionCount.current = variant.options.length
  }, [variant.options.length])

  useEffect(() => {
    setPosition((currentPosition) =>
      clampPosition(currentPosition, windowRef.current),
    )
  }, [variant.options.length])

  const moveWindow = (clientX: number, clientY: number) => {
    const drag = dragState.current

    if (!drag) {
      return
    }

    setPosition(
      clampPosition(
        {
          x: clientX - drag.offsetX,
          y: clientY - drag.offsetY,
        },
        windowRef.current,
      ),
    )
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    const rect = windowRef.current?.getBoundingClientRect()

    if (!rect) {
      return
    }

    dragState.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
    }
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) {
      return
    }

    moveWindow(event.clientX, event.clientY)
    event.preventDefault()
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) {
      return
    }

    dragState.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className={[
        'variant-popover',
        isDragging ? 'is-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={(event) => event.stopPropagation()}
      ref={windowRef}
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="variant-popover-header"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerCancel={finishDrag}
        onPointerUp={finishDrag}
      >
        <h2>Варианты</h2>
        <button
          aria-label="Добавить вариант"
          className="variant-add-button"
          onClick={onAddOption}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          Добавить
        </button>
      </div>

      <div className="variant-option-list">
        {variant.options.map((option, index) => (
          <div className="variant-option-row" key={index}>
            <input
              aria-label={`Вариант ${index + 1}`}
              onChange={(event) => onChangeOption(index, event.target.value)}
              ref={(element) => {
                optionRefs.current[index] = element
              }}
              type="text"
              value={option}
            />
            <label className="variant-check" title="Выбрать вариант">
              <input
                checked={option === variant.value}
                onChange={() => onSelectOption(index)}
                type="checkbox"
              />
              <span aria-hidden="true">✓</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

export default VariantPopover
