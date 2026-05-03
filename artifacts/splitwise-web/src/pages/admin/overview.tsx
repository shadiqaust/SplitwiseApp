import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApi } from "@/lib/admin-api";
import { AdminLayout } from "./layout";
import { Users, Layers, Receipt, ArrowLeftRight, Coins } from "lucide-react";

function formatMonthLabel(ym: string): string {
  // ym is "YYYY-MM"; render as "Jan 26"
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
}

export function AdminOverviewPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminApi.stats(),
  });

  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ["admin", "monthly"],
    queryFn: () => adminApi.monthly(),
  });

  const cards = [
    { label: "Users", value: stats?.users, icon: Users },
    { label: "Groups", value: stats?.groups, icon: Layers },
    { label: "Expenses", value: stats?.expenses, icon: Receipt },
    { label: "Payments", value: stats?.payments, icon: ArrowLeftRight },
    { label: "Currencies", value: stats?.currencies, icon: Coins },
  ];

  const chartData = (monthly?.months ?? []).map((m) => ({
    ...m,
    label: formatMonthLabel(m.month),
  }));

  const totalNewUsers = chartData.reduce((acc, m) => acc + m.newUsers, 0);
  const totalActivity = chartData.reduce(
    (acc, m) => acc + m.expenses + m.payments,
    0,
  );

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-1">Overview</h1>
      <p className="text-muted-foreground mb-6">
        Platform-wide stats and the last 12 months of activity.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="border rounded-lg p-4 bg-card">
            <Icon className="w-5 h-5 text-muted-foreground mb-2" />
            <div className="text-2xl font-bold">
              {statsLoading ? "–" : value ?? 0}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* New users per month */}
      <section className="border rounded-lg p-4 bg-card mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">New user registrations</h2>
            <p className="text-xs text-muted-foreground">
              Last 12 months · {totalNewUsers} new accounts
            </p>
          </div>
        </div>
        <div className="h-64 w-full">
          {monthlyLoading || chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {monthlyLoading ? "Loading…" : "No data yet"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="newUsers" name="New users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Activity per month */}
      <section className="border rounded-lg p-4 bg-card mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Monthly activity</h2>
            <p className="text-xs text-muted-foreground">
              Expenses + payments created · {totalActivity} total
            </p>
          </div>
        </div>
        <div className="h-64 w-full">
          {monthlyLoading || chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {monthlyLoading ? "Loading…" : "No data yet"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="payments" name="Payments" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activeUsers" name="Active users" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Detailed table */}
      <section className="border rounded-lg bg-card overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Monthly breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Month</th>
                <th className="text-right px-4 py-2 font-medium">New users</th>
                <th className="text-right px-4 py-2 font-medium">Expenses</th>
                <th className="text-right px-4 py-2 font-medium">Payments</th>
                <th className="text-right px-4 py-2 font-medium">Active users</th>
              </tr>
            </thead>
            <tbody>
              {monthlyLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!monthlyLoading && chartData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No data yet
                  </td>
                </tr>
              )}
              {chartData
                .slice()
                .reverse()
                .map((m) => (
                  <tr key={m.month} className="border-t">
                    <td className="px-4 py-2">{m.label}</td>
                    <td className="px-4 py-2 text-right">{m.newUsers}</td>
                    <td className="px-4 py-2 text-right">{m.expenses}</td>
                    <td className="px-4 py-2 text-right">{m.payments}</td>
                    <td className="px-4 py-2 text-right">{m.activeUsers}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
