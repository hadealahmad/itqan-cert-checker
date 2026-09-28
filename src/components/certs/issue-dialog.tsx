"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { issueCertificatesAction } from "@/lib/actions/certs";
import { idle, type ActionState } from "@/lib/action-state";
import { toISODate } from "@/lib/dates";

export interface IssuableUser {
  id: number;
  name: string;
}

export function IssueDialog({
  open,
  onOpenChange,
  users,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  users: IssuableUser[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    issueCertificatesAction,
    idle,
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message, { duration: 6000 });
      setSelected(new Set());
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? users.filter((user) => user.name.toLowerCase().includes(q)) : users;
  }, [users, filter]);

  function toggle(id: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>إصدار شهادات</DialogTitle>
          <DialogDescription>
            اختر المستلمين ثم حدد تاريخ الإصدار. يُولّد رقم الشهادة تلقائيًا.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="issue-date">تاريخ الإصدار</Label>
              <Input
                id="issue-date"
                name="issuedOn"
                type="date"
                dir="ltr"
                required
                defaultValue={toISODate(new Date())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-desc">نص الشهادة (اختياري)</Label>
              <Textarea
                id="issue-desc"
                name="description"
                rows={2}
                placeholder="اتركه فارغًا لاستخدام النص الافتراضي"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>المستلمون ({selected.size})</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="بحث…"
                  className="h-8 w-40"
                  aria-label="بحث عن مستخدم"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected((prev) =>
                      prev.size === visible.length
                        ? new Set()
                        : new Set([...prev, ...visible.map((user) => user.id)]),
                    )
                  }
                >
                  {selected.size === visible.length && visible.length > 0
                    ? "إلغاء التحديد"
                    : "تحديد الكل"}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-56 rounded-md border">
              <div className="p-2">
                {visible.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {users.length === 0 ? "أضف مستخدمين أولًا" : "لا توجد نتائج"}
                  </p>
                ) : (
                  visible.map((user) => {
                    const isSelected = selected.has(user.id);
                    return (
                      <label
                        key={user.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggle(user.id)}
                          aria-label={user.name}
                        />
                        <span className="text-sm">{user.name}</span>
                        {/*
                          Only present when ticked. A hidden input rendered for
                          every row would submit the whole user list and issue a
                          certificate to each of them.
                        */}
                        {isSelected ? (
                          <input type="hidden" name="userIds" value={user.id} />
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {!state.ok && state.message ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending || selected.size === 0}>
              {pending ? "جارٍ الإصدار…" : `إصدار (${selected.size})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
