# VITALS AI - Manifiesto de Blindaje Funcional v1.0
> Fecha de blindaje: 2026-03-04
> Commit: `v1.0-stable`
> Estado: **ESTABLE - NO MODIFICAR SIN RESPALDO**

---

## Arquitectura confirmada

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend Runtime | Next.js | 16.1.6 |
| React | React + ReactDOM | 19.2.4 |
| Backend | Flask (Python) | 3.0.2 |
| Python | CPython | 3.11.9 |
| CV | opencv-python-headless | 4.9.0.80 |
| Señales | numpy / scipy | 1.26.4 / 1.13.0 |
| ML | scikit-learn | 1.4.2 |

---

## Funcionalidades blindadas

### 1. Scanner rPPG de 7 fases (~88 s)
- **Fase 0 - Detección facial** (8 s): Haar cascade, anillo rojo→verde
- **Fase 1 - Calibración** (12 s): Baseline hemoglobina, barra progreso
- **Fase 2 - Cardíaca** (20 s): CHROM (De Haan & Jeanne 2013), HR overlay
- **Fase 3 - Ocular** (12 s): Micro-temblores pupilares, overlay cyan
- **Fase 4 - Respiratoria** (16 s): RSA/RIIV/RIAV fusion, círculo guía
- **Fase 5 - Vascular** (16 s): PTT + Valsalva, countdown 5-1
- **Fase 6 - Computación** (4 s): Análisis final + envío resultados

### 2. Protección anti-navegación durante escaneo
- `touchmove` preventDefault en document
- `popstate` bloqueado con pushState loop
- `beforeunload` con confirmación
- CSS `position: fixed` + `overflow: hidden` + `touch-action: none`
- Bottom nav deshabilitada (pointer-events + JS guard)
- Header oculta logout/notificaciones

### 3. Motor de progresión tick-based
- `setInterval` a 125 ms (8 FPS lógicos)
- Progresión por ticks del reloj (no por frames enviados)
- `sendingRef` con auto-reset a 4 s
- Fire-and-forget fetch (no await en interval)
- setState throttled a 250 ms (4 Hz)
- `stoppedRef` como kill switch maestro
- try-catch global en cuerpo del interval

### 4. Pantalla de resultados
- Persiste tras completar escaneo
- Triage integrado con IA
- Metodología científica para cada vital
- No se puede navegar fuera accidentalmente

---

## Archivos críticos (NO MODIFICAR sin respaldo)

| Archivo | Propósito | Líneas aprox. |
|---------|-----------|---------------|
| `frontend/hooks/use-rppg-scan.ts` | Hook principal del scanner | ~535 |
| `frontend/components/vitals-scanner.tsx` | UI del scanner + resultados | ~920 |
| `frontend/components/bottom-nav.tsx` | Nav inferior con bloqueo | ~72 |
| `frontend/components/app-header.tsx` | Header con bloqueo | ~57 |
| `frontend/app/globals.css` | CSS global + scan-active | ~183 |
| `frontend/lib/app-context.tsx` | Estado app + sessionStorage | ~155 |
| `frontend/components/error-boundary.tsx` | Error boundary React | ~65 |
| `backend/ai/rppg_processor.py` | Procesador señales rPPG | ~1219 |
| `backend/app.py` | API Flask + CORS + SSL | ~ |

---

## Archivos de bloqueo de dependencias

- **Frontend**: `frontend/package-lock.json` (generado por npm)
- **Backend**: `backend/requirements.txt` (versiones pinneadas)
- **Backend lock**: `backend/requirements.lock.txt` (pip freeze completo)

---

## Protocolo de modificación

> **ANTES de modificar cualquier archivo crítico:**
> 1. `git stash` o crear rama: `git checkout -b feature/mi-cambio`
> 2. Hacer cambios
> 3. Probar escaneo completo (88 s) en móvil
> 4. Si falla: `git checkout main` para volver a este estado estable
> 5. Si funciona: `git merge` a main

### Restaurar a este estado
```bash
git checkout v1.0-stable
# o
git reset --hard v1.0-stable
```

---

## Servidores

| Servicio | URL | Puerto |
|----------|-----|--------|
| Backend HTTPS | `https://192.168.1.10:5000` | 5000 |
| Frontend HTTPS | `https://192.168.1.10:3000` | 3000 |
