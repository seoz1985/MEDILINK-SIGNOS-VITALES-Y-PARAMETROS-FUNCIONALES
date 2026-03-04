from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, DateTime, Text, Integer, Float
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
