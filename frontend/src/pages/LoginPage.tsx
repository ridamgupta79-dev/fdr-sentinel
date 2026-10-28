import { useState, type FormEvent } from "react";
import { Activity, Eye, EyeOff, FileCheck2, Landmark, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../api/endpoints";
import type { User } from "../types";

export default function LoginPage({ onLogin }: { onLogin: (user: User, token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api.login(email, password);
      localStorage.setItem("fdr_access_token", session.access_token);
      const profile = await api.me();
      if (profile.is_active === false) throw new Error("This account has been deactivated.");
      localStorage.setItem("fdr_user", JSON.stringify(profile));
      onLogin(profile, session.access_token);
    } catch (requestError) {
      localStorage.removeItem("fdr_access_token");
      setError(requestError instanceof Error ? requestError.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="ambient ambient-top" />
      <div className="ambient ambient-bottom" />
      <section className="login-shell">
        <aside className="login-hero">
          <div className="hero-brand">
            <img src="/assets/logo-mark.png" alt="FDR Sentinel logo" />
            <span className="hero-brand-text">
              <strong>FDR Sentinel</strong>
              <small>SECURE · VERIFY · MONITOR</small>
            </span>
          </div>
          <div className="portal-label hero-label"><span className="status-dot" /> SECURE FINANCIAL RECORDS PORTAL</div>
          <h1>Fixed deposit verification your institution can trust.</h1>
          <p className="hero-tagline">
            FDR Sentinel follows every security deposit from registration through verification to release —
            with recorded outcomes and a complete audit trail.
          </p>
          <ul className="hero-points">
            <li><Landmark size={19} /> Register FDRs across every bank and branch</li>
            <li><FileCheck2 size={19} /> Record verification outcomes with references</li>
            <li><ShieldCheck size={19} /> Release only what has been verified</li>
            <li><Activity size={19} /> Every action captured in the audit trail</li>
          </ul>
          <footer className="hero-foot">FDR Sentinel <span>•</span> Secure · Verify · Monitor</footer>
        </aside>

        <div className="login-panel">
          <img className="panel-logo" src="/assets/logo-lockup.png" alt="FDR Sentinel — Secure · Verify · Monitor" />
          <header className="brand-header">
            <div className="portal-label"><span className="status-dot" /> SECURE FINANCIAL RECORDS PORTAL</div>
            <h1>Welcome back</h1>
            <p className="login-subtitle">Sign in to manage and verify Fixed Deposit Receipt records.</p>
          </header>

          <form className="login-form" onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" autoComplete="username" placeholder="you@institution.edu"
                value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="password-wrapper">
                <input id="password" type={visible ? "text" : "password"} autoComplete="current-password"
                  placeholder="Enter your password" value={password}
                  onChange={e => setPassword(e.target.value)} required disabled={busy} />
                <button type="button" className="password-toggle" onClick={() => setVisible(v => !v)}
                  aria-label={visible ? "Hide password" : "Show password"}>
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <div className="feedback feedback-error" role="alert">{error}</div>}
            <button className="sign-in-button" type="submit" disabled={busy}>
              {busy ? <><span className="spinner" /> Signing in…</> : <><LockKeyhole size={17} /> Sign in to FDR Sentinel</>}
            </button>
          </form>

          <div className="card-divider" />
          <p className="registration-prompt">Need an account? Contact your portal administrator.</p>
          <aside className="security-notice">
            <ShieldCheck size={19} />
            <div><h2>Secure access</h2><p>Your account permissions determine which financial records and actions you can access.</p></div>
          </aside>
          <footer className="login-footer">FDR Sentinel <span>•</span> Secure · Verify · Monitor</footer>
        </div>
      </section>
    </main>
  );
}
