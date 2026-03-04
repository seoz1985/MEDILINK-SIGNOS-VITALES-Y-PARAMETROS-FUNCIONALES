from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, DateTime, Text, Integer, Float, Boolean
from datetime import datetime

class Base(DeclarativeBase):
    pass

class TriageAssessment(Base):
    __tablename__ = 'triage_assessments'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(String(64), index=True, default='')
    scan_id: Mapped[str] = mapped_column(String(64), index=True, default='')

    questionnaire_json: Mapped[str] = mapped_column(Text, default='{}')
    vitals_json: Mapped[str] = mapped_column(Text, default='{}')
    quality_json: Mapped[str] = mapped_column(Text, default='{}')

    red_flags_json: Mapped[str] = mapped_column(Text, default='{}')
    differential_json: Mapped[str] = mapped_column(Text, default='[]')
    explanation_text: Mapped[str] = mapped_column(Text, default='')

    quality_score: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TelemedicineToken(Base):
    """Token de atención generado tras la toma de signos vitales.
    Se puede usar para:
      1. Atención virtual por telemedicina (acceso desde plataforma)
      2. Atención presencial via QR en estación de toma de signos vitales
    """
    __tablename__ = 'telemedicine_tokens'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(200), default='')
    patient_email: Mapped[str] = mapped_column(String(200), default='')
    patient_id: Mapped[str] = mapped_column(String(64), index=True, default='')

    # Datos vitales snapshot
    vitals_json: Mapped[str] = mapped_column(Text, default='{}')
    triage_json: Mapped[str] = mapped_column(Text, default='{}')
    questionnaire_json: Mapped[str] = mapped_column(Text, default='{}')

    # Tipo de atención solicitada
    attention_type: Mapped[str] = mapped_column(String(30), default='telemedicine')
    # telemedicine | in_person_kiosk

    # Estado del token
    status: Mapped[str] = mapped_column(String(20), default='pending')
    # pending | in_progress | completed | expired

    # Prioridad clínica
    priority: Mapped[str] = mapped_column(String(20), default='normal')
    # normal | urgent | critical

    assessment_id: Mapped[int] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
