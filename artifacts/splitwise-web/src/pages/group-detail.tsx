import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { formatCurrency, cn } from "@/lib/format";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { 
  useGetGroup, useGetGroupBalances, useListExpenses, useListPayments, 
  useAddGroupMember, useCreateExpense, useCreatePayment, useGetMe,
  getGetGroupQueryKey, getGetGroupBalancesQueryKey, getListExpensesQueryKey, getListPaymentsQueryKey,
  useDeleteExpense, useDeletePayment, getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react";
import { Plus, UserPlus, Settings, HandCoins, Receipt, Trash2 } from "lucide-react";
import { SplitType, ExpenseSplitInput } from "@workspace/api-client-react/src/generated/api.schemas";

// --- FORMS ---

const addMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
});

function AddMemberDialog({ groupId }: { groupId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const addMember = useAddGroupMember();
  
  const form = useForm<z.infer<typeof addMemberSchema>>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: z.infer<typeof addMemberSchema>) => {
    addMember.mutate({ groupId, data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
        toast({ title: "Member added successfully" });
        setOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: "Failed to add member", description: err?.response?.data?.error || err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start mt-2">
          <UserPlus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>Invite someone to this group by email.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input placeholder="friend@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={addMember.isPending} className="w-full">
              {addMember.isPending ? "Adding..." : "Add Member"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const expenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  totalAmount: z.coerce.number().positive("Amount must be greater than zero"),
  paidByUserId: z.coerce.number().positive("Please select who paid"),
  splitType: z.enum([SplitType.equal, SplitType.exact, SplitType.percentage]),
  date: z.string(),
  splits: z.array(z.object({
    userId: z.coerce.number(),
    amount: z.coerce.number().optional().nullable(),
    percentage: z.coerce.number().optional().nullable(),
  }))
});

function AddExpenseDialog({ groupId, members, currentUserId }: { groupId: number, members: any[], currentUserId?: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createExpense = useCreateExpense();
  
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { 
      description: "", 
      totalAmount: 0,
      paidByUserId: currentUserId || members?.[0]?.userId || 0,
      splitType: SplitType.equal,
      date: new Date().toISOString().split("T")[0],
      splits: members?.map(m => ({ userId: m.userId, amount: null, percentage: null })) || []
    },
  });

  const splitType = form.watch("splitType");

  const onSubmit = (values: z.infer<typeof expenseSchema>) => {
    // Clean up splits before sending based on splitType
    let cleanedSplits = [...values.splits];
    
    if (values.splitType === SplitType.equal) {
      cleanedSplits = cleanedSplits.map(s => ({ userId: s.userId, amount: null, percentage: null }));
    } else if (values.splitType === SplitType.percentage) {
      let totalPct = 0;
      cleanedSplits.forEach(s => totalPct += (s.percentage || 0));
      if (Math.abs(totalPct - 100) > 0.01) {
        toast({ title: "Percentages must add up to 100%", variant: "destructive" });
        return;
      }
      cleanedSplits = cleanedSplits.map(s => ({ userId: s.userId, amount: null, percentage: s.percentage || 0 }));
    } else if (values.splitType === SplitType.exact) {
      let totalAmt = 0;
      cleanedSplits.forEach(s => totalAmt += (s.amount || 0));
      if (Math.abs(totalAmt - values.totalAmount) > 0.01) {
        toast({ title: `Exact amounts must add up to ${formatCurrency(values.totalAmount)}`, variant: "destructive" });
        return;
      }
      cleanedSplits = cleanedSplits.map(s => ({ userId: s.userId, amount: s.amount || 0, percentage: null }));
    }

    createExpense.mutate({ 
      data: {
        ...values,
        currency: "USD",
        groupId,
        splits: cleanedSplits
      } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getGetGroupBalancesQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Expense added" });
        setOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: "Failed to add expense", description: err?.response?.data?.error || err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Dinner, Groceries, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="paidByUserId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid By</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {members?.map(m => (
                        <SelectItem key={m.userId} value={m.userId.toString()}>{m.user.name || m.user.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="splitType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Split Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select split type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SplitType.equal}>Equally</SelectItem>
                      <SelectItem value={SplitType.exact}>Exact Amounts</SelectItem>
                      <SelectItem value={SplitType.percentage}>Percentages</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {splitType !== SplitType.equal && (
              <div className="space-y-3 p-4 border rounded-md bg-muted/20">
                <FormLabel>Split details</FormLabel>
                {members?.map((m, index) => (
                  <div key={m.userId} className="flex items-center gap-3">
                    <span className="flex-1 text-sm">{m.user.name || m.user.email}</span>
                    {splitType === SplitType.exact ? (
                      <FormField
                        control={form.control}
                        name={`splits.${index}.amount`}
                        render={({ field }) => (
                          <FormItem className="w-24 m-0 space-y-0">
                            <FormControl>
                              <Input type="number" step="0.01" min="0" placeholder="$0.00" {...field} value={field.value || ''} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name={`splits.${index}.percentage`}
                        render={({ field }) => (
                          <FormItem className="w-24 m-0 space-y-0">
                            <FormControl>
                              <Input type="number" step="1" min="0" max="100" placeholder="0%" {...field} value={field.value || ''} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button type="submit" disabled={createExpense.isPending} className="w-full mt-4">
              {createExpense.isPending ? "Adding..." : "Add Expense"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const settleUpSchema = z.object({
  fromUserId: z.coerce.number().positive("Required"),
  toUserId: z.coerce.number().positive("Required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  date: z.string(),
});

function SettleUpDialog({ groupId, members, balances, currentUserId }: { groupId: number, members: any[], balances: any[], currentUserId?: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createPayment = useCreatePayment();
  
  // Find who the current user owes the most
  const myDebts = balances?.filter(b => b.fromUserId === currentUserId) || [];
  const largestDebt = myDebts.length > 0 ? myDebts.reduce((prev, current) => (prev.amount > current.amount) ? prev : current) : null;
  
  const form = useForm<z.infer<typeof settleUpSchema>>({
    resolver: zodResolver(settleUpSchema),
    defaultValues: { 
      fromUserId: currentUserId || 0,
      toUserId: largestDebt ? largestDebt.toUserId : (members?.filter(m => m.userId !== currentUserId)?.[0]?.userId || 0),
      amount: largestDebt ? largestDebt.amount : 0,
      date: new Date().toISOString().split("T")[0],
    },
  });

  const onSubmit = (values: z.infer<typeof settleUpSchema>) => {
    createPayment.mutate({ 
      data: {
        ...values,
        groupId,
      } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getGetGroupBalancesQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Payment recorded" });
        setOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: "Failed to record payment", description: err?.response?.data?.error || err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <HandCoins className="w-4 h-4 mr-2" />
          Settle Up
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a Payment</DialogTitle>
          <DialogDescription>Record a cash or outside payment between members.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex items-center gap-2">
              <FormField
                control={form.control}
                name="fromUserId"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>From</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {members?.map(m => (
                          <SelectItem key={m.userId} value={m.userId.toString()}>{m.user.name || m.user.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <span className="mt-8 text-muted-foreground">→</span>
              <FormField
                control={form.control}
                name="toUserId"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>To</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Recipient" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {members?.map(m => (
                          <SelectItem key={m.userId} value={m.userId.toString()}>{m.user.name || m.user.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={createPayment.isPending} className="w-full">
              {createPayment.isPending ? "Saving..." : "Record Payment"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// --- PAGE ---

export function GroupDetailPage() {
  const params = useParams();
  const groupId = parseInt(params.groupId || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: userProfile } = useGetMe();
  const { data: group, isLoading: loadingGroup } = useGetGroup(groupId, { query: { enabled: !!groupId } });
  const { data: balances, isLoading: loadingBalances } = useGetGroupBalances(groupId, { query: { enabled: !!groupId } });
  const { data: expenses, isLoading: loadingExpenses } = useListExpenses(groupId, { query: { enabled: !!groupId } });
  const { data: payments, isLoading: loadingPayments } = useListPayments(groupId, { query: { enabled: !!groupId } });
  
  const deleteExpense = useDeleteExpense();
  const deletePayment = useDeletePayment();

  if (!groupId) return <Layout><div>Invalid group ID</div></Layout>;

  if (loadingGroup) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </Layout>
    );
  }

  if (!group) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold mb-2">Group not found</h2>
          <Button onClick={() => setLocation("/groups")} variant="outline">Back to Groups</Button>
        </div>
      </Layout>
    );
  }

  const currentUserId = userProfile?.id;

  const handleDeleteExpense = (expenseId: number) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    deleteExpense.mutate({ expenseId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getGetGroupBalancesQueryKey(groupId) });
        toast({ title: "Expense deleted" });
      }
    });
  };

  const handleDeletePayment = (paymentId: number) => {
    if (!confirm("Are you sure you want to delete this payment?")) return;
    deletePayment.mutate({ paymentId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(groupId) });
        queryClient.invalidateQueries({ queryKey: getGetGroupBalancesQueryKey(groupId) });
        toast({ title: "Payment deleted" });
      }
    });
  };

  // Process activities list (expenses + payments combined and sorted)
  const combinedActivity = useMemo(() => {
    const list = [];
    if (expenses) {
      list.push(...expenses.map(e => ({ ...e, isPayment: false })));
    }
    if (payments) {
      list.push(...payments.map(p => ({ ...p, isPayment: true })));
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, payments]);

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
            {group.description && <p className="text-muted-foreground mt-1">{group.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <AddExpenseDialog groupId={groupId} members={group.members} currentUserId={currentUserId} />
            <SettleUpDialog groupId={groupId} members={group.members} balances={balances || []} currentUserId={currentUserId} />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingExpenses || loadingPayments ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : combinedActivity.length ? (
                  <div className="space-y-4">
                    {combinedActivity.map((item) => (
                      <div key={`${item.isPayment ? 'p' : 'e'}-${item.id}`} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            item.isPayment ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                          )}>
                            {item.isPayment ? <HandCoins className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-medium">
                              {item.isPayment 
                                ? `${(item as any).fromUser?.name || 'Someone'} paid ${(item as any).toUser?.name || 'someone'}` 
                                : (item as any).description}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.date).toLocaleDateString()}
                              {!item.isPayment && ` • Paid by ${(item as any).paidByUser?.name || 'Someone'}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "font-bold text-right",
                            item.isPayment ? "text-primary" : ""
                          )}>
                            {formatCurrency(item.amount || (item as any).totalAmount)}
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => item.isPayment ? handleDeletePayment(item.id) : handleDeleteExpense(item.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No expenses or payments yet. Add an expense to get started!
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Balances</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingBalances ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : balances?.length ? (
                  <div className="space-y-3">
                    {balances.map((balance, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium">{balance.fromUser.name || balance.fromUser.email}</span> owes{' '}
                        <span className="font-medium">{balance.toUser.name || balance.toUser.email}</span>
                        <div className="font-bold text-primary mt-1">{formatCurrency(balance.amount)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Settled up!
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Members
                  <span className="text-sm font-normal text-muted-foreground">{group.members?.length || 0}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {group.members?.map(member => (
                    <div key={member.id} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {(member.user.name || member.user.email)?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.user.name || member.user.email}</p>
                      </div>
                    </div>
                  ))}
                  
                  <AddMemberDialog groupId={groupId} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
