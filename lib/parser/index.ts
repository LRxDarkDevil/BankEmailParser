import * as abl from "./banks/abl";
import * as nayapay from "./banks/nayapay";
import * as easypaisa from "./banks/easypaisa";
import * as meezan from "./banks/meezan";
import * as hbl from "./banks/hbl";
import { categorize } from "./categorizer";

export interface Transaction {
  id?: string;
  date_time: string;
  source: string; // "NayaPay" | "JazzCash" | "SadaPay" | "ABL" | "Meezan Bank" | "HBL"
  merchant_name: string;
  amount_pkr: number;
  direction: "debit" | "credit" | "info";
  payment_method?: string;
  category: string;
  raw_notification: string;
}

function parseMonth(monthStr: string): string | null {
  const months: Record<string, string> = {
    jan: "01", january: "01",
    feb: "02", february: "02",
    mar: "03", march: "03",
    apr: "04", april: "04",
    may: "05",
    jun: "06", june: "06",
    jul: "07", july: "07",
    aug: "08", august: "08",
    sep: "09", september: "09",
    oct: "10", october: "10",
    nov: "11", november: "11",
    dec: "12", december: "12"
  };
  return months[monthStr.toLowerCase()] || null;
}

export function normalizeDate(dateStr: string): string | null {
  try {
    let clean = dateStr.replace(/\s+/g, " ").replace(/,/g, "").trim();
    // Remove day of week (e.g. Sunday, Tuesday)
    clean = clean.replace(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+/i, "");

    // 1. Check for DD-MM-YYYY HH:mm:ss (HBL style)
    // E.g. "18-05-2026 09:18:54"
    const hblMatch = clean.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (hblMatch) {
      const [, d, m, y, h, min, s] = hblMatch;
      return `${y}-${m}-${d}T${h}:${min}:${s}`;
    }

    // 2. Check for DD-MM-YYYY HH:mm (e.g. without seconds)
    const hblShortMatch = clean.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (hblShortMatch) {
      const [, d, m, y, h, min] = hblShortMatch;
      return `${y}-${m}-${d}T${h}:${min}:00`;
    }

    // 3. Check for DD-MMM-YYYY HH:mm (Meezan style)
    // E.g. "10-Jun-2026 17:22"
    const meezanMatch = clean.match(/^(\d{1,2})-([a-zA-Z]{3,9})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (meezanMatch) {
      const [, d, mStr, y, h, min] = meezanMatch;
      const m = parseMonth(mStr);
      if (m) {
        return `${y}-${m}-${d.padStart(2, "0")}T${h}:${min}:00`;
      }
    }

    // 4. Check for ABL styles containing "at"
    // E.g. "14-Jun-2026 at 02:29 PM" or "16 Jun 2026 at 4:14PM"
    if (clean.includes(" at ")) {
      const parts = clean.split(/\s+at\s+/i);
      const datePart = parts[0].trim();
      const timePart = parts[1].trim();

      // Parse Date Part
      let y = "", m = "", d = "", mStr = "";
      const d1 = datePart.match(/^(\d{1,2})-([a-zA-Z]{3,9})-(\d{4})$/);
      const d2 = datePart.match(/^(\d{1,2})\s+([a-zA-Z]{3,9})\s+(\d{4})$/);

      if (d1) {
        [, d, mStr, y] = d1;
        m = parseMonth(mStr) || "";
      } else if (d2) {
        [, d, mStr, y] = d2;
        m = parseMonth(mStr) || "";
      }

      // Parse Time Part (e.g. 02:29 PM, 4:14PM)
      const tMatch = timePart.match(/^(\d{1,2}):(\d{2})(?:\s*|:(\d{2})\s*)(AM|PM)$/i);
      if (y && m && d && tMatch) {
        const [, hrsStr, min, secStr = "00", ampm] = tMatch;
        let hrs = parseInt(hrsStr);
        if (ampm.toUpperCase() === "PM" && hrs < 12) hrs += 12;
        if (ampm.toUpperCase() === "AM" && hrs === 12) hrs = 0;
        
        return `${y}-${m}-${d.padStart(2, "0")}T${hrs.toString().padStart(2, "0")}:${min}:${secStr}`;
      }
    }

    // Fallback: If standard Date constructor can parse it, return ISO string
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch (e) {
    console.error("Date normalization error:", e);
  }
  return null;
}

export function parseEmail(
  sender: string,
  subject: string,
  body: string,
  receivedDate?: string
): Transaction | null {
  const fromAddress = sender.toLowerCase();
  let parsed: abl.PartialTransaction | null = null;
  let source = "";

  if (fromAddress.includes("nayapay.com")) {
    parsed = nayapay.parse(subject, body);
    source = "NayaPay";
  } else if (fromAddress.includes("telenorbank.pk")) {
    parsed = easypaisa.parse(subject, body);
    source = "Easypaisa";
  } else if (fromAddress.includes("abl.com")) {
    parsed = abl.parse(subject, body);
    source = "ABL";
  } else if (fromAddress.includes("meezanbank.com")) {
    parsed = meezan.parse(subject, body);
    source = "Meezan Bank";
  } else if (fromAddress.includes("hbl.com")) {
    parsed = hbl.parse(subject, body);
    source = "HBL";
  }

  if (!parsed || typeof parsed.amount_pkr !== 'number' || isNaN(parsed.amount_pkr) || parsed.amount_pkr <= 0) {
    return null;
  }

  // Use the parsed date, or fallback to the email's received date, or current date
  let finalDate = receivedDate || new Date().toISOString();
  if (parsed.date_time) {
    const normalized = normalizeDate(parsed.date_time);
    if (normalized) {
      finalDate = normalized;
    }
  }

  // Determine category
  const finalCategory = categorize(parsed.merchant_name, parsed.direction);

  // Clean the merchant name: strip HTML entities and collapse extra whitespace
  const cleanMerchant = (parsed.merchant_name || "Unknown")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  return {
    date_time: finalDate,
    source,
    merchant_name: cleanMerchant,
    amount_pkr: parsed.amount_pkr,
    direction: parsed.direction,
    payment_method: parsed.payment_method,
    category: finalCategory,
    raw_notification: `Subject: ${subject}\n\n${body}`,
  };
}
