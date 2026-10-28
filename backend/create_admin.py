
import getpass

from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import User
from backend.services.auth_service import hash_password


def main():
    email = input("Admin email: ").strip().lower()
    full_name = input("Admin full name: ").strip()
    password = getpass.getpass("Admin password (minimum 12 characters): ")

    if not email or not full_name or len(password) < 12:
        print("Email, name, and a password of at least 12 characters are required.")
        return

    db: Session = SessionLocal()

    try:
        existing = db.query(User).filter(User.email == email).first()

        if existing:
            print("That email already exists. No changes made.")
            return

        admin = User(
            full_name=full_name,
            email=email,
            password_hash=hash_password(password),
            role="admin",
            institution_id=None,
            is_active=True,
        )

        db.add(admin)
        db.commit()
        print("Administrator created successfully.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
