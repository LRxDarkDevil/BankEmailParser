export interface CategoryConfig {
  name: string;
  emoji: string;
  color: string;
}

export const CATEGORIES: Record<string, CategoryConfig> = {
  Food: { name: "Food", emoji: "🍔", color: "#FF6B6B" },
  Coffee: { name: "Coffee", emoji: "☕", color: "#8D5B4C" },
  Transport: { name: "Transport", emoji: "🚗", color: "#4D96FF" },
  Beauty: { name: "Beauty", emoji: "💅", color: "#FF8AAE" },
  Lifestyle: { name: "Lifestyle", emoji: "🛍️", color: "#6BCB77" },
  Education: { name: "Education", emoji: "📚", color: "#4D96FF" },
  Entertainment: { name: "Entertainment", emoji: "🎬", color: "#9E78F5" },
  Utilities: { name: "Utilities", emoji: "💡", color: "#FFD93D" },
  Allowance: { name: "Allowance", emoji: "📈", color: "#6BCB77" },
  Transfer: { name: "Transfer", emoji: "💸", color: "#6F38C5" },
  Other: { name: "Other", emoji: "💰", color: "#A5B1C2" },
};

export function categorize(merchant: string, direction: "debit" | "credit" | "info"): string {
  const name = merchant.toLowerCase();

  // If credit, default to Allowance / Transfer
  if (direction === "credit") {
    if (name.includes("parent") || name.includes("family") || name.includes("dad") || name.includes("mom") || name.includes("allowance")) {
      return "Allowance";
    }
    return "Transfer";
  }

  // Keywords mapping (checked in order — first match wins)
  const keywordMap: Array<[string[], string]> = [
    // ATM/Cash — must be before Transfer to avoid false Transfer match
    [["cash withdrawal", "atm", "cash advance"], "Other"],
    [["kfc", "optp", "mcdonald's", "mcdonalds", "school cafeteria", "subway", "pizza", "food", "restaurant", "infusio"], "Food"],
    [["coffee wagera", "chai spot", "gloria jean's", "gloria jeans", "coffee", "cafe", "starbucks", "dunkin"], "Coffee"],
    [["yango", "indrive", "uber", "careem", "transport", "ride"], "Transport"],
    [["bagallery", "wb by hemani", "beauty", "cosmetics", "makeup"], "Beauty"],
    [["miniso", "lifestyle", "shopping", "mall", "daraz"], "Lifestyle"],
    [["liberty books", "school", "books", "education", "academy", "tution", "university"], "Education"],
    [["atrium cinema", "cinema", "netflix", "movie", "entertainment", "play"], "Entertainment"],
    [["easyload", "utility", "bill", "electricity", "water", "gas", "internet", "nayatel", "stormfiber"], "Utilities"],
    [["raast", "transfer", "send", "ibft", "payment", "adnan", "taha", "raza"], "Transfer"],
  ];

  for (const [keywords, category] of keywordMap) {
    if (keywords.some(kw => name.includes(kw))) {
      return category;
    }
  }

  return "Other";
}
