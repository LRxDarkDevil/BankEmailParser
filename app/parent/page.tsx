"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, ShieldAlert, Award, TrendingUp,
  TrendingDown, Calendar, ArrowRight, UserCheck,
  Clock, AlertTriangle, AlertCircle, RefreshCw,
  Lock, ChevronDown, Eye, EyeOff, CheckCircle2,
  Flame, Zap, BarChart3, Activity
} from "lucide-react";
import { Transaction } from "@/lib/parser";
import { categorize } from "@/lib/parser/categorizer";
import { getParentPin } from "@/lib/security";
import ThemeToggle from "@/app/components/ThemeToggle";

interface UserRecord { uid: string; name: string; email: string; lastSynced?: string; }

// ── Category config ──────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Food:          "#fb7185",
  Coffee:        "#fbbf24",
  Transport:     "#38bdf8",
  Beauty:        "#e879f9",
  Lifestyle:     "#a78bfa",
  Utilities:     "#fb923c",
  Education:     "#7c6fff",
  Entertainment: "#22d3ee",
  Transfer:      "#2dd4bf",
  Other:         "#64748b",
};
const CATEGORY_EMOJI: Record<string, string> = {
  Food:"🍔", Coffee:"☕", Transport:"🚗", Beauty:"💅",
  Lifestyle:"✨", Utilities:"📱", Education:"📚", Entertainment:"🎬",
  Transfer:"💸", Other:"📦",
};

// ── Small components ─────────────────────────────────────────────────────────

