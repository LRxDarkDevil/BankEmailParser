import { PartialTransaction } from "./abl";

export function parse(subject: string, body: string): PartialTransaction | null {
  const text = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  const isHblTransaction = 
    subject.includes("HBL Digital") || 
    text.includes("HBL Digital") || 
    text.includes("HBL PhoneBanking") ||
    text.includes("conducted a Payment") ||
    text.includes("successfully sent money");

  if (!isHblTransaction) {
    return null;
  }

  // Extract amount
  // E.g. "Amount 1000.00" or "Amount 1500" or "Amount 17370"
  const amountMatch = text.match(/Amount\s+([\d,.]+)/i);
  if (!amountMatch) {
    return null;
  }
  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));

  // Determine direction
  let direction: "debit" | "credit" | "info" = "debit";
  if (subject.includes("Received") || text.includes("credited to your account")) {
    direction = "credit";
  }

  // Extract Merchant/Receiver
  let merchant = "HBL Transaction";
  
  // A. Bill Payment (look for Company name)
  // E.g. Company The Islamia University of Bahawalpur
  const companyMatch = text.match(/Company\s+([^\n]+)/i);

  // B. Funds Transfer (look for Beneficiary Account Title)
  // E.g. Beneficiary Account Title JAWAD ADNAN
  const beneficiaryMatch = text.match(/Beneficiary Account Title\s+([^\n]+)/i);

  if (companyMatch) {
    merchant = companyMatch[1].trim();
  } else if (beneficiaryMatch) {
    merchant = beneficiaryMatch[1].trim();
  }

  // Extract Date-Time
  // E.g. Date-Time 09-06-2026 03:13:49
  const dateMatch = text.match(/Date-Time\s+([\d]{2}-[\d]{2}-[\d]{4}\s+[\d]{2}:[\d]{2}:[\d]{2})/i);
  const dateTime = dateMatch ? dateMatch[1].trim() : undefined;

  // Determine payment method
  let paymentMethod = "HBL Digital";
  if (subject.includes("Raast") || text.includes("via Raast")) {
    paymentMethod = "Raast Transfer";
  } else if (subject.includes("Bill Payment") || text.includes("Bill Payment")) {
    paymentMethod = "Bill Payment";
  }

  return {
    amount_pkr: amount,
    merchant_name: merchant,
    direction: direction,
    date_time: dateTime,
    payment_method: paymentMethod,
  };
}
