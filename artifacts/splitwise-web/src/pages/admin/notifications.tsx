import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { AdminLayout } from "./layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, User, Inbox, Bell } from "lucide-react";

type Mode = "all" | "user";

export function AdminNotificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("all");
  const [userQuery, setUserQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendInApp, setSendInApp] = useState(true);
  const [sendPush, setSendPush] = useState(true);

  const usersQ = useQuery({
    queryKey: ["admin", "users", "for-notif", userQuery],
    queryFn: () => adminApi.listUsers({ q: userQuery || undefined, pageSize: 30 }),
    enabled: mode === "user",
  });

  const sentQ = useQuery({
    queryKey: ["admin", "notifications", "sent"],
    queryFn: () => adminApi.recentNotifications(),
  });

  const send = useMutation({
    mutationFn: () =>
      adminApi.sendNotification({
        target: mode === "all" ? "all" : selectedUserId,
        title: title.trim(),
        body: body.trim(),
        channels: { inApp: sendInApp, push: sendPush },
      }),
    onSuccess: (r) => {
      const via = [sendInApp && "in-app", sendPush && "push"].filter(Boolean).join(" + ");
      toast({ title: `Sent to ${r.sent} user${r.sent === 1 ? "" : "s"}`, description: `Via ${via}` });
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "sent"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (mode === "all" || !!selectedUserId) &&
    (sendInApp || sendPush) &&
    !send.isPending;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-1">Notifications</h1>
      <p className="text-muted-foreground mb-6">
        Send an in-app notification to a specific user, or broadcast to everyone.
      </p>

      <div className="border rounded-lg p-4 bg-card mb-6 space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => setMode("all")}
            className={`flex-1 flex items-center justify-center gap-2 border rounded-md py-2 text-sm font-medium ${
              mode === "all" ? "bg-primary text-primary-foreground border-primary" : ""
            }`}
          >
            <Users className="w-4 h-4" /> Everyone
          </button>
          <button
            onClick={() => setMode("user")}
            className={`flex-1 flex items-center justify-center gap-2 border rounded-md py-2 text-sm font-medium ${
              mode === "user" ? "bg-primary text-primary-foreground border-primary" : ""
            }`}
          >
            <User className="w-4 h-4" /> Specific user
          </button>
        </div>

        {mode === "user" && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Search user</label>
            <Input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Name or email"
            />
            <div className="mt-2 max-h-48 overflow-auto border rounded-md divide-y">
              {usersQ.data?.users.slice(0, 30).map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`w-full text-left p-2 text-sm hover:bg-muted ${
                    selectedUserId === u.id ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </button>
              ))}
              {usersQ.data?.users.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">No matches.</div>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="What's new" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Message</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4} placeholder="Write a clear, friendly message…" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Delivery channels</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSendInApp((v) => !v)}
              className={`flex-1 flex items-center justify-center gap-2 border rounded-md py-2 text-sm font-medium ${
                sendInApp ? "bg-primary text-primary-foreground border-primary" : ""
              }`}
            >
              <Inbox className="w-4 h-4" /> In-app inbox
            </button>
            <button
              type="button"
              onClick={() => setSendPush((v) => !v)}
              className={`flex-1 flex items-center justify-center gap-2 border rounded-md py-2 text-sm font-medium ${
                sendPush ? "bg-primary text-primary-foreground border-primary" : ""
              }`}
            >
              <Bell className="w-4 h-4" /> Push notification
            </button>
          </div>
          {!sendInApp && !sendPush && (
            <p className="text-xs text-destructive mt-1">Pick at least one channel.</p>
          )}
          {!sendInApp && sendPush && (
            <p className="text-xs text-muted-foreground mt-1">
              Push only — won't appear in the in-app inbox.
            </p>
          )}
          {sendInApp && !sendPush && (
            <p className="text-xs text-muted-foreground mt-1">
              In-app only — no OS notification on mobile.
            </p>
          )}
        </div>

        <Button onClick={() => send.mutate()} disabled={!canSend}>
          <Send className="w-4 h-4 mr-2" />
          {send.isPending ? "Sending…" : mode === "all" ? "Send to everyone" : "Send"}
        </Button>
      </div>

      <h2 className="font-semibold mb-2">Recently sent</h2>
      <div className="border rounded-lg bg-card divide-y">
        {sentQ.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {!sentQ.isLoading && (sentQ.data?.items.length ?? 0) === 0 && (
          <div className="p-4 text-sm text-muted-foreground">No notifications sent yet.</div>
        )}
        {sentQ.data?.items.map((n, i) => (
          <div key={i} className="p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{n.title}</div>
                <div className="text-muted-foreground">{n.body}</div>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {n.type === "admin_broadcast" ? "Broadcast" : "Direct"} · {n.recipients} ·{" "}
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
