"""Safe, idempotent demo-data seeder for FDR Sentinel (canonical, ORM-based).

Run from the project root:

    python -m backend.seed_demo                    # seed demo institutions/FDRs/workflow data
    python -m backend.seed_demo --with-demo-users  # also create demo login accounts

Behaviour:
- Never deletes, resets, or overwrites existing rows or credentials.
- Creates a timestamped backup of fdr_sentinel.db under backups/ before writing.
- Deterministic (fixed seed) and safe to rerun: records are identified by their
  DEMO- markers (institution codes / FDR numbers, demo e-mail domain) and
  skipped when they already exist.
- Every demo audit event carries details.demo_seed = true.
- --with-demo-users creates clearly-marked demo logins (e-mails under
  @fdrsentinel.in) using the real password hasher. Plain seed runs never
  create accounts.
"""

import argparse
import os
import random
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# auth_service refuses to import without a JWT secret; the seeder never mints
# tokens, so provide a placeholder for development runs only.
os.environ.setdefault("FDR_JWT_SECRET", "seed-script-placeholder-not-a-secret")

from backend.database import SessionLocal  # noqa: E402
from backend import models  # noqa: E402
from backend.services.audit_service import record_audit_event  # noqa: E402

SEED = 20261026
DEMO_EMAIL_DOMAINS = ("@demo.fdrsentinel.in", "@fdrsentinel.in")
REVIEW_BOARD = "release.board@fdrsentinel.in"
VERIFICATION_DESK = "verification.desk@fdrsentinel.in"
DEMO_ADMIN = "demo.admin@fdrsentinel.in"

