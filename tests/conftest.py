import pytest

from database.connection import get_connection
from database.repository import create_process_samples_table


@pytest.fixture
def clean_process_samples():
    create_process_samples_table()

    connection = get_connection()

    try:
        connection.execute("DELETE FROM process_samples;")
        connection.commit()
    finally:
        connection.close()

    yield

    connection = get_connection()

    try:
        connection.execute("DELETE FROM process_samples;")
        connection.commit()
    finally:
        connection.close()
