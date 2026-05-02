import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";

export type CategoryIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

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
      return "movie-open-outline";
    case "Travel":
      return "airplane";
    case "Shopping":
      return "shopping-outline";
    case "Other":
      return "dots-horizontal";
    case "General":
    default:
      return "receipt";
  }
}
