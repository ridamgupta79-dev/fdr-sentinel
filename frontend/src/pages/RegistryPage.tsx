import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Building2, Copy, Download, Plus, Search } from "lucide-react";
import { api } from "../api/endpoints";
import { DataTable, Field, Modal, type Column } from "../components/ui";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { downloadCsv } from "../utils/csv";
import { dateLabel, daysUntil, maturityInfo, money, statusLabel, tenureLabel } from "../utils/formatters";
import type { FDR, NavigateFn, RegistryFilters } from "../types";
import { usePortal } from "../state/PortalData";

const STATUS_OPTIONS = ["submitted", "under_verification", "verified", "verification_failed", "release_pending", "released"];

export default function RegistryPage({ onNavigate, initialFilters }: {
  onNavigate: NavigateFn;
  initialFilters?: RegistryFilters;
}) {
  const { fdrs, institutions, isAdmin, loading, institutionById, refreshFdrs } = usePortal();
  const toast = useToast();

  const [search, setSearch] = useState(initialFilters?.search ?? "");
  const [status, setStatus] = useState(initialFilters?.status ?? "");
  const [institutionId, setInstitutionId] = useState<number | "all">(initialFilters?.institutionId ?? "all");
  const [bank, setBank] = useState(initialFilters?.bank ?? "");
  const [maturityWindow, setMaturityWindow] = useState<RegistryFilters["maturityWindow"]>(initialFilters?.maturityWindow ?? "all");

  const [registerOpen, setRegisterOpen] = useState(Boolean(initialFilters?.openRegister));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    institution_id: "", fdr_number: "", bank_name: "", branch_name: "",
    deposit_amount: "", issue_date: "", maturity_date: "", interest_rate: "",
  });

  useEffect(() => {
    if (initialFilters?.status) setStatus(initialFilters.status);
    if (initialFilters?.maturityWindow) setMaturityWindow(initialFilters.maturityWindow);
    if (initialFilters?.institutionId) setInstitutionId(initialFilters.institutionId);
    if (initialFilters?.search) setSearch(initialFilters.search);
    if (initialFilters?.openRegister) setRegisterOpen(true);
  }, [initialFilters]);

  const banks = useMemo(() =>
    [...new Set(fdrs.map(item => item.bank_name))].sort(), [fdrs]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return fdrs.filter(item => {
      if (status && item.status !== status) return false;
      if (institutionId !== "all" && item.institution_id !== institutionId) return false;
      if (bank && item.bank_name !== bank) return false;
      if (needle) {
        const institutionName = institutionById.get(item.institution_id)?.name || "";
        const haystack = `${item.fdr_number} ${item.bank_name} ${item.branch_name || ""} ${institutionName}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (maturityWindow && maturityWindow !== "all") {
        const days = daysUntil(item.maturity_date) ?? 0;
        if (maturityWindow === "30d" && !(days >= 0 && days <= 30)) return false;
        if (maturityWindow === "90d" && !(days >= 0 && days <= 90)) return false;
        if (maturityWindow === "matured" && days >= 0) return false;
      }
      return true;
    });
  }, [fdrs, search, status, institutionId, bank, maturityWindow, institutionById]);

  const filteredValue = useMemo(() =>
    filtered.reduce((sum, item) => sum + Number(item.deposit_amount || 0), 0), [filtered]);

  async function submitFdr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const resolvedInstitution = isAdmin ? Number(form.institution_id) : Number(institutions[0]?.id ?? 0);
    if (!resolvedInstitution) {
      setFormError(isAdmin ? "Select an institution before submitting." : "Your account has no institution assigned.");
      return;
    }
    if (!form.maturity_date || form.maturity_date <= form.issue_date) {
      setFormError("Maturity date must be after issue date.");
      return;
    }
    setSaving(true);
    try {
      const created = await api.createFdr({
        institution_id: resolvedInstitution,
        fdr_number: form.fdr_number.trim(),
        bank_name: form.bank_name.trim(),
        branch_name: form.branch_name.trim() || null,
        deposit_amount: form.deposit_amount,
        issue_date: form.issue_date,
        maturity_date: form.maturity_date,
        interest_rate: form.interest_rate === "" ? null : form.interest_rate,
      });
      toast.push(`FDR ${created.fdr_number} registered successfully.`);
      setRegisterOpen(false);
      setForm({ institution_id: "", fdr_number: "", bank_name: "", branch_name: "", deposit_amount: "", issue_date: "", maturity_date: "", interest_rate: "" });
      await refreshFdrs();
      onNavigate("FDR Details", { fdrId: created.id });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to register this FDR.");
    } finally {
      setSaving(false);
    }
  }

  function copyNumber(value: string) {
    navigator.clipboard?.writeText(value).then(
      () => toast.push(`Copied ${value} to clipboard.`, "info"),
      () => toast.push("Could not copy the reference.", "error"),
    );
  }

  function exportCsv() {
    downloadCsv("fdr-registry.csv",
      ["FDR Number", "Institution", "Bank", "Branch", "Amount (INR)", "Issue Date", "Maturity Date", "Interest Rate", "Status"],
      filtered.map(item => [
        item.fdr_number,
        institutionById.get(item.institution_id)?.name || item.institution_id,
        item.bank_name, item.branch_name || "", Number(item.deposit_amount),
        item.issue_date, item.maturity_date,
        item.interest_rate !== null && item.interest_rate !== undefined ? Number(item.interest_rate) : "",
        statusLabel(item.status),
      ]));
  }

  const columns: Column<FDR>[] = [
    {
      key: "fdr_number", header: "FDR number", sortValue: row => row.fdr_number,
      render: row => (
        <span className="ref-cell">
          <button type="button" className="ref-link" onClick={event => { event.stopPropagation(); onNavigate("FDR Details", { fdrId: row.id }); }}>{row.fdr_number}</button>
          <button type="button" className="copy-button" aria-label={`Copy ${row.fdr_number}`} onClick={event => { event.stopPropagation(); copyNumber(row.fdr_number); }}><Copy size={13} /></button>
        </span>
      ),
    },
    {
      key: "institution", header: "Institution", hideOn: "md",
      sortValue: row => institutionById.get(row.institution_id)?.name || row.institution_id,
      render: row => {
        const name = institutionById.get(row.institution_id)?.name || `#${row.institution_id}`;
        return <span className="ellipsis-cell" title={name}>{name}</span>;
      },
    },
    {
      key: "bank", header: "Bank / branch", sortValue: row => row.bank_name,
      render: row => <span className="bank-cell"><strong>{row.bank_name}</strong><small>{row.branch_name || "—"}</small></span>,
    },
    {
      key: "amount", header: "Amount", align: "right", sortValue: row => Number(row.deposit_amount),
      render: row => <span className="amount-cell">{money(row.deposit_amount)}</span>,
    },
    {
      key: "maturity", header: "Maturity", sortValue: row => row.maturity_date, hideOn: "sm",
      render: row => {
        const info = maturityInfo(row.maturity_date);
        return <span className="maturity-cell">{dateLabel(row.maturity_date)}<small className={`tone-${info.tone}`}>{info.label}</small></span>;
      },
    },
    {
      key: "tenure", header: "Tenure", hideOn: "md", sortValue: row => row.maturity_date,
      render: row => tenureLabel(row.issue_date, row.maturity_date),
    },
    { key: "status", header: "Status", sortValue: row => row.status, render: row => <StatusBadge value={row.status} /> },
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Portal <span>/</span> FDR Registry</div>
          <h1>FDR registry</h1>
          <p>Search, filter and inspect registered Fixed Deposit Receipts.</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary-action" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button type="button" className="primary-action" onClick={() => { setRegisterOpen(true); setFormError(""); }}>
            <Plus size={15} /> Register FDR
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="filter-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search FDR number, bank, branch…" />
          </label>
          <label className="control-field">
            <select value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(option => <option key={option} value={option}>{statusLabel(option)}</option>)}
            </select>
          </label>
          {isAdmin && (
            <label className="control-field">
              <Building2 size={14} />
              <select value={String(institutionId)}
                onChange={event => setInstitutionId(event.target.value === "all" ? "all" : Number(event.target.value))}>
                <option value="all">All institutions</option>
                {institutions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <label className="control-field">
            <select value={bank} onChange={event => setBank(event.target.value)}>
              <option value="">All banks</option>
              {banks.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="control-field">
            <select value={maturityWindow} onChange={event => setMaturityWindow(event.target.value as RegistryFilters["maturityWindow"])}>
              <option value="all">Any maturity</option>
              <option value="30d">Maturing ≤ 30 days</option>
              <option value="90d">Maturing ≤ 90 days</option>
              <option value="matured">Matured</option>
            </select>
          </label>
        </div>
        <div className="filter-summary">
          <span>{filtered.length} of {fdrs.length} records · {money(filteredValue)} total value</span>
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={row => row.id}
          loading={loading}
          emptyMessage="No FDR records match the current filters."
          onRowClick={row => onNavigate("FDR Details", { fdrId: row.id })}
          pageSizeOptions={[12, 25, 50, 100]}
          initialSort={{ key: "amount", direction: "desc" }}
        />
      </section>

      {registerOpen && (
        <Modal wide title="Register a Fixed Deposit Receipt" subtitle="Enter the details exactly as shown on the FDR certificate."
          onClose={() => setRegisterOpen(false)}
          footer={
            <>
              <button type="button" className="secondary-action" onClick={() => setRegisterOpen(false)} disabled={saving}>Cancel</button>
              <button type="submit" form="fdr-register-form" className="primary-action" disabled={saving}>
                {saving ? "Registering…" : "Register FDR"}
              </button>
            </>
          }>
          <form id="fdr-register-form" className="modal-form" onSubmit={submitFdr}>
            {formError && <div className="feedback feedback-error" role="alert">{formError}</div>}
            {isAdmin ? (
              <Field label="Institution" required>
                <select required value={form.institution_id}
                  onChange={event => setFormMap(setForm, "institution_id", event.target.value)}>
                  <option value="">Select institution</option>
                  {institutions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
            ) : (
              <div className="fdr-institution-note"><Building2 size={16} /> {institutionById.get(institutions[0]?.id ?? -1)?.name || "Institution"} — records are filed under your institution.</div>
            )}
            <div className="form-grid">
              <Field label="FDR number" required>
                <input required maxLength={100} value={form.fdr_number}
                  onChange={event => setFormMap(setForm, "fdr_number", event.target.value)} placeholder="As printed on the certificate" />
              </Field>
              <Field label="Bank name" required>
                <input required maxLength={200} value={form.bank_name}
                  onChange={event => setFormMap(setForm, "bank_name", event.target.value)} placeholder="e.g. State Bank of India" />
              </Field>
              <Field label="Branch name">
                <input maxLength={200} value={form.branch_name}
                  onChange={event => setFormMap(setForm, "branch_name", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Deposit amount (₹)" required>
                <input required type="number" min="0.01" step="0.01" value={form.deposit_amount}
                  onChange={event => setFormMap(setForm, "deposit_amount", event.target.value)} placeholder="e.g. 500000.00" />
              </Field>
              <Field label="Issue date" required>
                <input required type="date" value={form.issue_date}
                  onChange={event => setFormMap(setForm, "issue_date", event.target.value)} />
              </Field>
              <Field label="Maturity date" required>
                <input required type="date" min={form.issue_date || undefined} value={form.maturity_date}
                  onChange={event => setFormMap(setForm, "maturity_date", event.target.value)} />
              </Field>
              <Field label="Interest rate (%)" hint="Annual rate as per the certificate">
                <input type="number" min="0" max="100" step="0.01" value={form.interest_rate}
                  onChange={event => setFormMap(setForm, "interest_rate", event.target.value)} placeholder="Optional" />
              </Field>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function setFormMap<T extends Record<string, string>>(
  setter: Dispatch<SetStateAction<T>>, key: keyof T, value: string,
) {
  setter(current => ({ ...current, [key]: value }));
}
