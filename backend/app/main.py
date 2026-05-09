from sqlalchemy import func, select
from sqlalchemy.orm import Session
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from app.auth import create_access_token, require_admin
from app.config import get_settings
from app.database import Base, engine, get_db
from app.models import SurveyResponse
from app.schemas import LoginRequest, StatsRow, SurveyCreate, SurveyRead, TokenResponse

settings = get_settings()
app = FastAPI(title="Prueba de Ansiedad de Beck API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


def interpretation_for_score(score: int) -> str:
    if score <= 21:
        return "Ansiedad muy baja"
    if score <= 35:
        return "Ansiedad moderada"
    return "Ansiedad severa"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    if payload.username != settings.admin_username or payload.password != settings.admin_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas.")
    return TokenResponse(access_token=create_access_token(settings.admin_username))


@app.post("/api/surveys", response_model=SurveyRead, status_code=status.HTTP_201_CREATED)
def create_survey(payload: SurveyCreate, db: Session = Depends(get_db)) -> SurveyResponse:
    score = sum(payload.answers)
    record = SurveyResponse(
        edad=payload.edad,
        carrera=payload.carrera,
        answers=payload.answers,
        score=score,
        interpretation=interpretation_for_score(score),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/admin/surveys", response_model=list[SurveyRead])
def list_surveys(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[SurveyResponse]:
    stmt = select(SurveyResponse).order_by(SurveyResponse.created_at.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt).all())


@app.get("/api/admin/stats", response_model=list[StatsRow])
def get_stats(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
    period: str = Query("day", pattern="^(day|month|year)$"),
) -> list[StatsRow]:
    # PostgreSQL date_trunc permite agrupar por día, mes o año.
    truncated = func.date_trunc(period, SurveyResponse.created_at).label("bucket")
    stmt = (
        select(
            truncated,
            func.count(SurveyResponse.id).label("count"),
            func.avg(SurveyResponse.score).label("average_score"),
            func.min(SurveyResponse.score).label("min_score"),
            func.max(SurveyResponse.score).label("max_score"),
        )
        .group_by(truncated)
        .order_by(truncated.desc())
    )
    rows = db.execute(stmt).all()
    return [
        StatsRow(
            period=row.bucket.date().isoformat() if period == "day" else row.bucket.strftime("%Y-%m" if period == "month" else "%Y"),
            count=row.count,
            average_score=float(row.average_score or 0),
            min_score=row.min_score,
            max_score=row.max_score,
        )
        for row in rows
    ]
