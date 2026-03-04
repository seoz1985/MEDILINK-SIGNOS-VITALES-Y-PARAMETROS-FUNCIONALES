"use client"

import { useState, useEffect } from "react"
import { useApp, type UserRole } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Heart, Stethoscope, User, ArrowLeft, Eye, EyeOff, ShieldCheck, Lock, Sparkles } from "lucide-react"

/* ── Shared animated background for auth screens ── */
function AuthBackground() {
  return (
    <>
      {/* Gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-cyan-500/8 blur-[120px] animate-[float_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full bg-indigo-500/8 blur-[100px] animate-[float_10s_ease-in-out_infinite_reverse]" />
        <div className="absolute -bottom-32 left-1/3 w-[350px] h-[350px] rounded-full bg-emerald-500/6 blur-[100px] animate-[float_12s_ease-in-out_infinite]" />
      </div>
      {/* Mesh overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      {/* Floating particles */}
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="pointer-events-none fixed w-1 h-1 rounded-full bg-cyan-400/30"
          style={{
            left: `${15 + i * 22}%`,
            top: `-5%`,
            animation: `particle ${14 + i * 3}s linear infinite`,
            animationDelay: `${i * 3}s`,
          }}
        />
      ))}
    </>
  )
}

/* ── Glassmorphism header ── */
function AuthHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="relative z-20 border-b border-white/[0.06] bg-[#040d1a]/70 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex items-center gap-3 px-5 py-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.1] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Heart className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg font-[family-name:var(--font-space-grotesk)] tracking-tight">
            VitaLink
          </span>
        </div>
      </div>
    </header>
  )
}

/* ── Role selector pill ── */
function RolePill({
  role,
  label,
  icon: Icon,
  selected,
  onClick,
}: {
  role: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border transition-all duration-300 ${
        selected
          ? "border-cyan-400/50 bg-cyan-400/[0.08] shadow-lg shadow-cyan-500/10"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]"
      }`}
    >
      {selected && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-cyan-400/10 to-transparent" />
      )}
      <div
        className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
          selected
            ? "bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/30"
            : "bg-white/[0.06] group-hover:bg-white/[0.1]"
        }`}
      >
        <Icon className={`w-5 h-5 transition-colors ${selected ? "text-white" : "text-white/40 group-hover:text-white/60"}`} />
      </div>
      <span className={`relative text-sm font-semibold transition-colors ${selected ? "text-cyan-300" : "text-white/40 group-hover:text-white/60"}`}>
        {label}
      </span>
    </button>
  )
}

