"use client";

import { useEffect, useState } from "react";
import { Mail, Shield, Users, ArrowRight, Wallet, TrendingUp, AlertTriangle } from "lucide-react";
import { getParentPin } from "@/lib/security";

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  lastSynced?: string;
}

export default function Home() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [selectedParentUser, setSelectedParentUser] = useState<string>("");
  const [parentPinInput, setParentPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    // Read query parameters for errors
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const msg = params.get("msg");

    if (err) {
      if (err === "exchange_failed") {
        setErrorMsg(`Failed to exchange Google OAuth code: ${msg || "Unknown error"}`);
      } else if (err === "missing_code") {
        setErrorMsg("OAuth authorization code was not returned by Google.");
      } else {
        setErrorMsg(`Authentication failed: ${err}`);
      }
    }

    // Fetch existing registered users
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        setUsersList(data);
        if (data.length > 0) {
          setSelectedParentUser(data[0].uid);
        }
      })
      .catch((err) => console.error("Error loading users:", err));
  }, []);

  const handleVerifyAndRedirect = () => {
    setPinError(null);
    if (!selectedParentUser) return;
    const correctPin = getParentPin(selectedParentUser);
    if (parentPinInput === correctPin) {
      window.location.href = `/parent?uid=${selectedParentUser}&pin=${parentPinInput}`;
    } else {
      setPinError("Incorrect Parent Access PIN. Ask your teen for their dashboard PIN.");
    }
  };

  return (
    <main className="container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "2rem 0" }}>
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", borderRadius: "100px", background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)", color: "var(--color-indigo)", fontSize: "0.85rem", fontWeight: "600", marginBottom: "1rem" }}>
          <Shield size={14} />
          YouthPay Financial Intelligence Engine
        </div>
        <h1 style={{ fontSize: "3rem", fontWeight: "800", letterSpacing: "-0.025em", marginBottom: "1rem" }}>
          Your teen's financial life, <br/>
          <span style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            finally visible.
          </span>
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
          Automatically ingest transaction notifications from Gmail, parse them into structured metrics, and view real-time pocket money intelligence.
        </p>

        {errorMsg && (
          <div className="badge badge-danger" style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.75rem", 
            padding: "1rem", 
            borderRadius: "12px",
            textTransform: "none",
            letterSpacing: "normal",
            fontSize: "0.85rem",
            marginTop: "2rem",
            maxWidth: "600px",
            margin: "2rem auto 0 auto"
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem", maxWidth: "900px", margin: "0 auto", width: "100%" }}>
        {/* Teen Portal */}
        <div className="glass-card" style={{ padding: "2.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ width: "48px", height: "48px", background: "rgba(99, 102, 241, 0.1)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem", color: "var(--color-indigo)" }}>
              <Wallet size={24} />
            </div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "0.75rem" }}>I'm a Teenager</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.6", marginBottom: "2rem" }}>
              Connect your Gmail to sync bank transaction notifications. Get pocket money charts, weekly spending logs, and cheekily smart spending insights.
            </p>
          </div>

          <div>
            <a href="/api/auth/google" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", gap: "0.5rem" }}>
              <Mail size={18} />
              Connect Gmail & Login
              <ArrowRight size={16} />
            </a>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "center" }}>
              <span className="supported-item">NayaPay</span>
              <span className="supported-item">Easypaisa</span>
              <span className="supported-item">ABL</span>
              <span className="supported-item">Meezan</span>
              <span className="supported-item">HBL</span>
            </div>
          </div>
        </div>

        {/* Parent Portal */}
        <div className="glass-card" style={{ padding: "2.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ width: "48px", height: "48px", background: "rgba(168, 85, 247, 0.1)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem", color: "#a855f7" }}>
              <Users size={24} />
            </div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "0.75rem" }}>I'm a Parent</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.6", marginBottom: "2rem" }}>
              Monitor your teen's allowance allocations and spending categories. View simple horizontal metrics, security risk alerts, and a plain-language feed of purchases.
            </p>
          </div>

          <div>
            {usersList.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>SELECT TEENAGER ACCOUNT</label>
                  <select 
                    value={selectedParentUser} 
                    onChange={(e) => setSelectedParentUser(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-light)",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem"
                    }}
                  >
                    {usersList.map((user) => (
                      <option key={user.uid} value={user.uid} style={{ background: "#111" }}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>PARENT ACCESS PIN (4-DIGITS)</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={parentPinInput}
                    onChange={(e) => {
                      setParentPinInput(e.target.value);
                      setPinError(null);
                    }}
                    placeholder="Enter 4-digit PIN"
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-light)",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem"
                    }}
                  />
                </div>
                {pinError && <span style={{ color: "#f43f5e", fontSize: "0.8rem" }}>{pinError}</span>}
                <button 
                  onClick={handleVerifyAndRedirect} 
                  className="btn btn-secondary" 
                  style={{ width: "100%", justifyContent: "center", gap: "0.5rem", border: "1px solid #a855f7", color: "#d8b4fe" }}
                >
                  <TrendingUp size={18} />
                  View Teen Financials
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div style={{ 
                padding: "1rem", 
                borderRadius: "8px", 
                background: "rgba(255,255,255,0.01)", 
                border: "1px dashed var(--border-light)", 
                textAlign: "center", 
                fontSize: "0.85rem",
                color: "var(--text-muted)" 
              }}>
                No teenager accounts connected yet. Please connect a Gmail account first to view parent dashboard.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: "4rem", fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center" }}>
        <span>🔐 Privacy Pledge: We only read transaction alerts matching supported Pakistani banking entities. All other emails are ignored.</span>
      </div>
    </main>
  );
}
