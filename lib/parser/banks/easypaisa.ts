import { PartialTransaction } from "./abl";

export function parse(subject: string, body: string): PartialTransaction | null {
  const text = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  // Validate if this is an Easypaisa transaction email
  const isEasypaisa = 
    /easypaisa/i.test(subject) || 
    /easypaisa/i.test(text) ||
    text.includes("telenorbank.pk") ||
    text.includes("Transaction Successful");

  if (!isEasypaisa) {
    return null;
  }

  // Extract amount
  // E.g. "Amount 1500" or "Amount Rs. 1,500" or "PKR 500"
  // Let's search for "Amount" row or general currency symbols
  const amountMatch = 
    text.match(/Amount\s*(?::\s*)?(?:Rs\.?|PKR)?\s*([\d,.]+)/i) || 
    text.match(/(?:Rs\.?|PKR)\s*([\d,.]+)/i);

  if (!amountMatch) {
    return null;
  }
  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));

  // Determine direction
  let direction: "debit" | "credit" | "info" = "debit";
  if (
    /received/i.test(subject) || 
    /received/i.test(text) ||
    text.includes("received in your account") ||
    text.includes("credited")
  ) {
    direction = "credit";
  }

  // Extract Merchant/Receiver
  let merchant = "Easypaisa Transaction";
  
  // Look for Paid to, Company, or Receiver in the text
  const merchantMatch = 
    text.match(/Company\s+([^\n]+)/i) || 
    text.match(/Paid to\s+([^\n]+)/i) || 
    text.match(/Receiver Name\s+([^\n]+)/i) ||
    text.match(/Beneficiary Name\s+([^\n]+)/i);

  if (merchantMatch) {
    merchant = merchantMatch[1].trim();
  } else {
    // If not found in specific fields, try parsing from the summary sentence
    // E.g. "Bill Payment of 1 Bill Invoice/Voucher on..." -> "Bill Payment"
    const typeMatch = text.match(/Transaction Type\s+([^\n]+)/i);
    if (typeMatch) {
      merchant = typeMatch[1].trim();
    }
  }

  // Extract Date & Time
  // E.g. "Date & Time 12-May-2025 16:37:54"
  const dateMatch = text.match(/Date\s*(?:&|and)\s*Time\s+([\d]{1,2}-[a-zA-Z]{3,9}-[\d]{4}\s+[\d]{2}:[\d]{2}(?::\d{2})?)/i);
  const dateTime = dateMatch ? dateMatch[1].trim() : undefined;

  // Determine payment method
  let paymentMethod = "Easypaisa App";
  if (text.includes("Bill Payment")) {
    paymentMethod = "Bill Payment";
  } else if (text.includes("Raast") || subject.includes("Raast")) {
    paymentMethod = "Raast Transfer";
  }

  return {
    amount_pkr: amount,
    merchant_name: merchant,
    direction: direction,
    date_time: dateTime,
    payment_method: paymentMethod,
  };
}
