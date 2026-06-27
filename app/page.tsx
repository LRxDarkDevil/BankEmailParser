"use client";

import { useEffect, useState } from "react";
import { Mail, Shield, Users, ArrowRight, Wallet, TrendingUp, AlertTriangle, Lock, Zap, Eye, CheckCircle, ChevronRight } from "lucide-react";
import { getParentPin } from "@/lib/security";

import ThemeToggle from "@/app/components/ThemeToggle";

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  lastSynced?: string;
}

const FEATURES = [
  { icon: Zap,   label: "Instant sync",       desc: "Auto-ingests Gmail bank alerts in seconds" },
  { icon: Eye,   label: "Spending categories", desc: "AI categorizes every transaction automatically" },
  { icon: Lock,  label: "PIN-protected",       desc: "Parents verify via a secure 4-digit PIN" },
];

const BANKS = ["NayaPay", "Easypaisa", "ABL", "Meezan", "HBL", "SadaPay"];

export default function Home() {
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);
  const [usersList, setUsersList]           = useState<UserRecord[]>([]);
  const [selectedParentUser, setSelectedParentUser] = useState<string>("");
  const [parentPinInput, setParentPinInput] = useState<string>("");
  const [pinError, setPinError]             = useState<string | null>(null);
  const [pinLoading, setPinLoading]         = useState(false);
  const [showPin, setShowPin]               = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teenUserName, setTeenUserName]     = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const msg = params.get("msg");
    if (err === "exchange_failed") setErrorMsg(`Failed to exchange Google OAuth code: ${msg || "Unknown error"}`);
    else if (err === "missing_code") setErrorMsg("OAuth authorization code was not returned by Google.");
    else if (err) setErrorMsg(`Authentication failed: ${err}`);

    fetch("/api/users")
      .then(r => r.json())
      .then((data: UserRecord[]) => {
        setUsersList(data);
        if (data.length > 0) setSelectedParentUser(data[0].uid);
      })
      .catch(e => console.error("Error loading users:", e));

    // Check if teenager session exists
    fetch("/api/gmail/sync")
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Not logged in");
      })
      .then(data => {
        setIsAuthenticated(true);
        setTeenUserName(data.name || "Teenager");
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
  }, []);

  const handleVerifyAndRedirect = () => {
    setPinError(null);
    if (!selectedParentUser) return;
    setPinLoading(true);
    setTimeout(() => {
      const correctPin = getParentPin(selectedParentUser);
      if (parentPinInput === correctPin) {
        window.location.href = `/parent?uid=${selectedParentUser}&pin=${parentPinInput}`;
      } else {
        setPinError("Incorrect PIN. Ask your teen for their dashboard PIN.");
        setPinLoading(false);
      }
    }, 400);
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

      {/* Ambient orbs */}
      <div className="orb orb-violet" style={{ width: 600, height: 600, top: -200, left: -150, opacity: 0.35 }} />
      <div className="orb orb-indigo" style={{ width: 400, height: 400, top: "40%", right: -100, opacity: 0.25 }} />

      {/* ── Nav ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1rem 2.5rem",
        borderBottom: "1px solid var(--border-light)",
        background: "rgba(var(--bg-base), 0.7)",
        backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 50,
      }} className="app-header-nav">
        <div className="brand">
          <div className="brand-logo animate-glow">Y</div>
          <div>
            <div className="brand-name">YouthPay</div>
            <div className="brand-sub">Financial Intelligence</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="badge badge-info">🇵🇰 Pakistan</span>
          <ThemeToggle />
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "5rem 2rem 3rem",
        textAlign: "center",
        position: "relative",
      }}>
        {/* pill badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          padding: "0.4rem 1.1rem", borderRadius: 999,
          background: "rgba(124,111,255,0.08)",
          border: "1px solid rgba(124,111,255,0.2)",
          color: "var(--brand-2)", fontSize: "0.8rem", fontWeight: 600,
          marginBottom: "2rem",
          animation: "fadeUp 0.5s ease both",
        }}>
          <Shield size={13} />
          Pocket Money, Made Transparent
        </div>

        <h1 style={{
          fontSize: "clamp(2.6rem, 6vw, 5rem)",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
          marginBottom: "1.5rem",
          animation: "fadeUp 0.5s 0.08s ease both",
        }}>
          Your teen's spending,<br />
          <span className="text-gradient">crystal clear.</span>
        </h1>

        <p style={{
          fontSize: "1.15rem",
          color: "var(--text-secondary)",
          maxWidth: 540,
          lineHeight: 1.6,
          marginBottom: "2rem",
          animation: "fadeUp 0.5s 0.15s ease both",
        }}>
          Connect Gmail once. YouthPay automatically parses Pakistani bank transaction emails into live charts, categories, and parent-readable reports.
        </p>

        {/* Feature pills */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "0.6rem",
          justifyContent: "center", marginBottom: "3.5rem",
          animation: "fadeUp 0.5s 0.22s ease both",
        }}>
          {FEATURES.map(f => (
            <div key={f.label} style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              padding: "0.4rem 0.9rem", borderRadius: 999,
              background: "var(--glass-sm)", border: "1px solid var(--border-light)",
              fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500,
            }}>
              <f.icon size={13} color="var(--brand-2)" />
              {f.label}
            </div>
          ))}
        </div>

        {errorMsg && (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.6rem",
            padding: "0.875rem 1.25rem", borderRadius: "var(--radius-md)",
            background: "rgba(251,113,133,0.06)", border: "1px solid rgba(251,113,133,0.15)",
            color: "var(--color-rose)", fontSize: "0.85rem",
            maxWidth: 560, width: "100%", marginBottom: "2rem",
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── Portal Cards ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "1.5rem",
          width: "100%", maxWidth: 820,
          animation: "fadeUp 0.5s 0.3s ease both",
        }}>

          {/* Teen card */}
          <div className="glass-card hoverable" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem" }}>
            {/* Icon */}
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: "linear-gradient(135deg, rgba(124,111,255,0.2), rgba(79,70,229,0.1))",
              border: "1px solid rgba(124,111,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Wallet size={22} color="var(--brand-2)" />
            </div>

            <div>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                I'm a Teenager
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.65 }}>
                Link your Gmail and instantly see all your bank transaction data — spending charts, weekly logs, categories, and a financial health score.
              </p>
            </div>

            {isAuthenticated ? (
              <a href="/dashboard" className="btn btn-primary btn-lg" style={{ width: "100%", justifyContent: "center" }}>
                <Wallet size={17} />
                Go to Dashboard
                <ArrowRight size={15} />
              </a>
            ) : (
              <>
                <a href="/api/auth/google" className="btn btn-primary btn-lg" style={{ width: "100%", justifyContent: "center" }}>
                  <Mail size={17} />
                  Connect Gmail & Login
                  <ArrowRight size={15} />
                </a>
                <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem", textAlign: "center", lineHeight: 1.4 }}>
                  💡 <strong>Google Warning:</strong> Since this is a hackathon project, click <strong>"Advanced"</strong> &rarr; <strong>"Go to bank-email-parser.vercel.app (unsafe)"</strong> to bypass the verification alert.
                </p>
              </>
            )}

            <div>
              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                Supported Banks
              </p>
              <div className="supported-list" style={{ marginTop: 0 }}>
                {BANKS.map(b => <span key={b} className="supported-item">{b}</span>)}
              </div>
            </div>
          </div>

          {/* Parent card */}
          <div className="glass-card hoverable" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem" }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: "linear-gradient(135deg, rgba(192,132,252,0.2), rgba(124,111,255,0.1))",
              border: "1px solid rgba(192,132,252,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Users size={22} color="var(--color-purple)" />
            </div>

            <div>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                I'm a Parent
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.65 }}>
                Monitor your teen's spending categories, risk alerts, and plain-language activity feed. Secured by a 4-digit PIN from your teen's dashboard.
              </p>
            </div>

            {usersList.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Select Teenager Account</label>
                  <select
                    className="form-input"
                    value={selectedParentUser}
                    onChange={e => setSelectedParentUser(e.target.value)}
                  >
                    {usersList.map(u => (
                      <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Parent Access PIN</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPin ? "text" : "password"}
                      maxLength={4}
                      inputMode="numeric"
                      value={parentPinInput}
                      onChange={e => { setParentPinInput(e.target.value); setPinError(null); }}
                      onKeyDown={e => e.key === "Enter" && handleVerifyAndRedirect()}
                      placeholder="••••"
                      className="form-input"
                      style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: "1.1rem", paddingRight: "2.75rem" }}
                    />
                    <button
                      onClick={() => setShowPin(p => !p)}
                      style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
                    >
                      <Eye size={15} />
                    </button>
                  </div>
                  {pinError && (
                    <span style={{ fontSize: "0.78rem", color: "var(--color-rose)", display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.25rem" }}>
                      <AlertTriangle size={12} /> {pinError}
                    </span>
                  )}
                </div>

                <button
                  onClick={handleVerifyAndRedirect}
                  disabled={pinLoading || !parentPinInput}
                  className="btn btn-secondary"
                  style={{ width: "100%", borderColor: "rgba(192,132,252,0.3)", color: "var(--color-purple)", opacity: (!parentPinInput || pinLoading) ? 0.5 : 1 }}
                >
                  {pinLoading ? (
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  ) : <TrendingUp size={16} />}
                  View Teen Financials
                  <ChevronRight size={15} />
                </button>
              </div>
            ) : (
              <div style={{
                padding: "1.25rem",
                borderRadius: "var(--radius-md)",
                background: "var(--glass-sm)",
                border: "1px dashed var(--border-light)",
                textAlign: "center",
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                lineHeight: 1.55,
              }}>
                No teenager accounts connected yet.<br />
                Have your teen link their Gmail first.
              </div>
            )}
          </div>

        </div>

        {/* ── Footer note ── */}
        <p style={{
          marginTop: "3rem",
          fontSize: "0.78rem",
          color: "var(--text-muted)",
          display: "flex", alignItems: "center", gap: "0.4rem",
          animation: "fadeUp 0.5s 0.4s ease both",
        }}>
          <CheckCircle size={12} color="var(--color-emerald)" />
          Privacy pledge: We only read transaction emails from supported Pakistani banks. Everything else is ignored.
        </p>
      </section>
    </main>
  );
}
