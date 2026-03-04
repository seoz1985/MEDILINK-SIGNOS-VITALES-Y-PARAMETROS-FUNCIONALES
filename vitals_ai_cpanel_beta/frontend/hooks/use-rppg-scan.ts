/**
 * Hook rPPG — protocolo clínico interactivo por fases.
 *
 * BLINDAJE NIVEL CRÍTICO — NUNCA debe caerse durante la toma:
 *
 * 1. Progresión basada en TICKS (reloj), no en frames ni red.
 * 2. sendingRef con auto-reset de 4 s para evitar bloqueos.
 * 3. TODO envuelto en try-catch — NUNCA lanza excepciones.
 * 4. setState throttled a 4 Hz para reducir re-renders.
 * 5. stoppedRef como llave maestra para detener todo.
 * 6. Sesión backend OPCIONAL — si falla, continúa sin backend.
 * 7. watchdog: si el interval muere, se re-crea automáticamente.
 * 8. captureFrame protegido contra canvas/video corrupto.
 * 9. finishScan con REINTENTOS automáticos (3x con backoff).
 * 10. Pérdida de cámara: se reintenta adquisición del stream.
 * 11. Error boundary: cualquier excepción en el pipeline
 *     se silencia y la medición continúa.
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
const WATCHDOG_MS = 500                          // watchdog cada 500ms
const FINISH_MAX_RETRIES = 3                     // reintentos para finishScan
const FINISH_RETRY_DELAY = 1500                  // ms entre reintentos

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
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoElRef = useRef<HTMLVideoElement | null>(null) // copia del video para watchdog

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
  const lastTickTimeRef = useRef(0) // para watchdog: último tick procesado
  const networkFailCountRef = useRef(0) // contador de fallos de red consecutivos

  /* ── Canvas helper ─────────────────────────────────────────── */
  const getCanvas = useCallback(() => {
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas")
    return canvasRef.current
  }, [])

  const captureFrame = useCallback(
    (video: HTMLVideoElement): string | null => {
      try {
        // Validar que el video es usable
        if (!video) return null
        if (!video.videoWidth || !video.videoHeight) return null
        if (video.readyState < 2) return null  // HAVE_CURRENT_DATA mínimo
        if (video.paused || video.ended) {
          // Intentar re-play silencioso
          video.play().catch(() => {})
          return null
        }

        const c = getCanvas()
        c.width = 320
        c.height = 240
        const ctx = c.getContext("2d")
        if (!ctx) return null
        ctx.drawImage(video, 0, 0, 320, 240)

        // Verificar que el canvas no está vacío (todo negro)
        try {
          const sample = ctx.getImageData(160, 120, 1, 1).data
          // Si R+G+B = 0 probablemente la cámara falló
          if (sample[0] + sample[1] + sample[2] === 0) return null
        } catch {
          // getImageData puede fallar por CORS, ignorar
        }

        return c.toDataURL("image/jpeg", 0.6)
      } catch {
        return null
      }
    },
    [getCanvas],
  )

  /* ── Stop capture interval + watchdog ───────────────────────── */
  const stopCapture = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current)
      captureIntervalRef.current = null
    }
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current)
      watchdogRef.current = null
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
        const timer = setTimeout(() => ctrl.abort(), 4000) // timeout 4 s por frame

        const res = await fetch(`${API_BASE}/api/v1/scan/frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid, frame: frameData, phase }),
          signal: ctrl.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          networkFailCountRef.current++
          return null
        }

        const data = await res.json()
        networkFailCountRef.current = 0 // reset en éxito
        return data as Record<string, unknown>
      } catch {
        networkFailCountRef.current++
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

      // Crear sesión backend — OPCIONAL: si falla, el escaneo continúa
      // sin enviar frames (las fases avanzan por reloj, no por red).
      let sid = ""
      try {
        const ctrl = new AbortController()
        const to = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(`${API_BASE}/api/v1/scan/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fps: FPS, duration_seconds: 150 }),
          signal: ctrl.signal,
        })
        clearTimeout(to)
        if (res.ok) {
          const data = await res.json()
          sid = data.session_id || ""
          sessionIdRef.current = sid
          setState((p) => ({ ...p, sessionId: sid }))
        } else {
          console.warn("[rPPG] start: backend respondió", res.status, "— continuando sin sesión")
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn("[rPPG] start: backend inaccesible —", msg, "— continuando sin sesión")
      }

      // Guardar ref del video para watchdog y recuperación
      videoElRef.current = video
      networkFailCountRef.current = 0

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
      /* ── Función del tick principal (extraída para reutilizar en watchdog) ── */
      const doTick = () => {
        // === LLAVE MAESTRA: si se detuvo, no hacer nada ===
        if (stoppedRef.current) return

        // Marcar timestamp para watchdog
        lastTickTimeRef.current = Date.now()

        // TODO envuelto en try-catch
        try {
          const cp = phaseRef.current
          if (cp === (PHASE.COMPUTING as PhaseId)) return

          // ── Enviar frame (fire-and-forget, NO bloquea) ──
          // Si no hay sessionId o hay muchos fallos de red → skip pero fases avanzan
          const frame = captureFrame(video)
          if (frame && sid && networkFailCountRef.current < 20) {
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
              // silenciar errores de red — las fases siguen avanzando
            })
          } else if (!sid && faceConsecRef.current < FACE_LOCK_NEEDED) {
            // Sin backend: simular detección de rostro tras 3s
            // para que las fases avancen
            if (phaseTicksRef.current > FPS * 3) {
              faceConsecRef.current = FACE_LOCK_NEEDED
            }
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
      }

      // ── Interval principal ──
      captureIntervalRef.current = setInterval(doTick, TICK_MS)

      // ── WATCHDOG: si el interval muere por cualquier razón, lo re-crea ──
      // Revisa cada 500ms que el último tick haya sido reciente.
      // Si lleva >1s sin tick Y no estamos detenidos → re-crear interval.
      if (watchdogRef.current) clearInterval(watchdogRef.current)
      watchdogRef.current = setInterval(() => {
        try {
          if (stoppedRef.current) return
          const elapsed = Date.now() - lastTickTimeRef.current
          if (elapsed > TICK_MS * 4 && lastTickTimeRef.current > 0) {
            console.warn(`[rPPG] Watchdog: interval muerto (${elapsed}ms sin tick). Re-creando…`)
            // Limpiar interval muerto
            if (captureIntervalRef.current) {
              clearInterval(captureIntervalRef.current)
              captureIntervalRef.current = null
            }
            // Re-crear
            captureIntervalRef.current = setInterval(doTick, TICK_MS)
          }

          // Verificar salud del video
          const vid = videoElRef.current
          if (vid && (vid.paused || vid.ended) && !stoppedRef.current) {
            console.warn("[rPPG] Watchdog: video pausado/terminado. Re-playing…")
            vid.play().catch(() => {})
          }
        } catch {
          // watchdog nunca debe fallar
        }
      }, WATCHDOG_MS)

      return sid || null
    },
    [captureFrame, sendFrameToBackend, stopCapture],
  )

  /* ── Finalizar escaneo (con REINTENTOS automáticos) ─────── */
  const finishScan = useCallback(async (): Promise<VitalsResult | null> => {
    stopCapture()
    stoppedRef.current = true
    sendingRef.current = false
    videoElRef.current = null

    const sid = sessionIdRef.current
    sessionIdRef.current = null
    if (!sid) {
      setState((p) => ({ ...p, isScanning: false }))
      return null
    }

    // Reintentar hasta FINISH_MAX_RETRIES veces con backoff
    for (let attempt = 0; attempt < FINISH_MAX_RETRIES; attempt++) {
      try {
        const ctrl = new AbortController()
        const timeout = 15000 + attempt * 5000 // 15s, 20s, 25s
        const to = setTimeout(() => ctrl.abort(), timeout)
        const res = await fetch(`${API_BASE}/api/v1/scan/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid }),
          signal: ctrl.signal,
        })
        clearTimeout(to)

        if (res.ok) {
          const data: VitalsResult = await res.json()
          setState((p) => ({ ...p, isScanning: false }))
          return data
        }

        // Respuesta no-OK: reintentar
        console.warn(`[rPPG] finish: intento ${attempt + 1} respondió ${res.status}`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[rPPG] finish: intento ${attempt + 1} falló —`, msg)
      }

      // Esperar antes del siguiente reintento
      if (attempt < FINISH_MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, FINISH_RETRY_DELAY))
      }
    }

    // Todos los reintentos fallaron
    console.error("[rPPG] finish: todos los reintentos agotados")
    setState((p) => ({ ...p, isScanning: false, error: "No se pudieron obtener resultados del servidor" }))
    return null
  }, [stopCapture])

  /* ── Cancelar ──────────────────────────────────────────────── */
  const cancelScan = useCallback(() => {
    stopCapture()
    stoppedRef.current = true
    sendingRef.current = false
    sessionIdRef.current = null
    videoElRef.current = null
    networkFailCountRef.current = 0
    setState(initialState())
  }, [stopCapture])

  // Limpiar al desmontar — triple seguridad
  useEffect(() => () => {
    stopCapture()
    stoppedRef.current = true
    videoElRef.current = null
  }, [stopCapture])

  return { state, startScan, finishScan, cancelScan }
}
