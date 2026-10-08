from database.connection import get_connection
from engine.models import ProcessSampleInput


def create_process_samples_table() -> None:
    connection = get_connection()

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS process_samples(
            id BIGSERIAL PRIMARY KEY,
            timestamp TIMESTAMPtZ NOT NULL DEFAULT NOW(),
            tag_name TEXT NOT NULL,
            value DOUBLE PRECISION NOT NULL,
            unit TEXT);      
            """)
        connection.commit()
    finally:
        connection.close()


def insert_process_sample(
    sample: ProcessSampleInput,
) -> None:
    connection = get_connection()
    try:
        connection.execute(
            """INSERT INTO process_samples (tag_name,value,unit)
                            VALUES (%s,%s,%s);""",
            (sample.tag_name, sample.value, sample.unit),
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_latest_sample(tag_name):
    connection = get_connection()
    result = None
    try:
        result = connection.execute(
            """SELECT id,tag_name,value,unit,timestamp   
                            FROM process_samples
                            WHERE tag_name=%s
                            ORDER BY id DESC
                            LIMIT 1;""",
            (tag_name,),
        ).fetchone()
    finally:
        connection.close()
    return result


def get_samples_by_tag(tag_name, limit):
    connection = get_connection()
    results = None
    try:
        results = connection.execute(
            """SELECT id, tag_name,value,unit,timestamp
                                    FROM process_samples
                                    WHERE tag_name=%s
                                    ORDER BY id DESC
                                    LIMIT %s;""",
            (
                tag_name,
                limit,
            ),
        ).fetchall()
    finally:
        connection.close()
    return results
