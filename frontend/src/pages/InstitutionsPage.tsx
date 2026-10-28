import { useMemo, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Download, Landmark, Plus, Search, XCircle } from "lucide-react";
import { api } from "../api/endpoints";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { DataTable, Field, Modal, type Column } from "../components/ui";
import { downloadCsv } from "../utils/csv";
import { compactMoney, money } from "../utils/formatters";
import type { Institution, NavigateFn } from "../types";
import { usePortal } from "../state/PortalData";

type InstitutionStats = { count: number; value: number; verified: number; pendingReleases: number };

export default function InstitutionsPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const { isAdmin, institutions, fdrs, requests, loading, refreshInstitutions } = usePortal();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [detail, setDetail] = useState<Institution | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", address: "", is_active: true });
  const [savingEdit, setSavingEdit] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", institution_code: "", email: "", phone: "", address: "" });
  const [savingCreate, setSavingCreate] = useState(false);

  const statsByInstitution = useMemo(() => {
    const map = new Map<number, InstitutionStats>();
    for (const item of institutions) map.set(item.id, { count: 0, value: 0, verified: 0, pendingReleases: 0 });
    for (const fdr of fdrs) {
      const stat = map.get(fdr.institution_id);
      if (!stat) continue;
      stat.count += 1;
      stat.value += Number(fdr.deposit_amount || 0);
      if (fdr.status === "verified") stat.verified += 1;
    }
    const fdrInstitution = new Map(fdrs.map(fdr => [fdr.id, fdr.institution_id]));
    for (const request of requests) {
      if (request.status !== "pending") continue;
      const owner = fdrInstitution.get(request.fdr_id);
      const stat = owner !== undefined ? map.get(owner) : undefined;
      if (stat) stat.pendingReleases += 1;
    }
    return map;
  }, [institutions, fdrs, requests]);

  const totals = useMemo(() => ({
    active: institutions.filter(item => item.is_active).length,
    inactive: institutions.filter(item => item.is_active === false).length,
    value: fdrs.reduce((sum, item) => sum + Number(item.deposit_amount || 0), 0),
  }), [institutions, fdrs]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return institutions.filter(item => {
      if (statusFilter === "active" && !item.is_active) return false;
      if (statusFilter === "inactive" && item.is_active !== false) return false;
      if (needle) {
        const haystack = `${item.name} ${item.institution_code || ""} ${item.email || ""} ${item.phone || ""} ${item.address || ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [institutions, search, statusFilter]);

  function openDetail(institution: Institution) {
    setDetail(institution);
    setEditForm({
      name: institution.name || "",
      email: institution.email || "",
      phone: institution.phone || "",
      address: institution.address || "",
      is_active: institution.is_active !== false,
    });
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    try {
      const created = await api.createInstitution({
        name: createForm.name.trim(),
        institution_code: createForm.institution_code.trim(),
        email: createForm.email.trim(),
        phone: createForm.phone.trim() || null,
        address: createForm.address.trim() || null,
      });
      toast.push(`Institution ${created.name} added to the directory.`);
      setCreateOpen(false);
      setCreateForm({ name: "", institution_code: "", email: "", phone: "", address: "" });
      await refreshInstitutions();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not create the institution.", "error");
    } finally {
      setSavingCreate(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setSavingEdit(true);
    try {
      const updated = await api.updateInstitution(detail.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        is_active: editForm.is_active,
      });
      toast.push(`Institution ${updated.name} updated.`);
      setDetail(null);
      await refreshInstitutions();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not update the institution.", "error");
    } finally {
      setSavingEdit(false);
    }
  }

  function exportCsv() {
    downloadCsv("institutions.csv",
      ["Name", "Code", "Email", "Phone", "Address", "FDR Records", "Deposit Value", "Verified", "Pending Releases", "Status"],
      filtered.map(item => {
        const stat = statsByInstitution.get(item.id);
        return [
          item.name, item.institution_code || "", item.email || "", item.phone || "", item.address || "",
          stat?.count ?? 0, stat?.value ?? 0, stat?.verified ?? 0, stat?.pendingReleases ?? 0,
          item.is_active === false ? "Inactive" : "Active",
        ];
      }));
  }

  if (!isAdmin) {
    return (
      <div className="panel placeholder-panel">
        <h2>Administrator access required</h2>
        <p>The institution directory is managed by portal administrators.</p>
      </div>
    );
  }

  const columns: Column<Institution>[] = [
    {
      key: "name", header: "Institution", sortValue: row => row.name,
      render: row => (
        <span className="stack-cell">
          <strong className="strong-cell">{row.name}</strong>
          <small className="muted">{row.institution_code || `Institution #${row.id}`}</small>
        </span>
      ),
    },
    {
      key: "contact", header: "Contact", hideOn: "sm", sortValue: row => row.email || "",
      render: row => (
        <span className="stack-cell">
          <span>{row.email || "—"}</span>
          {row.phone && <small className="muted">{row.phone}</small>}
        </span>
      ),
    },
    {
      key: "fdrs", header: "FDRs", align: "right", sortValue: row => statsByInstitution.get(row.id)?.count ?? 0,
      render: row => {
        const stat = statsByInstitution.get(row.id);
        return (
          <button type="button" className="ref-link" title="View these FDRs in the registry"
            onClick={event => { event.stopPropagation(); onNavigate("FDR Registry", { registryFilters: { institutionId: row.id } }); }}>
            {stat?.count ?? 0}
          </button>
        );
      },
    },
    {
      key: "value", header: "Deposit value", align: "right", sortValue: row => statsByInstitution.get(row.id)?.value ?? 0,
      render: row => <span className="strong-cell">{money(statsByInstitution.get(row.id)?.value ?? 0)}</span>,
    },
    {
      key: "verified", header: "Verified", hideOn: "md", align: "right", sortValue: row => statsByInstitution.get(row.id)?.verified ?? 0,
      render: row => statsByInstitution.get(row.id)?.verified ?? 0,
    },
    {
      key: "pending", header: "Pending releases", hideOn: "md", align: "right", sortValue: row => statsByInstitution.get(row.id)?.pendingReleases ?? 0,
      render: row => statsByInstitution.get(row.id)?.pendingReleases ?? 0,
    },
    {
      key: "status", header: "Status", sortValue: row => (row.is_active === false ? 1 : 0),
      render: row => <StatusBadge value={row.is_active === false ? "inactive" : "active"} />,
    },
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Portal <span>/</span> Institutions</div>
          <h1>Institution directory</h1>
          <p>Every institution enrolled in the deposit portal, with live portfolio totals.</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary-action" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button type="button" className="primary-action" onClick={() => setCreateOpen(true)}><Plus size={15} /> Add institution</button>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-4">
        <MetricCard title="Institutions" value={String(institutions.length)} note="Enrolled in the portal" icon={<Building2 size={17} />} />
        <MetricCard title="Active" value={String(totals.active)} note="Currently accepting deposits" icon={<CheckCircle2 size={17} />} tone="good" />
        <MetricCard title="Inactive" value={String(totals.inactive)} note="Deactivated accounts" icon={<XCircle size={17} />} tone="bad"
          onClick={() => setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")} />
        <MetricCard title="Deposits under management" value={compactMoney(totals.value)} note={`${fdrs.length} FDR records in total`} icon={<Landmark size={17} />} />
      </div>

      <section className="panel">
        <div className="filter-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, code, email…" />
          </label>
          <label className="control-field">
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={row => row.id}
          loading={loading}
          emptyMessage="No institutions match the current filters."
          onRowClick={openDetail}
          pageSizeOptions={[10, 25, 50]}
          initialSort={{ key: "value", direction: "desc" }}
        />
      </section>

      {detail && (
        <Modal wide
          title={detail.name}
          subtitle={`${detail.institution_code || `Institution #${detail.id}`} · ${statsByInstitution.get(detail.id)?.count ?? 0} FDR records`}
          onClose={() => setDetail(null)}>
          <div className="detail-grid">
            <dl className="detail-list detail-list-3col">
              <div><dt>Deposit value</dt><dd>{money(statsByInstitution.get(detail.id)?.value ?? 0)}</dd></div>
              <div><dt>Verified FDRs</dt><dd>{statsByInstitution.get(detail.id)?.verified ?? 0}</dd></div>
              <div><dt>Pending releases</dt><dd>{statsByInstitution.get(detail.id)?.pendingReleases ?? 0}</dd></div>
            </dl>
            <form className="modal-form" id="institution-edit-form" onSubmit={submitEdit}>
              <div className="form-grid">
                <Field label="Institution name" required>
                  <input value={editForm.name} maxLength={200} required
                    onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} />
                </Field>
                <Field label="Contact email" required>
                  <input type="email" value={editForm.email} maxLength={200} required
                    onChange={event => setEditForm(current => ({ ...current, email: event.target.value }))} />
                </Field>
                <Field label="Phone">
                  <input value={editForm.phone} maxLength={50}
                    onChange={event => setEditForm(current => ({ ...current, phone: event.target.value }))} />
                </Field>
                <Field label="Address">
                  <input value={editForm.address} maxLength={500}
                    onChange={event => setEditForm(current => ({ ...current, address: event.target.value }))} />
                </Field>
              </div>
              <label className="control-check">
                <input type="checkbox" checked={editForm.is_active}
                  onChange={event => setEditForm(current => ({ ...current, is_active: event.target.checked }))} />
                <span>Active — the institution can be assigned FDRs and portal users.</span>
              </label>
              <div className="inline-actions">
                <button type="button" className="secondary-action" onClick={() => setDetail(null)} disabled={savingEdit}>Cancel</button>
                <button type="submit" className="primary-action" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {createOpen && (
        <Modal title="Add institution" subtitle="Creates a directory entry; assign portal users separately in User Management."
          onClose={() => setCreateOpen(false)}>
          <form className="modal-form" onSubmit={submitCreate}>
            <div className="form-grid">
              <Field label="Institution name" required>
                <input value={createForm.name} maxLength={200} required autoFocus
                  onChange={event => setCreateForm(current => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. National Institute of Technology Surathkal" />
              </Field>
              <Field label="Institution code" required hint="Unique short identifier, e.g. NIT-SUR-001.">
                <input value={createForm.institution_code} maxLength={50} required
                  onChange={event => setCreateForm(current => ({ ...current, institution_code: event.target.value }))} />
              </Field>
              <Field label="Contact email" required>
                <input type="email" value={createForm.email} maxLength={200} required
                  onChange={event => setCreateForm(current => ({ ...current, email: event.target.value }))}
                  placeholder="admin@institution.edu" />
              </Field>
              <Field label="Phone">
                <input value={createForm.phone} maxLength={50}
                  onChange={event => setCreateForm(current => ({ ...current, phone: event.target.value }))} />
              </Field>
            </div>
            <Field label="Address">
              <textarea rows={2} maxLength={500} value={createForm.address}
                onChange={event => setCreateForm(current => ({ ...current, address: event.target.value }))} />
            </Field>
            <div className="inline-actions">
              <button type="button" className="secondary-action" onClick={() => setCreateOpen(false)} disabled={savingCreate}>Cancel</button>
              <button type="submit" className="primary-action" disabled={savingCreate}>{savingCreate ? "Creating…" : "Create institution"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
