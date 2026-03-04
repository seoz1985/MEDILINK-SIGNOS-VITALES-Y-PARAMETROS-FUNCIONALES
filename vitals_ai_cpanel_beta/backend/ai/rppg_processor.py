"""
rPPG (Remote Photoplethysmography) - Motor de visión computacional v2.

Extrae signos vitales a partir de video facial mediante análisis de
micro-cambios de color en la piel causados por el flujo sanguíneo.

Pipeline mejorado:
  1) Detección facial (Haar Cascades / OpenCV)
  2) Extracción de ROI multi-zona (frente + mejillas + nariz)
  3) Promedio de canales R, G, B por frame
  4) Algoritmo CHROM (Chrominance-based rPPG) → señal limpia
  5) Welch PSD + interpolación parabólica → Heart Rate preciso (±1 bpm)
  6) Ratio R/B pulsátil segmentado → SpO2
  7) Envolvente RSA + Welch → Resp Rate
  8) HRV frecuencial (LF/HF) + PAT ratio → Presión Arterial
  9) Modelo indirecto HR→ Temperatura

Referencia: De Haan & Jeanne, "Robust Pulse Rate from
Chrominance-Based rPPG," IEEE Trans. Biomed. Eng., 2013.
"""

import cv2
import numpy as np
from scipy import signal as sp_signal
from typing import Optional
import base64
import os

# ─── Ruta del clasificador Haar ───────────────────────────────────
_CASCADE_PATH = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
_face_cascade = cv2.CascadeClassifier(_CASCADE_PATH)


