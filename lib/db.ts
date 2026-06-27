import fs from "fs";
import path from "path";

// Define the transaction shape
export interface DbTransaction {
  id: string;
  date_time: string;
  source: string;
  merchant_name: string;
  amount_pkr: number;
  direction: "debit" | "credit" | "info";
  payment_method?: string;
  category: string;
  raw_notification: string;
}

export interface DbUser {
  uid: string;
  name: string;
  email: string;
  createdAt: string;
  lastSynced?: string;
}

// Local mock database JSON structure
interface LocalSchema {
  users: Record<string, DbUser>;
  transactions: Record<string, Record<string, DbTransaction>>;
}

const LOCAL_DB_PATH = path.join(process.cwd(), "firestore_db.json");

// Helper to read local JSON file
function readLocalDb(): LocalSchema {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      return { users: {}, transactions: {} };
    }
    const raw = fs.readFileSync(LOCAL_DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read local DB:", e);
    return { users: {}, transactions: {} };
  }
}

// Helper to write local JSON file
function writeLocalDb(data: LocalSchema) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write local DB:", e);
  }
}

// Firebase Detection
const isFirebaseEnabled = 
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY && 
  process.env.FIREBASE_PROJECT_ID;

// Server-side initialization
let adminFirestore: any = null;
if (typeof window === "undefined" && isFirebaseEnabled) {
  try {
    const admin = require("firebase-admin");
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Handle private key newlines correctly
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
    }
    adminFirestore = admin.firestore();
  } catch (e) {
    console.error("Firebase Admin initialization failed, falling back to local database:", e);
  }
}

// ==========================================
// DB Operations API
// ==========================================

export async function getUserTransactions(uid: string): Promise<DbTransaction[]> {
  if (adminFirestore) {
    try {
      const snap = await adminFirestore
        .collection("users")
        .doc(uid)
        .collection("transactions")
        .orderBy("date_time", "desc")
        .get();
      
      const txns: DbTransaction[] = [];
      snap.forEach((doc: any) => {
        txns.push({ id: doc.id, ...doc.data() } as DbTransaction);
      });
      return txns;
    } catch (e) {
      console.error("Firestore get transactions failed, using local DB:", e);
    }
  }

  // Fallback
  const db = readLocalDb();
  const userTxns = db.transactions[uid] || {};
  return Object.values(userTxns).sort(
    (a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime()
  );
}

export async function saveTransaction(uid: string, txn: Omit<DbTransaction, "id"> & { id?: string }): Promise<boolean> {
  const txnId = txn.id || Math.random().toString(36).substring(2, 15);
  
  if (adminFirestore) {
    try {
      await adminFirestore
        .collection("users")
        .doc(uid)
        .collection("transactions")
        .doc(txnId)
        .set(txn);
      return true;
    } catch (e) {
      console.error("Firestore save transaction failed, using local DB:", e);
    }
  }

  // Fallback
  const db = readLocalDb();
  if (!db.transactions[uid]) {
    db.transactions[uid] = {};
  }
  db.transactions[uid][txnId] = { ...txn, id: txnId };
  writeLocalDb(db);
  return true;
}

export async function updateUserSyncTime(uid: string, name?: string, email?: string): Promise<void> {
  const now = new Date().toISOString();
  
  if (adminFirestore) {
    try {
      await adminFirestore.collection("users").doc(uid).set(
        {
          lastSynced: now,
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
        },
        { merge: true }
      );
      return;
    } catch (e) {
      console.error("Firestore update sync time failed, using local DB:", e);
    }
  }

  // Fallback
  const db = readLocalDb();
  if (!db.users[uid]) {
    db.users[uid] = {
      uid,
      name: name || "User",
      email: email || "user@example.com",
      createdAt: now,
    };
  }
  db.users[uid].lastSynced = now;
  if (name) db.users[uid].name = name;
  if (email) db.users[uid].email = email;
  writeLocalDb(db);
}

export async function getLastSynced(uid: string): Promise<string | null> {
  if (adminFirestore) {
    try {
      const doc = await adminFirestore.collection("users").doc(uid).get();
      if (doc.exists) {
        return doc.data().lastSynced || null;
      }
    } catch (e) {
      console.error("Firestore get last sync failed, using local DB:", e);
    }
  }

  // Fallback
  const db = readLocalDb();
  return db.users[uid]?.lastSynced || null;
}
