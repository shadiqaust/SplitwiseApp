import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Send, CheckCircle2, XCircle } from "lucide-react";
import { AdminLayout } from "./layout";
import { adminApi, type SmtpSettingsInput } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const EMPTY: SmtpSettingsInput = {
  enabled: false,
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  fromAddress: "",
  fromName: "Splitix",
  appPublicUrl: "",
};

export function AdminEmailSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "smtp"],
    queryFn: () => adminApi.getSmtp(),
  });

  const [form, setForm] = useState<SmtpSettingsInput>(EMPTY);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  useEffect(() => {
    if (data) {
      setForm({
        enabled: data.enabled,
        host: data.host,
        port: data.port,
        secure: data.secure,
        username: data.username,
        password: "",
        fromAddress: data.fromAddress,
        fromName: data.fromName,
        appPublicUrl: data.appPublicUrl,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (input: SmtpSettingsInput) => adminApi.putSmtp(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "smtp"] });
      setForm((f) => ({ ...f, password: "" }));
      toast({ title: "SMTP settings saved" });
    },
    onError: (err) =>
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      }),
  });

  const testMutation = useMutation({
    mutationFn: (to: string) => adminApi.testSmtp(to),
    onSuccess: (res) => {
      if (res.ok) {
        setTestResult({ ok: true, message: `Sent (id: ${res.messageId ?? "?"})` });
      } else {
        setTestResult({ ok: false, message: res.error ?? "Unknown error" });
      }
    },
    onError: (err) =>
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }),
  });

  function set<K extends keyof SmtpSettingsInput>(
    key: K,
    value: SmtpSettingsInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Email (SMTP)</h1>
          <p className="text-sm text-muted-foreground">
            Configure the SMTP server used to send verification emails. The password is
            stored in the database in plain text — use a dedicated app password.
          </p>
        </div>

        {isLoading && <Loader2 className="w-6 h-6 animate-spin" />}

        {!isLoading && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>SMTP server</span>
                <div className="flex items-center gap-2 text-sm font-normal">
                  <Switch
                    id="smtp-enabled"
                    checked={form.enabled}
                    onCheckedChange={(v) => set("enabled", v)}
                  />
                  <Label htmlFor="smtp-enabled">Enabled</Label>
                </div>
              </CardTitle>
              <CardDescription>
                When disabled, registrations succeed but no email is sent. Users will
                see the unverified banner indefinitely.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-1.5">
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    placeholder="smtp.example.com"
                    value={form.host}
                    onChange={(e) => set("host", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={form.port}
                    onChange={(e) => set("port", Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="secure"
                  checked={form.secure}
                  onCheckedChange={(v) => set("secure", v)}
                />
                <Label htmlFor="secure">
                  Use TLS on connect (port 465). Leave off for STARTTLS (587).
                </Label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    autoComplete="off"
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">
                    Password{" "}
                    {data?.hasPassword && (
                      <span className="text-xs text-muted-foreground">
                        (leave blank to keep current)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder={data?.hasPassword ? "••••••••" : ""}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fromAddress">From address</Label>
                  <Input
                    id="fromAddress"
                    placeholder="no-reply@example.com"
                    value={form.fromAddress}
                    onChange={(e) => set("fromAddress", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fromName">From name</Label>
                  <Input
                    id="fromName"
                    value={form.fromName}
                    onChange={(e) => set("fromName", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appPublicUrl">App public URL</Label>
                <Input
                  id="appPublicUrl"
                  placeholder="https://app.example.com"
                  value={form.appPublicUrl}
                  onChange={(e) => set("appPublicUrl", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Used to build verification links. Should be the HTTPS origin where
                  your web app is reachable (no trailing slash).
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save settings
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && (
          <Card>
            <CardHeader>
              <CardTitle>Send a test email</CardTitle>
              <CardDescription>
                Uses the saved settings above to deliver a one-off test message.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="recipient@example.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
                <Button
                  onClick={() => {
                    setTestResult(null);
                    testMutation.mutate(testTo);
                  }}
                  disabled={!testTo || testMutation.isPending}
                >
                  {testMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send test
                </Button>
              </div>
              {testResult && (
                <div
                  className={`flex items-start gap-2 text-sm ${
                    testResult.ok ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
