"use client";

import { Download, Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";

import { GenderPicker } from "@/components/participant/claim-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { editMyCertificateAction } from "@/lib/actions/participant";
import { idle } from "@/lib/action-state";
import type { Gender } from "@/lib/gender-text";

export interface OwnedCertificate {
  id: number;
  code: string;
  issuedOn: string;
  gregorian: string;
  hijri: string;
  status: "issued" | "revoked";
  revokeReason: string | null;
  printToken: string;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${mono ? "ltr tracking-wide" : ""}`}>{value}</span>
    </div>
  );
}

/** Shown once a participant holds a certificate: details, download, edit. */
export function CertificatePanel({
  certificate,
  currentName,
  currentGender,
  programName,
}: {
  certificate: OwnedCertificate;
  currentName: string;
  currentGender: Gender;
  programName: string | null;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <Card>
        <CardContent className="space-y-5 py-6">
          <div className="space-y-1 text-center">
            <p className="text-base font-semibold">شهادتك جاهزة</p>
            {programName ? <p className="text-sm text-muted-foreground">حملة {programName}</p> : null}
          </div>

          {certificate.status === "revoked" ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
              تم إلغاء هذه الشهادة
              {certificate.revokeReason ? `: ${certificate.revokeReason}` : ""}
            </div>
          ) : null}

          <div>
            <Row label="الاسم" value={currentName} />
            <Row label="رقم الشهادة" value={certificate.code} mono />
            <Row label="تاريخ الإصدار" value={certificate.gregorian} />
            <Row label="التاريخ الهجري" value={certificate.hijri} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-11 flex-1">
              <a href={`/p/${certificate.printToken}/download?format=pdf`} download>
                <Download className="size-4" />
                تحميل الشهادة (PDF)
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:w-11"
              aria-label="تعديل الاسم"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <EditDialog
        open={editing}
        onOpenChange={setEditing}
        certificateId={certificate.id}
        defaultName={currentName}
        defaultGender={currentGender}
      />
    </>
  );
}

function EditDialog({
  open,
  onOpenChange,
  certificateId,
  defaultName,
  defaultGender,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  certificateId: number;
  defaultName: string;
  defaultGender: Gender;
}) {
  const [state, formAction, pending] = useActionState(editMyCertificateAction, idle);
  const [gender, setGender] = useState<Gender>(defaultGender);
  const [name, setName] = useState(defaultName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل بيانات الشهادة</DialogTitle>
          <DialogDescription>
            سيُعاد توليد ملف PDF عند التحميل التالي.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="certificateId" value={certificateId} />

          <div className="space-y-2">
            <Label htmlFor="edit-name">الاسم</Label>
            <Input
              id="edit-name"
              name="name"
              required
              minLength={3}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(state.errors?.name)}
            />
            {state.errors?.name ? (
              <p className="text-sm text-destructive">{state.errors.name}</p>
            ) : null}
          </div>

          <GenderPicker name="gender" value={gender} onChange={setGender} error={state.errors?.gender} />

          {!state.ok && state.message ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={pending}
              onClick={() => {
                if (state.ok) toast.success(state.message);
              }}
            >
              {pending ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
