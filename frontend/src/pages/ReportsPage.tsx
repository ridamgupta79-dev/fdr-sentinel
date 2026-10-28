import { useMemo, type ReactNode } from "react";
import {
  BarChart3, Building2, CalendarClock, FileCheck2, FileDown, FileText, Landmark, ScrollText,
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { DataTable, type Column } from "../components/ui";
import { HorizontalBarChart } from "../components/charts";
import { downloadCsv } from "../utils/csv";
import { compactMoney, dateLabel, daysUntil, money, statusLabel } from "../utils/formatters";
import type { FDR, NavigateFn } from "../types";
import { usePortal } from "../state/PortalData";

type ReportCard = {
  key: string;
  title: string;
  description: string;
  icon: ReactNode;
  records: number;
  adminOnly?: boolean;
  onExport: () => void;
};

export default function ReportsPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const { user, isAdmin, fdrs, institutions, requests, verifications, auditLogs, loading, fdrById, institutionById } = usePortal();

  const watchlist = useMemo(() =>
    fdrs
      .filter(item => {
        const days = daysUntil(item.maturity_date);
        if (days === null || item.status === "released") return false;
        return days <= 90;
      })
      .sort((a, b) => (daysUntil(a.maturity_date) ?? 0) - (daysUntil(b.maturity_date) ?? 0)),
  [fdrs]);

  const institutionRows = useMemo(() =>
    institutions.map(item => {
      const owned = fdrs.filter(fdr => fdr.institution_id === item.id);
      const ownedIds = new Set(owned.map(fdr => fdr.id));
      return {
        institution: item,
        count: owned.length,
        value: owned.reduce((sum, fdr) => sum + Number(fdr.deposit_amount || 0), 0),
        verified: owned.filter(fdr => fdr.status === "verified").length,
        released: owned.filter(fdr => fdr.status === "released").length,
        pendingReleases: requests.filter(request => request.status === "pending" && ownedIds.has(request.fdr_id)).length,
      };
    }).sort((a, b) => b.value - a.value),
  [institutions, fdrs, requests]);

  const bankRows = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const item of fdrs) {
      const bucket = map.get(item.bank_name) || { count: 0, value: 0 };
      bucket.count += 1;
      bucket.value += Number(item.deposit_amount || 0);
      map.set(item.bank_name, bucket);
    }
    return [...map.entries()]
      .map(([label, bucket]) => ({ label, ...bucket }))
      .sort((a, b) => b.value - a.value);
  }, [fdrs]);

  function exportFdrInventory() {
    downloadCsv("fdr-inventory.csv",
      ["FDR Number", "Institution", "Bank", "Branch", "Amount", "Interest Rate %", "Issue Date", "Maturity Date", "Status", "Tenure"],
      fdrs.map(item => [
        item.fdr_number,
        institutionById.get(item.institution_id)?.name || item.institution_id,
        item.bank_name, item.branch_name || "",
        Number(item.deposit_amount), item.interest_rate ?? "",
        item.issue_date, item.maturity_date, statusLabel(item.status),
        `${dateLabel(item.issue_date)} → ${dateLabel(item.maturity_date)}`,
      ]));
  }

  function exportInstitutionSummary() {
    downloadCsv("institution-summary.csv",
      ["Institution", "Code", "Status", "FDR Records", "Deposit Value", "Verified", "Released", "Pending Releases"],
      institutionRows.map(row => [
        row.institution.name, row.institution.institution_code || "",
        row.institution.is_active === false ? "Inactive" : "Active",
        row.count, row.value, row.verified, row.released, row.pendingReleases,
      ]));
  }

  function exportVerifications() {
    downloadCsv("verification-outcomes.csv",
      ["Recorded At", "FDR Number", "Institution", "Method", "Result", "Reference", "Checked By", "Remarks"],
      verifications.map(item => {
        const fdr = fdrById.get(item.fdr_id);
        return [
          item.created_at, fdr?.fdr_number || item.fdr_id,
          institutionById.get(fdr?.institution_id ?? -1)?.name || "",
          item.method, statusLabel(item.result), item.reference_number || "", item.checked_by || "", item.remarks || "",
        ];
      }));
  }

  function exportWatchlist() {
    downloadCsv("maturity-watchlist.csv",
      ["FDR Number", "Institution", "Bank", "Amount", "Maturity Date", "Days To Maturity", "Status"],
      watchlist.map(item => [
        item.fdr_number,
        institutionById.get(item.institution_id)?.name || item.institution_id,
        item.bank_name, Number(item.deposit_amount), item.maturity_date,
        daysUntil(item.maturity_date) ?? "", statusLabel(item.status),
      ]));
  }

  function exportReleases() {
    downloadCsv("release-requests-report.csv",
      ["Request", "FDR Number", "Institution", "Requested By", "Reason", "Status", "Created", "Reviewed By", "Review Remarks", "Reviewed At"],
      requests.map(item => {
        const fdr = fdrById.get(item.fdr_id);
        return [
          item.id, fdr?.fdr_number || item.fdr_id,
          institutionById.get(fdr?.institution_id ?? -1)?.name || "",
          item.requested_by || "", item.reason || "", statusLabel(item.status),
          item.created_at || "", item.reviewed_by || "", item.review_remarks || "", item.reviewed_at || "",
        ];
      }));
  }

  function exportBankDistribution() {
    downloadCsv("deposit-distribution.csv",
      ["Bank", "FDR Records", "Total Deposit Value"],
      bankRows.map(row => [row.label, row.count, row.value]));
  }

  function exportAuditSnapshot() {
    downloadCsv("audit-snapshot.csv",
      ["Time (UTC)", "Actor", "Action", "Entity Type", "Entity ID", "IP Address", "Details"],
      auditLogs.map(item => [
        item.created_at, item.actor, item.action, item.entity_type, item.entity_id ?? "",
        item.ip_address || "",
        item.details ? Object.entries(item.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ") : "",
      ]));
  }

  const reportCards: ReportCard[] = [
    {
      key: "inventory", title: "FDR inventory", icon: <Landmark size={18} />,
      description: "Complete register of every deposit accessible to your account, with tenure and status.",
      records: fdrs.length, onExport: exportFdrInventory,
    },
    {
      key: "institutions", title: "Institution-wise summary", icon: <Building2 size={18} />,
      description: "Portfolio totals, verified and released counts, and pending releases per institution.",
      records: institutions.length, adminOnly: true, onExport: exportInstitutionSummary,
    },
    {
      key: "verifications", title: "Verification outcomes", icon: <FileCheck2 size={18} />,
      description: "Every recorded verification attempt with method, result, reference and reviewer.",
      records: verifications.length, onExport: exportVerifications,
    },
    {
      key: "watchlist", title: "Maturity watchlist (90 days)", icon: <CalendarClock size={18} />,
      description: "Deposits maturing within 90 days or already matured and awaiting release.",
      records: watchlist.length, onExport: exportWatchlist,
    },
    {
      key: "releases", title: "Release requests", icon: <FileText size={18} />,
      description: "Full release workflow log: requests, decisions, reviewers and remarks.",
      records: requests.length, onExport: exportReleases,
    },
    {
      key: "banks", title: "Deposit distribution by bank", icon: <BarChart3 size={18} />,
      description: "How deposits are spread across banks by record count and total value.",
      records: bankRows.length, onExport: exportBankDistribution,
    },
    {
      key: "audit", title: "Audit trail snapshot", icon: <ScrollText size={18} />,
      description: "The most recent 100 privileged events loaded for your session.",
      records: auditLogs.length, adminOnly: true, onExport: exportAuditSnapshot,
    },
  ].filter(card => !card.adminOnly || isAdmin);

  const watchColumns: Column<FDR>[] = [
    {
      key: "fdr", header: "FDR", sortValue: row => row.fdr_number,
      render: row => (
        <button type="button" className="ref-link"
          onClick={event => { event.stopPropagation(); onNavigate("FDR Details", { fdrId: row.id }); }}>
          {row.fdr_number}
        </button>
      ),
    },
    {
      key: "institution", header: "Institution", hideOn: "md", sortValue: row => institutionById.get(row.institution_id)?.name || "",
      render: row => institutionById.get(row.institution_id)?.name || "—",
    },
    { key: "bank", header: "Bank", sortValue: row => row.bank_name, render: row => row.bank_name },
    { key: "amount", header: "Amount", align: "right", sortValue: row => Number(row.deposit_amount), render: row => money(row.deposit_amount) },
    { key: "maturity", header: "Maturity", sortValue: row => row.maturity_date, render: row => dateLabel(row.maturity_date) },
    {
      key: "days", header: "Days", align: "right", sortValue: row => daysUntil(row.maturity_date) ?? 0,
      render: row => {
        const days = daysUntil(row.maturity_date) ?? 0;
        return <span className={days < 0 ? "maturity-overdue" : ""}>{days < 0 ? `${-days}d overdue` : `${days}d`}</span>;
      },
    },
    { key: "status", header: "Status", sortValue: row => row.status, render: row => <StatusBadge value={row.status} /> },
  ];

  const institutionColumns: Column<(typeof institutionRows)[number]>[] = [
    { key: "name", header: "Institution", sortValue: row => row.institution.name, render: row => <span className="strong-cell">{row.institution.name}</span> },
    { key: "count", header: "FDRs", align: "right", sortValue: row => row.count, render: row => row.count },
    { key: "value", header: "Deposit value", align: "right", sortValue: row => row.value, render: row => money(row.value) },
    { key: "verified", header: "Verified", align: "right", hideOn: "sm", sortValue: row => row.verified, render: row => row.verified },
    { key: "released", header: "Released", align: "right", hideOn: "sm", sortValue: row => row.released, render: row => row.released },
    { key: "pending", header: "Pending releases", align: "right", hideOn: "md", sortValue: row => row.pendingReleases, render: row => row.pendingReleases },
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Portal <span>/</span> Reports</div>
          <h1>Reports &amp; exports</h1>
          <p>Operational reports generated live from your accessible data — nothing cached, nothing inferred.</p>
        </div>
        <span className="muted">
          Signed in as {user.full_name || user.email} · {isAdmin ? "Administrator scope" : "Institution scope"}
        </span>
      </div>

      <div className="report-grid">
        {reportCards.map(card => (
          <section className="report-card" key={card.key}>
            <span className="report-icon">{card.icon}</span>
            <div className="report-copy">
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <small className="report-meta">{loading ? "Counting…" : `${card.records.toLocaleString("en-IN")} records`}</small>
            </div>
            <button type="button" className="secondary-action" onClick={card.onExport} disabled={loading || card.records === 0}>
              <FileDown size={15} /> Export CSV
            </button>
          </section>
        ))}
      </div>

      <section className="panel chart-panel">
        <div className="panel-heading">
          <div><h2>Deposits by bank</h2><p>Top banks by total deposit value across {fdrs.length} records</p></div>
        </div>
        <HorizontalBarChart
          data={bankRows.slice(0, 8).map(row => ({ label: row.label, value: row.value }))}
          height={300}
        />
      </section>

      {isAdmin && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Institution summary</h2><p>Live portfolio aggregates per institution</p></div>
          </div>
          <DataTable
            rows={institutionRows}
            columns={institutionColumns}
            rowKey={row => row.institution.id}
            loading={loading}
            emptyMessage="No institutions available."
            pageSize={8}
            initialSort={{ key: "value", direction: "desc" }}
          />
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div><h2>Maturity watchlist</h2><p>Next 90 days plus overdue deposits not yet released</p></div>
          <button type="button" className="text-action" onClick={exportWatchlist}>Export watchlist CSV</button>
        </div>
        <DataTable
          rows={watchlist}
          columns={watchColumns}
          rowKey={row => row.id}
          loading={loading}
          emptyMessage="No deposits are approaching maturity — the register is comfortable."
          pageSizeOptions={[8, 15, 25]}
          initialSort={{ key: "days", direction: "asc" }}
        />
      </section>

      <p className="control-note">
        Totals: {fdrs.length} FDR records worth {compactMoney(fdrs.reduce((sum, item) => sum + Number(item.deposit_amount || 0), 0))} ·
        {" "}{verifications.length} verification attempts · {requests.length} release requests.
        Exports reflect exactly the records your role is authorized to see.
      </p>
    </>
  );
}
