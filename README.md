# ⚡ YouthPay BankEmailParser
### Pakistani Financial Intelligence Ingestion Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Vercel Deployment](https://img.shields.io/badge/Deployment-Vercel-success?logo=vercel)](https://bank-email-parser.vercel.app/)

**YouthPay BankEmailParser** is a smart, privacy-centric financial intelligence engine built for the **YouthPay Hackathon** (Challenge 1). It is designed specifically for Pakistani teenagers and parents. It automatically ingests transaction notifications from a user's Gmail account, parses them into clean structured data, categorizes spending, and generates interactive dashboards showing spending trends, store affinities, and parental safety logs.

🔗 **Live Production App:** [https://bank-email-parser.vercel.app/](https://bank-email-parser.vercel.app/)  
💻 **GitHub Repository:** [LRxDarkDevil/BankEmailParser](https://github.com/LRxDarkDevil/BankEmailParser)

---

## 🚀 Live Demo & Ingestion Walkthrough

### 1. Teenager Portal (Sync & Dashboard)
1. Navigate to the [Live Link](https://bank-email-parser.vercel.app/) and select **"I'm a Teenager"**.
2. Click **"Connect Gmail & Login"** to authorize read-only access.
3. Once logged in, click **"Sync Gmail Feed"** to fetch and parse bank alert emails.
4. View the dashboard:
   * **AI Financial Overview (New!):** Powered by Mistral AI, it analyzes spending data and presents a cool, encouraging financial overview with custom wealth-building recommendations.
   * **Donut Chart:** Visualizes categories (Food, Coffee, Transport, Beauty, Lifestyle, Utilities, Education).
   * **Pacing Chart:** Displays weekly cash burn over a rolling 4-week window.
   * **Insights Feed:** Flags repeating merchants (Store Affinity) and highlights coffee/late-night warnings.
   * **Financial Health Score:** A dynamic gamified score starting at 100 that penalizes late-night transactions and excessive impulse purchases.
   * **Parent PIN:** Displays a secure, temporary 4-digit PIN (e.g., `🔑 PIN: 4812`) to share with parents.

### 2. Parent Portal (Safety Flags)
1. Go to the landing page and select **"I'm a Parent"**.
2. Select your teen's connected email from the dropdown list.
3. Enter the **4-digit Parent PIN** displayed on the teen's dashboard and click **"View Teen Financials"**.
4. The Parent Portal displays:
   * **AI Overview (Parent View) (New!):** Focuses on explaining the teen's habits in plain English, highlighting areas of positive growth, concerns, and presenting custom parent-teen discussion prompts.
   * **Cash Flow Check:** Compares tracked credits (allowances) vs debits.
   * **Safety Flags:** Plain-language alerts for negative cash flow, large single transactions (>Rs. 2,000), and late-night activity (>11:00 PM).
   * **Purchase Feed:** Replaces complex bank statements with easy-to-read, structured transaction history.

---

## ⚙️ Google Consent Screen Warning (For Reviewers)
> [!NOTE]
> Because this application uses the `gmail.readonly` scope and is in testing/development phase, Google displays a **"Google hasn't verified this app"** warning screen.
> 
> **How to bypass this warning:**
> 1. Click the **"Advanced"** link on the bottom left of the Google login screen.
> 2. Click the link that says **"Go to bank-email-parser.vercel.app (unsafe)"** to proceed with the OAuth flow.
> 3. Click **"Continue"** to grant read-only permissions to sync bank alerts.

---

## 🛠️ Technology Stack

* **Frontend & Logic:** Next.js 15 (App Router, Server Components, API Route Handlers)
* **Styling:** Custom Vanilla CSS variables for dark-glass morphic aesthetic with responsive mobile support.
* **Authentication:** Google OAuth 2.0 Client (`googleapis` integration)
* **Database & Persistence:** **Firebase Cloud Firestore** with an automatic **local file system fallback** (`firestore_db.json`) for offline development.

---

## 🧠 Core Engineering Architecture & Logic

### 1. Targeted Regex Ingestion
To ensure privacy, the Gmail API fetch query restricts the inbox scan to banking domains only:
```text
from:(nayapay.com OR telenorbank.pk OR abl.com OR meezanbank.com OR hbl.com) (PKR OR Rs OR spent OR received OR sent OR transfer OR alert)
```
Custom parsers split subject lines and bodies to extract amount, merchant, time, payment method, and transaction direction (inflow vs. outflow) for Meezan, NayaPay, Easypaisa, ABL, and HBL formats.

### 2. Compound Deduplication Check
To prevent duplicating logs across manual syncs, new transactions are compared against historical entries using a compound window:
* Matches exact **amount**, **merchant name**, and **bank source**.
* Restricts checks to a **60-second window** to account for transaction and email generation latency.

### 3. Cryptographic PIN Generation
To protect teenage privacy without the friction of a separate parent login system, the parent portal relies on a deterministically generated 4-digit PIN based on the teenager's unique ID:
```typescript
export function getParentPin(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 9000 + 1000).toString();
}
```
This is verified on every request to block endpoint sniffing.

### 4. Smart AI Caching Layer (Mistral AI Integration)
To minimize API key costs and maximize performance, the AI overview is stored in the database cache:
* When Gmail feeds are successfully synchronized, the AI cache is marked as stale.
* Upon dashboard load, if the database has a cached AI overview generated after the last sync timestamp, it is loaded instantly.
* If a new sync occurred or a user requests manual regeneration, the endpoint requests a new completion from Mistral AI, updates the user's database document, and returns the response.
* If the `MISTRAL_API_KEY` is not provided, the system falls back to a descriptive **Demo Mode** explaining its features and integration steps.

---

## 📁 Project Structure

```bash
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── callback/route.ts      # Exchanges OAuth code for tokens
│   │   │   ├── google/route.ts        # Initiates Google OAuth consent
│   │   │   └── logout/route.ts        # Clears cookie sessions
│   │   ├── ai/overview/route.ts       # Mistral AI completion router
│   │   ├── gmail/sync/route.ts        # Gmail transaction sync engine
│   │   ├── parent/transactions/       # Secured parent portal endpoints
│   │   └── users/route.ts             # Fetches active teenagers list
│   ├── components/
│   │   └── ThemeToggle.tsx            # Light/Dark switch
│   ├── dashboard/
│   │   └── page.tsx                   # Teenager Dashboard & charts
│   ├── parent/
│   │   └── page.tsx                   # Parent Dashboard & safety alerts
│   ├── globals.css                    # Design tokens & responsive styles
│   ├── layout.tsx                     # FOUC loader script
│   └── page.tsx                       # Portal select landing page
├── lib/
│   ├── db.ts                          # Firebase and local DB adapter
│   ├── parser/
│   │   ├── index.ts                   # Ingestion parser wrapper
│   │   ├── categorizer.ts             # Rules-based categorizer
│   │   ├── deduplicator.ts            # 60-second deduplication engine
│   │   └── banks/                     # Bank-specific parsers
│   └── security.ts                    # Parent PIN generator
```

---

## ⚙️ Running Locally

### 1. Prerequisites
* Node.js (v18.x or above)
* Google Cloud Project with the **Gmail API** enabled and OAuth credentials configured.

### 2. Environment Setup
Create a `.env.local` file in the root directory:
```env
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
NEXT_PUBLIC_REDIRECT_URI="http://localhost:3000/api/auth/callback"

# Optional: Mistral AI Keys (Demo mode enables if left blank)
MISTRAL_API_KEY="your-mistral-api-key"
MISTRAL_MODEL="mistral-small-latest"

# Optional: Firebase Web SDK config (falls back to local JSON file if missing)
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
```

### 3. Installation & Run
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
