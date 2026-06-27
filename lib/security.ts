/**
 * Deterministically generates a 4-digit PIN based on a user's unique ID.
 * This is used to link a teenager's account to their parent's view securely for demos.
 */
export function getParentPin(uid: string): string {
  if (!uid) return "0000";
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Format to a 4-digit number (1000 - 9999)
  return Math.abs(hash % 9000 + 1000).toString();
}
