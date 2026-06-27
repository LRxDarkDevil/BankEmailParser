"use client";

import { useEffect, useState } from "react";
import { parseEmail, Transaction } from "@/lib/parser";
import { categorize } from "@/lib/parser/categorizer";
import { getParentPin } from "@/lib/security";
import ThemeToggle from "@/app/components/ThemeToggle";
import { 
  RefreshCw, LogOut, Terminal, Mail, Play, 
  Copy, Check, AlertCircle, ShieldCheck, 
  TrendingUp, TrendingDown, Coffee, ShoppingBag, 
  Car, Heart, Film, Smartphone, Award,
  ArrowRight, DollarSign, Calendar, Eye, List
} from "lucide-react";

interface SyncResponse {
  email: string;
  name: string;
  uid: string;
  transactions: Transaction[];
  newSyncedCount?: number;
  picture?: string;
  messagesTotal?: number;
  isStudent?: boolean;
  needsSync?: boolean;
}

export default function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("YouthPay Teen");
  const [userPicture, setUserPicture] = useState<string | null>(null);
  const [messagesTotal, setMessagesTotal] = useState<number | null>(null);
  const [isStudent, setIsStudent]         = useState<boolean>(false);
  const [uid, setUid] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [syncCount, setSyncCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Tabs: "overview" | "transactions"
  const [activeView, setActiveView] = useState<"overview" | "transactions">("overview");
  const [activeSourceTab, setActiveSourceTab] = useState<string>("All");

  // Load saved transactions on mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/gmail/sync");
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/";
          return;
        }
        const data = await res.json();
        throw new Error(data.error || "Failed to load dashboard data");
      }
      const data: SyncResponse = await res.json();
      setUserEmail(data.email);
      setUserName(data.name);
      setUserPicture(data.picture || null);
      setMessagesTotal(data.messagesTotal ?? null);
      setIsStudent(!!data.isStudent);
      setUid(data.uid);
      setTransactions((data.transactions || []).filter((t: Transaction) => (t.amount_pkr || 0) > 0));
      // Auto-sync: if server reports no stored transactions for this user, kick off a full sync
      if (data.needsSync) {
        setInitialLoading(false);
        setLoading(false);
        triggerGmailSync();
        return;
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred while loading transaction logs.");
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  const triggerGmailSync = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSyncCount(null);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/";
          return;
        }
        const data = await res.json();
        throw new Error(data.error || "Sync failed");
      }
      const data: SyncResponse = await res.json();
      setUid(data.uid);
      setUserName(data.name);
      setUserPicture(data.picture || null);
      setUserEmail(data.email);
      setMessagesTotal(data.messagesTotal ?? null);
      setIsStudent(!!data.isStudent);
      setTransactions((data.transactions || []).filter((t: Transaction) => (t.amount_pkr || 0) > 0));
      setSyncCount(data.newSyncedCount ?? 0);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Gmail Sync encountered an error.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    }
    window.location.href = "/";
  };

  // ==========================================
  // METRICS & ANALYTICS CALCULATIONS
  // ==========================================

  const debits = transactions.filter(t => t.direction === "debit");
  const credits = transactions.filter(t => t.direction === "credit");

  const totalSpent = debits.reduce((acc, curr) => acc + (curr.amount_pkr || 0), 0);
  const totalReceived = credits.reduce((acc, curr) => acc + (curr.amount_pkr || 0), 0);

  const trackedIncome = totalReceived;
  const trackedSpent = totalSpent;
  const netFlow = totalReceived - totalSpent;

  // 1. Group by Category
  const categoryMap: Record<string, number> = {};
  debits.forEach(t => {
    const rawCat = categorize(t.merchant_name, t.direction);
    // Merge Allowance into Transfer for chart clarity (both are inflow-related)
    const cat = rawCat === "Allowance" ? "Transfer" : rawCat;
    categoryMap[cat] = (categoryMap[cat] || 0) + (t.amount_pkr || 0);
  });

  const categoryData = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Category Color Map
  const categoryColors: Record<string, string> = {
    Food: "#f43f5e",        // Rose/Red
    Coffee: "#f59e0b",      // Amber
    Transport: "#38bdf8",   // Sky Blue
    Beauty: "#ec4899",      // Pink
    Lifestyle: "#a855f7",   // Purple
    Utilities: "#f97316",   // Orange
    Education: "#6366f1",   // Indigo
    Entertainment: "#06b6d4", // Cyan
    Transfer: "#14b8a6",    // Teal (Allowance merged here)
    Other: "#6b7280"        // Gray
  };

  // Category Icons Map
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Coffee": return <Coffee size={16} />;
      case "Food": return <ShoppingBag size={16} />;
      case "Transport": return <Car size={16} />;
      case "Beauty": return <Heart size={16} />;
      case "Entertainment": return <Film size={16} />;
      case "Utilities": return <Smartphone size={16} />;
      default: return <DollarSign size={16} />;
    }
  };

  // 2. Financial Health Score Formula
  // Starting at 100. Deduct 0.5 points per percentage points spent in impulse categories (Coffee, Lifestyle, Entertainment)
  // Deduct 10 points if late night transactions are found. Clamp between 10 and 100.
  const impulseSpent = debits
    .filter(t => ["Coffee", "Entertainment", "Lifestyle", "Beauty"].includes(t.category))
    .reduce((acc, curr) => acc + (curr.amount_pkr || 0), 0);

  const impulsePercentage = totalSpent > 0 ? (impulseSpent / totalSpent) * 100 : 0;
  
  const lateNightTxns = debits.filter(t => {
    try {
      const hrs = new Date(t.date_time).getHours();
      return hrs >= 23 || hrs < 5;
    } catch {
      return false;
    }
  });

  let healthScore = Math.round(100 - (impulsePercentage * 0.4) - (lateNightTxns.length * 5));
  healthScore = Math.max(10, Math.min(100, healthScore));

  let healthBadge = "success";
  let healthExplanation = "You're building excellent spending habits!";
  
  if (healthScore < 50) {
    healthBadge = "danger";
    healthExplanation = "Impulse spending is draining your pocket money. Time to cut back!";
  } else if (healthScore < 80) {
    healthBadge = "warning";
    healthExplanation = "Decent habits, but retail and coffee trips are creeping up.";
  }

  // 3. Dynamic Insights Generation
  const insights: string[] = [];
  
  // Coffee Run Insight
  const coffeeTxns = debits.filter(t => t.category === "Coffee");
  const coffeeTotal = coffeeTxns.reduce((a, c) => a + (c.amount_pkr || 0), 0);
  if (coffeeTxns.length >= 2) {
    insights.push(`☕ Coffee addiction alert — Rs ${coffeeTotal.toLocaleString()} spent this month across ${coffeeTxns.length} runs.`);
  }

  // Late Night Insight
  if (lateNightTxns.length > 0) {
    const lateNightTotal = lateNightTxns.reduce((a, c) => a + (c.amount_pkr || 0), 0);
    insights.push(`🌙 Night owl warning — Rs ${lateNightTotal.toLocaleString()} spent during late-night hours (${lateNightTxns.length} transactions).`);
  }

  // Store Affinity (Favorite Merchant)
  const merchantCounts: Record<string, number> = {};
  debits.forEach(t => {
    merchantCounts[t.merchant_name] = (merchantCounts[t.merchant_name] || 0) + 1;
  });
  const topMerchant = Object.entries(merchantCounts).sort((a,b) => b[1] - a[1])[0];
  if (topMerchant && topMerchant[1] >= 2 && topMerchant[0] !== "Unknown") {
    insights.push(`🛍️ Store affinity — ${topMerchant[0]} is your favorite spot with ${topMerchant[1]} purchases this month.`);
  }

  // Budget Pace Insight
  if (trackedIncome > 0 && trackedSpent > trackedIncome) {
    insights.push(`⚠️ Outflow alert — Your spending (Rs. ${Math.round(trackedSpent).toLocaleString()}) exceeds your tracked credits (Rs. ${Math.round(trackedIncome).toLocaleString()}).`);
  } else if (trackedIncome > 0) {
    insights.push(`✅ Surplus tracked — You spent ${Math.round((trackedSpent / trackedIncome) * 100)}% of your tracked credits.`);
  }

  // 4. Weekly Ingest Bar Data
  const weeklyMap = [0, 0, 0, 0]; // Weeks 1-4
  debits.forEach(t => {
    try {
      const day = new Date(t.date_time).getDate();
      const weekIndex = Math.min(3, Math.floor((day - 1) / 7));
      weeklyMap[weekIndex] += (t.amount_pkr || 0);
    } catch {}
  });

  // 5. Top Merchants Data
  const merchantSpending: Record<string, number> = {};
  debits.forEach(t => {
    merchantSpending[t.merchant_name] = (merchantSpending[t.merchant_name] || 0) + (t.amount_pkr || 0);
  });
  const topMerchantsData = Object.entries(merchantSpending)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // 6. Bank/EMI Usage Data
  const sourceCounts: Record<string, number> = {};
  debits.forEach(t => {
    const sourceName = t.source || "Unknown";
    sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;
  });
  const sourceData = Object.entries(sourceCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  if (initialLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        <RefreshCw size={30} className="animate-spin" color="var(--brand-1, #7c6fff)" />
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo animate-glow">Y</div>
          <div>
            <div className="brand-name">YouthPay Teen</div>
            <div className="brand-sub">Financial Dashboard</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {userEmail && (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", background: "var(--glass-sm)", padding: "0.35rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                {userPicture ? (
                  <img src={userPicture} alt={userName} referrerPolicy="no-referrer" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <ShieldCheck size={14} color="var(--brand-1, #7c6fff)" />
                )}
                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{userName}</span>
              </div>
              {uid && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "rgba(124,111,255,0.06)", padding: "0.35rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(124,111,255,0.2)" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--brand-2, #a78bfa)", fontWeight: 700 }}>🔑 PIN: {getParentPin(uid)}</span>
                </div>
              )}
            </div>
          )}
          <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <LogOut size={13} />
            Disconnect
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-bar">
        <button
          onClick={() => setActiveView("overview")}
          className={`tab-btn ${activeView === "overview" ? "active" : ""}`}
        >
          <Mail size={15} />
          Dashboard
        </button>
        <button
          onClick={() => setActiveView("transactions")}
          className={`tab-btn ${activeView === "transactions" ? "active" : ""}`}
        >
          <List size={15} />
          Transactions
        </button>
      </div>

      {/* Main Grid Workspace */}
      {activeView === "overview" ? (
        <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }} className="container">
          
          {/* Top Actions & Sync Notification */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: "800", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                Hey {userName.split(" ")[0]} 👋
                {isStudent && (
                  <span className="badge badge-success" style={{ fontSize: "0.68rem", textTransform: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", verticalAlign: "middle" }}>
                    🎓 Student Account
                  </span>
                )}
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Here's your pocket money analysis for this month. 
                {messagesTotal !== null && (
                  <span style={{ color: "var(--brand-2, #a78bfa)", marginLeft: "0.4rem", fontWeight: "500" }}>
                    (Scanning {messagesTotal.toLocaleString()} emails)
                  </span>
                )}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {syncCount !== null && (
                <span className="badge badge-success" style={{ textTransform: "none", padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
                  Synced {syncCount} new transactions!
                </span>
              )}
              <button 
                onClick={triggerGmailSync} 
                className="btn btn-primary"
                disabled={loading}
                style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Sync Gmail Feed
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="badge badge-danger" style={{ textTransform: "none", letterSpacing: "normal", padding: "1rem", width: "100%", borderRadius: "8px", display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

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

          {/* Overview Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem" }}>
            <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>TRACKED CREDITS</span>
              <span style={{ fontSize: "2rem", fontWeight: "800", color: "var(--text-primary)" }}>Rs. {trackedIncome.toLocaleString()}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total incoming credits parsed from alerts</span>
            </div>
            <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>TRACKED DEBITS</span>
              <span style={{ fontSize: "2rem", fontWeight: "800", color: "#f43f5e" }}>Rs. {trackedSpent.toLocaleString()}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                <TrendingDown size={12} color="#f43f5e" />
                <span>Total outgoing debits parsed from alerts</span>
              </div>
            </div>
            <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>TRACKED NET FLOW</span>
              <span style={{ fontSize: "2rem", fontWeight: "800", color: netFlow >= 0 ? "#10b981" : "#f43f5e" }}>
                {netFlow < 0 ? "-" : ""}Rs. {Math.abs(netFlow).toLocaleString()}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {netFlow >= 0 ? <TrendingUp size={12} color="#10b981" /> : <TrendingDown size={12} color="#f43f5e" />}
                <span>{netFlow >= 0 ? "Surplus cash flow" : "Deficit cash flow"}</span>
              </div>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "0.25rem", lineHeight: "1.3" }}>
                ⚠️ Incoming transfers without email alerts are not counted here.
              </span>
            </div>
            {/* Health Score Card */}
            <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>FINANCIAL HEALTH SCORE</span>
                <span className={`badge badge-${healthBadge}`} style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                  <Award size={12} style={{ marginRight: "0.25rem" }} /> Score: {healthScore}
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.75rem", lineHeight: "1.4" }}>
                {healthExplanation}
              </p>
            </div>
          </div>

          {/* Central Analytics Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            
            {/* Spending Breakdown SVG Donut */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem", minHeight: "380px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Category Breakdown</h3>
              {categoryData.length === 0 ? (
                <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No transaction data available yet.
                </div>
              ) : (
                <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: "1.5rem" }}>
                  {/* Donut Pie Chart using CSS conic-gradient */}
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
                    {(() => {
                      let accumulatedPercent = 0;
                      const gradientStops = categoryData.length > 0 
                        ? categoryData.map((cat) => {
                            const percent = totalSpent > 0 ? (cat.value / totalSpent) * 100 : 0;
                            const start = accumulatedPercent;
                            accumulatedPercent += percent;
                            const color = categoryColors[cat.name] || "#6b7280";
                            return `${color} ${start}% ${accumulatedPercent}%`;
                          }).join(", ")
                        : "#6b7280 0% 100%";

                      return (
                        <div style={{
                          width: "180px",
                          height: "180px",
                          borderRadius: "50%",
                          background: `conic-gradient(${gradientStops})`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 0 20px rgba(0,0,0,0.4)"
                        }}>
                          {/* Center Hole for Donut Effect */}
                          <div style={{
                            width: "120px",
                            height: "120px",
                            borderRadius: "50%",
                            background: "var(--bg-base)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center"
                          }}>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "600" }}>SPENT</span>
                            <span style={{ fontSize: "1rem", fontWeight: "800" }}>Rs. {Math.round(totalSpent).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Category Legend — all categories */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", borderTop: "1px solid var(--border-light)", paddingTop: "1rem", justifyContent: "center" }}>
                    {categoryData.map(cat => (
                      <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: categoryColors[cat.name] || "#6b7280", display: "inline-block", flexShrink: 0 }}></span>
                        <span style={{ color: "var(--text-secondary)" }}>{cat.name}</span>
                        <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>
                          {Math.round(totalSpent > 0 ? (cat.value / totalSpent) * 100 : 0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Weekly Trend Bar Chart */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem", minHeight: "380px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Weekly Spending Trend</h3>
              <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end", height: "180px", padding: "1rem 0" }}>
                  {weeklyMap.map((val, idx) => {
                    const maxVal = Math.max(...weeklyMap, 1000);
                    const percentHeight = (val / maxVal) * 100;
                    return (
                      <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "40px", height: "100%" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                          {val > 0 ? `Rs.${Math.round(val)}` : "-"}
                        </div>
                        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                          <div 
                            style={{ 
                              width: "24px", 
                              height: `${percentHeight}%`, 
                              minHeight: "4px",
                              background: "linear-gradient(to top, var(--color-indigo) 0%, #a855f7 100%)",
                              borderRadius: "6px 6px 0 0",
                              boxShadow: "0 0 10px rgba(99, 102, 241, 0.2)",
                              transition: "height 0.5s ease"
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem", fontWeight: "600" }}>
                          W{idx + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "1rem", fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
                  Spending grouped by week of the current calendar month
                </div>
              </div>
            </div>

          </div>

          {/* Central Analytics Grid 2: Top Merchants & Income/Expense */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            
            {/* Top Merchants Chart */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Top Merchants</h3>
              {topMerchantsData.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No merchant data available yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {topMerchantsData.map((merchant, index) => {
                    const maxAmount = topMerchantsData[0].amount;
                    const percent = (merchant.amount / maxAmount) * 100;
                    return (
                      <div key={index} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                          <span style={{ fontWeight: "600", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>{merchant.name}</span>
                          <span style={{ fontWeight: "800", color: "var(--text-primary)" }}>Rs. {Math.round(merchant.amount).toLocaleString()}</span>
                        </div>
                        <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ 
                            width: `${percent}%`, 
                            height: "100%", 
                            background: "linear-gradient(90deg, var(--color-indigo) 0%, #a855f7 100%)",
                            borderRadius: "4px",
                            transition: "width 0.5s ease"
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Income vs Expense Ratio */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Income vs Expense</h3>
              <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: "2rem" }}>
                
                {/* Visual Ratio Bar */}
                <div style={{ display: "flex", height: "24px", borderRadius: "12px", overflow: "hidden", width: "100%" }}>
                  <div style={{ 
                    width: `${totalReceived === 0 && totalSpent === 0 ? 50 : (totalReceived / (totalReceived + totalSpent)) * 100}%`, 
                    background: "var(--color-emerald)", 
                    transition: "width 0.5s ease" 
                  }} />
                  <div style={{ 
                    width: `${totalReceived === 0 && totalSpent === 0 ? 50 : (totalSpent / (totalReceived + totalSpent)) * 100}%`, 
                    background: "#f43f5e", 
                    transition: "width 0.5s ease" 
                  }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div style={{ padding: "1rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.05)", borderLeft: "3px solid var(--color-emerald)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>MONEY IN</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "800", color: "var(--color-emerald)" }}>Rs. {totalReceived.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: "1rem", borderRadius: "8px", background: "rgba(244, 63, 94, 0.05)", borderLeft: "3px solid #f43f5e" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>MONEY OUT</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "800", color: "#f43f5e" }}>Rs. {totalSpent.toLocaleString()}</div>
                  </div>
                </div>

              </div>
            </div>

            {/* Bank/EMI Usage Chart */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Bank / EMI Usage</h3>
              {sourceData.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No bank data available yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {sourceData.map((source, index) => {
                    const maxCount = sourceData[0].count;
                    const percent = (source.count / maxCount) * 100;
                    return (
                      <div key={index} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                          <span style={{ fontWeight: "600", color: "var(--text-secondary)" }}>{source.name}</span>
                          <span style={{ fontWeight: "800", color: "var(--text-primary)" }}>{source.count} txns</span>
                        </div>
                        <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ 
                            width: `${percent}%`, 
                            height: "100%", 
                            background: "linear-gradient(90deg, #38bdf8 0%, #3b82f6 100%)",
                            borderRadius: "4px",
                            transition: "width 0.5s ease"
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Bottom Grid: Insights & Recent Transactions */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            
            {/* Insights Section */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Financial Insights</h3>
              {insights.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  Not enough transaction activity to generate insights. Sync your email or run test formats.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {insights.map((ins, index) => (
                    <div 
                      key={index} 
                      style={{ 
                        padding: "1rem", 
                        borderRadius: "10px", 
                        background: "rgba(255,255,255,0.01)", 
                        borderLeft: "4px solid var(--color-indigo)",
                        fontSize: "0.9rem",
                        lineHeight: "1.4",
                        color: "var(--text-secondary)"
                      }}
                    >
                      {ins}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Transactions Feed */}
            <div className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Recent Transactions</h3>
              {transactions.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No transactions synced yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {transactions.slice(0, 10).map((txn, index) => {
                    const isDebit = txn.direction === "debit";
                    return (
                      <div 
                        key={index} 
                        style={{ 
                          display: "flex", 
                          justifyContent: "space-between", 
                          alignItems: "center",
                          padding: "0.75rem",
                          borderRadius: "8px",
                          background: "rgba(255,255,255,0.01)",
                          border: "1px solid var(--border-light)"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div style={{ 
                            width: "36px", 
                            height: "36px", 
                            borderRadius: "8px", 
                            background: isDebit ? "rgba(244, 63, 94, 0.08)" : "rgba(16, 185, 129, 0.08)",
                            color: isDebit ? "#f43f5e" : "#10b981",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}>
                            {getCategoryIcon(txn.category)}
                          </div>
                          <div>
                            <div style={{ fontSize: "0.85rem", fontWeight: "700" }}>{txn.merchant_name}</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              {txn.source} • {new Date(txn.date_time).toLocaleDateString([], { month: "short", day: "numeric" })}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ 
                            fontSize: "0.9rem", 
                            fontWeight: "800", 
                            color: isDebit ? "#f43f5e" : "#10b981" 
                          }}>
                            {isDebit ? "-" : "+"} Rs. {(txn.amount_pkr || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </div>
      ) : (
        /* ==========================================
           TRANSACTIONS VIEW TAB
           ========================================== */
        <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }} className="container">
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "800" }}>Transaction History</h2>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {transactions.length} total transactions
            </div>
          </div>

          {/* EMI Filters */}
          <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
            <button
              onClick={() => setActiveSourceTab("All")}
              className="btn"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "20px",
                fontSize: "0.85rem",
                background: activeSourceTab === "All" ? "var(--color-indigo)" : "rgba(255,255,255,0.05)",
                color: activeSourceTab === "All" ? "#fff" : "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              All
            </button>
            {Object.keys(sourceCounts).map(source => (
              <button
                key={source}
                onClick={() => setActiveSourceTab(source)}
                className="btn"
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "20px",
                  fontSize: "0.85rem",
                  background: activeSourceTab === source ? "var(--color-indigo)" : "rgba(255,255,255,0.05)",
                  color: activeSourceTab === source ? "#fff" : "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                {source} ({sourceCounts[source]})
              </button>
            ))}
          </div>

          {/* Filtered Transactions List */}
          <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {transactions.filter(t => activeSourceTab === "All" || (t.source || "Unknown") === activeSourceTab).length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                No transactions found for this source.
              </div>
            ) : (
              transactions
                .filter(t => activeSourceTab === "All" || (t.source || "Unknown") === activeSourceTab)
                .map((txn, index) => {
                  const isDebit = txn.direction === "debit";
                  return (
                    <div 
                      key={index} 
                      style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center",
                        padding: "1rem",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,0.01)",
                        borderBottom: "1px solid var(--border-light)"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ 
                          width: "40px", 
                          height: "40px", 
                          borderRadius: "10px", 
                          background: isDebit ? "rgba(244, 63, 94, 0.08)" : "rgba(16, 185, 129, 0.08)",
                          color: isDebit ? "#f43f5e" : "#10b981",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}>
                          {isDebit ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <span style={{ fontWeight: "700", fontSize: "0.95rem" }}>{txn.merchant_name}</span>
                          <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)", alignItems: "center" }}>
                            <span>{txn.source || "Unknown"}</span>
                            <span>•</span>
                            <span>{new Date(txn.date_time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                            {txn.payment_method && (
                              <>
                                <span>•</span>
                                <span>{txn.payment_method}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                        <span style={{ 
                          fontWeight: "800", 
                          fontSize: "1rem",
                          color: isDebit ? "#f43f5e" : "#10b981" 
                        }}>
                          {isDebit ? "-" : "+"} Rs. {(txn.amount_pkr || 0).toLocaleString()}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                          {getCategoryIcon(categorize(txn.merchant_name, txn.direction))}
                          <span>{categorize(txn.merchant_name, txn.direction)}</span>
                        </div>
                      </div>
                    </div>
                  );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
