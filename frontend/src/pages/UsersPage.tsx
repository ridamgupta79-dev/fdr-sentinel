import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, KeyRound, ShieldCheck, UserCog, UserPlus, Users, UserX } from "lucide-react";
import { api } from "../api/endpoints";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { ConfirmDialog, DataTable, Field, Modal, type Column } from "../components/ui";
import { downloadCsv } from "../utils/csv";
import { dateLabel } from "../utils/formatters";
import type { PortalUser } from "../types";
import { usePortal } from "../state/PortalData";

export default function UsersPage() {
  const { user: currentUser, isAdmin, users, institutions, loading, refreshAdminData } = usePortal();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [detail, setDetail] = useState<PortalUser | null>(null);
  const [assignInstitution, setAssignInstitution] = useState("");
  const [savingAssign, setSavingAssign] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<{ user: PortalUser; next: boolean } | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: "", email: "", password: "", role: "institution", institution_id: "" });
  const [savingCreate, setSavingCreate] = useState(false);

  useEffect(() => {
    void refreshAdminData();
  }, []);

  const institutionName = useMemo(() => {
    const map = new Map(institutions.map(item => [item.id, item.name]));
    return (id: number | null | undefined) => (id ? map.get(id) || `Institution #${id}` : "—");
  }, [institutions]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter(item => {
      if (roleFilter && (item.role || "").toLowerCase() !== roleFilter) return false;
      if (statusFilter === "active" && item.is_active === false) return false;
      if (statusFilter === "inactive" && item.is_active !== false) return false;
      if (needle) {
        const haystack = `${item.full_name || ""} ${item.email} ${institutionName(item.institution_id)}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter, institutionName]);

  const summary = useMemo(() => ({
    admins: users.filter(item => (item.role || "").toLowerCase() === "admin").length,
    institutionUsers: users.filter(item => (item.role || "").toLowerCase() === "institution").length,
    deactivated: users.filter(item => item.is_active === false).length,
  }), [users]);

  function openDetail(target: PortalUser) {
    setDetail(target);
    setAssignInstitution(target.institution_id ? String(target.institution_id) : "");
  }

  async function submitAssign() {
    if (!detail) return;
    setSavingAssign(true);
    try {
      await api.assignUserInstitution(detail.id, Number(assignInstitution));
      toast.push(`Institution assignment saved for ${detail.email}.`);
      setDetail(null);
      await refreshAdminData();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not update the assignment.", "error");
    } finally {
      setSavingAssign(false);
    }
  }

  async function submitStatus() {
    if (!statusConfirm) return;
    setSavingStatus(true);
    try {
      await api.setUserStatus(statusConfirm.user.id, statusConfirm.next);
      toast.push(`${statusConfirm.user.email} is now ${statusConfirm.next ? "active" : "deactivated"}.`);
      setStatusConfirm(null);
      setDetail(current => (current && current.id === statusConfirm.user.id
        ? { ...current, is_active: statusConfirm.next } : current));
      await refreshAdminData();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not change the account status.", "error");
    } finally {
      setSavingStatus(false);
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    try {
      const created = await api.createUser({
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
        institution_id: createForm.role === "institution" && createForm.institution_id ? Number(createForm.institution_id) : null,
      });
      toast.push(`Account created for ${created.email}. Share the password securely — it cannot be viewed again.`);
      setCreateOpen(false);
      setCreateForm({ full_name: "", email: "", password: "", role: "institution", institution_id: "" });
      await refreshAdminData();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not create the account.", "error");
    } finally {
      setSavingCreate(false);
    }
  }

  function exportCsv() {
    downloadCsv("portal-users.csv",
      ["Full Name", "Email", "Role", "Institution", "Status", "Created"],
      filtered.map(item => [
        item.full_name || "", item.email, item.role || "", institutionName(item.institution_id),
        item.is_active === false ? "Inactive" : "Active", item.created_at || "",
      ]));
  }

  if (!isAdmin) {
    return (
      <div className="panel placeholder-panel">
        <h2>Administrator access required</h2>
        <p>Account administration is restricted to portal administrators.</p>
      </div>
    );
  }

  const columns: Column<PortalUser>[] = [
    {
      key: "name", header: "Account", sortValue: row => row.full_name || row.email,
      render: row => (
        <span className="stack-cell">
          <strong className="strong-cell">{row.full_name || row.email}</strong>
          <small className="muted">{row.email}</small>
        </span>
      ),
    },
    {
      key: "role", header: "Role", sortValue: row => row.role || "",
      render: row => <span className={`role-pill ${row.role === "admin" ? "role-pill-admin" : ""}`}>{row.role || "user"}</span>,
    },
    {
      key: "institution", header: "Institution", hideOn: "sm", sortValue: row => institutionName(row.institution_id),
      render: row => institutionName(row.institution_id),
    },
    {
      key: "status", header: "Status", sortValue: row => (row.is_active === false ? 1 : 0),
      render: row => <StatusBadge value={row.is_active === false ? "inactive" : "active"} />,
    },
    {
      key: "created", header: "Created", hideOn: "md", sortValue: row => row.created_at || "",
      render: row => dateLabel(row.created_at),
    },
  ];

  const detailIsSelf = detail?.id === currentUser.id;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Portal <span>/</span> User Management</div>
          <h1>User management</h1>
          <p>Create portal accounts, assign institutions, and deactivate access. Passwords are stored only as Argon2 hashes.</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary-action" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button type="button" className="primary-action" onClick={() => setCreateOpen(true)}><UserPlus size={15} /> New account</button>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-4">
        <MetricCard title="Portal accounts" value={String(users.length)} note="All sign-in identities" icon={<Users size={17} />} />
        <MetricCard title="Administrators" value={String(summary.admins)} note="Full portal oversight" icon={<ShieldCheck size={17} />} />
        <MetricCard title="Institution users" value={String(summary.institutionUsers)} note="Scoped to their institution" icon={<UserCog size={17} />} />
        <MetricCard title="Deactivated" value={String(summary.deactivated)} note="Sign-in blocked" icon={<UserX size={17} />} tone="bad"
          onClick={() => setStatusFilter(statusFilter === "inactive" ? "" : "inactive")} />
      </div>

      <section className="panel">
        <div className="filter-toolbar">
          <label className="search-field">
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email, institution…" />
          </label>
          <label className="control-field">
            <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
              <option value="">All roles</option>
              <option value="admin">Administrators</option>
              <option value="institution">Institution users</option>
            </select>
          </label>
          <label className="control-field">
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter by account status">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </select>
          </label>
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={row => row.id}
          loading={loading && !users.length}
          emptyMessage="No accounts match the current filters."
          onRowClick={openDetail}
          pageSizeOptions={[10, 25, 50]}
          initialSort={{ key: "name", direction: "asc" }}
        />
      </section>

      {detail && (
        <Modal wide
          title={detail.full_name || detail.email}
          subtitle={`${detail.email} · ${detail.role === "admin" ? "Administrator" : "Institution user"}`}
          onClose={() => { setDetail(null); setStatusConfirm(null); }}>
          <div className="user-detail">
            <dl className="detail-list detail-list-3col">
              <div><dt>Status</dt><dd><StatusBadge value={detail.is_active === false ? "inactive" : "active"} /></dd></div>
              <div><dt>Institution</dt><dd>{institutionName(detail.institution_id)}</dd></div>
              <div><dt>Created</dt><dd>{dateLabel(detail.created_at)}</dd></div>
            </dl>

            <div className="assign-block">
              <Field label="Assigned institution"
                hint={detail.role === "admin" ? "Administrators are not scoped to an institution." : "Determines which FDR records this user can access."}>
                <select value={assignInstitution} disabled={detail.role === "admin" || savingAssign}
                  onChange={event => setAssignInstitution(event.target.value)}>
                  <option value="">No institution</option>
                  {institutions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <button type="button" className="secondary-action" disabled={detail.role === "admin" || savingAssign || assignInstitution === (detail.institution_id ? String(detail.institution_id) : "")}
                onClick={() => void submitAssign()}>
                {savingAssign ? "Saving…" : "Save assignment"}
              </button>
            </div>

            <div className="assign-block">
              <div className="assign-copy">
                <strong>{detail.is_active === false ? "Reactivate account" : "Deactivate account"}</strong>
                <small>{detail.is_active === false
                  ? "The user will be able to sign in again immediately."
                  : detailIsSelf ? "You cannot deactivate your own account." : "Sign-in is blocked immediately; existing records are untouched."}</small>
              </div>
              {detail.is_active === false ? (
                <button type="button" className="good-action" disabled={savingAssign}
                  onClick={() => setStatusConfirm({ user: detail, next: true })}>Reactivate</button>
              ) : (
                <button type="button" className="danger-action" disabled={savingAssign || detailIsSelf}
                  onClick={() => setStatusConfirm({ user: detail, next: false })}>Deactivate</button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {statusConfirm && (
        <ConfirmDialog
          title={statusConfirm.next ? `Reactivate ${statusConfirm.user.email}?` : `Deactivate ${statusConfirm.user.email}?`}
          message={statusConfirm.next
            ? "The account will be able to sign in again with its existing password."
            : "Deactivation blocks sign-in but never deletes records or audit history."}
          confirmLabel={statusConfirm.next ? "Reactivate account" : "Deactivate account"}
          danger={!statusConfirm.next}
          busy={savingStatus}
          onConfirm={() => void submitStatus()}
          onCancel={() => setStatusConfirm(null)}
        />
      )}

      {createOpen && (
        <Modal title="Create portal account" subtitle="Credentials are hashed with Argon2; the password is never shown again after this step."
          onClose={() => setCreateOpen(false)}>
          <form className="modal-form" onSubmit={submitCreate}>
            <div className="form-grid">
              <Field label="Full name" required>
                <input value={createForm.full_name} maxLength={200} required autoFocus
                  onChange={event => setCreateForm(current => ({ ...current, full_name: event.target.value }))}
                  placeholder="e.g. Priya Nair" />
              </Field>
              <Field label="Email" required>
                <input type="email" value={createForm.email} maxLength={200} required
                  onChange={event => setCreateForm(current => ({ ...current, email: event.target.value }))}
                  placeholder="name@institution.edu" />
              </Field>
              <Field label="Role" required>
                <select value={createForm.role}
                  onChange={event => setCreateForm(current => ({ ...current, role: event.target.value }))}>
                  <option value="institution">Institution user</option>
                  <option value="admin">Administrator</option>
                </select>
              </Field>
              {createForm.role === "institution" && (
                <Field label="Institution" required hint="Institution users see only this institution's records.">
                  <select value={createForm.institution_id} required
                    onChange={event => setCreateForm(current => ({ ...current, institution_id: event.target.value }))}>
                    <option value="">Select institution</option>
                    {institutions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Temporary password" required hint="Minimum 8 characters. Share it through a secure channel.">
                <input type="text" value={createForm.password} minLength={8} maxLength={128} required autoComplete="off"
                  onChange={event => setCreateForm(current => ({ ...current, password: event.target.value }))} />
              </Field>
            </div>
            <p className="control-note"><KeyRound size={13} /> Avoid reusing an existing password. The user can change it later through account recovery if configured.</p>
            <div className="inline-actions">
              <button type="button" className="secondary-action" onClick={() => setCreateOpen(false)} disabled={savingCreate}>Cancel</button>
              <button type="submit" className="primary-action" disabled={savingCreate}>{savingCreate ? "Creating…" : "Create account"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
