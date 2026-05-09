from datetime import datetime, timezone
from sqlalchemy import DateTime, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    edad: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    carrera: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    interpretation: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    answers: Mapped[list[int]] = mapped_column(JSON, nullable=False)
