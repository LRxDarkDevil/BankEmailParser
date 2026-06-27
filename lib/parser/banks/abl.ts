export interface PartialTransaction {
  amount_pkr: number;
  merchant_name: string;
  direction: "debit" | "credit" | "info";
  date_time?: string;
  payment_method?: string;
}

export function parse(subject: string, body: string): PartialTransaction | null {
  // Normalize spacing and newlines
  const text = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  // 1. CREDIT (RAAST / IBFT incoming)
  // Example: PKR 1.00 has been received in your Account No: ***0013 on Sunday , 14-Jun-2026 at 02:29 PM.
  if (text.includes("received in your Account")) {
    const amountMatch = text.match(/PKR\s+([\d,.]+)\s+has been received/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;

    const dateMatch = text.match(/on\s+([^.\n]+)(?=\.\n|Transaction|$)/i);
    let dateTime = dateMatch ? dateMatch[1].trim() : undefined;

    const senderMatch = text.match(/Sender Name\s*:\s*([^\n]+)/i);
    const descMatch = text.match(/Transaction Description\s*:\s*([^\n]+)/i);

    let merchant = "Unknown Sender";
    if (senderMatch && senderMatch[1].trim()) {
      merchant = senderMatch[1].trim();
    } else if (descMatch && descMatch[1].trim()) {
      merchant = descMatch[1].trim();
    }

    return {
      amount_pkr: amount,
      merchant_name: merchant,
      direction: "credit",
      date_time: dateTime,
      payment_method: descMatch ? descMatch[1].trim() : "IBFT",
    };
  }

  // 2. DEBIT (ATM / Cash Withdrawal)
  // Example: A Debit transaction of PKR 1,000.00 was made in your Account No: ... on Tuesday, 16 Jun 2026 at  4:14PM.
  if (text.includes("Debit transaction") && text.includes("was made in your Account")) {
    const amountMatch = text.match(/PKR\s+([\d,.]+)\s+was made/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;

    const dateMatch = text.match(/on\s+([^.\n]+)(?=\.\n|Transaction|$)/i);
    let dateTime = dateMatch ? dateMatch[1].trim() : undefined;

    const descMatch = text.match(/Transaction description\s*:\s*([^\n]+)/i);
    let merchant = "Cash Withdrawal";
    if (descMatch && descMatch[1].trim()) {
      merchant = descMatch[1].trim();
    }

    return {
      amount_pkr: amount,
      merchant_name: merchant,
      direction: "debit",
      date_time: dateTime,
      payment_method: "ATM",
    };
  }

  // 3. TRANSFER / SENT (IBFT outgoing)
  // Example: PKR. 500.00 has been sent from your Account No ... on Tuesday, 16 Jun 2026 at 4:16PM through myABL.
  if (text.includes("has been sent from your Account")) {
    const amountMatch = text.match(/PKR\.?\s+([\d,.]+)\s+has been sent/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;

    const dateMatch = text.match(/on\s+([^.\n]+)(?=\s+through|$)/i);
    let dateTime = dateMatch ? dateMatch[1].trim() : undefined;

    const beneficiaryMatch = text.match(/Beneficiary name\s*:\s*([^\n]+)/i);
    const descMatch = text.match(/Transaction Description\s*:\s*([^\n]+)/i);

    let merchant = "Transfer Out";
    if (beneficiaryMatch && beneficiaryMatch[1].trim()) {
      merchant = beneficiaryMatch[1].trim();
    } else if (descMatch && descMatch[1].trim()) {
      merchant = descMatch[1].trim();
    }

    return {
      amount_pkr: amount,
      merchant_name: merchant,
      direction: "debit",
      date_time: dateTime,
      payment_method: "myABL App",
    };
  }

  return null;
}
