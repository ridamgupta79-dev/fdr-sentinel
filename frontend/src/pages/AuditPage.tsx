import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, Download, Fingerprint, ShieldCheck, Users } from "lucide-react";
import { api } from "../api/endpoints";
import MetricCard from "../components/MetricCard";
import { useToast } from "../components/Toast";
import { downloadCsv } from "../utils/csv";
import { actionLabel, dateTimeLabel, relativeTime } from "../utils/formatters";
import type { AuditLog } from "../types";
import { usePortal } from "../state/PortalData";

const ACTION_OPTIONS = [
  "FDR_SUBMITTED",
  "FDR_VERIFICATION_RECORDED",
  "FDR_STATUS_UPDATED",
  "RELEASE_REQUEST_CREATED",
  "RELEASE_REQUEST_APPROVED",
  "RELEASE_REQUEST_REJECTED",
  "INSTITUTION_CREATED",
  "INSTITUTION_UPDATED",
  "USER_CREATED",
  "USER_STATUS_CHANGED",
  "USER_INSTITUTION_ASSIGNED",
];

const ENTITY_OPTIONS = ["FDR", "Verification", "ReleaseRequest", "Institution", "User"];
const PAGE_SIZE = 100;

function detailText(details?: Record<string, unknown> | null): string {
  if (!details || typeof details !== "object") return "";
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export default function AuditPage() {
  const { isAdmin } = usePortal();
  const toast = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async (offset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const items = await api.listAuditLogs(PAGE_SIZE, offset, {
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
      });
      setLogs(current => (replace ? items : [...current, ...items]));
      setHasMore(items.length === PAGE_SIZE);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not load the audit trail.", "error");
      if (replace) setLogs([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [actionFilter, entityFilter, toast]);

  useEffect(() => {
    void load(0, true);
  }, [load]);

  useEffect(() => {
    setExpanded(null);
  }, [actionFilter, entityFilter]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter(item =>
      `${item.actor} ${item.action} ${item.entity_type} ${item.entity_id ?? ""} ${detailText(item.details)}`
        .toLowerCase().includes(needle));
  }, [logs, search]);

  const summary = useMemo(() => {
    const actors = new Set(logs.map(item => item.actor));
    const demoEvents = logs.filter(item => item.details?.demo_seed === true).length;
    const reviewed = logs.filter(item => item.action.startsWith("RELEASE_REQUEST")).length;
    return { actors: actors.size, demoEvents, reviewed };
  }, [logs]);

  function exportCsv() {
    downloadCsv("audit-trail.csv",
      ["Time (UTC)", "Actor", "Action", "Entity Type", "Entity ID", "IP Address", "Details", "Demo Seed"],
      visible.map(item => [
        item.created_at, item.actor, item.action, item.entity_type,
        item.entity_id ?? "", item.ip_address || "", detailText(item.details),
        item.details?.demo_seed === true ? "yes" : "no",
      ]));
  }

  if (!isAdmin) {
    return (
      <div className="panel placeholder-panel">
        <h2>Administrator access required</h2>
        <p>The audit trail records privileged portal activity and is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Portal <span>/</span> Audit Trail</div>
          <h1>Audit trail</h1>
          <p>Chronological record of privileged actions: registrations, verifications, releases, directory and account changes.</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary-action" onClick={exportCsv} disabled={!visible.length}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-4">
        <MetricCard title="Events loaded" value={String(logs.length)} note={hasMore ? "More older events available" : "Most recent events"} icon={<Activity size={17} />} />
        <MetricCard title="Actors involved" value={String(summary.actors)} note="Distinct users in the loaded window" icon={<Users size={17} />} />
        <MetricCard title="Release events" value={String(summary.reviewed)} note="Requests, approvals and rejections" icon={<ShieldCheck size={17} />} />
        <MetricCard title="Demo-seeded events" value={String(summary.demoEvents)} note="Synthetic history, clearly marked" icon={<Fingerprint size={17} />} />
      </div>

      <section className="panel">
        <div className="filter-toolbar">
          <label className="search-field">
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filter loaded events (actor, entity, details)…" />
          </label>
          <label className="control-field">
            <select value={actionFilter} onChange={event => setActionFilter(event.target.value)}>
              <option value="">All actions</option>
              {ACTION_OPTIONS.map(option => <option key={option} value={option}>{actionLabel(option)}</option>)}
            </select>
          </label>
          <label className="control-field">
            <select value={entityFilter} onChange={event => setEntityFilter(event.target.value)}>
              <option value="">All entity types</option>
              {ENTITY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <span className="filter-summary">{visible.length === logs.length ? `${logs.length} events` : `${visible.length} of ${logs.length} events`}</span>
        </div>

        {loading ? (
          <div className="empty-cell">Loading audit events…</div>
        ) : visible.length === 0 ? (
          <div className="empty-cell">No audit events match the current filters.</div>
        ) : (
          <div className="audit-timeline">
            {visible.map(item => {
              const details = item.details && typeof item.details === "object" ? item.details : null;
              const isOpen = expanded === item.id;
              return (
                <article key={item.id} className={`audit-item ${isOpen ? "audit-item-open" : ""}`}>
                  <span className="audit-marker" aria-hidden="true" />
                  <div className="audit-card">
                    <header className="audit-head">
                      <span className="audit-action-chip">{actionLabel(item.action)}</span>
                      <span className="audit-entity-chip">{item.entity_type}{item.entity_id != null ? ` #${item.entity_id}` : ""}</span>
                      {details?.demo_seed === true && <span className="demo-tag">Demo seed</span>}
                    </header>
                    <div className="audit-meta">
                      <span className="audit-actor">{item.actor}</span>
                      <span className="audit-time" title={dateTimeLabel(item.created_at)}>{relativeTime(item.created_at)}</span>
                    </div>
                    {details && (
                      <button type="button" className="audit-expand" onClick={() => setExpanded(isOpen ? null : item.id)}>
                        <ChevronDown size={13} /> {isOpen ? "Hide details" : "View details"}
                      </button>
                    )}
                    {isOpen && details && (
                      <dl className="audit-details">
                        {Object.entries(details).map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {hasMore && !loading && (
          <div className="load-more-row">
            <button type="button" className="secondary-action" disabled={loadingMore} onClick={() => void load(logs.length, false)}>
              {loadingMore ? "Loading…" : `Load 100 older events`}
            </button>
          </div>
        )}
        <p className="control-note">
          Events are fetched from <code>/api/audit-logs</code> in pages of {PAGE_SIZE}. Use the filters above to narrow the server-side query before loading more.
        </p>
      </section>
    </>
  );
}
