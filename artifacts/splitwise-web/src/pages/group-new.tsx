import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateGroup, getListGroupsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { COMMON_CURRENCIES } from "@/lib/currencies";

const formSchema = z.object({
  name: z.string().min(1, "Group name is required").max(100),
  description: z.string().max(255).optional(),
  currency: z.string().min(1, "Currency is required"),
});

export function NewGroupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createGroup = useCreateGroup();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      currency: "USD",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createGroup.mutate({ data: values }, {
      onSuccess: (group) => {
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        toast({ title: "Group created successfully" });
        setLocation(`/groups/${group.id}`);
      },
      onError: () => {
        toast({ title: "Failed to create group", variant: "destructive" });
      }
    });
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Create a Group</h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group Name</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g. Trip to Hawaii, Apartment" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What is this group for?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a currency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMMON_CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.symbol} {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-4">
              <Button type="submit" disabled={createGroup.isPending}>
                {createGroup.isPending ? "Creating..." : "Save Group"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setLocation("/groups")}>
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
