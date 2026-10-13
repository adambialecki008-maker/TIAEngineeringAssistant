from uuid import uuid4

import psycopg
from psycopg import sql
import pytest

from database.connection import get_connection
from database.repository import create_process_samples_table


@pytest.fixture
def clean_process_samples(monkeypatch):
    """Give every DB test its own schema, never delete application samples."""
    schema = "test_process_samples_" + uuid4().hex
    admin = get_connection()
    original_connect = psycopg.connect
    try:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        admin.commit()

        def isolated_connect(*args, **kwargs):
            options = kwargs.get("options", "")
            kwargs["options"] = (options + " -c search_path=" + schema).strip()
            return original_connect(*args, **kwargs)

        # Patch the driver so previously imported get_connection aliases also
        # use the isolated schema, including requests handled by TestClient.
        with monkeypatch.context() as patch:
            patch.setattr(psycopg, "connect", isolated_connect)
            create_process_samples_table()
            yield schema
    finally:
        try:
            admin.rollback()
            admin.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                sql.Identifier(schema),
            ))
            admin.commit()
        finally:
            admin.close()
