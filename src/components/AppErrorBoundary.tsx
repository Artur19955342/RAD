import { Component, type PropsWithChildren } from 'react'

type AppErrorBoundaryState = {
  hasError: boolean
}

class AppErrorBoundary extends Component<
  PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  reloadApp = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-boundary">
          <section>
            <h1>Приложение остановилось</h1>
            <p>
              Данные сохранены в браузере. Обновите страницу, чтобы вернуться к
              работе.
            </p>
            <button onClick={this.reloadApp} type="button">
              Обновить
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

export default AppErrorBoundary
