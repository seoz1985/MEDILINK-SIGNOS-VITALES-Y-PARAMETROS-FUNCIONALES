"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/* ── Web Speech API type shims (not in default TS lib) ── */
type SpeechRecognitionType = typeof window extends { SpeechRecognition: infer T } ? T : any
type SpeechRecognitionInstance = any
type SpeechRecognitionEventType = any

/* ─────────────────────────────────────────────────────────
 * useSpeech – Web Speech API wrapper (TTS + STT)
 *
 * Diseñado para sonar lo más natural y humano posible:
 *  ▸ Selección inteligente de voces neurales de alta calidad
 *  ▸ Pausas "respiratorias" naturales entre oraciones
 *  ▸ Micro-variación de cadencia para evitar monotonía
 *  ▸ Preprocesamiento de texto (abreviaturas, números)
 *  ▸ Volumen progresivo en la primera frase (fade-in suave)
 * ───────────────────────────────────────────────────────── */

type SpeechLang = "es-CO" | "es-ES" | "es-MX" | "es"

export interface UseSpeechOptions {
  /** Idioma para STT y TTS (default "es-CO") */
  lang?: SpeechLang
  /** Velocidad base de habla 0.1-10 (default 0.92 – ligeramente pausado, cálido) */
  rate?: number
  /** Tono base 0-2 (default 1.0) */
  pitch?: number
  /** Volumen 0-1 (default 0.92 – suave, no agresivo) */
  volume?: number
  /** Pausa entre oraciones en ms (default 380 – ~respiración natural) */
  breathPauseMs?: number
  /** Callback cuando STT produce un resultado parcial/final */
  onResult?: (transcript: string, isFinal: boolean) => void
  /** Callback al terminar de hablar (TTS) */
  onSpeakEnd?: () => void
}

