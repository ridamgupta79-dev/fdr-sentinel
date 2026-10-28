import { useEffect, useState } from "react";
import {
  ArrowLeft, CalendarDays, ClipboardList, Copy, FileCheck2, FileText,
  Landmark, ShieldCheck, Wallet,
} from "lucide-react";
import { api } from "../api/endpoints";
import { Field, Modal } from "../components/ui";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import {
  actionLabel, dateLabel, dateTimeLabel, daysUntil, maturityInfo, money, statusLabel, tenureLabel,
} from "../utils/formatters";
import type { NavigateFn } from "../types";
import { usePortal } from "../state/PortalData";

export default function FdrDetailPage({ fdrId, onNavigate }: { fdrId: number; onNavigate: NavigateFn }) {
  const { user, isAdmin, fdrById, institutionById, requests, auditLogs, refreshFdrs, refreshReleases, refreshAdminData } = usePortal();
  const toast = useToast();
  const fdr = fdrById.get(fdrId);

  const [history, setHistory] = useState<{ loading: boolean; items: Awaited<ReturnType<typeof api.listFdrVerifications>> }>({ loading: false, items: [] });
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [verificationForm, setVerificationForm] = useState({ method: "simulated", result: "verified", reference_number: "", remarks: "" });
  const [releaseReason, setReleaseReason] = useState("");

  const resolvedFdr = fdr ?? null;

  useEffect(() => {
    if (!resolvedFdr) return;
    let cancelled = false;
    setHistory({ loading: true, items: [] });
    api.listFdrVerifications(resolvedFdr.id)
      .then(items => { if (!cancelled) setHistory({ loading: false, items }); })
      .catch(() => { if (!cancelled) setHistory({ loading: false, items: [] }); });
    return () => { cancelled = true; };
  }, [resolvedFdr]);

  if (!fdr) {
    return (
      <div className="panel placeholder-panel">
        <h2>Record not available</h2>
        <p>This FDR does not exist or is outside your authorized scope.</p>
        <button type="button" className="secondary-action" onClick={() => onNavigate("FDR Registry")}>
          <ArrowLeft size={15} /> Back to registry
        </button>
      </div>
    );
  }

  const institution = institutionById.get(fdr.institution_id);
  const linkedRequests = requests.filter(item => item.fdr_id === fdr.id).sort((a, b) => b.id - a.id);
  const linkedAudit = isAdmin
    ? auditLogs.filter(item =>
      (item.entity_type === "FDR" && item.entity_id === fdr.id) ||
      (item.details && typeof item.details === "object" && (item.details as Record<string, unknown>).fdr_id === fdr.id))
      .slice(0, 12)
    : [];

  const info = maturityInfo(fdr.maturity_date);
  const days = daysUntil(fdr.maturity_date);
  const totalTenure = Math.max(1, (new Date(fdr.maturity_date).getTime() - new Date(fdr.issue_date).getTime()) / 86400000);
  const elapsed = Math.min(100, Math.max(0, ((totalTenure - (days ?? 0)) / totalTenure) * 100));

  async function reloadHistory() {
    if (!fdr) return;
    setHistory({ loading: true, items: [] });
    try {
      const items = await api.listFdrVerifications(fdr.id);
      setHistory({ loading: false, items });
    } catch {
      setHistory({ loading: false, items: [] });
    }
  }

  async function submitVerification() {
    if (!fdr) return;
    setBusy(true);
    try {
      await api.createVerification(fdr.id, {
        method: verificationForm.method,
        result: verificationForm.result,
        reference_number: verificationForm.reference_number.trim() || null,
        remarks: verificationForm.remarks.trim() || null,
        checked_by: user.full_name || user.email,
      });
      toast.push(`Verification saved for ${fdr.fdr_number}.`);
      setVerificationOpen(false);
      setVerificationForm(current => ({ ...current, reference_number: "", remarks: "" }));
      await Promise.all([refreshFdrs(), refreshAdminData(), reloadHistory()]);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not save the verification.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitReleaseRequest() {
    if (!fdr) return;
    setBusy(true);
    try {
      await api.createReleaseRequest(fdr.id, user.email, releaseReason.trim());
      toast.push(`Release request submitted for ${fdr.fdr_number}.`);
      setReleaseOpen(false);
      setReleaseReason("");
      await Promise.all([refreshReleases(), refreshFdrs()]);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not submit the release request.", "error");
    } finally {
      setBusy(false);
    }
  }

  function copyNumber() {
    navigator.clipboard?.writeText(fdr!.fdr_number).then(() => toast.push("FDR reference copied.", "info"));
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <button type="button" className="back-link" onClick={() => onNavigate("FDR Registry")}>
            <ArrowLeft size={15} /> Registry
          </button>
          <div className="detail-title">
            <h1>{fdr.fdr_number}</h1>
            <button type="button" className="copy-button" aria-label="Copy FDR number" onClick={copyNumber}><Copy size={14} /></button>
            <StatusBadge value={fdr.status} />
          </div>
          <p>{fdr.bank_name}{fdr.branch_name ? ` · ${fdr.branch_name}` : ""} · Filed under {institution?.name || `institution #${fdr.institution_id}`}</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary-action" onClick={() => setReleaseOpen(true)}>
            <FileText size={15} /> Request release
          </button>
          {isAdmin && (
            <button type="button" className="primary-action" onClick={() => setVerificationOpen(true)}>
              <FileCheck2 size={15} /> Record verification
            </button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel detail-panel">
          <div className="panel-heading"><div><h2>Deposit information</h2><p>Details recorded at registration</p></div><Wallet size={18} /></div>
          <div className="detail-body">
            <div className="detail-amount">
              <span>{money(fdr.deposit_amount)}</span>
              <small>Principal deposit{fdr.interest_rate !== null && fdr.interest_rate !== undefined ? ` · ${Number(fdr.interest_rate)}% p.a.` : ""}</small>
            </div>
            <dl className="detail-list">
              <div><dt>Institution</dt><dd>{institution?.name || `#${fdr.institution_id}`}</dd></div>
              <div><dt>Institution code</dt><dd>{institution?.institution_code || "—"}</dd></div>
              <div><dt>Bank</dt><dd>{fdr.bank_name}</dd></div>
              <div><dt>Branch</dt><dd>{fdr.branch_name || "—"}</dd></div>
              <div><dt>Issue date</dt><dd>{dateLabel(fdr.issue_date)}</dd></div>
              <div><dt>Maturity date</dt><dd>{dateLabel(fdr.maturity_date)}</dd></div>
              <div><dt>Tenure</dt><dd>{tenureLabel(fdr.issue_date, fdr.maturity_date)}</dd></div>
              <div><dt>Interest rate</dt><dd>{fdr.interest_rate !== null && fdr.interest_rate !== undefined ? `${Number(fdr.interest_rate)}%` : "—"}</dd></div>
            </dl>
            <div className="tenure-track">
              <div className="tenure-track-head">
                <span><CalendarDays size={13} /> {dateLabel(fdr.issue_date)}</span>
                <span className={`tone-${info.tone}`}>{info.label}</span>
                <span>{dateLabel(fdr.maturity_date)}</span>
              </div>
              <div className="progress-track"><span style={{ width: `${elapsed}%` }} /></div>
            </div>
          </div>
        </section>

        <section className="panel detail-panel">
          <div className="panel-heading">
            <div><h2>Verification history</h2><p>{history.items.length} recorded attempt{history.items.length === 1 ? "" : "s"}</p></div>
            <FileCheck2 size={18} />
          </div>
          <div className="timeline">
            {history.loading && <p className="empty-cell">Loading verification history…</p>}
            {!history.loading && history.items.map(item => (
              <article className="timeline-item" key={item.id}>
                <span className={`timeline-dot dot-${item.result}`} />
                <div className="timeline-body">
                  <header>
                    <strong>{item.method === "manual" ? "Manual review" : "Simulated check"}</strong>
                    <StatusBadge value={item.result} />
                  </header>
                  <div className="timeline-meta">
                    <span>{dateTimeLabel(item.created_at)}</span>
                    <span>{item.checked_by || "Reviewer not recorded"}</span>
                  </div>
                  {item.reference_number && <p><ClipboardList size={13} /> Reference: {item.reference_number}</p>}
                  {item.remarks && <p className="timeline-remarks">{item.remarks}</p>}
                </div>
              </article>
            ))}
            {!history.loading && !history.items.length && (
              <p className="empty-cell">No verification attempts recorded for this FDR yet.</p>
            )}
          </div>
        </section>

        <section className="panel detail-panel">
          <div className="panel-heading">
            <div><h2>Release requests</h2><p>{linkedRequests.length} linked request{linkedRequests.length === 1 ? "" : "s"}</p></div>
            <FileText size={18} />
          </div>
          <div className="timeline">
            {linkedRequests.map(item => (
              <article className="timeline-item" key={item.id}>
                <span className={`timeline-dot dot-${item.status === "approved" ? "verified" : item.status === "rejected" ? "failed" : "pending"}`} />
                <div className="timeline-body">
                  <header>
                    <strong>Request #{item.id}</strong>
                    <StatusBadge value={item.status} />
                  </header>
                  <div className="timeline-meta">
                    <span>Requested {dateTimeLabel(item.created_at)} by {item.requested_by}</span>
                  </div>
                  <p className="timeline-remarks">{item.reason}</p>
                  {item.reviewed_by && (
                    <p className="timeline-review">
                      <ShieldCheck size={13} /> {statusLabel(item.status!)} by {item.reviewed_by} · {dateTimeLabel(item.reviewed_at)}
                      {item.review_remarks ? ` — ${item.review_remarks}` : ""}
                    </p>
                  )}
                </div>
              </article>
            ))}
            {!linkedRequests.length && <p className="empty-cell">No release requests for this deposit.</p>}
          </div>
        </section>

        {isAdmin && (
          <section className="panel detail-panel">
            <div className="panel-heading">
              <div><h2>Audit trail</h2><p>Events related to this record</p></div>
              <Landmark size={18} />
            </div>
            <div className="timeline">
              {linkedAudit.map(event => (
                <article className="timeline-item" key={event.id}>
                  <span className="timeline-dot dot-neutral" />
                  <div className="timeline-body">
                    <header><strong>{actionLabel(event.action)}</strong></header>
                    <div className="timeline-meta">
                      <span>{dateTimeLabel(event.created_at)}</span>
                      <span>{event.actor}</span>
                    </div>
                    {event.details?.demo_seed === true && <p className="timeline-demo">Demo seed event</p>}
                  </div>
                </article>
              ))}
              {!linkedAudit.length && <p className="empty-cell">No audit events visible for this record.</p>}
            </div>
          </section>
        )}
      </div>

      {verificationOpen && (
        <Modal title="Record verification" subtitle={`Outcome for ${fdr.fdr_number} — this updates the record status.`}
          onClose={() => setVerificationOpen(false)}
          footer={
            <>
              <button type="button" className="secondary-action" onClick={() => setVerificationOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className="primary-action" onClick={submitVerification} disabled={busy}>
                {busy ? "Saving…" : "Save verification"}
              </button>
            </>
          }>
          <div className="modal-form">
            <Field label="Method" required>
              <select value={verificationForm.method}
                onChange={event => setVerificationForm(current => ({ ...current, method: event.target.value }))}>
                <option value="simulated">Simulated bank check</option>
                <option value="manual">Manual review</option>
              </select>
            </Field>
            <Field label="Result" required hint="Verified or failed results update the FDR status immediately.">
              <select value={verificationForm.result}
                onChange={event => setVerificationForm(current => ({ ...current, result: event.target.value }))}>
                <option value="verified">Verified</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </Field>
            <Field label="Reference number">
              <input maxLength={100} value={verificationForm.reference_number}
                onChange={event => setVerificationForm(current => ({ ...current, reference_number: event.target.value }))}
                placeholder="Bank or review reference (optional)" />
            </Field>
            <Field label="Remarks">
              <textarea rows={3} maxLength={1000} value={verificationForm.remarks}
                onChange={event => setVerificationForm(current => ({ ...current, remarks: event.target.value }))}
                placeholder="Explain the verification outcome (optional)" />
            </Field>
            <p className="verification-disclaimer"><ShieldCheck size={15} /> Simulated checks are recorded demo outcomes, not live confirmation from a bank.</p>
          </div>
        </Modal>
      )}

      {releaseOpen && (
        <Modal title="Request release" subtitle={`Submit a release request for ${fdr.fdr_number}.`}
          onClose={() => setReleaseOpen(false)}
          footer={
            <>
              <button type="button" className="secondary-action" onClick={() => setReleaseOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className="primary-action" onClick={submitReleaseRequest} disabled={busy || releaseReason.trim().length < 4}>
                {busy ? "Submitting…" : "Submit request"}
              </button>
            </>
          }>
          <div className="modal-form">
            <Field label="Reason" required hint="Explain why the deposit can be released. Administrators will review this request.">
              <textarea rows={4} maxLength={5000} value={releaseReason} required
                onChange={event => setReleaseReason(event.target.value)}
                placeholder="e.g. Supply obligations for the approved programmes are complete for the current academic year." />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
