import { useState } from 'react'
import type { ProtocolTemplate } from '../types'

type ProtocolTemplatesDialogProps = {
  currentTemplateId: string | null
  currentTemplateName: string
  initialMode: 'browse' | 'save'
  onClose: () => void
  onDeleteTemplate: (id: string) => void
  onSaveTemplate: (name: string, templateId?: string) => void
  onSelectTemplate: (template: ProtocolTemplate) => void
  templates: ProtocolTemplate[]
}

function ProtocolTemplatesDialog({
  currentTemplateId,
  currentTemplateName,
  initialMode,
  onClose,
  onDeleteTemplate,
  onSaveTemplate,
  onSelectTemplate,
  templates,
}: ProtocolTemplatesDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [draftName, setDraftName] = useState(
    initialMode === 'save' ? currentTemplateName : '',
  )
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null
  const isSaveMode = initialMode === 'save'

  const chooseSelectedTemplate = () => {
    if (!selectedTemplate) {
      return
    }

    onSelectTemplate(selectedTemplate)
    onClose()
  }

  const saveSelectedTemplate = () => {
    if (!currentTemplateId || !draftName.trim()) {
      return
    }

    onSaveTemplate(draftName, currentTemplateId)
    onClose()
  }

  const saveTemplateAsNew = () => {
    if (!draftName.trim()) {
      return
    }

    onSaveTemplate(draftName)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="protocol-templates-title"
        aria-modal="true"
        className="modal-panel protocol-templates-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <h2 id="protocol-templates-title">
            {isSaveMode ? 'Сохранить шаблон' : 'Шаблоны'}
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

        {isSaveMode ? (
          <div className="template-dialog-save-panel">
            <input
              aria-label="Название шаблона"
              autoFocus
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && selectedTemplate) {
                  saveSelectedTemplate()
                }
              }}
              placeholder="Название шаблона"
              type="text"
              value={draftName}
            />
            <div className="template-dialog-save-actions">
              <button
                disabled={!currentTemplateId || !draftName.trim()}
                onClick={saveSelectedTemplate}
                type="button"
              >
                Сохранить
              </button>
              <button
                disabled={!draftName.trim()}
                onClick={saveTemplateAsNew}
                type="button"
              >
                Сохранить как новый
              </button>
            </div>
          </div>
        ) : templates.length > 0 ? (
          <div className="template-dialog-grid">
            {templates.map((template) => {
              const isSelected = template.id === selectedTemplateId

              return (
                <div
                  className={[
                    'template-dialog-item',
                    isSelected ? 'is-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={template.id}
                >
                  <button
                    className="template-dialog-template-button"
                    onClick={() => {
                      setSelectedTemplateId(template.id)
                    }}
                    title={template.name}
                    type="button"
                  >
                    <span>{template.name}</span>
                  </button>
                  <button
                    aria-label={`Удалить шаблон ${template.name}`}
                    className="template-dialog-delete-button"
                    onClick={() => {
                      if (selectedTemplateId === template.id) {
                        setSelectedTemplateId(null)
                      }
                      onDeleteTemplate(template.id)
                    }}
                    type="button"
                  >
                    x
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="template-dialog-empty">Шаблонов пока нет</p>
        )}

        {!isSaveMode && (
          <div className="template-dialog-footer">
            <button
              disabled={!selectedTemplate}
              onClick={chooseSelectedTemplate}
              type="button"
            >
              Выбрать
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

export default ProtocolTemplatesDialog
