"use client"

import { AppProvider, useApp } from "@/lib/app-context"
import { ThemeProvider } from "@/components/theme-provider"
import { AppErrorBoundary } from "@/components/error-boundary"
import { LandingPage } from "@/components/landing-page"
import { LoginScreen, RegisterScreen } from "@/components/auth-screens"
import { PatientDashboard } from "@/components/patient-dashboard"
import { VitalsScanner } from "@/components/vitals-scanner"
import { AppHeader } from "@/components/app-header"
import { BottomNav } from "@/components/bottom-nav"

function AppRouter() {
  const { currentView, role } = useApp()

  // Vistas sin chrome (sin header/nav)
  if (currentView === "landing") return <LandingPage />
  if (currentView === "login") return <LoginScreen />
  if (currentView === "register") return <RegisterScreen />

  // Componentes que manejan su propio layout completo (header + nav incluidos)
  if (currentView === "patient-vitals") return <VitalsScanner />
  if (currentView === "patient-dashboard") return <PatientDashboard />

  // Fallback para vistas no mapeadas aún
  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={currentView} />
      <main className="max-w-7xl mx-auto px-4 py-8 text-center text-muted-foreground">
        <p>Vista &quot;{currentView}&quot; en construcción</p>
      </main>
      <BottomNav />
    </div>
  )
}

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AppProvider>
        <AppErrorBoundary>
          <AppRouter />
        </AppErrorBoundary>
      </AppProvider>
    </ThemeProvider>
  )
}
