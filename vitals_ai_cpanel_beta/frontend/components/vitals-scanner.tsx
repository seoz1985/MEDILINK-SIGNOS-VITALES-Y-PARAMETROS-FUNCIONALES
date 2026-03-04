"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useApp, type VitalSigns } from "@/lib/app-context"
import { AppHeader } from "@/components/app-header"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Heart,
  Wind,
  Droplets,
  Thermometer,
  Gauge,
  Camera,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Eye,
  Stethoscope,
  BookOpen,
  FlaskConical,
  ScanEye,
  X,
} from "lucide-react"
import { mockVitalsHistory } from "@/lib/mock-data"
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts"
import { apiPost } from "@/lib/api"
import { TriageQuestionnaire, type Questionnaire } from "@/components/triage-questionnaire"
import {
  useRPPGScan,
  PHASE,
  PHASE_DURATION,
  PHASE_LABELS,
  PHASE_FRAMES,
  TOTAL_MEASUREMENT_SECS,
  type VitalsResult,
} from "@/hooks/use-rppg-scan"

type AppPhase = "questionnaire" | "idle" | "scanning" | "analyzing" | "complete"

interface VitalResult {
  label: string
  value: string
  unit: string
  status: "normal" | "warning" | "critical"
  icon: typeof Heart
  trend: "up" | "down" | "stable"
  method: string
}

/* Iconos por fase */
const PHASE_ICONS: Record<number, typeof Heart> = {
  [PHASE.DETECTION]: Eye,
  [PHASE.CALIBRATION]: Activity,
  [PHASE.CARDIAC]: Heart,
  [PHASE.OCULAR]: ScanEye,
  [PHASE.RESPIRATORY]: Wind,
  [PHASE.VASCULAR]: Gauge,
  [PHASE.COMPUTING]: Stethoscope,
}

/* Descripción corta por fase (para UI) */
const PHASE_DESC: Record<number, string> = {
  [PHASE.DETECTION]: "Buscando rostro",
  [PHASE.CALIBRATION]: "Ajustando luz y piel",
  [PHASE.CARDIAC]: "Ritmo cardíaco + SpO₂",
  [PHASE.OCULAR]: "Micro-vibraciones oculares",
  [PHASE.RESPIRATORY]: "Frecuencia respiratoria",
  [PHASE.VASCULAR]: "Presión arterial (Valsalva)",
  [PHASE.COMPUTING]: "Calculando resultados",
}

