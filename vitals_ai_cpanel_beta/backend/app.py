from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime
import json

from config import settings
from ai.triage_rules import red_flag_rules
from ai.feature_builder import build_features
from ai.prob_model import ProbModel, fallback_rule_based
from ai.prompt_templates import build_llm_prompt
from ai.llm_client import generate_explanation
from ai.scan_session import create_session, add_frame, finish_session, get_session_info, destroy_session

from db.session import db_session
from db.models import Base, TriageAssessment, TelemedicineToken

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = settings.SECRET_KEY

# CORS: restringe a tu dominio de frontend (app.)
if settings.CORS_ALLOW_ORIGINS:
    CORS(app, resources={r"/api/*": {"origins": settings.CORS_ALLOW_ORIGINS}})
else:
    # Si no configuras, queda abierto: en Beta evita esto en producción.
    CORS(app, resources={r"/api/*": {"origins": "*"}})

prob_model = ProbModel()

@app.get('/health')
def health():
    return jsonify({'status': 'ok'})


@app.post('/api/v1/triage/assess')
def triage_assess():
    payload = request.get_json(force=True)

    patient_id = payload.get('patient_id', '')
    scan_id = payload.get('scan_id', '')

    questionnaire = payload.get('questionnaire', {})
    vitals = payload.get('vitals', {})
    signal_quality = payload.get('signal_quality', {})

    red_flags = red_flag_rules(vitals)
    x, meta = build_features(questionnaire, vitals, signal_quality)

    if prob_model.available():
        differential = prob_model.predict(x)
        model_mode = 'ml_calibrated'
    else:
        differential = fallback_rule_based(questionnaire, vitals)
        model_mode = 'fallback_rules'

    prompt = build_llm_prompt(questionnaire, vitals, differential, red_flags, meta)
    explanation = generate_explanation(prompt)

    out = {
        'red_flags': red_flags,
        'differential': differential,
        'meta': {**meta, 'model_mode': model_mode},
        'explanation': explanation,
        'disclaimer': 'Salida para tamizaje/soporte a decisión. No constituye diagnóstico. Requiere confirmación clínica.'
    }

    # Persistencia (si DB configurada). Si no lo está, se omite sin romper la Beta.
    try:
        quality_score = float(signal_quality.get('quality_score') or 0.0)
        with next(db_session()) as s:
            row = TriageAssessment(
                patient_id=str(patient_id or ''),
                scan_id=str(scan_id or ''),
                questionnaire_json=json.dumps(questionnaire, ensure_ascii=False),
                vitals_json=json.dumps(vitals, ensure_ascii=False),
                quality_json=json.dumps(signal_quality, ensure_ascii=False),
                red_flags_json=json.dumps(red_flags, ensure_ascii=False),
                differential_json=json.dumps(differential, ensure_ascii=False),
                explanation_text=explanation or '',
                quality_score=quality_score,
            )
            s.add(row)
            s.flush()
            out['assessment_id'] = row.id
    except Exception:
        # En hosting, fallas DB no deben tumbar el triage.
        pass

    return jsonify(out)


@app.post('/api/v1/db/init')
def init_db():
    """Inicializa tablas (ejecutar una sola vez). Protege este endpoint en producción."""
    from db.session import get_engine
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    return jsonify({'status': 'created'})


# ═══════════════════════════════════════════════════════════════════
# Endpoints rPPG — Escaneo de signos vitales por cámara
# ═══════════════════════════════════════════════════════════════════

@app.post('/api/v1/scan/start')
def scan_start():
    """Inicia una sesión de escaneo rPPG. Retorna session_id."""
    payload = request.get_json(force=True) if request.data else {}
    fps = float(payload.get('fps', 15))
    duration = float(payload.get('duration_seconds', 30))
    session_id = create_session(fps=fps, buffer_seconds=duration)
    return jsonify({'session_id': session_id, 'fps': fps, 'duration_seconds': duration})


