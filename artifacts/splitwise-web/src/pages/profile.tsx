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
import { useLocation } from "wouter";
import { Camera, Upload, Check, MapPin, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

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
  location: z.string().optional(),
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
    defaultValues: { name: "", country: "", location: "" },
  });

  const initialized = useRef(false);
  useEffect(() => {
    if (userProfile && !initialized.current) {
      form.reset({
        name: userProfile.name,
        country: userProfile.country ?? "",
        location: userProfile.location ?? "",
      });
      initialized.current = true;
    }
  }, [userProfile, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const payload = {
      name: values.name,
      country: values.country || null,
      location: values.location || null,
    };
    updateMe.mutate(
      { data: payload },
      {
        onSuccess: () => {
          // Refresh the TanStack cache for any component reading useGetMe(),
          // and patch the auth context so the sidebar (which reads
          // useAuth().user) updates immediately.
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
        onSuccess: () => {
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
            {(userProfile?.country || userProfile?.location) && (
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {userProfile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {userProfile.location}
                  </span>
                )}
                {userProfile.country && (
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {userProfile.country}
                  </span>
                )}
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
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Location{" "}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input {...field} className="pl-9" placeholder="e.g. Paris, Île-de-France" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={updateMe.isPending}>
              {updateMe.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </Form>

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
