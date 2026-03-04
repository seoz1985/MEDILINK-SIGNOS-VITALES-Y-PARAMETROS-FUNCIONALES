"""Cliente hacia un LLM open-source expuesto como API (idealmente vLLM OpenAI-compatible).

Nota cPanel:
- NO es recomendable servir el LLM dentro de cPanel.
- Se recomienda un microservicio separado (VPS/GPU/CPU dedicado).
"""

import requests
from config import settings


def generate_explanation(prompt: str) -> str | None:
    if not settings.LLM_BASE_URL:
        return None

    try:
        r = requests.post(
            f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.LLM_API_KEY}"} if settings.LLM_API_KEY else {},
            json={
                "model": settings.LLM_MODEL_NAME,
                "messages": [
                    {"role": "system", "content": "Asistente clínico para tamizaje. No diagnosticas. Redactas con seguridad."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
            },
            timeout=12,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    except Exception:
        return None
