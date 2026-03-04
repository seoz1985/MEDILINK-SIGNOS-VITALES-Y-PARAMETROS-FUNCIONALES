"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/* ── Web Speech API type shims (not in default TS lib) ── */
type SpeechRecognitionType = typeof window extends { SpeechRecognition: infer T } ? T : any
type SpeechRecognitionInstance = any
type SpeechRecognitionEventType = any

/* ─────────────────────────────────────────────────────────
 * useSpeech – Web Speech API wrapper (TTS + STT)
 *
 *  TTS  – speak(text)  → Asistente IA habla al paciente
 *  STT  – startListening() / stopListening() → paciente dicta
 * ───────────────────────────────────────────────────────── */

type SpeechLang = "es-CO" | "es-ES" | "es-MX" | "es"

export interface UseSpeechOptions {
  /** Idioma para STT y TTS (default "es-CO") */
  lang?: SpeechLang
  /** Velocidad de habla 0.1-10 (default 0.95) */
  rate?: number
  /** Tono 0-2 (default 1.05) */
  pitch?: number
  /** Volumen 0-1 (default 1) */
  volume?: number
  /** Callback cuando STT produce un resultado parcial/final */
  onResult?: (transcript: string, isFinal: boolean) => void
  /** Callback al terminar de hablar (TTS) */
  onSpeakEnd?: () => void
}

export function useSpeech(opts: UseSpeechOptions = {}) {
  const {
    lang = "es-CO",
    rate = 0.95,
    pitch = 1.05,
    volume = 1,
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

    // Pick best Spanish voice (gender-neutral priority)
    const pickVoice = () => {
      const voices = synth.getVoices()
      if (!voices.length) return

      // All Spanish voices
      const candidates = voices.filter((v) => v.lang.startsWith("es"))
      // Priority: Google español > Microsoft (any) > first available
      const google = candidates.find((v) => v.name.includes("Google"))
      const ms = candidates.find((v) => v.name.includes("Microsoft"))
      const any = candidates[0]
      voiceRef.current = google || ms || any || voices.find((v) => v.lang.startsWith("es")) || null
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

  /* ═══ TTS: speak ═══ */
  const speak = useCallback((text: string) => {
    const synth = synthRef.current
    if (!synth || mutedRef.current) return

    // Cancel any ongoing speech
    synth.cancel()

    // Split long text into chunks (max ~200 chars at sentence boundaries)
    const chunks = splitText(text, 200)

    let idx = 0
    const speakNext = () => {
      if (idx >= chunks.length) {
        setIsSpeaking(false)
        onSpeakEndRef.current?.()
        return
      }
      const utt = new SpeechSynthesisUtterance(chunks[idx])
      utt.lang = lang
      utt.rate = rate
      utt.pitch = pitch
      utt.volume = volume
      if (voiceRef.current) utt.voice = voiceRef.current

      utt.onend = () => {
        idx++
        speakNext()
      }
      utt.onerror = () => {
        idx++
        speakNext()
      }
      synth.speak(utt)
    }

    setIsSpeaking(true)
    speakNext()
  }, [lang, rate, pitch, volume])

  /* ═══ TTS: stop ═══ */
  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel()
    setIsSpeaking(false)
  }, [])

  /* ═══ TTS: toggle mute ═══ */
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      if (next) synthRef.current?.cancel()
      return next
    })
  }, [])

  /* ═══ STT: start ═══ */
  const startListening = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    // Stop TTS while listening
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

/* ── Helpers ── */
function splitText(text: string, maxLen: number): string[] {
  // Clean HTML tags
  const clean = text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
  if (clean.length <= maxLen) return [clean]

  const chunks: string[] = []
  let remaining = clean

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    // Find last sentence end before maxLen
    let cut = remaining.lastIndexOf(". ", maxLen)
    if (cut === -1 || cut < maxLen * 0.3) cut = remaining.lastIndexOf(", ", maxLen)
    if (cut === -1 || cut < maxLen * 0.3) cut = remaining.lastIndexOf(" ", maxLen)
    if (cut === -1) cut = maxLen

    chunks.push(remaining.slice(0, cut + 1).trim())
    remaining = remaining.slice(cut + 1).trim()
  }
  return chunks
}
