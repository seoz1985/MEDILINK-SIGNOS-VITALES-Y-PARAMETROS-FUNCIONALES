"""Reglas determinísticas para banderas rojas (seguridad)."""

def red_flag_rules(v: dict) -> dict:
    reasons = []

    spo2 = v.get('spo2')
    rr = v.get('resp_rate')
    temp = v.get('temp_c')
    hr = v.get('heart_rate')
    sbp = v.get('bp_sys')
    dbp = v.get('bp_dia')

    if spo2 is not None and spo2 < 90:
        reasons.append('SpO2 < 90% (hipoxemia severa)')

    if rr is not None and rr >= 30:
        reasons.append('FR >= 30 rpm (taquipnea severa)')

    if temp is not None and temp >= 39.0:
        reasons.append('Temperatura >= 39°C')

    # Presión arterial crítica
    if sbp is not None:
        if sbp >= 180:
            reasons.append(f'PA sistólica >= 180 mmHg (crisis hipertensiva): {sbp} mmHg')
        elif sbp < 80:
            reasons.append(f'PA sistólica < 80 mmHg (hipotensión severa): {sbp} mmHg')

    if dbp is not None and dbp >= 120:
        reasons.append(f'PA diastólica >= 120 mmHg (crisis hipertensiva): {dbp} mmHg')

    # Frecuencia cardíaca extrema
    if hr is not None:
        if hr > 150:
            reasons.append(f'FC > 150 bpm (taquicardia severa): {hr} bpm')
        elif hr < 40:
            reasons.append(f'FC < 40 bpm (bradicardia severa): {hr} bpm')

    # Shock Index aproximado
    if hr and sbp:
        try:
            si = float(hr) / max(float(sbp), 1.0)
            if si >= 1.0:
                reasons.append(f'Shock Index elevado ({si:.2f})')
        except Exception:
            pass

    return {
        'is_red_flag': len(reasons) > 0,
        'reasons': reasons
    }
