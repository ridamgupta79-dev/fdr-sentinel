import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BarChart3, Bell, Building2, CalendarDays, ChevronDown, CircleUserRound,
  FileCheck2, FileText, LayoutDashboard, LogOut, Menu, Search, Users, WalletCards, X, XCircle,
} from "lucide-react";
import "./App.css";

import { api } from "./api/endpoints";
import { ToastProvider } from "./components/Toast";
import { PortalDataProvider, usePortal } from "./state/PortalData";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import RegistryPage from "./pages/RegistryPage";
import FdrDetailPage from "./pages/FdrDetailPage";
import VerificationPage from "./pages/VerificationPage";
import ReleasesPage from "./pages/ReleasesPage";
import InstitutionsPage from "./pages/InstitutionsPage";
import AuditPage from "./pages/AuditPage";
import UsersPage from "./pages/UsersPage";
import ReportsPage from "./pages/ReportsPage";
import { daysUntil } from "./utils/formatters";
import type { NavigateFn, Page, RegistryFilters, User } from "./types";

const NAV_ITEMS: { page: Page; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { page: "Dashboard", icon: LayoutDashboard },
  { page: "FDR Registry", icon: WalletCards },
  { page: "Verification", icon: FileCheck2 },
  { page: "Release Requests", icon: FileText },
  { page: "Reports", icon: BarChart3 },
  { page: "Institutions", icon: Building2, adminOnly: true },
  { page: "Audit Trail", icon: Activity, adminOnly: true },
  { page: "User Management", icon: Users, adminOnly: true },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<"checking" | "out" | "in">("checking");

  useEffect(() => {
    const token = localStorage.getItem("fdr_access_token");
    if (!token) {
      setSession("out");
      return;
    }
    let cancelled = false;
    api.me()
      .then(profile => {
        if (cancelled) return;
        setUser(profile);
        localStorage.setItem("fdr_user", JSON.stringify(profile));
        setSession("in");
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("fdr_access_token");
        localStorage.removeItem("fdr_user");
        setSession("out");
      });
    return () => { cancelled = true; };
  }, []);

  function handleLogin(loggedIn: User) {
    setUser(loggedIn);
    setSession("in");
  }

  function handleLogout() {
    localStorage.removeItem("fdr_access_token");
    localStorage.removeItem("fdr_user");
    setUser(null);
    setSession("out");
  }

  if (session === "checking") {
    return <main className="session-loading"><span className="spinner dark-spinner" /> Checking your session…</main>;
  }

  if (session === "out" || !user) {
    return <ToastProvider><LoginPage onLogin={handleLogin} /></ToastProvider>;
  }

  return (
    <ToastProvider>
      <PortalDataProvider user={user}>
        <PortalShell user={user} onLogout={handleLogout} />
      </PortalDataProvider>
    </ToastProvider>
  );
}