/* ── Styled input with glow ── */
function AuthInput({
  id,
  label,
  type = "text",
  placeholder,
  showToggle,
  showPassword,
  onTogglePassword,
}: {
  id: string
  label: string
  type?: string
  placeholder: string
  showToggle?: boolean
  showPassword?: boolean
  onTogglePassword?: () => void
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-white/60">
        {label}
      </label>
      <div className="relative group">
        <Input
          id={id}
          type={showToggle ? (showPassword ? "text" : "password") : type}
          placeholder={placeholder}
          className="h-12 bg-white/[0.04] border-white/[0.1] text-white placeholder:text-white/25 rounded-xl focus:border-cyan-400/50 focus:ring-cyan-400/20 focus:bg-white/[0.06] transition-all"
        />
        {showToggle && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━ LOGIN SCREEN ━━━━━━━━━━━━━━━━━━━ */
export function LoginScreen() {
  const { navigate, setRole } = useApp()
  const [showPassword, setShowPassword] = useState(false)
  const [selectedRole, setSelectedRole] = useState<UserRole>(null)

  const handleLogin = () => {
    if (selectedRole === "patient") {
      setRole("patient")
      navigate("patient-dashboard")
    } else if (selectedRole === "doctor") {
      setRole("doctor")
      navigate("doctor-dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-[#040d1a] flex flex-col relative overflow-hidden">
      <AuthBackground />
      <AuthHeader onBack={() => navigate("landing")} />

      <main className="relative z-10 flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-md animate-[fadeInUp_0.6s_ease-out]">
          {/* Card */}
          <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            {/* Top glow accent */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

            <div className="p-8">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 border border-cyan-400/20 mb-4">
                  <Lock className="w-6 h-6 text-cyan-400" />
                </div>
                <h1 className="text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
                  Iniciar Sesión
                </h1>
                <p className="text-white/40 text-sm mt-1.5">Accede a tu cuenta de VitaLink</p>
              </div>

              <div className="space-y-5">
                {/* Role Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <RolePill role="patient" label="Paciente" icon={User} selected={selectedRole === "patient"} onClick={() => setSelectedRole("patient")} />
                  <RolePill role="doctor" label="Médico" icon={Stethoscope} selected={selectedRole === "doctor"} onClick={() => setSelectedRole("doctor")} />
                </div>

                <AuthInput id="email" label="Correo electrónico" type="email" placeholder="tu@correo.com" />

                <AuthInput
                  id="password"
                  label="Contraseña"
                  placeholder="Tu contraseña"
                  showToggle
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword(!showPassword)}
                />

                <Button
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-base shadow-lg shadow-cyan-500/25 transition-all duration-300 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100"
                  onClick={handleLogin}
                  disabled={!selectedRole}
                >
                  Ingresar
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/[0.08]" />
                  <span className="text-xs text-white/25 uppercase tracking-wider">o</span>
                  <div className="flex-1 h-px bg-white/[0.08]" />
                </div>

                <p className="text-center text-sm text-white/40">
                  ¿No tienes cuenta?{" "}
                  <button onClick={() => navigate("register")} className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">
                    Regístrate aquí
                  </button>
                </p>
              </div>
            </div>

            {/* Bottom trust strip */}
            <div className="border-t border-white/[0.06] bg-white/[0.02] px-8 py-3 flex items-center justify-center gap-4">
              <div className="flex items-center gap-1.5 text-white/25 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/50" />
                <span>Datos encriptados</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-1.5 text-white/25 text-xs">
                <Lock className="w-3 h-3 text-cyan-400/50" />
                <span>Conexión segura</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━ REGISTER SCREEN ━━━━━━━━━━━━━━━━━ */
export function RegisterScreen() {
  const { navigate, role, setRole } = useApp()
  const [showPassword, setShowPassword] = useState(false)
  const [selectedRole, setSelectedRole] = useState<UserRole>(role)

  const handleRegister = () => {
    if (selectedRole === "patient") {
      setRole("patient")
      navigate("patient-dashboard")
    } else if (selectedRole === "doctor") {
      setRole("doctor")
      navigate("doctor-dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-[#040d1a] flex flex-col relative overflow-hidden">
      <AuthBackground />
      <AuthHeader onBack={() => navigate("landing")} />

      <main className="relative z-10 flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-md animate-[fadeInUp_0.6s_ease-out]">
          {/* Card */}
          <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            {/* Top glow accent */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

            <div className="p-8">
              {/* Header */}
              <div className="text-center mb-7">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 border border-cyan-400/20 mb-4">
                  <Sparkles className="w-6 h-6 text-cyan-400" />
                </div>
                <h1 className="text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
                  Crear Cuenta
                </h1>
                <p className="text-white/40 text-sm mt-1.5">Únete a la plataforma de telemedicina más avanzada</p>
              </div>

              <div className="space-y-4">
                {/* Role Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <RolePill role="patient" label="Paciente" icon={User} selected={selectedRole === "patient"} onClick={() => setSelectedRole("patient")} />
                  <RolePill role="doctor" label="Médico" icon={Stethoscope} selected={selectedRole === "doctor"} onClick={() => setSelectedRole("doctor")} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <AuthInput id="firstName" label="Nombre" placeholder="Tu nombre" />
                  <AuthInput id="lastName" label="Apellido" placeholder="Tu apellido" />
                </div>

                <AuthInput id="regEmail" label="Correo electrónico" type="email" placeholder="tu@correo.com" />

                {selectedRole === "doctor" && (
                  <AuthInput id="license" label="Número de licencia médica" placeholder="Ej: MED-12345" />
                )}

                <AuthInput
                  id="regPassword"
                  label="Contraseña"
                  placeholder="Mínimo 8 caracteres"
                  showToggle
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword(!showPassword)}
                />

                <Button
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-base shadow-lg shadow-cyan-500/25 transition-all duration-300 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100"
                  onClick={handleRegister}
                  disabled={!selectedRole}
                >
                  Crear Cuenta
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/[0.08]" />
                  <span className="text-xs text-white/25 uppercase tracking-wider">o</span>
                  <div className="flex-1 h-px bg-white/[0.08]" />
                </div>

                <p className="text-center text-sm text-white/40">
                  ¿Ya tienes cuenta?{" "}
                  <button onClick={() => navigate("login")} className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">
                    Inicia sesión
                  </button>
                </p>
              </div>
            </div>

            {/* Bottom trust strip */}
            <div className="border-t border-white/[0.06] bg-white/[0.02] px-8 py-3 flex items-center justify-center gap-4">
              <div className="flex items-center gap-1.5 text-white/25 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/50" />
                <span>Datos encriptados</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-1.5 text-white/25 text-xs">
                <Lock className="w-3 h-3 text-cyan-400/50" />
                <span>Conexión segura</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
