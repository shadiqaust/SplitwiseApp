import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useEffect, useRef, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { Camera, Upload, Check, Globe, Gift, Copy, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListCurrencies } from "@workspace/api-client-react";

// ─── Predefined avatar presets ────────────────────────────────────────────────
const PRESETS = [
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Alice&size=200", label: "Alice" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Bob&size=200", label: "Bob" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Charlie&size=200", label: "Charlie" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Diana&size=200", label: "Diana" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Alex&size=200", label: "Alex" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Sam&size=200", label: "Sam" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Jordan&size=200", label: "Jordan" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Casey&size=200", label: "Casey" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Felix&size=200", label: "Felix" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Luna&size=200", label: "Luna" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Rider&size=200", label: "Rider" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Max&size=200", label: "Max" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=River&size=200", label: "River" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Sage&size=200", label: "Sage" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Sky&size=200", label: "Sky" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Storm&size=200", label: "Storm" },
];

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 200;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  country: z.string().optional(),
  defaultCurrency: z.string().min(1, "Currency is required"),
});

function UserAvatar({ name, url, size = 80 }: { name?: string; url?: string | null; size?: number }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export function ProfilePage() {
  const { data: userProfile, isLoading } = useGetMe();
  const updateMe = useUpdateMe();
  const { data: currencies } = useListCurrencies();
  const { toast } = useToast();
  const { signOut, updateUser } = useAuth();
  const [, setLocation] = useLocation();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", country: "", defaultCurrency: "USD" },
  });

  const initialized = useRef(false);
  useEffect(() => {
    if (userProfile && !initialized.current) {
      form.reset({
        name: userProfile.name,
        country: userProfile.country ?? "",
        defaultCurrency: userProfile.defaultCurrency ?? "USD",
      });
      initialized.current = true;
    }
  }, [userProfile, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const payload = {
      name: values.name,
      country: values.country || null,
      defaultCurrency: values.defaultCurrency,
    };
    updateMe.mutate(
      { data: payload },
      {
        onSuccess: (updated) => {
          // Patch the cached me() so anything reading useGetMe() (sidebar,
          // mobile top header, etc.) reflects the new name/country instantly.
          queryClient.setQueryData(
            getGetMeQueryKey(),
            (prev: typeof updated | undefined) =>
              prev ? { ...prev, ...payload } : updated,
          );
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          updateUser(payload);
          toast({ title: "Profile updated" });
        },
        onError: () => {
          toast({ title: "Failed to save", variant: "destructive" });
        },
      },
    );
  };

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const dataUrl = await compressImage(file);
        setSelectedUrl(dataUrl);
      } catch {
        toast({ title: "Could not read image", variant: "destructive" });
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [toast],
  );

  const handleSaveAvatar = useCallback(() => {
    if (!selectedUrl) return;
    setSaving(true);
    updateMe.mutate(
      { data: { avatarUrl: selectedUrl } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(
            getGetMeQueryKey(),
            (prev: typeof updated | undefined) =>
              prev ? { ...prev, avatarUrl: selectedUrl } : updated,
          );
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          // Patch the auth context so the sidebar avatar updates immediately.
          updateUser({ avatarUrl: selectedUrl });
          toast({ title: "Avatar updated!" });
          setAvatarOpen(false);
          setSelectedUrl(null);
          setSaving(false);
        },
        onError: () => {
          toast({ title: "Failed to save avatar", variant: "destructive" });
          setSaving(false);
        },
      },
    );
  }, [selectedUrl, updateMe, toast, updateUser]);

  const handleSignOut = () => {
    signOut();
    queryClient.clear();
    setLocation("/");
  };

  // ── Invite friends ─────────────────────────────────────────────────
  const inviteUrl = (() => {
    const explicit = (import.meta.env.VITE_APP_INSTALL_URL as string | undefined) || "";
    const base = explicit || (typeof window !== "undefined" ? window.location.origin : "");
    const ref = userProfile?.id ?? "";
    if (!ref) return base;
    try {
      const u = new URL(base);
      u.searchParams.set("ref", ref);
      return u.toString();
    } catch {
      // Malformed base — fall back to safe concatenation.
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}ref=${encodeURIComponent(ref)}`;
    }
  })();
  const inviteMessage =
    `Hey! I'm using Splitix to split bills with friends — it makes settling up effortless. ` +
    `Join me here: ${inviteUrl}`;

  const handleShareInvite = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Try Splitix", text: inviteMessage, url: inviteUrl });
        return;
      } catch (err) {
        // User dismissed the share sheet — treat as a no-op, don't surprise
        // them with a "copied" toast they didn't ask for.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Otherwise fall through to clipboard fallback below.
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast({ title: "Invite link copied", description: "Paste it anywhere to share." });
    } catch {
      toast({ title: "Couldn't share", variant: "destructive" });
    }
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-md mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  const currentAvatar = userProfile?.avatarUrl ?? null;

  return (
    <Layout>
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>

        {/* Avatar row */}
        <div className="flex items-center gap-4">
          <div
            className="relative group cursor-pointer"
            onClick={() => setAvatarOpen(true)}
          >
            <UserAvatar name={userProfile?.name} url={currentAvatar} size={80} />
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <div className="font-semibold text-lg">{userProfile?.name}</div>
            <div className="text-sm text-muted-foreground">{userProfile?.email}</div>
            {userProfile?.country && (
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {userProfile.country}
                </span>
              </div>
            )}
            <button
              className="text-xs text-primary hover:underline mt-0.5"
              onClick={() => setAvatarOpen(true)}
            >
              Change avatar
            </button>
          </div>
        </div>

        {/* Profile form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Country{" "}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input {...field} className="pl-9" placeholder="e.g. France" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="defaultCurrency"
              render={({ field }) => {
                const selected = (currencies ?? []).find((c) => c.code === field.value);
                return (
                <FormItem>
                  <FormLabel>Default currency</FormLabel>
                  <Select
                    key={`${currencies?.length ?? 0}-${field.value}`}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a currency">
                          {selected
                            ? `${selected.symbol} ${selected.code} — ${selected.name}`
                            : field.value || undefined}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(currencies ?? []).map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.symbol} {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Used as the default when you create new groups.
                  </p>
                  <FormMessage />
                </FormItem>
                );
              }}
            />

            <Button type="submit" disabled={updateMe.isPending}>
              {updateMe.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </Form>

        {/* Invite friends */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">Invite friends</div>
              <div className="text-xs text-muted-foreground">
                Share Splitix so others can split bills with you.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
            <span className="flex-1 text-xs font-medium truncate">{inviteUrl}</span>
            <button
              type="button"
              onClick={handleCopyInvite}
              className="text-primary hover:opacity-80"
              aria-label="Copy invite link"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={handleShareInvite} className="w-full">
            <Share2 className="w-4 h-4 mr-2" />
            Share invite link
          </Button>
          <Link
            href="/my-referrals"
            className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
          >
            View who joined through your link →
          </Link>
        </div>

        <div className="pt-4 border-t">
          <Button variant="destructive" onClick={handleSignOut} className="w-full">
            Log out
          </Button>
        </div>
      </div>

      {/* Avatar editor dialog */}
      <Dialog
        open={avatarOpen}
        onOpenChange={(o) => {
          setAvatarOpen(o);
          if (!o) setSelectedUrl(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose your avatar</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 py-2">
            <UserAvatar name={userProfile?.name} url={selectedUrl ?? currentAvatar} size={64} />
            <p className="text-sm text-muted-foreground">
              {selectedUrl
                ? "New avatar selected — tap Save to apply."
                : "Select an avatar below or upload a photo."}
            </p>
          </div>

          <Tabs defaultValue="presets">
            <TabsList className="w-full">
              <TabsTrigger value="presets" className="flex-1">
                Cartoon avatars
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">
                Upload photo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="presets">
              <div className="grid grid-cols-4 gap-3 py-3 max-h-72 overflow-y-auto">
                {PRESETS.map((p) => {
                  const isSelected =
                    selectedUrl === p.url || (!selectedUrl && currentAvatar === p.url);
                  return (
                    <button
                      key={p.url}
                      onClick={() => setSelectedUrl(p.url)}
                      className={cn(
                        "relative rounded-xl overflow-hidden border-2 transition-all hover:scale-105 focus:outline-none",
                        isSelected ? "border-primary shadow-md" : "border-transparent",
                      )}
                    >
                      <img
                        src={p.url}
                        alt={p.label}
                        className="w-full aspect-square object-cover"
                      />
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="upload">
              <div className="py-4 space-y-4">
                <div
                  className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">
                    Click to choose a photo from your device
                    <br />
                    <span className="text-xs">JPG, PNG, GIF — max 5 MB</span>
                  </p>
                  {uploading && <p className="text-xs text-primary">Processing…</p>}
                  {selectedUrl?.startsWith("data:") && (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <Check className="w-3 h-3" /> Photo ready
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setAvatarOpen(false);
                setSelectedUrl(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveAvatar} disabled={!selectedUrl || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