function PortalShell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { fdrs, institutions, requests, error, partialError, refreshAll } = usePortal();

  const [page, setPage] = useState<Page>("Dashboard");
  const [detailFdrId, setDetailFdrId] = useState<number | null>(null);
  const [registryFilters, setRegistryFilters] = useState<RegistryFilters | undefined>(undefined);
  const [mobileNav, setMobileNav] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const isAdmin = (user.role || "").toLowerCase() === "admin";
  const pages = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const navigate: NavigateFn = useCallback((nextPage, payload) => {
    if (nextPage === "FDR Details" && payload?.fdrId) {
      setDetailFdrId(payload.fdrId);
      setPage("FDR Details");
      setMobileNav(false);
      return;
    }
    if (payload?.registryFilters) setRegistryFilters({ ...payload.registryFilters });
    setPage(nextPage);
    setMobileNav(false);
  }, []);

  useEffect(() => {
    if (!pages.some(item => item.page === page) && page !== "FDR Details") setPage("Dashboard");
  }, [isAdmin, page, pages]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page, detailFdrId]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setSearchOpen(false); setActionOpen(false); setAccountMenu(false); }
    }
    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return { fdrMatches: [], institutionMatches: [] };
    const fdrMatches = fdrs
      .filter(item => `${item.fdr_number} ${item.bank_name} ${item.branch_name || ""}`.toLowerCase().includes(needle))
      .slice(0, 6);
    const institutionMatches = isAdmin
      ? institutions
        .filter(item => `${item.name} ${item.institution_code || ""}`.toLowerCase().includes(needle))
        .slice(0, 4)
      : [];
    return { fdrMatches, institutionMatches };
  }, [query, fdrs, institutions, isAdmin]);

  const actions = useMemo(() => {
    const pendingVerification = fdrs.filter(item => ["submitted", "under_verification"].includes(item.status)).length;
    const pendingReleases = requests.filter(item => item.status === "pending").length;
    const maturing = fdrs.filter(item => {
      const days = daysUntil(item.maturity_date);
      return days !== null && days >= 0 && days <= 30 && item.status !== "released";
    }).length;
    const failed = fdrs.filter(item => item.status === "verification_failed").length;
    const items = [
      { key: "verifications", label: "Verification queue", detail: "Deposits submitted or under verification", count: pendingVerification, icon: <FileCheck2 size={16} />, target: "Verification" as Page },
      { key: "releases", label: "Pending release requests", detail: "Awaiting an administrator decision", count: pendingReleases, icon: <FileText size={16} />, target: "Release Requests" as Page },
      { key: "maturities", label: "Maturities in 30 days", detail: "Follow up before the deposit matures", count: maturing, icon: <CalendarDays size={16} />, target: "FDR Registry" as Page, payload: { registryFilters: { maturityWindow: "30d" } as RegistryFilters } },
      { key: "failed", label: "Failed verifications", detail: "Records that did not pass review", count: failed, icon: <XCircle size={16} />, target: "Verification" as Page },
    ].filter(item => item.count > 0);
    return { items, total: items.reduce((sum, item) => sum + item.count, 0) };
  }, [fdrs, requests]);

  return (
    <div className="portal">
      <header className="portal-header">
        <a className="portal-brand" href="#dashboard" onClick={event => { event.preventDefault(); navigate("Dashboard"); }}>
          <img className="brand-mark" src="/assets/logo-mark.png" alt="FDR Sentinel logo" />
          <span className="brand-copy">
            <strong>FDR Sentinel</strong>
            <small>Financial Records Portal</small>
          </span>
        </a>
        <div className="header-spacer" />

        <div className="global-search" ref={searchRef}>
          <label className="search-field search-field-sm">
            <Search size={15} />
            <input
              value={query}
              placeholder="Search FDRs, banks…"
              onChange={event => { setQuery(event.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
            />
          </label>
          {searchOpen && (query.trim().length >= 2) && (
            <div className="search-dropdown">
              {searchResults.fdrMatches.length === 0 && searchResults.institutionMatches.length === 0 && (
                <div className="search-empty">No matches for “{query.trim()}”.</div>
              )}
              {searchResults.fdrMatches.length > 0 && (
                <>
                  <div className="search-group-label">FDR records</div>
                  {searchResults.fdrMatches.map(item => (
                    <button type="button" className="search-result" key={item.id}
                      onClick={() => { navigate("FDR Details", { fdrId: item.id }); setSearchOpen(false); setQuery(""); }}>
                      <strong>{item.fdr_number}</strong>
                      <span>{item.bank_name} · {item.status.replaceAll("_", " ")}</span>
                    </button>
                  ))}
                </>
              )}
              {searchResults.institutionMatches.length > 0 && (
                <>
                  <div className="search-group-label">Institutions</div>
                  {searchResults.institutionMatches.map(item => (
                    <button type="button" className="search-result" key={item.id}
                      onClick={() => { navigate("FDR Registry", { registryFilters: { institutionId: item.id } }); setSearchOpen(false); setQuery(""); }}>
                      <strong>{item.name}</strong>
                      <span>{item.institution_code || `Institution #${item.id}`}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="action-center">
          <button className="icon-button notification-button" aria-label="Action center" aria-expanded={actionOpen}
            onClick={() => { setActionOpen(v => !v); setAccountMenu(false); }}>
            <Bell size={18} />
            {actions.total > 0 && <span className="action-bubble">{actions.total > 99 ? "99+" : actions.total}</span>}
          </button>
          {actionOpen && (
            <div className="action-dropdown">
              <header className="action-dropdown-head">
                <strong>Action center</strong>
                <span>Derived from live portal data</span>
              </header>
              {actions.items.length === 0 ? (
                <div className="action-empty">Nothing needs your attention right now.</div>
              ) : actions.items.map(item => (
                <button type="button" className="action-row-item" key={item.key}
                  onClick={() => { navigate(item.target, item.payload); setActionOpen(false); }}>
                  <span className="action-item-icon">{item.icon}</span>
                  <span className="action-item-copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="action-item-count">{item.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="role-chip">{isAdmin ? "Administrator" : "Institution User"}</span>
        <button className="mobile-menu-button icon-button" onClick={() => setMobileNav(v => !v)} aria-label="Toggle navigation">
          {mobileNav ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      <nav className={`top-navigation ${mobileNav ? "navigation-open" : ""}`} aria-label="Main navigation">
        <div className="navigation-inner">
          {pages.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.page} className={`nav-link ${page === item.page ? "nav-link-active" : ""}`}
                onClick={() => navigate(item.page)}>
                <Icon size={16} strokeWidth={1.8} /><span>{item.page}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <main className="portal-content">
        {error && <div className="data-alert" role="status">{error}</div>}
        {partialError && !error && (
          <div className="data-alert" role="status">
            Some portal information could not be loaded; showing the latest available data.{" "}
            <button type="button" className="text-action" onClick={() => void refreshAll()}>Retry</button>
          </div>
        )}

        {page === "Dashboard" && <DashboardPage onNavigate={navigate} />}
        {page === "FDR Registry" && <RegistryPage onNavigate={navigate} initialFilters={registryFilters} />}
        {page === "FDR Details" && <FdrDetailPage fdrId={detailFdrId ?? 0} onNavigate={navigate} />}
        {page === "Verification" && <VerificationPage onNavigate={navigate} />}
        {page === "Release Requests" && <ReleasesPage onNavigate={navigate} />}
        {page === "Reports" && <ReportsPage onNavigate={navigate} />}
        {page === "Institutions" && <InstitutionsPage onNavigate={navigate} />}
        {page === "Audit Trail" && <AuditPage />}
        {page === "User Management" && <UsersPage />}
      </main>

      <footer className="portal-footer">
        <span>© FDR Sentinel</span>
        <span className="footer-status"><span /> Authenticated portal</span>
        <div className="account-area">
          <button className="account-button" onClick={() => { setAccountMenu(v => !v); setActionOpen(false); }} aria-expanded={accountMenu}>
            <span className="account-avatar"><CircleUserRound size={20} /></span>
            <span className="account-copy">
              <strong>{user.full_name || user.email}</strong>
              <small>{user.role || "User"}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {accountMenu && (
            <div className="account-popover">
              <div className="account-popover-user">{user.email}</div>
              <button onClick={onLogout}><LogOut size={16} /> Sign out</button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;
