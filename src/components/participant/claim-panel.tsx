"use client";

import { CheckCircle2, Github, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GENDER_LABELS, GENDERS, type Gender } from "@/lib/gender-text";

export function GenderPicker({
  name,
  value,
  onChange,
  error,
}: {
  name: string;
  value: Gender;
  onChange: (next: Gender) => void;
  error?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">الجنس</legend>
      {/* Controlled via a hidden input so the choice always reaches the form. */}
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="الجنس">
        {GENDERS.map((gender) => (
          <button
            key={gender}
            type="button"
            role="radio"
            aria-checked={value === gender}
            onClick={() => onChange(gender)}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent ${
              value === gender ? "border-primary bg-primary/5 font-medium" : "border-border"
            }`}
          >
            {GENDER_LABELS[gender]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">يُستخدم لتذكير وتأنيث نص الشهادة</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}

function CrossItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
      <span>{children}</span>
    </li>
  );
}

export interface ClaimFormProps {
  programId: number;
  templateId: number;
  programName: string | null;
  defaultName: string;
  defaultGender: Gender;
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: { ok: boolean; message: string; errors?: Record<string, string> };
}

/** Shown to a signed-in participant who passed the check and has no cert yet. */
export function ClaimPanel(props: ClaimFormProps) {
  const [gender, setGender] = useState<Gender>(props.defaultGender);
  const { programId, templateId, programName, defaultName, formAction, pending, state } = props;

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="space-y-1 text-center">
          <p className="text-base font-semibold">أهلًا بك، أنت مؤهل</p>
          {programName ? <p className="text-sm text-muted-foreground">حملة {programName}</p> : null}
        </div>

        <ul className="space-y-2 text-muted-foreground">
          <CheckItem>تحقّقنا من وجود مساهمة مدمجة لك في أحد مستودعات الحملة</CheckItem>
          <CheckItem>يمكنك تنزيل شهادتك مباشرة بصيغة PDF</CheckItem>
        </ul>

        <form action={formAction} className="space-y-4 border-t pt-5">
          <input type="hidden" name="programId" value={programId} />
          <input type="hidden" name="templateId" value={templateId} />

          <div className="space-y-2">
            <label htmlFor="claim-name" className="text-sm font-medium">
              الاسم كما سيظهر على الشهادة
            </label>
            <input
              id="claim-name"
              name="name"
              required
              minLength={3}
              defaultValue={defaultName}
              aria-invalid={Boolean(state.errors?.name)}
              className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {state.errors?.name ? (
              <p className="text-sm text-destructive">{state.errors.name}</p>
            ) : (
              <p className="text-xs text-muted-foreground">الاسم مأخوذ من ملف GitHub، ويمكنك تعديله.</p>
            )}
          </div>

          <GenderPicker name="gender" value={gender} onChange={setGender} error={state.errors?.gender} />

          {!state.ok && state.message ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <Button type="submit" className="h-11 w-full" disabled={pending}>
            <Github className="size-4" />
            {pending ? "جارٍ الإصدار…" : "استلم شهادتي"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Shown when the eligibility check did not pass, with the reason spelled out. */
export function IneligiblePanel({
  programName,
  githubLogin,
  window,
  repos,
}: {
  programName: string | null;
  githubLogin: string;
  window: { from: string; to: string };
  repos: string[];
}) {
  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="space-y-1 text-center">
          <p className="text-base font-semibold text-amber-700">أنت غير مؤهل لهذه الحملة</p>
          {programName ? <p className="text-sm text-muted-foreground">حملة {programName}</p> : null}
        </div>

        <ul className="space-y-2 text-muted-foreground">
          <CrossItem>
            يلزم وجود مساهمة مدمجة (Pull Request) من حسابك{" "}
            <span className="ltr">@{githubLogin}</span> خلال الفترة المحددة
          </CrossItem>
          <CrossItem>لا يمكن أن تكون من المشرفين (maintainers) لهذه المستودعات</CrossItem>
        </ul>

        <dl className="space-y-2 rounded-lg bg-muted p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">الفترة</dt>
            <dd className="ltr font-medium">
              {window.from} ← {window.to}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">المستودعات</dt>
            <dd className="text-left font-mono text-xs">{repos.join(", ") || "—"}</dd>
          </div>
        </dl>

        <p className="text-center text-xs text-muted-foreground">
          إن كنت ترى أن هذا خطأ، تواصل مع مشرف الحملة.
        </p>
      </CardContent>
    </Card>
  );
}
