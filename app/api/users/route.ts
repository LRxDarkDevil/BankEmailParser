import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const LOCAL_DB_PATH = path.join(process.cwd(), "firestore_db.json");
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      return NextResponse.json([]);
    }
    const db = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, "utf-8"));
    const users = Object.values(db.users || {});
    return NextResponse.json(users);
  } catch (e) {
    console.error("Failed to fetch users list:", e);
    return NextResponse.json([]);
  }
}
