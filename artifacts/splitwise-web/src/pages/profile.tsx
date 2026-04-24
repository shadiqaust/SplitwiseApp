import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@clerk/react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export function ProfilePage() {
  const { data: userProfile, isLoading } = useGetMe();
  const updateMe = useUpdateMe();
  const { toast } = useToast();
  const { user: clerkUser } = useUser();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (userProfile && !initialized.current) {
      form.reset({ name: userProfile.name });
      initialized.current = true;
    }
  }, [userProfile, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    updateMe.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Profile updated successfully" });
      },
      onError: () => {
        toast({ title: "Failed to update profile", variant: "destructive" });
      }
    });
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

  return (
    <Layout>
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>

        <div className="flex items-center gap-4 mb-6">
          <img src={userProfile?.avatarUrl || clerkUser?.imageUrl} alt="Avatar" className="w-16 h-16 rounded-full" />
          <div>
            <div className="text-sm text-muted-foreground">{userProfile?.email}</div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
            <Button type="submit" disabled={updateMe.isPending}>
              {updateMe.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
