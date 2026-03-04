"""
Gestor de sesiones de escaneo rPPG.

Cada sesión representa un escaneo activo de un usuario.
Se crea al iniciar, recibe frames, y al finalizar calcula los vitales.
"""

import uuid
import time
from typing import Optional
from ai.rppg_processor import RPPGProcessor

# Almacén en memoria (en producción → Redis o similar)
_sessions: dict[str, dict] = {}

# Limpieza: sesiones expiran después de 5 minutos
SESSION_TTL = 300


def create_session(fps: float = 30.0, buffer_seconds: float = 30.0) -> str:
    """Crea una nueva sesión de escaneo y retorna su ID."""
    _cleanup_expired()

    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        'processor': RPPGProcessor(fps=fps, buffer_seconds=buffer_seconds),
        'created_at': time.time(),
        'last_activity': time.time(),
        'status': 'scanning',  # scanning | completed | error
    }
    return session_id


def add_frame(session_id: str, frame_b64: str, phase: int = 0) -> dict:
    """Envía un frame a la sesión. Retorna status parcial."""
    session = _sessions.get(session_id)
    if not session:
        return {'ok': False, 'error': 'Sesión no encontrada o expirada'}

    if session['status'] != 'scanning':
        return {'ok': False, 'error': f'Sesión en estado {session["status"]}'}

    session['last_activity'] = time.time()
    processor: RPPGProcessor = session['processor']

    result = processor.add_frame_base64(frame_b64, phase=phase)
    return result


def finish_session(session_id: str) -> dict:
    """Finaliza la sesión y calcula los vitales."""
    session = _sessions.get(session_id)
    if not session:
        return {'ok': False, 'error': 'Sesión no encontrada o expirada'}

    processor: RPPGProcessor = session['processor']
    vitals = processor.compute_vitals()

    session['status'] = 'completed'
    return vitals


def get_session_info(session_id: str) -> Optional[dict]:
    """Información de la sesión sin calcular vitales."""
    session = _sessions.get(session_id)
    if not session:
        return None

    p: RPPGProcessor = session['processor']
    return {
        'session_id': session_id,
        'status': session['status'],
        'frame_count': p.frame_count,
        'face_detected_count': p.face_detected_count,
        'buffer_samples': len(p.g_signal),
        'buffer_progress': len(p.g_signal) / max(p.buffer_size, 1),
        'age_seconds': round(time.time() - session['created_at'], 1),
    }


def destroy_session(session_id: str):
    """Elimina la sesión y libera memoria."""
    if session_id in _sessions:
        _sessions[session_id]['processor'].reset()
        del _sessions[session_id]


def _cleanup_expired():
    """Elimina sesiones expiradas."""
    now = time.time()
    expired = [
        sid for sid, s in _sessions.items()
        if now - s['last_activity'] > SESSION_TTL
    ]
    for sid in expired:
        destroy_session(sid)
