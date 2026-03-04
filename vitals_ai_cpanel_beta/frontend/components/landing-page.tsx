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
  Bot,
  Shield,
  Sparkles,
} from "lucide-react"

export function LandingPage() {
  const { navigate, setRole } = useApp()

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
              <Heart className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-lg text-foreground font-[family-name:var(--font-space-grotesk)] tracking-tight">VitaLink</span>
              <span className="hidden sm:inline text-xs text-muted-foreground ml-2 font-medium">Telemedicina con IA</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("login")} className="text-muted-foreground hover:text-foreground font-medium">
              Iniciar Sesión
            </Button>
            <Button size="sm" onClick={() => navigate("register")} className="shadow-md shadow-primary/20 font-semibold">
              Registrarse
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--primary)_0%,transparent_50%)] opacity-[0.04]" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-60 h-60 bg-accent/5 rounded-full blur-3xl" />
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-28 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary mb-8 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="font-semibold">Tecnología de punta en salud digital</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-foreground leading-[1.1] tracking-tight text-balance font-[family-name:var(--font-space-grotesk)]">
              Tu salud, conectada{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">en tiempo real</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto text-pretty">
              Monitorea tus signos vitales desde tu celular con inteligencia artificial, conecta con médicos
              especializados y gestiona tu historia clínica digital. Todo en una sola plataforma.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2.5 px-8 text-base font-bold shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-all"
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
                className="w-full sm:w-auto gap-2.5 px-8 text-base font-semibold border-border/50 hover:bg-muted/50"
                onClick={() => {
                  setRole("doctor")
                  navigate("register")
                }}
              >
                <Stethoscope className="w-4 h-4" /> Soy Médico
              </Button>
            </div>

            {/* Trust badges */}
            <div className="mt-10 flex items-center justify-center gap-6 text-xs text-muted-foreground">
              {[
                { icon: Shield, text: "Datos cifrados" },
                { icon: Bot, text: "Asistente IA" },
                { icon: Clock, text: "Disponible 24/7" },
              ].map((badge) => (
                <div key={badge.text} className="flex items-center gap-1.5">
                  <badge.icon className="w-3.5 h-3.5 text-primary/60" />
                  <span className="font-medium">{badge.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary/60 mb-3">
              <Activity className="w-3.5 h-3.5" /> Funcionalidades
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-foreground font-[family-name:var(--font-space-grotesk)] tracking-tight">
              Última generación en telemedicina
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Integramos inteligencia artificial y sensores avanzados para ofrecerte la mejor experiencia en salud digital.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Smartphone,
                title: "Signos Vitales con IA",
                description: "Mide tu saturación de oxígeno, frecuencia cardíaca y respiratoria usando solo la cámara de tu celular.",
                gradient: "from-primary/10 to-primary/5",
              },
              {
                icon: Video,
                title: "Teleconsultas HD",
                description: "Consultas médicas virtuales en alta definición con médicos certificados, desde cualquier lugar.",
                gradient: "from-accent/10 to-accent/5",
              },
              {
                icon: ShieldCheck,
                title: "Historia Clínica Segura",
                description: "Tu historial médico completo, cifrado y accesible para ti y tus médicos autorizados.",
                gradient: "from-green-500/10 to-green-500/5",
              },
              {
                icon: Clock,
                title: "Disponibilidad 24/7",
                description: "Agenda citas con médicos disponibles en tiempo real, incluyendo atención de urgencias.",
                gradient: "from-amber-500/10 to-amber-500/5",
              },
              {
                icon: Activity,
                title: "Monitoreo Continuo",
                description: "Lleva un registro histórico de tus signos vitales y recibe alertas automáticas por IA.",
                gradient: "from-purple-500/10 to-purple-500/5",
              },
              {
                icon: Stethoscope,
                title: "Red de Especialistas",
                description: "Accede a cardiólogos, neumólogos, internistas y más especialidades médicas.",
                gradient: "from-cyan-500/10 to-cyan-500/5",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-5 h-5 text-foreground/70" />
                </div>
                <h3 className="font-bold text-foreground mb-2 font-[family-name:var(--font-space-grotesk)]">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-24 bg-card/50 border-y border-border/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary/60 mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Proceso
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-foreground font-[family-name:var(--font-space-grotesk)] tracking-tight">
              Cómo funciona
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { step: "01", title: "Regístrate", description: "Crea tu perfil como paciente o médico en menos de 2 minutos. Acepta el consentimiento informado." },
              { step: "02", title: "Evalúa tus signos", description: "Usa la cámara de tu celular para registrar tus parámetros funcionales con IA. Tu asistente Ana te guiará." },
              { step: "03", title: "Conecta con tu médico", description: "Genera un token de telemedicina o un QR para atención presencial desde cualquier estación." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-black text-xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-primary/20 font-[family-name:var(--font-space-grotesk)]">
                  {item.step}
                </div>
                <h3 className="font-bold text-foreground text-lg mb-2 font-[family-name:var(--font-space-grotesk)]">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 shadow-2xl shadow-primary/5">
            <Bot className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-black text-foreground font-[family-name:var(--font-space-grotesk)] tracking-tight mb-3">
              Conoce a Ana, tu asistente de salud
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed mb-6">
              Nuestra asistente virtual te guiará paso a paso por todo el proceso de evaluación,
              desde el consentimiento informado hasta la generación de tu reporte clínico con IA.
            </p>
            <Button
              size="lg"
              className="gap-2.5 px-8 text-base font-bold shadow-lg shadow-primary/25"
              onClick={() => {
                setRole("patient")
                navigate("register")
              }}
            >
              Comenzar ahora <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              <Heart className="w-3 h-3 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">VitaLink — Telemedicina Inteligente</span>
          </div>
          <p className="text-xs text-muted-foreground/60">© 2026 Medilink. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  )
}
