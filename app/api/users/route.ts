import { NextResponse } from "next/server";
import { getAllUsers } from "@/lib/db";

export async function GET() {
  try {
    const users = await getAllUsers();
    return NextResponse.json(users);
  } catch (e) {
    console.error("Failed to fetch users list:", e);
    return NextResponse.json([]);
  }
}
