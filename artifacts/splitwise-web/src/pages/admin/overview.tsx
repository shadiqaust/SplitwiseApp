import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { AdminLayout } from "./layout";
import { Users, Layers, Receipt, ArrowLeftRight, Coins } from "lucide-react";

export function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminApi.stats(),
  });

  const cards = [
    { label: "Users", value: data?.users, icon: Users },
    { label: "Groups", value: data?.groups, icon: Layers },
    { label: "Expenses", value: data?.expenses, icon: Receipt },
    { label: "Payments", value: data?.payments, icon: ArrowLeftRight },
    { label: "Currencies", value: data?.currencies, icon: Coins },
  ];

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-1">Overview</h1>
      <p className="text-muted-foreground mb-6">Platform-wide stats at a glance.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="border rounded-lg p-4 bg-card">
            <Icon className="w-5 h-5 text-muted-foreground mb-2" />
            <div className="text-2xl font-bold">
              {isLoading ? "–" : value ?? 0}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {label}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
