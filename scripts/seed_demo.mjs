#!/usr/bin/env node
// Safe, idempotent demo-data seeder for FDR Sentinel.
//
//   node scripts/seed_demo.mjs
//
// - Never deletes or resets anything; never touches existing rows or credentials.
// - Creates a timestamped backup of fdr_sentinel.db before writing.
// - Deterministic output (fixed PRNG seed) and safe to rerun: demo records are
//   identified by their DEMO- markers and skipped when they already exist.
// - Two independent PRNG streams keep reruns stable: stream A (planning values
//   that determine FDR numbers) is consumed even when a record is skipped,
//   stream B (insert-only details) is consumed only for newly created rows.
// - Demo markers: institution_code/fdr_number prefixed "DEMO-", e-mails under
//   demo.fdrsentinel.in, and every demo audit event carries details.demo_seed.
// - Does NOT create user accounts (password hashing is Argon2 via pwdlib and
//   cannot be reproduced outside Python); use backend/seed_demo.py
//   --with-demo-users on a Python machine for demo logins.

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = join(ROOT, "fdr_sentinel.db");
const BACKUP_DIR = join(ROOT, "backups");

const SEED = 20261026;
const TARGET_INSTITUTIONS = 24;
const TARGET_FDRS = 420;
const EXTRA_REJECTED_RELEASES = 12;

// ---------- deterministic PRNG streams ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function drawers(rnd) {
  return {
    rint: (a, b) => a + Math.floor(rnd() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(rnd() * arr.length)],
    chance: (p) => rnd() < p,
    weighted(pairs) {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let roll = rnd() * total;
      for (const [value, w] of pairs) { roll -= w; if (roll < 0) return value; }
      return pairs[pairs.length - 1][0];
    },
    next: rnd,
  };
}
const A = drawers(mulberry32(SEED));                 // planning stream (rerun-stable)
const B = drawers(mulberry32(SEED ^ 0x9e3779b9));   // insert-only detail stream

