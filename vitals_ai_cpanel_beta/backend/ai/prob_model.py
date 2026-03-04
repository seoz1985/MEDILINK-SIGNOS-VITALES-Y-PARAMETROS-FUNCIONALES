"""Modelo probabilístico (calibrado) para hipótesis clínicas.

Nota:
- En Beta, si no hay modelo entrenado, se retorna un scoring basado en reglas.
"""

import os
import math
import joblib
from config import settings


class ProbModel:
    def __init__(self):
        self.model = None
        path = settings.TRIAGE_MODEL_PATH
        if path and os.path.exists(path):
            self.model = joblib.load(path)

    def available(self) -> bool:
        return self.model is not None

    def predict(self, x: list[float]):
        proba = self.model.predict_proba([x])[0]
        labels = getattr(self.model, 'classes_', [])
        return [{
            'label': str(lbl),
            'probability': float(p)
        } for lbl, p in zip(labels, proba)]


# ── helpers ──────────────────────────────────────────────────────

def _clamp(v: float, lo: float = 0.0, hi: float = 0.95) -> float:
    return max(lo, min(hi, v))


def _sigmoid_dev(value: float, center: float, width: float) -> float:
    """Devuelve 0-1 según cuánto se desvía *value* del centro ideal.
    width controla la pendiente (menor = más sensible)."""
    try:
        return 1.0 / (1.0 + math.exp(-(abs(value - center) / max(width, 0.1))))
    except OverflowError:
        return 1.0


# ── Motor de triage dinámico basado en vitales reales ────────────

