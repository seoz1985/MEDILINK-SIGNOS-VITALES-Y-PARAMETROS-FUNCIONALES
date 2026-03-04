"use client"

import { useState } from "react"
import { useApp, type UserRole } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Heart, Stethoscope, User, ArrowLeft, Eye, EyeOff } from "lucide-react"

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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("landing")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">VitaLink</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-[family-name:var(--font-space-grotesk)]">Iniciar Sesion</CardTitle>
            <CardDescription>Accede a tu cuenta de VitaLink</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Role Selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedRole("patient")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  selectedRole === "patient"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedRole === "patient" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <User className="w-5 h-5" />
                </div>
                <span className={`text-sm font-medium ${selectedRole === "patient" ? "text-primary" : "text-muted-foreground"}`}>
                  Paciente
                </span>
              </button>
              <button
                onClick={() => setSelectedRole("doctor")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  selectedRole === "doctor"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedRole === "doctor" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <Stethoscope className="w-5 h-5" />
                </div>
                <span className={`text-sm font-medium ${selectedRole === "doctor" ? "text-primary" : "text-muted-foreground"}`}>
                  Medico
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Correo electronico</Label>
              <Input id="email" type="email" placeholder="tu@correo.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contrasena</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="Tu contrasena" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full" onClick={handleLogin} disabled={!selectedRole}>
              Ingresar
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {"No tienes cuenta? "}
              <button onClick={() => navigate("register")} className="text-primary hover:underline font-medium">
                Registrate aqui
              </button>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("landing")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">VitaLink</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-[family-name:var(--font-space-grotesk)]">Crear Cuenta</CardTitle>
            <CardDescription>Unete a la plataforma de telemedicina mas avanzada</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Role Selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedRole("patient")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  selectedRole === "patient"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedRole === "patient" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <User className="w-5 h-5" />
                </div>
                <span className={`text-sm font-medium ${selectedRole === "patient" ? "text-primary" : "text-muted-foreground"}`}>
                  Paciente
                </span>
              </button>
              <button
                onClick={() => setSelectedRole("doctor")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  selectedRole === "doctor"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedRole === "doctor" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <Stethoscope className="w-5 h-5" />
                </div>
                <span className={`text-sm font-medium ${selectedRole === "doctor" ? "text-primary" : "text-muted-foreground"}`}>
                  Medico
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input id="firstName" placeholder="Tu nombre" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Apellido</Label>
                <Input id="lastName" placeholder="Tu apellido" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="regEmail">Correo electronico</Label>
              <Input id="regEmail" type="email" placeholder="tu@correo.com" />
            </div>
            {selectedRole === "doctor" && (
              <div className="space-y-2">
                <Label htmlFor="license">Numero de licencia medica</Label>
                <Input id="license" placeholder="Ej: MED-12345" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="regPassword">Contrasena</Label>
              <div className="relative">
                <Input id="regPassword" type={showPassword ? "text" : "password"} placeholder="Minimo 8 caracteres" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full" onClick={handleRegister} disabled={!selectedRole}>
              Crear Cuenta
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {"Ya tienes cuenta? "}
              <button onClick={() => navigate("login")} className="text-primary hover:underline font-medium">
                Inicia sesion
              </button>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
