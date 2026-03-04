"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  autoRetries: number
}

/**
 * Error Boundary que atrapa errores de render en hijos.
 * 
 * BLINDAJE: Auto-recuperación silenciosa.
 * Si un error transitorio ocurre (p.ej. durante un re-render del scan),
 * intenta auto-reset hasta 3 veces antes de mostrar la pantalla de error.
 * Esto evita que un error de render instantáneo desmonte VitalsScanner
 * y pierda todo el estado del escaneo.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private static MAX_AUTO_RETRIES = 3
  private static RETRY_DELAY_MS = 300

  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, autoRetries: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Error atrapado:", error.message)
    console.error("[ErrorBoundary] Stack:", info.componentStack)

    // Auto-recuperación silenciosa: intentar re-render tras breve delay
    if (this.state.autoRetries < AppErrorBoundary.MAX_AUTO_RETRIES) {
      const delay = AppErrorBoundary.RETRY_DELAY_MS * (this.state.autoRetries + 1)
      console.warn(`[ErrorBoundary] Auto-retry #${this.state.autoRetries + 1} en ${delay}ms`)
      this.retryTimer = setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          error: null,
          autoRetries: prev.autoRetries + 1,
        }))
      }, delay)
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }

  render() {
    if (this.state.hasError) {
      // Si aún quedan auto-reintentos, mostrar indicador mínimo (NO la pantalla de error)
      if (this.state.autoRetries < AppErrorBoundary.MAX_AUTO_RETRIES) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background">
            <p className="text-sm text-muted-foreground animate-pulse">Recuperando…</p>
          </div>
        )
      }

      // Auto-reintentos agotados: mostrar pantalla de error con botón manual
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-sm text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Algo salió mal
            </h2>
            <p className="text-sm text-muted-foreground">
              Ocurrió un error inesperado. Puedes intentar recargar la página.
            </p>
            <p className="text-xs text-muted-foreground/60 font-mono break-all">
              {this.state.error?.message}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null, autoRetries: 0 })
              }}
            >
              Reintentar
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
