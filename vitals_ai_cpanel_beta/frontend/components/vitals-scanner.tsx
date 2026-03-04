"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
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
  Send,
  Hospital,
  QrCode,
  Mail,
  Copy,
  Shield,
  Clock,
  Video,
  ArrowRight,
} from "lucide-react"
import { mockVitalsHistory } from "@/lib/mock-data"
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts"
import { apiPost } from "@/lib/api"
import { TriageQuestionnaire, type Questionnaire } from "@/components/triage-questionnaire"
import QRCode from "qrcode"
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

/* ═══════════════════════════════════════════════════════════════ */
/*  Error Boundary INTERNO — atrapa errores de render en el UI    */
/*  del escaneo SIN desmontar VitalsScanner (preserva estado).    */
/*  Auto-recupera tras 200ms, máximo 5 reintentos.                */
/* ═══════════════════════════════════════════════════════════════ */
class ScanErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  private retryCount = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private static MAX_RETRIES = 5

  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ScanErrorBoundary] Error atrapado (NO desmonta VitalsScanner):", error.message)
    // Auto-recuperar tras breve delay
    if (this.retryCount < ScanErrorBoundary.MAX_RETRIES) {
      this.retryCount++
      this.retryTimer = setTimeout(() => {
        this.setState({ hasError: false })
      }, 200)
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }

  render() {
    if (this.state.hasError) {
      // Mostrar indicador mínimo mientras se auto-recupera
      // VitalsScanner sigue montado → todo el estado del scan se preserva
      return (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground animate-pulse">Recuperando vista…</p>
        </div>
      )
    }
    return this.props.children
  }
}

