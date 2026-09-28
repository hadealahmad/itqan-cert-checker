"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  bulkCreateUsersAction,
  createUserAction,
  deleteUserAction,
  updateUserAction,
} from "@/lib/actions/users";
import { idle, type ActionState } from "@/lib/action-state";
import { GENDER_LABELS, GENDERS, type Gender } from "@/lib/gender-text";

export interface UserRow {
  id: number;
  name: string;
  gender: Gender;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

/**
 * Gender drives the wording on the certificate (قد ساهم / قد ساهمت), so it is
 * a required choice rather than an optional detail.
 */
function GenderField({
  defaultValue = "male",
  error,
}: {
  defaultValue?: Gender;
  error?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">الجنس</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="الجنس">
        {GENDERS.map((gender) => (
          <label
            key={gender}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5 has-checked:font-medium hover:bg-accent"
          >
            <input
              type="radio"
              name="gender"
              value={gender}
              defaultChecked={defaultValue === gender}
              className="size-4 accent-primary"
            />
            {GENDER_LABELS[gender]}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        يُستخدم لتذكير وتأنيث نص الشهادة
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ *
 * Create / edit
 * ------------------------------------------------------------------ */

export function UserDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Omit to create a new user. */
  user?: UserRow;
}) {
  const isEdit = Boolean(user);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    isEdit ? updateUserAction : createUserAction,
    idle,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل بيانات مستخدم" : "إضافة مستخدم"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "عدّل البيانات ثم احفظ" : "أدخل اسم المستلم وباقي البيانات"}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={user!.id} />}

          <Field
            label="الاسم"
            name="name"
            error={state.errors?.name}
            defaultValue={user?.name}
            required
            autoFocus
          />
          <GenderField defaultValue={user?.gender} error={state.errors?.gender} />
          <Field
            label="البريد الإلكتروني"
            name="email"
            dir="ltr"
            error={state.errors?.email}
            defaultValue={user?.email ?? ""}
          />
          <Field
            label="رقم الجوال"
            name="phone"
            dir="ltr"
            error={state.errors?.phone}
            defaultValue={user?.phone ?? ""}
          />

          <div className="space-y-2">
            <Label htmlFor="user-notes">ملاحظات</Label>
            <Textarea id="user-notes" name="notes" rows={3} defaultValue={user?.notes ?? ""} />
          </div>

          {!state.ok && state.message && !state.errors ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  error,
  type = "text",
  required,
  autoFocus,
  defaultValue,
  dir,
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  defaultValue?: string;
  dir?: "ltr" | "rtl";
}) {
  const id = `field-${name}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        dir={dir}
        required={required}
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bulk add
 * ------------------------------------------------------------------ */

/**
 * Adds many people at once from a pasted list, one name per line. This replaces
 * the CSV importer: same ergonomics, none of the encoding surprises.
 */
export function BulkUsersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    bulkCreateUsersAction,
    idle,
  );
  const [text, setText] = useState("");
  const [gender, setGender] = useState<Gender>("male");

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      setText("");
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة دفعة</DialogTitle>
          <DialogDescription>
            الصق الأسماء، اسم واحد في كل سطر. يتم تجاهل المكرر تلقائيًا.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label>الجنس للجميع</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="الجنس للجميع">
              {GENDERS.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent has-checked:border-primary has-checked:bg-primary/5 has-checked:font-medium"
                >
                  <input
                    type="radio"
                    name="gender"
                    value={option}
                    checked={gender === option}
                    onChange={() => setGender(option)}
                    className="size-4 accent-primary"
                  />
                  {GENDER_LABELS[option]}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              يُطبَّق على كل الأسماء المُدخلة، ويمكن تعديل الأفراد لاحقًا
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-names">الأسماء</Label>
            <Textarea
              id="bulk-names"
              name="names"
              rows={10}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"محمد أحمد الغامدي\nنورة سعد القحطاني\nعبدالله بن خالد"}
              className="text-sm leading-7"
            />
            <p className="text-xs text-muted-foreground">
              {lineCount > 0 ? `${lineCount} سطر` : "لم يتم إدخال أي سطر بعد"}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending || lineCount === 0}>
              {pending ? "جارٍ الإضافة…" : lineCount ? `إضافة (${lineCount})` : "إضافة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Delete with confirmation
 * ------------------------------------------------------------------ */

export function DeleteUserButton({
  id,
  name,
  certCount,
}: {
  id: number;
  name: string;
  certCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        حذف
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              سيتم حذف <span className="font-medium text-foreground">{name}</span>
              {certCount > 0 && (
                <>
                  {" "}
                  مع{" "}
                  <span className="font-medium text-foreground">{certCount}</span> شهادة مرتبطة به.
                </>
              )}{" "}
              لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const formData = new FormData();
                formData.set("id", String(id));
                try {
                  await deleteUserAction(formData);
                  toast.success("تم الحذف");
                  setOpen(false);
                } catch {
                  toast.error("تعذّر الحذف");
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? "جارٍ الحذف…" : "حذف نهائي"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
