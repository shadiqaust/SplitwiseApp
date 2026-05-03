import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
}

// Local-calendar "YYYY-MM-DD" — avoids the off-by-one drift you get from
// toISOString() in non-UTC timezones.
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoMonthsAgo(n: number): string {
  const now = new Date();
  return toLocalISODate(new Date(now.getFullYear(), now.getMonth() - n, 1));
}
function todayIso(): string {
  return toLocalISODate(new Date());
}

export function AdminOverviewPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminApi.stats(),
  });

  // Filter state — default "Last 12 months"
  const [from, setFrom] = useState<string>(isoMonthsAgo(11));
  const [to, setTo] = useState<string>(todayIso());

  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ["admin", "monthly", from, to],
    queryFn: () => adminApi.monthly({ from, to }),
  });

  const cards = [
    { label: "Users", value: stats?.users, icon: Users },
    { label: "Groups", value: stats?.groups, icon: Layers },
    { label: "Expenses", value: stats?.expenses, icon: Receipt },
    { label: "Payments", value: stats?.payments, icon: ArrowLeftRight },
    { label: "Currencies", value: stats?.currencies, icon: Coins },
  ];

  const chartData = useMemo(
    () =>
      (monthly?.months ?? []).map((m) => ({
        ...m,
        label: formatMonthLabel(m.month),
      })),
    [monthly],
  );

  const totals = useMemo(
    () =>
      chartData.reduce(
        (a, m) => ({
          newUsers: a.newUsers + m.newUsers,
          expenses: a.expenses + m.expenses,
          payments: a.payments + m.payments,
        }),
        { newUsers: 0, expenses: 0, payments: 0 },
      ),
    [chartData],
  );

  const presets: { label: string; months: number }[] = [
    { label: "Last 3mo", months: 2 },
    { label: "Last 6mo", months: 5 },
    { label: "Last 12mo", months: 11 },
    { label: "Last 24mo", months: 23 },
  ];
  function applyPreset(months: number) {
    setFrom(isoMonthsAgo(months));
    setTo(todayIso());
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-1">Overview</h1>
      <p className="text-muted-foreground mb-6">
        Platform-wide stats and historical activity.
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

      {/* Filter bar */}
      <div className="border rounded-lg p-4 bg-card mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="from-date">From</label>
          <input
            id="from-date"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded-md px-3 py-1.5 bg-background text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="to-date">To</label>
          <input
            id="to-date"
            type="date"
            value={to}
            min={from}
            max={todayIso()}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded-md px-3 py-1.5 bg-background text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(p.months)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Period totals */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "New users", value: totals.newUsers },
          { label: "Expenses", value: totals.expenses },
          { label: "Payments", value: totals.payments },
        ].map((t) => (
          <div key={t.label} className="border rounded-lg p-4 bg-card">
            <div className="text-2xl font-bold">{t.value}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {t.label} (period)
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
              {chartData.length} months · {totals.newUsers} new accounts
            </p>
          </div>
        </div>
        <div className="h-64 w-full">
          {monthlyLoading || chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {monthlyLoading ? "Loading…" : "No data in range"}
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
              Expenses + payments + active users
            </p>
          </div>
        </div>
        <div className="h-64 w-full">
          {monthlyLoading || chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {monthlyLoading ? "Loading…" : "No data in range"}
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
                    No data in range
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
