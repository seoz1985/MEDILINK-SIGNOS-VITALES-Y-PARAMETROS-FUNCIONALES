"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useApp } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Heart,
  ArrowLeft,
  ArrowRight,
  Bot,
  ShieldCheck,
  User,
  Users,
  FileText,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Stethoscope,
  Activity,
  Sparkles,
  ChevronDown,
} from "lucide-react"

/* ── Types ── */
export type PatientIdentification = {
  registration_type: "self" | "guardian"
  patient_name: string
  patient_document_type: string
  patient_document_number: string
  patient_age: number
  patient_email: string
  patient_phone: string
  guardian_name: string
  guardian_document_type: string
  guardian_document_number: string
  guardian_relationship: string
}

export type MedicalQuestionnaire = {
  chief_complaint: string
  duration_hours: number
  dyspnea: boolean
  cough: boolean
  fever: boolean
  chest_pain: boolean
  diabetes: boolean
  hypertension: boolean
}

export type OnboardingData = {
  consent_accepted: boolean
  consent_timestamp: string
  patient: PatientIdentification
  questionnaire: MedicalQuestionnaire
}

const INITIAL_PATIENT: PatientIdentification = {
  registration_type: "self",
  patient_name: "",
  patient_document_type: "",
  patient_document_number: "",
  patient_age: 0,
  patient_email: "",
  patient_phone: "",
  guardian_name: "",
  guardian_document_type: "",
  guardian_document_number: "",
  guardian_relationship: "",
}

const INITIAL_QUESTIONNAIRE: MedicalQuestionnaire = {
  chief_complaint: "",
  duration_hours: 0,
  dyspnea: false,
  cough: false,
  fever: false,
  chest_pain: false,
  diabetes: false,
  hypertension: false,
}

const DOC_TYPES = [
  { value: "cc", label: "Cédula de Ciudadanía" },
  { value: "ti", label: "Tarjeta de Identidad" },
  { value: "ce", label: "Cédula de Extranjería" },
  { value: "passport", label: "Pasaporte" },
  { value: "rc", label: "Registro Civil" },
  { value: "other", label: "Otro" },
]

const RELATIONSHIPS = [
  { value: "padre", label: "Padre / Madre" },
  { value: "hijo", label: "Hijo(a)" },
  { value: "conyuge", label: "Cónyuge" },
  { value: "hermano", label: "Hermano(a)" },
  { value: "otro_familiar", label: "Otro familiar" },
  { value: "representante", label: "Representante legal" },
  { value: "cuidador", label: "Cuidador" },
]

const STEPS = [
  { id: 0, label: "Bienvenida", icon: Bot },
  { id: 1, label: "Consentimiento", icon: ShieldCheck },
  { id: 2, label: "Identificación", icon: User },
  { id: 3, label: "Información", icon: FileText },
  { id: 4, label: "Tamizaje", icon: Stethoscope },
]

