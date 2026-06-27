import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { parseEmail } from "@/lib/parser";
import { getUserTransactions, saveTransaction, updateUserSyncTime } from "@/lib/db";
import { isDuplicate } from "@/lib/parser/deduplicator";

// Helper to decode base64url
function decodeBase64Url(data: string): string {
  if (!data) return "";
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

// Helper to extract body text from Gmail message payload
function getMessageBody(payload: any): { plain: string; html: string } {
  let plain = "";
  let html = "";

  if (!payload) return { plain, html };

  if (payload.body && payload.body.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      html = decoded;
    } else {
      plain = decoded;
    }
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const partBody = getMessageBody(part);
      if (partBody.plain) plain += (plain ? "\n" : "") + partBody.plain;
      if (partBody.html) html += (html ? "\n" : "") + partBody.html;
    }
  }

  return { plain, html };
}

export async function POST(request: NextRequest) {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.NEXT_PUBLIC_REDIRECT_URI;

  const accessCookie = request.cookies.get("gmail_access_token")?.value;
  const refreshCookie = request.cookies.get("gmail_refresh_token")?.value;

  if (!accessCookie && !refreshCookie) {
    return NextResponse.json({ error: "Unauthorized: No credentials" }, { status: 401 });
  }

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uri
  );

  let response: NextResponse | null = null;
  let activeAccessToken = accessCookie;

  // Refresh access token if it is expired/missing
  if (!activeAccessToken && refreshCookie) {
    try {
      oauth2Client.setCredentials({ refresh_token: refreshCookie });
      const { credentials } = await oauth2Client.refreshAccessToken();
      activeAccessToken = credentials.access_token || undefined;

      if (activeAccessToken) {
        response = NextResponse.next();
        response.cookies.set("gmail_access_token", activeAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: credentials.expiry_date ? Math.floor((credentials.expiry_date - Date.now()) / 1000) : 3600,
          path: "/",
        });
      }
    } catch (err) {
      console.error("Failed to refresh access token:", err);
      return NextResponse.json({ error: "Authentication expired. Please connect again." }, { status: 401 });
    }
  }

  if (!activeAccessToken) {
    return NextResponse.json({ error: "Unauthorized: Session expired" }, { status: 401 });
  }

  oauth2Client.setCredentials({ access_token: activeAccessToken });

  try {
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });

    // Fetch user profile email to derive unique User ID
    let userEmail = "anonymous@gmail.com";
    let userName = "YouthPay User";
    try {
      const userInfo = await oauth2.userinfo.get();
      userEmail = userInfo.data.email || "anonymous@gmail.com";
      userName = userInfo.data.name || "YouthPay User";
    } catch (e) {
      console.error("Error fetching user info:", e);
    }
    const uid = userEmail.replace(/[^a-zA-Z0-9]/g, "_");

    // Fetch existing transactions from DB to run deduplication
    const existingTransactions = await getUserTransactions(uid);

    // Gmail search query focusing on supported bank transactions
    const query = "from:(nayapay.com OR telenorbank.pk OR abl.com OR meezanbank.com OR hbl.com) (PKR OR Rs OR spent OR received OR sent OR transfer OR alert OR transaction OR payment OR debit OR credit)";

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
    });

    const messages = listRes.data.messages || [];
    const newTxnsSynced = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      
      const detailRes = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const data = detailRes.data;
      const headers = data.payload?.headers || [];
      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "(No Subject)";
      const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "Unknown Sender";
      const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

      const bodyData = getMessageBody(data.payload);
      let bodyText = bodyData.plain || bodyData.html.replace(/<[^>]*>/g, "\n");
      bodyText = bodyText
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      bodyText = bodyText.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

      // Parse email content using bank specific logic
      const parsed = parseEmail(from, subject, bodyText, date);
      if (parsed) {
        // Run deduplication check
        const duplicate = isDuplicate(
          [...existingTransactions, ...newTxnsSynced],
          parsed.amount_pkr,
          parsed.merchant_name,
          parsed.source,
          parsed.date_time
        );

        if (!duplicate) {
          const txnRecord = {
            date_time: parsed.date_time,
            source: parsed.source,
            merchant_name: parsed.merchant_name,
            amount_pkr: parsed.amount_pkr,
            direction: parsed.direction,
            payment_method: parsed.payment_method || parsed.source,
            category: parsed.category,
            raw_notification: parsed.raw_notification,
          };
          
          await saveTransaction(uid, txnRecord);
          newTxnsSynced.push(txnRecord);
        }
      }
    }

    // Update user record with last sync time
    await updateUserSyncTime(uid, userName, userEmail);

    // Fetch the final list of transactions to return to the dashboard
    const finalTransactionsList = await getUserTransactions(uid);

    const payload = {
      email: userEmail,
      name: userName,
      uid: uid,
      transactions: finalTransactionsList,
      newSyncedCount: newTxnsSynced.length
    };

    if (response) {
      // If we initialized a response to set cookies, we copy the data to it
      const finalRes = NextResponse.json(payload, {
        headers: response.headers
      });
      // Copy cookies over
      finalRes.cookies.set("gmail_access_token", activeAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 3600,
        path: "/",
      });
      return finalRes;
    }

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Gmail ingestion and sync error:", error);
    return NextResponse.json({ error: error.message || "Failed to sync transaction data" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.NEXT_PUBLIC_REDIRECT_URI;

  const accessCookie = request.cookies.get("gmail_access_token")?.value;
  const refreshCookie = request.cookies.get("gmail_refresh_token")?.value;

  if (!accessCookie && !refreshCookie) {
    return NextResponse.json({ error: "Unauthorized: No credentials" }, { status: 401 });
  }

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uri
  );

  let response: NextResponse | null = null;
  let activeAccessToken = accessCookie;

  if (!activeAccessToken && refreshCookie) {
    try {
      oauth2Client.setCredentials({ refresh_token: refreshCookie });
      const { credentials } = await oauth2Client.refreshAccessToken();
      activeAccessToken = credentials.access_token || undefined;
      if (activeAccessToken) {
        response = NextResponse.next();
      }
    } catch (err) {
      return NextResponse.json({ error: "Authentication expired. Please connect again." }, { status: 401 });
    }
  }

  if (!activeAccessToken) {
    return NextResponse.json({ error: "Unauthorized: Session expired" }, { status: 401 });
  }

  oauth2Client.setCredentials({ access_token: activeAccessToken });

  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    let userEmail = "anonymous@gmail.com";
    let userName = "YouthPay User";
    try {
      const userInfo = await oauth2.userinfo.get();
      userEmail = userInfo.data.email || "anonymous@gmail.com";
      userName = userInfo.data.name || "YouthPay User";
    } catch (e) {
      console.error("Error fetching user info in GET:", e);
    }
    
    const uid = userEmail.replace(/[^a-zA-Z0-9]/g, "_");
    const transactionsList = await getUserTransactions(uid);

    const payload = {
      email: userEmail,
      name: userName,
      uid: uid,
      transactions: transactionsList,
    };

    if (response) {
      const finalRes = NextResponse.json(payload);
      finalRes.cookies.set("gmail_access_token", activeAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 3600,
        path: "/",
      });
      return finalRes;
    }

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Gmail load saved transactions error:", error);
    return NextResponse.json({ error: error.message || "Failed to load transactions" }, { status: 500 });
  }
}

