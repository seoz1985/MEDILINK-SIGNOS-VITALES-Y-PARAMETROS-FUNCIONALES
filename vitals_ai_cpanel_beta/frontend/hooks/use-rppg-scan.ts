/**
 * Hook rPPG — protocolo clínico interactivo por fases.
 *
 * ESTABILIDAD MÁXIMA:
 * - Progresión basada en TICKS del interval (no en frames enviados)
 *   → las fases avanzan aunque el backend sea lento o falle.
 * - sendingRef con auto-reset de 4 s para evitar bloqueos.
 * - TODO el body del interval envuelto en try-catch.
 * - setState limitado a ~4 Hz para reducir re-renders.
 * - stoppedRef como llave maestra para detener todo.
 *
 * Fases:
 *   0 – DETECTION    : rostro estable (aro ROJO → VERDE)
 *   1 – CALIBRATION  : baseline iluminación + tono de piel  (~8 s)
 *   2 – CARDIAC      : HR + SpO2, paciente quieto           (~25 s)
 *   3 – OCULAR       : acercar ojo derecho, micro-vibraciones(~15 s)
 *   4 – RESPIRATORY  : respiración guiada inhalar/exhalar    (~25 s)
 *   5 – VASCULAR     : retener aliento + soltar (Valsalva)   (~15 s)
 *   6 – COMPUTING    : procesando resultados
 *
 * Total medición: ~88 s (~1.5 min) tras detectar rostro.
 */

import { useRef, useCallback, useState, useEffect } from "react"
import { API_BASE } from "@/lib/api"

/* ═══════════════════════════════════════════════════════════════ */
/*  Constantes de fase                                            */
/* ═══════════════════════════════════════════════════════════════ */
export const PHASE = {
  DETECTION: 0,
  CALIBRATION: 1,
  CARDIAC: 2,
  OCULAR: 3,
  RESPIRATORY: 4,
  VASCULAR: 5,
  COMPUTING: 6,
} as const
export type PhaseId = (typeof PHASE)[keyof typeof PHASE]

const FPS = 8
const TICK_MS = Math.round(1000 / FPS) // 125 ms

/**
 * TICKS (no frames enviados) que dura cada fase.
 * DETECTION es Infinity porque depende de face-lock.
 */
export const PHASE_FRAMES: Record<number, number> = {
  [PHASE.DETECTION]: Infinity,
  [PHASE.CALIBRATION]: FPS * 8,   // 64  ticks = 8 s
  [PHASE.CARDIAC]: FPS * 25,      // 200 ticks = 25 s
  [PHASE.OCULAR]: FPS * 15,       // 120 ticks = 15 s
  [PHASE.RESPIRATORY]: FPS * 25,  // 200 ticks = 25 s
  [PHASE.VASCULAR]: FPS * 15,     // 120 ticks = 15 s
}

const TOTAL_ACTIVE_TICKS =
  PHASE_FRAMES[PHASE.CALIBRATION] +
  PHASE_FRAMES[PHASE.CARDIAC] +
  PHASE_FRAMES[PHASE.OCULAR] +
  PHASE_FRAMES[PHASE.RESPIRATORY] +
  PHASE_FRAMES[PHASE.VASCULAR]

export const TOTAL_MEASUREMENT_SECS = Math.round(TOTAL_ACTIVE_TICKS / FPS)

/** Duración estimada en segundos por fase (para UI) */
export const PHASE_DURATION: Record<number, number> = {
  [PHASE.DETECTION]: 0,
  [PHASE.CALIBRATION]: 8,
  [PHASE.CARDIAC]: 25,
  [PHASE.OCULAR]: 15,
  [PHASE.RESPIRATORY]: 25,
  [PHASE.VASCULAR]: 15,
}

export const PHASE_LABELS: Record<number, string> = {
  [PHASE.DETECTION]: "Detección",
  [PHASE.CALIBRATION]: "Calibración",
  [PHASE.CARDIAC]: "Cardíaco",
  [PHASE.OCULAR]: "Ocular",
  [PHASE.RESPIRATORY]: "Respiratorio",
  [PHASE.VASCULAR]: "Vascular",
  [PHASE.COMPUTING]: "Procesando",
}

export const PHASE_INSTRUCTIONS: Record<number, string> = {
  [PHASE.DETECTION]: "Centra tu rostro en el óvalo",
  [PHASE.CALIBRATION]: "Calibrando iluminación y tono de piel…",
  [PHASE.CARDIAC]: "Permanece quieto, respira con normalidad",
  [PHASE.OCULAR]: "Acerca tu OJO DERECHO a la cámara",
  [PHASE.RESPIRATORY]: "Inhala profundo…",
  [PHASE.VASCULAR]: "Retén el aliento…",
  [PHASE.COMPUTING]: "Calculando tus signos vitales…",
}

