"use client"

import { useApp } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import {
  Heart,
  Activity,
  Video,
  ShieldCheck,
  Clock,
  Stethoscope,
  ArrowRight,
  Smartphone,
} from "lucide-react"

export function LandingPage() {
  const { navigate, setRole } = useApp()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Heart className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground font-[family-name:var(--font-space-grotesk)]">VitaLink</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("login")}>
              Iniciar Sesion
            </Button>
            <Button size="sm" onClick={() => navigate("register")}>
              Registrarse
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--primary)_0%,transparent_60%)] opacity-5" />
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground mb-6">
              <Activity className="w-3.5 h-3.5 text-primary" />
              Tecnologia de punta en salud digital
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight tracking-tight text-balance font-[family-name:var(--font-space-grotesk)]">
              Tu salud, conectada en tiempo real
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto text-pretty">
              Monitorea tus signos vitales desde tu celular, conecta con medicos especializados y gestiona tu historia clinica digital. Todo en una sola plataforma.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2"
                onClick={() => {
                  setRole("patient")
                  navigate("register")
                }}
              >
                Soy Paciente <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto gap-2"
                onClick={() => {
                  setRole("doctor")
                  navigate("register")
                }}
              >
                <Stethoscope className="w-4 h-4" /> Soy Medico
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">
              Funcionalidades de ultima generacion
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Integramos inteligencia artificial y sensores avanzados para ofrecerte la mejor experiencia en salud digital.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Smartphone,
                title: "Signos Vitales con IA",
                description: "Mide tu saturacion de oxigeno, frecuencia cardiaca y respiratoria usando solo la camara de tu celular en 60 segundos.",
              },
              {
                icon: Video,
                title: "Teleconsultas HD",
                description: "Consultas medicas virtuales en alta definicion con medicos certificados, desde cualquier lugar.",
              },
              {
                icon: ShieldCheck,
                title: "Historia Clinica Segura",
                description: "Tu historial medico completo, cifrado y accesible para ti y tus medicos autorizados.",
              },
              {
                icon: Clock,
                title: "Disponibilidad 24/7",
                description: "Agenda citas con medicos disponibles en tiempo real, incluyendo atencion de urgencias.",
              },
              {
                icon: Activity,
                title: "Monitoreo Continuo",
                description: "Lleva un registro historico de tus signos vitales y recibe alertas automaticas.",
              },
              {
                icon: Stethoscope,
                title: "Red de Especialistas",
                description: "Accede a cardiologos, neumologos, internistas y mas especialidades medicas.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group p-6 rounded-xl border border-border bg-background hover:border-primary/30 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">
              Como funciona
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Registrate", description: "Crea tu perfil como paciente o medico en menos de 2 minutos." },
              { step: "02", title: "Mide tus signos", description: "Usa la camara de tu celular para registrar tus signos vitales con IA." },
              { step: "03", title: "Conecta con tu medico", description: "Agenda una consulta virtual y comparte tus datos en tiempo real." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground font-bold text-xl flex items-center justify-center mx-auto mb-4 font-[family-name:var(--font-space-grotesk)]">
                  {item.step}
                </div>
                <h3 className="font-semibold text-foreground text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">VitaLink - Telemedicina Inteligente</span>
          </div>
          <p className="text-xs text-muted-foreground">Todos los derechos reservados 2026</p>
        </div>
      </footer>
    </div>
  )
}
