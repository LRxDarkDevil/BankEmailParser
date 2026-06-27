import { NextRequest, NextResponse } from "next/server";
import { getUserTransactions, getLastSynced } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");

  if (!uid) {
    return NextResponse.json({ error: "Missing uid parameter" }, { status: 400 });
  }

  try {
    // Read the user information (name, email) from local DB or simulate it
    let userName = "Teenager";
    let userEmail = "teen@example.com";
    let lastSynced = "";

    const LOCAL_DB_PATH = path.join(process.cwd(), "firestore_db.json");
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const db = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, "utf-8"));
      const user = db.users[uid];
      if (user) {
        userName = user.name;
        userEmail = user.email;
        lastSynced = user.lastSynced || "";
      }
    }

    const transactionsList = await getUserTransactions(uid);

    return NextResponse.json({
      uid,
      name: userName,
      email: userEmail,
      lastSynced,
      transactions: transactionsList
    });
  } catch (error: any) {
    console.error("Failed to load parent transactions:", error);
    return NextResponse.json({ error: error.message || "Failed to load transactions" }, { status: 500 });
  }
}