const FACE_LOCK_NEEDED = 5
const BREATH_HALF_TICKS = Math.round(FPS * 2.5) // 20 ticks = 2.5 s
const VALSALVA_HOLD_TICKS = FPS * 10            // 80 ticks = 10 s
const SENDING_TIMEOUT_MS = 4000                  // auto-reset sendingRef tras 4 s

/* ═══════════════════════════════════════════════════════════════ */
/*  Tipos                                                         */
/* ═══════════════════════════════════════════════════════════════ */
export interface PhasedScanState {
  sessionId: string | null
  isScanning: boolean
  currentPhase: PhaseId
  phaseTicks: number
  totalFramesSent: number
  totalProgress: number
  faceDetected: boolean
  faceLocked: boolean
  instantHR: number | null
  breathingGuide: "inhale" | "exhale" | null
  vascularCue: "hold" | "release" | null
  instruction: string
  error: string | null
  done: boolean
}

export interface VitalsResult {
  ok: boolean
  heart_rate: number | null
  spo2: number | null
  resp_rate: number | null
  bp_sys: number | null
  bp_dia: number | null
  temp_c: number | null
  signal_quality: {
    quality_score: number
    snr_db: number
    face_detection_rate: number
    sample_completeness: number
    grade: string
  }
  total_frames: number
  face_detected_frames: number
  buffer_samples: number
  error?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Estado inicial                                                */
/* ═══════════════════════════════════════════════════════════════ */
function initialState(): PhasedScanState {
  return {
    sessionId: null,
    isScanning: false,
    currentPhase: PHASE.DETECTION as PhaseId,
    phaseTicks: 0,
    totalFramesSent: 0,
    totalProgress: 0,
    faceDetected: false,
    faceLocked: false,
    instantHR: null,
    breathingGuide: null,
    vascularCue: null,
    instruction: PHASE_INSTRUCTIONS[PHASE.DETECTION],
    error: null,
    done: false,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Orden de fases                                                */
/* ═══════════════════════════════════════════════════════════════ */
const PHASE_ORDER: PhaseId[] = [
  PHASE.DETECTION as PhaseId,
  PHASE.CALIBRATION as PhaseId,
  PHASE.CARDIAC as PhaseId,
  PHASE.OCULAR as PhaseId,
  PHASE.RESPIRATORY as PhaseId,
  PHASE.VASCULAR as PhaseId,
  PHASE.COMPUTING as PhaseId,
]

function nextPhaseAfter(p: PhaseId): PhaseId {
  const idx = PHASE_ORDER.indexOf(p)
  return idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : (PHASE.COMPUTING as PhaseId)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Computar instrucciones + cues basándose en ticks              */
/* ═══════════════════════════════════════════════════════════════ */
function computePhaseUI(phase: PhaseId, ticks: number) {
  let instruction = PHASE_INSTRUCTIONS[phase] || ""
  let breathingGuide: "inhale" | "exhale" | null = null
  let vascularCue: "hold" | "release" | null = null

  if (phase === PHASE.RESPIRATORY) {
    const cycle = Math.floor(ticks / BREATH_HALF_TICKS) % 2
    if (cycle === 0) {
      breathingGuide = "inhale"
      instruction = "Inhala profundo…"
    } else {
      breathingGuide = "exhale"
      instruction = "Exhala lentamente…"
    }
  }

  if (phase === PHASE.VASCULAR) {
    if (ticks < VALSALVA_HOLD_TICKS) {
      vascularCue = "hold"
      const secsLeft = Math.max(0, Math.ceil((VALSALVA_HOLD_TICKS - ticks) / FPS))
      instruction = `Retén el aliento… ${secsLeft}s`
    } else {
      vascularCue = "release"
      instruction = "¡Suelta! Respira con normalidad"
    }
  }

  if (phase === PHASE.OCULAR) {
    const sec = Math.floor(ticks / FPS)
    if (sec < 3) {
      instruction = "Acerca tu OJO DERECHO a la cámara"
    } else if (sec < 10) {
      instruction = "Mantén el ojo quieto, analizando micro-vibraciones…"
    } else {
      instruction = "Análisis ocular completado ✓"
    }
  }

  return { instruction, breathingGuide, vascularCue }
}

/** Garantiza que un valor es un número finito o devuelve null */
function safeNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Hook                                                          */
/* ═══════════════════════════════════════════════════════════════ */
export function useRPPGScan() {
  const [state, setState] = useState<PhasedScanState>(initialState())

  const sessionIdRef = useRef<string | null>(null)
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // ── Sending gate con auto-reset ──
  const sendingRef = useRef(false)
  const sendingStartRef = useRef(0)

  const stoppedRef = useRef(true)
  const faceConsecRef = useRef(0)
  const phaseRef = useRef<PhaseId>(PHASE.DETECTION as PhaseId)
  const phaseTicksRef = useRef(0)
  const totalSentRef = useRef(0)
  const activeTicksRef = useRef(0)
  const lastUIRef = useRef(0) // timestamp del último setState (para throttle)
  const latestHRRef = useRef<number | null>(null)

  /* ── Canvas helper ─────────────────────────────────────────── */
  const getCanvas = useCallback(() => {
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas")
    return canvasRef.current
  }, [])

  const captureFrame = useCallback(
    (video: HTMLVideoElement): string | null => {
      try {
        if (!video.videoWidth || !video.videoHeight) return null
        const c = getCanvas()
        c.width = 320
        c.height = 240
        const ctx = c.getContext("2d")
        if (!ctx) return null
        ctx.drawImage(video, 0, 0, 320, 240)
        return c.toDataURL("image/jpeg", 0.6)
      } catch {
        return null
      }
    },
    [getCanvas],
  )

  /* ── Stop capture interval ─────────────────────────────────── */
  const stopCapture = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current)
      captureIntervalRef.current = null
    }
  }, [])

