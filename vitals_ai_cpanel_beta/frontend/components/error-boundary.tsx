"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary que atrapa errores de render en hijos.
 * Muestra una UI de recuperación en lugar de destruir el árbol
 * de componentes (que causaría perder todo el estado de la app).
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
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
                this.setState({ hasError: false, error: null })
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