export function useSpeech(opts: UseSpeechOptions = {}) {
  const {
    lang = "es-CO",
    rate = 0.92,
    pitch = 1.0,
    volume = 0.92,
    breathPauseMs = 380,
    onResult,
    onSpeakEnd,
  } = opts

  /* ── State ── */
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [sttSupported, setSttSupported] = useState(false)
  const [ttsSupported, setTtsSupported] = useState(false)
  const [muted, setMuted] = useState(false)

  /* ── Refs ── */
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance>(null)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const onResultRef = useRef(onResult)
  const onSpeakEndRef = useRef(onSpeakEnd)
  const mutedRef = useRef(muted)
  const breathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  // Keep refs in sync
  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onSpeakEndRef.current = onSpeakEnd }, [onSpeakEnd])
  useEffect(() => { mutedRef.current = muted }, [muted])

  /* ═══ Initialize TTS ═══ */
  useEffect(() => {
    if (typeof window === "undefined") return
    const synth = window.speechSynthesis
    if (!synth) return
    synthRef.current = synth
    setTtsSupported(true)

    /*
     * Selección de voz — prioridad por naturalidad:
     *  1. Voces neurales de Microsoft (ej. "Microsoft Raul", "Microsoft Helena Neural")
     *  2. Voces Google español (buena calidad en Chrome/Android)
     *  3. Voces "Natural" / "Premium" de cualquier proveedor
     *  4. Cualquier voz española disponible
     */
    const pickVoice = () => {
      const voices = synth.getVoices()
      if (!voices.length) return

      // Todas las voces en español
      const es = voices.filter((v) => v.lang.startsWith("es"))
      if (!es.length) {
        voiceRef.current = voices[0] || null
        return
      }

      // Score de calidad: mayor = mejor
      const scored = es.map((v) => {
        const n = v.name.toLowerCase()
        let score = 0

        // Voces neurales de Edge/Windows — las más naturales
        if (n.includes("neural"))              score += 50
        // Voces Online/Network (mejor que offline)
        if (n.includes("online") || !v.localService) score += 20
        // Google — buena calidad general
        if (n.includes("google"))              score += 30
        // Voces "Natural" / "Premium" / "Enhanced"
        if (n.includes("natural"))             score += 40
        if (n.includes("premium"))             score += 35
        if (n.includes("enhanced"))            score += 25
        // Microsoft (no neural pero decentes)
        if (n.includes("microsoft"))           score += 15
        // Preferir colombiano / latinoamericano
        if (v.lang === "es-CO" || v.lang === "es-419") score += 10
        if (v.lang === "es-MX")               score += 5

        return { voice: v, score }
      })

      scored.sort((a, b) => b.score - a.score)
      voiceRef.current = scored[0]?.voice || es[0]

      if (process.env.NODE_ENV === "development") {
        console.log("[TTS] Voces disponibles:", scored.map(s => `${s.voice.name} (${s.voice.lang}) score=${s.score}`))
        console.log("[TTS] Seleccionada:", voiceRef.current?.name)
      }
    }

    pickVoice()
    synth.addEventListener("voiceschanged", pickVoice)
    return () => synth.removeEventListener("voiceschanged", pickVoice)
  }, [])

  /* ═══ Initialize STT ═══ */
  useEffect(() => {
    if (typeof window === "undefined") return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    setSttSupported(true)

    const recognition: SpeechRecognitionInstance = new SR()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (e: SpeechRecognitionEventType) => {
      const result = e.results[e.results.length - 1]
      const transcript = result[0].transcript
      onResultRef.current?.(transcript, result.isFinal)
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = (e: any) => {
      if (e.error !== "aborted" && e.error !== "no-speech") {
        console.warn("[STT] error:", e.error)
      }
      setIsListening(false)
    }

    recognitionRef.current = recognition
    return () => {
      try { recognition.abort() } catch { /* ignore */ }
    }
  }, [lang])

  /* ═══ TTS: speak — con prosodia humanizada ═══ */
  const speak = useCallback((text: string) => {
    const synth = synthRef.current
    if (!synth || mutedRef.current) return

    // Cancel everything
    synth.cancel()
    cancelledRef.current = false
    if (breathTimerRef.current) {
      clearTimeout(breathTimerRef.current)
      breathTimerRef.current = null
    }

    // Preprocesar texto para habla natural
    const processed = humanizeText(text)
    // Dividir en oraciones para pausas respiratorias entre ellas
    const sentences = splitSentences(processed)
    if (!sentences.length) return

    let idx = 0
    setIsSpeaking(true)

    const speakNext = () => {
      if (cancelledRef.current || idx >= sentences.length) {
        setIsSpeaking(false)
        onSpeakEndRef.current?.()
        return
      }

      const sentence = sentences[idx]
      const utt = new SpeechSynthesisUtterance(sentence)
      utt.lang = lang

      /*
       * Micro-variación de cadencia (±0.04) — evita monotonía robótica
       * Primera oración ligeramente más lenta (saludo cálido)
       * Última oración ligeramente más lenta (cierre natural)
       */
      const isFirst = idx === 0
      const isLast = idx === sentences.length - 1
      const jitter = (Math.random() - 0.5) * 0.06  // ±0.03
      let sentenceRate = rate + jitter
      if (isFirst) sentenceRate -= 0.03  // arranque suave
      if (isLast) sentenceRate -= 0.02   // cierre pausado
      utt.rate = Math.max(0.7, Math.min(1.1, sentenceRate))

      // Micro-variación de tono (±0.03) — naturalidad
      const pitchJitter = (Math.random() - 0.5) * 0.06
      utt.pitch = Math.max(0.8, Math.min(1.2, pitch + pitchJitter))

      // Primera frase volumen suave (fade-in perceptual)
      utt.volume = isFirst ? Math.min(volume, 0.85) : volume

      if (voiceRef.current) utt.voice = voiceRef.current

      utt.onend = () => {
        idx++
        if (cancelledRef.current || idx >= sentences.length) {
          setIsSpeaking(false)
          onSpeakEndRef.current?.()
          return
        }
        /*
         * Pausa "respiratoria" entre oraciones (280-480ms)
         * Varía ±100ms para sonar orgánico, no metrónomo
         */
        const pause = breathPauseMs + (Math.random() - 0.5) * 200
        breathTimerRef.current = setTimeout(speakNext, pause)
      }

      utt.onerror = () => {
        idx++
        if (cancelledRef.current) return
        speakNext()
      }

      synth.speak(utt)
    }

    speakNext()
  }, [lang, rate, pitch, volume, breathPauseMs])

  /* ═══ TTS: stop ═══ */
  const stopSpeaking = useCallback(() => {
    cancelledRef.current = true
    if (breathTimerRef.current) {
      clearTimeout(breathTimerRef.current)
      breathTimerRef.current = null
    }
    synthRef.current?.cancel()
    setIsSpeaking(false)
  }, [])

  /* ═══ TTS: toggle mute ═══ */
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      if (next) {
        cancelledRef.current = true
        if (breathTimerRef.current) clearTimeout(breathTimerRef.current)
        synthRef.current?.cancel()
      }
      return next
    })
  }, [])

  /* ═══ STT: start ═══ */
  const startListening = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    // Stop TTS while listening
    cancelledRef.current = true
    if (breathTimerRef.current) clearTimeout(breathTimerRef.current)
    synthRef.current?.cancel()
    setIsSpeaking(false)

    try {
      rec.start()
      setIsListening(true)
    } catch {
      // Already started
    }
  }, [])

  /* ═══ STT: stop ═══ */
  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch { /* ignore */ }
    setIsListening(false)
  }, [])

  return {
    // TTS
    speak,
    stopSpeaking,
    isSpeaking,
    ttsSupported,
    muted,
    toggleMute,
    // STT
    startListening,
    stopListening,
    isListening,
    sttSupported,
  }
}