BANKS = [
    ("State Bank of India", "SBI"), ("HDFC Bank", "HDFC"), ("ICICI Bank", "ICICI"),
    ("Axis Bank", "AXIS"), ("Punjab National Bank", "PNB"), ("Bank of Baroda", "BOB"),
    ("Canara Bank", "CNB"), ("Union Bank of India", "UBI"), ("IDBI Bank", "IDBI"),
    ("Bank of India", "BOI"), ("Indian Bank", "INDB"), ("Central Bank of India", "CBIN"),
    ("Kotak Mahindra Bank", "KMB"), ("Yes Bank", "YBL"), ("IndusInd Bank", "IIB"),
    ("IDFC FIRST Bank", "IDFC"), ("Federal Bank", "FBL"), ("UCO Bank", "UCO"),
]
CITIES = [
    ("New Delhi", "Connaught Place", "Delhi"), ("Mumbai", "Fort", "Maharashtra"),
    ("Pune", "Shivajinagar", "Maharashtra"), ("Bengaluru", "MG Road", "Karnataka"),
    ("Chennai", "Anna Salai", "Tamil Nadu"), ("Hyderabad", "Banjara Hills", "Telangana"),
    ("Kolkata", "Park Street", "West Bengal"), ("Ahmedabad", "Navrangpura", "Gujarat"),
    ("Jaipur", "MI Road", "Rajasthan"), ("Lucknow", "Hazratganj", "Uttar Pradesh"),
    ("Bhopal", "MP Nagar", "Madhya Pradesh"), ("Patna", "Bailey Road", "Bihar"),
    ("Kochi", "Marine Drive", "Kerala"), ("Guwahati", "GS Road", "Assam"),
    ("Nagpur", "Civil Lines", "Maharashtra"), ("Indore", "Vijay Nagar", "Madhya Pradesh"),
    ("Chandigarh", "Sector 17", "Chandigarh"), ("Bhubaneswar", "Janpath", "Odisha"),
    ("Surat", "Ring Road", "Gujarat"), ("Varanasi", "Godowlia", "Uttar Pradesh"),
    ("Coimbatore", "RS Puram", "Tamil Nadu"), ("Visakhapatnam", "Dwaraka Nagar", "Andhra Pradesh"),
    ("Amritsar", "Hall Bazar", "Punjab"), ("Dehradun", "Rajpur Road", "Uttarakhand"),
]
INSTITUTIONS = [
    "Triveni Institute of Technology, Pune",
    "Aravalli University of Engineering and Research, Gurugram",
    "Kaveri Institute of Medical Sciences, Mysuru",
    "Bharatpur College of Pharmacy, Bharatpur",
    "Sandeepani Polytechnic, Nagpur",
    "Hooghly Institute of Maritime Studies, Kolkata",
    "Vindhyachal Institute of Technology, Katni",
    "Kalyanpur College of Education, Kanpur",
    "Chilika Institute of Fisheries Science, Puri",
    "Deccan School of Planning and Architecture, Hyderabad",
    "Malwa National College, Indore",
    "Ganga Institute of Management, Varanasi",
    "Konark University of Applied Sciences, Puri",
    "Sahyadri College of Engineering, Karad",
    "Brahmaputra Institute of Skill Development, Guwahati",
    "Neelkanth Mahavidyalaya, Udaipur",
    "Coromandel Institute of Hotel Management, Chennai",
    "Satpuda Law College, Jabalpur",
    "Godavari Institute of Agricultural Sciences, Nashik",
    "Zaveri College of Fine Arts, Ahmedabad",
    "Palani Institute of Teacher Education, Madurai",
    "Shivalik Business School, Dehradun",
    "Mahanadi Women's University, Raipur",
    "Thar Desert Research Institute, Jodhpur",
]
VERIFIER_NAMES = [
    "K. Ramachandran", "S. Deshpande", "A. Qureshi", "M. Pillai",
    "R. Bhatt", "T. Kaur", "V. Nair", "P. Joshi", "N. Chatterjee", "D. Saxena",
]
VERIFICATION_REMARKS = {
    "verified": [
        "Certificate details match the bank-issued advice on file.",
        "Simulated check: amount, dates and payee name consistent with institution records.",
        "Original certificate sighted and stamped by the issuing branch.",
        "Reference number reconciled with the branch register.",
    ],
    "failed": [
        "Reference number could not be reconciled with branch records.",
        "Interest rate differs from the rate quoted in the sanction letter.",
        "Amount mismatch against the institution's submitted copy.",
        "Maturity date on the certificate predates the recorded issue tenure.",
    ],
    "pending": [
        "Awaiting branch confirmation from the issuing bank.",
        "Queued for the next manual review slot.",
    ],
}
RELEASE_REASONS = [
    "Security deposit release requested; all supply obligations for AICTE-approved programmes are complete for the current academic year.",
    "FDR is approaching maturity and the institution requests release of funds for redeposit at revised interest rates.",
    "Accreditation cycle completed; funds are required for campus infrastructure renewal.",
    "Contract closed without claims; requesting release of the earnest-money deposit held against the tender.",
    "Institution is consolidating deposits with the lead bank as per finance-committee resolution.",
    "Student admission liabilities for the year are settled; the security deposit is no longer required to be retained.",
    "Equipment procurement completed under the grant; surplus deposit may be released to the institute corpus.",
]
REVIEW_REMARKS_APPROVED = [
    "Documents verified; no outstanding liabilities reported by the department.",
    "Approved as per the AICTE deposit-release guidelines.",
    "End-use certificate and closure report received; release sanctioned.",
]
REVIEW_REMARKS_REJECTED = [
    "Insufficient documentation of completed obligations; resubmit with an end-use certificate.",
    "Request prematurity: the linked FDR has not completed verification.",
    "Liability certificate missing from the submission; request returned to the institution.",
]

TODAY = date.today()
rng = random.Random(SEED)


def add_months(base: date, months: int) -> date:
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                         31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date(year, month, day)


def cap_now(value: datetime) -> datetime:
    ceiling = datetime.combine(TODAY, datetime.min.time()).replace(hour=18)
    return min(value, ceiling)


def pick_issue_date() -> date:
    year = rng.choices([2021, 2022, 2023, 2024, 2025, 2026], weights=[16, 19, 21, 20, 16, 8])[0]
    start = date(year, 1, 1)
    end = TODAY if year == TODAY.year else date(year, 12, 28)
    span = (end - start).days
    return start + timedelta(days=rng.randint(0, max(span, 1)))


def pick_status(matured: bool) -> str:
    return rng.choices(
        ["submitted", "under_verification", "verified", "verification_failed", "release_pending", "released"],
        weights=[10, 5, 22, 3, 8, 42] if matured else [16, 6, 56, 6, 5, 11],
    )[0]