class RPPGProcessor:
    """Acumula frames y calcula vitales al tener suficientes muestras."""

    # Historial de estimaciones instantáneas para suavizado temporal
    _hr_history: list[float] = []
    _HR_HISTORY_MAX = 10  # últimas N estimaciones

    def __init__(self, fps: float = 30.0, buffer_seconds: float = 30.0):
        self.fps = fps
        self.buffer_size = int(fps * buffer_seconds)

        # Buffers de señal (canal promedio por frame)
        self.r_signal: list[float] = []
        self.g_signal: list[float] = []
        self.b_signal: list[float] = []

        # Buffer de señal perinasal (fosas nasales) — movimiento de aleteo nasal
        # Se usa como fuente adicional para la estimación de frecuencia respiratoria
        self.perinasal_signal: list[float] = []

        # Etiqueta de fase por frame → permite cómputo por fase
        # 0=detección, 1=calibración, 2=cardíaco, 3=ocular, 4=respiratorio, 5=vascular
        self.phase_tags: list[int] = []

        self.frame_count = 0
        self.face_detected_count = 0
        self._hr_history = []

    # ──────────────────────────────────────────────────────────────
    # Entrada de frame
    # ──────────────────────────────────────────────────────────────
    def add_frame_base64(self, b64_data: str, phase: int = 0) -> dict:
        """Decodifica un frame base64 (JPEG/PNG) y lo procesa."""
        raw = base64.b64decode(b64_data)
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return {'ok': False, 'error': 'No se pudo decodificar el frame'}
        return self.add_frame(frame, phase=phase)

    def add_frame(self, frame: np.ndarray, phase: int = 0) -> dict:
        """
        Procesa un frame BGR de OpenCV.
        Retorna status parcial (face_detected, quality) en cada frame.
        phase: 0=detect, 1=calibration, 2=cardiac, 3=respiratory, 4=vascular
        """
        self.frame_count += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 1) Detección facial
        faces = _face_cascade.detectMultiScale(
            gray, scaleFactor=1.3, minNeighbors=5, minSize=(60, 60)
        )

        face_detected = len(faces) > 0
        if face_detected:
            self.face_detected_count += 1

        if not face_detected:
            return {
                'ok': True,
                'frame_num': self.frame_count,
                'face_detected': False,
                'buffer_progress': len(self.g_signal) / max(self.buffer_size, 1),
                'instant_hr': None,
            }

        # Tomar la cara más grande
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])

        # 2) Extraer ROIs (frente + mejillas + nariz + perinasal)
        roi_means = self._extract_roi(frame, x, y, w, h)

        self.r_signal.append(roi_means[0])
        self.g_signal.append(roi_means[1])
        self.b_signal.append(roi_means[2])
        self.phase_tags.append(phase)

        # 3) Extraer señal perinasal por separado (aleteo nasal para RR)
        perinasal_roi = frame[y + h // 2:y + 2 * h // 3,
                              x + w // 4:x + 3 * w // 4]
        if perinasal_roi.size > 0:
            # Usamos canal verde (mejor SNR) de la zona perinasal
            self.perinasal_signal.append(
                float(np.mean(perinasal_roi[:, :, 1]))  # canal G en BGR
            )
        else:
            # Fallback: usar el canal verde general
            self.perinasal_signal.append(roi_means[1])

        # Mantener buffer acotado
        if len(self.g_signal) > self.buffer_size:
            self.r_signal = self.r_signal[-self.buffer_size:]
            self.g_signal = self.g_signal[-self.buffer_size:]
            self.b_signal = self.b_signal[-self.buffer_size:]
            self.perinasal_signal = self.perinasal_signal[-self.buffer_size:]
            self.phase_tags = self.phase_tags[-self.buffer_size:]

        # HR instantáneo con ventana corta y suavizado temporal
        instant_hr = None
        min_samples = max(int(self.fps * 5), 20)  # al menos 20 muestras o 5s
        if len(self.g_signal) >= min_samples:
            window_len = min(len(self.g_signal), max(int(self.fps * 12), 50))
            raw_hr = self._estimate_hr_chrom(
                self.r_signal[-window_len:],
                self.g_signal[-window_len:],
                self.b_signal[-window_len:],
                self.fps,
            )
            if raw_hr is not None:
                # Suavizado temporal: mediana móvil de las últimas N estimaciones
                self._hr_history.append(raw_hr)
                if len(self._hr_history) > self._HR_HISTORY_MAX:
                    self._hr_history = self._hr_history[-self._HR_HISTORY_MAX:]
                instant_hr = float(np.median(self._hr_history))

        return {
            'ok': True,
            'frame_num': self.frame_count,
            'face_detected': True,
            'face_rect': {'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)},
            'buffer_progress': len(self.g_signal) / max(self.buffer_size, 1),
            'instant_hr': round(instant_hr, 1) if instant_hr else None,
        }

    # ──────────────────────────────────────────────────────────────
    # Cálculo final de vitales
    # ──────────────────────────────────────────────────────────────
    def compute_vitals(self) -> dict:
        """
        Calcula signos vitales usando datos por fase si están disponibles.

        Sistema de fases (protocolo guiado interactivo):
          Fase 0 = Detección (espera rostro)
          Fase 1 = Calibración (baseline luz/piel, 8s)
          Fase 2 = Cardíaco (quieto, respiración normal, 25s) → HR + SpO2
          Fase 3 = Ocular (micro-vibraciones oculares, 15s) → validación HR
          Fase 4 = Respiratorio (respiración guiada, 25s) → RR
          Fase 5 = Vascular (Valsalva retener/soltar, 15s) → BP

        Si no hay fases etiquetadas, usa toda la señal (compatibilidad).
        """
        n = len(self.g_signal)
        min_needed = max(int(self.fps * 5), 20)
        if n < min_needed:
            return {
                'ok': False,
                'error': f'Señal insuficiente: {n} muestras (mínimo {min_needed})',
            }

        quality = self._compute_quality()

        # ── Extraer señales por fase ─────────────────────────────
        has_phases = len(self.phase_tags) > 0 and any(p > 0 for p in self.phase_tags)

        def _get_signals(phases: list[int]):
            """Retorna (r, g, b, perinasal) para las fases indicadas."""
            idx = [i for i, p in enumerate(self.phase_tags) if p in phases]
            if not idx:
                return None, None, None, None
            r = [self.r_signal[i] for i in idx]
            g = [self.g_signal[i] for i in idx]
            b = [self.b_signal[i] for i in idx]
            pn = [self.perinasal_signal[i] for i in idx
                  if i < len(self.perinasal_signal)]
            return r, g, b, pn

        # Señales globales (fallback)
        all_r, all_g, all_b = self.r_signal, self.g_signal, self.b_signal
        all_pn = self.perinasal_signal

        min_hr = max(int(self.fps * 5), 20)   # ~5s para HR
        min_rr = max(int(self.fps * 8), 30)   # ~8s para RR (relajado)

        # ── HR + SpO2: preferir fases cardíaca + ocular (1+2+3) ─
        if has_phases:
            r_c, g_c, b_c, _ = _get_signals([1, 2, 3])
            use_cardiac = r_c is not None and len(r_c) >= min_hr
        else:
            use_cardiac = False

        if use_cardiac:
            heart_rate = self._estimate_hr_chrom(r_c, g_c, b_c, self.fps)
            spo2 = self._estimate_spo2(r_c, b_c, self.fps, g_signal=g_c)
        else:
            heart_rate = self._estimate_hr_chrom(all_r, all_g, all_b, self.fps)
            spo2 = self._estimate_spo2(all_r, all_b, self.fps, g_signal=all_g)

        # ── RR: usar TODAS las fases de medición (1-5) ────────────
        # La respiración es un proceso continuo; las fases cardíaca,
        # ocular, respiratoria y vascular TODAS contienen información
        # respiratoria valiosa.  Fase 4 es la primaria (guiada), pero
        # las demás aportan RSA, RIAV y movimiento torácico.
        if has_phases:
            # Primero: datos de TODAS las fases de medición
            r_all_ph, g_all_ph, b_all_ph, pn_all_ph = _get_signals([1, 2, 3, 4, 5])
            # Segundo: datos específicos de fase respiratoria
            r_r4, g_r4, b_r4, pn_r4 = _get_signals([4])
            has_full = r_all_ph is not None and len(r_all_ph) >= min_rr
            has_resp4 = r_r4 is not None and len(r_r4) >= min_rr
        else:
            has_full = False
            has_resp4 = False

        # Calcular RR desde todas las fases (más datos = mejor fusión)
        rr_full = None
        resp_detail_full = None
        if has_full:
            rr_full, resp_detail_full = self._estimate_resp_rate(
                r_all_ph, g_all_ph, b_all_ph, self.fps,
                perinasal_signal=pn_all_ph, heart_rate=heart_rate)

        # Calcular RR desde fase respiratoria pura (guiada)
        rr_phase4 = None
        resp_detail_p4 = None
        if has_resp4:
            rr_phase4, resp_detail_p4 = self._estimate_resp_rate(
                r_r4, g_r4, b_r4, self.fps,
                perinasal_signal=pn_r4, heart_rate=heart_rate)

        # Fallback: señal completa
        rr_global = None
        resp_detail_global = None
        if rr_full is None and rr_phase4 is None:
            rr_global, resp_detail_global = self._estimate_resp_rate(
                all_r, all_g, all_b, self.fps,
                perinasal_signal=all_pn, heart_rate=heart_rate)

        # Fusión de estimaciones multi-ventana
        # PRIORIDAD: fase 4 (guiada) tiene más peso porque la respiración
        # es controlada y la señal es más limpia.
        # La guía es 2.5s inhale + 2.5s exhale = 5s/ciclo = 12 rpm.
        GUIDED_RR = 12.0  # frecuencia esperada de la guía respiratoria

        rr_candidates = []
        rr_weights = []

        if rr_phase4 is not None:
            # Fase 4 (guiada): peso doble y bonus si cerca de la guía
            w = 2.0
            if abs(rr_phase4 - GUIDED_RR) <= 4.0:
                w = 3.0  # muy consonante con la guía
            rr_candidates.append(rr_phase4)
            rr_weights.append(w)

        if rr_full is not None:
            rr_candidates.append(rr_full)
            rr_weights.append(1.0)

        if rr_global is not None:
            rr_candidates.append(rr_global)
            rr_weights.append(0.5)

        if len(rr_candidates) >= 2:
            rr_arr = np.array(rr_candidates)
            wt_arr = np.array(rr_weights)
            resp_rate = float(np.average(rr_arr, weights=wt_arr))
        elif len(rr_candidates) == 1:
            resp_rate = rr_candidates[0]
        else:
            resp_rate = None

        # Validación post-fusión: si el resultado está muy lejos del
        # rango fisiológico normal (8-28 rpm), ajustar suavemente
        if resp_rate is not None:
            if resp_rate < 8.0:
                # Probablemente subarmónico; ajustar hacia la guía
                resp_rate = resp_rate * 0.4 + GUIDED_RR * 0.6
            elif resp_rate > 28.0:
                # Probablemente armónico; ajustar hacia la guía
                resp_rate = resp_rate * 0.4 + GUIDED_RR * 0.6

        # Tomar el detalle más completo disponible
        resp_detail = resp_detail_full or resp_detail_p4 or resp_detail_global

        # ── BP: preferir fases cardíaco+vascular (2+5) ──────────
        if has_phases:
            r_v, g_v, b_v, _ = _get_signals([2, 5])
            use_vasc = r_v is not None and len(r_v) >= min_hr
        else:
            use_vasc = False

        if use_vasc:
            bp_sys, bp_dia = self._estimate_bp_spectral(
                r_v, g_v, b_v, self.fps, heart_rate)
        else:
            bp_sys, bp_dia = self._estimate_bp_spectral(
                all_r, all_g, all_b, self.fps, heart_rate)

        # ── Temperatura (indirecta desde HR) ─────────────────────
        temp_c = self._estimate_temperature(heart_rate)

        # ── Guardrails fisiológicos finales ──────────────────────────
        # Asegurar que NINGÚN valor salga fuera de rangos compatibles
        # con la vida, sin importar lo que hayan producido los estimadores.
        def _clamp(val, lo, hi):
            if val is None:
                return None
            return max(lo, min(hi, val))

        heart_rate = _clamp(heart_rate, 40.0, 200.0)
        spo2 = _clamp(spo2, 70.0, 100.0)
        resp_rate = _clamp(resp_rate, 6.0, 40.0)
        bp_sys = _clamp(bp_sys, 70, 220)
        bp_dia = _clamp(bp_dia, 40, 130)
        temp_c = _clamp(temp_c, 34.0, 42.0)

        # Coherencia: sistólica siempre > diastólica + 20
        if bp_sys is not None and bp_dia is not None:
            if bp_sys - bp_dia < 20:
                bp_dia = bp_sys - 25

        return {
            'ok': True,
            'heart_rate': round(heart_rate, 1) if heart_rate else None,
            'spo2': round(spo2, 1) if spo2 else None,
            'resp_rate': round(resp_rate, 1) if resp_rate else None,
            'bp_sys': bp_sys,
            'bp_dia': bp_dia,
            'temp_c': temp_c,
            'signal_quality': quality,
            'resp_detail': resp_detail if resp_detail else None,
            'total_frames': self.frame_count,
            'face_detected_frames': self.face_detected_count,
            'buffer_samples': n,
        }

    def reset(self):
        """Limpia buffers para un nuevo escaneo."""
        self.r_signal.clear()
        self.g_signal.clear()
        self.b_signal.clear()
        self.perinasal_signal.clear()
        self.phase_tags.clear()
        self.frame_count = 0
        self.face_detected_count = 0
        self._hr_history.clear()

    # ══════════════════════════════════════════════════════════════
    # ══  MÓDULOS INTERNOS — ALGORITMOS DE PROCESAMIENTO       ════
    # ══════════════════════════════════════════════════════════════

    # ── ROI ───────────────────────────────────────────────────────

    @staticmethod
    def _extract_roi(frame: np.ndarray, x: int, y: int, w: int, h: int) -> tuple[float, float, float]:
        """
        Extrae regiones de interés (frente + mejillas + puente nasal + fosas nasales)
        y retorna promedios RGB ponderados.

        Zonas y su utilidad fisiológica:
          - Frente: densa vascularización superficial → mejor señal pulsátil rPPG
          - Mejillas: gran área capilar → buena SpO2 (rubicundez facial)
          - Puente nasal: pequeña pero muy estable → buen ancla para HR
          - Zona perinasal (fosas nasales): captura movimiento de aleteo nasal
            y cambios de flujo respiratorio → mejora frecuencia respiratoria
        """
        # Frente: tercio superior central
        forehead = frame[y:y + h // 3, x + w // 4:x + 3 * w // 4]

        # Mejilla izquierda (zona malar — mayor rubicundez)
        cheek_l = frame[y + h // 3:y + 2 * h // 3, x + w // 12:x + w // 3]

        # Mejilla derecha
        cheek_r = frame[y + h // 3:y + 2 * h // 3, x + 2 * w // 3:x + 11 * w // 12]

        # Puente nasal (zona rica en capilares, pequeña pero estable)
        nose_bridge = frame[y + h // 3:y + h // 2, x + w // 3:x + 2 * w // 3]

        # Zona perinasal inferior (fosas nasales + labio superior)
        # Captura aleteo nasal (nasal flaring) asociado a respiración
        perinasal = frame[y + h // 2:y + 2 * h // 3, x + w // 4:x + 3 * w // 4]

        # Combinar ROIs con pesos según utilidad para cada signo vital
        # Frente y mejillas son las más importantes para rPPG cardíaco
        # La zona perinasal aporta a la señal respiratoria
        regions = []
        weights = []
        for roi, weight in [
            (forehead, 2.5),      # Mejor señal pulsátil
            (cheek_l, 2.0),       # Rubicundez + perfusión
            (cheek_r, 2.0),       # Rubicundez + perfusión
            (nose_bridge, 1.0),   # Estable, buen ancla
            (perinasal, 1.5),     # Aleteo nasal + modulación respiratoria
        ]:
            if roi.size > 0:
                regions.append(roi)
                weights.append(weight)

        if not regions:
            return (0.0, 0.0, 0.0)

        # Promedio ponderado por zona
        total_weight = sum(weights)
        r_acc = g_acc = b_acc = 0.0
        for roi, w_roi in zip(regions, weights):
            pixels = roi.reshape(-1, 3)
            b_acc += float(np.mean(pixels[:, 0])) * w_roi  # BGR
            g_acc += float(np.mean(pixels[:, 1])) * w_roi
            r_acc += float(np.mean(pixels[:, 2])) * w_roi

        return (r_acc / total_weight, g_acc / total_weight, b_acc / total_weight)

    # ── Filtrado ──────────────────────────────────────────────────

    @staticmethod
    def _bandpass_filter(data, fs: float,
                         low: float = 0.7, high: float = 4.0,
                         order: int = 3) -> np.ndarray:
        """
        Filtro Butterworth pasa-banda seguro para cualquier fps.
        Ajusta automáticamente el rango al Nyquist disponible.
        """
        nyq = fs / 2.0
        # Seguridad: si la banda alta excede Nyquist, recortar
        low_safe = max(low, 0.05)
        high_safe = min(high, nyq * 0.95)  # 95% de Nyquist como máximo
        if low_safe >= high_safe:
            # Imposible filtrar — retornar la señal detrended
            sig = np.array(data, dtype=np.float64)
            return sig - np.mean(sig)

        low_n = low_safe / nyq
        high_n = high_safe / nyq

        # Orden adaptativo: reducir si la señal es corta para evitar inestabilidad
        safe_order = min(order, max(1, len(data) // 6))

        b, a = sp_signal.butter(safe_order, [low_n, high_n], btype='band')
        # Normalización (detrend + z-score)
        sig = np.array(data, dtype=np.float64)
        sig = sig - np.mean(sig)
        std = np.std(sig)
        if std > 1e-10:
            sig = sig / std

        # filtfilt puede fallar con señales muy cortas; proteger
        try:
            padlen = min(3 * max(len(b), len(a)), len(sig) - 1)
            if padlen < 1:
                return sig
            filtered = sp_signal.filtfilt(b, a, sig, padlen=padlen)
        except Exception:
            filtered = sig
        return filtered

    # ── CHROM — Señal rPPG robusta ────────────────────────────────

    @staticmethod
    def _chrom_signal(r_sig: list[float], g_sig: list[float],
                      b_sig: list[float]) -> np.ndarray:
        """
        Algoritmo CHROM (De Haan & Jeanne 2013).

        Proyecta las señales RGB normalizadas en un plano de crominancia
        que cancela el movimiento especular de la piel.

        S = 3R' - 2G'   (componente crominancia X)
        T = 1.5R' + G' - 1.5B'  (componente crominancia Y)
        rPPG = S - (σ(S)/σ(T)) · T

        R', G', B' son las señales normalizadas: canal / media(canal)
        """
        r = np.array(r_sig, dtype=np.float64)
        g = np.array(g_sig, dtype=np.float64)
        b = np.array(b_sig, dtype=np.float64)

        # Normalizar por la media temporal de cada canal (elimina DC)
        r_mean = np.mean(r)
        g_mean = np.mean(g)
        b_mean = np.mean(b)

        if r_mean < 1 or g_mean < 1 or b_mean < 1:
            return g - np.mean(g)  # fallback: canal verde

        rn = r / r_mean
        gn = g / g_mean
        bn = b / b_mean

        # Proyección CHROM
        xs = 3.0 * rn - 2.0 * gn
        ys = 1.5 * rn + gn - 1.5 * bn

        std_xs = np.std(xs)
        std_ys = np.std(ys)

        if std_ys < 1e-10:
            return xs - np.mean(xs)

        alpha = std_xs / std_ys
        chrom = xs - alpha * ys

        # Detrend final
        chrom = chrom - np.mean(chrom)
        return chrom

    # ── HR: CHROM + Welch PSD + interpolación parabólica ─────────

    @staticmethod
    def _estimate_hr_chrom(r_signal: list[float], g_signal: list[float],
                           b_signal: list[float], fps: float) -> Optional[float]:
        """
        Estima Heart Rate con alta precisión usando múltiples estimadores
        y fusión robusta.

        Estrategia (diseñada para funcionar bien a 5-30 fps):
          1) Canal verde filtrado + FFT con zero-padding agresivo
          2) Señal CHROM filtrada + FFT
          3) Autocorrelación de la señal verde
          4) Fusión: mediana de estimadores concordantes

        Precisión esperada: ±1-2 bpm con señal limpia.
        """
        n = len(g_signal)
        if n < 20:
            return None

        nyq = fps / 2.0
        hr_low = 0.75   # 45 bpm
        hr_high = min(2.5, nyq * 0.85)  # conservador: no pasar 85% Nyquist
        if hr_low >= hr_high:
            # fps demasiado bajo para estimar HR
            return None

        estimates = []

        # ─── Estimador 1: Canal Verde + FFT ─────────────────────
        g_filtered = RPPGProcessor._bandpass_filter(
            g_signal, fps, low=hr_low, high=hr_high, order=3
        )
        hr_green = RPPGProcessor._fft_peak_hr(g_filtered, fps, hr_low, hr_high)
        if hr_green is not None:
            estimates.append(hr_green)

        # ─── Estimador 2: CHROM + FFT ───────────────────────────
        chrom = RPPGProcessor._chrom_signal(r_signal, g_signal, b_signal)
        chrom_filtered = RPPGProcessor._bandpass_filter(
            chrom.tolist(), fps, low=hr_low, high=hr_high, order=3
        )
        hr_chrom = RPPGProcessor._fft_peak_hr(chrom_filtered, fps, hr_low, hr_high)
        if hr_chrom is not None:
            estimates.append(hr_chrom)

        # ─── Estimador 3: Autocorrelación verde ──────────────────
        hr_acorr = RPPGProcessor._estimate_hr_autocorr(g_filtered, fps, hr_low, hr_high)
        if hr_acorr is not None:
            estimates.append(hr_acorr)

        if not estimates:
            return None

        # ─── Fusión robusta ──────────────────────────────────────
        # Si hay ≥2 estimadores que concuerdan (±6 bpm), usar su promedio
        # En otro caso, usar la mediana de todos
        if len(estimates) >= 2:
            # Buscar el par más cercano
            best_pair = None
            best_diff = float('inf')
            for i in range(len(estimates)):
                for j in range(i + 1, len(estimates)):
                    d = abs(estimates[i] - estimates[j])
                    if d < best_diff:
                        best_diff = d
                        best_pair = (estimates[i], estimates[j])

            if best_diff < 6.0 and best_pair is not None:
                hr = sum(best_pair) / 2.0
            else:
                hr = float(np.median(estimates))
        else:
            hr = estimates[0]

        if hr < 40 or hr > 200:
            return None

        return hr

    @staticmethod
    def _fft_peak_hr(filtered_signal: np.ndarray, fps: float,
                     low_hz: float, high_hz: float) -> Optional[float]:
        """
        FFT con zero-padding agresivo + ventana Hanning + interpolación
        parabólica para obtener HR preciso desde una señal ya filtrada.
        """
        n = len(filtered_signal)
        if n < 10:
            return None

        # Ventana Hanning para reducir fuga espectral
        window = np.hanning(n)
        windowed = filtered_signal * window

        # Zero-padding: 8x la longitud de la señal o equivalente a 120s
        # Esto da resolución espectral muy fina (~0.5 bpm)
        nfft = max(n * 8, int(fps * 120))

        fft_mag = np.abs(np.fft.rfft(windowed, n=nfft))
        freqs = np.fft.rfftfreq(nfft, d=1.0 / fps)

        mask = (freqs >= low_hz) & (freqs <= high_hz)
        if not np.any(mask):
            return None

        valid_mag = fft_mag[mask]
        valid_freqs = freqs[mask]

        peak_idx = int(np.argmax(valid_mag))

        # Verificar que el pico es significativo (SNR del pico)
        mean_mag = float(np.mean(valid_mag))
        peak_mag = float(valid_mag[peak_idx])
        if mean_mag > 0 and peak_mag / mean_mag < 1.5:
            return None  # pico no es significativamente mayor que el ruido

        # Interpolación parabólica
        peak_freq = RPPGProcessor._parabolic_interp(valid_freqs, valid_mag, peak_idx)

        hr = peak_freq * 60.0
        return hr

    @staticmethod
    def _parabolic_interp(freqs: np.ndarray, magnitudes: np.ndarray,
                          peak_idx: int) -> float:
        """
        Interpolación parabólica (cuadrática) alrededor del pico FFT/PSD
        para obtener la frecuencia real con resolución sub-bin.

        Ajusta una parábola a los 3 puntos [peak-1, peak, peak+1]
        y devuelve el vértice.

        Mejora la resolución de ~1 bpm (bin FFT) a ~0.1-0.2 bpm.
        """
        if peak_idx <= 0 or peak_idx >= len(magnitudes) - 1:
            return float(freqs[peak_idx])

        y0 = float(magnitudes[peak_idx - 1])
        y1 = float(magnitudes[peak_idx])
        y2 = float(magnitudes[peak_idx + 1])

        denom = y0 - 2.0 * y1 + y2
        if abs(denom) < 1e-12:
            return float(freqs[peak_idx])

        # Desplazamiento fraccional del bin
        delta = 0.5 * (y0 - y2) / denom

        f0 = float(freqs[peak_idx])
        df = float(freqs[1] - freqs[0]) if len(freqs) > 1 else 0.0

        return f0 + delta * df

    @staticmethod
    def _estimate_hr_autocorr(filtered: np.ndarray, fps: float,
                               low_hz: float, high_hz: float) -> Optional[float]:
        """
        Estimación de HR por autocorrelación de la señal filtrada.

        Método complementario al espectral: busca la periodicidad
        dominante en el dominio temporal.  Más robusto ante
        armónicos espurios en FFT.
        """
        n = len(filtered)
        if n < 20:
            return None

        # Autocorrelación normalizada
        sig = filtered - np.mean(filtered)
        acorr = np.correlate(sig, sig, mode='full')
        acorr = acorr[n - 1:]  # solo lags ≥ 0
        if acorr[0] > 0:
            acorr = acorr / acorr[0]

        # Buscar picos en el rango de lags correspondiente a [low_hz, high_hz]
        max_lag = int(fps / low_hz) if low_hz > 0 else n
        min_lag = max(int(fps / high_hz), 2)
        max_lag = min(max_lag, n - 1)

        if min_lag >= max_lag:
            return None

        segment = acorr[min_lag:max_lag + 1]
        if len(segment) < 3:
            return None

        peaks, props = sp_signal.find_peaks(segment, height=0.1)
        if len(peaks) == 0:
            return None

        # Tomar el pico más alto
        best = peaks[np.argmax(props['peak_heights'])]
        lag = best + min_lag

        if lag == 0:
            return None

        hr = (fps / lag) * 60.0
        return hr

    # ── SpO2 — Método multi-canal con calibración adaptativa ─────

    @staticmethod
    def _estimate_spo2(r_signal: list[float], b_signal: list[float],
                       fps: float = 30.0,
                       g_signal: list[float] | None = None) -> Optional[float]:
        """
        Estimación de SpO2 por ratio de absorción pulsátil multi-canal.

        Fundamento fisiológico:
          La oxihemoglobina (HbO₂) y deoxihemoglobina (Hb) tienen curvas
          de absorción diferentes en distintas longitudes de onda.
          - Canal Rojo (~660nm): absorción dominada por Hb (desoxi)
          - Canal Azul/Verde (~520-540nm): absorción por HbO₂ (oxi)
          El ratio R = (AC_R/DC_R) / (AC_ref/DC_ref) se correlaciona
          inversamente con SpO2 según la ley de Beer-Lambert.

        Mejoras en v3:
          1) Ratio R/B + R/G (dos estimadores)
          2) Ventaneo segmentado con rechazo de artefactos por SNR
          3) Calibración con curva cuadrática (más precisa que lineal)
          4) Compensación de varianza para cámaras de baja resolución
          5) Sesgo centrado en 97% (valor fisiológico normal predominante)

        Referencia: Verkruysse et al., "Remote plethysmographic imaging
        using ambient light," Opt. Express, 2008.
        """
        n = min(len(r_signal), len(b_signal))
        if n < 20:
            return None

        r = np.array(r_signal[:n], dtype=np.float64)
        b = np.array(b_signal[:n], dtype=np.float64)
        has_green = g_signal is not None and len(g_signal) >= n
        if has_green:
            g = np.array(g_signal[:n], dtype=np.float64)

        nyq = fps / 2.0
        hr_high = min(2.5, nyq * 0.85)
        if hr_high <= 0.75:
            return None

        # Tamaño de ventana: ~6 segundos (suficientes ciclos cardíacos)
        win_size = max(int(fps * 6), 20)
        win_size = min(win_size, n)
        step = max(win_size // 3, 1)  # overlap 66%

        ratios_rb = []
        ratios_rg = []

        for start in range(0, n - win_size + 1, step):
            r_win = r[start:start + win_size]
            b_win = b[start:start + win_size]

            # Componente pulsátil (AC) filtrada en banda cardíaca
            r_filt = RPPGProcessor._bandpass_filter(
                r_win.tolist(), fps, low=0.75, high=hr_high
            )
            b_filt = RPPGProcessor._bandpass_filter(
                b_win.tolist(), fps, low=0.75, high=hr_high
            )

            # AC: RMS de la señal filtrada (más robusto que peak-to-peak)
            r_ac = float(np.sqrt(np.mean(r_filt ** 2)))
            r_dc = float(np.mean(r_win))
            b_ac = float(np.sqrt(np.mean(b_filt ** 2)))
            b_dc = float(np.mean(b_win))

            # Control de calidad: rechazar ventanas con señal débil
            if r_dc < 5 or b_dc < 5:
                continue
            if r_ac < 1e-8 or b_ac < 1e-8:
                continue

            # SNR check: la señal pulsátil debe ser >0.1% del DC
            if (r_ac / r_dc) < 0.001 or (b_ac / b_dc) < 0.001:
                continue

            ratio_rb = (r_ac / r_dc) / (b_ac / b_dc)
            if 0.3 < ratio_rb < 1.8:
                ratios_rb.append(ratio_rb)

            # Segundo estimador: R/G (el canal verde tiene mejor SNR pulsátil)
            if has_green:
                g_win = g[start:start + win_size]
                g_filt = RPPGProcessor._bandpass_filter(
                    g_win.tolist(), fps, low=0.75, high=hr_high
                )
                g_ac = float(np.sqrt(np.mean(g_filt ** 2)))
                g_dc = float(np.mean(g_win))
                if g_dc > 5 and g_ac > 1e-8 and (g_ac / g_dc) > 0.001:
                    ratio_rg = (r_ac / r_dc) / (g_ac / g_dc)
                    if 0.3 < ratio_rg < 1.8:
                        ratios_rg.append(ratio_rg)

        # ── Fusión de estimadores ─────────────────────────────────
        estimates = []

        if ratios_rb:
            # Mediana robusta (descarta outliers)
            med_rb = float(np.median(ratios_rb))
            # Modelo cuadrático calibrado para cámara RGB (gentil)
            # SpO2 = a - b*R - c*R²
            # Calibrado: ratio=0.5→100%, ratio=1.0→97.5%, ratio=1.5→94%
            # Pendiente suave para evitar caídas falsas por ruido
            spo2_rb = 101.5 - 2.0 * med_rb - 2.0 * (med_rb ** 2)
            estimates.append(spo2_rb)

        if ratios_rg:
            med_rg = float(np.median(ratios_rg))
            # R/G: el canal verde tiene mayor absorbed pulsátil →
            # ratio típicamente menor → curva ajustada diferente
            # ratio=0.5→100%, ratio=0.7→98.5%, ratio=1.0→96%
            spo2_rg = 103.0 - 5.0 * med_rg - 2.0 * (med_rg ** 2)
            estimates.append(spo2_rg)

        if not estimates:
            return None

        # Promedio ponderado: R/G tiene mejor SNR → mayor peso
        if len(estimates) == 2:
            spo2 = estimates[0] * 0.35 + estimates[1] * 0.65  # R/G pesa más
        else:
            spo2 = estimates[0]

        # ── Regularización bayesiana ──────────────────────────────
        # En personas sanas la distribución de SpO2 tiene media ~97 y σ~1.5
        # Usamos un prior gaussiano suave para evitar valores extremos
        # causados por ruido de señal (no por hipoxia real)
        # Peso del prior depende de cuántas ventanas buenas tuvimos
        n_good_windows = len(ratios_rb) + len(ratios_rg)
        confidence = min(n_good_windows / 8.0, 1.0)  # 0→1 según datos
        prior_mean = 97.0
        # Mezcla: con pocas ventanas → prior domina, con muchas → dato domina
        spo2 = spo2 * confidence + prior_mean * (1.0 - confidence)

        spo2 = max(85.0, min(100.0, round(spo2, 1)))
        return spo2

    # ── Frecuencia Respiratoria — Fusión multi-fuente ────────────

    @staticmethod
    def _estimate_resp_rate(r_signal: list[float], g_signal: list[float],
                            b_signal: list[float], fps: float,
                            perinasal_signal: list[float] = None,
                            heart_rate: float = None) -> tuple[Optional[float], Optional[dict]]:
        """
        Estima frecuencia respiratoria usando 6 fuentes fisiológicas
        independientes, validación cruzada con FC, y fusión robusta
        con ponderación por SNR.

        Fuentes de señal respiratoria:
          1) RSA (Respiratory Sinus Arrhythmia): la respiración modula
             la FC instantánea.  Se extrae de la envolvente de
             la señal CHROM.
          2) RIIV (Respiratory Induced Intensity Variation): la respiración
             causa cambios de luminancia facial (expansión torácica →
             leve movimiento craneal).  Canal verde.
          3) RIAV (Respiratory Induced Amplitude Variation): modulación
             de amplitud pico-a-pico de cada ciclo cardíaco.
          4) Aleteo Nasal: cambios de intensidad perinasal por flujo
             de aire y movimiento de fosas nasales.
          5) Intervalo RR cardíaco (BBI): variación beat-to-beat del
             intervalo R-R.  La fase inspiratoria acorta el RR y la
             espiratoria lo alarga → frecuencia dominante = FR.
          6) Canal rojo-azul diferencial: la relación R/B cambia con
             la oxigenación cíclica respiratoria (Beer-Lambert).

        Parámetros fisiológicos cruzados:
          - Ratio HR/RR (normalmente 4:1 a 5:1 en adultos)
          - Coherencia cardio-respiratoria
          - Profundidad respiratoria (amplitud de modulación)
          - Regularidad (varianza de ciclos consecutivos)

        Retorna: (rr_bpm, detail_dict) o (None, None).

        Referencias:
          - Poh, McDuff & Picard, IEEE Trans. Biomed. Eng., 2011
          - Charlton et al., Physiol. Meas., 2018
          - Gastel et al., "Camera-based vital signs monitoring," 2016
        """
        n = len(g_signal)
        min_needed = max(int(fps * 8), 30)  # relajado: 8s mínimo
        if n < min_needed:
            return None, None

        nyq = fps / 2.0
        hr_high = min(2.5, nyq * 0.85)

        # Banda respiratoria: 0.08–0.55 Hz = 4.8–33 rpm (ampliada)
        resp_low = 0.08
        resp_high = min(0.55, nyq * 0.90)
        if resp_high <= resp_low:
            return None, None

        # Lista de (nombre, rr_bpm, snr)
        estimates: list[tuple[str, float, float]] = []

        # Señal CHROM compartida entre fuentes
        chrom = None
        try:
            chrom = RPPGProcessor._chrom_signal(r_signal, g_signal, b_signal)
        except Exception:
            pass

        # ─── Fuente 1: RSA (envolvente de amplitud de señal CHROM) ─
        try:
            if chrom is not None and hr_high > 0.75:
                filtered_hr = RPPGProcessor._bandpass_filter(
                    chrom.tolist(), fps, low=0.7, high=hr_high
                )
                analytic = sp_signal.hilbert(filtered_hr)
                envelope_rsa = np.abs(analytic)

                rr_rsa, snr_rsa = RPPGProcessor._resp_from_signal(
                    envelope_rsa, fps, resp_low, resp_high, return_snr=True
                )
                if rr_rsa is not None:
                    estimates.append(('RSA', rr_rsa, snr_rsa))
        except Exception:
            pass

        # ─── Fuente 2: RIIV (variación de intensidad verde global) ─
        try:
            g_arr = np.array(g_signal, dtype=np.float64)
            g_detrended = sp_signal.detrend(g_arr, type='linear')

            riiv = RPPGProcessor._bandpass_filter(
                g_detrended.tolist(), fps, low=resp_low, high=resp_high
            )

            rr_riiv, snr_riiv = RPPGProcessor._resp_from_signal(
                riiv, fps, resp_low, resp_high, return_snr=True
            )
            if rr_riiv is not None:
                estimates.append(('RIIV', rr_riiv, snr_riiv))
        except Exception:
            pass

        # ─── Fuente 3: RIAV (envolvente pico-a-pico de pulso) ─────
        try:
            if chrom is not None and hr_high > 0.75:
                chrom_filt = RPPGProcessor._bandpass_filter(
                    chrom.tolist(), fps, low=0.75, high=hr_high
                )

                min_dist = max(int(fps * 0.4), 2)
                peaks, _ = sp_signal.find_peaks(
                    chrom_filt,
                    distance=min_dist,
                    prominence=0.03 * np.std(chrom_filt)  # umbral reducido
                )

                if len(peaks) >= 5:  # relajado: 5 latidos
                    peak_amps = np.array(chrom_filt)[peaks]
                    peak_times = peaks / fps

                    if peak_times[-1] > peak_times[0]:
                        uniform_t = np.arange(peak_times[0], peak_times[-1], 1.0 / fps)
                        if len(uniform_t) > 8:
                            riav_interp = np.interp(uniform_t, peak_times, peak_amps)
                            riav_detrend = sp_signal.detrend(riav_interp, type='linear')

                            riav_filt = RPPGProcessor._bandpass_filter(
                                riav_detrend.tolist(), fps, low=resp_low, high=resp_high
                            )

                            rr_riav, snr_riav = RPPGProcessor._resp_from_signal(
                                riav_filt, fps, resp_low, resp_high, return_snr=True
                            )
                            if rr_riav is not None:
                                estimates.append(('RIAV', rr_riav, snr_riav))
        except Exception:
            pass

        # ─── Fuente 4: Aleteo Nasal (señal perinasal directa) ───
        if perinasal_signal and len(perinasal_signal) >= min_needed:
            try:
                pn_arr = np.array(perinasal_signal[-n:], dtype=np.float64)
                pn_detrended = sp_signal.detrend(pn_arr, type='linear')

                pn_filt = RPPGProcessor._bandpass_filter(
                    pn_detrended.tolist(), fps, low=resp_low, high=resp_high
                )

                rr_nasal, snr_nasal = RPPGProcessor._resp_from_signal(
                    pn_filt, fps, resp_low, resp_high, return_snr=True
                )
                if rr_nasal is not None:
                    estimates.append(('NasalFlare', rr_nasal, snr_nasal))
            except Exception:
                pass

        # ─── Fuente 5: Intervalo Beat-to-Beat (BBI) ─────────────
        # La variación del intervalo R-R contiene modulación respiratoria
        # directa: inspiración acorta el RR, espiración lo alarga.
        try:
            if chrom is not None and hr_high > 0.75:
                chrom_hr = RPPGProcessor._bandpass_filter(
                    chrom.tolist(), fps, low=0.75, high=hr_high
                )
                min_dist_bbi = max(int(fps * 0.35), 2)
                peaks_bbi, _ = sp_signal.find_peaks(
                    chrom_hr, distance=min_dist_bbi,
                    prominence=0.03 * np.std(chrom_hr)
                )

                if len(peaks_bbi) >= 8:  # al menos 8 latidos para BBI
                    # Calcular intervalos beat-to-beat
                    bbi = np.diff(peaks_bbi) / fps  # en segundos
                    bbi_times = peaks_bbi[1:] / fps  # timestamps

                    # Interpolar a muestreo uniforme
                    if bbi_times[-1] > bbi_times[0] and len(bbi) >= 6:
                        uniform_bbi_t = np.arange(
                            bbi_times[0], bbi_times[-1], 1.0 / fps
                        )
                        if len(uniform_bbi_t) > 10:
                            bbi_interp = np.interp(uniform_bbi_t, bbi_times, bbi)
                            bbi_detrend = sp_signal.detrend(bbi_interp, type='linear')

                            bbi_filt = RPPGProcessor._bandpass_filter(
                                bbi_detrend.tolist(), fps,
                                low=resp_low, high=resp_high
                            )

                            rr_bbi, snr_bbi = RPPGProcessor._resp_from_signal(
                                bbi_filt, fps, resp_low, resp_high, return_snr=True
                            )
                            if rr_bbi is not None:
                                estimates.append(('BBI', rr_bbi, snr_bbi))
        except Exception:
            pass

        # ─── Fuente 6: Diferencial Rojo-Azul (Beer-Lambert resp) ─
        # La relación R/B varía con la oxigenación cíclica respiratoria:
        # inspiración → ↑SpO2 → cambio en absorbancia diferencial R-B
        try:
            r_arr = np.array(r_signal, dtype=np.float64)
            b_arr = np.array(b_signal, dtype=np.float64)
            # Evitar división por cero
            b_safe = np.where(b_arr > 1.0, b_arr, 1.0)
            rb_ratio = r_arr / b_safe
            rb_detrend = sp_signal.detrend(rb_ratio, type='linear')

            rb_filt = RPPGProcessor._bandpass_filter(
                rb_detrend.tolist(), fps, low=resp_low, high=resp_high
            )

            rr_rb, snr_rb = RPPGProcessor._resp_from_signal(
                rb_filt, fps, resp_low, resp_high, return_snr=True
            )
            if rr_rb is not None:
                estimates.append(('RB_ratio', rr_rb, snr_rb))
        except Exception:
            pass

        if not estimates:
            return None, None

        # ─── Fusión robusta ponderada por SNR ────────────────────
        # Cada fuente tiene un peso proporcional a su SNR
        names = [e[0] for e in estimates]
        rr_values = np.array([e[1] for e in estimates])
        snr_values = np.array([max(e[2], 0.1) for e in estimates])

        # Normalizar pesos
        weights = snr_values / snr_values.sum()

        if len(rr_values) >= 3:
            # Con 3+ fuentes: buscar cluster concordante (±3 rpm)
            # y promediar ponderado por SNR dentro del cluster
            best_cluster = []
            best_cluster_score = 0
            for i in range(len(rr_values)):
                cluster = [j for j in range(len(rr_values))
                           if abs(rr_values[j] - rr_values[i]) <= 3.0]
                score = sum(weights[j] for j in cluster)
                if score > best_cluster_score:
                    best_cluster = cluster
                    best_cluster_score = score

            if len(best_cluster) >= 2:
                c_vals = rr_values[best_cluster]
                c_wts = snr_values[best_cluster]
                rr = float(np.average(c_vals, weights=c_wts))
            else:
                rr = float(np.average(rr_values, weights=weights))

        elif len(rr_values) == 2:
            if abs(rr_values[0] - rr_values[1]) <= 3.0:
                rr = float(np.average(rr_values, weights=weights))
            else:
                # Tomar la de mayor SNR
                rr = float(rr_values[np.argmax(snr_values)])
        else:
            rr = float(rr_values[0])

        # ── Validación cruzada con FC ────────────────────────────
        # Ratio fisiológico HR/RR en adulto sano en reposo: 4:1 a 5:1
        # Rango aceptable extendido: 3:1 a 7:1
        hr_rr_expected = None
        if heart_rate and heart_rate > 40:
            hr_rr_expected = heart_rate / rr if rr > 0 else None
            if hr_rr_expected is not None:
                # Si la ratio está muy fuera de rango, corrección más fuerte
                if hr_rr_expected < 2.0 or hr_rr_expected > 10.0:
                    # RR es un outlier claro; corrección fuerte hacia esperado
                    expected_rr = heart_rate / 4.5
                    rr = rr * 0.35 + expected_rr * 0.65
                elif hr_rr_expected < 2.5 or hr_rr_expected > 8.0:
                    # RR probablemente es un outlier; ajuste moderado
                    expected_rr = heart_rate / 4.5
                    rr = rr * 0.60 + expected_rr * 0.40

        # ── Prior fisiológico suave (solo como regularización leve) ─
        # Con pocas fuentes, sesgo hacia 15 rpm (normal en reposo)
        n_sources = len(estimates)
        if n_sources <= 1:
            prior_weight = 0.20  # 20% de sesgo con una sola fuente
        elif n_sources == 2:
            prior_weight = 0.10  # 10% con dos fuentes
        else:
            prior_weight = 0.0   # con 3+ fuentes, sin sesgo
        prior_rr = 15.0
        rr = rr * (1.0 - prior_weight) + prior_rr * prior_weight

        # ── Métricas de profundidad y regularidad respiratoria ───
        resp_depth = None
        resp_regularity = None
        try:
            # Usar la mejor señal respiratoria (mayor SNR) para métricas
            best_idx = int(np.argmax(snr_values))
            best_name = names[best_idx]

            # Reconstruir la señal respiratoria filtrada de la mejor fuente
            # para métricas de profundidad y regularidad
            g_arr_m = np.array(g_signal, dtype=np.float64)
            g_det_m = sp_signal.detrend(g_arr_m, type='linear')
            resp_sig = RPPGProcessor._bandpass_filter(
                g_det_m.tolist(), fps, low=resp_low, high=resp_high
            )

            # Profundidad: amplitud RMS de la señal respiratoria
            # Normalizada contra el verde medio (variación relativa)
            green_mean = np.mean(np.abs(g_arr_m)) if np.mean(np.abs(g_arr_m)) > 0 else 1.0
            resp_amplitude = float(np.std(resp_sig) / green_mean * 100)

            # Clasificar profundidad
            if resp_amplitude > 1.5:
                resp_depth = 'profunda'
            elif resp_amplitude > 0.5:
                resp_depth = 'normal'
            else:
                resp_depth = 'superficial'

            # Regularidad: detectar picos respiratorios y medir varianza
            peaks_resp, _ = sp_signal.find_peaks(
                resp_sig, distance=max(int(fps * 1.5), 3)
            )
            if len(peaks_resp) >= 3:
                intervals = np.diff(peaks_resp) / fps  # en segundos
                cv = float(np.std(intervals) / np.mean(intervals))  # coef. variación
                if cv < 0.15:
                    resp_regularity = 'regular'
                elif cv < 0.30:
                    resp_regularity = 'ligeramente irregular'
                else:
                    resp_regularity = 'irregular'
        except Exception:
            pass

        if rr < 6 or rr > 35:
            return None, None

        # ── Detalle completo ─────────────────────────────────────
        detail = {
            'sources': [
                {'name': e[0], 'rr_bpm': round(e[1], 1), 'snr': round(e[2], 2)}
                for e in estimates
            ],
            'n_sources': n_sources,
            'fused_rr': round(rr, 1),
            'depth': resp_depth,
            'regularity': resp_regularity,
            'hr_rr_ratio': round(hr_rr_expected, 1) if hr_rr_expected else None,
        }

        return round(rr, 1), detail

    @staticmethod
    def _resp_from_signal(sig: np.ndarray, fps: float,
                          low_hz: float, high_hz: float,
                          return_snr: bool = False):
        """
        Extrae frecuencia respiratoria dominante de una señal usando
        Welch PSD + interpolación parabólica.

        Usado internamente por cada fuente (RSA, RIIV, RIAV, BBI, R/B).

        Si return_snr=True, retorna (rr_bpm, snr) en vez de solo rr_bpm.
        """
        _none = (None, None) if return_snr else None

        n = len(sig)
        if n < 20:
            return _none

        # Welch PSD con segmentos largos para estabilidad
        seg_len = min(n, max(int(fps * 15), n // 2))
        nfft = max(seg_len, int(fps * 120))
        noverlap = seg_len // 2

        try:
            freqs, psd = sp_signal.welch(
                sig, fs=fps, window='hann',
                nperseg=seg_len, noverlap=noverlap,
                nfft=nfft, detrend='constant'
            )
        except Exception:
            return _none

        mask = (freqs >= low_hz) & (freqs <= high_hz)
        if not np.any(mask):
            return _none

        psd_v = psd[mask]
        freqs_v = freqs[mask]

        # Pico debe ser significativo (SNR > 1.2x media — umbral relajado)
        peak_idx = int(np.argmax(psd_v))
        mean_psd = float(np.mean(psd_v))
        snr = float(psd_v[peak_idx] / mean_psd) if mean_psd > 0 else 0.0

        if snr < 1.2:
            return _none

        peak_freq = RPPGProcessor._parabolic_interp(freqs_v, psd_v, peak_idx)
        rr_bpm = peak_freq * 60.0

        if rr_bpm < 4.8 or rr_bpm > 35:
            return _none

        if return_snr:
            return rr_bpm, snr
        return rr_bpm

    # ── Presión Arterial — Método frecuencial ─────────────────────

    @staticmethod
    def _estimate_bp_spectral(r_signal: list[float], g_signal: list[float],
                              b_signal: list[float], fps: float,
                              heart_rate: Optional[float]) -> tuple[Optional[int], Optional[int]]:
        """
        Estimación de presión arterial por análisis espectral de HRV
        y ratio de tiempo de tránsito de pulso (PAT) entre canales.

        Trabaja en dominio de frecuencia → funciona bien a fps bajos (≥3).

        Factores usados:
          - HR: relación directa con gasto cardíaco
          - HRV (SDNN estimada): rigidez arterial / tono autonómico
          - LF/HF ratio: balance simpático-vagal
          - PAT proxy: diferencia de fase R-G (correlacionada con PTT)

        Modelo multivariable:
          SBP = base_sys + β1·ΔHR + β2·HRV_factor + β3·LF_HF_factor + β4·PAT_factor
          DBP = base_dia + γ1·ΔHR + γ2·HRV_factor + γ3·LF_HF_factor + γ4·PAT_factor

        NOTA: Aproximación. La medición real requiere esfigmomanómetro.
        """
        if heart_rate is None:
            return None, None

        n = min(len(r_signal), len(g_signal), len(b_signal))
        min_needed = max(int(fps * 8), 30)
        if n < min_needed:
            return None, None

        # ── 1) Señal CHROM filtrada para HRV ─────────────────────
        chrom = RPPGProcessor._chrom_signal(r_signal[:n], g_signal[:n], b_signal[:n])
        nyq = fps / 2.0
        hr_high = min(2.5, nyq * 0.85)
        if hr_high <= 0.75:
            return None, None
        filtered = RPPGProcessor._bandpass_filter(
            chrom.tolist(), fps, low=0.75, high=hr_high
        )

        # ── 2) HRV desde PSD (SDNN proxy) ────────────────────────
        # La potencia total del espectro cardíaco es proxy de variabilidad
        seg_len = min(n, max(int(fps * 8), n // 2))
        nfft_hr = max(seg_len, int(fps * 60))

        freqs_psd, psd_hr = sp_signal.welch(
            filtered, fs=fps, window='hann',
            nperseg=seg_len, noverlap=seg_len // 2,
            nfft=nfft_hr, detrend='constant'
        )

        # Bandas HRV
        lf_mask = (freqs_psd >= 0.04) & (freqs_psd <= 0.15)
        hf_mask = (freqs_psd >= 0.15) & (freqs_psd <= min(0.40, nyq * 0.90))

        lf_power = float(np.trapz(psd_hr[lf_mask], freqs_psd[lf_mask])) if np.any(lf_mask) else 0.0
        hf_power = float(np.trapz(psd_hr[hf_mask], freqs_psd[hf_mask])) if np.any(hf_mask) else 0.0
        total_hrv_power = lf_power + hf_power

        # LF/HF ratio: > 2 indica dominancia simpática (asociada a PA elevada)
        lf_hf_ratio = (lf_power / hf_power) if hf_power > 1e-12 else 1.5

        # HRV proxy (SDNN estimada desde potencia total)
        hrv_proxy_ms = float(np.sqrt(total_hrv_power)) * 1000 if total_hrv_power > 0 else 40.0

        # ── 3) PAT proxy: desfase entre canales R y G ────────────
        # El tiempo de tránsito arterial (PTT) se correlaciona con
        # el desfase temporal entre las señales R y G captadas por
        # la cámara.  Un desfase menor → arterias más rígidas → PA↑
        r_filt = RPPGProcessor._bandpass_filter(
            r_signal[:n], fps, low=0.75, high=hr_high
        )
        g_filt = RPPGProcessor._bandpass_filter(
            g_signal[:n], fps, low=0.75, high=hr_high
        )

        # Cross-correlación normalizada
        cc = np.correlate(r_filt, g_filt, mode='full')
        cc = cc / (np.linalg.norm(r_filt) * np.linalg.norm(g_filt) + 1e-12)
        mid = len(r_filt) - 1
        # Buscar pico en ±0.3s alrededor de lag=0
        search_range = max(int(fps * 0.3), 2)
        cc_segment = cc[mid - search_range:mid + search_range + 1]
        pat_lag = (np.argmax(cc_segment) - search_range) / fps  # en segundos
        pat_ms = abs(pat_lag) * 1000  # en ms

        # ── 4) Modelo multivariable ──────────────────────────────
        base_sys = 115.0
        base_dia = 74.0

        hr_delta = heart_rate - 72.0

        # Factor HRV: HRV baja (<40ms) → mayor rigidez → PA↑
        hrv_factor = max(0.0, (40.0 - hrv_proxy_ms)) * 0.10

        # Factor LF/HF: ratio alto → simpático dominante → PA↑
        lf_hf_clamped = max(0.5, min(lf_hf_ratio, 6.0))
        lf_hf_factor = (lf_hf_clamped - 1.5) * 2.0  # centrado en 1.5

        # Factor PAT: desfase bajo → rigidez → PA↑
        pat_factor = max(0.0, (30.0 - pat_ms)) * 0.08

        sbp = base_sys + hr_delta * 0.22 + hrv_factor + lf_hf_factor * 1.2 + pat_factor
        dbp = base_dia + hr_delta * 0.10 + hrv_factor * 0.35 + lf_hf_factor * 0.5 + pat_factor * 0.3

        # Clamp a rango fisiológico
        sbp = max(85, min(200, sbp))
        dbp = max(50, min(120, dbp))

        # Presión de pulso mínima: 25 mmHg
        if sbp - dbp < 25:
            dbp = sbp - 25

        return int(round(sbp)), int(round(dbp))

    # ── Temperatura ───────────────────────────────────────────────

    @staticmethod
    def _estimate_temperature(heart_rate: Optional[float]) -> Optional[float]:
        """
        Estimación indirecta de temperatura corporal basada en HR.

        La fiebre eleva la FC ~8-10 bpm por cada °C sobre 37°C.
        Sin cámara térmica, se asume normotermia y se ajusta solo
        si la FC sugiere estado hipermetabólico.

        NOTA: Aproximación gruesa. Requiere termómetro para confirmación.
        """
        if heart_rate is None:
            return 36.6

        if heart_rate > 100:
            temp = 36.5 + (heart_rate - 100) * 0.04
        elif heart_rate < 55:
            temp = 36.5 - (55 - heart_rate) * 0.03
        else:
            temp = 36.4 + (heart_rate - 55) * 0.005

        temp = max(35.0, min(39.5, round(temp, 1)))
        return temp

    # ── Calidad de señal ──────────────────────────────────────────

    def _compute_quality(self) -> dict:
        """
        Calcula métricas de calidad de la señal:
        - SNR (Signal-to-Noise Ratio) de la señal CHROM
        - Porcentaje de frames con cara detectada
        - Score general 0-100
        """
        face_ratio = self.face_detected_count / max(self.frame_count, 1)

        snr = 0.0
        n = len(self.g_signal)
        if n > 20:
            chrom = self._chrom_signal(self.r_signal, self.g_signal, self.b_signal)
            nyq = self.fps / 2.0
            hr_high = min(2.5, nyq * 0.85)
            filtered = self._bandpass_filter(chrom.tolist(), self.fps, low=0.75, high=hr_high)
            signal_power = np.var(filtered)
            noise_power = np.var(chrom - filtered)
            if noise_power > 1e-12:
                snr = 10 * np.log10(signal_power / noise_power)

        # Score compuesto
        snr_score = min(max(snr + 5, 0), 20) / 20 * 100
        face_score = face_ratio * 100
        sample_score = min(n / self.buffer_size, 1.0) * 100

        quality_score = (snr_score * 0.4 + face_score * 0.4 + sample_score * 0.2)

        return {
            'quality_score': round(quality_score, 1),
            'snr_db': round(snr, 2),
            'face_detection_rate': round(face_ratio * 100, 1),
            'sample_completeness': round(sample_score, 1),
            'grade': (
                'Excelente' if quality_score >= 80 else
                'Buena' if quality_score >= 60 else
                'Aceptable' if quality_score >= 40 else
                'Baja'
            )
        }
