"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  ArrowLeft, ShieldAlert, Award, TrendingUp, 
  TrendingDown, Calendar, ArrowRight, UserCheck, 
  Clock, AlertTriangle, AlertCircle, RefreshCw
} from "lucide-react";
import { Transaction } from "@/lib/parser";
import { categorize } from "@/lib/parser/categorizer";
import { getParentPin } from "@/lib/security";

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  lastSynced?: string;
}

function ParentDashboardContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const pin = searchParams.get("pin");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [teenName, setTeenName] = useState<string>("Teenager");
  const [teenEmail, setTeenEmail] = useState<string>("");
  const [lastSynced, setLastSynced] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>(uid || "");
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // Load all users to allow switching dropdown
  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        setUsersList(data);
      })
      .catch((err) => console.error("Error loading users list:", err));
  }, []);

  // Verify PIN whenever user or pin parameter changes
  useEffect(() => {
    if (selectedUser) {
      const correctPin = getParentPin(selectedUser);
      if (pin === correctPin) {
        setIsPinVerified(true);
      } else {
        setIsPinVerified(false);
      }
    }
  }, [selectedUser, pin]);

  // Fetch transactions for the target teen
  useEffect(() => {
    if (!selectedUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    
    // We can fetch transactions for a specific user.
    // Wait, how does `/api/gmail/sync` know which user to read?
    // In our GET `/api/gmail/sync`, if the user has active session cookies, it returns their own transaction logs.
    // But for a Parent, how do they read a specific teen's transactions?
    // We can update the GET `/api/gmail/sync` (or `/api/users` or a new endpoint `/api/parent/transactions`) to read any uid!
    // Wait! Let's check: we can make a custom endpoint `/api/parent/transactions?uid=xxx` that reads the database for a specific uid!
    // This is extremely clean and secure. Let's create `/app/api/parent/transactions/route.ts` that takes a `uid` query parameter and returns that user's transactions!
    // Yes! Let's write that API and then hit it.
    
    fetch(`/api/parent/transactions?uid=${selectedUser}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load teen data");
        return res.json();
      })
      .then((data) => {
        setTeenName(data.name);
        setTeenEmail(data.email);
        setLastSynced(data.lastSynced || "");
        setTransactions((data.transactions || []).filter((t: Transaction) => (t.amount_pkr || 0) > 0));
      })
      .catch((err) => {
        console.error(err);
        setErrorMsg("Failed to retrieve metrics for the selected account.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedUser]);

  const handleUserChange = (newUid: string) => {
    setSelectedUser(newUid);
    setIsPinVerified(false);
    setEnteredPin("");
    setPinError(null);
    // Update the URL query param without full reload
    const url = new URL(window.location.href);
    url.searchParams.set("uid", newUid);
    url.searchParams.delete("pin"); // Remove PIN from query so they must enter the new PIN
    window.history.pushState({}, "", url.toString());
  };

  // ==========================================
  // METRICS & ANALYSIS
  // ==========================================

  const debits = transactions.filter(t => t.direction === "debit");
  const credits = transactions.filter(t => t.direction === "credit");

  const totalSpent = debits.reduce((acc, curr) => acc + (curr.amount_pkr || 0), 0);
  const totalReceived = credits.reduce((acc, curr) => acc + (curr.amount_pkr || 0), 0);

  const trackedIncome = totalReceived;
  const trackedSpent = totalSpent;
  const netFlow = totalReceived - totalSpent;

  // 1. Top 5 Categories for Horizontal Bar Chart
  const categoryMap: Record<string, number> = {};
  debits.forEach(t => {
    const rawCat = categorize(t.merchant_name, t.direction);
    const cat = rawCat === "Allowance" ? "Transfer" : rawCat;
    categoryMap[cat] = (categoryMap[cat] || 0) + (t.amount_pkr || 0);
  });

  const topCategories = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const categoryColors: Record<string, string> = {
    Food: "#f43f5e",          // Rose/Red
    Coffee: "#f59e0b",        // Amber
    Transport: "#38bdf8",     // Sky Blue
    Beauty: "#ec4899",        // Pink
    Lifestyle: "#a855f7",     // Purple
    Utilities: "#f97316",     // Orange
    Education: "#6366f1",     // Indigo
    Entertainment: "#06b6d4", // Cyan
    Transfer: "#14b8a6",      // Teal
    Other: "#6b7280"          // Gray
  };

  // 2. Alert Flags logic
  const alertFlags: Array<{ type: "warning" | "danger" | "info"; title: string; text: string }> = [];

  // Flag A: Outflow exceeds income
  if (trackedIncome > 0 && trackedSpent > trackedIncome) {
    alertFlags.push({
      type: "danger",
      title: "Negative Cash Flow",
      text: `${teenName}'s tracked monthly spending (Rs. ${trackedSpent.toLocaleString()}) has exceeded their tracked income (Rs. ${trackedIncome.toLocaleString()}).`
    });
  }

  // Flag B: Any transaction > Rs 2,000
  const largeTxns = debits.filter(t => t.amount_pkr > 2000);
  if (largeTxns.length > 0) {
    alertFlags.push({
      type: "warning",
      title: "Large Transactions Detected",
      text: `${teenName} made ${largeTxns.length} purchase(s) exceeding Rs. 2,000 (Max: Rs. ${Math.max(...largeTxns.map(t => t.amount_pkr)).toLocaleString()}).`
    });
  }

  // Flag C: Late night transactions (after 11 PM)
  const lateNightTxns = debits.filter(t => {
    try {
      const hrs = new Date(t.date_time).getHours();
      return hrs >= 23 || hrs < 5;
    } catch {
      return false;
    }
  });
  if (lateNightTxns.length > 0) {
    alertFlags.push({
      type: "info",
      title: "Late Night Spending",
      text: `Detected ${lateNightTxns.length} transaction(s) occurred past 11:00 PM.`
    });
  }

  // Flag D: Entertainment or Lifestyle spending > 30%
  const impulseSpent = debits
    .filter(t => ["Entertainment", "Lifestyle", "Beauty"].includes(categorize(t.merchant_name, t.direction)))
    .reduce((acc, curr) => acc + curr.amount_pkr, 0);
  if (totalSpent > 0 && (impulseSpent / totalSpent) > 0.3) {
    alertFlags.push({
      type: "warning",
      title: "High Retail Spend",
      text: `Retail purchases (Entertainment/Lifestyle) account for ${Math.round((impulseSpent / totalSpent) * 100)}% of total monthly spending.`
    });
  }

  // Helper to format Date in plain language (e.g. "on Monday, Jun 12")
  const formatPlainDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    } catch {
      return "recently";
    }
  };

  return (
    <div style={{ padding: "2rem 0", minHeight: "100vh" }} className="container">
      {/* Top Header Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <a href="/" className="btn btn-secondary" style={{ display: "flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem" }}>
          <ArrowLeft size={14} />
          Back to Portal Select
        </a>

        {usersList.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>MONITOR ACCOUNT:</span>
            <select 
              value={selectedUser} 
              onChange={(e) => handleUserChange(e.target.value)}
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: "6px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
                fontSize: "0.85rem"
              }}
            >
              {usersList.map((user) => (
                <option key={user.uid} value={user.uid} style={{ background: "#111" }}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!selectedUser ? (
        <div className="glass-card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
          No teenager account selected. Please select one to view metrics.
        </div>
      ) : !isPinVerified ? (
        <div className="glass-card" style={{ padding: "3rem", maxWidth: "450px", margin: "2rem auto", display: "flex", flexDirection: "column", gap: "1.5rem", alignItems: "center" }}>
          <div style={{ width: "64px", height: "64px", background: "rgba(168, 85, 247, 0.1)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#a855f7" }}>
            <ShieldAlert size={32} />
          </div>
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "800", marginBottom: "0.5rem" }}>Secure Parent Portal</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.4" }}>
              This account's metrics are locked. Please enter the 4-digit **Parent Access PIN** shown on the teenager's dashboard to unlock.
            </p>
          </div>

          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <input 
              type="password"
              maxLength={4}
              value={enteredPin}
              onChange={(e) => {
                setEnteredPin(e.target.value);
                setPinError(null);
              }}
              placeholder="Enter 4-digit PIN"
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
                fontSize: "1rem",
                textAlign: "center",
                letterSpacing: "0.25rem"
              }}
            />
            {pinError && <span style={{ color: "#f43f5e", fontSize: "0.8rem", textAlign: "center" }}>{pinError}</span>}
          </div>

          <button 
            onClick={() => {
              const correctPin = getParentPin(selectedUser);
              if (enteredPin === correctPin) {
                setIsPinVerified(true);
                const url = new URL(window.location.href);
                url.searchParams.set("pin", enteredPin);
                window.history.pushState({}, "", url.toString());
              } else {
                setPinError("Incorrect PIN. Please try again.");
              }
            }}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", background: "#a855f7", color: "#fff" }}
          >
            Unlock Financial Report
          </button>
        </div>
      ) : loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: "300px", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
          <RefreshCw size={36} className="spin" style={{ animation: "spin 1s linear infinite" }} />
          <span>Analyzing teen's financial log...</span>
        </div>
      ) : errorMsg ? (
        <div className="badge badge-danger" style={{ textTransform: "none", letterSpacing: "normal", padding: "1.5rem", width: "100%", borderRadius: "10px", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          {/* Header Profile Section */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", borderBottom: "1px solid var(--border-light)", paddingBottom: "1.5rem", gap: "1rem" }}>
            <div>
              <h1 style={{ fontSize: "2rem", fontWeight: "800", marginBottom: "0.25rem" }}>{teenName}'s Financial Report</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Linked Gmail: <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>{teenEmail}</span>
              </p>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <Clock size={12} />
              <span>Last Ingested Sync: {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}</span>
            </div>
          </div>

          {/* Disclaimer Banner */}
          <div style={{ 
            background: "rgba(59, 130, 246, 0.05)", 
            border: "1px solid rgba(59, 130, 246, 0.15)", 
            borderRadius: "8px", 
            padding: "1rem", 
            fontSize: "0.85rem", 
            color: "#93c5fd",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>
              <strong>Note:</strong> This shows only transaction notifications parsed from Gmail. Since some incoming transfers or opening bank balances might not trigger email alerts, the tracked net flow may differ from your actual bank balance.
            </span>
          </div>

          {/* Monthly Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "0.5rem", borderLeft: "4px solid var(--color-indigo)" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>TRACKED CREDITS</span>
              <span style={{ fontSize: "2.25rem", fontWeight: "800", color: "var(--text-primary)" }}>Rs. {trackedIncome.toLocaleString()}</span>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>Sum of parsed credit alerts this month</p>
            </div>
            
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "0.5rem", borderLeft: "4px solid #f43f5e" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>TRACKED DEBITS</span>
              <span style={{ fontSize: "2.25rem", fontWeight: "800", color: "#f43f5e" }}>Rs. {trackedSpent.toLocaleString()}</span>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>Sum of parsed debit alerts this month</p>
            </div>
 
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "0.5rem", borderLeft: `4px solid ${netFlow >= 0 ? "#10b981" : "#f43f5e"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>TRACKED NET FLOW</span>
                <span className={`badge badge-${netFlow >= 0 ? "success" : "danger"}`} style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}>
                  {netFlow >= 0 ? "Surplus" : "Deficit"}
                </span>
              </div>
              <span style={{ fontSize: "2.25rem", fontWeight: "800", color: netFlow >= 0 ? "#10b981" : "#f43f5e" }}>
                {netFlow < 0 ? "-" : ""}Rs. {Math.abs(netFlow).toLocaleString()}
              </span>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>Tracked net difference of parsed transactions</p>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic", lineHeight: "1.3" }}>
                ⚠️ Incoming transfers without email alerts are not counted here.
              </span>
            </div>
          </div>

          {/* Central Analytics: Horizontal Bars & Flags */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            
            {/* Top 5 Categories Horizontal Bar Chart */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Spending by Category</h3>
              {topCategories.length === 0 ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No spending categories detected yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {topCategories.map((cat) => {
                    const maxVal = Math.max(...topCategories.map(c => c.value), 1);
                    const percentageWidth = (cat.value / maxVal) * 100;
                    return (
                      <div key={cat.name} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                          <span style={{ fontWeight: "600", color: "var(--text-secondary)" }}>{cat.name}</span>
                          <span style={{ fontWeight: "800" }}>
                            Rs. {cat.value.toLocaleString()} ({Math.round((cat.value / totalSpent) * 100)}%)
                          </span>
                        </div>
                        {/* Horizontal Bar */}
                        <div style={{ width: "100%", height: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "10px", overflow: "hidden" }}>
                          <div 
                            style={{ 
                              width: `${percentageWidth}%`, 
                              height: "100%", 
                              background: categoryColors[cat.name] || "#6b7280",
                              borderRadius: "10px",
                              transition: "width 0.5s ease"
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Alert Flags Section */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Financial Safety Flags</h3>
              {alertFlags.length === 0 ? (
                <div style={{ padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem", height: "100%" }}>
                  <Award size={32} color="#10b981" />
                  <span style={{ fontSize: "0.9rem", color: "var(--text-emerald)", fontWeight: "600" }}>All clear!</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>No budget breaches, late-night spending, or retail flags detected.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {alertFlags.map((flag, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: "flex", 
                        gap: "0.75rem", 
                        padding: "1rem", 
                        borderRadius: "10px", 
                        background: flag.type === "danger" 
                          ? "rgba(244,63,94,0.04)" 
                          : flag.type === "warning" 
                            ? "rgba(245,158,11,0.04)" 
                            : "rgba(99,102,241,0.04)",
                        border: `1px solid ${
                          flag.type === "danger" 
                            ? "rgba(244,63,94,0.15)" 
                            : flag.type === "warning" 
                              ? "rgba(245,158,11,0.15)" 
                              : "rgba(99,102,241,0.15)"
                        }`,
                        alignItems: "flex-start"
                      }}
                    >
                      <ShieldAlert 
                        size={18} 
                        color={
                          flag.type === "danger" 
                            ? "#f43f5e" 
                            : flag.type === "warning" 
                              ? "#f59e0b" 
                              : "#6366f1"
                        } 
                        style={{ marginTop: "2px", flexShrink: 0 }}
                      />
                      <div>
                        <h4 style={{ 
                          fontSize: "0.85rem", 
                          fontWeight: "700", 
                          color: flag.type === "danger" ? "#fda4af" : flag.type === "warning" ? "#fde047" : "#c7d2fe" 
                        }}>
                          {flag.title}
                        </h4>
                        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem", margin: 0, lineHeight: "1.4" }}>
                          {flag.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Bottom Row: Plain Language Activity Feed */}
          <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Plain-Language Activity Feed</h3>
            {debits.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                No spending transactions recorded to generate feed.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {debits.slice(0, 5).map((txn, index) => (
                  <div 
                    key={index} 
                    style={{ 
                      padding: "1rem", 
                      borderRadius: "8px", 
                      background: "rgba(255,255,255,0.01)", 
                      border: "1px solid var(--border-light)",
                      fontSize: "0.9rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span style={{ fontSize: "1.1rem" }}>🛍️</span>
                      <span>
                        Spent <strong style={{ color: "var(--text-primary)" }}>Rs. {(txn.amount_pkr || 0).toLocaleString()}</strong> at <strong>{txn.merchant_name}</strong> {formatPlainDate(txn.date_time)} using {txn.payment_method || txn.source} ({categorize(txn.merchant_name, txn.direction)}).
                      </span>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {txn.source}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default function ParentDashboard() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        Loading layout...
      </div>
    }>
      <ParentDashboardContent />
    </Suspense>
  );
}
