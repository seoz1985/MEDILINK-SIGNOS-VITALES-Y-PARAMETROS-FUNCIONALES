"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"

// ── Helpers de persistencia (sessionStorage) ──────────────────────
function ssGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function ssSet(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export type UserRole = "patient" | "doctor" | null
export type AppView =
  | "landing"
  | "login"
  | "register"
  | "patient-dashboard"
  | "patient-onboarding"
  | "patient-vitals"
  | "patient-history"
  | "patient-appointments"
  | "patient-consultation"
  | "doctor-dashboard"
  | "doctor-schedule"
  | "doctor-patients"
  | "doctor-consultation"
  | "doctor-patient-detail"

export interface VitalSigns {
  heartRate: number
  spo2: number
  respiratoryRate: number
  bloodPressure: string
  temperature: number
  timestamp: Date
}

export interface Appointment {
  id: string
  patientName: string
  doctorName: string
  doctorSpecialty: string
  date: string
  time: string
  status: "scheduled" | "completed" | "cancelled" | "in-progress"
  type: "virtual" | "in-person"
  notes?: string
}

export interface MedicalRecord {
  id: string
  date: string
  doctorName: string
  diagnosis: string
  treatment: string
  prescriptions: string[]
  vitals: VitalSigns
  notes: string
}

export interface Doctor {
  id: string
  name: string
  specialty: string
  avatar: string
  rating: number
  reviewCount: number
  available: boolean
  nextAvailable: string
  experience: string
  languages: string[]
}

export interface Patient {
  id: string
  name: string
  age: number
  gender: string
  bloodType: string
  allergies: string[]
  conditions: string[]
  lastVisit: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OnboardingData = any  // Full type in patient-onboarding.tsx

interface AppContextType {
  role: UserRole
  setRole: (role: UserRole) => void
  currentView: AppView
  navigate: (view: AppView) => void
  selectedDoctor: Doctor | null
  setSelectedDoctor: (doctor: Doctor | null) => void
  selectedPatient: Patient | null
  setSelectedPatient: (patient: Patient | null) => void
  vitalsHistory: VitalSigns[]
  addVitals: (vitals: VitalSigns) => void
  /** Bloquear navegación (durante escaneo de vitales) */
  lockNavigation: () => void
  unlockNavigation: () => void
  navigationLocked: boolean
  /** Onboarding data collected before vitals scan */
  onboardingData: OnboardingData | null
  setOnboardingData: (data: OnboardingData | null) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRoleRaw] = useState<UserRole>(() => ssGet<UserRole>("va_role", null))
  const [currentView, setCurrentViewRaw] = useState<AppView>(() => ssGet<AppView>("va_view", "landing"))
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [vitalsHistory, setVitalsHistory] = useState<VitalSigns[]>([])
  const [navigationLocked, setNavigationLocked] = useState(false)
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null)
  const navLockedRef = useRef(false) // ref para acceso síncrono inmediato

  // Persistir rol y vista en sessionStorage
  const setRole = useCallback((r: UserRole) => { setRoleRaw(r); ssSet("va_role", r) }, [])
  const navigate = useCallback((view: AppView) => {
    // ── BLOQUEO NUCLEAR: si la navegación está bloqueada, NO cambiar de vista ──
    if (navLockedRef.current) {
      console.warn("[AppContext] Navegación BLOQUEADA durante escaneo. Ignorando navigate →", view)
      return
    }
    setCurrentViewRaw(view); ssSet("va_view", view)
  }, [])

  const lockNavigation = useCallback(() => {
    navLockedRef.current = true
    setNavigationLocked(true)
    console.log("[AppContext] Navegación BLOQUEADA")
  }, [])

  const unlockNavigation = useCallback(() => {
    navLockedRef.current = false
    setNavigationLocked(false)
    console.log("[AppContext] Navegación DESBLOQUEADA")
  }, [])

  // Si al montar el role es null pero había vista guardada, resetear vista
  useEffect(() => {
    if (!role && currentView !== "landing" && currentView !== "login" && currentView !== "register") {
      navigate("landing")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addVitals = useCallback((vitals: VitalSigns) => {
    setVitalsHistory((prev) => [vitals, ...prev])
  }, [])

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        currentView,
        navigate,
        selectedDoctor,
        setSelectedDoctor,
        selectedPatient,
        setSelectedPatient,
        vitalsHistory,
        addVitals,
        lockNavigation,
        unlockNavigation,
        navigationLocked,
        onboardingData,
        setOnboardingData,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider")
  }
  return context
}
