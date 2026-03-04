"""Construye features para el modelo probabilístico (cuestionario + vitals + calidad)."""

import math


def build_features(questionnaire: dict, vitals: dict, signal_quality: dict):
    hr = float(vitals.get('heart_rate') or 0)
    spo2 = float(vitals.get('spo2') or 0)
    rr = float(vitals.get('resp_rate') or 0)
    temp = float(vitals.get('temp_c') or 0)
    sbp = float(vitals.get('bp_sys') or 0)

    shock_index = (hr / sbp) if sbp else 0.0

    q_score = float(signal_quality.get('quality_score') or 0)
    q_norm = min(max(q_score, 0.0), 100.0) / 100.0

    # Cuestionario (ejemplo mínimo, extensible)
    chest_pain = 1.0 if questionnaire.get('chest_pain') else 0.0
    fever = 1.0 if questionnaire.get('fever') else 0.0
    cough = 1.0 if questionnaire.get('cough') else 0.0
    dyspnea = 1.0 if questionnaire.get('dyspnea') else 0.0
    diabetes = 1.0 if questionnaire.get('diabetes') else 0.0
    htn = 1.0 if questionnaire.get('hypertension') else 0.0
    duration_h = float(questionnaire.get('duration_hours') or 0.0)

    x = [
        hr, spo2, rr, temp, sbp, shock_index,
        chest_pain, fever, cough, dyspnea,
        diabetes, htn,
        math.log1p(max(duration_h, 0.0)),
        q_norm,
    ]

    meta = {
        'shock_index': shock_index,
        'quality_norm': q_norm,
    }

    return x, meta
