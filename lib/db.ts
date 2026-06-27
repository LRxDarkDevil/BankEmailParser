import fs from "fs";
import path from "path";
// @ts-ignore
import { initializeApp, getApps, getApp } from "firebase/app";
// @ts-ignore
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, query, orderBy } from "firebase/firestore";

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
  picture?: string;
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
const isFirebaseEnabled = !!(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY && 
  (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID)
);

// Server-side initialization using Web SDK
let dbInstance: any = null;
if (isFirebaseEnabled) {
  try {
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
    };

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    dbInstance = getFirestore(app);
  } catch (e) {
    console.error("Firebase SDK initialization failed, falling back to local database:", e);
  }
}

// ==========================================
// DB Operations API
// ==========================================

export async function getUserTransactions(uid: string): Promise<DbTransaction[]> {
  if (dbInstance) {
    try {
      const q = query(
        collection(dbInstance, "users", uid, "transactions"),
        orderBy("date_time", "desc")
      );
      const snap = await getDocs(q);
      
      const txns: DbTransaction[] = [];
      snap.forEach((docSnap: any) => {
        txns.push({ id: docSnap.id, ...docSnap.data() } as DbTransaction);
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
  
  if (dbInstance) {
    try {
      await setDoc(doc(dbInstance, "users", uid, "transactions", txnId), txn);
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

export async function updateUserSyncTime(uid: string, name?: string, email?: string, picture?: string): Promise<void> {
  const now = new Date().toISOString();
  
  if (dbInstance) {
    try {
      await setDoc(doc(dbInstance, "users", uid), {
        lastSynced: now,
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(picture ? { picture } : {}),
      }, { merge: true });
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
      picture: picture || undefined,
    };
  }
  db.users[uid].lastSynced = now;
  if (name) db.users[uid].name = name;
  if (email) db.users[uid].email = email;
  if (picture) db.users[uid].picture = picture;
  writeLocalDb(db);
}

/**
 * Updates user profile info (name, email, picture) WITHOUT modifying lastSynced.
 * Use this for page loads / GET requests so we don't overwrite the actual sync time.
 */
export async function updateUserProfile(uid: string, name?: string, email?: string, picture?: string): Promise<void> {
  if (dbInstance) {
    try {
      await setDoc(doc(dbInstance, "users", uid), {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(picture ? { picture } : {}),
      }, { merge: true });
      return;
    } catch (e) {
      console.error("Firestore update user profile failed, using local DB:", e);
    }
  }

  // Fallback — update fields without touching lastSynced
  const db = readLocalDb();
  if (!db.users[uid]) {
    db.users[uid] = {
      uid,
      name: name || "User",
      email: email || "user@example.com",
      createdAt: new Date().toISOString(),
      picture: picture || undefined,
    };
  } else {
    if (name) db.users[uid].name = name;
    if (email) db.users[uid].email = email;
    if (picture) db.users[uid].picture = picture;
  }
  writeLocalDb(db);
}

export async function getLastSynced(uid: string): Promise<string | null> {
  if (dbInstance) {
    try {
      const snap = await getDoc(doc(dbInstance, "users", uid));
      if (snap.exists()) {
        return snap.data().lastSynced || null;
      }
    } catch (e) {
      console.error("Firestore get last sync failed, using local DB:", e);
    }
  }

  // Fallback
  const db = readLocalDb();
  return db.users[uid]?.lastSynced || null;
}

export async function getAllUsers(): Promise<DbUser[]> {
  if (dbInstance) {
    try {
      const snap = await getDocs(collection(dbInstance, "users"));
      const users: DbUser[] = [];
      snap.forEach((docSnap: any) => {
        users.push({ uid: docSnap.id, ...docSnap.data() } as DbUser);
      });
      return users;
    } catch (e) {
      console.error("Firestore get all users failed, using local DB:", e);
    }
  }

  // Fallback
  const db = readLocalDb();
  return Object.values(db.users || {});
}
