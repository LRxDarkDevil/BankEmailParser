import { PartialTransaction } from "./abl";

export function parse(subject: string, body: string): PartialTransaction | null {
  const text = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  // Check if this is a transaction alert
  const isTransaction = 
    /transaction/i.test(subject) || 
    /alert/i.test(subject) ||
    text.includes("sent from your account") ||
    text.includes("received to your account") ||
    text.includes("Debited from your account");

  if (!isTransaction) {
    return null;
  }

  // Extract amount
  // E.g. PKR 3,219.00 or PKR 321.00
  const amountMatch = text.match(/(?:PKR|Rs\.?)\s*([\d,.]+)/i);
  if (!amountMatch) {
    return null;
  }
  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));

  // Determine direction
  let direction: "debit" | "credit" | "info" = "debit";
  if (
    /credit/i.test(subject) || 
    text.includes("received to your account") || 
    text.includes("credited")
  ) {
    direction = "credit";
  }

  // Extract Merchant / Sender
  let merchant = "Meezan Transaction";
  if (direction === "debit") {
    // Check for card merchant name
    // E.g. Merchant Name : INFUSIO>BAHWALP
    const merchantMatch = text.match(/Merchant Name\s*:\s*([^\n]+)/i);
    // Check for Raast beneficiary title
    // E.g. Beneficiary Account Title: : J.ADNAN
    const beneficiaryMatch = text.match(/Beneficiary Account Title\s*(?::\s*)+\s*([^\n]+)/i);

    if (merchantMatch) {
      merchant = merchantMatch[1].trim();
      // Clean up potential trailing symbols like >
      if (merchant.endsWith(">")) {
        merchant = merchant.slice(0, -1).trim();
      }
    } else if (beneficiaryMatch) {
      merchant = beneficiaryMatch[1].trim();
      // Clean up extra leading colons or spaces
      merchant = merchant.replace(/^:\s*/, "").trim();
    }
  } else {
    // Credit transaction - extract sender details
    // E.g. Beneficiary Account : J.ADNAN AC# RAAST PYMT PK10BPUN50402
    const senderMatch = text.match(/Beneficiary Account\s*:\s*([^\n]+)/i) || text.match(/Sender Account\s*:\s*([^\n]+)/i);
    if (senderMatch) {
      let rawSender = senderMatch[1].trim();
      // Extract the name part (everything before "AC#" or account number details)
      if (rawSender.includes("AC#")) {
        rawSender = rawSender.split("AC#")[0].trim();
      }
      merchant = rawSender;
    }
  }

  // Extract date & time
  // E.g. Transaction Date : 10-Jun-2026 \n Transaction Time : 17:23
  const dateMatch = text.match(/Transaction Date\s*:\s*([^\n]+)/i);
  const timeMatch = text.match(/Transaction Time\s*:\s*([^\n]+)/i);

  let dateTime: string | undefined = undefined;
  if (dateMatch && timeMatch) {
    dateTime = `${dateMatch[1].trim()} ${timeMatch[1].trim()}`;
  } else if (dateMatch) {
    dateTime = dateMatch[1].trim();
  }

  // Determine payment method
  let paymentMethod = "Meezan App";
  if (text.includes("card used")) {
    paymentMethod = "Debit Card";
  } else if (subject.toLowerCase().includes("raast") || text.toLowerCase().includes("raast")) {
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