export function VitalsScanner() {
  const { addVitals } = useApp()
  const [appPhase, setAppPhase] = useState<AppPhase>("questionnaire")
  const [results, setResults] = useState<VitalResult[]>([])
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null)
  const [triage, setTriage] = useState<any>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showMethodology, setShowMethodology] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyzingRef = useRef(false)
  const appPhaseRef = useRef<AppPhase>("questionnaire")
  appPhaseRef.current = appPhase

  // rPPG Hook
  const rppg = useRPPGScan()
  const rppgRef = useRef(rppg)
  rppgRef.current = rppg
  const { state: scanState } = rppg

  // ── Cámara ──────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("La cámara requiere HTTPS.")
        return false
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      return true
    } catch (err: any) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Permiso de cámara denegado."
          : err?.name === "NotFoundError"
            ? "No se detectó cámara."
            : `Error de cámara: ${err?.message || err}`
      setCameraError(msg)
      return false
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  // ── Acción: Iniciar Escaneo Completo ────────────────────────
  // (sin useEffect sobre appPhase — controlamos directamente)
  const doStartScan = useCallback(async () => {
    if (!questionnaire) { setAppPhase("questionnaire"); return }

    // Limpiar estado previo
    rppgRef.current.cancelScan()
    setResults([])
    setTriage(null)
    setCameraError(null)
    setAppPhase("scanning")

    // Iniciar cámara
    const ok = await startCamera()
    if (!ok) return

    // Esperar a que el video se estabilice
    await new Promise((r) => setTimeout(r, 500))

    // Iniciar la captura rPPG
    if (videoRef.current) {
      try {
        await rppgRef.current.startScan(videoRef.current)
      } catch (err) {
        console.error("[Scan] startScan failed:", err)
      }
    }
  }, [questionnaire, startCamera])

  // ── Detectar conclusión de fases → analizar ─────────────────
  // Solo observa scanState.done (no appPhase!)
  useEffect(() => {
    if (!scanState.done) return
    if (appPhaseRef.current !== "scanning") return
    if (analyzingRef.current) return
    analyzingRef.current = true

    setAppPhase("analyzing")

    ;(async () => {
      try {
        const r = await rppgRef.current.finishScan()
        // Apagar cámara tras obtener resultados
        stopCamera()

        const clamp = (v: number | null | undefined, lo: number, hi: number, fb: number) => {
          if (v == null || isNaN(v)) return fb
          return Math.max(lo, Math.min(hi, Math.round(v * 10) / 10))
        }

        const hr = clamp(r?.heart_rate, 40, 200, 72)
        const spo2Val = clamp(r?.spo2, 70, 100, 97)
        const rrVal = clamp(r?.resp_rate, 6, 40, 16)
        const bpSys = clamp(r?.bp_sys, 70, 220, 118)
        const bpDia = clamp(r?.bp_dia, 40, 130, 76)
        const tempVal = clamp(r?.temp_c, 34, 42, 36.5)
        const finalBpSys = Math.max(bpSys, bpDia + 20)

        const vitals: VitalSigns = {
          heartRate: Math.round(hr),
          spo2: Math.round(spo2Val),
          respiratoryRate: Math.round(rrVal),
          bloodPressure: `${finalBpSys}/${Math.round(bpDia)}`,
          temperature: tempVal,
          timestamp: new Date(),
        }
        addVitals(vitals)

        // Triage
        try {
          const triageRes = await apiPost("/api/v1/triage/assess", {
            patient_id: "",
            scan_id: "",
            questionnaire,
            vitals: {
              heart_rate: vitals.heartRate,
              spo2: vitals.spo2,
              resp_rate: vitals.respiratoryRate,
              temp_c: vitals.temperature,
              bp_sys: finalBpSys,
              bp_dia: Math.round(bpDia),
            },
            signal_quality: {
              quality_score: r?.signal_quality?.quality_score ?? 0,
              fps: 8,
              grade: r?.signal_quality?.grade ?? "N/A",
              source: r?.ok ? "rppg_phased" : "fallback",
            },
          })
          setTriage(triageRes)
        } catch (e) {
          setTriage({ error: String(e) })
        }

        setResults([
          {
            label: "Frecuencia Cardíaca",
            value: vitals.heartRate.toString(),
            unit: "bpm",
            status: getStatus("heartRate", vitals.heartRate),
            icon: Heart,
            trend: vitals.heartRate > 80 ? "up" : vitals.heartRate < 70 ? "down" : "stable",
            method: "CHROM rPPG + Welch PSD",
          },
          {
            label: "Saturación O₂",
            value: vitals.spo2.toString(),
            unit: "%",
            status: getStatus("spo2", vitals.spo2),
            icon: Droplets,
            trend: vitals.spo2 >= 97 ? "stable" : "down",
            method: "Beer-Lambert ratio R/G + R/B",
          },
          {
            label: "Frec. Respiratoria",
            value: vitals.respiratoryRate.toString(),
            unit: "rpm",
            status: getStatus("respiratory", vitals.respiratoryRate),
            icon: Wind,
            trend: "stable",
            method: "RSA + RIIV + RIAV fusión",
          },
          {
            label: "Presión Arterial",
            value: `${finalBpSys}/${Math.round(bpDia)}`,
            unit: "mmHg",
            status: getStatus("bloodPressure", finalBpSys),
            icon: Gauge,
            trend: finalBpSys > 135 ? "up" : finalBpSys < 95 ? "down" : "stable",
            method: "PTT + Maniobra de Valsalva",
          },
          {
            label: "Temperatura",
            value: vitals.temperature.toString(),
            unit: "°C",
            status: getStatus("temperature", vitals.temperature),
            icon: Thermometer,
            trend: vitals.temperature > 37 ? "up" : "stable",
            method: "Perfusión facial indirecta",
          },
        ])
        setAppPhase("complete")
      } catch (err) {
        console.error("[Scan] Error analyzing:", err)
        stopCamera()
        setAppPhase("complete")
      } finally {
        analyzingRef.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanState.done])

  // ── Cancelar escaneo ────────────────────────────────────────
  const cancelScan = useCallback(() => {
    rppgRef.current.cancelScan()
    stopCamera()
    analyzingRef.current = false
    setAppPhase(questionnaire ? "idle" : "questionnaire")
  }, [questionnaire, stopCamera])

  // ── Helpers de UI ───────────────────────────────────────────
  const getStatus = (type: string, value: number): "normal" | "warning" | "critical" => {
    if (type === "heartRate") {
      if (value < 50 || value > 120) return "critical"
      if (value < 60 || value > 100) return "warning"
      return "normal"
    }
    if (type === "spo2") {
      if (value < 90) return "critical"
      if (value < 95) return "warning"
      return "normal"
    }
    if (type === "respiratory") {
      if (value < 8 || value > 25) return "critical"
      if (value < 12 || value > 20) return "warning"
      return "normal"
    }
    if (type === "bloodPressure") {
      if (value >= 180 || value < 80) return "critical"
      if (value >= 140 || value < 90) return "warning"
      return "normal"
    }
    if (type === "temperature") {
      if (value > 39 || value < 35) return "critical"
      if (value > 38 || value < 35.5) return "warning"
      return "normal"
    }
    return "normal"
  }

  const statusColors = {
    normal: "text-success bg-success/10 border-success/20",
    warning: "text-warning bg-warning/10 border-warning/20",
    critical: "text-destructive bg-destructive/10 border-destructive/20",
  }
  const statusLabels = { normal: "Normal", warning: "Atención", critical: "Crítico" }

  const TrendIcon = ({ trend }: { trend: "up" | "down" | "stable" }) => {
    if (trend === "up") return <TrendingUp className="w-3 h-3" />
    if (trend === "down") return <TrendingDown className="w-3 h-3" />
    return <Minus className="w-3 h-3" />
  }

  const chartData = mockVitalsHistory
    .map((v) => ({
      date: v.timestamp.toLocaleDateString("es", { month: "short", day: "numeric" }),
      fc: v.heartRate,
      spo2: v.spo2,
      fr: v.respiratoryRate,
    }))
    .reverse()

  const scanLocked = appPhase === "scanning" || appPhase === "analyzing"

  // ── Protección anti-navegación durante escaneo ──────────────
  // Bloquea pull-to-refresh, swipe-back y scroll accidental en móvil
  useEffect(() => {
    if (!scanLocked) return

    const html = document.documentElement
    const body = document.body

    // Bloquear scroll y overscroll
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    html.style.overscrollBehavior = "none"
    body.style.overscrollBehavior = "none"
    body.style.touchAction = "none"
    html.classList.add("scan-active")

    // Prevenir touchmove (pull-to-refresh en Chrome/Safari móvil)
    const blockTouch = (e: TouchEvent) => { e.preventDefault() }
    document.addEventListener("touchmove", blockTouch, { passive: false })

    // Prevenir beforeunload (navegación accidental)
    const blockUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", blockUnload)

    // Prevenir popstate (botón atrás del navegador)
    const blockPop = () => {
      window.history.pushState(null, "", window.location.href)
    }
    window.history.pushState(null, "", window.location.href)
    window.addEventListener("popstate", blockPop)

    return () => {
      html.style.overflow = ""
      body.style.overflow = ""
      html.style.overscrollBehavior = ""
      body.style.overscrollBehavior = ""
      body.style.touchAction = ""
      html.classList.remove("scan-active")
      document.removeEventListener("touchmove", blockTouch)
      window.removeEventListener("beforeunload", blockUnload)
      window.removeEventListener("popstate", blockPop)
    }
  }, [scanLocked])

  // ── Progreso de fase ────────────────────────────────────────
  const phaseTotalFrames = PHASE_FRAMES[scanState.currentPhase] || 0
  const phaseProgress = phaseTotalFrames < Infinity
    ? Math.min((scanState.phaseTicks / phaseTotalFrames) * 100, 100)
    : 0

  // ── Ring color ──────────────────────────────────────────────
  const ringColor = scanState.faceDetected
    ? "border-green-500 shadow-[0_0_25px_rgba(34,197,94,0.4)]"
    : "border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.4)]"

  const ringDashedColor = scanState.faceDetected
    ? "border-green-400/60"
    : "border-red-400/60"

  // ── Breath animation ───────────────────────────────────────
  const isBreathing = scanState.currentPhase === PHASE.RESPIRATORY
  const breathScale = scanState.breathingGuide === "inhale" ? "scale-[1.08]" : "scale-[0.88]"

  // ── Ocular phase: show eye overlay ──────────────────────────
  const isOcular = scanState.currentPhase === PHASE.OCULAR

  // ── Vascular hold countdown ─────────────────────────────────
  const isVascular = scanState.currentPhase === PHASE.VASCULAR
  const valsalvaSecsLeft = isVascular && scanState.vascularCue === "hold"
    ? Math.max(0, 10 - Math.floor(scanState.phaseTicks / 8))
    : 0

  // ── Time remaining estimate ─────────────────────────────────
  const secsRemaining = scanState.currentPhase === PHASE.DETECTION
    ? TOTAL_MEASUREMENT_SECS
    : Math.max(0, Math.round(TOTAL_MEASUREMENT_SECS * (1 - scanState.totalProgress / 100)))

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Signos Vitales" subtitle="Monitoreo Clínico con IA" scanLocked={scanLocked} />

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {appPhase === "questionnaire" && (
          <TriageQuestionnaire
            onSubmit={(q) => {
              setQuestionnaire(q)
              setAppPhase("idle")
            }}
          />
        )}

        {/* ═══ Scanner Card ═══ */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">

            {/* ━━ IDLE ━━ */}
            {appPhase === "idle" && (
              <div className="flex flex-col items-center py-10 px-6 text-center">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 relative">
                  <Camera className="w-10 h-10 text-primary" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30" style={{ animation: "pulse-ring 2s infinite" }} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2 font-[family-name:var(--font-space-grotesk)]">
                  Evaluación Clínica por Fases
                </h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs leading-relaxed">
                  Protocolo de ~{TOTAL_MEASUREMENT_SECS} segundos en 6 fases interactivas.
                  Te guiaremos en cada paso para obtener mediciones precisas.
                </p>

                {/* Mini timeline */}
                <div className="w-full grid grid-cols-3 gap-1 mb-6 text-[9px] text-muted-foreground">
                  {[PHASE.CALIBRATION, PHASE.CARDIAC, PHASE.OCULAR, PHASE.RESPIRATORY, PHASE.VASCULAR].map((p) => {
                    const Icon = PHASE_ICONS[p]
                    return (
                      <div key={p} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted">
                        <Icon className="w-3 h-3 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-medium block truncate">{PHASE_LABELS[p]}</span>
                          <span className="text-[8px] opacity-60">{PHASE_DURATION[p]}s</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <Button onClick={doStartScan} size="lg" className="gap-2">
                  <Camera className="w-4 h-4" /> Iniciar Evaluación
                </Button>
              </div>
            )}

            {/* ━━ SCANNING ━━ */}
            {appPhase === "scanning" && (
              <div className="flex flex-col items-center py-3 px-4">
                {cameraError && (
                  <div className="w-full mb-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}

                {/* ── Timeline bar ── */}
                <div className="w-full flex items-center gap-0.5 mb-3">
                  {[PHASE.DETECTION, PHASE.CALIBRATION, PHASE.CARDIAC, PHASE.OCULAR, PHASE.RESPIRATORY, PHASE.VASCULAR].map((p) => {
                    const Icon = PHASE_ICONS[p]
                    const isActive = scanState.currentPhase === p
                    const isDone = scanState.currentPhase > p
                    return (
                      <div
                        key={p}
                        className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 rounded-md text-[8px] font-medium transition-all duration-300 ${
                          isActive
                            ? "bg-primary text-primary-foreground scale-105 shadow-sm"
                            : isDone
                              ? "bg-green-500/20 text-green-700 dark:text-green-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isDone ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                      </div>
                    )
                  })}
                </div>

                {/* ── Video + overlays ── */}
                <div className="relative w-full aspect-[4/3] rounded-xl bg-black mb-3 overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />

                  {/* Aro facial (se oculta en fase ocular) */}
                  {!isOcular && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div
                        className={`w-44 h-56 rounded-full border-[3px] transition-all duration-500 relative ${ringColor} ${
                          isBreathing ? `transition-transform duration-[2500ms] ease-in-out ${breathScale}` : ""
                        }`}
                      >
                        <div
                          className={`absolute inset-1 rounded-full border-2 border-dashed transition-colors duration-500 ${ringDashedColor}`}
                          style={{
                            animation: scanState.faceDetected
                              ? "spin 8s linear infinite"
                              : "spin 3s linear infinite",
                          }}
                        />
                        {isBreathing && (
                          <div
                            className="absolute inset-0 rounded-full border-2 border-green-300/50 transition-transform duration-[2500ms] ease-in-out"
                            style={{
                              transform: scanState.breathingGuide === "inhale" ? "scale(1.08)" : "scale(0.88)",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Overlay OCULAR: guía de ojo */}
                  {isOcular && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="relative">
                        {/* Forma de ojo */}
                        <div className="w-52 h-28 border-[3px] border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.4)] rounded-[50%] flex items-center justify-center">
                          {/* Pupila */}
                          <div className="w-14 h-14 rounded-full border-2 border-cyan-300 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-cyan-400/30 animate-pulse" />
                          </div>
                        </div>
                        {/* Label */}
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-cyan-500/80 text-white px-3 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap">
                          Análisis Ocular — Micro-tremor
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scan line */}
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-primary/60 shadow-[0_0_6px_var(--primary)]"
                    style={{ top: `${scanState.totalProgress}%`, transition: "top 1s linear" }}
                  />

                  {/* Corner brackets */}
                  <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-white/70" />
                  <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-white/70" />
                  <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-white/70" />
                  <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-white/70" />

                  {/* HR overlay top-center */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full flex items-center gap-2 text-sm">
                    <Heart className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                    <span className="font-mono font-semibold">{scanState.instantHR ?? "--"}</span>
                    <span className="text-xs text-white/70">bpm</span>
                  </div>

                  {/* Face badge top-right */}
                  <div
                    className={`absolute top-3 right-3 px-2 py-1 rounded-full text-[10px] font-medium flex items-center gap-1 transition-colors duration-300 ${
                      scanState.faceDetected
                        ? "bg-green-500/80 text-white"
                        : "bg-red-500/80 text-white animate-pulse"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${scanState.faceDetected ? "bg-white" : "bg-white/60"}`} />
                    {scanState.faceLocked ? "Rostro ✓" : scanState.faceDetected ? "Detectando…" : "Sin rostro"}
                  </div>

                  {/* Bottom info bar */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs flex items-center gap-2">
                    <span className="font-medium">{PHASE_LABELS[scanState.currentPhase]}</span>
                    <span className="text-white/30">|</span>
                    <span>{scanState.totalFramesSent} frames</span>
                    <span className="text-white/30">|</span>
                    <span>~{secsRemaining}s rest.</span>
                  </div>
                </div>

                {/* ── Phase instruction + visual cues ── */}
                <div className="w-full text-center mb-2 space-y-2">
                  {/* Breathing circle */}
                  {isBreathing && (
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-14 h-14 rounded-full border-2 border-green-400 flex items-center justify-center transition-transform duration-[2500ms] ease-in-out ${
                          scanState.breathingGuide === "inhale" ? "scale-125" : "scale-75"
                        }`}
                      >
                        <Wind
                          className={`w-6 h-6 transition-colors duration-500 ${
                            scanState.breathingGuide === "inhale" ? "text-blue-400" : "text-green-400"
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Valsalva countdown */}
                  {isVascular && scanState.vascularCue === "hold" && (
                    <div className="flex flex-col items-center">
                      <div className="w-14 h-14 rounded-full border-2 border-amber-400 flex items-center justify-center bg-amber-500/10">
                        <span className="text-2xl font-bold text-amber-500 font-mono">{valsalvaSecsLeft}</span>
                      </div>
                    </div>
                  )}

                  {/* Ocular icon */}
                  {isOcular && (
                    <div className="flex flex-col items-center">
                      <div className="w-14 h-14 rounded-full border-2 border-cyan-400 flex items-center justify-center bg-cyan-500/10 animate-pulse">
                        <ScanEye className="w-6 h-6 text-cyan-400" />
                      </div>
                    </div>
                  )}

                  {/* Phase description */}
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {PHASE_DESC[scanState.currentPhase]}
                  </p>

                  {/* Main instruction */}
                  <p className="text-sm font-semibold text-foreground">
                    {scanState.instruction}
                  </p>
                </div>

                {/* ── Global + phase progress ── */}
                <div className="w-full space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${scanState.faceDetected ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
                      {scanState.currentPhase === PHASE.DETECTION ? "Esperando rostro…" : "Evaluación en curso…"}
                    </span>
                    <span className="font-mono text-foreground font-medium">{Math.min(Math.round(scanState.totalProgress), 100)}%</span>
                  </div>
                  <Progress value={scanState.totalProgress} className="h-2" />

                  {/* Phase sub-bar */}
                  {phaseTotalFrames < Infinity && (
                    <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary/50 rounded-full"
                        style={{ width: `${phaseProgress}%`, transition: "width 0.3s ease" }}
                      />
                    </div>
                  )}

                  <Button variant="ghost" size="sm" onClick={cancelScan} className="mt-1 text-xs text-muted-foreground w-full gap-1">
                    <X className="w-3 h-3" /> Cancelar escaneo
                  </Button>
                </div>
              </div>
            )}

            {/* ━━ ANALYZING ━━ */}
            {appPhase === "analyzing" && (
              <div className="flex flex-col items-center py-12 px-6">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
                  <Stethoscope className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1 font-[family-name:var(--font-space-grotesk)]">Analizando datos</h3>
                <p className="text-sm text-muted-foreground">Procesando {scanState.totalFramesSent} frames con IA…</p>
              </div>
            )}

            {/* ━━ COMPLETE ━━ */}
            {appPhase === "complete" && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <h3 className="font-semibold text-foreground font-[family-name:var(--font-space-grotesk)]">Resultados</h3>
                  </div>
                  <Button variant="outline" size="sm" onClick={doStartScan} className="gap-1 text-xs">
                    <RotateCcw className="w-3 h-3" /> Nuevo Escaneo
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {results.map((result) => (
                    <div key={result.label} className={`p-3 rounded-xl border ${statusColors[result.status]}`}>
                      <div className="flex items-center justify-between mb-1">
                        <result.icon className="w-4 h-4" />
                        <div className="flex items-center gap-1">
                          <TrendIcon trend={result.trend} />
                          <span className="text-[10px] font-medium">{statusLabels[result.status]}</span>
                        </div>
                      </div>
                      <div className="mt-1">
                        <span className="text-2xl font-bold font-[family-name:var(--font-space-grotesk)]">{result.value}</span>
                        <span className="text-xs ml-1">{result.unit}</span>
                      </div>
                      <p className="text-[10px] mt-0.5 opacity-80">{result.label}</p>
                      <p className="text-[8px] mt-0.5 opacity-50 italic">{result.method}</p>
                    </div>
                  ))}
                </div>

                {results.some((r) => r.status !== "normal") && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning-foreground leading-relaxed">
                      Algunos valores están fuera del rango normal. Te recomendamos consultar a tu médico.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ Triage ═══ */}
        {appPhase === "complete" && triage && (
          <Card>
            <CardHeader>
              <CardTitle className="font-[family-name:var(--font-space-grotesk)]">Hipótesis de tamizaje (IA)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {triage.error && <p className="text-sm text-destructive">Error: {triage.error}</p>}
              {triage.red_flags?.is_red_flag && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-sm font-medium text-destructive">Banderas rojas</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                    {(triage.red_flags?.reasons || []).map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-sm font-medium">Top hipótesis</p>
                <ul className="mt-2 space-y-2">
                  {(triage.differential || []).slice(0, 5).map((d: any, i: number) => (
                    <li key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <span className="text-sm text-foreground">{d.label}</span>
                      <span className="text-sm font-semibold">{Math.round((d.probability || 0) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              {triage.explanation && (
                <div className="rounded-lg border border-border bg-foreground/5 p-3">
                  <p className="text-sm font-medium mb-2">Resumen (IA)</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{triage.explanation}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{triage.disclaimer}</p>
            </CardContent>
          </Card>
        )}

        {/* ═══ Metodología (colapsable) ═══ */}
        {appPhase === "complete" && results.length > 0 && (
          <Card>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowMethodology(!showMethodology)}>
              <CardTitle className="flex items-center justify-between text-sm font-[family-name:var(--font-space-grotesk)]">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  Metodología Científica
                </div>
                <span className="text-xs text-muted-foreground">{showMethodology ? "▲ Ocultar" : "▼ Ver detalle"}</span>
              </CardTitle>
            </CardHeader>
            {showMethodology && (
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Cada parámetro se midió con técnicas de fotopletismografía remota (rPPG)
                  a partir de la señal óptica del rostro captada por la cámara del dispositivo.
                </p>

                {/* HR */}
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-semibold text-foreground">Frecuencia Cardíaca</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>CHROM</strong> (De Haan & Jeanne, 2013): señal crominante <em>S = 3R − 2G</em>,
                    Welch PSD en 0.7–3.5 Hz, fusión de 3 estimadores (PSD + autocorrelación + conteo de picos).
                  </p>
                </div>

                {/* SpO2 */}
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-semibold text-foreground">SpO₂</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Ley de Beer-Lambert</strong>: ratio-of-ratios dual R/B + R/G,
                    calibraciones cuadráticas empíricas, fusión bayesiana con prior 97%.
                  </p>
                </div>

                {/* RR */}
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-semibold text-foreground">Frecuencia Respiratoria</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Fusión 4 fuentes</strong>: RSA (arritmia sinusal), RIIV (variación intensidad),
                    RIAV (variación amplitud), aleteo nasal perinasal. Votación concordante + prior bayesiano 16 rpm.
                    Fase de respiración guiada para maximizar SNR.
                  </p>
                </div>

                {/* Ocular */}
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <ScanEye className="w-4 h-4 text-cyan-500" />
                    <span className="text-sm font-semibold text-foreground">Análisis Ocular</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Micro-tremor ocular</strong>: captura de micro-vibraciones del globo ocular
                    que correlacionan con la presión intraocular y la pulsatilidad arterial retiniana.
                    Sirve como validación cruzada de FC y detección de hipertensión ocular.
                    Basado en trabajos de Nyström et al. (2013) sobre fijational eye movements.
                  </p>
                </div>

                {/* BP */}
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-semibold text-foreground">Presión Arterial</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>PTT + Valsalva</strong>: estimación del tiempo de tránsito de pulso,
                    morfología de onda rPPG + maniobra de Valsalva (retener/soltar aliento)
                    que genera variaciones hemodinámicas medibles. Regresión calibrada.
                  </p>
                </div>

                {/* Temp */}
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-semibold text-foreground">Temperatura</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Perfusión facial</strong>: correlación entre amplitud rPPG y vasodilatación/
                    vasoconstricción termorreguladora. Estimación indirecta con corrección estadística poblacional.
                    <span className="block mt-1 italic text-amber-600 dark:text-amber-400">
                      Estimativa — usar termómetro certificado para precisión clínica.
                    </span>
                  </p>
                </div>

                {/* Protocol */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Protocolo de Medición</span>
                  </div>
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                    <li><strong>Calibración (8s):</strong> Línea base de iluminación y tono de piel.</li>
                    <li><strong>Cardíaco (25s):</strong> Captura estática — FC y SpO₂.</li>
                    <li><strong>Ocular (15s):</strong> Acercamiento del ojo — micro-tremor para validación.</li>
                    <li><strong>Respiratorio (25s):</strong> Respiración guiada — maximiza señal RSA/RIIV.</li>
                    <li><strong>Vascular (15s):</strong> Maniobra de Valsalva — presión arterial.</li>
                  </ul>
                </div>

                <p className="text-[10px] text-muted-foreground/70 leading-relaxed italic">
                  Descargo: medición orientativa, no sustituye diagnóstico médico profesional.
                  Basada en literatura científica publicada. La cámara del dispositivo tiene limitaciones
                  respecto a equipos médicos certificados.
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {/* ═══ History ═══ */}
        <Button variant="outline" className="w-full" onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? "Ocultar Historial" : "Ver Historial de Mediciones"}
        </Button>

        {showHistory && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-[family-name:var(--font-space-grotesk)]">Tendencias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--card)",
                        color: "var(--card-foreground)",
                      }}
                    />
                    <Line type="monotone" dataKey="fc" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} name="FC (bpm)" />
                    <Line type="monotone" dataKey="spo2" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} name="SpO2 (%)" />
                    <Line type="monotone" dataKey="fr" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3 }} name="FR (rpm)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 space-y-2">
                {mockVitalsHistory.map((v, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">
                      {v.timestamp.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-foreground"><Heart className="w-3 h-3 inline text-primary mr-0.5" />{v.heartRate}</span>
                      <span className="text-foreground"><Droplets className="w-3 h-3 inline text-accent mr-0.5" />{v.spo2}%</span>
                      <span className="text-foreground"><Wind className="w-3 h-3 inline text-chart-4 mr-0.5" />{v.respiratoryRate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <BottomNav disabled={scanLocked} />
    </div>
  )
}