function ScoreMeter({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#34d399" : score >= 50 ? "#fbbf24" : "#fb7185";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
      <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
        <svg width={96} height={96} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
          <circle cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 8px ${color}60)` }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Health Score</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
          {score >= 80 ? "Excellent habits! Keep it up." : score >= 50 ? "Decent — watch retail spending." : "High impulse spending detected."}
        </div>
        <span className={`badge badge-${score >= 80 ? "success" : score >= 50 ? "warning" : "danger"}`} style={{ marginTop: "0.5rem" }}>
          {score >= 80 ? "Healthy" : score >= 50 ? "Fair" : "At Risk"}
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accentColor, icon: Icon }: { label: string; value: string; sub: string; accentColor: string; icon: React.ElementType }) {
  return (
    <div className="stat-card" style={{ borderTop: `2px solid ${accentColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="stat-label">{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accentColor}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={accentColor} />
        </div>
      </div>
      <div className="stat-value" style={{ color: accentColor === "var(--color-emerald)" || accentColor === "#34d399" ? "var(--color-emerald)" : accentColor === "#fb7185" ? "var(--color-rose)" : "var(--text-primary)" }}>
        {value}
      </div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

// ── Main content ─────────────────────────────────────────────────────────────
function ParentDashboardContent() {
  const searchParams = useSearchParams();
  const uid  = searchParams.get("uid");
  const pin  = searchParams.get("pin");

  const [loading, setLoading]               = useState(true);
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);
  const [teenName, setTeenName]             = useState("Teenager");
  const [teenEmail, setTeenEmail]           = useState("");
  const [lastSynced, setLastSynced]         = useState("");
  const [transactions, setTransactions]     = useState<Transaction[]>([]);
  const [usersList, setUsersList]           = useState<UserRecord[]>([]);
  const [selectedUser, setSelectedUser]     = useState<string>(uid || "");
  const [isPinVerified, setIsPinVerified]   = useState(false);
  const [enteredPin, setEnteredPin]         = useState("");
  const [pinError, setPinError]             = useState<string | null>(null);
  const [showPin, setShowPin]               = useState(false);

  // load user list
  useEffect(() => {
    fetch("/api/users").then(r => r.json()).then(setUsersList).catch(console.error);
  }, []);

  // verify pin from url
  useEffect(() => {
    if (selectedUser) {
      setIsPinVerified(pin === getParentPin(selectedUser));
    }
  }, [selectedUser, pin]);

  // fetch transactions
  useEffect(() => {
    if (!selectedUser) { setLoading(false); return; }
    setLoading(true); setErrorMsg(null);
    fetch(`/api/parent/transactions?uid=${selectedUser}`)
      .then(r => { if (!r.ok) throw new Error("Failed to load teen data"); return r.json(); })
      .then(data => {
        setTeenName(data.name);
        setTeenEmail(data.email);
        setLastSynced(data.lastSynced || "");
        setTransactions((data.transactions || []).filter((t: Transaction) => (t.amount_pkr || 0) > 0));
      })
      .catch(e => { console.error(e); setErrorMsg("Failed to retrieve metrics for the selected account."); })
      .finally(() => setLoading(false));
  }, [selectedUser]);

  const handleUserChange = (newUid: string) => {
    setSelectedUser(newUid); setIsPinVerified(false);
    setEnteredPin(""); setPinError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("uid", newUid);
    url.searchParams.delete("pin");
    window.history.pushState({}, "", url.toString());
  };

  // ── Metrics ────────────────────────────────────────────────────────────────
  const debits  = transactions.filter(t => t.direction === "debit");
  const credits = transactions.filter(t => t.direction === "credit");
  const totalSpent    = debits.reduce((acc, t) => acc + (t.amount_pkr || 0), 0);
  const totalReceived = credits.reduce((acc, t) => acc + (t.amount_pkr || 0), 0);
  const netFlow       = totalReceived - totalSpent;

  const categoryMap: Record<string, number> = {};
  debits.forEach(t => {
    const cat = categorize(t.merchant_name, t.direction) === "Allowance" ? "Transfer" : categorize(t.merchant_name, t.direction);
    categoryMap[cat] = (categoryMap[cat] || 0) + (t.amount_pkr || 0);
  });
  const topCategories = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Health score
  const impulseSpent = debits
    .filter(t => ["Entertainment","Lifestyle","Beauty","Coffee"].includes(categorize(t.merchant_name, t.direction)))
    .reduce((a, t) => a + (t.amount_pkr || 0), 0);
  const lateNightTxns = debits.filter(t => {
    try { const h = new Date(t.date_time).getHours(); return h >= 23 || h < 5; } catch { return false; }
  });
  let healthScore = Math.round(100 - ((totalSpent > 0 ? impulseSpent / totalSpent : 0) * 40) - (lateNightTxns.length * 5));
  healthScore = Math.max(10, Math.min(100, healthScore));

  // Alert flags
  const alertFlags: Array<{ type: "warning"|"danger"|"info"|"success"; title: string; text: string }> = [];
  if (totalReceived > 0 && totalSpent > totalReceived)
    alertFlags.push({ type: "danger", title: "Negative Cash Flow", text: `Spending (Rs. ${totalSpent.toLocaleString()}) exceeded tracked income (Rs. ${totalReceived.toLocaleString()}).` });
  const largeTxns = debits.filter(t => t.amount_pkr > 2000);
  if (largeTxns.length > 0)
    alertFlags.push({ type: "warning", title: "Large Transactions", text: `${largeTxns.length} purchase(s) exceeded Rs. 2,000 (max: Rs. ${Math.max(...largeTxns.map(t => t.amount_pkr)).toLocaleString()}).` });
  if (lateNightTxns.length > 0)
    alertFlags.push({ type: "info", title: "Late-Night Activity", text: `${lateNightTxns.length} transaction(s) past 11 PM detected.` });
  const impulsePct = totalSpent > 0 ? impulseSpent / totalSpent : 0;
  if (impulsePct > 0.3)
    alertFlags.push({ type: "warning", title: "High Retail Spend", text: `Retail categories make up ${Math.round(impulsePct * 100)}% of spending.` });

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); }
    catch { return "recently"; }
  };

  // ── PIN gate ───────────────────────────────────────────────────────────────
  if (!selectedUser) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="glass-card" style={{ maxWidth: 440, width: "100%", textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-muted)" }}>No account selected.</p>
        </div>
      </div>
    );
  }

  if (!isPinVerified) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: "2rem" }}>
        <div className="glass-card animate-fade-up" style={{ maxWidth: 420, width: "100%", display: "flex", flexDirection: "column", gap: "1.75rem", alignItems: "center", padding: "2.5rem", textAlign: "center" }}>
          {/* icon */}
          <div style={{
            width: 72, height: 72, borderRadius: "var(--radius-lg)",
            background: "linear-gradient(135deg, rgba(124,111,255,0.15), rgba(192,132,252,0.08))",
            border: "1px solid rgba(124,111,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Lock size={30} color="var(--brand-2)" />
          </div>

          <div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, marginBottom: "0.5rem" }}>Secure Parent Portal</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6 }}>
              Enter the 4-digit <strong style={{ color: "var(--brand-2)" }}>Parent Access PIN</strong> shown on your teen's dashboard to unlock their report.
            </p>
          </div>

          {usersList.length > 1 && (
            <div className="form-group" style={{ width: "100%", marginBottom: 0 }}>
              <label className="form-label">Account to View</label>
              <select className="form-input" value={selectedUser} onChange={e => handleUserChange(e.target.value)}>
                {usersList.map(u => <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>)}
              </select>
            </div>
          )}

          <div className="form-group" style={{ width: "100%", marginBottom: 0 }}>
            <div style={{ position: "relative" }}>
              <input
                type={showPin ? "text" : "password"}
                maxLength={4}
                inputMode="numeric"
                value={enteredPin}
                onChange={e => { setEnteredPin(e.target.value); setPinError(null); }}
                onKeyDown={e => e.key === "Enter" && (() => {
                  const correct = getParentPin(selectedUser);
                  if (enteredPin === correct) {
                    setIsPinVerified(true);
                    const url = new URL(window.location.href);
                    url.searchParams.set("pin", enteredPin);
                    window.history.pushState({}, "", url.toString());
                  } else setPinError("Incorrect PIN. Try again.");
                })()}
                placeholder="••••"
                className="form-input"
                style={{ textAlign: "center", letterSpacing: "0.4em", fontSize: "1.4rem", paddingRight: "2.75rem", height: 60 }}
              />
              <button onClick={() => setShowPin(p => !p)}
                style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pinError && (
              <span style={{ fontSize: "0.78rem", color: "var(--color-rose)", display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.35rem", justifyContent: "center" }}>
                <AlertTriangle size={12} /> {pinError}
              </span>
            )}
          </div>

          <button
            onClick={() => {
              const correct = getParentPin(selectedUser);
              if (enteredPin === correct) {
                setIsPinVerified(true);
                const url = new URL(window.location.href);
                url.searchParams.set("pin", enteredPin);
                window.history.pushState({}, "", url.toString());
              } else setPinError("Incorrect PIN. Try again.");
            }}
            className="btn btn-primary"
            style={{ width: "100%", height: 50 }}
            disabled={!enteredPin}
          >
            <Lock size={16} />
            Unlock Financial Report
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem" }}>
        <RefreshCw size={32} className="animate-spin" color="var(--brand-1)" />
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Analyzing financial log…</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ padding: "2rem" }}>
        <div className="alert-flag danger" style={{ maxWidth: 600 }}>
          <AlertCircle size={18} color="var(--color-rose)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-rose)", marginBottom: "0.2rem" }}>Failed to load</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{errorMsg}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: "2rem", padding: "2rem 0" }}>

      {/* ── Profile row ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        paddingBottom: "1.5rem", borderBottom: "1px solid var(--border-faint)",
        flexWrap: "wrap", gap: "1rem",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, rgba(124,111,255,0.2), rgba(79,70,229,0.1))",
              border: "1px solid rgba(124,111,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.2rem",
            }}>👤</div>
            <div>
              <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                {teenName}<span style={{ color: "var(--text-muted)", fontWeight: 400 }}>'s Report</span>
              </h1>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{teenEmail}</p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <Clock size={12} />
            Last sync: {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}
          </div>
          {usersList.length > 1 && (
            <div style={{ position: "relative" }}>
              <select
                className="form-input btn-sm"
                value={selectedUser}
                onChange={e => handleUserChange(e.target.value)}
                style={{ fontSize: "0.8rem", height: 36, paddingLeft: "0.75rem" }}
              >
                {usersList.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Disclaimer ── */}
      <div className="alert-flag info">
        <AlertCircle size={15} color="var(--brand-2)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--brand-2)" }}>Note:</strong> Shows only transactions parsed from Gmail alerts. Transfers without email notifications may not appear.
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
        <StatCard label="Tracked Credits" value={`Rs. ${totalReceived.toLocaleString()}`} sub="Parsed credit alerts" accentColor="#34d399" icon={TrendingUp} />
        <StatCard label="Tracked Debits"  value={`Rs. ${totalSpent.toLocaleString()}`}    sub="Parsed debit alerts"  accentColor="#fb7185" icon={TrendingDown} />
        <StatCard
          label="Net Flow"
          value={`${netFlow < 0 ? "−" : "+"}Rs. ${Math.abs(netFlow).toLocaleString()}`}
          sub={netFlow >= 0 ? "Surplus — spending under income" : "Deficit — over tracked income"}
          accentColor={netFlow >= 0 ? "#34d399" : "#fb7185"}
          icon={Activity}
        />
      </div>

      {/* ── Health Score + Categories ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1.5rem" }}>

        {/* Health score card */}
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <BarChart3 size={16} color="var(--brand-1)" /> Financial Wellness
            </h3>
          </div>
          <ScoreMeter score={healthScore} />
          <div className="section-divider"><span>Transaction Breakdown</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {[
              { label: "Debits", value: debits.length, color: "var(--color-rose)" },
              { label: "Credits", value: credits.length, color: "var(--color-emerald)" },
              { label: "Late Night", value: lateNightTxns.length, color: "var(--color-amber)" },
              { label: "Large (>2k)", value: debits.filter(t => t.amount_pkr > 2000).length, color: "var(--color-purple)" },
            ].map(s => (
              <div key={s.label} className="field-card" style={{ alignItems: "center", textAlign: "center" }}>
                <span className="field-label">{s.label}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 800, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category bars */}
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Flame size={16} color="var(--color-amber)" /> Spending by Category
          </h3>
          {topCategories.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "0.5rem", color: "var(--text-muted)", padding: "2rem" }}>
              <BarChart3 size={28} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: "0.85rem" }}>No spending data yet</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {topCategories.map(cat => {
                const maxVal = Math.max(...topCategories.map(c => c.value), 1);
                const pct = (cat.value / maxVal) * 100;
                const pctOfTotal = totalSpent > 0 ? Math.round((cat.value / totalSpent) * 100) : 0;
                const color = CATEGORY_COLORS[cat.name] || "#6b7280";
                return (
                  <div key={cat.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.9rem" }}>{CATEGORY_EMOJI[cat.name] || "📦"}</span>
                        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>{cat.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)" }}>Rs. {cat.value.toLocaleString()}</span>
                        <span className="badge" style={{ background: `${color}18`, color, border: `1px solid ${color}30`, fontSize: "0.68rem" }}>{pctOfTotal}%</span>
                      </div>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Safety Flags ── */}
      <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ShieldAlert size={16} color="var(--color-rose)" /> Financial Safety Flags
        </h3>
        {alertFlags.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1.25rem", borderRadius: "var(--radius-md)", background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.12)" }}>
            <CheckCircle2 size={24} color="var(--color-emerald)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-emerald)", marginBottom: "0.15rem" }}>All Clear!</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No budget issues, large transactions, late-night spending, or retail flags detected.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.875rem" }}>
            {alertFlags.map((flag, i) => (
              <div key={i} className={`alert-flag ${flag.type}`}>
                <ShieldAlert size={17}
                  color={flag.type === "danger" ? "var(--color-rose)" : flag.type === "warning" ? "var(--color-amber)" : "var(--brand-2)"}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <div style={{
                    fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.2rem",
                    color: flag.type === "danger" ? "var(--color-rose)" : flag.type === "warning" ? "var(--color-amber)" : "var(--brand-2)",
                  }}>{flag.title}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{flag.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Activity Feed ── */}
      <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Activity size={16} color="var(--brand-1)" /> Recent Activity
          </h3>
          <span className="badge badge-neutral">{debits.length} debits total</span>
        </div>
        {debits.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            No spending transactions recorded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {debits.slice(0, 8).map((txn, i) => {
              const cat = categorize(txn.merchant_name, txn.direction);
              const color = CATEGORY_COLORS[cat] || "#6b7280";
              return (
                <div key={i} className="txn-row">
                  <div className="txn-icon" style={{ background: `${color}18` }}>
                    <span style={{ fontSize: "1rem" }}>{CATEGORY_EMOJI[cat] || "📦"}</span>
                  </div>
                  <div className="txn-info">
                    <div className="txn-merchant">{txn.merchant_name}</div>
                    <div className="txn-meta">
                      {cat} · {formatDate(txn.date_time)} · {txn.payment_method || txn.source}
                    </div>
                  </div>
                  <div className="txn-amount debit">−Rs. {(txn.amount_pkr || 0).toLocaleString()}</div>
                </div>
              );
            })}
            {debits.length > 8 && (
              <div style={{ textAlign: "center", paddingTop: "0.5rem" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>+ {debits.length - 8} more transactions</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page wrapper ─────────────────────────────────────────────────────────────
export default function ParentDashboard() {
  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* ambient orbs */}
      <div className="orb orb-indigo" style={{ width: 500, height: 500, top: -150, right: -100, opacity: 0.2 }} />
      <div className="orb orb-violet" style={{ width: 350, height: 350, bottom: 0, left: -100, opacity: 0.15 }} />

      {/* top nav bar */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 2rem", height: 64,
        background: "rgba(var(--bg-base), 0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-light)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div className="brand">
          <div className="brand-logo">Y</div>
          <div>
            <div className="brand-name">YouthPay</div>
            <div className="brand-sub">Parent View</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <a href="/" className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <ArrowLeft size={14} />
            Back to Portal
          </a>
          <ThemeToggle />
        </div>
      </nav>

      <div className="container" style={{ padding: "0 2rem", maxWidth: 1100 }}>
        <Suspense fallback={
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem" }}>
            <RefreshCw size={28} className="animate-spin" color="var(--brand-1)" />
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading…</p>
          </div>
        }>
          <ParentDashboardContent />
        </Suspense>
      </div>
    </div>
  );
}