/* ══════════════════════════════════════════════════════════════
 * Helpers — Procesamiento de texto para habla natural
 * ══════════════════════════════════════════════════════════════ */

/**
 * Preprocesa texto para que el motor TTS lo pronuncie de forma
 * más natural y humana.
 */
function humanizeText(text: string): string {
  let t = text
    // Limpiar HTML
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()

  // Expandir abreviaturas médicas comunes
  t = t.replace(/\bIA\b/g, "inteligencia artificial")
  t = t.replace(/\bHz\b/g, "hercios")
  t = t.replace(/\bmmHg\b/g, "milímetros de mercurio")
  t = t.replace(/\bbpm\b/g, "latidos por minuto")
  t = t.replace(/\bSpO2\b/gi, "saturación de oxígeno")
  t = t.replace(/\b°C\b/g, " grados centígrados")
  t = t.replace(/\bmg\/dL\b/gi, "miligramos por decilitro")

  // Expandir números escritos como "2 a 3" → "dos a tres" para frases cortas
  // (solo números simples ≤10 que suenan mejor hablados)
  const numWords: Record<string, string> = {
    "0": "cero", "1": "uno", "2": "dos", "3": "tres", "4": "cuatro",
    "5": "cinco", "6": "seis", "7": "siete", "8": "ocho", "9": "nueve", "10": "diez",
  }
  t = t.replace(/\b(\d{1,2})\s+(a|o|y|de|por)\s+(\d{1,2})\b/g, (_, n1, conj, n2) => {
    const w1 = numWords[n1]
    const w2 = numWords[n2]
    return w1 && w2 ? `${w1} ${conj} ${w2}` : `${n1} ${conj} ${n2}`
  })

  // Convertir "90 segundos" → "noventa segundos" para cantidades comunes
  t = t.replace(/\b90 segundos\b/g, "noventa segundos")
  t = t.replace(/\b60 segundos\b/g, "sesenta segundos")
  t = t.replace(/\b30 segundos\b/g, "treinta segundos")

  // Hacer los "." y "," más amigables para pausas TTS
  // Agregar micro-pausa antes de "Recuerda", "Por favor", etc.
  t = t.replace(/\.\s*(Recuerda|Por favor|Ten en cuenta|Es importante)/g, ". ... $1")

  // Suavizar signos de exclamación consecutivos
  t = t.replace(/!{2,}/g, "!")

  return t
}

/**
 * Divide texto en oraciones individuales para insertar pausas
 * "respiratorias" entre ellas. Respeta límite de ~180 chars.
 */
function splitSentences(text: string): string[] {
  if (!text) return []

  // Dividir por terminadores de oración
  const raw = text.split(/(?<=[.!?…])\s+/)
  const sentences: string[] = []

  for (const part of raw) {
    if (!part.trim()) continue

    if (part.length <= 180) {
      sentences.push(part.trim())
    } else {
      // Si una "oración" es muy larga, cortar por comas o punto y coma
      let remaining = part.trim()
      while (remaining.length > 0) {
        if (remaining.length <= 180) {
          sentences.push(remaining)
          break
        }
        // Buscar último separador natural antes de 180
        let cut = remaining.lastIndexOf(", ", 180)
        if (cut === -1 || cut < 60) cut = remaining.lastIndexOf("; ", 180)
        if (cut === -1 || cut < 60) cut = remaining.lastIndexOf(" — ", 180)
        if (cut === -1 || cut < 60) cut = remaining.lastIndexOf(" ", 180)
        if (cut === -1) cut = 180

        sentences.push(remaining.slice(0, cut + 1).trim())
        remaining = remaining.slice(cut + 1).trim()
      }
    }
  }

  return sentences.filter(Boolean)
}
