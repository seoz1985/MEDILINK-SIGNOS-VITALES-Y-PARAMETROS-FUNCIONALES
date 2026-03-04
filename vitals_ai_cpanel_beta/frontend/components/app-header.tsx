"use client"

import { useApp } from "@/lib/app-context"
import { Heart, LogOut, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AppHeaderProps {
  title: string
  subtitle?: string
  /** Oculta botones de logout y notificaciones (durante escaneo) */
  scanLocked?: boolean
}

export function AppHeader({ title, subtitle, scanLocked }: AppHeaderProps) {
  const { navigate, setRole } = useApp()

  const handleLogout = () => {
    if (scanLocked) return
    setRole(null)
    navigate("landing")
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Heart className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground font-[family-name:var(--font-space-grotesk)] leading-tight">{title}</h1>
            {subtitle && <p className="text-[10px] text-muted-foreground leading-tight">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!scanLocked && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 relative" aria-label="Notificaciones">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} aria-label="Cerrar sesion">
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
