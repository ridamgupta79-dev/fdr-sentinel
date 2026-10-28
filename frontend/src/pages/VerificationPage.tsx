import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, FileCheck2, Search, ShieldCheck, WalletCards, XCircle } from "lucide-react";
import { api } from "../api/endpoints";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { EmptyState } from "../components/ui";
import { compactMoney, dateLabel, dateTimeLabel, maturityInfo, percent } from "../utils/formatters";
import type { NavigateFn, Verification } from "../types";
import { usePortal } from "../state/PortalData";

type QueueFilter = "all" | "queue" | "verified" | "failed";

export default function VerificationPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const { user, isAdmin, fdrs, verifications, loading, institutionById, refreshFdrs, refreshVerifications } = usePortal();
  const toast = useToast();

  const [filter, setFilter] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<Verification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ method: "simulated", result: "verified", reference_number: "", remarks: "" });

  const filteredFdrs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return fdrs.filter(item => {
      if (filter === "queue" && !["submitted", "under_verification"].includes(item.status)) return false;
      if (filter === "verified" && item.status !== "verified") return false;
      if (filter === "failed" && item.status !== "verification_failed") return false;
      if (needle) {
        const haystack = `${item.fdr_number} ${item.bank_name} ${item.branch_name || ""} ${institutionById.get(item.institution_id)?.name || ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    }).sort((a, b) => {
      const queueRank = (status: string) => (["submitted", "under_verification"].includes(status) ? 0 : status === "verification_failed" ? 1 : 2);
      return queueRank(a.status) - queueRank(b.status) || a.id - b.id;
    });
  }, [fdrs, filter, search, institutionById]);

  useEffect(() => {
    if (selectedId === null && filteredFdrs.length) setSelectedId(filteredFdrs[0].id);
  }, [filteredFdrs, selectedId]);

  useEffect(() => {
    if (selectedId === null) { setHistory([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    api.listFdrVerifications(selectedId)
      .then(items => { if (!cancelled) setHistory(items); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const selected = fdrs.find(item => item.id === selectedId) || null;
  const verificationsForSelected = verifications.filter(item => item.fdr_id === selectedId).length;

  const summary = useMemo(() => ({
    total: fdrs.length,
    queue: fdrs.filter(item => ["submitted", "under_verification"].includes(item.status)).length,
    verified: fdrs.filter(item => item.status === "verified").length,
    failed: fdrs.filter(item => item.status === "verification_failed").length,
    attemptsVerified: verifications.filter(item => item.result === "verified").length,
    attemptsFailed: verifications.filter(item => item.result === "failed").length,
  }), [fdrs, verifications]);

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;
    if (selectedId === null) return;
    setSaving(true);
    try {
      await api.createVerification(selectedId, {
        method: form.method,
        result: form.result,
        reference_number: form.reference_number.trim() || null,
        remarks: form.remarks.trim() || null,
        checked_by: user.full_name || user.email,
      });
      toast.push(`Verification recorded for ${selected?.fdr_number || `FDR #${selectedId}`}.`);
      setForm(current => ({ ...current, reference_number: "", remarks: "" }));
      await Promise.all([refreshFdrs(), refreshVerifications()]);
      const refreshed = await api.listFdrVerifications(selectedId);
      setHistory(refreshed);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not save the verification.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Portal <span>/</span> Verification</div>
          <h1>Verification center</h1>
          <p>Review deposit certificates, record outcomes and track verification history.</p>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-5">
        <MetricCard title="Accessible FDRs" value={String(summary.total)} note="Records in your scope" icon={<WalletCards size={17} />} compact />
        <MetricCard title="Awaiting verification" value={String(summary.queue)} note="Submitted or under verification" icon={<Clock3 size={17} />} tone="pending" compact
          onClick={() => { setFilter("queue"); }} />
        <MetricCard title="Verified" value={String(summary.verified)} note="Passed verification" icon={<CheckCircle2 size={17} />} tone="good" compact
          onClick={() => { setFilter("verified"); }} />
        <MetricCard title="Failed" value={String(summary.failed)} note="Did not pass checks" icon={<XCircle size={17} />} tone="bad" compact
          onClick={() => { setFilter("failed"); }} />
        <MetricCard title="Attempt success rate" value={percent(summary.attemptsVerified, summary.attemptsVerified + summary.attemptsFailed)}
          note={`${summary.attemptsVerified + summary.attemptsFailed} attempts recorded`} icon={<ShieldCheck size={17} />} tone="good" compact />
      </div>

      <section className="panel registry-panel">
        <div className="panel-heading">
          <div><h2>Verification queue</h2><p>Select a record — its details, form and history appear below</p></div>
          <label className="search-field search-field-sm">
            <Search size={15} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search FDR, bank, institution…" />
          </label>
        </div>
        <div className="chip-row chip-row-panel">
          {([["all", "All records"], ["queue", "In queue"], ["verified", "Verified"], ["failed", "Failed"]] as const).map(([key, label]) => (
            <button type="button" key={key} className={`chip ${filter === key ? "chip-active" : ""}`} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <div className="table-wrap table-scroll-y">
          <table>
            <thead><tr><th>FDR / bank</th><th className="cell-right">Amount</th><th>Maturity</th><th>Status</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="empty-cell">Loading FDR records…</td></tr>}
              {!loading && filteredFdrs.map(record => {
                const info = maturityInfo(record.maturity_date);
                return (
                  <tr key={record.id} className={`row-clickable ${selectedId === record.id ? "row-selected" : ""}`}
                    onClick={() => setSelectedId(record.id)}>
                    <td>
                      <span className="stack-cell">
                        <strong>{record.fdr_number}</strong>
                        <small>{record.bank_name}{record.branch_name ? ` · ${record.branch_name}` : ""}</small>
                      </span>
                    </td>
                    <td className="cell-right">{compactMoney(record.deposit_amount)}</td>
                    <td className="hide-sm"><span className="stack-cell"><span>{dateLabel(record.maturity_date)}</span><small className={`tone-${info.tone}`}>{info.label}</small></span></td>
                    <td><StatusBadge value={record.status} /></td>
                  </tr>
                );
              })}
              {!loading && !filteredFdrs.length && (
                <tr><td colSpan={4} className="empty-cell"><EmptyState icon={<FileCheck2 size={22} />} title="Nothing to verify" message="No records match this filter." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="verification-workspace">
        <div className="workspace-main">
          <section className="panel">
            <div className="panel-heading"><div><h2>Selected record</h2><p>Details from the registry</p></div><FileCheck2 size={19} /></div>
            {selected ? (
              <div className="detail-body">
                <dl className="detail-list detail-list-2col">
                  <div><dt>FDR number</dt><dd className="strong-cell">{selected.fdr_number}</dd></div>
                  <div><dt>Status</dt><dd><StatusBadge value={selected.status} /></dd></div>
                  <div><dt>Bank</dt><dd>{selected.bank_name}</dd></div>
                  <div><dt>Institution</dt><dd>{institutionById.get(selected.institution_id)?.name || `#${selected.institution_id}`}</dd></div>
                  <div><dt>Amount</dt><dd>{compactMoney(selected.deposit_amount)}</dd></div>
                  <div><dt>Maturity</dt><dd>{dateLabel(selected.maturity_date)}</dd></div>
                </dl>
                <button type="button" className="text-action" onClick={() => onNavigate("FDR Details", { fdrId: selected.id })}>Open full record</button>
              </div>
            ) : (
              <div className="detail-body"><p className="empty-cell">Select an FDR from the queue.</p></div>
            )}
          </section>

          {isAdmin && selected && (
            <section className="panel">
              <div className="panel-heading"><div><h2>Record verification</h2><p>Saves an outcome and updates the record status</p></div></div>
              <form className="detail-body form-stack" onSubmit={submitVerification}>
                <div className="form-grid form-grid-2">
                  <label className="form-field"><span className="field-label">Method</span>
                    <select value={form.method} onChange={event => setForm(current => ({ ...current, method: event.target.value }))}>
                      <option value="simulated">Simulated bank check</option>
                      <option value="manual">Manual review</option>
                    </select>
                  </label>
                  <label className="form-field"><span className="field-label">Result</span>
                    <select value={form.result} onChange={event => setForm(current => ({ ...current, result: event.target.value }))}>
                      <option value="verified">Verified</option>
                      <option value="failed">Failed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </label>
                </div>
                <label className="form-field"><span className="field-label">Reference number</span>
                  <input maxLength={100} value={form.reference_number}
                    onChange={event => setForm(current => ({ ...current, reference_number: event.target.value }))}
                    placeholder="Bank or review reference (optional)" />
                </label>
                <label className="form-field"><span className="field-label">Remarks</span>
                  <textarea rows={3} maxLength={1000} value={form.remarks}
                    onChange={event => setForm(current => ({ ...current, remarks: event.target.value }))}
                    placeholder="Explain the verification outcome (optional)" />
                </label>
                <button type="submit" className="primary-action" disabled={saving}>
                  {saving ? "Saving result…" : "Save verification result"}
                </button>
                <p className="verification-disclaimer"><ShieldCheck size={15} /> Simulated checks are recorded demo outcomes, not live confirmation from a bank.</p>
              </form>
            </section>
          )}
        </div>

        <section className="panel workspace-side">
          <div className="panel-heading">
            <div><h2>Verification history</h2><p>{selected ? `Attempts for ${selected.fdr_number}` : "Select a record"}</p></div>
            <span className="history-count">{verificationsForSelected} in log</span>
          </div>
          <div className="timeline">
            {historyLoading && <p className="empty-cell">Loading history…</p>}
            {!historyLoading && history.map(item => (
              <article className="timeline-item" key={item.id}>
                <span className={`timeline-dot dot-${item.result}`} />
                <div className="timeline-body">
                  <header><strong>{item.method === "manual" ? "Manual review" : "Simulated check"}</strong><StatusBadge value={item.result} /></header>
                  <div className="timeline-meta"><span>{dateTimeLabel(item.created_at)}</span><span>{item.checked_by || "Reviewer not recorded"}</span></div>
                  {item.reference_number && <p><strong>Reference:</strong> {item.reference_number}</p>}
                  {item.remarks && <p className="timeline-remarks">{item.remarks}</p>}
                </div>
              </article>
            ))}
            {!historyLoading && !history.length && selected && <p className="empty-cell">No verification attempts for this record yet.</p>}
            {!historyLoading && !selected && <p className="empty-cell">Select an FDR to view its history.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
