from database.connection import get_connection
from database.repository import (
    insert_process_sample,
    get_latest_sample,
    get_samples_by_tag,
)
from engine.models import ProcessSampleInput


def test_create_process_samples_table_creates_table():
    connection = get_connection()

    try:
        result = connection.execute(
            "SELECT to_regclass('public.process_samples');"
        ).fetchone()

        assert result is not None
        assert result[0] == "process_samples"
    finally:
        connection.close()


def test_insert_process_sample_inserts_sample_to_database(
    clean_process_samples,
):
    sample = ProcessSampleInput(
        tag_name="di_TestTag",
        value=225.5,
        unit="C",
    )

    insert_process_sample(sample)

    connection = get_connection()

    try:
        result = connection.execute("""
            SELECT tag_name, value, unit
            FROM process_samples
            ORDER BY id DESC
            LIMIT 1;
            """).fetchone()
    finally:
        connection.close()

    assert result[0] == sample.tag_name
    assert result[1] == sample.value
    assert result[2] == sample.unit


def test_get_latest_sample(
    clean_process_samples,
):
    sample_1 = ProcessSampleInput(
        tag_name="di_TestTag",
        value=225.5,
        unit="C",
    )

    sample_2 = ProcessSampleInput(
        tag_name="di_TestTag",
        value=230.5,
        unit="C",
    )

    insert_process_sample(sample_1)
    insert_process_sample(sample_2)

    result = get_latest_sample(sample_1.tag_name)

    assert result[2] == 230.5


def test_get_samples_by_tag(
    clean_process_samples,
):
    sample_1 = ProcessSampleInput(
        tag_name="di_TestTag",
        value=225.5,
        unit="C",
    )

    sample_2 = ProcessSampleInput(
        tag_name="di_TestTag",
        value=230.5,
        unit="C",
    )

    sample_3 = ProcessSampleInput(
        tag_name="di_TestTag",
        value=20.5,
        unit="C",
    )

    insert_process_sample(sample_1)
    insert_process_sample(sample_2)
    insert_process_sample(sample_3)

    results = get_samples_by_tag(
        sample_1.tag_name,
        3,
    )

    assert len(results) == 3
    assert results[2][2] == sample_1.value
