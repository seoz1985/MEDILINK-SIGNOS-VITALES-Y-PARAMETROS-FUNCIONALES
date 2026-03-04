"use client"

import { useApp } from "@/lib/app-context"
import { AppHeader } from "@/components/app-header"
import { BottomNav } from "@/components/bottom-nav"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  CalendarDays,
  Camera,
  Star,
  Clock,
  ArrowRight,
  Heart,
  Droplets,
  Wind,
} from "lucide-react"
import { mockDoctors, mockAppointments, mockVitalsHistory } from "@/lib/mock-data"

export function PatientDashboard() {
  const { navigate, setSelectedDoctor } = useApp()
  const lastVitals = mockVitalsHistory[0]
  const nextAppointment = mockAppointments.find((a) => a.status === "scheduled")
  const availableDoctors = mockDoctors.filter((d) => d.available)

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Hola, Juan" subtitle="Bienvenido de vuelta" />

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("patient-onboarding")}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Camera className="w-6 h-6" />
            <span className="text-sm font-medium">Medir Signos</span>
          </button>
          <button
            onClick={() => navigate("patient-appointments")}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
          >
            <CalendarDays className="w-6 h-6" />
            <span className="text-sm font-medium">Agendar Cita</span>
          </button>
        </div>

        {/* Last Vitals Summary */}
        {lastVitals && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground font-[family-name:var(--font-space-grotesk)]">Ultimos Signos Vitales</h3>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {lastVitals.timestamp.toLocaleDateString("es", { day: "numeric", month: "short" })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 rounded-lg bg-primary/5">
                  <Heart className="w-4 h-4 text-primary mx-auto mb-1" />
                  <span className="text-lg font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">{lastVitals.heartRate}</span>
                  <p className="text-[10px] text-muted-foreground">bpm</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-accent/5">
                  <Droplets className="w-4 h-4 text-accent mx-auto mb-1" />
                  <span className="text-lg font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">{lastVitals.spo2}</span>
                  <p className="text-[10px] text-muted-foreground">SpO2 %</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-chart-4/5">
                  <Wind className="w-4 h-4 text-chart-4 mx-auto mb-1" />
                  <span className="text-lg font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">{lastVitals.respiratoryRate}</span>
                  <p className="text-[10px] text-muted-foreground">rpm</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full mt-3 text-xs" onClick={() => navigate("patient-vitals")}>
                Ver historial completo <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Next Appointment */}
        {nextAppointment && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground font-[family-name:var(--font-space-grotesk)]">Proxima Cita</h3>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {nextAppointment.doctorName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{nextAppointment.doctorName}</p>
                  <p className="text-xs text-muted-foreground">{nextAppointment.doctorSpecialty}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-foreground">{nextAppointment.time}</p>
                  <Badge variant="secondary" className="text-[10px] mt-0.5">
                    {nextAppointment.type === "virtual" ? "Virtual" : "Presencial"}
                  </Badge>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full mt-3"
                onClick={() => navigate("patient-consultation")}
              >
                Iniciar Consulta
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Available Doctors */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground font-[family-name:var(--font-space-grotesk)]">Medicos Disponibles</h3>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("patient-appointments")}>
              Ver todos
            </Button>
          </div>
          <div className="space-y-2">
            {availableDoctors.slice(0, 3).map((doctor) => (
              <Card
                key={doctor.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => {
                  setSelectedDoctor(doctor)
                  navigate("patient-appointments")
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {doctor.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doctor.name}</p>
                      <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-0.5 justify-end">
                        <Star className="w-3 h-3 text-chart-4 fill-chart-4" />
                        <span className="text-xs font-medium text-foreground">{doctor.rating}</span>
                      </div>
                      <p className="text-[10px] text-accent">{doctor.nextAvailable}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
