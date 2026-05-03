import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminCurrency } from "@/lib/admin-api";
import { AdminLayout } from "./layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, X } from "lucide-react";

export function AdminCurrenciesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "currencies"],
    queryFn: () => adminApi.listCurrencies(),
  });

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<AdminCurrency>({ code: "", name: "", symbol: "", sortOrder: 9999 });
  const [editing, setEditing] = useState<Record<string, AdminCurrency>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "currencies"] });

  const create = useMutation({
    mutationFn: () => adminApi.createCurrency(draft),
    onSuccess: () => {
      setAdding(false);
      setDraft({ code: "", name: "", symbol: "", sortOrder: 9999 });
      invalidate();
      toast({ title: "Currency added" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: (c: AdminCurrency) =>
      adminApi.updateCurrency(c.code, { name: c.name, symbol: c.symbol, sortOrder: c.sortOrder }),
    onSuccess: (_d, c) => {
      setEditing((s) => {
        const next = { ...s };
        delete next[c.code];
        return next;
      });
      invalidate();
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (code: string) => adminApi.deleteCurrency(code),
    onSuccess: () => {
      invalidate();
      toast({ title: "Currency removed" });
    },
    onError: (e: Error) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Currencies</h1>
          <p className="text-muted-foreground">Manage the list shown across the app.</p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="border rounded-lg p-4 mb-4 bg-card grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <Field label="Code">
            <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="USD" />
          </Field>
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="US Dollar" />
          </Field>
          <Field label="Symbol">
            <Input value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} placeholder="$" />
          </Field>
          <Field label="Sort">
            <Input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              <Save className="w-4 h-4 mr-1" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Code</th>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Symbol</th>
              <th className="p-3 font-medium">Sort</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td>
              </tr>
            )}
            {data?.currencies.map((c) => {
              const e = editing[c.code];
              const inEdit = !!e;
              const row = e ?? c;
              return (
                <tr key={c.code} className="border-t">
                  <td className="p-3 font-mono">{c.code}</td>
                  <td className="p-3">
                    {inEdit ? (
                      <Input value={row.name} onChange={(ev) => setEditing((s) => ({ ...s, [c.code]: { ...row, name: ev.target.value } }))} />
                    ) : c.name}
                  </td>
                  <td className="p-3">
                    {inEdit ? (
                      <Input value={row.symbol} onChange={(ev) => setEditing((s) => ({ ...s, [c.code]: { ...row, symbol: ev.target.value } }))} />
                    ) : c.symbol}
                  </td>
                  <td className="p-3">
                    {inEdit ? (
                      <Input type="number" value={row.sortOrder} onChange={(ev) => setEditing((s) => ({ ...s, [c.code]: { ...row, sortOrder: Number(ev.target.value) } }))} />
                    ) : c.sortOrder}
                  </td>
                  <td className="p-3 text-right space-x-1 whitespace-nowrap">
                    {inEdit ? (
                      <>
                        <Button size="sm" onClick={() => update.mutate(row)} disabled={update.isPending}>
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing((s) => { const n = { ...s }; delete n[c.code]; return n; })}>
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing((s) => ({ ...s, [c.code]: c }))}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Delete currency ${c.code}?`)) remove.mutate(c.code);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}
