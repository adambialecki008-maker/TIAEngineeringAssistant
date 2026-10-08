from database.connection import get_connection


def test_get_connection_returns_connection():
    connection = get_connection()
    result = connection.execute("SELECT current_database(), current_user").fetchone()
    connection.close()
    assert result[0] == "tia_engineering_assistant"
    assert result[1] == "tia_user"
