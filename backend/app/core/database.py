from collections.abc import Generator
from functools import lru_cache
from typing import Annotated, Protocol

from fastapi import Depends
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings


class ReadinessChecker(Protocol):
    def check(self) -> bool:
        """Return whether required target dependencies are ready."""


class DatabaseReadinessChecker:
    def __init__(self, engine: Engine | None):
        self.engine = engine

    def check(self) -> bool:
        if self.engine is None:
            return False
        try:
            with self.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except SQLAlchemyError:
            return False
        return True


@lru_cache
def create_database_engine(database_url: str) -> Engine | None:
    if not database_url:
        return None
    return create_engine(database_url, pool_pre_ping=True, pool_recycle=300)


def get_readiness_checker(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ReadinessChecker:
    return DatabaseReadinessChecker(create_database_engine(settings.database_url))


def get_db_session(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Generator[Session, None, None]:
    engine = create_database_engine(settings.database_url)
    if engine is None:
        raise RuntimeError("Database is not configured")
    with Session(engine) as session:
        yield session
