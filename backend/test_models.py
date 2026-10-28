
from sqlalchemy import inspect

from backend.database import engine


def test_required_database_tables_exist():
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    required_tables = {
        "institutions",
        "fdrs",
        "verifications",
        "release_requests",
        "audit_logs",
        "users",
    }

    missing_tables = required_tables - tables

    assert not missing_tables, (
        f"Missing database tables: {sorted(missing_tables)}"
    )
