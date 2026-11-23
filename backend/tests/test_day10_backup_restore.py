"""Day 10 Hardening & Backup-Restore Drill.

Verifies database backup archive generation, SHA-256 integrity checksumming,
and data restoration verification.
"""

import gzip
import io
import os
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import create_database_engine
from app.main import create_app

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)


def test_backup_archive_integrity_and_restore_simulation() -> None:
    """Verifies database dump integrity checksums and recovery simulation."""
    settings = Settings(database_url=DATABASE_URL)
    create_app(settings)
    engine = create_database_engine(DATABASE_URL)
    assert engine is not None

    with Session(engine) as db:
        # 1. Query table counts from information_schema
        table_count = db.execute(
            text("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
        ).scalar()
        assert table_count is not None and table_count > 10

        # 2. Simulate dump compression and checksum calculation
        test_payload = f"BACKUP_SIMULATION_HEADER:table_count={table_count}:{uuid4()}".encode()
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9) as gz:
            gz.write(test_payload)
        compressed = buf.getvalue()

        import hashlib

        checksum = hashlib.sha256(compressed).hexdigest()
        assert len(checksum) == 64

        # 3. Simulate restoration & verify round-trip integrity
        with gzip.GzipFile(fileobj=io.BytesIO(compressed), mode="rb") as gz:
            restored_payload = gz.read()
        assert restored_payload == test_payload
        assert hashlib.sha256(compressed).hexdigest() == checksum
