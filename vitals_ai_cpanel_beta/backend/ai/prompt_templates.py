"""Prompts seguros para el LLM (solo explicación; NO cálculo de probabilidad)."""

def build_llm_prompt(questionnaire: dict, vitals: dict, differential: list[dict], red_flags: dict, meta: dict) -> str:
    top = sorted(differential, key=lambda d: d.get('probability', 0), reverse=True)[:5]

    return f"""
Eres un asistente de soporte a decisión clínica para TAMIZAJE.
- No emites diagnósticos.
- No inventas datos.
- Debes resaltar limitaciones y recomendar confirmación clínica.

Datos de ingreso:
- Motivo/queja principal: {questionnaire.get('chief_complaint','')}
- Duración (horas): {questionnaire.get('duration_hours','')}
- Síntomas: disnea={bool(questionnaire.get('dyspnea'))}, tos={bool(questionnaire.get('cough'))}, fiebre={bool(questionnaire.get('fever'))}, dolor torácico={bool(questionnaire.get('chest_pain'))}
- Vitals: HR={vitals.get('heart_rate')} bpm | SpO2={vitals.get('spo2')}% | FR={vitals.get('resp_rate')} rpm | Temp={vitals.get('temp_c')}°C | TA={vitals.get('bp_sys')}/{vitals.get('bp_dia')}
- Calidad de señal (0-1): {meta.get('quality_norm')}

Banderas rojas:
- {red_flags.get('is_red_flag')} | {', '.join(red_flags.get('reasons', []))}

Hipótesis de tamizaje (NO diagnóstico) con probabilidad:
{top}

Entregable (en español, clínico y prudente):
1) Resumen del caso en 2–3 líneas.
2) Factores que elevan el riesgo (bullets).
3) Recomendación de siguiente paso (urgencias vs consulta prioritaria vs autocuidado), con criterio de seguridad.
4) Limitaciones: no sustituye valoración médica; requiere confirmación; dependencia de calidad de señal.
"""