  /* ── Enviar frame al backend (no bloquea el tick) ──────────── */
  const sendFrameToBackend = useCallback(
    async (sid: string, frameData: string, phase: number): Promise<Record<string, unknown> | null> => {
      // Auto-reset sendingRef si lleva >4 s bloqueado
      if (sendingRef.current) {
        if (Date.now() - sendingStartRef.current > SENDING_TIMEOUT_MS) {
          sendingRef.current = false
        } else {
          return null // aún esperando respuesta anterior
        }
      }

      sendingRef.current = true
      sendingStartRef.current = Date.now()

      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 5000) // timeout 5 s por frame

        const res = await fetch(`${API_BASE}/api/v1/scan/frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid, frame: frameData, phase }),
          signal: ctrl.signal,
        })
        clearTimeout(timer)

        const data = await res.json()
        return data as Record<string, unknown>
      } catch {
        return null
      } finally {
        sendingRef.current = false
      }
    },
    [],
  )

  /* ── Iniciar escaneo ───────────────────────────────────────── */
  const startScan = useCallback(
    async (video: HTMLVideoElement) => {
      // Limpiar cualquier intervalo anterior
      stopCapture()

      // Reset de refs
      stoppedRef.current = false
      faceConsecRef.current = 0
      phaseRef.current = PHASE.DETECTION as PhaseId
      phaseTicksRef.current = 0
      totalSentRef.current = 0
      activeTicksRef.current = 0
      sendingRef.current = false
      sendingStartRef.current = 0
      lastUIRef.current = 0
      latestHRRef.current = null

      setState({ ...initialState(), isScanning: true })

      // Crear sesión backend
      let sid = ""
      try {
        const ctrl = new AbortController()
        const to = setTimeout(() => ctrl.abort(), 10000)
        const res = await fetch(`${API_BASE}/api/v1/scan/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fps: FPS, duration_seconds: 150 }),
          signal: ctrl.signal,
        })
        clearTimeout(to)
        const data = await res.json()
        sid = data.session_id || ""
        sessionIdRef.current = sid
        setState((p) => ({ ...p, sessionId: sid }))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn("[rPPG] start error:", msg)
      }

      /* ────────────────────────────────────────────────────────
       * LOOP PRINCIPAL: un solo setInterval, cero timers extra.
       *
       * CLAVE DE ESTABILIDAD:
       * 1. phaseTicksRef se incrementa en CADA tick —
       *    las fases avanzan con el reloj, no con la red.
       * 2. El envío de frame es fire-and-forget (no await) —
       *    no bloquea el tick.
       * 3. Todo envuelto en try-catch — NUNCA puede lanzar.
       * 4. setState throttled a 4 Hz.
       * ──────────────────────────────────────────────────────── */
      captureIntervalRef.current = setInterval(() => {
        // === LLAVE MAESTRA: si se detuvo, no hacer nada ===
        if (stoppedRef.current) return

        // TODO envuelto en try-catch
        try {
          const cp = phaseRef.current
          if (cp === (PHASE.COMPUTING as PhaseId)) return

          // ── Enviar frame (fire-and-forget, NO bloquea) ──
          const frame = captureFrame(video)
          if (frame && sid) {
            sendFrameToBackend(sid, frame, cp).then((result) => {
              try {
                if (!result || stoppedRef.current) return

                // Face detection
                const detected = result.face_detected === true
                if (detected) faceConsecRef.current++
                else faceConsecRef.current = Math.max(0, faceConsecRef.current - 1)

                totalSentRef.current++

                // HR (sanitizado)
                const hr = safeNum(result.instant_hr)
                if (hr !== null) latestHRRef.current = hr
              } catch {
                // silenciar
              }
            }).catch(() => {
              // silenciar errores de red
            })
          }

          // ── Incrementar ticks de fase (SIEMPRE) ──
          if (cp === (PHASE.DETECTION as PhaseId)) {
            phaseTicksRef.current++
            if (faceConsecRef.current >= FACE_LOCK_NEEDED) {
              phaseRef.current = PHASE.CALIBRATION as PhaseId
              phaseTicksRef.current = 0
            }
          } else {
            phaseTicksRef.current++
            activeTicksRef.current++

            const needed = PHASE_FRAMES[cp] ?? Infinity
            if (phaseTicksRef.current >= needed) {
              const np = nextPhaseAfter(cp)
              phaseRef.current = np
              phaseTicksRef.current = 0

              if (np === (PHASE.COMPUTING as PhaseId)) {
                // Marcar done y salir
                setState((prev) => ({
                  ...prev,
                  currentPhase: np,
                  phaseTicks: 0,
                  totalProgress: 100,
                  done: true,
                  instruction: PHASE_INSTRUCTIONS[PHASE.COMPUTING],
                  breathingGuide: null,
                  vascularCue: null,
                  instantHR: latestHRRef.current,
                  totalFramesSent: totalSentRef.current,
                }))
                return
              }
            }
          }

          // ── Throttled UI update (~4 Hz) ──
          const now = Date.now()
          if (now - lastUIRef.current >= 250) {
            lastUIRef.current = now

            const currentPhase = phaseRef.current
            const pt = phaseTicksRef.current
            const at = activeTicksRef.current
            const progress = currentPhase === (PHASE.DETECTION as PhaseId)
              ? 0
              : Math.min((at / TOTAL_ACTIVE_TICKS) * 100, 100)

            const ui = computePhaseUI(currentPhase, pt)

            setState((prev) => ({
              ...prev,
              currentPhase,
              phaseTicks: pt,
              totalProgress: progress,
              instruction: ui.instruction,
              breathingGuide: ui.breathingGuide,
              vascularCue: ui.vascularCue,
              faceDetected: faceConsecRef.current > 0,
              faceLocked: faceConsecRef.current >= FACE_LOCK_NEEDED,
              totalFramesSent: totalSentRef.current,
              instantHR: latestHRRef.current,
            }))
          }
        } catch (err) {
          // NUNCA dejar que un error escape del interval
          console.error("[rPPG] interval error (swallowed):", err)
        }
      }, TICK_MS)

      return sid || null
    },
    [captureFrame, sendFrameToBackend, stopCapture],
  )

  /* ── Finalizar escaneo ─────────────────────────────────────── */
  const finishScan = useCallback(async (): Promise<VitalsResult | null> => {
    stopCapture()
    stoppedRef.current = true
    sendingRef.current = false

    const sid = sessionIdRef.current
    sessionIdRef.current = null
    if (!sid) {
      setState((p) => ({ ...p, isScanning: false }))
      return null
    }
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 20000)
      const res = await fetch(`${API_BASE}/api/v1/scan/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
        signal: ctrl.signal,
      })
      clearTimeout(to)
      const data: VitalsResult = await res.json()
      setState((p) => ({ ...p, isScanning: false }))
      return data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[rPPG] finish error:", msg)
      setState((p) => ({ ...p, isScanning: false, error: `Error: ${msg}` }))
      return null
    }
  }, [stopCapture])

  /* ── Cancelar ──────────────────────────────────────────────── */
  const cancelScan = useCallback(() => {
    stopCapture()
    stoppedRef.current = true
    sendingRef.current = false
    sessionIdRef.current = null
    setState(initialState())
  }, [stopCapture])

  // Limpiar al desmontar
  useEffect(() => () => { stopCapture(); stoppedRef.current = true }, [stopCapture])

  return { state, startScan, finishScan, cancelScan }
}