/* ── Assistant bubble ── */
function AssistantBubble({ children, typing }: { children: React.ReactNode; typing?: boolean }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
        <Bot className="w-5 h-5 text-primary-foreground" />
      </div>
      <div className="flex-1 bg-muted/60 border border-border/50 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-foreground leading-relaxed">
        {typing ? (
          <div className="flex items-center gap-1.5 py-1">
            <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        ) : children}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                */
/* ═══════════════════════════════════════════════════════════════ */
export function PatientOnboarding() {
  const { navigate, setOnboardingData } = useApp()
  const [step, setStep] = useState(0)
  const [typing, setTyping] = useState(true)
  const [consent, setConsent] = useState(false)
  const [consentScrolled, setConsentScrolled] = useState(false)
  const [patient, setPatient] = useState<PatientIdentification>(INITIAL_PATIENT)
  const [questionnaire, setQ] = useState<MedicalQuestionnaire>(INITIAL_QUESTIONNAIRE)
  const consentRef = useRef<HTMLDivElement>(null)

  // Simular typing del asistente al cambiar paso
  useEffect(() => {
    setTyping(true)
    const t = setTimeout(() => setTyping(false), 800 + Math.random() * 600)
    return () => clearTimeout(t)
  }, [step])

  // Consent scroll tracking
  const handleConsentScroll = useCallback(() => {
    const el = consentRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setConsentScrolled(true)
    }
  }, [])

  const canNext = useCallback((): boolean => {
    switch (step) {
      case 0: return true
      case 1: return consent && consentScrolled
      case 2: {
        const p = patient
        const hasBase = !!(p.patient_name.trim() && p.patient_document_type && p.patient_document_number.trim() && p.patient_age > 0)
        if (p.registration_type === "guardian") {
          return hasBase && !!(p.guardian_name.trim() && p.guardian_document_type && p.guardian_document_number.trim() && p.guardian_relationship)
        }
        return hasBase
      }
      case 3: return true
      case 4: return !!questionnaire.chief_complaint
      default: return false
    }
  }, [step, consent, consentScrolled, patient, questionnaire])

  const handleComplete = useCallback(() => {
    const data: OnboardingData = {
      consent_accepted: true,
      consent_timestamp: new Date().toISOString(),
      patient,
      questionnaire,
    }
    setOnboardingData(data)
    navigate("patient-vitals")
  }, [patient, questionnaire, navigate, setOnboardingData])

  const next = () => {
    if (step < 4) setStep(step + 1)
    else handleComplete()
  }
  const back = () => {
    if (step > 0) setStep(step - 1)
    else navigate("patient-dashboard")
  }

  const updatePatient = <K extends keyof PatientIdentification>(k: K, v: PatientIdentification[K]) =>
    setPatient((p) => ({ ...p, [k]: v }))

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={back} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">VitaLink</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">{step + 1}/5</span>
        </div>

        {/* Step indicator */}
        <div className="max-w-lg mx-auto px-4 pb-3">
          <div className="flex items-center gap-1">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                  s.id < step ? "bg-green-500" : s.id === step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            {STEPS.map((s) => {
              const Icon = s.icon
              return (
                <div
                  key={s.id}
                  className={`flex flex-col items-center gap-0.5 transition-all ${
                    s.id === step ? "opacity-100" : s.id < step ? "opacity-60" : "opacity-30"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${s.id === step ? "text-primary" : s.id < step ? "text-green-500" : "text-muted-foreground"}`} />
                  <span className="text-[8px] font-medium text-muted-foreground hidden sm:block">{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-32">
        {/* ═══════ STEP 0: Welcome ═══════ */}
        {step === 0 && (
          <div className="space-y-4">
            <AssistantBubble typing={typing}>
              <div className="space-y-3">
                <p className="font-semibold text-base">
                  ¡Hola! 👋 Soy <span className="text-primary">Ana</span>, tu asistente virtual de salud.
                </p>
                <p>
                  Te acompañaré en el proceso de <strong>evaluación de parámetros funcionales</strong> mediante nuestra tecnología de inteligencia artificial.
                </p>
                <p>Antes de comenzar, necesito guiarte por algunos pasos importantes:</p>
              </div>
            </AssistantBubble>

            {!typing && (
              <div className="space-y-3 pl-[52px]">
                {[
                  { icon: ShieldCheck, color: "text-green-500", bg: "bg-green-500/10", title: "Consentimiento informado", desc: "Conoce y acepta las condiciones del servicio" },
                  { icon: User, color: "text-blue-500", bg: "bg-blue-500/10", title: "Identificación", desc: "Tus datos personales para el registro clínico" },
                  { icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10", title: "Sobre la tecnología", desc: "Qué mide y qué limitaciones tiene" },
                  { icon: Stethoscope, color: "text-purple-500", bg: "bg-purple-500/10", title: "Tamizaje clínico", desc: "Cuestionario previo para orientar el análisis" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-card transition-colors">
                    <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                      <item.icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}

                <AssistantBubble>
                  <p>El proceso toma solo <strong>2-3 minutos</strong>. ¿Comenzamos?</p>
                </AssistantBubble>
              </div>
            )}
          </div>
        )}

        {/* ═══════ STEP 1: Informed Consent ═══════ */}
        {step === 1 && (
          <div className="space-y-4">
            <AssistantBubble typing={typing}>
              <p>
                Antes de continuar, es necesario que leas y aceptes nuestro <strong>consentimiento informado</strong>. 
                Por favor lee el documento completo desplazándote hasta el final.
              </p>
            </AssistantBubble>

            {!typing && (
              <Card className="border-0 shadow-xl bg-card/90 backdrop-blur-sm overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                      <h3 className="font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">
                        Consentimiento Informado
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">Lectura obligatoria antes de continuar</p>
                  </div>

                  <div
                    ref={consentRef}
                    onScroll={handleConsentScroll}
                    className="max-h-[45vh] overflow-y-auto p-4 space-y-4 text-sm text-muted-foreground leading-relaxed scroll-smooth"
                  >
                    <section>
                      <h4 className="font-bold text-foreground mb-2 text-base">1. Naturaleza del Servicio</h4>
                      <p>
                        El presente servicio utiliza tecnología de <strong>fotopletismografía remota (rPPG)</strong> e
                        <strong> inteligencia artificial</strong> para estimar parámetros funcionales a partir de la
                        captura de video facial mediante la cámara de su dispositivo móvil.
                      </p>
                      <p className="mt-2">
                        <strong className="text-amber-600 dark:text-amber-400">Este procedimiento NO constituye una toma
                        de signos vitales convencional</strong> y no debe interpretarse como un examen médico clínico.
                        Se trata de una herramienta tecnológica de tamizaje cuyo objetivo es orientar y complementar
                        la evaluación médica profesional.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-bold text-foreground mb-2 text-base">2. Alcance y Limitaciones</h4>
                      <ul className="list-disc pl-5 space-y-1.5">
                        <li>Los valores obtenidos representan <strong>estimaciones probabilísticas</strong> y no mediciones absolutas.</li>
                        <li>Los resultados son <strong>orientativos</strong> y deben ser correlacionados con un seguimiento médico profesional.</li>
                        <li>Las hipótesis diagnósticas generadas son <strong>variables probabilísticas</strong> y no constituyen un diagnóstico específico.</li>
                        <li>La precisión depende de factores como iluminación ambiental, estabilidad del dispositivo, tono de piel y condiciones fisiológicas del usuario.</li>
                        <li>Este servicio <strong>NO reemplaza</strong> la consulta médica presencial, estudios de laboratorio ni imágenes diagnósticas.</li>
                      </ul>
                    </section>

                    <section>
                      <h4 className="font-bold text-foreground mb-2 text-base">3. Responsabilidad</h4>
                      <p>
                        Los resultados aquí entregados hacen parte de probabilidades diagnósticas variables y
                        <strong> no representan una obligación de atención médica</strong> por parte de ningún
                        prestador de servicios en salud, asegurador, entidad promotora de salud (EPS),
                        institución prestadora de servicios (IPS) o cualquier tercero.
                      </p>
                      <p className="mt-2">
                        El usuario acepta que este servicio es una herramienta complementaria de tamizaje y
                        <strong> asume la responsabilidad</strong> de buscar atención médica profesional cuando
                        los indicadores lo sugieran.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-bold text-foreground mb-2 text-base">4. Uso de la Información</h4>
                      <ul className="list-disc pl-5 space-y-1.5">
                        <li>Los datos capturados (video facial, parámetros estimados, datos personales) serán procesados de forma <strong>confidencial y cifrada</strong>.</li>
                        <li>La información se utilizará exclusivamente para generar la evaluación de tamizaje solicitada.</li>
                        <li>Los datos podrán ser anonimizados para fines de mejora del algoritmo de IA, sin identificar al paciente.</li>
                        <li>No se compartirá información personal con terceros sin consentimiento explícito del usuario.</li>
                        <li>El usuario puede solicitar la eliminación de sus datos en cualquier momento.</li>
                      </ul>
                    </section>

                    <section>
                      <h4 className="font-bold text-foreground mb-2 text-base">5. Política de Privacidad</h4>
                      <p>
                        El tratamiento de datos personales se realiza conforme a la legislación vigente de
                        protección de datos personales. Al aceptar este consentimiento, autoriza el tratamiento
                        de sus datos para los fines descritos en este documento.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-bold text-foreground mb-2 text-base">6. Recomendación Clínica</h4>
                      <p>
                        Ante cualquier <strong>resultado anómalo, síntoma agudo o emergencia médica</strong>,
                        se recomienda acudir inmediatamente al servicio de urgencias más cercano.
                        Este servicio no debe utilizarse como único medio de evaluación en
                        situaciones de emergencia.
                      </p>
                    </section>

                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 mt-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed font-medium">
                          <strong>En resumen:</strong> Esta evaluación es una herramienta de tamizaje basada en IA
                          que genera estimaciones probabilísticas. No es un diagnóstico médico, no reemplaza la
                          atención profesional y no genera obligaciones para ningún prestador de salud.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Scroll hint */}
                  {!consentScrolled && (
                    <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-primary font-medium animate-bounce border-t border-border/50">
                      <ChevronDown className="w-3.5 h-3.5" />
                      Desplaza hacia abajo para continuar
                    </div>
                  )}

                  {/* Accept */}
                  <div className={`p-4 border-t border-border/50 transition-opacity ${consentScrolled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="consent"
                        checked={consent}
                        onCheckedChange={(v) => setConsent(Boolean(v))}
                        className="mt-0.5"
                      />
                      <label htmlFor="consent" className="text-sm text-foreground leading-relaxed cursor-pointer select-none">
                        He leído y comprendido el consentimiento informado. Acepto las condiciones descritas,
                        incluyendo las políticas de uso de información y privacidad.
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ═══════ STEP 2: Patient Identification ═══════ */}
        {step === 2 && (
          <div className="space-y-4">
            <AssistantBubble typing={typing}>
              <p>
                ¡Perfecto! Ahora necesito tus datos de identificación. ¿Realizas esta evaluación para
                ti mismo(a) o para otra persona como acudiente?
              </p>
            </AssistantBubble>

            {!typing && (
              <Card className="border-0 shadow-xl bg-card/90 backdrop-blur-sm">
                <CardContent className="p-5 space-y-5">
                  {/* Registration type */}
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 block">
                      ¿Para quién es la evaluación?
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => updatePatient("registration_type", "self")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          patient.registration_type === "self"
                            ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                          patient.registration_type === "self" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          <User className="w-6 h-6" />
                        </div>
                        <span className={`text-sm font-bold ${patient.registration_type === "self" ? "text-primary" : "text-muted-foreground"}`}>
                          Para mí
                        </span>
                        <span className="text-[10px] text-muted-foreground">Nombre propio</span>
                      </button>
                      <button
                        onClick={() => updatePatient("registration_type", "guardian")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          patient.registration_type === "guardian"
                            ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                          patient.registration_type === "guardian" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          <Users className="w-6 h-6" />
                        </div>
                        <span className={`text-sm font-bold ${patient.registration_type === "guardian" ? "text-primary" : "text-muted-foreground"}`}>
                          Como acudiente
                        </span>
                        <span className="text-[10px] text-muted-foreground">Para otra persona</span>
                      </button>
                    </div>
                  </div>

                  {/* Guardian data (if applicable) */}
                  {patient.registration_type === "guardian" && (
                    <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border/50">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Datos del acudiente
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="guardian_name" className="text-xs">Nombre completo del acudiente</Label>
                        <Input
                          id="guardian_name"
                          placeholder="Nombre del acudiente"
                          value={patient.guardian_name}
                          onChange={(e) => updatePatient("guardian_name", e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Tipo de documento</Label>
                          <Select value={patient.guardian_document_type} onValueChange={(v) => updatePatient("guardian_document_type", v)}>
                            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                            <SelectContent>
                              {DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="guardian_doc" className="text-xs">Número de documento</Label>
                          <Input
                            id="guardian_doc"
                            placeholder="Número"
                            value={patient.guardian_document_number}
                            onChange={(e) => updatePatient("guardian_document_number", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Parentesco / Relación</Label>
                        <Select value={patient.guardian_relationship} onValueChange={(v) => updatePatient("guardian_relationship", v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccione relación" /></SelectTrigger>
                          <SelectContent>
                            {RELATIONSHIPS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Patient data */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {patient.registration_type === "guardian" ? "Datos del paciente" : "Tus datos personales"}
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="patient_name" className="text-xs">Nombre completo</Label>
                      <Input
                        id="patient_name"
                        placeholder={patient.registration_type === "guardian" ? "Nombre del paciente" : "Tu nombre completo"}
                        value={patient.patient_name}
                        onChange={(e) => updatePatient("patient_name", e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Tipo de documento</Label>
                        <Select value={patient.patient_document_type} onValueChange={(v) => updatePatient("patient_document_type", v)}>
                          <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                          <SelectContent>
                            {DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="patient_doc" className="text-xs">Número de documento</Label>
                        <Input
                          id="patient_doc"
                          placeholder="Número"
                          value={patient.patient_document_number}
                          onChange={(e) => updatePatient("patient_document_number", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="patient_age" className="text-xs">Edad</Label>
                        <Input
                          id="patient_age"
                          type="number"
                          min={0}
                          max={120}
                          placeholder="Años"
                          value={patient.patient_age || ""}
                          onChange={(e) => updatePatient("patient_age", Number(e.target.value || 0))}
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="patient_email" className="text-xs">Correo electrónico</Label>
                        <Input
                          id="patient_email"
                          type="email"
                          placeholder="correo@ejemplo.com"
                          value={patient.patient_email}
                          onChange={(e) => updatePatient("patient_email", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="patient_phone" className="text-xs">Teléfono (opcional)</Label>
                      <Input
                        id="patient_phone"
                        type="tel"
                        placeholder="+57 300 000 0000"
                        value={patient.patient_phone}
                        onChange={(e) => updatePatient("patient_phone", e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ═══════ STEP 3: Technology Explanation ═══════ */}
        {step === 3 && (
          <div className="space-y-4">
            <AssistantBubble typing={typing}>
              <p>
                Excelente, <strong>{patient.patient_name.split(" ")[0] || "paciente"}</strong>. Antes de iniciar
                la toma, déjame explicarte en qué consiste el procedimiento.
              </p>
            </AssistantBubble>

            {!typing && (
              <>
                <Card className="border-0 shadow-xl bg-card/90 backdrop-blur-sm overflow-hidden">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Camera className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">¿En qué consiste?</h3>
                        <p className="text-xs text-muted-foreground">Tecnología rPPG + Inteligencia Artificial</p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Mediante la <strong>cámara frontal</strong> de tu dispositivo, captaremos micro-cambios en la
                      coloración de tu piel facial que reflejan el flujo sanguíneo. Con algoritmos de inteligencia
                      artificial, estimaremos parámetros como frecuencia cardíaca, saturación de oxígeno,
                      frecuencia respiratoria y más.
                    </p>

                    <div className="space-y-2">
                      {[
                        { icon: Activity, text: "El proceso dura aproximadamente 90 segundos", color: "text-primary" },
                        { icon: Sparkles, text: "Se realizan 6 fases de captura especializadas", color: "text-purple-500" },
                        { icon: Camera, text: "Necesitas buena iluminación y mantener el rostro estable", color: "text-amber-500" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40">
                          <item.icon className={`w-4 h-4 shrink-0 ${item.color}`} />
                          <span className="text-xs text-foreground font-medium">{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Critical disclaimer card */}
                <Card className="border-0 shadow-xl bg-amber-500/5 border-amber-500/20 overflow-hidden">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-5 h-5" />
                      <h4 className="font-bold font-[family-name:var(--font-space-grotesk)]">Importante: Limitaciones</h4>
                    </div>

                    <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                      <p>
                        <strong className="text-foreground">Esta evaluación NO representa una toma de signos vitales
                        convencional.</strong> Es el uso de tecnología avanzada para avanzar en tamizaje y en
                        redirección ante una probabilidad de afectación.
                      </p>
                      <p>
                        Los resultados deben ser <strong>correlacionados con un seguimiento médico profesional</strong>.
                        Las probabilidades diagnósticas son variables y <strong>no son un diagnóstico específico</strong>.
                      </p>
                      <p className="text-amber-700 dark:text-amber-300 font-medium">
                        Los resultados aquí entregados <strong>no representan una obligación de atención médica</strong> por
                        parte de ningún prestador de servicios en salud ni asegurador.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <AssistantBubble>
                  <p>
                    Si estás de acuerdo con estas condiciones, continuemos al cuestionario de tamizaje
                    para personalizar tu evaluación. 🩺
                  </p>
                </AssistantBubble>
              </>
            )}
          </div>
        )}

        {/* ═══════ STEP 4: Triage Questionnaire ═══════ */}
        {step === 4 && (
          <div className="space-y-4">
            <AssistantBubble typing={typing}>
              <p>
                Último paso antes de la toma. Necesito conocer el motivo de tu consulta y algunos
                antecedentes clínicos para orientar el análisis de IA.
              </p>
            </AssistantBubble>

            {!typing && (
              <Card className="border-0 shadow-xl bg-card/90 backdrop-blur-sm">
                <CardContent className="p-5 space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Stethoscope className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">Tamizaje Clínico</h3>
                      <p className="text-[10px] text-muted-foreground">Información para orientar el análisis</p>
                    </div>
                  </div>

                  {/* Chief complaint */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Motivo principal de consulta</Label>
                    <Select
                      value={questionnaire.chief_complaint}
                      onValueChange={(v) => setQ((p) => ({ ...p, chief_complaint: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="¿Cuál es tu motivo de consulta?" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="control_rutina">Control de rutina / Chequeo preventivo</SelectItem>
                        <SelectItem value="disnea">Dificultad para respirar (disnea)</SelectItem>
                        <SelectItem value="dolor_toracico">Dolor en el pecho</SelectItem>
                        <SelectItem value="fiebre">Fiebre</SelectItem>
                        <SelectItem value="tos">Tos persistente</SelectItem>
                        <SelectItem value="palpitaciones">Palpitaciones / Taquicardia</SelectItem>
                        <SelectItem value="mareo">Mareo / Vértigo</SelectItem>
                        <SelectItem value="fatiga">Fatiga / Cansancio extremo</SelectItem>
                        <SelectItem value="otro">Otro motivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Duration */}
                  <div className="space-y-2">
                    <Label htmlFor="duration" className="text-xs font-bold">¿Hace cuánto presenta los síntomas? (horas)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min={0}
                      placeholder="0 si no aplica"
                      value={questionnaire.duration_hours || ""}
                      onChange={(e) => setQ((p) => ({ ...p, duration_hours: Number(e.target.value || 0) }))}
                    />
                  </div>

                  {/* Symptoms */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Síntomas actuales</Label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {([
                        ["dyspnea", "Dificultad respiratoria"],
                        ["cough", "Tos"],
                        ["fever", "Fiebre"],
                        ["chest_pain", "Dolor torácico"],
                      ] as const).map(([k, label]) => (
                        <div key={k} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                          <Checkbox
                            checked={questionnaire[k]}
                            onCheckedChange={(v) => setQ((p) => ({ ...p, [k]: Boolean(v) }))}
                          />
                          <span className="text-sm text-foreground">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* History */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Antecedentes médicos</Label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {([
                        ["diabetes", "Diabetes"],
                        ["hypertension", "Hipertensión"],
                      ] as const).map(([k, label]) => (
                        <div key={k} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                          <Checkbox
                            checked={questionnaire[k]}
                            onCheckedChange={(v) => setQ((p) => ({ ...p, [k]: Boolean(v) }))}
                          />
                          <span className="text-sm text-foreground">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Fixed bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border/50 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={back} className="gap-1 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
            {step === 0 ? "Salir" : "Atrás"}
          </Button>
          <div className="flex-1" />
          <Button
            onClick={next}
            disabled={!canNext() || typing}
            className="gap-2 px-6 font-semibold shadow-lg shadow-primary/20"
          >
            {step === 4 ? (
              <>
                <Camera className="w-4 h-4" /> Iniciar Evaluación
              </>
            ) : (
              <>
                Continuar <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