@app.post('/api/v1/scan/frame')
def scan_frame():
    """
    Recibe un frame de video (base64 JPEG) y lo procesa.
    Body: { "session_id": "...", "frame": "<base64>" }
    """
    payload = request.get_json(force=True)
    session_id = payload.get('session_id', '')
    frame_b64 = payload.get('frame', '')
    phase = int(payload.get('phase', 0))

    if not session_id or not frame_b64:
        return jsonify({'ok': False, 'error': 'session_id y frame son requeridos'}), 400

    # Quitar prefijo data:image/... si viene del canvas
    if ',' in frame_b64:
        frame_b64 = frame_b64.split(',', 1)[1]

    result = add_frame(session_id, frame_b64, phase=phase)
    return jsonify(result)


@app.post('/api/v1/scan/finish')
def scan_finish():
    """
    Finaliza la sesión y calcula los signos vitales reales.
    Body: { "session_id": "..." }
    """
    payload = request.get_json(force=True)
    session_id = payload.get('session_id', '')

    if not session_id:
        return jsonify({'ok': False, 'error': 'session_id requerido'}), 400

    vitals = finish_session(session_id)

    # Limpiar sesión después de obtener resultados
    destroy_session(session_id)

    return jsonify(vitals)


@app.get('/api/v1/scan/status/<session_id>')
def scan_status(session_id: str):
    """Obtiene el estado de una sesión de escaneo."""
    info = get_session_info(session_id)
    if not info:
        return jsonify({'ok': False, 'error': 'Sesión no encontrada'}), 404
    return jsonify(info)


# ═══════════════════════════════════════════════════════════════════
# Endpoints Telemedicina — Tokens de atención post-escaneo
# ═══════════════════════════════════════════════════════════════════

import string
import random
from datetime import timedelta

def _generate_token(length=8):
    """Genera un token alfanumérico legible (sin caracteres confusos)."""
    chars = string.ascii_uppercase.replace('O', '').replace('I', '').replace('L', '') + '23456789'
    return ''.join(random.choices(chars, k=length))


@app.post('/api/v1/telemedicine/token')
def create_telemedicine_token():
    """
    Genera un token de atención (telemedicina virtual o presencial via QR).
    Body: {
        patient_name, patient_email, patient_id,
        vitals, triage, questionnaire,
        attention_type: "telemedicine" | "in_person_kiosk",
        assessment_id
    }
    """
    payload = request.get_json(force=True)

    patient_name = payload.get('patient_name', '')
    patient_email = payload.get('patient_email', '')
    patient_id = payload.get('patient_id', '')
    vitals = payload.get('vitals', {})
    triage_data = payload.get('triage', {})
    questionnaire = payload.get('questionnaire', {})
    attention_type = payload.get('attention_type', 'telemedicine')
    assessment_id = payload.get('assessment_id')

    # Determinar prioridad basada en triage
    priority = 'normal'
    red_flags = triage_data.get('red_flags', {})
    if red_flags.get('is_red_flag'):
        priority = 'critical'
    elif any(v and isinstance(v, dict) and v.get('status') == 'warning'
             for v in (vitals if isinstance(vitals, list) else [vitals])):
        priority = 'urgent'

    # Generar token único
    token = _generate_token()

    try:
        with next(db_session()) as s:
            row = TelemedicineToken(
                token=token,
                patient_name=patient_name,
                patient_email=patient_email,
                patient_id=patient_id,
                vitals_json=json.dumps(vitals, ensure_ascii=False),
                triage_json=json.dumps(triage_data, ensure_ascii=False),
                questionnaire_json=json.dumps(questionnaire, ensure_ascii=False),
                attention_type=attention_type,
                priority=priority,
                assessment_id=assessment_id,
                expires_at=datetime.utcnow() + timedelta(hours=4),
            )
            s.add(row)
            s.flush()
            token_id = row.id
    except Exception as e:
        # Fallback: devolver token sin persistencia
        token_id = None

    return jsonify({
        'ok': True,
        'token': token,
        'token_id': token_id,
        'attention_type': attention_type,
        'priority': priority,
        'expires_in_hours': 4,
        'qr_data': json.dumps({
            'token': token,
            'type': attention_type,
            'patient': patient_name,
            'priority': priority,
            'vitals': vitals,
            'created': datetime.utcnow().isoformat(),
        }, ensure_ascii=False),
    })