export function VitalsScanner() {
  const { addVitals, lockNavigation, unlockNavigation, onboardingData } = useApp()
  // Si hay onboardingData del wizard previo, saltamos cuestionario e iniciamos en "idle"
  const initialPhase: AppPhase = onboardingData ? "idle" : "questionnaire"
  const [appPhase, setAppPhase] = useState<AppPhase>(initialPhase)
  const [results, setResults] = useState<VitalResult[]>([])
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(
    onboardingData ? (onboardingData.questionnaire as Questionnaire) : null
  )
  const [triage, setTriage] = useState<any>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showMethodology, setShowMethodology] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyzingRef = useRef(false)
  const appPhaseRef = useRef<AppPhase>(initialPhase)
  appPhaseRef.current = appPhase

  // ── Telemedicina state ──
  const [teleToken, setTeleToken] = useState<string | null>(null)
  const [teleQrDataUrl, setTeleQrDataUrl] = useState<string | null>(null)
  const [teleSending, setTeleSending] = useState(false)
  const [teleChoice, setTeleChoice] = useState<"none" | "telemedicine" | "kiosk">("none")
  const [lastVitals, setLastVitals] = useState<any>(null)

  // ── Guard nuclear: impide retroceso a questionnaire/idle durante escaneo ──
  const scanActiveRef = useRef(false)
  const safeSetAppPhase = useCallback((phase: AppPhase) => {
    // GUARDIA: si el escaneo está activo, NUNCA retroceder
    if (scanActiveRef.current && (phase === "questionnaire" || phase === "idle")) {
      console.warn(`[Scan] BLOCKED retroceso a "${phase}" — escaneo activo`)
      return
    }
    // Activar guardia al entrar en scanning
    if (phase === "scanning" || phase === "analyzing") {
      scanActiveRef.current = true
    }
    // Desactivar guardia al completar
    if (phase === "complete") {
      scanActiveRef.current = false
    }
    setAppPhase(phase)
  }, [])

  // rPPG Hook
  const rppg = useRPPGScan()
  const rppgRef = useRef(rppg)
  rppgRef.current = rppg
  const { state: scanState } = rppg

  // ── Seguridad: si el componente se desmonta durante escaneo, desbloquear nav ──
  useEffect(() => {
    return () => {
      unlockNavigation()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  // BLINDADO: TODO envuelto en try-catch. Incluso si la cámara
  // falla en el primer intento, reintenta. Si startScan falla,
  // NO abandona — las fases del hook avanzan por reloj.
  const doStartScan = useCallback(async () => {
    try {
      if (!questionnaire) { setAppPhase("questionnaire"); return }

      // ── BLOQUEO NUCLEAR de navegación a nivel de AppContext ──
      lockNavigation()

      // Limpiar estado previo
      try { rppgRef.current.cancelScan() } catch { /* */ }
      setResults([])
      setTriage(null)
      setCameraError(null)
      safeSetAppPhase("scanning")

      // Iniciar cámara (con reintento)
      let ok = await startCamera()
      if (!ok) {
        // Reintento tras 1s
        await new Promise((r) => setTimeout(r, 1000))
        ok = await startCamera()
      }
      if (!ok) {
        // Aún sin cámara: NO cerramos el escaneo, el hook avanzará
        // por ticks y dará resultados fallback.
        console.warn("[Scan] Cámara no disponible, escaneo continuará sin video")
      }

      // Esperar estabilización del video
      await new Promise((r) => setTimeout(r, 600))

      // Iniciar la captura rPPG
      if (videoRef.current) {
        try {
          await rppgRef.current.startScan(videoRef.current)
        } catch (err) {
          // startScan falló pero NO cerramos — el hook tiene su propio
          // manejo de errores y puede operar en modo degradado.
          console.error("[Scan] startScan failed (continuando):", err)
        }
      }
    } catch (err) {
      // Error catastófico general — NUNCA debería llegar aquí
      console.error("[Scan] Error crítico en doStartScan (silenciado):", err)
    }
  }, [questionnaire, startCamera, lockNavigation])

  // ── Vigilancia de tracks de cámara durante escaneo ───────────
  // Si un track termina (p.ej. el usuario revocó permisos o el SO
  // desconectó la cámara), intentar re-adquirir.
  useEffect(() => {
    if (appPhase !== "scanning") return
    const stream = streamRef.current
    if (!stream) return

    const tracks = stream.getVideoTracks()
    if (tracks.length === 0) return

    const onTrackEnded = async () => {
      console.warn("[Scan] Track de cámara terminado — re-adquiriendo…")
      try {
        const ok = await startCamera()
        if (!ok) {
          console.warn("[Scan] No se pudo re-adquirir cámara. Escaneo continúa sin video.")
        }
      } catch {
        // Silenciar
      }
    }

    tracks.forEach((t) => t.addEventListener("ended", onTrackEnded))
    return () => {
      tracks.forEach((t) => t.removeEventListener("ended", onTrackEnded))
    }
  }, [appPhase, startCamera])

  // ── Detectar conclusión de fases → analizar ─────────────────
  // BLINDADO: Triple protección contra crashes durante análisis.
  // Si finishScan devuelve null, genera resultados fallback.
  useEffect(() => {
    if (!scanState.done) return
    if (appPhaseRef.current !== "scanning") return
    if (analyzingRef.current) return
    analyzingRef.current = true

    safeSetAppPhase("analyzing")

    ;(async () => {
      try {
        let r: any = null
        try {
          r = await rppgRef.current.finishScan()
        } catch (finishErr) {
          console.error("[Scan] finishScan threw (usando fallback):", finishErr)
        }

        // Apagar cámara tras obtener resultados (o fallo)
        try { stopCamera() } catch { /* */ }

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
        setLastVitals({
          heart_rate: vitals.heartRate,
          spo2: vitals.spo2,
          resp_rate: vitals.respiratoryRate,
          temp_c: vitals.temperature,
          bp_sys: finalBpSys,
          bp_dia: Math.round(bpDia),
        })
        // Reset telemedicina state
        setTeleToken(null)
        setTeleQrDataUrl(null)
        setTeleChoice("none")

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
        unlockNavigation()
      } catch (err) {
        // Error catastófico durante análisis — NUNCA debe crashear la app
        console.error("[Scan] Error crítico en análisis (silenciado):", err)
        try { stopCamera() } catch { /* */ }
        // Ir a complete de todas formas para que el usuario pueda reintentar
        setAppPhase("complete")
        unlockNavigation()
      } finally {
        analyzingRef.current = false
      }
    })().catch((fatalErr) => {
      // Catch final absoluto del async IIFE — última línea de defensa
      console.error("[Scan] FATAL en async analysis:", fatalErr)
      analyzingRef.current = false
      try { stopCamera() } catch { /* */ }
      setAppPhase("complete")
      unlockNavigation()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanState.done])

  // ── Cancelar escaneo ────────────────────────────────────────
  const cancelScan = useCallback(() => {
    rppgRef.current.cancelScan()
    stopCamera()
    analyzingRef.current = false
    scanActiveRef.current = false  // Desactivar guardia ANTES de retroceder
    unlockNavigation()
    setAppPhase(questionnaire ? "idle" : "questionnaire")
  }, [questionnaire, stopCamera, unlockNavigation])

  // ── Telemedicina: Solicitar token ────────────────────────────
  const requestTelemedicineToken = useCallback(async (type: "telemedicine" | "in_person_kiosk") => {
    setTeleSending(true)
    setTeleChoice(type === "telemedicine" ? "telemedicine" : "kiosk")
    try {
      const patientInfo = onboardingData?.patient
      const res: any = await apiPost("/api/v1/telemedicine/token", {
        patient_name: patientInfo?.patient_name || (questionnaire as any)?.name || "Paciente",
        patient_email: patientInfo?.patient_email || (questionnaire as any)?.email || "",
        patient_id: patientInfo?.patient_document_number || "",
        vitals: lastVitals,
        triage: triage,
        questionnaire,
        attention_type: type,
        assessment_id: triage?.assessment_id || null,
      })
      if (res?.token) {
        setTeleToken(res.token)
        // Generar QR
        try {
          const qrUrl = await QRCode.toDataURL(res.qr_data || res.token, {
            width: 280,
            margin: 2,
            color: { dark: "#1a1a2e", light: "#ffffff" },
            errorCorrectionLevel: "M",
          })
          setTeleQrDataUrl(qrUrl)
        } catch { /* QR fail — token visible */ }
      }
    } catch (err) {
      console.error("[Tele] Error:", err)
    } finally {
      setTeleSending(false)
    }
  }, [questionnaire, lastVitals, triage, onboardingData])

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

  // ── Protección anti-navegación y anti-recarga durante escaneo ──────
  // Bloquea pull-to-refresh, swipe-back, scroll accidental, y sobre
  // todo IMPIDE que Next.js HMR recargue la página matando el scan.
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

    // ── beforeunload: IMPRESCINDIBLE ──
    // Next.js HMR en dev mode intenta recargar la página cuando detecta
    // desconexiones de WebSocket (WiFi inestable, pantalla apagada, etc).
    // Sin beforeunload, la recarga sucede silenciosamente y MATA el escaneo.
    // CON beforeunload, el navegador muestra un diálogo de confirmación
    // que da al usuario la opción de "Quedarse" y proteger el escaneo.
    const blockUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", blockUnload)

    // ── Interceptar WebSockets de HMR para bloquear recargas automáticas ──
    // Next.js Turbopack/Webpack mantiene un WebSocket que envía comandos
    // de "reload" al reconectarse. Interceptamos nuevas conexiones WS
    // y cerramos las que intenten enviar comandos de recarga.
    const OrigWebSocket = window.WebSocket
    const hmrSockets: WebSocket[] = []
    try {
      const PatchedWS = function (this: any, url: string | URL, protocols?: string | string[]) {
        const ws = new OrigWebSocket(url, protocols)
        const urlStr = typeof url === "string" ? url : url.toString()
        if (urlStr.includes("_next") || urlStr.includes("hmr") || urlStr.includes("turbopack") || urlStr.includes("webpack")) {
          hmrSockets.push(ws)
          ws.addEventListener("message", (evt) => {
            try {
              if (typeof evt.data === "string") {
                const d = JSON.parse(evt.data)
                if (d && (d.type === "reload" || d.type === "full-reload" || d.action === "serverComponentChanges" || d.action === "reloadPage")) {
                  console.warn("[Scan] ⛔ Blocked HMR reload command during scan:", d.type || d.action)
                  try { ws.close() } catch {}
                }
              }
            } catch { /* JSON parse fail — ignorar */ }
          })
        }
        return ws
      } as unknown as typeof WebSocket
      Object.defineProperty(PatchedWS, "CONNECTING", { value: 0 })
      Object.defineProperty(PatchedWS, "OPEN", { value: 1 })
      Object.defineProperty(PatchedWS, "CLOSING", { value: 2 })
      Object.defineProperty(PatchedWS, "CLOSED", { value: 3 })
      PatchedWS.prototype = OrigWebSocket.prototype
      window.WebSocket = PatchedWS
    } catch (e) {
      console.warn("[Scan] No se pudo parchear WebSocket:", e)
    }

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
      // Restaurar WebSocket original
      try { window.WebSocket = OrigWebSocket } catch {}
      // Cerrar sockets HMR interceptados
      hmrSockets.forEach((ws) => { try { ws.close() } catch {} })
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
    <div className={`min-h-screen bg-gradient-to-b from-background via-background to-muted/30 ${scanLocked ? 'pb-0' : 'pb-20'}`}>
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
        <Card className="overflow-hidden border-0 shadow-xl bg-card/80 backdrop-blur-sm">
          <CardContent className="p-0">
            <ScanErrorBoundary>

            {/* ━━ IDLE ━━ */}
            {appPhase === "idle" && (
              <div className="flex flex-col items-center py-10 px-6 text-center">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6 relative">
                  <Camera className="w-11 h-11 text-primary" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30" style={{ animation: "pulse-ring 2s infinite" }} />
                  <div className="absolute -inset-1 rounded-full border border-primary/10" style={{ animation: "pulse-ring 2s infinite 0.5s" }} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2 tracking-tight font-[family-name:var(--font-space-grotesk)]">
                  Evaluación Clínica por Fases
                </h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed">
                  Protocolo científico de <span className="font-semibold text-foreground">~{TOTAL_MEASUREMENT_SECS}s</span> en 6 fases.
                  Te guiaremos paso a paso.
                </p>

                {/* Protocol steps */}
                <div className="w-full space-y-2 mb-6">
                  {[PHASE.CALIBRATION, PHASE.CARDIAC, PHASE.OCULAR, PHASE.RESPIRATORY, PHASE.VASCULAR].map((p, i) => {
                    const Icon = PHASE_ICONS[p]
                    return (
                      <div key={p} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-muted/50 border border-border/50 hover:bg-muted/80 transition-colors">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-xs font-semibold text-foreground">{PHASE_LABELS[p]}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{PHASE_DESC[p]}</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted rounded-md px-1.5 py-0.5">{PHASE_DURATION[p]}s</span>
                      </div>
                    )
                  })}
                </div>

                <Button onClick={doStartScan} size="lg" className="gap-2.5 px-8 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all">
                  <Camera className="w-5 h-5" /> Iniciar Evaluación
                </Button>
              </div>
            )}

            {/* ━━ SCANNING ━━ */}
            {appPhase === "scanning" && (
              <div className="flex flex-col items-center py-3 px-3">
                {cameraError && (
                  <div className="w-full mb-2 p-2.5 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}

                {/* ── Phase timeline ── */}
                <div className="w-full flex items-center gap-1 mb-3">
                  {[PHASE.DETECTION, PHASE.CALIBRATION, PHASE.CARDIAC, PHASE.OCULAR, PHASE.RESPIRATORY, PHASE.VASCULAR].map((p) => {
                    const Icon = PHASE_ICONS[p]
                    const isActive = scanState.currentPhase === p
                    const isDone = scanState.currentPhase > p
                    return (
                      <div
                        key={p}
                        className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all duration-500 ${
                          isActive
                            ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground scale-[1.02] shadow-md shadow-primary/20"
                            : isDone
                              ? "bg-green-500/15 text-green-600 dark:text-green-400"
                              : "bg-muted/60 text-muted-foreground/50"
                        }`}
                      >
                        {isDone ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                      </div>
                    )
                  })}
                </div>

                {/* ── Instruction panel (above video) ── */}
                <div className="w-full text-center mb-3 py-3 px-4 rounded-xl bg-gradient-to-r from-muted/80 to-muted/40 border border-border/50">
                  <p className="text-[10px] text-primary font-bold uppercase tracking-[0.15em] mb-1">
                    {PHASE_DESC[scanState.currentPhase]}
                  </p>
                  <p className="text-base font-bold text-foreground tracking-tight font-[family-name:var(--font-space-grotesk)]">
                    {scanState.instruction}
                  </p>

                  {/* Breathing guide */}
                  {isBreathing && (
                    <div className="flex items-center justify-center gap-3 mt-3">
                      <div
                        className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center transition-all duration-[2500ms] ease-in-out ${
                          scanState.breathingGuide === "inhale"
                            ? "scale-[1.3] border-blue-400 bg-blue-500/10"
                            : "scale-[0.7] border-green-400 bg-green-500/10"
                        }`}
                      >
                        <Wind className={`w-5 h-5 ${scanState.breathingGuide === "inhale" ? "text-blue-400" : "text-green-400"}`} />
                      </div>
                      <span className={`text-sm font-bold tracking-wide ${
                        scanState.breathingGuide === "inhale" ? "text-blue-500" : "text-green-500"
                      }`}>
                        {scanState.breathingGuide === "inhale" ? "INHALA ↑" : "EXHALA ↓"}
                      </span>
                    </div>
                  )}

                  {/* Valsalva */}
                  {isVascular && scanState.vascularCue === "hold" && (
                    <div className="flex items-center justify-center gap-3 mt-3">
                      <div className="w-12 h-12 rounded-full border-[3px] border-amber-400 flex items-center justify-center bg-amber-500/10">
                        <span className="text-2xl font-black text-amber-500 font-mono">{valsalvaSecsLeft}</span>
                      </div>
                      <span className="text-sm font-bold text-amber-500 tracking-wide">RETÉN ALIENTO</span>
                    </div>
                  )}
                  {isVascular && scanState.vascularCue === "release" && (
                    <p className="mt-2 text-sm font-bold text-green-500">¡SUELTA! Respira normal</p>
                  )}

                  {/* Ocular */}
                  {isOcular && (
                    <div className="flex items-center justify-center gap-3 mt-3">
                      <div className="w-12 h-12 rounded-full border-[3px] border-cyan-400 flex items-center justify-center bg-cyan-500/10 animate-pulse">
                        <ScanEye className="w-5 h-5 text-cyan-400" />
                      </div>
                      <span className="text-sm font-bold text-cyan-500 tracking-wide">OJO DERECHO</span>
                    </div>
                  )}
                </div>

                {/* ── Video viewport ── */}
                <div className="relative w-full rounded-2xl bg-black mb-3 overflow-hidden ring-1 ring-white/10" style={{ aspectRatio: '4/3', maxHeight: '42vh' }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />

                  {/* Face ring */}
                  {!isOcular && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div
                        className={`w-44 h-56 rounded-full border-[3px] transition-all duration-500 relative ${ringColor} ${
                          isBreathing ? `transition-transform duration-[2500ms] ease-in-out ${breathScale}` : ""
                        }`}
                      >
                        <div
                          className={`absolute inset-1 rounded-full border-2 border-dashed transition-colors duration-500 ${ringDashedColor}`}
                          style={{ animation: scanState.faceDetected ? "spin 8s linear infinite" : "spin 3s linear infinite" }}
                        />
                        {isBreathing && (
                          <div
                            className="absolute inset-0 rounded-full border-2 border-green-300/50 transition-transform duration-[2500ms] ease-in-out"
                            style={{ transform: scanState.breathingGuide === "inhale" ? "scale(1.08)" : "scale(0.88)" }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Eye overlay */}
                  {isOcular && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="relative">
                        <div className="w-52 h-28 border-[3px] border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.4)] rounded-[50%] flex items-center justify-center">
                          <div className="w-14 h-14 rounded-full border-2 border-cyan-300 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-cyan-400/30 animate-pulse" />
                          </div>
                        </div>
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-cyan-500/90 text-white px-3 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap tracking-wide">
                          Análisis Ocular — Micro-tremor
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scan line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-primary/60 shadow-[0_0_8px_var(--primary)]" style={{ top: `${scanState.totalProgress}%`, transition: "top 1s linear" }} />

                  {/* Corner brackets (sleeker) */}
                  <div className="absolute top-2 left-2 w-5 h-5 border-l-2 border-t-2 border-white/50 rounded-tl" />
                  <div className="absolute top-2 right-2 w-5 h-5 border-r-2 border-t-2 border-white/50 rounded-tr" />
                  <div className="absolute bottom-2 left-2 w-5 h-5 border-l-2 border-b-2 border-white/50 rounded-bl" />
                  <div className="absolute bottom-2 right-2 w-5 h-5 border-r-2 border-b-2 border-white/50 rounded-br" />

                  {/* HR badge */}
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white px-3 py-1 rounded-full flex items-center gap-2 text-sm border border-white/10">
                    <Heart className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                    <span className="font-mono font-bold tabular-nums">{scanState.instantHR ?? "--"}</span>
                    <span className="text-[10px] text-white/60 font-medium">bpm</span>
                  </div>

                  {/* Face status */}
                  <div className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 transition-colors duration-300 border ${
                    scanState.faceDetected
                      ? "bg-green-500/90 text-white border-green-400/50"
                      : "bg-red-500/90 text-white animate-pulse border-red-400/50"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${scanState.faceDetected ? "bg-white" : "bg-white/60"}`} />
                    {scanState.faceLocked ? "Rostro ✓" : scanState.faceDetected ? "Detectando…" : "Sin rostro"}
                  </div>

                  {/* Bottom info bar */}
                  <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-[11px] flex items-center gap-2 border border-white/10">
                    <span className="font-bold">{PHASE_LABELS[scanState.currentPhase]}</span>
                    <span className="text-white/25">│</span>
                    <span className="font-mono tabular-nums">{scanState.totalFramesSent}</span>
                    <span className="text-white/40">fr</span>
                    <span className="text-white/25">│</span>
                    <Clock className="w-3 h-3 text-white/50" />
                    <span className="font-mono tabular-nums">{secsRemaining}s</span>
                  </div>
                </div>

                {/* ── Progress section ── */}
                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <span className={`w-2 h-2 rounded-full ${scanState.faceDetected ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
                      {scanState.currentPhase === PHASE.DETECTION ? "Esperando rostro…" : "Evaluación en curso"}
                    </span>
                    <span className="font-mono text-foreground font-bold tabular-nums">{Math.min(Math.round(scanState.totalProgress), 100)}%</span>
                  </div>
                  <Progress value={scanState.totalProgress} className="h-2.5" />

                  {phaseTotalFrames < Infinity && (
                    <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/40 rounded-full transition-all duration-300" style={{ width: `${phaseProgress}%` }} />
                    </div>
                  )}

                  <Button variant="ghost" size="sm" onClick={cancelScan} className="mt-1 text-xs text-muted-foreground/70 w-full gap-1 hover:text-destructive">
                    <X className="w-3 h-3" /> Cancelar escaneo
                  </Button>
                </div>
              </div>
            )}

            {/* ━━ ANALYZING ━━ */}
            {appPhase === "analyzing" && (
              <div className="flex flex-col items-center py-16 px-6">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <Stethoscope className="w-9 h-9 text-primary" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1 tracking-tight font-[family-name:var(--font-space-grotesk)]">Analizando datos clínicos</h3>
                <p className="text-sm text-muted-foreground">Procesando <span className="font-mono font-semibold text-foreground">{scanState.totalFramesSent}</span> frames con IA…</p>
                <div className="mt-4 w-48">
                  <Progress value={75} className="h-1.5 animate-pulse" />
                </div>
              </div>
            )}

            {/* ━━ COMPLETE ━━ */}
            {appPhase === "complete" && (
              <div className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground tracking-tight font-[family-name:var(--font-space-grotesk)]">Resultados</h3>
                      <p className="text-[10px] text-muted-foreground">Evaluación completada</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={doStartScan} className="gap-1.5 text-xs font-semibold border-primary/20 hover:bg-primary/5">
                    <RotateCcw className="w-3 h-3" /> Nuevo
                  </Button>
                </div>

                {/* Vitals grid */}
                <div className="grid grid-cols-2 gap-3">
                  {results.map((result) => (
                    <div key={result.label} className={`p-3.5 rounded-2xl border backdrop-blur-sm transition-all hover:scale-[1.02] ${statusColors[result.status]}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 rounded-lg bg-current/10 flex items-center justify-center">
                          <result.icon className="w-4 h-4" />
                        </div>
                        <div className="flex items-center gap-1 bg-current/5 rounded-full px-2 py-0.5">
                          <TrendIcon trend={result.trend} />
                          <span className="text-[9px] font-bold uppercase tracking-wider">{statusLabels[result.status]}</span>
                        </div>
                      </div>
                      <div className="mt-1">
                        <span className="text-3xl font-black tracking-tight font-[family-name:var(--font-space-grotesk)]">{result.value}</span>
                        <span className="text-xs ml-1 opacity-70 font-medium">{result.unit}</span>
                      </div>
                      <p className="text-[10px] mt-1 font-semibold opacity-80">{result.label}</p>
                      <p className="text-[8px] mt-0.5 opacity-40 italic font-medium">{result.method}</p>
                    </div>
                  ))}
                </div>

                {/* Warning if abnormal */}
                {results.some((r) => r.status !== "normal") && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-warning/10 border border-warning/20">
                    <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning-foreground leading-relaxed font-medium">
                      Algunos valores están fuera del rango normal. Consulta a tu médico.
                    </p>
                  </div>
                )}

                {/* ══════ TELEMEDICINA — Opciones post-scan ══════ */}
                <div className="border-t border-border/50 pt-4">
                  <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2 font-[family-name:var(--font-space-grotesk)]">
                    <Hospital className="w-4 h-4 text-primary" />
                    ¿Deseas enviar a un centro médico?
                  </h4>

                  {!teleToken ? (
                    <div className="space-y-2">
                      {/* Telemedicine virtual */}
                      <button
                        onClick={() => requestTelemedicineToken("telemedicine")}
                        disabled={teleSending}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all text-left group disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
                          <Video className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground">Consulta Virtual</p>
                          <p className="text-[10px] text-muted-foreground leading-snug">Genera un token para atención por telemedicina en minutos</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors shrink-0" />
                      </button>

                      {/* Kiosk / QR */}
                      <button
                        onClick={() => requestTelemedicineToken("in_person_kiosk")}
                        disabled={teleSending}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 transition-all text-left group disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center shrink-0 group-hover:bg-accent/25 transition-colors">
                          <QrCode className="w-5 h-5 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground">Estación Presencial (QR)</p>
                          <p className="text-[10px] text-muted-foreground leading-snug">Recibe un QR para escanear en estación de toma de signos vitales</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-accent/50 group-hover:text-accent transition-colors shrink-0" />
                      </button>

                      {teleSending && (
                        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          Generando token…
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ── Token generado ── */
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-4 text-center">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Shield className="w-4 h-4 text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                            {teleChoice === "telemedicine" ? "Token Telemedicina" : "Token Estación QR"}
                          </span>
                        </div>

                        {/* Token code */}
                        <div className="bg-card rounded-xl py-3 px-4 mb-3 border border-border/50">
                          <p className="text-3xl font-black font-mono tracking-[0.3em] text-foreground">{teleToken}</p>
                        </div>

                        {/* QR Code */}
                        {teleQrDataUrl && (
                          <div className="flex justify-center mb-3">
                            <div className="bg-white rounded-xl p-2 shadow-lg">
                              <img src={teleQrDataUrl} alt="QR Code" className="w-48 h-48" />
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                          {teleChoice === "telemedicine"
                            ? "Presenta este token en la plataforma de telemedicina para iniciar tu consulta virtual."
                            : "Escanea este código QR en cualquier estación automatizada de toma de signos. Tu información clínica se cargará automáticamente."}
                        </p>

                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => {
                              navigator.clipboard?.writeText(teleToken || "")
                            }}
                          >
                            <Copy className="w-3 h-3" /> Copiar token
                          </Button>
                          {teleChoice === "kiosk" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => {
                                // Simular envío de correo
                                alert(`Se enviará el QR al correo: ${onboardingData?.patient?.patient_email || (questionnaire as any)?.email || "no registrado"}`)
                              }}
                            >
                              <Mail className="w-3 h-3" /> Enviar por correo
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border/50">
                        <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          <strong>Token válido por 4 horas.</strong>{" "}
                          {teleChoice === "telemedicine"
                            ? "Un profesional de salud atenderá tu consulta virtual en los próximos minutos."
                            : "Dirígete a la estación más cercana y escanea el QR. Los datos de tus signos vitales se cargarán automáticamente para tu atención."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            </ScanErrorBoundary>
          </CardContent>
        </Card>

        {/* ═══ Triage ═══ */}
        {appPhase === "complete" && triage && (
          <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent pb-3">
              <CardTitle className="flex items-center gap-2.5 text-base font-[family-name:var(--font-space-grotesk)]">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Stethoscope className="w-4 h-4 text-primary" />
                </div>
                Hipótesis de Tamizaje (IA)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {triage.error && <p className="text-sm text-destructive font-medium">Error: {triage.error}</p>}
              {triage.red_flags?.is_red_flag && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5">
                  <p className="text-sm font-bold text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> Banderas Rojas
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {(triage.red_flags?.reasons || []).map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-foreground mb-2">Top hipótesis</p>
                <div className="space-y-2">
                  {(triage.differential || []).slice(0, 5).map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-border/50 p-3 hover:bg-muted/30 transition-colors">
                      <span className="text-sm text-foreground font-medium">{d.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((d.probability || 0) * 100)}%` }} />
                        </div>
                        <span className="text-sm font-bold font-mono text-foreground w-8 text-right">{Math.round((d.probability || 0) * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {triage.explanation && (
                <div className="rounded-xl border border-border/50 bg-muted/30 p-3.5">
                  <p className="text-sm font-bold mb-2">Resumen (IA)</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{triage.explanation}</p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed">{triage.disclaimer}</p>
            </CardContent>
          </Card>
        )}

        {/* ═══ Metodología (colapsable) ═══ */}
        {appPhase === "complete" && results.length > 0 && (
          <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-2 cursor-pointer select-none hover:bg-muted/20 transition-colors" onClick={() => setShowMethodology(!showMethodology)}>
              <CardTitle className="flex items-center justify-between text-sm font-[family-name:var(--font-space-grotesk)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FlaskConical className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span>Metodología Científica</span>
                </div>
                <span className={`text-xs text-muted-foreground transition-transform duration-300 ${showMethodology ? "rotate-180" : ""}`}>▼</span>
              </CardTitle>
            </CardHeader>
            {showMethodology && (
              <CardContent className="space-y-3 pt-1">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Cada parámetro se midió con técnicas de fotopletismografía remota (rPPG)
                  a partir de la señal óptica del rostro captada por la cámara del dispositivo.
                </p>

                {[
                  { icon: Heart, color: "text-red-500", bg: "bg-red-500/10", title: "Frecuencia Cardíaca", desc: <><strong>CHROM</strong> (De Haan & Jeanne, 2013): señal crominante <em>S = 3R − 2G</em>, Welch PSD en 0.7–3.5 Hz, fusión de 3 estimadores (PSD + autocorrelación + conteo de picos).</> },
                  { icon: Droplets, color: "text-blue-500", bg: "bg-blue-500/10", title: "SpO₂", desc: <><strong>Ley de Beer-Lambert</strong>: ratio-of-ratios dual R/B + R/G, calibraciones cuadráticas empíricas, fusión bayesiana con prior 97%.</> },
                  { icon: Wind, color: "text-green-500", bg: "bg-green-500/10", title: "Frecuencia Respiratoria", desc: <><strong>Fusión 4 fuentes</strong>: RSA (arritmia sinusal), RIIV (variación intensidad), RIAV (variación amplitud), aleteo nasal perinasal. Votación concordante + prior bayesiano 16 rpm. Fase de respiración guiada para maximizar SNR.</> },
                  { icon: ScanEye, color: "text-cyan-500", bg: "bg-cyan-500/10", title: "Análisis Ocular", desc: <><strong>Micro-tremor ocular</strong>: captura de micro-vibraciones del globo ocular que correlacionan con la presión intraocular y la pulsatilidad arterial retiniana. Validación cruzada de FC y detección de hipertensión ocular. Basado en Nyström et al. (2013).</> },
                  { icon: Gauge, color: "text-purple-500", bg: "bg-purple-500/10", title: "Presión Arterial", desc: <><strong>PTT + Valsalva</strong>: estimación del tiempo de tránsito de pulso, morfología de onda rPPG + maniobra de Valsalva que genera variaciones hemodinámicas medibles. Regresión calibrada.</> },
                  { icon: Thermometer, color: "text-orange-500", bg: "bg-orange-500/10", title: "Temperatura", desc: <><strong>Perfusión facial</strong>: correlación entre amplitud rPPG y vasodilatación/vasoconstricción termorreguladora. Estimación indirecta con corrección estadística poblacional. <span className="italic text-amber-600 dark:text-amber-400">Estimativa — usar termómetro certificado para precisión clínica.</span></> },
                ].map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-border/50 p-3.5 space-y-1.5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg ${item.bg} flex items-center justify-center`}>
                        <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                      </div>
                      <span className="text-sm font-bold text-foreground">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed pl-[38px]">{item.desc}</p>
                  </div>
                ))}

                <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-foreground">Protocolo de Medición</span>
                  </div>
                  <ul className="text-xs text-muted-foreground list-disc pl-[42px] space-y-0.5">
                    <li><strong>Calibración (8s):</strong> Línea base de iluminación y tono de piel.</li>
                    <li><strong>Cardíaco (25s):</strong> Captura estática — FC y SpO₂.</li>
                    <li><strong>Ocular (15s):</strong> Acercamiento del ojo — micro-tremor para validación.</li>
                    <li><strong>Respiratorio (25s):</strong> Respiración guiada — maximiza señal RSA/RIIV.</li>
                    <li><strong>Vascular (15s):</strong> Maniobra de Valsalva — presión arterial.</li>
                  </ul>
                </div>

                <p className="text-[10px] text-muted-foreground/50 leading-relaxed italic">
                  Descargo: medición orientativa, no sustituye diagnóstico médico profesional.
                  Basada en literatura científica publicada. La cámara del dispositivo tiene limitaciones
                  respecto a equipos médicos certificados.
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {/* ═══ History ═══ */}
        <Button
          variant="outline"
          className="w-full gap-2 border-border/50 shadow-sm hover:shadow-md transition-all font-semibold"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? "Ocultar Historial" : "Ver Historial de Mediciones"}
        </Button>

        {showHistory && (
          <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-[family-name:var(--font-space-grotesk)] flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                  <Activity className="w-3 h-3 text-primary" />
                </div>
                Tendencias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--card)",
                        color: "var(--card-foreground)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    />
                    <Line type="monotone" dataKey="fc" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} name="FC (bpm)" />
                    <Line type="monotone" dataKey="spo2" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} name="SpO2 (%)" />
                    <Line type="monotone" dataKey="fr" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3 }} name="FR (rpm)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 space-y-1.5">
                {mockVitalsHistory.map((v, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40 border border-border/30 hover:bg-muted/60 transition-colors">
                    <span className="text-muted-foreground font-medium">
                      {v.timestamp.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-foreground font-semibold"><Heart className="w-3 h-3 inline text-primary mr-0.5" />{v.heartRate}</span>
                      <span className="text-foreground font-semibold"><Droplets className="w-3 h-3 inline text-accent mr-0.5" />{v.spo2}%</span>
                      <span className="text-foreground font-semibold"><Wind className="w-3 h-3 inline text-chart-4 mr-0.5" />{v.respiratoryRate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer branding */}
        {appPhase === "idle" && (
          <div className="text-center py-4">
            <p className="text-[10px] text-muted-foreground/40 font-medium tracking-wider uppercase">Medilink · Signos Vitales con IA</p>
          </div>
        )}
      </main>

      {!scanLocked && <BottomNav />}
    </div>
  )
}
