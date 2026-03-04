"use client"

import { useApp, type AppView } from "@/lib/app-context"
import {
  LayoutDashboard,
  Activity,
  CalendarDays,
  FileText,
  Users,
  Clock,
} from "lucide-react"

interface NavItem {
  icon: typeof LayoutDashboard
  label: string
  view: AppView
}

const patientNav: NavItem[] = [
  { icon: LayoutDashboard, label: "Inicio", view: "patient-dashboard" },
  { icon: Activity, label: "Vitales", view: "patient-vitals" },
  { icon: CalendarDays, label: "Citas", view: "patient-appointments" },
  { icon: FileText, label: "Historial", view: "patient-history" },
]

const doctorNav: NavItem[] = [
  { icon: LayoutDashboard, label: "Inicio", view: "doctor-dashboard" },
  { icon: Clock, label: "Agenda", view: "doctor-schedule" },
  { icon: Users, label: "Pacientes", view: "doctor-patients" },
]

export function BottomNav({ disabled }: { disabled?: boolean }) {
  const { role, currentView, navigate } = useApp()
  const items = role === "doctor" ? doctorNav : patientNav

  // ── Durante escaneo, NO renderizar NADA ──
  // Cero barrera visual, cero espacio ocupado, cero posibilidad de interferencia.
  if (disabled) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-inset-bottom">
      <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-2">
        {items.map((item) => {
          const isActive = currentView === item.view
          return (
            <button
              key={item.view}
              onClick={() => navigate(item.view)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
              <span className={`text-[10px] font-medium ${isActive ? "text-primary" : ""}`}>{item.label}</span>
              {isActive && (
                <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
