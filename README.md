# ⚡ YouthPay — Financial Intelligence Engine

YouthPay is a smart, privacy-centric pocket money intelligence engine designed specifically for Pakistani teenagers and parents. It automatically ingests banking transaction notifications from Gmail, parses them into clean structured data, categorizes them using lightweight rules, and produces live dashboards with pocket money analytics, financial safety alerts, and activity feeds.

---

## 🚀 Key Features

*   **Zero Manual Logging**: Integrates securely with Google OAuth to ingest transaction alert emails from Gmail.
*   **Dual Portal Access**:
    *   **Teen Dashboard**: Detailed category breakdown (donut chart), weekly spending trends, store affinity insights, and an automated financial wellness health score.
    *   **Secure Parent Portal**: Access secured by a 4-digit PIN generated from the teen's dashboard, displaying safety flags (late-night transactions, large transaction warnings, budget deficits) and a plain-language feed of purchases.
*   **Pakistani Fintech Support**: Ingestion rules built specifically for popular Pakistani banks and EMIs (NayaPay, Easypaisa, Meezan Bank, Allied Bank (ABL), HBL, and SadaPay).
*   **Stunning Dual-Theme UI**: Built with a custom dark-glass and premium light-theme design system, featuring fluid animations, responsive layouts, and a dynamic toggle.

---

## 🛠️ Technology Stack

*   **Framework**: Next.js 15 (App Router, React Server/Client Components, API Route Handlers)
*   **Styling**: Modern CSS Variables with custom design tokens for glassmorphism, depth, and theme-switching transitions.
*   **Authentication & APIs**: Google OAuth 2.0 & Google Gmail API Client (`googleapis`)
*   **Database**: Local JSON storage (`firestore_db.json`) simulating a real-time Firestore collection for fast, zero-dependency development.

---

## 📁 Project Structure

```bash
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── callback/route.ts      # Exchanging OAuth code for tokens
│   │   │   ├── google/route.ts        # Initiating Google OAuth consent screen
│   │   │   └── logout/route.ts        # Server-side httpOnly cookie invalidation
│   │   ├── gmail/sync/route.ts        # Gmail transaction query and parse sync
│   │   ├── parent/transactions/       # Secure endpoint for parent dashboards
│   │   └── users/route.ts             # Registered teen account directories
│   ├── components/
│   │   └── ThemeToggle.tsx            # Sun/Moon switch component
│   ├── dashboard/
│   │   └── page.tsx                   # Teenager Dashboard & charts
│   ├── parent/
│   │   └── page.tsx                   # Parent Dashboard with Safety Flags
│   ├── globals.css                    # Custom responsive design system variables
│   ├── layout.tsx                     # FOUC theme loader script
│   └── page.tsx                       # Landing page with portal selects
├── lib/
│   ├── db/index.ts                    # User and transaction records read/write
│   ├── parser/
│   │   ├── index.ts                   # Core text pattern-matching engine
│   │   ├── categorizer.ts             # Rules-based categorizer (Food, Utilities, etc.)
│   │   └── deduplicator.ts            # Duplicate transaction check (amount/date/merchant)
│   └── security/index.ts              # Teen access and parent PIN generation
```

---

## ⚙️ Getting Started

### 1. Prerequisites
*   Node.js (v18.x or above)
*   Google Cloud Console Project with OAuth 2.0 credentials and the **Gmail API** enabled.

### 2. Environment Setup
Create a `.env.local` file in the root directory:

```env
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
NEXT_PUBLIC_REDIRECT_URI="http://localhost:3000/api/auth/callback"
```

*Ensure your Google Console project has `http://localhost:3000/api/auth/callback` configured as an **Authorized Redirect URI**.*

### 3. Installation
Install the project dependencies:
```bash
npm install
```

### 4. Running the Development Server
Run the local next server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧠 Core Engineering Logic

### Rule-Based Parser & Ingestion
The Gmail query targets specific bank alerts:
`from:(nayapay.com OR telenorbank.pk OR abl.com OR meezanbank.com OR hbl.com) (PKR OR Rs OR spent OR received OR sent OR transfer OR alert)`
It parses email structures using regexes looking for:
*   Amount in PKR
*   Merchant/Beneficiary Name
*   Transaction Date/Time
*   Inflow/Outflow direction (credit vs. debit)

### Deduplication Check
To prevent identical transaction logging on re-runs, a compound match evaluates:
1. Exact amount
2. Merchant Name
3. Source Bank
4. Time window variance (within 60 seconds)

### Financial Wellness Formula
Teens start with a score of `100`. Deductions are made dynamically:
*   `-0.4` points per percentage point of total budget spent on *impulse categories* (Coffee, Lifestyle, Entertainment).
*   `-5` points for every transaction logged during late-night hours (`11:00 PM - 5:00 AM`).
*   Clamped to a minimum score of `10` and maximum of `100`.

---

## 🔐 Privacy & Security

*   **Read-Only Scope**: Requesting only the `gmail.readonly` permission scope.
*   **Whitelisting**: Gmail ingestion ignores all emails not originating from verified Pakistani bank domains.
*   **Secure Cookies**: Session tokens are stored in `httpOnly` cookies, preventing cross-site scripting (XSS) extraction. Local host development automatically disables the `secure` flag to avoid cookie drop on unencrypted HTTP.
*   **Parent Verification**: The parent access PIN is derived cryptographically from the teen's User ID (`uid`) and can only be shared by the teenager directly from their dashboard.