// ---------- date helpers (UTC, SQLite format) ----------
const DAY = 86400000;
const NOW = new Date();
const pad = (n, w = 2) => String(n).padStart(w, "0");
const fmtDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fmtTs = (d) => `${fmtDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const addMonths = (d, n) => {
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
};
const capNow = (d) => (d.getTime() > NOW.getTime() ? new Date(NOW.getTime() - 3 * 3600000) : d);

// ---------- reference data ----------
const BANKS = [
  ["State Bank of India", "SBI"], ["HDFC Bank", "HDFC"], ["ICICI Bank", "ICICI"],
  ["Axis Bank", "AXIS"], ["Punjab National Bank", "PNB"], ["Bank of Baroda", "BOB"],
  ["Canara Bank", "CNB"], ["Union Bank of India", "UBI"], ["IDBI Bank", "IDBI"],
  ["Bank of India", "BOI"], ["Indian Bank", "INDB"], ["Central Bank of India", "CBIN"],
  ["Kotak Mahindra Bank", "KMB"], ["Yes Bank", "YBL"], ["IndusInd Bank", "IIB"],
  ["IDFC FIRST Bank", "IDFC"], ["Federal Bank", "FBL"], ["UCO Bank", "UCO"],
];
const CITIES = [
  ["New Delhi", "Connaught Place", "Delhi"], ["Mumbai", "Fort", "Maharashtra"],
  ["Pune", "Shivajinagar", "Maharashtra"], ["Bengaluru", "MG Road", "Karnataka"],
  ["Chennai", "Anna Salai", "Tamil Nadu"], ["Hyderabad", "Banjara Hills", "Telangana"],
  ["Kolkata", "Park Street", "West Bengal"], ["Ahmedabad", "Navrangpura", "Gujarat"],
  ["Jaipur", "MI Road", "Rajasthan"], ["Lucknow", "Hazratganj", "Uttar Pradesh"],
  ["Bhopal", "MP Nagar", "Madhya Pradesh"], ["Patna", "Bailey Road", "Bihar"],
  ["Kochi", "Marine Drive", "Kerala"], ["Guwahati", "GS Road", "Assam"],
  ["Nagpur", "Civil Lines", "Maharashtra"], ["Indore", "Vijay Nagar", "Madhya Pradesh"],
  ["Chandigarh", "Sector 17", "Chandigarh"], ["Bhubaneswar", "Janpath", "Odisha"],
  ["Surat", "Ring Road", "Gujarat"], ["Varanasi", "Godowlia", "Uttar Pradesh"],
  ["Coimbatore", "RS Puram", "Tamil Nadu"], ["Visakhapatnam", "Dwaraka Nagar", "Andhra Pradesh"],
  ["Amritsar", "Hall Bazar", "Punjab"], ["Dehradun", "Rajpur Road", "Uttarakhand"],
];
const INSTITUTIONS = [
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
];
const VERIFIER_NAMES = [
  "K. Ramachandran", "S. Deshpande", "A. Qureshi", "M. Pillai",
  "R. Bhatt", "T. Kaur", "V. Nair", "P. Joshi", "N. Chatterjee", "D. Saxena",
];
const VERIFICATION_REMARKS = {
  verified: [
    "Certificate details match the bank-issued advice on file.",
    "Simulated check: amount, dates and payee name consistent with institution records.",
    "Original certificate sighted and stamped by the issuing branch.",
    "Reference number reconciled with the branch register.",
  ],
  failed: [
    "Reference number could not be reconciled with branch records.",
    "Interest rate differs from the rate quoted in the sanction letter.",
    "Amount mismatch against the institution's submitted copy.",
    "Maturity date on the certificate predates the recorded issue tenure.",
  ],
  pending: [
    "Awaiting branch confirmation from the issuing bank.",
    "Queued for the next manual review slot.",
  ],
};
const RELEASE_REASONS = [
  "Security deposit release requested; all supply obligations for AICTE-approved programmes are complete for the current academic year.",
  "FDR is approaching maturity and the institution requests release of funds for redeposit at revised interest rates.",
  "Accreditation cycle completed; funds are required for campus infrastructure renewal.",
  "Contract closed without claims; requesting release of the earnest-money deposit held against the tender.",
  "Institution is consolidating deposits with the lead bank as per finance-committee resolution.",
  "Student admission liabilities for the year are settled; the security deposit is no longer required to be retained.",
  "Equipment procurement completed under the grant; surplus deposit may be released to the institute corpus.",
];
const REVIEW_REMARKS_APPROVED = [
  "Documents verified; no outstanding liabilities reported by the department.",
  "Approved as per the AICTE deposit-release guidelines.",
  "End-use certificate and closure report received; release sanctioned.",
  "Compliance checklist complete; funds may be released to the institution account.",
];
const REVIEW_REMARKS_REJECTED = [
  "Insufficient documentation of completed obligations; resubmit with an end-use certificate.",
  "Request prematurity: the linked FDR has not completed verification.",
  "Liability certificate missing from the submission; request returned to the institution.",
];

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const roundTo = (v, step) => Math.round(v / step) * step;

// ---------- open database + backup ----------
const db = new DatabaseSync(DB_PATH);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync(BACKUP_DIR, { recursive: true });
const backupPath = join(BACKUP_DIR, `fdr_sentinel.backup-${stamp}.db`);
copyFileSync(DB_PATH, backupPath);
console.log(`Backup written: ${backupPath}`);

const existing = {
  institutionCodes: new Set(db.prepare("SELECT institution_code FROM institutions").all().map(r => r.institution_code)),
  fdrNumbers: new Set(db.prepare("SELECT fdr_number FROM fdrs").all().map(r => r.fdr_number)),
  fdrsWithReleases: new Set(db.prepare("SELECT DISTINCT fdr_id FROM release_requests").all().map(r => r.fdr_id)),
};

const insInstitution = db.prepare(
  "INSERT INTO institutions (name, institution_code, email, phone, address, is_active) VALUES (?, ?, ?, ?, ?, 1)");
const insFdr = db.prepare(
  "INSERT INTO fdrs (institution_id, fdr_number, bank_name, branch_name, deposit_amount, issue_date, maturity_date, interest_rate, certificate_path, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)");
const insVerification = db.prepare(
  "INSERT INTO verifications (fdr_id, method, result, reference_number, remarks, checked_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
const insRelease = db.prepare(
  "INSERT INTO release_requests (fdr_id, requested_by, reason, status, reviewed_by, review_remarks, created_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const insAudit = db.prepare(
  "INSERT INTO audit_logs (actor, action, entity_type, entity_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)");

const demoDetails = (extra = {}) => JSON.stringify({ demo_seed: true, ...extra });

// ---------- workload ----------
const counts = { institutions: 0, fdrs: 0, verifications: 0, releases: 0, audit: 0 };
let createdFdrs = 0;

function pickIssueDate() {
  const year = A.weighted([[2021, 16], [2022, 19], [2023, 21], [2024, 20], [2025, 16], [2026, 8]]);
  const start = Date.UTC(year, 0, 1);
  const end = year === NOW.getUTCFullYear() ? NOW.getTime() : Date.UTC(year, 11, 28);
  return new Date(start + Math.floor(A.next() * Math.max(end - start, DAY)));
}

function pickStatus(matured) {
  return A.weighted(matured
    ? [["submitted", 10], ["under_verification", 5], ["verified", 22], ["verification_failed", 3], ["release_pending", 8], ["released", 42]]
    : [["submitted", 16], ["under_verification", 6], ["verified", 56], ["verification_failed", 6], ["release_pending", 5], ["released", 11]]);
}

db.exec("BEGIN");

try {
  // ---------- institutions ----------
  const institutionRows = [];
  let instSerial = 201;
  for (const name of INSTITUTIONS) {
    const code = `DEMO-INST-${instSerial++}`;
    if (!existing.institutionCodes.has(code)) {
      const [instCity, , instState] = CITIES[instSerial % CITIES.length];
      const email = `${slugify(name.split(",")[0])}@demo.fdrsentinel.in`;
      const created = capNow(new Date(Date.UTC(2021, 0, 5) + instSerial * 37 * DAY));
      const info = insInstitution.run(
        name, code, email, `9${B.rint(100000000, 999999999)}`, `${instCity}, ${instState}`);
      counts.institutions += 1;
      institutionRows.push({ id: Number(info.lastInsertRowid), email });
      insAudit.run("demo.admin@fdrsentinel.in", "INSTITUTION_CREATED", "Institution", Number(info.lastInsertRowid),
        demoDetails({ institution_code: code, institution_name: name }), fmtTs(created));
      counts.audit += 1;
    }
  }
  // Collect every demo institution (including pre-existing ones) for FDR linkage.
  const allDemoInstitutions = db.prepare(
    "SELECT id, email FROM institutions WHERE institution_code LIKE 'DEMO-INST-%' ORDER BY id").all();
  for (const row of allDemoInstitutions) {
    if (!institutionRows.some(r => r.id === row.id)) institutionRows.push({ id: row.id, email: row.email });
  }
  if (institutionRows.length === 0) throw new Error("No demo institutions available to attach FDRs to.");

  // ---------- FDRs ----------
  let fdrSerial = 10001;
  let refSerial = 50001;

  for (let i = 0; i < TARGET_FDRS; i += 1) {
    const institution = institutionRows[i % institutionRows.length];
    const [bankName, bankCode] = A.pick(BANKS);
    const [city, area, state] = A.pick(CITIES);
    const issue = pickIssueDate();
    const tenureMonths = A.weighted([[12, 22], [24, 33], [36, 24], [60, 16], [84, 5]]);
    const maturity = addMonths(issue, tenureMonths);
    const matured = maturity.getTime() <= NOW.getTime();
    const status = pickStatus(matured);
    const fdrNumber = `DEMO-${bankCode}-${issue.getUTCFullYear()}-${pad(fdrSerial++, 5)}`;

    if (existing.fdrNumbers.has(fdrNumber)) continue;

    const amount = Math.max(50000, roundTo(Math.exp(11.0 + B.next() * 4.6), 1000));
    const rate = Number((5.6 + B.next() * 2.5).toFixed(2));
    const submittedAt = capNow(addDays(issue, B.rint(0, 10)));

    const info = insFdr.run(institution.id, fdrNumber, bankName, `${area} Branch, ${city}`, amount,
      fmtDate(issue), fmtDate(maturity), rate, status);
    const fdrId = Number(info.lastInsertRowid);
    counts.fdrs += 1;
    createdFdrs += 1;
    existing.fdrNumbers.add(fdrNumber);

    insAudit.run(institution.email, "FDR_SUBMITTED", "FDR", fdrId,
      demoDetails({ fdr_number: fdrNumber, institution_id: institution.id, status }), fmtTs(submittedAt));
    counts.audit += 1;

    let latestVerificationAt = submittedAt;
    const addVerification = (result) => {
      const at = capNow(addDays(latestVerificationAt, B.rint(3, 45)));
      const reference = `DEMO-REF-${pad(refSerial++, 8)}`;
      const method = B.chance(0.6) ? "simulated" : "manual";
      insVerification.run(fdrId, method, result, reference, B.pick(VERIFICATION_REMARKS[result] || VERIFICATION_REMARKS.pending),
        B.pick(VERIFIER_NAMES), fmtTs(at));
      counts.verifications += 1;
      insAudit.run("verification.desk@fdrsentinel.in", "FDR_VERIFICATION_RECORDED", "Verification", fdrId,
        demoDetails({ fdr_id: fdrId, method, result, reference_number: reference }), fmtTs(at));
      counts.audit += 1;
      latestVerificationAt = at;
    };

    if (status !== "submitted") {
      const finalResult = status === "verification_failed" ? "failed"
        : status === "under_verification" ? "pending" : "verified";
      if (status === "verified" && B.chance(0.25)) addVerification("failed");
      if (status === "verification_failed" && B.chance(0.4)) addVerification("pending");
      addVerification(finalResult);
      insAudit.run("verification.desk@fdrsentinel.in", "FDR_STATUS_UPDATED", "FDR", fdrId,
        demoDetails({ fdr_number: fdrNumber, previous_status: "submitted", new_status: status, reason: "verification_recorded" }),
        fmtTs(latestVerificationAt));
      counts.audit += 1;
    }

    if (status === "release_pending" || status === "released") {
      const isApproved = status === "released";
      const requestedAt = capNow(addDays(latestVerificationAt, B.rint(5, 60)));
      const reviewAt = capNow(addDays(requestedAt, B.rint(1, 20)));
      const infoRel = insRelease.run(fdrId, institution.email, B.pick(RELEASE_REASONS), isApproved ? "approved" : "pending",
        isApproved ? "release.board@fdrsentinel.in" : null,
        isApproved ? B.pick(REVIEW_REMARKS_APPROVED) : null, fmtTs(requestedAt), isApproved ? fmtTs(reviewAt) : null);
      counts.releases += 1;
      const requestId = Number(infoRel.lastInsertRowid);
      insAudit.run(institution.email, "RELEASE_REQUEST_CREATED", "ReleaseRequest", requestId,
        demoDetails({ fdr_id: fdrId }), fmtTs(requestedAt));
      counts.audit += 1;
      if (isApproved) {
        insAudit.run("release.board@fdrsentinel.in", "RELEASE_REQUEST_APPROVED", "ReleaseRequest", requestId,
          demoDetails({ fdr_id: fdrId, previous_status: "pending", new_status: "approved" }), fmtTs(reviewAt));
        insAudit.run("release.board@fdrsentinel.in", "FDR_STATUS_UPDATED", "FDR", fdrId,
          demoDetails({ fdr_number: fdrNumber, previous_status: "release_pending", new_status: "released", reason: "release_request_approved" }), fmtTs(reviewAt));
        counts.audit += 2;
      }
    }
  }

  // ---------- extra rejected release requests on healthy verified FDRs ----------
  // Count-based so reruns top up to the target exactly once.
  const existingRejected = db.prepare(
    "SELECT COUNT(*) n FROM release_requests WHERE status = 'rejected' AND reviewed_by = 'release.board@fdrsentinel.in'").get().n;
  const shortfall = Math.max(0, EXTRA_REJECTED_RELEASES - existingRejected);
  if (shortfall > 0) {
    const verifiedFdrs = db.prepare(
      "SELECT id FROM fdrs WHERE fdr_number LIKE 'DEMO-%' AND status = 'verified' ORDER BY id").all();
    let rejectedAdded = 0;
    for (const row of verifiedFdrs) {
      if (rejectedAdded >= shortfall) break;
      if (existing.fdrsWithReleases.has(row.id)) continue;
      const requestedAt = capNow(new Date(NOW.getTime() - B.rint(30, 240) * DAY));
      const reviewAt = capNow(addDays(requestedAt, B.rint(1, 14)));
      const infoRel = insRelease.run(row.id, "demo.admin@fdrsentinel.in", B.pick(RELEASE_REASONS), "rejected",
        "release.board@fdrsentinel.in", B.pick(REVIEW_REMARKS_REJECTED), fmtTs(requestedAt), fmtTs(reviewAt));
      counts.releases += 1;
      rejectedAdded += 1;
      existing.fdrsWithReleases.add(row.id);
      const requestId = Number(infoRel.lastInsertRowid);
      insAudit.run("demo.admin@fdrsentinel.in", "RELEASE_REQUEST_CREATED", "ReleaseRequest", requestId,
        demoDetails({ fdr_id: row.id }), fmtTs(requestedAt));
      insAudit.run("release.board@fdrsentinel.in", "RELEASE_REQUEST_REJECTED", "ReleaseRequest", requestId,
        demoDetails({ fdr_id: row.id, previous_status: "pending", new_status: "rejected" }), fmtTs(reviewAt));
      counts.audit += 2;
    }
  }

  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  db.close();
  console.error("Seed failed; database rolled back. No changes were kept.", error);
  process.exit(1);
}

db.close();

const skippedFdrs = Math.max(0, TARGET_FDRS - createdFdrs);
console.log("Seed complete.");
console.log(`  Institutions : ${counts.institutions} added, ${TARGET_INSTITUTIONS - counts.institutions} already present`);
console.log(`  FDRs         : ${counts.fdrs} added, ${skippedFdrs} already present`);
console.log(`  Verifications: ${counts.verifications}`);
console.log(`  Releases     : ${counts.releases}`);
console.log(`  Audit events : ${counts.audit}`);
console.log("Demo records are marked with DEMO- references and demo.fdrsentinel.in e-mails.");
console.log("Demo logins require the Python seeder: python -m backend.seed_demo --with-demo-users");
