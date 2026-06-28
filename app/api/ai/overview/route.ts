import { NextRequest, NextResponse } from "next/server";
import { getUserTransactions, getLastSynced, getCachedAiOverview, saveCachedAiOverview } from "@/lib/db";
import { categorize } from "@/lib/parser/categorizer";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  const role = searchParams.get("role") || "teen"; // "teen" | "parent"
  const force = searchParams.get("force") === "true";

  if (!uid) {
    return NextResponse.json({ error: "Missing uid parameter" }, { status: 400 });
  }

  try {
    // 1. Resolve user profile information (name, email)
    let userName = "Teenager";
    let userEmail = "teen@example.com";

    const LOCAL_DB_PATH = path.join(process.cwd(), "firestore_db.json");
    if (fs.existsSync(LOCAL_DB_PATH)) {
      try {
        const db = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, "utf-8"));
        const user = db.users[uid];
        if (user) {
          userName = user.name;
          userEmail = user.email;
        }
      } catch (e) {
        console.error("Failed to read user info from local DB inside AI Overview:", e);
      }
    }

    // 2. Cache Check: Check if we have a valid cache and the user hasn't synced since
    const lastSynced = await getLastSynced(uid);
    const cached = await getCachedAiOverview(uid);

    if (cached && lastSynced && !force) {
      const lastSyncedTime = new Date(lastSynced).getTime();
      const cachedTime = new Date(cached.timestamp).getTime();
      
      // If cache is newer than last sync time, return it immediately
      if (cachedTime >= lastSyncedTime) {
        return NextResponse.json({ overview: cached.overview, cached: true });
      }
    }

    // 3. Fetch transactions and calculate metrics
    const transactions = await getUserTransactions(uid);
    const validTxns = transactions.filter(t => (t.amount_pkr || 0) > 0);

    const debits = validTxns.filter(t => t.direction === "debit");
    const credits = validTxns.filter(t => t.direction === "credit");

    const totalSpent = debits.reduce((acc, t) => acc + (t.amount_pkr || 0), 0);
    const totalReceived = credits.reduce((acc, t) => acc + (t.amount_pkr || 0), 0);
    const netFlow = totalReceived - totalSpent;

    // Category Breakdown
    const categoryMap: Record<string, number> = {};
    debits.forEach(t => {
      const rawCat = categorize(t.merchant_name, t.direction);
      const cat = rawCat === "Allowance" ? "Transfer" : rawCat;
      categoryMap[cat] = (categoryMap[cat] || 0) + (t.amount_pkr || 0);
    });

    const categoryBreakdown = Object.entries(categoryMap)
      .map(([name, val]) => `${name}: Rs. ${Math.round(val).toLocaleString()}`)
      .join(", ") || "None";

    // Top Merchants
    const merchantSpending: Record<string, number> = {};
    debits.forEach(t => {
      merchantSpending[t.merchant_name] = (merchantSpending[t.merchant_name] || 0) + (t.amount_pkr || 0);
    });
    const topMerchants = Object.entries(merchantSpending)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, val]) => `${name} (Rs. ${Math.round(val).toLocaleString()})`)
      .join(", ") || "None";

    // Late Night Transactions
    const lateNightTxns = debits.filter(t => {
      try {
        const hrs = new Date(t.date_time).getHours();
        return hrs >= 23 || hrs < 5;
      } catch {
        return false;
      }
    });

    // Health Score
    const impulseSpent = debits
      .filter(t => ["Coffee", "Entertainment", "Lifestyle", "Beauty"].includes(categorize(t.merchant_name, t.direction)))
      .reduce((acc, t) => acc + (t.amount_pkr || 0), 0);
    const impulsePct = totalSpent > 0 ? impulseSpent / totalSpent : 0;
    
    let healthScore = Math.round(100 - (impulsePct * 40) - (lateNightTxns.length * 5));
    healthScore = Math.max(10, Math.min(100, healthScore));

    // Alert Flags
    const alerts: string[] = [];
    if (totalReceived > 0 && totalSpent > totalReceived) {
      alerts.push(`Negative Cash Flow (Outflow exceeded credits by Rs. ${Math.abs(netFlow).toLocaleString()})`);
    }
    const largeTxns = debits.filter(t => t.amount_pkr > 2000);
    if (largeTxns.length > 0) {
      alerts.push(`${largeTxns.length} transaction(s) exceeded Rs. 2,000`);
    }
    if (lateNightTxns.length > 0) {
      alerts.push(`${lateNightTxns.length} late-night transaction(s) past 11 PM`);
    }
    if (impulsePct > 0.3) {
      alerts.push(`Impulse purchases account for ${Math.round(impulsePct * 100)}% of total spent`);
    }
    const alertsStr = alerts.join("; ") || "None";

    // Recent Transactions
    const recentTxnsStr = validTxns
      .slice(0, 5)
      .map(t => `${t.direction === "debit" ? "Spent" : "Received"} Rs. ${t.amount_pkr.toLocaleString()} at ${t.merchant_name} on ${new Date(t.date_time).toLocaleDateString()}`)
      .join("; ") || "None";

    // 4. Mistral API Integration
    const apiKey = process.env.MISTRAL_API_KEY;

    if (!apiKey) {
      // Return beautiful demo text if API key is not configured
      const demoText = `### 🤖 AI Overview (Demo Mode)

It looks like the **Mistral AI API Key** is not set up yet. To get personalized, real-time AI summaries of spending habits, please follow these steps:
1. Get a free or pay-as-you-go API key from the [Mistral AI Console](https://console.mistral.ai/).
2. Open your \`.env.local\` file in the project root directory.
3. Add the following line: \`MISTRAL_API_KEY=your_actual_api_key_here\`.
4. Restart your Next.js development server.

---

**What the AI will analyze once configured:**
- **Financial Coaching**: Actionable wealth-building tips tailored to **${userName}**'s unique spending habits.
- **Budgeting Spotlights**: Pointing out key areas where pocket money is draining (e.g. coffee runs or late-night impulse purchases).
- **Habit Health**: Review of the current Health Score (**${healthScore}/100**) with tips on how to improve it.
- **Parental Insights**: Conversation starters and discussion topics to help parents coach their teenagers about money.`;

      return NextResponse.json({ overview: demoText, cached: false, isDemo: true });
    }

    // Prepare prompt based on user role
    let systemPrompt = "";
    let userPrompt = "";

    if (role === "parent") {
      systemPrompt = `You are a professional, friendly AI financial advisor helping a parent understand their teenager's spending habits.
Analyze the teen's transaction data, financial health score, and category metrics, and provide a constructive summary for the parent.
Use a helpful, objective, yet supportive tone. Focus on highlighting good habits, pointing out potential areas of concern (like late-night purchases or high impulse spend), and suggesting helpful talking points for parent-teen conversations.
Keep in mind that the teenager is NOT manually tracking themselves. The app is automatically parsing their Gmail bank alerts for them. Do NOT say things like "Good job tracking their spending" or imply they are manually inputting data. Instead, praise them for connecting their feed to monitor their finances automatically.
Keep in mind that the tracked transactions only come from Gmail bank alerts. It is NOT a complete bank statement. Some income sources, cash allowances, or opening bank balances might be untracked. If you see a negative cash flow (where spending exceeds tracked income), explain calmly that this is likely because some income sources/allowances are not captured by email alerts, rather than the teen being in actual debt or overdrawing.
Keep the response to 3-4 bullet points, using bold markdown text for key numbers or metrics. Avoid jargon. Do NOT mention HTML tags or system logs.
Ensure every bold block starts with exactly '**' and ends with exactly '**'. Do NOT mismatch or nest list symbols like '* *Text**' or '* **Text**'. Start each bullet point directly with a single dash '- ' or asterisk '* ' followed by a space.`;
      
      userPrompt = `Here is the financial data for the teenager named ${userName}:
- Total Tracked Income: Rs. ${totalReceived.toLocaleString()}
- Total Tracked Spending: Rs. ${totalSpent.toLocaleString()}
- Net Cash Flow: Rs. ${netFlow.toLocaleString()}
- Financial Health Score: ${healthScore}/100
- Top Spending Categories: ${categoryBreakdown}
- Top Merchants: ${topMerchants}
- Recent Transactions: ${recentTxnsStr}
- Specific Alerts: ${alertsStr}

Please provide the financial overview for the parent.`;
    } else {
      systemPrompt = `You are a cool, encouraging AI financial coach for teenagers.
Analyze the teen's transaction data and give them a super personalized, fun, and smart overview of their spending.
Address the teen directly by their first name: ${userName.split(" ")[0]}.
Be encouraging, use a positive and modern tone (you can use some emojis!), highlight their wins (e.g. if they have a high health score or surplus cash flow), point out where their pocket money is draining (e.g. too many coffee runs or late-night spending), and give them 2-3 quick, actionable tips to build wealth.
Keep in mind that the teenager is NOT manually tracking themselves. The app is automatically parsing their Gmail bank alerts for them. Do NOT say things like "Good job tracking your spending" or imply they are manually inputting data. Instead, praise them for connecting their feed and using the app to monitor their finances automatically.
Keep in mind that the tracked transactions only come from Gmail bank alerts. It is NOT a complete bank statement. Some of your income, cash allowances, or opening bank balances might be untracked. If you see a negative cash flow (where spending exceeds tracked income), do NOT panic or say you are in debt. Instead, mention that this is likely because some income sources/allowances are untracked, and focus on budgeting what is visible.
Keep it concise: 3-4 bullet points or a couple of short paragraphs, using bold markdown text.
Ensure every bold block starts with exactly '**' and ends with exactly '**'. Do NOT mismatch or nest list symbols like '* *Text**' or '* **Text**'. Start each bullet point directly with a single dash '- ' or asterisk '* ' followed by a space.`;

      userPrompt = `Here is your financial data:
- Total Tracked Income: Rs. ${totalReceived.toLocaleString()}
- Total Tracked Spending: Rs. ${totalSpent.toLocaleString()}
- Net Cash Flow: Rs. ${netFlow.toLocaleString()}
- Financial Health Score: ${healthScore}/100
- Top Spending Categories: ${categoryBreakdown}
- Top Merchants: ${topMerchants}
- Recent Transactions: ${recentTxnsStr}
- Specific Alerts: ${alertsStr}

Please provide my AI overview.`;
    }

    const model = process.env.MISTRAL_MODEL || "mistral-small-latest";
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.message || `Mistral API responded with status ${response.status}`);
    }

    const result = await response.json();
    const overview = result.choices?.[0]?.message?.content || "No overview generated.";

    // 5. Save generated overview in cache
    await saveCachedAiOverview(uid, overview);

    return NextResponse.json({ overview, cached: false });
  } catch (error: any) {
    console.error("AI Overview generation error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate AI overview" }, { status: 500 });
  }
}
