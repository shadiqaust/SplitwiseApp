import {
  Car,
  Film,
  Home,
  Lightbulb,
  MoreHorizontal,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export function getCategoryIcon(category: string | null | undefined): LucideIcon {
  switch (category) {
    case "Food":
      return Utensils;
    case "Groceries":
      return ShoppingCart;
    case "Transport":
      return Car;
    case "Rent":
      return Home;
    case "Utilities":
      return Lightbulb;
    case "Entertainment":
      return Film;
    case "Travel":
      return Plane;
    case "Shopping":
      return ShoppingBag;
    case "Other":
      return MoreHorizontal;
    case "General":
    default:
      return Receipt;
  }
}