def fallback_rule_based(questionnaire: dict, vitals: dict) -> list[dict]:
    """Scoring heurístico dinámico: pondera signos vitales reales y cuestionario."""

    # ── Extraer vitales ──
    hr   = float(vitals.get('heart_rate') or 0)
    spo2 = float(vitals.get('spo2') or 0)
    rr   = float(vitals.get('resp_rate') or 0)
    temp = float(vitals.get('temp_c') or 0)
    sbp  = float(vitals.get('bp_sys') or 0)
    dbp  = float(vitals.get('bp_dia') or 0)

    # ── Extraer cuestionario ──
    chest_pain   = bool(questionnaire.get('chest_pain'))
    dyspnea      = bool(questionnaire.get('dyspnea'))
    cough        = bool(questionnaire.get('cough'))
    fever_sx     = bool(questionnaire.get('fever'))
    diabetes     = bool(questionnaire.get('diabetes'))
    hypertension = bool(questionnaire.get('hypertension'))
    complaint    = str(questionnaire.get('chief_complaint', '')).lower()

    # ═══════════════════════════════════════════════════════════════
    # 1. SOSPECHA CARDIOVASCULAR
    # ═══════════════════════════════════════════════════════════════
    cardiac = 0.0

    # FC: rangos normales 60-100
    if hr > 0:
        if hr > 120:
            cardiac += 0.30
        elif hr > 100:
            cardiac += 0.18 + 0.006 * (hr - 100)
        elif hr < 50:
            cardiac += 0.25
        elif hr < 60:
            cardiac += 0.10 + 0.015 * (60 - hr)

    # PA sistólica
    if sbp > 0:
        if sbp >= 160:
            cardiac += 0.20 + 0.003 * min(sbp - 160, 40)
        elif sbp >= 140:
            cardiac += 0.10 + 0.005 * (sbp - 140)
        elif sbp < 90:
            cardiac += 0.18
        elif sbp < 100:
            cardiac += 0.08

    # PA diastólica
    if dbp > 0:
        if dbp >= 100:
            cardiac += 0.12
        elif dbp >= 90:
            cardiac += 0.06

    # Presión de pulso (PP = sbp - dbp)
    if sbp > 0 and dbp > 0:
        pp = sbp - dbp
        if pp > 60:
            cardiac += 0.08   # posible rigidez arterial
        elif pp < 25:
            cardiac += 0.10   # posible bajo gasto

    # Síntomas
    if chest_pain:
        cardiac += 0.25
    if complaint in ('dolor_toracico', 'palpitaciones'):
        cardiac += 0.15
    if hypertension:
        cardiac += 0.08
    if diabetes:
        cardiac += 0.05

    # SpO2 bajo contribuye a cardíaco si no hay cough/dyspnea
    if spo2 > 0 and spo2 < 94 and not dyspnea and not cough:
        cardiac += 0.10

    cardiac = _clamp(cardiac)

    # ═══════════════════════════════════════════════════════════════
    # 2. SOSPECHA RESPIRATORIA
    # ═══════════════════════════════════════════════════════════════
    resp = 0.0

    # FR: normal 12-20
    if rr > 0:
        if rr >= 28:
            resp += 0.30
        elif rr > 20:
            resp += 0.10 + 0.025 * (rr - 20)
        elif rr < 10:
            resp += 0.20
        elif rr < 12:
            resp += 0.08

    # SpO2
    if spo2 > 0:
        if spo2 < 90:
            resp += 0.35
        elif spo2 < 93:
            resp += 0.22 + 0.04 * (93 - spo2)
        elif spo2 < 95:
            resp += 0.12 + 0.05 * (95 - spo2)
        elif spo2 < 97:
            resp += 0.04

    # Temp alta → infección respiratoria
    if temp > 0:
        if temp >= 38.5:
            resp += 0.15
        elif temp >= 38.0:
            resp += 0.08

    # Síntomas respiratorios
    if dyspnea:
        resp += 0.20
    if cough:
        resp += 0.15
    if fever_sx:
        resp += 0.08
    if complaint in ('disnea', 'tos', 'fiebre'):
        resp += 0.10

    resp = _clamp(resp)

    # ═══════════════════════════════════════════════════════════════
    # 3. SOSPECHA HIPERTENSIVA
    # ═══════════════════════════════════════════════════════════════
    hta = 0.0

    if sbp > 0:
        if sbp >= 180:
            hta += 0.45
        elif sbp >= 160:
            hta += 0.25 + 0.01 * (sbp - 160)
        elif sbp >= 140:
            hta += 0.12 + 0.006 * (sbp - 140)
        elif sbp >= 130:
            hta += 0.05

    if dbp > 0:
        if dbp >= 120:
            hta += 0.30
        elif dbp >= 100:
            hta += 0.15 + 0.007 * (dbp - 100)
        elif dbp >= 90:
            hta += 0.08

    if hypertension:
        hta += 0.10
    if hr > 0 and hr > 90:
        hta += 0.04

    hta = _clamp(hta)

    # ═══════════════════════════════════════════════════════════════
    # 4. SOSPECHA ANSIEDAD / ESTRÉS
    # ═══════════════════════════════════════════════════════════════
    anxiety = 0.0

    # Taquicardia LEVE con SpO2 y temp normales → estrés probable
    normal_spo2 = spo2 >= 96 if spo2 > 0 else True
    normal_temp = temp < 37.8 if temp > 0 else True
    normal_rr   = 12 <= rr <= 22 if rr > 0 else True
    normal_bp   = (100 <= sbp <= 140) if sbp > 0 else True

    if hr > 0:
        if 90 < hr <= 110 and normal_spo2 and normal_temp:
            anxiety += 0.25
        elif hr > 110 and normal_spo2 and normal_temp:
            anxiety += 0.15  # podría ser cardíaco, menos peso

    # FR ligeramente elevada con todo lo demás normal
    if rr > 0 and 20 < rr <= 24 and normal_spo2 and normal_temp:
        anxiety += 0.12

    # Disnea con oximetría normal = probable origen ansioso
    if dyspnea and normal_spo2 and normal_temp:
        anxiety += 0.20

    # Si todo es muy normal y hay síntomas vagos
    if normal_spo2 and normal_temp and normal_rr and normal_bp:
        if not chest_pain and not cough and not fever_sx:
            anxiety += 0.10  # base si todo está normal

    anxiety = _clamp(anxiety, 0.0, 0.70)

    # ═══════════════════════════════════════════════════════════════
    # 5. SOSPECHA INFECCIOSA / FEBRIL
    # ═══════════════════════════════════════════════════════════════
    infec = 0.0

    if temp > 0:
        if temp >= 39.0:
            infec += 0.40
        elif temp >= 38.5:
            infec += 0.28
        elif temp >= 38.0:
            infec += 0.18
        elif temp >= 37.5:
            infec += 0.08

    if fever_sx:
        infec += 0.15
    if cough and temp > 37.5:
        infec += 0.12
    if hr > 0 and hr > 100 and temp > 37.5:
        infec += 0.08  # taquicardia febril

    infec = _clamp(infec)

    # ═══════════════════════════════════════════════════════════════
    # 6. SOSPECHA METABÓLICA / DESCOMPENSACIÓN
    # ═══════════════════════════════════════════════════════════════
    metab = 0.0

    if diabetes:
        metab += 0.15
        if rr > 0 and rr > 22:
            metab += 0.12  # respiración de Kussmaul
        if hr > 0 and hr > 100:
            metab += 0.08
        if sbp > 0 and sbp < 100:
            metab += 0.10

    # Taquipnea sin causa resp clara
    if rr > 0 and rr > 22 and spo2 >= 96 and not cough and not dyspnea:
        metab += 0.12

    metab = _clamp(metab, 0.0, 0.70)

    # ═══════════════════════════════════════════════════════════════
    # Compilar, ordenar y retornar top hipótesis > 2%
    # ═══════════════════════════════════════════════════════════════
    all_hyp = [
        {'label': 'Sospecha cardiovascular (tamizaje)',    'probability': round(cardiac, 3)},
        {'label': 'Sospecha respiratoria (tamizaje)',      'probability': round(resp, 3)},
        {'label': 'Sospecha hipertensiva (tamizaje)',      'probability': round(hta, 3)},
        {'label': 'Sospecha ansiedad/estrés (tamizaje)',   'probability': round(anxiety, 3)},
        {'label': 'Sospecha infecciosa/febril (tamizaje)', 'probability': round(infec, 3)},
        {'label': 'Sospecha metabólica (tamizaje)',        'probability': round(metab, 3)},
    ]

    # Solo mostrar hipótesis con probabilidad > 2%
    out = [h for h in all_hyp if h['probability'] > 0.02]

    # Si ninguna supera 2%, retornar la más alta
    if not out:
        out = [max(all_hyp, key=lambda d: d['probability'])]

    out.sort(key=lambda d: d['probability'], reverse=True)
    return out
