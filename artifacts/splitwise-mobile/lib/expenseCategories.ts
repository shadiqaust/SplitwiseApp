import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";

export type CategoryIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const KEYWORD_MAP: Array<[RegExp, string]> = [
  [/\b(uber\s*eats|ubereats|doordash|grubhub|deliveroo|swiggy|zomato|postmates|seamless|chowbus|caviar)\b/i, "Food"],
  [/\b(restaurant|cafe|coffee|starbucks|tea|boba|pizza|burger|sushi|thai|chinese|mexican|breakfast|lunch|dinner|brunch|takeout|takeaway|food|meal|snack|drinks?|beer|wine|bar|cocktail|bakery|donut|ice\s*cream|deli|diner)\b/i, "Food"],
  [/\b(grocery|groceries|supermarket|walmart|costco|trader\s*joe|whole\s*foods|safeway|kroger|aldi|lidl|tesco|sainsbury|woolworths|wegmans|publix|market)\b/i, "Groceries"],
  [/\b(flight|hotel|airbnb|vacation|trip|travel|airport|airline|airways|motel|resort|booking\.com|expedia|kayak|cruise|hostel)\b/i, "Travel"],
  [/\b(electric(?:ity)?|water bill|internet|wi-?fi|phone bill|mobile bill|utility|utilities|heating|cable|comcast|verizon|sewer|trash|garbage|gas bill|power bill)\b/i, "Utilities"],
  [/\b(uber|lyft|taxi|cab|gas|fuel|petrol|diesel|parking|toll|train|bus|metro|subway|tram|ola|didi|ride|fare|transit|transport|gasoline|car\s*wash|rental car)\b/i, "Transport"],
  [/\b(rent|lease|landlord|mortgage|deposit)\b/i, "Rent"],
  [/\b(movie|cinema|concert|netflix|spotify|hulu|disney\+?|theater|theatre|game|tickets?|show|festival|club|youtube|prime video|hbo|paramount|playstation|xbox|nintendo)\b/i, "Entertainment"],
  [/\b(amazon|shopping|clothes|clothing|shoes|mall|store|target|best\s*buy|apparel|ikea|furniture|nike|adidas|h&m|zara|uniqlo|ebay|etsy)\b/i, "Shopping"],
];

export function guessCategory(description: string | null | undefined): string | null {
  if (!description) return null;
  const text = description.toLowerCase();
  for (const [re, cat] of KEYWORD_MAP) {
    if (re.test(text)) return cat;
  }
  return null;
}

export function getCategoryIcon(category: string | null | undefined): CategoryIconName {
  switch (category) {
    case "Food":
      return "silverware-fork-knife";
    case "Groceries":
      return "cart-outline";
    case "Transport":
      return "car-outline";
    case "Rent":
      return "home-outline";
    case "Utilities":
      return "lightbulb-outline";
    case "Entertainment":
      return "filmstrip";
    case "Travel":
      return "airplane";
    case "Shopping":
      return "shopping-outline";
    case "Other":
      return "dots-horizontal";
    case "General":
    default:
      return "receipt-text-outline";
  }
}
