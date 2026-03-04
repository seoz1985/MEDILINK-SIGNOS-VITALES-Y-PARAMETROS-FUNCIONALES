"use client"

import { useApp } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import { useEffect, useRef, useState } from "react"
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
  Zap,
  Brain,
  Fingerprint,
  Globe,
  ChevronDown,
  Play,
  CheckCircle2,
  Star,
  TrendingUp,
  Scan,
} from "lucide-react"

/* ── Animated counter hook ── */
function useCounter(end: number, duration = 2000, start = 0) {
  const [value, setValue] = useState(start)
  const ref = useRef<HTMLDivElement>(null)
  const triggered = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !triggered.current) {
        triggered.current = true
        const startTime = Date.now()
        const tick = () => {
          const elapsed = Date.now() - startTime
          const progress = Math.min(elapsed / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
          setValue(Math.round(start + (end - start) * eased))
          if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [end, duration, start])
  return { value, ref }
}

export function LandingPage() {
  const { navigate, setRole } = useApp()
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Interactive gradient follows mouse
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 })
    }
    window.addEventListener("mousemove", handler)
    return () => window.removeEventListener("mousemove", handler)
  }, [])

  // Animated stats
  const patients = useCounter(12500, 2200)
  const accuracy = useCounter(97, 1800, 60)
  const doctors = useCounter(340, 2000)
  const uptime = useCounter(99, 1500, 90)

  return (
    <div className="min-h-screen bg-[#040d1a] text-white overflow-x-hidden">

      {/* ════════ ANIMATED BACKGROUND ════════ */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Dynamic gradient that follows mouse */}
        <div
          className="absolute w-[800px] h-[800px] rounded-full opacity-20 blur-[120px] transition-all duration-[3000ms] ease-out"
          style={{
            background: "radial-gradient(circle, #0ea5e9, #06b6d4, transparent 70%)",
            left: `${mousePos.x - 20}%`,
            top: `${mousePos.y - 20}%`,
          }}
        />
        {/* Fixed ambient orbs */}
        <div className="absolute top-[10%] right-[15%] w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[100px] animate-[float_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-[20%] left-[10%] w-[400px] h-[400px] rounded-full bg-cyan-500/8 blur-[100px] animate-[float_12s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-[60%] right-[30%] w-[300px] h-[300px] rounded-full bg-emerald-500/6 blur-[80px] animate-[float_10s_ease-in-out_2s_infinite]" />

        {/* Mesh grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(14,165,233,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.3) 1px, transparent 1px)`,
            backgroundSize: "80px 80px",
          }}
        />

        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-cyan-400/40 animate-[particle_15s_linear_infinite]"
            style={{
              left: `${15 + i * 15}%`,
              top: `${10 + (i % 3) * 30}%`,
              animationDelay: `${i * 2.5}s`,
              animationDuration: `${12 + i * 3}s`,
            }}
          />
        ))}
      </div>

      {/* ════════ HEADER ════════ */}
      <header className="sticky top-0 z-50 bg-[#040d1a]/70 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Heart className="w-5 h-5 text-white" />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 animate-ping opacity-20" />
            </div>
            <div>
              <span className="font-bold text-xl text-white font-[family-name:var(--font-space-grotesk)] tracking-tight">
                Vita<span className="text-cyan-400">Link</span>
              </span>
              <span className="hidden sm:inline text-[11px] text-white/40 ml-2 font-medium tracking-wide uppercase">Salud Digital con IA</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("login")}
              className="text-white/60 hover:text-white hover:bg-white/5 font-medium"
            >
              Iniciar Sesión
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("register")}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 font-semibold border-0"
            >
              Registrarse
            </Button>
          </div>
        </div>
      </header>

      {/* ════════ HERO ════════ */}
      <section className="relative z-10 pt-16 md:pt-28 pb-20 md:pb-32">
        <div className="max-w-7xl mx-auto px-5">
          <div className="max-w-4xl mx-auto text-center">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 backdrop-blur-sm px-5 py-2 text-sm text-cyan-300 mb-8 shadow-lg shadow-cyan-500/5 animate-[fadeInUp_0.6s_ease-out]">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">Tecnología médica de nueva generación</span>
            </div>

            {/* Main heading */}
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-[0.95] tracking-tighter font-[family-name:var(--font-space-grotesk)] animate-[fadeInUp_0.8s_ease-out]">
              <span className="text-white">Tu salud,</span>
              <br />
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent animate-[shimmer_3s_ease-in-out_infinite] bg-[length:200%_auto]">
                inteligente
              </span>
            </h1>

            <p className="mt-8 text-lg md:text-xl text-white/50 leading-relaxed max-w-2xl mx-auto text-pretty animate-[fadeInUp_1s_ease-out]">
              Monitorea tus signos vitales con la cámara de tu celular. Inteligencia artificial que analiza,
              detecta y te conecta con médicos especializados en segundos.
            </p>

            {/* CTA Buttons */}
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 animate-[fadeInUp_1.2s_ease-out]">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-3 px-10 py-6 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/40 transition-all duration-300 hover:scale-[1.02] border-0 rounded-2xl"
                onClick={() => {
                  setRole("patient")
                  navigate("register")
                }}
              >
                <Scan className="w-5 h-5" />
                Evaluar mis signos vitales
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Trust strip */}
            <div className="mt-14 flex items-center justify-center gap-8 md:gap-12 text-sm text-white/30 animate-[fadeInUp_1.4s_ease-out]">
              {[
                { icon: Shield, text: "Cifrado médico" },
                { icon: Brain, text: "IA avanzada" },
                { icon: Zap, text: "Resultados en 90s" },
                { icon: Clock, text: "24/7" },
              ].map((b) => (
                <div key={b.text} className="flex items-center gap-2 hover:text-white/60 transition-colors">
                  <b.icon className="w-4 h-4 text-cyan-500/50" />
                  <span className="font-medium hidden sm:inline">{b.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/20 animate-bounce">
          <ChevronDown className="w-5 h-5" />
        </div>
      </section>

      {/* ════════ STATS BAR ════════ */}
      <section className="relative z-10 py-6 border-y border-white/5 bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-5 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0">
          {[
            { ref: patients.ref, value: patients.value, suffix: "+", label: "Pacientes evaluados", icon: Heart },
            { ref: accuracy.ref, value: accuracy.value, suffix: "%", label: "Precisión clínica", icon: TrendingUp },
            { ref: doctors.ref, value: doctors.value, suffix: "+", label: "Médicos en red", icon: Stethoscope },
            { ref: uptime.ref, value: uptime.value, suffix: ".9%", label: "Disponibilidad", icon: Zap },
          ].map((stat, i) => (
            <div key={stat.label} ref={stat.ref as any} className={`text-center py-3 ${i < 3 ? "md:border-r md:border-white/5" : ""}`}>
              <div className="flex items-center justify-center gap-2 mb-1">
                <stat.icon className="w-4 h-4 text-cyan-400/60" />
                <span className="text-3xl md:text-4xl font-black text-white font-[family-name:var(--font-space-grotesk)]">
                  {stat.value.toLocaleString()}<span className="text-cyan-400">{stat.suffix}</span>
                </span>
              </div>
              <span className="text-xs text-white/30 font-medium uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ════════ AI ASSISTANT CTA ════════ */}
      <section className="relative z-10 py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-5">
          <div className="relative p-10 md:p-16 rounded-[2rem] overflow-hidden">
            {/* Card background with glass effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/80 via-blue-950/60 to-indigo-950/80 backdrop-blur-xl border border-cyan-500/10 rounded-[2rem]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.15),transparent_60%)]" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px]" />

            <div className="relative z-10 text-center">
              {/* Animated bot icon */}
              <div className="relative w-20 h-20 mx-auto mb-8">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 animate-[pulse_3s_ease-in-out_infinite] opacity-30 blur-xl" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-600/20 backdrop-blur-sm border border-cyan-400/20 flex items-center justify-center">
                  <Bot className="w-10 h-10 text-cyan-300" />
                </div>
              </div>

              <h2 className="text-3xl md:text-5xl font-black font-[family-name:var(--font-space-grotesk)] tracking-tight mb-5">
                Tu asistente de salud
                <br />
                <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">con inteligencia artificial</span>
              </h2>
              <p className="text-white/40 text-lg max-w-xl mx-auto leading-relaxed mb-10">
                Te guía paso a paso con voz natural durante toda la evaluación. Desde el consentimiento informado
                hasta la generación de tu reporte clínico personalizado.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  className="gap-3 px-8 py-6 text-base font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-2xl shadow-cyan-500/20 border-0 rounded-xl"
                  onClick={() => {
                    setRole("patient")
                    navigate("register")
                  }}
                >
                  <Play className="w-4 h-4" />
                  Comenzar evaluación
                </Button>
              </div>

              {/* Feature tags */}
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                {["Voz natural", "Guía paso a paso", "Reporte clínico IA", "Multiidioma"].map((tag) => (
                  <span key={tag} className="px-4 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/40 border border-white/5">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ FEATURES ════════ */}
      <section className="relative z-10 py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-cyan-400/60 mb-4">
              <Activity className="w-3.5 h-3.5" /> Capacidades
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-white font-[family-name:var(--font-space-grotesk)] tracking-tight">
              Tecnología que
              <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent"> transforma</span>
            </h2>
            <p className="mt-5 text-white/35 max-w-xl mx-auto leading-relaxed text-lg">
              Cada funcionalidad diseñada para acercarte a una salud más accesible, precisa y conectada.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Scan,
                title: "Escaneo Facial con IA",
                description: "Analiza micro-variaciones de color en tu rostro con tecnología rPPG para estimar frecuencia cardíaca, saturación y más.",
                color: "cyan",
                gradient: "from-cyan-500/15 to-cyan-500/5",
                borderColor: "hover:border-cyan-500/30",
                iconColor: "text-cyan-400",
              },
              {
                icon: Video,
                title: "Teleconsulta Instantánea",
                description: "Genera un token o código QR y conéctate con médicos certificados en videollamada HD desde cualquier lugar.",
                color: "blue",
                gradient: "from-blue-500/15 to-blue-500/5",
                borderColor: "hover:border-blue-500/30",
                iconColor: "text-blue-400",
              },
              {
                icon: Fingerprint,
                title: "Datos 100% Cifrados",
                description: "Tu información médica protegida con cifrado de grado hospitalario. Solo tú y tus médicos autorizados acceden.",
                color: "emerald",
                gradient: "from-emerald-500/15 to-emerald-500/5",
                borderColor: "hover:border-emerald-500/30",
                iconColor: "text-emerald-400",
              },
              {
                icon: Brain,
                title: "Triage Inteligente",
                description: "La IA analiza tus síntomas, antecedentes y signos vitales para generar una priorización clínica en tiempo real.",
                color: "violet",
                gradient: "from-violet-500/15 to-violet-500/5",
                borderColor: "hover:border-violet-500/30",
                iconColor: "text-violet-400",
              },
              {
                icon: Activity,
                title: "Historial Evolutivo",
                description: "Cada evaluación se almacena. Visualiza tendencias, gráficos y alertas automáticas sobre tu evolución clínica.",
                color: "amber",
                gradient: "from-amber-500/15 to-amber-500/5",
                borderColor: "hover:border-amber-500/30",
                iconColor: "text-amber-400",
              },
              {
                icon: Globe,
                title: "Acceso Universal",
                description: "Funciona en cualquier celular con cámara y navegador. Sin apps, sin descargas. Solo abre y evalúa.",
                color: "rose",
                gradient: "from-rose-500/15 to-rose-500/5",
                borderColor: "hover:border-rose-500/30",
                iconColor: "text-rose-400",
              },
            ].map((f) => (
              <div
                key={f.title}
                className={`group relative p-7 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm ${f.borderColor} hover:bg-white/[0.04] transition-all duration-500 hover:-translate-y-1`}
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <f.icon className={`w-6 h-6 ${f.iconColor}`} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2.5 font-[family-name:var(--font-space-grotesk)]">{f.title}</h3>
                <p className="text-sm text-white/35 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ HOW IT WORKS ════════ */}
      <section className="relative z-10 py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-cyan-400/60 mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Proceso
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-white font-[family-name:var(--font-space-grotesk)] tracking-tight">
              Tres pasos.
              <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent"> Sin complicaciones.</span>
            </h2>
          </div>

          <div className="relative grid md:grid-cols-3 gap-8">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-20 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

            {[
              {
                step: "01",
                title: "Crea tu perfil",
                description: "Regístrate en menos de dos minutos. Acepta el consentimiento informado y completa tus datos básicos con asistencia por voz.",
                icon: Fingerprint,
              },
              {
                step: "02",
                title: "Escanea tu rostro",
                description: "Coloca tu rostro frente a la cámara. En noventa segundos nuestro algoritmo de IA analiza tus parámetros funcionales.",
                icon: Scan,
              },
              {
                step: "03",
                title: "Conecta con tu médico",
                description: "Recibe tu reporte clínico con IA. Genera un token de telemedicina o un código QR para atención presencial inmediata.",
                icon: Stethoscope,
              },
            ].map((item) => (
              <div key={item.step} className="relative text-center group">
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 opacity-20 blur-xl group-hover:opacity-40 transition-opacity" />
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 flex items-center justify-center group-hover:border-cyan-500/40 transition-colors">
                    <item.icon className="w-8 h-8 text-cyan-400" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-xs font-black text-white shadow-lg shadow-cyan-500/30 font-[family-name:var(--font-space-grotesk)]">
                    {item.step}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-3 font-[family-name:var(--font-space-grotesk)]">{item.title}</h3>
                <p className="text-sm text-white/35 leading-relaxed max-w-xs mx-auto">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ TESTIMONIAL / SOCIAL PROOF ════════ */}
      <section className="relative z-10 py-20 md:py-24 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-4xl font-black text-white font-[family-name:var(--font-space-grotesk)] tracking-tight">
              Respaldado por profesionales
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "La precisión del rPPG facial nos sorprendió. Estamos integrando VitaLink en nuestros protocolos de triage remoto.",
                name: "Dr. Andrés Morales",
                role: "Cardiólogo — Hospital Central",
                stars: 5,
              },
              {
                quote: "Mis pacientes pueden evaluarse desde casa antes de la consulta. Llegamos a la cita con datos reales, no solo síntomas.",
                name: "Dra. Laura Castillo",
                role: "Medicina Interna",
                stars: 5,
              },
              {
                quote: "La interfaz es tan intuitiva que pacientes mayores de 70 años completan el proceso sin ayuda. Impresionante UX.",
                name: "Dr. Carlos Vega",
                role: "Geriatra — ClínicaSalud",
                stars: 5,
              },
            ].map((t) => (
              <div key={t.name} className="p-7 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(t.stars)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-white/40 leading-relaxed mb-6 italic">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-white/25">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ FINAL CTA ════════ */}
      <section className="relative z-10 py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 blur-3xl rounded-full" />
            <div className="relative">
              <h2 className="text-3xl md:text-5xl font-black text-white font-[family-name:var(--font-space-grotesk)] tracking-tight mb-6">
                Tu salud no puede esperar.
                <br />
                <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">Empieza ahora.</span>
              </h2>
              <p className="text-white/35 text-lg max-w-lg mx-auto mb-10 leading-relaxed">
                En menos de tres minutos tendrás una evaluación completa de tus parámetros funcionales con inteligencia artificial.
              </p>
              <Button
                size="lg"
                className="gap-3 px-10 py-6 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-2xl shadow-cyan-500/30 border-0 rounded-2xl hover:scale-[1.02] transition-all"
                onClick={() => {
                  setRole("patient")
                  navigate("register")
                }}
              >
                Comenzar evaluación gratuita
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className="relative z-10 border-t border-white/5 py-10 bg-[#030a14]">
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-blue-600/20 flex items-center justify-center border border-cyan-500/10">
                <Heart className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-sm text-white/30 font-medium">
                Vita<span className="text-cyan-400/60">Link</span> — Salud Digital con IA
              </span>
            </div>
            <div className="flex items-center gap-6 text-xs text-white/20">
              <span>Telemedicina</span>
              <span>•</span>
              <span>Inteligencia Artificial</span>
              <span>•</span>
              <span>Colombia</span>
            </div>
            <p className="text-xs text-white/15">© 2026 Medilink. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
