import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Building2, CalendarDays, CheckCircle2, Clock3, Download,
  FileCheck2, FileText, Landmark, ShieldCheck, WalletCards,
} from "lucide-react";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import { DonutChart, HorizontalBarChart, OutcomeTrendChart, STATUS_COLORS, TrendAreaChart } from "../components/charts";
import { downloadCsv } from "../utils/csv";
import {
  compactMoney, dateLabel, daysUntil, lastMonthKeys, maturityInfo, money, monthKey, percent, relativeTime, statusLabel,
} from "../utils/formatters";
import type { NavigateFn } from "../types";
import { usePortal } from "../state/PortalData";

const STATUS_ORDER = ["submitted", "under_verification", "verified", "verification_failed", "release_pending", "released"];

export default function DashboardPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const {
    user, isAdmin, fdrs, institutions, requests, verifications, auditLogs, loading, partialError, institutionById,
  } = usePortal();
  const [periodMonths, setPeriodMonths] = useState(12);
  const [institutionFilter, setInstitutionFilter] = useState<number | "all">("all");

  const stats = useMemo(() => {
    const scoped = institutionFilter === "all"
      ? fdrs
      : fdrs.filter(item => item.institution_id === institutionFilter);

    const totalValue = scoped.reduce((sum, item) => sum + Number(item.deposit_amount || 0), 0);
    const byStatus = new Map<string, number>();
    for (const item of scoped) byStatus.set(item.status, (byStatus.get(item.status) || 0) + 1);

    const pendingVerification = (byStatus.get("submitted") || 0) + (byStatus.get("under_verification") || 0);
    const verified = byStatus.get("verified") || 0;
    const failed = byStatus.get("verification_failed") || 0;
    const pendingReleases = requests.filter(item => item.status === "pending"
      && (institutionFilter === "all" || scoped.some(f => f.id === item.fdr_id))).length;

    const upcoming = scoped
      .filter(item => {
        const days = daysUntil(item.maturity_date);
        return days !== null && days >= 0 && days <= 30 && item.status !== "released";
      })
      .sort((a, b) => daysUntil(a.maturity_date)! - daysUntil(b.maturity_date)!);
    const matured = scoped.filter(item => (daysUntil(item.maturity_date) ?? 1) < 0 && item.status !== "released");

    const verifiedAttempts = verifications.filter(v => v.result === "verified").length;
    const failedAttempts = verifications.filter(v => v.result === "failed").length;

    const months = lastMonthKeys(periodMonths);
    const monthSet = new Set(months);
    const registrations = new Map<string, { count: number; value: number }>();
    const outcomes = new Map<string, { verified: number; failed: number; pending: number }>();
    for (const key of months) {
      registrations.set(key, { count: 0, value: 0 });
      outcomes.set(key, { verified: 0, failed: 0, pending: 0 });
    }
    for (const item of scoped) {
      const key = monthKey(item.issue_date);
      if (key && monthSet.has(key)) {
        const bucket = registrations.get(key)!;
        bucket.count += 1;
        bucket.value += Number(item.deposit_amount || 0);
      }
    }
    for (const verification of verifications) {
      const key = monthKey(verification.created_at);
      if (key && monthSet.has(key)) {
        const bucket = outcomes.get(key);
        if (bucket) bucket[verification.result as "verified" | "failed" | "pending"] += 1;
      }
    }

    const bankMap = new Map<string, number>();
    for (const item of scoped) {
      bankMap.set(item.bank_name, (bankMap.get(item.bank_name) || 0) + Number(item.deposit_amount || 0));
    }
    const topBanks = [...bankMap.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([label, value]) => ({ label, value }));

    const activeInstitutions = institutionFilter === "all"
      ? new Set(scoped.map(item => item.institution_id)).size
      : 1;

    return {
      scoped, totalValue, byStatus, pendingVerification, verified, failed, pendingReleases,
      upcoming, matured, verifiedAttempts, failedAttempts,
      trend: months.map(key => ({ label: key, value: registrations.get(key)!.count })),
      trendValue: months.map(key => ({ label: key, value: registrations.get(key)!.value })),
      outcomes: months.map(key => ({ label: key, ...outcomes.get(key)! })),
      topBanks, activeInstitutions,
    };
  }, [fdrs, requests, verifications, periodMonths, institutionFilter]);

  const recentFdrs = useMemo(() =>
    [...stats.scoped].sort((a, b) => b.id - a.id).slice(0, 6), [stats.scoped]);

  const recentActivity = useMemo(() => {
    if (isAdmin) return auditLogs.slice(0, 6);
    return verifications
      .filter(item => stats.scoped.some(f => f.id === item.fdr_id))
      .slice(0, 6)
      .map(item => ({ id: item.id, created_at: item.created_at, actor: item.checked_by || "Verification desk",
        action: `VERIFICATION_${item.result.toUpperCase()}`, entity_type: "Verification" }));
  }, [isAdmin, auditLogs, verifications, stats.scoped]);

  function exportSummary() {
    downloadCsv(`fdr-sentinel-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Metric", "Value"],
      [
        ["Total FDR records", stats.scoped.length],
        ["Total deposit value (INR)", stats.totalValue],
        ["Verified", stats.verified],
        ["Pending verification", stats.pendingVerification],
        ["Failed verification", stats.failed],
        ["Pending release requests", stats.pendingReleases],
        ["Maturities within 30 days", stats.upcoming.length],
        ["Matured, not released", stats.matured.length],
        ["Verification success rate", percent(stats.verifiedAttempts, stats.verifiedAttempts + stats.failedAttempts)],
      ]);
  }

  const institutionOptions = isAdmin
    ? institutions.filter(item => institutionFilter === "all" || item.id === institutionFilter || fdrs.some(f => f.institution_id === item.id))
    : [];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Portal <span>/</span> Dashboard</div>
          <h1>Operations dashboard</h1>
          <p>
            Live overview of Fixed Deposit Receipt records for{" "}
            {isAdmin ? "all authorized institutions" : institutionById.get(user.institution_id ?? -1)?.name || "your institution"}.
          </p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary-action" onClick={exportSummary}><Download size={15} /> Summary CSV</button>
          <button type="button" className="primary-action" onClick={() => onNavigate("FDR Registry", { registryFilters: { openRegister: true } })}>+ Register FDR</button>
        </div>
      </div>

      {(partialError || loading) && (
        <div className="data-alert" role="status">
          {loading ? "Refreshing portal data…" : "Some information could not be loaded; showing what is available."}
        </div>
      )}

      <div className="dashboard-controls">
        {isAdmin && (
          <label className="control-field">
            <Building2 size={14} />
            <select value={String(institutionFilter)}
              onChange={event => setInstitutionFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
              <option value="all">All institutions</option>
              {institutionOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        <label className="control-field">
          <CalendarDays size={14} />
          <select value={periodMonths} onChange={event => setPeriodMonths(Number(event.target.value))}>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
          </select>
        </label>
        <span className="control-note">Data refreshes from the API on every visit.</span>
      </div>

      <div className="kpi-grid">
        <MetricCard title="Total FDR records" value={String(stats.scoped.length)}
          note={`${money(stats.totalValue)} deposit value`} icon={<WalletCards size={17} />}
          onClick={() => onNavigate("FDR Registry")} />
        <MetricCard title="Pending verification" value={String(stats.pendingVerification)}
          note="Submitted or under verification" icon={<FileCheck2 size={17} />} tone="pending"
          onClick={() => onNavigate("Verification")} />
        <MetricCard title="Pending releases" value={String(stats.pendingReleases)}
          note="Release requests awaiting review" icon={<Clock3 size={17} />} tone="pending"
          onClick={() => onNavigate("Release Requests")} />
        <MetricCard title="Verified records" value={String(stats.verified)}
          note={percent(stats.verified, stats.scoped.length) + " of accessible records"} icon={<CheckCircle2 size={17} />} tone="good"
          onClick={() => onNavigate("FDR Registry", { registryFilters: { status: "verified" } })} />
        <MetricCard title="Failed verifications" value={String(stats.failed)}
          note="Records that did not pass checks" icon={<AlertTriangle size={17} />} tone="bad"
          onClick={() => onNavigate("FDR Registry", { registryFilters: { status: "verification_failed" } })} />
        <MetricCard title="Maturities ≤ 30 days" value={String(stats.upcoming.length)}
          note={`${stats.matured.length} matured still holding funds`} icon={<CalendarDays size={17} />} tone="pending"
          onClick={() => onNavigate("FDR Registry", { registryFilters: { maturityWindow: "30d" } })} />
        {isAdmin && (
          <MetricCard title="Active institutions" value={String(stats.activeInstitutions)}
            note={`${institutions.length} on the directory`} icon={<Building2 size={17} />}
            onClick={() => onNavigate("Institutions")} />
        )}
        <MetricCard title="Verification success rate" value={percent(stats.verifiedAttempts, stats.verifiedAttempts + stats.failedAttempts)}
          note={`${stats.verifiedAttempts} passed / ${stats.failedAttempts} failed attempts`} icon={<ShieldCheck size={17} />} tone="good"
          onClick={() => onNavigate("Reports")} />
      </div>

      <div className="charts-grid">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>FDR status distribution</h2><p>Lifecycle state of accessible records</p></div></div>
          <DonutChart height={280}
            data={STATUS_ORDER.filter(status => stats.byStatus.get(status)).map(status => ({
              name: statusLabel(status), value: stats.byStatus.get(status) || 0,
            }))}
            colors={STATUS_ORDER.filter(status => stats.byStatus.get(status)).map(status => STATUS_COLORS[status])}
            centerLabel="FDRs" />
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>Monthly registrations</h2><p>New FDR records by issue month</p></div></div>
          <TrendAreaChart data={stats.trend} height={280} />
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>Deposit value by bank</h2><p>Top banks by outstanding deposits</p></div></div>
          <HorizontalBarChart data={stats.topBanks} height={280} />
        </section>
      </div>

      <div className="charts-grid charts-grid-secondary">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>Verification outcomes</h2><p>Monthly verification attempts by result</p></div></div>
          <OutcomeTrendChart data={stats.outcomes} height={260} />
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>Upcoming maturities</h2><p>Next deposits reaching maturity</p></div></div>
          <div className="maturity-list">
            {stats.upcoming.slice(0, 6).map(item => {
              const info = maturityInfo(item.maturity_date);
              return (
                <button type="button" key={item.id} className="maturity-row" onClick={() => onNavigate("FDR Details", { fdrId: item.id })}>
                  <div className="maturity-main">
                    <strong>{item.fdr_number}</strong>
                    <small>{item.bank_name} · {institutionById.get(item.institution_id)?.name || `#${item.institution_id}`}</small>
                  </div>
                  <div className="maturity-side">
                    <strong>{money(item.deposit_amount)}</strong>
                    <span className={`maturity-pill tone-${info.tone}`}>{info.label}</span>
                  </div>
                </button>
              );
            })}
            {!stats.upcoming.length && <p className="empty-cell">No maturities in the next 30 days.</p>}
          </div>
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>Release pipeline</h2><p>Requests by current state</p></div></div>
          <DonutChart height={260}
            data={["pending", "approved", "rejected"].map(status => ({
              name: statusLabel(status), value: requests.filter(item =>
                item.status === status &&
                (institutionFilter === "all" || stats.scoped.some(f => f.id === item.fdr_id))).length,
            }))}
            colors={["#d19a2a", "#2f9461", "#c0504d"]} centerLabel="Requests" />
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel records-panel">
          <div className="panel-heading">
            <div><h2>Recent FDR registrations</h2><p>Latest records in the registry</p></div>
            <button type="button" className="text-action" onClick={() => onNavigate("FDR Registry")}>Open registry <ArrowRight size={15} /></button>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>FDR number</th><th>Institution</th><th>Bank</th><th className="cell-right">Amount</th><th>Maturity</th><th>Status</th></tr></thead>
            <tbody>
              {recentFdrs.map(item => (
                <tr key={item.id} className="row-clickable" onClick={() => onNavigate("FDR Details", { fdrId: item.id })}>
                  <td className="strong-cell"><span className="ellipsis-cell" style={{ maxWidth: 148 }} title={item.fdr_number}>{item.fdr_number}</span></td>
                  <td className="hide-md"><span className="ellipsis-cell" style={{ maxWidth: 150 }} title={institutionById.get(item.institution_id)?.name}>{institutionById.get(item.institution_id)?.name || `#${item.institution_id}`}</span></td>
                  <td><span className="ellipsis-cell" style={{ maxWidth: 125 }} title={item.bank_name}>{item.bank_name}</span></td>
                  <td className="cell-right">{compactMoney(item.deposit_amount)}</td>
                  <td className="hide-sm">{dateLabel(item.maturity_date)}</td>
                  <td><StatusBadge value={item.status} /></td>
                </tr>
              ))}
              {!recentFdrs.length && <tr><td colSpan={6} className="empty-cell">{loading ? "Loading records…" : "No FDR records yet."}</td></tr>}
            </tbody>
          </table></div>
        </section>

        <section className="panel actions-panel">
          <div className="panel-heading"><div><h2>Pending actions</h2><p>Workflows that may need attention</p></div></div>
          <button type="button" className="action-row" onClick={() => onNavigate("Verification")}>
            <span className="action-icon"><FileCheck2 size={17} /></span>
            <span className="action-copy"><strong>Verification queue</strong><small>{stats.pendingVerification} records awaiting verification</small></span>
            <ArrowRight size={16} className="action-arrow" />
          </button>
          <button type="button" className="action-row" onClick={() => onNavigate("Release Requests")}>
            <span className="action-icon"><FileText size={17} /></span>
            <span className="action-copy"><strong>Release requests</strong><small>{stats.pendingReleases} pending review</small></span>
            <ArrowRight size={16} className="action-arrow" />
          </button>
          <button type="button" className="action-row" onClick={() => onNavigate("FDR Registry", { registryFilters: { maturityWindow: "30d" } })}>
            <span className="action-icon"><CalendarDays size={17} /></span>
            <span className="action-copy"><strong>Maturity follow-up</strong><small>{stats.upcoming.length} deposits maturing within 30 days</small></span>
            <ArrowRight size={16} className="action-arrow" />
          </button>
          {isAdmin && (
            <button type="button" className="action-row" onClick={() => onNavigate("Institutions")}>
              <span className="action-icon"><Landmark size={17} /></span>
              <span className="action-copy"><strong>Institution directory</strong><small>{institutions.length} registered institutions</small></span>
              <ArrowRight size={16} className="action-arrow" />
            </button>
          )}
          <div className="action-note"><ShieldCheck size={16} /><span>Actions depend on your role; verification and reviews are restricted to administrators.</span></div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>{isAdmin ? "Latest audit activity" : "Latest verification activity"}</h2><p>Most recent events from the platform</p></div>
          {isAdmin && <button type="button" className="text-action" onClick={() => onNavigate("Audit Trail")}>Open audit trail <ArrowRight size={15} /></button>}
        </div>
        <div className="activity-list">
          {recentActivity.map(item => (
            <div className="activity-row" key={`${item.entity_type}-${item.id}`}>
              <span className="activity-dot" />
              <div className="activity-copy">
                <strong>{item.action.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())}</strong>
                <small>{item.actor}</small>
              </div>
              <span className="activity-time">{relativeTime(item.created_at)}</span>
            </div>
          ))}
          {!recentActivity.length && <p className="empty-cell">No recent activity.</p>}
        </div>
      </section>
    </>
  );
}
