from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class SurveyCreate(BaseModel):
    edad: int = Field(..., ge=1, le=120)
    carrera: str = Field(..., min_length=1, max_length=4)
    answers: list[int] = Field(..., min_length=21, max_length=21)

    @field_validator("carrera")
    @classmethod
    def normalize_carrera(cls, value: str) -> str:
        value = value.upper().strip()
        if not value.isalpha():
            raise ValueError("La carrera debe contener solo letras.")
        return value

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
