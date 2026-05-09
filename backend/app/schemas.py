from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class SurveyCreate(BaseModel):
    edad: int = Field(20, ge=1, le=120)
    carrera: str = Field(..., min_length=1, max_length=4)
    es_estudiante_tec: bool = True
    semestre: int | None = Field(1, ge=1, le=12)
    sexo_asignado_nacer: Literal["Femenino", "Masculino", "No encaja en femenino/masculino"]
    answers: list[int] = Field(..., min_length=21, max_length=21)

    @field_validator("carrera")
    @classmethod
    def normalize_carrera(cls, value: str) -> str:
        value = value.upper().strip()
        if not value.isalpha():
            raise ValueError("La carrera o área debe contener solo letras.")
        return value

    @model_validator(mode="after")
    def validate_community_fields(self) -> "SurveyCreate":
        if self.es_estudiante_tec:
            if self.semestre is None:
                raise ValueError("El semestre es obligatorio para estudiantes del Tec.")
        else:
            self.semestre = None
        return self

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, value: list[int]) -> list[int]:
        if any(answer not in (0, 1, 2, 3) for answer in value):
            raise ValueError("Cada respuesta debe estar entre 0 y 3.")
        return value


class SurveyRead(BaseModel):
    id: int
    created_at: datetime
    edad: int
    carrera: str
    es_estudiante_tec: bool
    tipo_comunidad: str
    semestre: int | None
    sexo_asignado_nacer: str | None
    score: int
    interpretation: str
    answers: list[int]

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class StatsRow(BaseModel):
    period: str
    count: int
    average_score: float
    min_score: int
    max_score: int


class StatsBreakdownRow(BaseModel):
    label: str
    count: int
    average_score: float


class AdminOverview(BaseModel):
    total: int
    average_score: float
    min_score: int | None
    max_score: int | None
    student_count: int
    staff_count: int
    by_interpretation: list[StatsBreakdownRow]
    by_community: list[StatsBreakdownRow]
    by_sexo_asignado_nacer: list[StatsBreakdownRow]
    by_semestre: list[StatsBreakdownRow]
    by_carrera: list[StatsBreakdownRow]
    by_age_range: list[StatsBreakdownRow]


class CsvImportRequest(BaseModel):
    csv_content: str = Field(..., min_length=1)
    replace_existing: bool = False


class CsvImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str] = Field(default_factory=list)