def slugify(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "-" for ch in name.lower())
    return cleaned.strip("-").replace("--", "-")[:40]


def demo_details(extra: dict | None = None) -> dict:
    payload = {"demo_seed": True}
    if extra:
        payload.update(extra)
    return payload


def backup_database() -> Path:
    backup_dir = PROJECT_ROOT / "backups"
    backup_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = backup_dir / f"fdr_sentinel.backup-{stamp}.db"
    shutil.copy2(PROJECT_ROOT / "fdr_sentinel.db", target)
    print(f"Backup written: {target}")
    return target


def seed(with_demo_users: bool, target_fdrs: int) -> None:
    counts = {"institutions": 0, "fdrs": 0, "verifications": 0, "releases": 0, "audit": 0}

    existing_codes = {code for (code,) in db.query(models.Institution.institution_code).all()}
    existing_fdr_numbers = {number for (number,) in db.query(models.FDR.fdr_number).all()}
    existing_emails = {email for (email,) in db.query(models.User.email).all()}
    fdr_ids_with_releases = {fdr_id for (fdr_id,) in db.query(models.ReleaseRequest.fdr_id).distinct().all()}

    # ---------- institutions ----------
    institution_rows = []
    for offset, name in enumerate(INSTITUTIONS):
        code = f"DEMO-INST-{201 + offset}"
        if code in existing_codes:
            continue
        city, _, state = CITIES[offset % len(CITIES)]
        email = f"{slugify(name.split(',')[0])}@demo.fdrsentinel.in"
        institution = models.Institution(
            name=name, institution_code=code, email=email,
            phone=f"9{rng.randint(100000000, 999999999)}", address=f"{city}, {state}",
        )
        db.add(institution)
        db.flush()
        record_audit_event(
            db=db, actor=DEMO_ADMIN, action="INSTITUTION_CREATED",
            entity_type="Institution", entity_id=institution.id,
            details=demo_details({"institution_code": code, "institution_name": name}),
        )
        institution.created_by_demo = True  # marker only; not persisted
        counts["institutions"] += 1
        counts["audit"] += 1
        institution_rows.append(institution)

    all_demo_institutions = (
        db.query(models.Institution)
        .filter(models.Institution.institution_code.like("DEMO-INST-%"))
        .order_by(models.Institution.id)
        .all()
    )
    known_ids = {institution.id for institution in institution_rows}
    institution_rows.extend(item for item in all_demo_institutions if item.id not in known_ids)
    if not institution_rows:
        raise RuntimeError("No demo institutions available to attach FDRs to.")

    # ---------- FDRs ----------
    ref_serial = 50001
    created_fdrs = 0
    for index in range(target_fdrs):
        institution = institution_rows[index % len(institution_rows)]
        bank_name, bank_code = rng.choice(BANKS)
        city, area, _ = rng.choice(CITIES)
        issue = pick_issue_date()
        tenure = rng.choices([12, 24, 36, 60, 84], weights=[22, 33, 24, 16, 5])[0]
        maturity = add_months(issue, tenure)
        status = pick_status(maturity <= TODAY)
        fdr_number = f"DEMO-{bank_code}-{issue.year}-{10001 + index:05d}"
        if fdr_number in existing_fdr_numbers:
            continue

        amount = float(max(50000, round(2.718281828 ** rng.uniform(11.0, 15.6) / 1000) * 1000))
        rate = round(rng.uniform(5.6, 8.1), 2)
        fdr = models.FDR(
            institution_id=institution.id, fdr_number=fdr_number, bank_name=bank_name,
            branch_name=f"{area} Branch, {city}", deposit_amount=amount,
            issue_date=issue, maturity_date=maturity, interest_rate=rate, status=status,
        )
        db.add(fdr)
        db.flush()
        existing_fdr_numbers.add(fdr_number)
        counts["fdrs"] += 1
        created_fdrs += 1

        submitted_at = cap_now(datetime.combine(
            issue + timedelta(days=rng.randint(0, 10)), datetime.min.time().replace(hour=10)))
        record_audit_event(
            db=db, actor=institution.email, action="FDR_SUBMITTED",
            entity_type="FDR", entity_id=fdr.id,
            details=demo_details({"fdr_number": fdr_number, "institution_id": institution.id, "status": status}),
        )
        counts["audit"] += 1

        latest_verification_at = submitted_at

        def add_verification(result: str) -> None:
            nonlocal latest_verification_at, ref_serial
            at = cap_now(latest_verification_at + timedelta(days=rng.randint(3, 45)))
            reference = f"DEMO-REF-{ref_serial:08d}"
            ref_serial += 1
            verification = models.Verification(
                fdr_id=fdr.id,
                method="simulated" if rng.random() < 0.6 else "manual",
                result=result, reference_number=reference,
                remarks=rng.choice(VERIFICATION_REMARKS.get(result, VERIFICATION_REMARKS["pending"])),
                checked_by=rng.choice(VERIFIER_NAMES), created_at=at,
            )
            db.add(verification)
            record_audit_event(
                db=db, actor=VERIFICATION_DESK, action="FDR_VERIFICATION_RECORDED",
                entity_type="Verification", entity_id=verification.id,
                details=demo_details({"fdr_id": fdr.id, "method": verification.method,
                                      "result": result, "reference_number": reference}),
            )
            counts["verifications"] += 1
            counts["audit"] += 1
            latest_verification_at = at

        if status != "submitted":
            final_result = ("failed" if status == "verification_failed"
                            else "pending" if status == "under_verification" else "verified")
            if status == "verified" and rng.random() < 0.25:
                add_verification("failed")
            if status == "verification_failed" and rng.random() < 0.4:
                add_verification("pending")
            add_verification(final_result)
            record_audit_event(
                db=db, actor=VERIFICATION_DESK, action="FDR_STATUS_UPDATED",
                entity_type="FDR", entity_id=fdr.id,
                details=demo_details({"fdr_number": fdr_number, "previous_status": "submitted",
                                      "new_status": status, "reason": "verification_recorded"}),
            )
            counts["audit"] += 1

        if status in ("release_pending", "released"):
            approved = status == "released"
            requested_at = cap_now(latest_verification_at + timedelta(days=rng.randint(5, 60)))
            reviewed_at = cap_now(requested_at + timedelta(days=rng.randint(1, 20)))
            release = models.ReleaseRequest(
                fdr_id=fdr.id, requested_by=institution.email, reason=rng.choice(RELEASE_REASONS),
                status="approved" if approved else "pending",
                reviewed_by=REVIEW_BOARD if approved else None,
                review_remarks=rng.choice(REVIEW_REMARKS_APPROVED) if approved else None,
                created_at=requested_at, reviewed_at=reviewed_at if approved else None,
            )
            db.add(release)
            db.flush()
            record_audit_event(
                db=db, actor=institution.email, action="RELEASE_REQUEST_CREATED",
                entity_type="ReleaseRequest", entity_id=release.id,
                details=demo_details({"fdr_id": fdr.id}),
            )
            counts["releases"] += 1
            counts["audit"] += 1
            if approved:
                record_audit_event(
                    db=db, actor=REVIEW_BOARD, action="RELEASE_REQUEST_APPROVED",
                    entity_type="ReleaseRequest", entity_id=release.id,
                    details=demo_details({"fdr_id": fdr.id, "previous_status": "pending", "new_status": "approved"}),
                )
                record_audit_event(
                    db=db, actor=REVIEW_BOARD, action="FDR_STATUS_UPDATED",
                    entity_type="FDR", entity_id=fdr.id,
                    details=demo_details({"fdr_number": fdr_number, "previous_status": "release_pending",
                                          "new_status": "released", "reason": "release_request_approved"}),
                )
                counts["audit"] += 2

    # ---------- extra rejected release requests (count-based top-up) ----------
    existing_rejected = (
        db.query(models.ReleaseRequest)
        .filter(models.ReleaseRequest.status == "rejected",
                models.ReleaseRequest.reviewed_by == REVIEW_BOARD)
        .count()
    )
    shortfall = max(0, 12 - existing_rejected)
    if shortfall:
        candidates = (
            db.query(models.FDR)
            .filter(models.FDR.fdr_number.like("DEMO-%"), models.FDR.status == "verified")
            .order_by(models.FDR.id)
            .all()
        )
        added = 0
        for fdr in candidates:
            if added >= shortfall:
                break
            if fdr.id in fdr_ids_with_releases:
                continue
            requested_at = cap_now(datetime.now() - timedelta(days=rng.randint(30, 240)))
            release = models.ReleaseRequest(
                fdr_id=fdr.id, requested_by=DEMO_ADMIN, reason=rng.choice(RELEASE_REASONS),
                status="rejected", reviewed_by=REVIEW_BOARD,
                review_remarks=rng.choice(REVIEW_REMARKS_REJECTED),
                created_at=requested_at, reviewed_at=requested_at + timedelta(days=rng.randint(1, 14)),
            )
            db.add(release)
            db.flush()
            fdr_ids_with_releases.add(fdr.id)
            record_audit_event(
                db=db, actor=DEMO_ADMIN, action="RELEASE_REQUEST_CREATED",
                entity_type="ReleaseRequest", entity_id=release.id,
                details=demo_details({"fdr_id": fdr.id}),
            )
            record_audit_event(
                db=db, actor=REVIEW_BOARD, action="RELEASE_REQUEST_REJECTED",
                entity_type="ReleaseRequest", entity_id=release.id,
                details=demo_details({"fdr_id": fdr.id, "previous_status": "pending", "new_status": "rejected"}),
            )
            counts["releases"] += 1
            counts["audit"] += 2
            added += 1

    # ---------- optional demo logins ----------
    demo_password = "DemoPortal#2026"
    created_users = []
    if with_demo_users:
        if DEMO_ADMIN not in existing_emails:
            admin = models.User(
                full_name="Demo Portal Administrator", email=DEMO_ADMIN,
                password_hash=hash_password(demo_password), role="admin", institution_id=None,
            )
            db.add(admin)
            db.flush()
            record_audit_event(
                db=db, actor="seed-script", action="USER_CREATED", entity_type="User",
                entity_id=admin.id, details=demo_details({"user_email": DEMO_ADMIN, "role": "admin"}),
            )
            counts["audit"] += 1
            created_users.append((DEMO_ADMIN, "Administrator"))

        for institution in institution_rows:
            email = f"registrar{institution.id}@demo.fdrsentinel.in"
            if email in existing_emails:
                continue
            user = models.User(
                full_name=f"Registrar, {institution.name.split(',')[0]}",
                email=email, password_hash=hash_password(demo_password),
                role="institution", institution_id=institution.id,
            )
            db.add(user)
            db.flush()
            record_audit_event(
                db=db, actor="seed-script", action="USER_CREATED", entity_type="User",
                entity_id=user.id, details=demo_details({"user_email": email, "role": "institution"}),
            )
            counts["audit"] += 1
            created_users.append((email, institution.name))

    db.commit()

    skipped = max(0, target_fdrs - created_fdrs)
    print("Seed complete.")
    print(f"  Institutions : {counts['institutions']} added, {len(INSTITUTIONS) - counts['institutions']} already present")
    print(f"  FDRs         : {counts['fdrs']} added, {skipped} already present")
    print(f"  Verifications: {counts['verifications']}")
    print(f"  Releases     : {counts['releases']}")
    print(f"  Audit events : {counts['audit']}")
    if with_demo_users:
        print(f"  Demo logins  : {len(created_users)} (password: {demo_password})")
        for email, label in created_users[:5]:
            print(f"    - {email}  ({label})")
        if len(created_users) > 5:
            print(f"    ... and {len(created_users) - 5} more")
    print("Demo records are marked with DEMO- references and @fdrsentinel.in e-mails.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed deterministic demo data into fdr_sentinel.db (non-destructive).")
    parser.add_argument("--with-demo-users", action="store_true",
                        help="Also create demo login accounts (admin + one registrar per demo institution).")
    parser.add_argument("--fdrs", type=int, default=420, help="Number of demo FDR records to ensure exist.")
    args = parser.parse_args()

    backup_database()
    db = SessionLocal()
    try:
        from backend.services.auth_service import hash_password
        seed(args.with_demo_users, args.fdrs)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
