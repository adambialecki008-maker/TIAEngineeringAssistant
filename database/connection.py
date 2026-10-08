import psycopg
from dotenv import load_dotenv
import os

load_dotenv()


def get_connection():
    connection = psycopg.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST"),
    )
    return connection
