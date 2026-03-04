"""Modelo probabilístico (calibrado) para hipótesis clínicas.

Nota:
- En Beta, si no hay modelo entrenado, se retorna un scoring basado en reglas.
"""

import os
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


def fallback_rule_based(questionnaire: dict, vitals: dict) -> list[dict]:
    """Fallback: scoring heurístico (NO calibrado) para que la Beta sea operable sin modelo."""
    hr = float(vitals.get('heart_rate') or 0)
    spo2 = float(vitals.get('spo2') or 0)
    rr = float(vitals.get('resp_rate') or 0)
    temp = float(vitals.get('temp_c') or 0)

    chest_pain = bool(questionnaire.get('chest_pain'))
    dyspnea = bool(questionnaire.get('dyspnea'))
    cough = bool(questionnaire.get('cough'))

    # Scores simples (0-1) para demo, reemplazar por modelo entrenado
    resp_score = 0.0
    if dyspnea:
        resp_score += 0.25
    if cough:
        resp_score += 0.15
    if spo2 and spo2 < 95:
        resp_score += 0.25
    if rr and rr > 20:
        resp_score += 0.20
    if temp and temp >= 38:
        resp_score += 0.15

    cardiac_score = 0.0
    if chest_pain:
        cardiac_score += 0.30
    if hr and hr > 100:
        cardiac_score += 0.20
    if spo2 and spo2 < 94:
        cardiac_score += 0.10

    anxiety_score = 0.15
    if dyspnea and spo2 >= 96 and temp < 37.8:
        anxiety_score += 0.25

    # Normaliza
    resp = min(resp_score, 0.95)
    cardiac = min(cardiac_score, 0.90)
    anxiety = min(anxiety_score, 0.70)

    out = [
        {'label': 'Sospecha respiratoria (tamizaje)', 'probability': resp},
        {'label': 'Sospecha cardiaca (tamizaje)', 'probability': cardiac},
        {'label': 'Sospecha ansiedad/estrés (tamizaje)', 'probability': anxiety},
    ]
    out.sort(key=lambda d: d['probability'], reverse=True)
    return out