@app.get('/api/v1/telemedicine/token/<token>')
def get_telemedicine_token(token: str):
    """
    Consulta un token por su código. 
    Usado por: plataforma de telemedicina, estación de kiosk.
    """
    try:
        with next(db_session()) as s:
            row = s.query(TelemedicineToken).filter_by(token=token).first()
            if not row:
                return jsonify({'ok': False, 'error': 'Token no encontrado'}), 404

            # Verificar expiración
            if row.expires_at and row.expires_at < datetime.utcnow():
                return jsonify({'ok': False, 'error': 'Token expirado'}), 410

            return jsonify({
                'ok': True,
                'token': row.token,
                'patient_name': row.patient_name,
                'patient_email': row.patient_email,
                'patient_id': row.patient_id,
                'vitals': json.loads(row.vitals_json) if row.vitals_json else {},
                'triage': json.loads(row.triage_json) if row.triage_json else {},
                'questionnaire': json.loads(row.questionnaire_json) if row.questionnaire_json else {},
                'attention_type': row.attention_type,
                'priority': row.priority,
                'status': row.status,
                'created_at': row.created_at.isoformat() if row.created_at else None,
                'expires_at': row.expires_at.isoformat() if row.expires_at else None,
            })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.get('/api/v1/telemedicine/queue')
def telemedicine_queue():
    """
    Lista los tokens pendientes para la plataforma de telemedicina.
    La vista de la plataforma llama a este endpoint para mostrar la cola.
    """
    try:
        with next(db_session()) as s:
            rows = (s.query(TelemedicineToken)
                     .filter(TelemedicineToken.status.in_(['pending', 'in_progress']))
                     .order_by(
                         # Prioridad: critical > urgent > normal
                         TelemedicineToken.priority.desc(),
                         TelemedicineToken.created_at.asc()
                     )
                     .limit(50)
                     .all())
            queue = []
            for row in rows:
                queue.append({
                    'token': row.token,
                    'patient_name': row.patient_name,
                    'attention_type': row.attention_type,
                    'priority': row.priority,
                    'status': row.status,
                    'vitals': json.loads(row.vitals_json) if row.vitals_json else {},
                    'created_at': row.created_at.isoformat() if row.created_at else None,
                })
            return jsonify({'ok': True, 'queue': queue, 'total': len(queue)})
    except Exception as e:
        return jsonify({'ok': True, 'queue': [], 'total': 0})


if __name__ == '__main__':
    import ssl, os

    # Genera certificado auto-firmado si no existe (para desarrollo LAN / móvil)
    cert_dir = os.path.join(os.path.dirname(__file__), '.certs')
    cert_file = os.path.join(cert_dir, 'cert.pem')
    key_file = os.path.join(cert_dir, 'key.pem')

    if not os.path.exists(cert_file):
        os.makedirs(cert_dir, exist_ok=True)
        # Usar OpenSSL de Python para generar cert auto-firmado
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime, ipaddress

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u'Vitals AI Dev'),
        ])
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.utcnow())
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
            .add_extension(
                x509.SubjectAlternativeName([
                    x509.DNSName(u'localhost'),
                    x509.IPAddress(ipaddress.IPv4Address(u'127.0.0.1')),
                    x509.IPAddress(ipaddress.IPv4Address(u'192.168.1.10')),
                ]),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )
        with open(key_file, 'wb') as f:
            f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
        with open(cert_file, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        print(f'[SSL] Certificado auto-firmado generado en {cert_dir}/')

    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(cert_file, key_file)

    print(f'[SSL] Backend HTTPS en https://0.0.0.0:5000')
    app.run(host='0.0.0.0', port=5000, debug=(settings.ENV != 'production'), ssl_context=ssl_ctx)
