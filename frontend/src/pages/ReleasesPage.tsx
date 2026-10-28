import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, FileText, Plus, Search, XCircle } from "lucide-react";
import { api } from "../api/endpoints";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { ConfirmDialog, DataTable, Field, Modal, type Column } from "../components/ui";
import { downloadCsv } from "../utils/csv";
import { compactMoney, dateTimeLabel, money, relativeTime, statusLabel } from "../utils/formatters";
import type { NavigateFn, ReleaseRequest } from "../types";
import { usePortal } from "../state/PortalData";

export default function ReleasesPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const { user, isAdmin, fdrById, requests, institutionById, loading, refreshReleases, refreshFdrs } = usePortal();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState<"all" | number>("all");

  const [detail, setDetail] = useState<ReleaseRequest | null>(null);
  const [reviewMode, setReviewMode] = useState<"approved" | "rejected" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [confirmAction, setConfirmAction] = useState(false);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createFdrId, setCreateFdrId] = useState("");
  const [createReason, setCreateReason] = useState("");

  const eligibleFdrs = useMemo(() =>
    [...fdrById.values()].sort((a, b) => b.id - a.id), [fdrById]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requests.filter(item => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (institutionFilter !== "all" && fdrById.get(item.fdr_id)?.institution_id !== institutionFilter) return false;
      if (needle) {
        const fdr = fdrById.get(item.fdr_id);
        const haystack = `${item.id} ${fdr?.fdr_number || ""} ${fdr?.bank_name || ""} ${item.requested_by || ""} ${item.reason || ""} ${institutionById.get(fdr?.institution_id ?? -1)?.name || ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, institutionFilter, search, fdrById, institutionById]);

  const summary = useMemo(() => {
    const pending = requests.filter(item => item.status === "pending");
    const pendingValue = pending.reduce((sum, item) => sum + Number(fdrById.get(item.fdr_id)?.deposit_amount || 0), 0);
    return {
      pending: pending.length,
      approved: requests.filter(item => item.status === "approved").length,
      rejected: requests.filter(item => item.status === "rejected").length,
      pendingValue,
      reviewHours: (() => {
        const reviewed = requests.filter(item => item.reviewed_at && item.created_at);
        if (!reviewed.length) return null;
        const totalHours = reviewed.reduce((sum, item) =>
          sum + (new Date(item.reviewed_at!).getTime() - new Date(item.created_at!).getTime()) / 3600000, 0);
        return Math.round(totalHours / reviewed.length);
      })(),
    };
  }, [requests, fdrById]);

  async function submitCreate() {
    const fdr = fdrById.get(Number(createFdrId));
    if (!fdr) { toast.push("Select an FDR for the request.", "error"); return; }
    setBusy(true);
    try {
      await api.createReleaseRequest(fdr.id, user.email, createReason.trim());
      toast.push(`Release request submitted for ${fdr.fdr_number}.`);
      setCreateOpen(false);
      setCreateFdrId("");
      setCreateReason("");
      await Promise.all([refreshReleases(), refreshFdrs()]);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not submit the request.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (!detail || !reviewMode) return;
    setBusy(true);
    try {
      await api.reviewReleaseRequest(detail.id, reviewMode, user.email, remarks.trim());
      toast.push(`Request #${detail.id} ${reviewMode}.`);
      setDetail(null);
      setReviewMode(null);
      setRemarks("");
      await Promise.all([refreshReleases(), refreshFdrs()]);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not save the review.", "error");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv("release-requests.csv",
      ["Request", "FDR Number", "Institution", "Requested By", "Reason", "Status", "Created", "Reviewed By", "Review Remarks", "Reviewed At"],
      filtered.map(item => {
        const fdr = fdrById.get(item.fdr_id);
        return [
          item.id, fdr?.fdr_number || item.fdr_id,
          institutionById.get(fdr?.institution_id ?? -1)?.name || "",
          item.requested_by || "", item.reason || "", statusLabel(item.status),
          item.created_at || "", item.reviewed_by || "", item.review_remarks || "", item.reviewed_at || "",
        ];
      }));
  }

  const columns: Column<ReleaseRequest>[] = [
    { key: "id", header: "Request", sortValue: row => row.id, render: row => <span className="strong-cell">#{row.id}</span> },
    {
      key: "fdr", header: "FDR", sortValue: row => fdrById.get(row.fdr_id)?.fdr_number || row.fdr_id,
      render: row => {
        const fdr = fdrById.get(row.fdr_id);
        return (
          <button type="button" className="ref-link" onClick={event => { event.stopPropagation(); if (fdr) onNavigate("FDR Details", { fdrId: fdr.id }); }}>
            {fdr?.fdr_number || `FDR #${row.fdr_id}`}
          </button>
        );
      },
    },
    {
      key: "institution", header: "Institution", hideOn: "md",
      sortValue: row => institutionById.get(fdrById.get(row.fdr_id)?.institution_id ?? -1)?.name || "",
      render: row => {
        const name = institutionById.get(fdrById.get(row.fdr_id)?.institution_id ?? -1)?.name || "—";
        return <span className="ellipsis-cell" style={{ maxWidth: 215 }} title={name}>{name}</span>;
      },
    },
    { key: "requester", header: "Requested by", hideOn: "md", sortValue: row => row.requested_by || "", render: row => <span className="ellipsis-cell" style={{ maxWidth: 185 }} title={row.requested_by || undefined}>{row.requested_by || "—"}</span> },
    { key: "reason", header: "Reason", render: row => <span className="reason-cell" title={row.reason || undefined}>{row.reason}</span> },
    { key: "created", header: "Requested", hideOn: "sm", sortValue: row => row.created_at || "", render: row => relativeTime(row.created_at) },
    { key: "status", header: "Status", sortValue: row => row.status || "", render: row => <StatusBadge value={row.status} /> },
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Portal <span>/</span> Release Requests</div>
          <h1>Release management</h1>
          <p>Track deposit release requests from submission to review decision.</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary-action" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button type="button" className="primary-action" onClick={() => setCreateOpen(true)}><Plus size={15} /> New request</button>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-4">
        <MetricCard title="Pending review" value={String(summary.pending)} note={`${money(summary.pendingValue)} held in pending requests`} icon={<Clock3 size={17} />} tone="pending"
          onClick={() => setStatusFilter("pending")} />
        <MetricCard title="Approved" value={String(summary.approved)} note="Funds released to institutions" icon={<CheckCircle2 size={17} />} tone="good"
          onClick={() => setStatusFilter("approved")} />
        <MetricCard title="Rejected" value={String(summary.rejected)} note="Returned for rework" icon={<XCircle size={17} />} tone="bad"
          onClick={() => setStatusFilter("rejected")} />
        <MetricCard title="Avg. review time" value={summary.reviewHours === null ? "—" : `${summary.reviewHours} h`}
          note="From request to decision" icon={<FileText size={17} />} />
      </div>

      <section className="panel">
        <div className="filter-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search request, FDR, requester…" />
          </label>
          <label className="control-field">
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          {isAdmin && (
            <label className="control-field">
              <select value={String(institutionFilter)}
                onChange={event => setInstitutionFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
                <option value="all">All institutions</option>
                {institutionById.size ? [...institutionById.values()].map(item => <option key={item.id} value={item.id}>{item.name}</option>) : null}
              </select>
            </label>
          )}
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={row => row.id}
          loading={loading}
          emptyMessage="No release requests match the current filters."
          onRowClick={row => { setDetail(row); setReviewMode(null); setRemarks(""); }}
          pageSizeOptions={[10, 25, 50]}
          initialSort={{ key: "id", direction: "desc" }}
        />
      </section>

      {detail && (
        <Modal wide
          title={`Release request #${detail.id}`}
          subtitle={fdrById.get(detail.fdr_id)?.fdr_number ? `Linked FDR: ${fdrById.get(detail.fdr_id)?.fdr_number}` : undefined}
          onClose={() => { setDetail(null); setReviewMode(null); }}>
          <div className="request-detail">
            <div className="request-summary">
              <StatusBadge value={detail.status} />
              <span className="muted">Requested {dateTimeLabel(detail.created_at)} by {detail.requested_by || "—"}</span>
            </div>
            <div className="request-reason">{detail.reason}</div>
            {fdrById.get(detail.fdr_id) && (
              <dl className="detail-list detail-list-3col">
                <div><dt>Deposit</dt><dd>{money(fdrById.get(detail.fdr_id)?.deposit_amount)}</dd></div>
                <div><dt>Bank</dt><dd>{fdrById.get(detail.fdr_id)?.bank_name}</dd></div>
                <div><dt>FDR status</dt><dd><StatusBadge value={fdrById.get(detail.fdr_id)?.status} /></dd></div>
              </dl>
            )}
            {detail.reviewed_by && (
              <div className="review-block">
                <strong>Review by {detail.reviewed_by}</strong>
                <span className="muted">{dateTimeLabel(detail.reviewed_at)}</span>
                <p>{detail.review_remarks}</p>
              </div>
            )}
            {isAdmin && detail.status === "pending" && !reviewMode && (
              <div className="review-actions">
                <button type="button" className="good-action" onClick={() => { setReviewMode("approved"); setRemarks(""); }}>
                  <CheckCircle2 size={15} /> Approve
                </button>
                <button type="button" className="danger-action" onClick={() => { setReviewMode("rejected"); setRemarks(""); }}>
                  <XCircle size={15} /> Reject
                </button>
              </div>
            )}
            {isAdmin && reviewMode && (
              <div className="review-form">
                <Field label={`Review remarks (${reviewMode})`} required hint="Recorded in the audit trail; remarks are mandatory.">
                  <textarea rows={3} maxLength={5000} value={remarks} autoFocus
                    onChange={event => setRemarks(event.target.value)}
                    placeholder={reviewMode === "approved"
                      ? "e.g. Documents verified; no outstanding liabilities reported."
                      : "e.g. Liability certificate missing; request returned to the institution."} />
                </Field>
                <div className="review-actions">
                  <button type="button" className="secondary-action" onClick={() => setReviewMode(null)} disabled={busy}>Back</button>
                  <button type="button" className={reviewMode === "approved" ? "good-action" : "danger-action"}
                    disabled={busy || remarks.trim().length < 4} onClick={() => setConfirmAction(true)}>
                    {busy ? "Saving…" : `Confirm ${reviewMode}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {detail && reviewMode && confirmAction && (
        <ConfirmDialog
          title={`${reviewMode === "approved" ? "Approve" : "Reject"} request #${detail.id}?`}
          message={reviewMode === "approved"
            ? "Approving releases the linked deposit and records the decision in the audit trail. This cannot be undone."
            : "Rejecting returns the request to the institution with your remarks. This cannot be undone."}
          confirmLabel={reviewMode === "approved" ? "Approve request" : "Reject request"}
          danger={reviewMode === "rejected"}
          busy={busy}
          onConfirm={() => { setConfirmAction(false); void submitReview(); }}
          onCancel={() => setConfirmAction(false)}
        />
      )}

      {createOpen && (
        <Modal title="New release request" subtitle="Select an accessible FDR and explain why the deposit can be released."
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button type="button" className="secondary-action" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className="primary-action" onClick={submitCreate}
                disabled={busy || !createFdrId || createReason.trim().length < 4}>
                {busy ? "Submitting…" : "Submit request"}
              </button>
            </>
          }>
          <div className="modal-form">
            <Field label="FDR record" required>
              <select value={createFdrId} onChange={event => setCreateFdrId(event.target.value)}>
                <option value="">Select FDR</option>
                {eligibleFdrs.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.fdr_number} · {item.bank_name} · {compactMoney(item.deposit_amount)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason" required hint="Reviewed by portal administrators before any release.">
              <textarea rows={4} maxLength={5000} value={createReason}
                onChange={event => setCreateReason(event.target.value)}
                placeholder="e.g. Security deposit release requested; obligations complete for the current academic year." />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
