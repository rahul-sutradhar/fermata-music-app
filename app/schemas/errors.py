from typing import Any

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    detail: str | list[Any]
