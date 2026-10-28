// Smoke-test harness ONLY — not part of the product.
// Serves the same endpoints as backend/main.py over a throwaway COPY of the
// seeded database so the built frontend can be exercised in a browser on
// machines without Python. The real fdr_sentinel.db is never opened for writes.
// Usage: node scripts/mock_api.mjs   (listens on 127.0.0.1:8000)
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const REAL_DB = path.resolve("fdr_sentinel.db");
const COPY_DB = path.join(os.tmpdir(), "fdr_sentinel.smoke-test.db");
fs.copyFileSync(REAL_DB, COPY_DB);

const db = new DatabaseSync(COPY_DB);
const nowIso = () => new Date().toISOString().slice(0, 19).replace("T", " ");

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:4173", "http://127.0.0.1:4173",
  "http://localhost:5174", "http://127.0.0.1:5174",
]);

function audit(actor, action, entityType, entityId, details) {
  db.prepare(
    "INSERT INTO audit_logs (actor, action, entity_type, entity_id, details, ip_address, created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(actor, action, entityType, entityId, JSON.stringify(details ?? {}), "127.0.0.1", nowIso());
}

function publicUser(row) {
  return {
    id: row.id, full_name: row.full_name, email: row.email,
    role: row.role, institution_id: row.institution_id,
    is_active: Boolean(row.is_active), created_at: row.created_at,
  };
}

function userFromRequest(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer smoke\.(.+)$/.exec(header);
  if (!match) return null;
  const email = Buffer.from(match[1], "base64url").toString("utf8");
  return db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email) || null;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  }
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, "http://127.0.0.1");
  const p = url.pathname;

  try {
    if (req.method === "POST" && p === "/api/auth/login") {
      const body = await readBody(req);
      const row = db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(String(body.email || "").trim());
      if (!row || !row.is_active) return json(res, 401, { detail: "Incorrect email or password." });
      return json(res, 200, {
        access_token: "smoke." + Buffer.from(row.email).toString("base64url"),
        token_type: "bearer", user: publicUser(row),
      });
    }

    const user = userFromRequest(req);
    if (!user) return json(res, 401, { detail: "Not authenticated" });

    if (req.method === "GET" && p === "/api/auth/me") return json(res, 200, publicUser(user));

    if (req.method === "GET" && p === "/api/fdrs") {
      const rows = user.role === "admin"
        ? db.prepare("SELECT * FROM fdrs ORDER BY id DESC").all()
        : db.prepare("SELECT * FROM fdrs WHERE institution_id = ? ORDER BY id DESC").all(user.institution_id);
      return json(res, 200, rows);
    }

    if (req.method === "POST" && p === "/api/fdrs") {
      const body = await readBody(req);
      if (user.role !== "admin" && Number(body.institution_id) !== user.institution_id)
        return json(res, 403, { detail: "You cannot register FDRs for another institution." });
      const info = db.prepare(
        "INSERT INTO fdrs (institution_id, fdr_number, bank_name, branch_name, deposit_amount, issue_date, maturity_date, interest_rate, status) VALUES (?,?,?,?,?,?,?,?, 'submitted')"
      ).run(body.institution_id, body.fdr_number, body.bank_name, body.branch_name, Number(body.deposit_amount), body.issue_date, body.maturity_date, body.interest_rate);
      const created = db.prepare("SELECT * FROM fdrs WHERE id = ?").get(info.lastInsertRowid);
      audit(user.email, "FDR_SUBMITTED", "FDR", created.id, { fdr_number: created.fdr_number });
      return json(res, 201, created);
    }

    let m = /^\/api\/fdrs\/(\d+)\/verifications$/.exec(p);
    if (m) {
      const fdr = db.prepare("SELECT * FROM fdrs WHERE id = ?").get(Number(m[1]));
      if (!fdr) return json(res, 404, { detail: "FDR not found." });
      if (user.role !== "admin" && fdr.institution_id !== user.institution_id) return json(res, 403, { detail: "Forbidden" });
      if (req.method === "GET") {
        return json(res, 200, db.prepare("SELECT * FROM verifications WHERE fdr_id = ? ORDER BY id DESC").all(fdr.id));
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const info = db.prepare(
          "INSERT INTO verifications (fdr_id, method, result, reference_number, remarks, checked_by, created_at) VALUES (?,?,?,?,?,?,?)"
        ).run(fdr.id, body.method, body.result, body.reference_number, body.remarks, body.checked_by, nowIso());
        const nextStatus = body.result === "verified" ? "verified"
          : body.result === "failed" ? "verification_failed"
          : (fdr.status === "submitted" ? "under_verification" : fdr.status);
        if (nextStatus !== fdr.status) {
          db.prepare("UPDATE fdrs SET status = ? WHERE id = ?").run(nextStatus, fdr.id);
          audit(user.email, "FDR_STATUS_UPDATED", "FDR", fdr.id, { fdr_number: fdr.fdr_number, new_status: nextStatus, reason: `verification_${body.result}` });
        }
        audit(user.email, "FDR_VERIFICATION_RECORDED", "Verification", info.lastInsertRowid, { fdr_id: fdr.id, result: body.result, method: body.method });
        return json(res, 201, db.prepare("SELECT * FROM verifications WHERE id = ?").get(info.lastInsertRowid));
      }
    }

    if (req.method === "GET" && p === "/api/verifications") {
      const limit = Math.min(1000, Number(url.searchParams.get("limit") || 600));
      const rows = user.role === "admin"
        ? db.prepare("SELECT * FROM verifications ORDER BY id DESC LIMIT ?").all(limit)
        : db.prepare("SELECT v.* FROM verifications v JOIN fdrs f ON f.id = v.fdr_id WHERE f.institution_id = ? ORDER BY v.id DESC LIMIT ?").all(user.institution_id, limit);
      return json(res, 200, rows);
    }

    if (req.method === "GET" && p === "/api/release-requests") {
      const rows = user.role === "admin"
        ? db.prepare("SELECT * FROM release_requests ORDER BY id DESC").all()
        : db.prepare("SELECT r.* FROM release_requests r JOIN fdrs f ON f.id = r.fdr_id WHERE f.institution_id = ? ORDER BY r.id DESC").all(user.institution_id);
      return json(res, 200, rows);
    }

    m = /^\/api\/fdrs\/(\d+)\/release-requests$/.exec(p);
    if (m && req.method === "POST") {
      const fdr = db.prepare("SELECT * FROM fdrs WHERE id = ?").get(Number(m[1]));
      if (!fdr) return json(res, 404, { detail: "FDR not found." });
      if (user.role !== "admin" && fdr.institution_id !== user.institution_id) return json(res, 403, { detail: "Forbidden" });
      const body = await readBody(req);
      const info = db.prepare(
        "INSERT INTO release_requests (fdr_id, requested_by, reason, status, created_at) VALUES (?,?,?,?,?)"
      ).run(fdr.id, body.requested_by, body.reason, "pending", nowIso());
      if (fdr.status === "verified") {
        db.prepare("UPDATE fdrs SET status = 'release_pending' WHERE id = ?").run(fdr.id);
        audit(user.email, "FDR_STATUS_UPDATED", "FDR", fdr.id, { fdr_number: fdr.fdr_number, new_status: "release_pending", reason: "release_request_created" });
      }
      audit(user.email, "RELEASE_REQUEST_CREATED", "ReleaseRequest", info.lastInsertRowid, { fdr_id: fdr.id });
      return json(res, 201, db.prepare("SELECT * FROM release_requests WHERE id = ?").get(info.lastInsertRowid));
    }

    m = /^\/api\/release-requests\/(\d+)\/review$/.exec(p);
    if (m && req.method === "PATCH") {
      if (user.role !== "admin") return json(res, 403, { detail: "Administrator role required." });
      const request = db.prepare("SELECT * FROM release_requests WHERE id = ?").get(Number(m[1]));
      if (!request) return json(res, 404, { detail: "Release request not found." });
      const body = await readBody(req);
      if (!body.review_remarks || !String(body.review_remarks).trim())
        return json(res, 422, { detail: "Review remarks cannot be blank." });
      db.prepare("UPDATE release_requests SET status=?, reviewed_by=?, review_remarks=?, reviewed_at=? WHERE id=?")
        .run(body.status, user.email, body.review_remarks, nowIso(), request.id);
      const fdr = db.prepare("SELECT * FROM fdrs WHERE id = ?").get(request.fdr_id);
      if (fdr) {
        const nextFdr = body.status === "approved" ? "released" : (fdr.status === "release_pending" ? "verified" : fdr.status);
        if (nextFdr !== fdr.status) {
          db.prepare("UPDATE fdrs SET status = ? WHERE id = ?").run(nextFdr, fdr.id);
          audit(user.email, "FDR_STATUS_UPDATED", "FDR", fdr.id, { fdr_number: fdr.fdr_number, new_status: nextFdr, reason: `release_request_${body.status}` });
        }
      }
      audit(user.email, `RELEASE_REQUEST_${String(body.status).toUpperCase()}`, "ReleaseRequest", request.id, { fdr_id: request.fdr_id });
      return json(res, 200, db.prepare("SELECT * FROM release_requests WHERE id = ?").get(request.id));
    }

    if (req.method === "GET" && p === "/api/institutions") {
      return json(res, 200, db.prepare("SELECT * FROM institutions ORDER BY id").all());
    }
    if (req.method === "POST" && p === "/api/institutions") {
      if (user.role !== "admin") return json(res, 403, { detail: "Administrator role required." });
      const body = await readBody(req);
      try {
        const info = db.prepare(
          "INSERT INTO institutions (name, institution_code, email, phone, address, is_active) VALUES (?,?,?,?,?,1)"
        ).run(body.name, body.institution_code, body.email, body.phone, body.address);
        audit(user.email, "INSTITUTION_CREATED", "Institution", info.lastInsertRowid, { name: body.name });
        return json(res, 201, db.prepare("SELECT * FROM institutions WHERE id = ?").get(info.lastInsertRowid));
      } catch {
        return json(res, 409, { detail: "Institution code already exists." });
      }
    }
    m = /^\/api\/institutions\/(\d+)$/.exec(p);
    if (m && req.method === "PATCH") {
      if (user.role !== "admin") return json(res, 403, { detail: "Administrator role required." });
      const body = await readBody(req);
      const existing = db.prepare("SELECT * FROM institutions WHERE id = ?").get(Number(m[1]));
      if (!existing) return json(res, 404, { detail: "Institution not found." });
      db.prepare("UPDATE institutions SET name=?, email=?, phone=?, address=?, is_active=? WHERE id=?")
        .run(body.name ?? existing.name, body.email ?? existing.email, body.phone ?? existing.phone,
          body.address ?? existing.address, body.is_active === undefined ? existing.is_active : (body.is_active ? 1 : 0), existing.id);
      audit(user.email, "INSTITUTION_UPDATED", "Institution", existing.id, { changed_fields: Object.keys(body) });
      return json(res, 200, db.prepare("SELECT * FROM institutions WHERE id = ?").get(existing.id));
    }

    if (req.method === "GET" && p === "/api/audit-logs") {
      if (user.role !== "admin") return json(res, 403, { detail: "Administrator role required." });
      const limit = Math.min(100, Number(url.searchParams.get("limit") || 100));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const clauses = []; const args = [];
      if (url.searchParams.get("action")) { clauses.push("action = ?"); args.push(url.searchParams.get("action")); }
      if (url.searchParams.get("entity_type")) { clauses.push("entity_type = ?"); args.push(url.searchParams.get("entity_type")); }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
      for (const row of rows) row.details = row.details ? JSON.parse(row.details) : null;
      return json(res, 200, rows);
    }

    if (req.method === "GET" && p === "/api/auth/users") {
      if (user.role !== "admin") return json(res, 403, { detail: "Administrator role required." });
      return json(res, 200, db.prepare("SELECT * FROM users ORDER BY id").all().map(publicUser));
    }
    if (req.method === "POST" && p === "/api/auth/users") {
      if (user.role !== "admin") return json(res, 403, { detail: "Administrator role required." });
      const body = await readBody(req);
      const exists = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(body.email);
      if (exists) return json(res, 409, { detail: "A user with this email already exists." });
      const info = db.prepare(
        "INSERT INTO users (full_name, email, password_hash, role, institution_id, is_active) VALUES (?,?,?,?,?,1)"
      ).run(body.full_name, body.email, "smoke-harness-not-a-real-hash", body.role,
        body.role === "institution" ? body.institution_id : null);
      audit(user.email, "USER_CREATED", "User", info.lastInsertRowid, { email: body.email, role: body.role });
      return json(res, 201, publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid)));
    }
    m = /^\/api\/auth\/users\/(\d+)\/status$/.exec(p);
    if (m && req.method === "PATCH") {
      if (user.role !== "admin") return json(res, 403, { detail: "Administrator role required." });
      const target = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(m[1]));
      if (!target) return json(res, 404, { detail: "User not found." });
      const body = await readBody(req);
      if (target.id === user.id && body.is_active === false) return json(res, 409, { detail: "You cannot deactivate your own account." });
      db.prepare("UPDATE users SET is_active = ? WHERE id = ?").run(body.is_active ? 1 : 0, target.id);
      audit(user.email, "USER_STATUS_CHANGED", "User", target.id, { is_active: Boolean(body.is_active) });
      return json(res, 200, publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(target.id)));
    }
    m = /^\/api\/auth\/users\/(\d+)\/institution$/.exec(p);
    if (m && req.method === "PATCH") {
      if (user.role !== "admin") return json(res, 403, { detail: "Administrator role required." });
      const target = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(m[1]));
      if (!target) return json(res, 404, { detail: "User not found." });
      const body = await readBody(req);
      db.prepare("UPDATE users SET institution_id = ? WHERE id = ?").run(body.institution_id, target.id);
      audit(user.email, "USER_INSTITUTION_ASSIGNED", "User", target.id, { institution_id: body.institution_id });
      return json(res, 200, publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(target.id)));
    }

    if (p === "/" || p === "/health") return json(res, 200, { status: "healthy", harness: true });

    return json(res, 404, { detail: `No harness route for ${req.method} ${p}` });
  } catch (error) {
    return json(res, 500, { detail: error instanceof Error ? error.message : String(error) });
  }
}).listen(Number(process.env.MOCK_API_PORT) || 8000, "127.0.0.1", () => {
  console.log("Smoke-test API harness on http://127.0.0.1:" + (process.env.MOCK_API_PORT || 8000) + " (db copy:", COPY_DB + ")");
});
