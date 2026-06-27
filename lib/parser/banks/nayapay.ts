import { PartialTransaction } from "./abl";

export function parse(subject: string, body: string): PartialTransaction | null {
  // Normalize strings
  const cleanSubject = subject.replace(/\u00a0/g, " ").trim();
  const cleanBody = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();

  // 1. Check Subject Line first, as NayaPay transaction alerts put key details in the subject
  // and the body is often empty or formatted HTML.
  
  // A. Sent/Debit transaction
  // Example: You sent Rs. 150 to Hafeez Iqbal 💸
  // Example: You sent Rs. 1 to Muhammad Taha (M) Adnan Habib (P) 💸
  if (cleanSubject.includes("You sent Rs.")) {
    const match = cleanSubject.match(/You sent Rs\.\s*([\d,.]+)\s+to\s+([^💸]+)/i);
    if (match) {
      return {
        amount_pkr: parseFloat(match[1].replace(/,/g, "")),
        merchant_name: match[2].trim(),
        direction: "debit",
        payment_method: "NayaPay Wallet",
      };
    }
  }

  // B. Received/Credit transaction
  // Example: You got Rs. 150 from Jawad Adnan 🎉
  if (cleanSubject.includes("You got Rs.")) {
    const match = cleanSubject.match(/You got Rs\.\s*([\d,.]+)\s+from\s+([^🎉]+)/i);
    if (match) {
      return {
        amount_pkr: parseFloat(match[1].replace(/,/g, "")),
        merchant_name: match[2].trim(),
        direction: "credit",
        payment_method: "NayaPay Wallet",
      };
    }
  }

  // C. Subscription/Debit
  // Example: You subscribed to a mobile bundle of Rs. 600 📱
  if (cleanSubject.includes("You subscribed")) {
    const match = cleanSubject.match(/Rs\.\s*([\d,.]+)/i);
    if (match) {
      return {
        amount_pkr: parseFloat(match[1].replace(/,/g, "")),
        merchant_name: cleanSubject.replace(/[^a-zA-Z0-9\s]/g, "").trim(), // e.g. "You subscribed to a mobile bundle of Rs 600"
        direction: "debit",
        payment_method: "Mobile Subscription",
      };
    }
  }

  // 2. Fallback to Body Parsing if subject didn't match
  // Example: Rs. 1,250.00 has been spent at KFC on 12-Jun-2026 using your NayaPay wallet.
  if (cleanBody.includes("spent at") || cleanBody.includes("sent Rs") || cleanBody.includes("debited")) {
    const amountMatch = cleanBody.match(/(?:Rs\.?|PKR)\s*([\d,.]+)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;

    let merchant = "NayaPay Spend";
    const merchantMatch = cleanBody.match(/spent at\s+([^on\n.]+)/i) || cleanBody.match(/sent to\s+([^\n.]+)/i);
    if (merchantMatch) {
      merchant = merchantMatch[1].trim();
    }

    const dateMatch = cleanBody.match(/on\s+([\d]{1,2}-[a-zA-Z]{3}-[\d]{4}[^\n.]*)/i);
    const dateTime = dateMatch ? dateMatch[1].trim() : undefined;

    return {
      amount_pkr: amount,
      merchant_name: merchant,
      direction: "debit",
      date_time: dateTime,
      payment_method: cleanBody.includes("card") ? "Debit Card" : "Wallet",
    };
  }

  if (cleanBody.includes("received") || cleanBody.includes("credited")) {
    const amountMatch = cleanBody.match(/(?:Rs\.?|PKR)\s*([\d,.]+)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;

    let merchant = "NayaPay Deposit";
    const senderMatch = cleanBody.match(/received from\s+([^on\n.]+)/i) || cleanBody.match(/sender\s*:\s*([^\n.]+)/i);
    if (senderMatch) {
      merchant = senderMatch[1].trim();
    }

    const dateMatch = cleanBody.match(/on\s+([\d]{1,2}-[a-zA-Z]{3}-[\d]{4}[^\n.]*)/i);
    const dateTime = dateMatch ? dateMatch[1].trim() : undefined;

    return {
      amount_pkr: amount,
      merchant_name: merchant,
      direction: "credit",
      date_time: dateTime,
      payment_method: "IBFT",
    };
  }

  return null;
}
