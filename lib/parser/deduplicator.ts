import { DbTransaction } from "../db";

/**
 * Deduplication logic:
 * Checks if a transaction with the same amount, merchant, and source
 * occurred within a 60-second window of the new transaction's timestamp.
 */
export function isDuplicate(
  existingTxns: Omit<DbTransaction, "id">[],
  amount: number,
  merchant: string,
  source: string,
  dateTimeStr: string
): boolean {
  const newTime = new Date(dateTimeStr).getTime();
  if (isNaN(newTime)) {
    return false;
  }

  const normalizedNewMerchant = merchant.toLowerCase().trim();
  const normalizedNewSource = source.toLowerCase().trim();

  return existingTxns.some((txn) => {
    const existingTime = new Date(txn.date_time).getTime();
    if (isNaN(existingTime)) {
      return false;
    }

    const timeDiffSeconds = Math.abs(newTime - existingTime) / 1000;
    if (timeDiffSeconds > 60) {
      return false;
    }

    const matchAmount = Math.abs(txn.amount_pkr - amount) < 0.01;
    const matchMerchant = txn.merchant_name.toLowerCase().trim() === normalizedNewMerchant;
    const matchSource = txn.source.toLowerCase().trim() === normalizedNewSource;

    return matchAmount && matchMerchant && matchSource;
  });
}
