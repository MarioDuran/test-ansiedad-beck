import csv
import io
import json
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Callable

from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.auth import create_access_token, require_admin
from app.config import get_settings
from app.database import Base, engine, get_db
from app.models import SurveyResponse
from app.schemas import (
    AdminOverview,
    CsvImportRequest,
    CsvImportResult,
    LoginRequest,
    StatsBreakdownRow,
    StatsRow,
    SurveyCreate,
    SurveyRead,
    TokenResponse,
)

settings = get_settings()
app = FastAPI(title="Prueba de Ansiedad de Beck API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SEXO_ASIGNADO_OPTIONS = {"Femenino", "Masculino", "No encaja en femenino/masculino"}
CSV_COLUMNS = [
    "id",
    "created_at",
    "edad",
    "carrera",
    "es_estudiante_tec",
    "tipo_comunidad",
    "semestre",
    "sexo_asignado_nacer",
    "score",
    "interpretation",
    *[f"q{i}" for i in range(1, 22)],
]


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_survey_response_columns()


def ensure_survey_response_columns() -> None:
    """Agrega columnas nuevas si la tabla ya existe en una instalación previa."""
    inspector = inspect(engine)
    if not inspector.has_table("survey_responses"):
        return

    existing_columns = {column["name"] for column in inspector.get_columns("survey_responses")}
    dialect = engine.dialect.name
    bool_default = "TRUE" if dialect == "postgresql" else "1"

    with engine.begin() as connection:
        if "es_estudiante_tec" not in existing_columns:
            connection.execute(text(f"ALTER TABLE survey_responses ADD COLUMN es_estudiante_tec BOOLEAN NOT NULL DEFAULT {bool_default}"))
        if "tipo_comunidad" not in existing_columns:
            connection.execute(text("ALTER TABLE survey_responses ADD COLUMN tipo_comunidad VARCHAR(32) NOT NULL DEFAULT 'Estudiante del Tec'"))
        if "semestre" not in existing_columns:
            connection.execute(text("ALTER TABLE survey_responses ADD COLUMN semestre INTEGER"))
        if "sexo_asignado_nacer" not in existing_columns:
            connection.execute(text("ALTER TABLE survey_responses ADD COLUMN sexo_asignado_nacer VARCHAR(40)"))


def interpretation_for_score(score: int) -> str:
    if score <= 21:
        return "Ansiedad muy baja"
    if score <= 35:
        return "Ansiedad moderada"
    return "Ansiedad severa"


def bool_from_csv(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    cleaned = str(value).strip().lower()
    if not cleaned:
        return default
    if cleaned in {"1", "true", "t", "yes", "y", "si", "sí", "estudiante", "estudiante del tec"}:
        return True
    if cleaned in {"0", "false", "f", "no", "n", "personal", "personal del tec"}:
        return False
    return default


def parse_optional_datetime(value: Any) -> datetime | None:
    if value is None or str(value).strip() == "":
        return None
    cleaned = str(value).strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(cleaned)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def parse_int(value: Any, field_name: str, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        parsed = int(str(value).strip())
    except Exception as exc:
        raise ValueError(f"{field_name} debe ser un número entero") from exc
    if minimum is not None and parsed < minimum:
        raise ValueError(f"{field_name} debe ser mayor o igual a {minimum}")
    if maximum is not None and parsed > maximum:
        raise ValueError(f"{field_name} debe ser menor o igual a {maximum}")
    return parsed


def parse_answers(row: dict[str, Any]) -> list[int]:
    if row.get("answers"):
        try:
            parsed = json.loads(row["answers"])
        except json.JSONDecodeError as exc:
            raise ValueError("answers debe ser JSON válido") from exc
        if not isinstance(parsed, list):
            raise ValueError("answers debe ser una lista")
        answers = [int(item) for item in parsed]
    else:
        answers = []
        for index in range(1, 22):
            value = row.get(f"q{index}")
            if value is None or str(value).strip() == "":
                raise ValueError(f"falta q{index}")
            answers.append(parse_int(value, f"q{index}", 0, 3))

    if len(answers) != 21:
        raise ValueError("deben existir exactamente 21 respuestas")
    if any(answer not in (0, 1, 2, 3) for answer in answers):
        raise ValueError("cada respuesta debe estar entre 0 y 3")
    return answers


def survey_from_csv_row(row: dict[str, Any]) -> SurveyResponse:
    edad = parse_int(row.get("edad"), "edad", 1, 120)
    carrera = str(row.get("carrera") or "").strip().upper()
    if not carrera or len(carrera) > 4 or not carrera.isalpha():
        raise ValueError("carrera debe contener de 1 a 4 letras")

    tipo_raw = str(row.get("tipo_comunidad") or "").strip().lower()
    default_student = tipo_raw != "personal del tec" if tipo_raw else True
    es_estudiante_tec = bool_from_csv(row.get("es_estudiante_tec"), default=default_student)

    semestre: int | None = None
    if es_estudiante_tec:
        semestre_raw = row.get("semestre")
        semestre = 1 if semestre_raw is None or str(semestre_raw).strip() == "" else parse_int(semestre_raw, "semestre", 1, 12)

    sexo = str(row.get("sexo_asignado_nacer") or "").strip() or None
    if sexo and sexo not in SEXO_ASIGNADO_OPTIONS:
        raise ValueError("sexo_asignado_nacer no coincide con una opción válida")

    answers = parse_answers(row)
    score = sum(answers)
    data: dict[str, Any] = {
        "edad": edad,
        "carrera": carrera,
        "es_estudiante_tec": es_estudiante_tec,
        "tipo_comunidad": "Estudiante del Tec" if es_estudiante_tec else "Personal del Tec",
        "semestre": semestre,
        "sexo_asignado_nacer": sexo,
        "answers": answers,
        "score": score,
        "interpretation": interpretation_for_score(score),
    }

    created_at = parse_optional_datetime(row.get("created_at"))
    if created_at is not None:
        data["created_at"] = created_at

    return SurveyResponse(**data)


def csv_row_from_survey(record: SurveyResponse) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": record.id,
        "created_at": record.created_at.isoformat() if record.created_at else "",
        "edad": record.edad,
        "carrera": record.carrera,
        "es_estudiante_tec": record.es_estudiante_tec,
        "tipo_comunidad": record.tipo_comunidad,
        "semestre": record.semestre if record.semestre is not None else "",
        "sexo_asignado_nacer": record.sexo_asignado_nacer or "",
        "score": record.score,
        "interpretation": record.interpretation,
    }
    for index, answer in enumerate(record.answers or [], start=1):
        row[f"q{index}"] = answer
    return row


def age_range(age: int) -> str:
    if age < 18:
        return "Menor de 18"
    if age <= 20:
        return "18-20"
    if age <= 24:
        return "21-24"
    if age <= 29:
        return "25-29"
    if age <= 39:
        return "30-39"
    return "40+"


def make_breakdown(
    records: list[SurveyResponse],
    label_fn: Callable[[SurveyResponse], Any],
    order: list[str] | None = None,
    limit: int | None = None,
) -> list[StatsBreakdownRow]:
    groups: dict[str, list[int]] = {}
    for record in records:
        raw_label = label_fn(record)
        label = str(raw_label).strip() if raw_label is not None and str(raw_label).strip() else "No capturado"
        groups.setdefault(label, []).append(record.score)

    rows = [
        StatsBreakdownRow(label=label, count=len(scores), average_score=sum(scores) / len(scores))
        for label, scores in groups.items()
    ]

    if order:
        order_index = {label: index for index, label in enumerate(order)}
        rows.sort(key=lambda row: (order_index.get(row.label, 999), row.label))
    else:
        rows.sort(key=lambda row: (-row.count, row.label))

    if limit is not None:
        rows = rows[:limit]
    return rows


def format_period(bucket: Any, period: str) -> str:
    if isinstance(bucket, str):
        return bucket
    if period == "day":
        return bucket.date().isoformat()
    return bucket.strftime("%Y-%m" if period == "month" else "%Y")


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
        es_estudiante_tec=payload.es_estudiante_tec,
        tipo_comunidad="Estudiante del Tec" if payload.es_estudiante_tec else "Personal del Tec",
        semestre=payload.semestre,
        sexo_asignado_nacer=payload.sexo_asignado_nacer,
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


@app.get("/api/admin/surveys/export-csv")
def export_surveys_csv(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Response:
    records = list(db.scalars(select(SurveyResponse).order_by(SurveyResponse.id.asc())).all())
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for record in records:
        writer.writerow(csv_row_from_survey(record))

    filename = f"base-ansiedad-beck-{datetime.now(timezone.utc).date().isoformat()}.csv"
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/admin/surveys/import-csv", response_model=CsvImportResult)
def import_surveys_csv(
    payload: CsvImportRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CsvImportResult:
    try:
        reader = csv.DictReader(io.StringIO(payload.csv_content.lstrip("\ufeff")))
    except csv.Error as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El CSV no se pudo leer.") from exc

    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El CSV no tiene encabezados.")

    imported_records: list[SurveyResponse] = []
    errors: list[str] = []
    for line_number, row in enumerate(reader, start=2):
        try:
            imported_records.append(survey_from_csv_row(row))
        except Exception as exc:
            errors.append(f"Fila {line_number}: {exc}")

    if payload.replace_existing and errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se reemplazó la base porque el CSV contiene filas inválidas. "
                f"Primera observación: {errors[0]}"
            ),
        )

    if not imported_records:
        return CsvImportResult(imported=0, skipped=len(errors), errors=errors[:50])

    if payload.replace_existing:
        db.query(SurveyResponse).delete()
        db.flush()

    db.add_all(imported_records)
    db.commit()
    return CsvImportResult(imported=len(imported_records), skipped=len(errors), errors=errors[:50])


@app.get("/api/admin/overview", response_model=AdminOverview)
def get_admin_overview(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminOverview:
    records = list(db.scalars(select(SurveyResponse)).all())
    total = len(records)
    scores = [record.score for record in records]
    student_count = sum(1 for record in records if record.es_estudiante_tec)
    staff_count = total - student_count

    return AdminOverview(
        total=total,
        average_score=mean(scores) if scores else 0,
        min_score=min(scores) if scores else None,
        max_score=max(scores) if scores else None,
        student_count=student_count,
        staff_count=staff_count,
        by_interpretation=make_breakdown(
            records,
            lambda record: record.interpretation,
            order=["Ansiedad muy baja", "Ansiedad moderada", "Ansiedad severa"],
        ),
        by_community=make_breakdown(
            records,
            lambda record: record.tipo_comunidad or ("Estudiante del Tec" if record.es_estudiante_tec else "Personal del Tec"),
            order=["Estudiante del Tec", "Personal del Tec"],
        ),
        by_sexo_asignado_nacer=make_breakdown(
            records,
            lambda record: record.sexo_asignado_nacer,
            order=["Femenino", "Masculino", "No encaja en femenino/masculino", "No capturado"],
        ),
        by_semestre=make_breakdown(
            [record for record in records if record.es_estudiante_tec and record.semestre is not None],
            lambda record: str(record.semestre),
            order=[str(index) for index in range(1, 13)],
        ),
        by_carrera=make_breakdown(records, lambda record: record.carrera, limit=12),
        by_age_range=make_breakdown(
            records,
            lambda record: age_range(record.edad),
            order=["Menor de 18", "18-20", "21-24", "25-29", "30-39", "40+"],
        ),
    )


@app.get("/api/admin/stats", response_model=list[StatsRow])
def get_stats(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
    period: str = Query("day", pattern="^(day|month|year)$"),
) -> list[StatsRow]:
    if engine.dialect.name == "postgresql":
        truncated = func.date_trunc(period, SurveyResponse.created_at).label("bucket")
    elif period == "day":
        truncated = func.date(SurveyResponse.created_at).label("bucket")
    elif period == "month":
        truncated = func.strftime("%Y-%m", SurveyResponse.created_at).label("bucket")
    else:
        truncated = func.strftime("%Y", SurveyResponse.created_at).label("bucket")

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
            period=format_period(row.bucket, period),
            count=row.count,
            average_score=float(row.average_score or 0),
            min_score=row.min_score,
            max_score=row.max_score,
        )
        for row in rows
    ]
