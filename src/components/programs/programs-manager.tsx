"use client";

import { useActionState, useEffect, useState } from "react";

import { deleteProgramAction, saveProgramAction } from "@/lib/actions/programs";
import { idle } from "@/lib/action-state";
import {
  parseMaintainerLines,
  parseRepoLines,
  type ProgramWithRepos,
} from "@/lib/repo-ref";

import { toISODate } from "@/lib/dates";

import { RosterPanel } from "@/components/programs/roster-panel";

import type { CandidateRow, RosterSummary } from "@/lib/roster";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface TemplateOption {
  id: number;
  slug: string;
  nameAr: string;
}

export interface RosterData {
  candidates: CandidateRow[];
  summary: RosterSummary;
  /** Lowercased logins the admin declared as supervisors. */
  maintainers: string[];
}

export function ProgramsManager({
  programs,
  templates,
  rosters,
  scanConfigured,
}: {
  programs: ProgramWithRepos[];
  templates: TemplateOption[];
  rosters: Record<number, RosterData>;
  scanConfigured: boolean;
}) {
  const [editing, setEditing] = useState<ProgramWithRepos | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProgramWithRepos | null>(null);
  const [showRoster, setShowRoster] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>حملة جديدة</Button>
      </div>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            لا توجد حملات بعد. أنشئ حملة لتحديد المستودعات والفترة، ليتمكن المشاركون من
            استلام شهاداتهم عبر GitHub.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {programs.map((program) => (
            <Card key={program.id}>
              <CardContent className="flex flex-wrap items-start gap-4 py-5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{program.nameAr}</p>
                    {program.isActive ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                        مفعّلة
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                        متوقفة
                      </Badge>
                    )}
                    <Badge variant="secondary">{program.templateName}</Badge>
                  </div>
                  <p className="ltr text-sm text-muted-foreground">
                    {program.contributionFrom} ← {program.contributionTo}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {program.repos.map((repo) => `${repo.owner}/${repo.repo}`).join("  ·  ") || "—"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRoster(showRoster === program.id ? null : program.id)}
                  >
                    {showRoster === program.id ? "إخفاء القائمة" : "قائمة المؤهلين"}
                    {rosters[program.id]?.summary.total
                      ? ` (${rosters[program.id]!.summary.total})`
                      : ""}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(program)}>
                    تعديل
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleting(program)}
                  >
                    حذف
                  </Button>
                </div>
              </CardContent>
              {showRoster === program.id ? (
                <CardContent className="pt-0">
                  <RosterPanel
                    program={program}
                    candidates={rosters[program.id]?.candidates ?? []}
                    summary={
                      rosters[program.id]?.summary ?? {
                        total: 0,
                        eligible: 0,
                        unverified: 0,
                        maintainer: 0,
                        claimed: 0,
                        excluded: 0,
                      }
                    }
                    scanConfigured={scanConfigured}
                  />
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {creating ? (
        <ProgramDialog open onOpenChange={setCreating} templates={templates} />
      ) : null}
      {editing ? (
        <ProgramDialog
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          templates={templates}
          program={editing}
          maintainers={rosters[editing.id]?.maintainers ?? []}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog program={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </div>
  );
}

function ProgramDialog({
  open,
  onOpenChange,
  templates,
  program,
  maintainers = [],
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  templates: TemplateOption[];
  program?: ProgramWithRepos;
  maintainers?: string[];
}) {
  const [state, formAction, pending] = useActionState(saveProgramAction, idle);
  const [reposText, setReposText] = useState(() =>
    program ? program.repos.map((repo) => `${repo.owner}/${repo.repo}`).join("\n") : "",
  );
  const [templateId, setTemplateId] = useState(String(program?.templateId ?? templates[0]?.id ?? ""));
  const [maintainersText, setMaintainersText] = useState(() => maintainers.join("\n"));
  const parsedMaintainers = parseMaintainerLines(maintainersText);

  // Close on success, so the saved campaign is visible in the list behind. Left
  // open, the overlay blocks the whole page and the result is only a line of
  // text nobody asked for.
  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state.ok, onOpenChange]);

  const parsed = parseRepoLines(reposText);
  const duplicates = new Set(
    reposText
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((line) => line.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{program ? "تعديل الحملة" : "حملة جديدة"}</DialogTitle>
          <DialogDescription>
            يحدد الفترة والمستودعات التي تُحتسب مساهماتها، ويؤثر ذلك على من يستطيع استلام شهادة.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {program ? <input type="hidden" name="id" value={program.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="program-name">اسم الحملة</Label>
            <Input
              id="program-name"
              name="nameAr"
              required
              defaultValue={program?.nameAr}
              placeholder="كود يخدم القرآن ٢٠٢٦"
              aria-invalid={Boolean(state.errors?.nameAr)}
            />
            {state.errors?.nameAr ? (
              <p className="text-sm text-destructive">{state.errors.nameAr}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="program-template">قالب الشهادة</Label>
            <Select name="templateId" value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="program-template">
                <SelectValue placeholder="اختر القالب" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={String(template.id)}>
                    {template.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="templateId" value={templateId} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="program-from">من تاريخ</Label>
              <Input
                id="program-from"
                name="contributionFrom"
                type="date"
                dir="ltr"
                required
                defaultValue={program?.contributionFrom ?? toISODate(new Date())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="program-to">إلى تاريخ</Label>
              <Input
                id="program-to"
                name="contributionTo"
                type="date"
                dir="ltr"
                required
                defaultValue={program?.contributionTo ?? toISODate(new Date())}
                aria-invalid={Boolean(state.errors?.contributionTo)}
              />
              {state.errors?.contributionTo ? (
                <p className="text-sm text-destructive">{state.errors.contributionTo}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="program-repos">المستودعات</Label>
            <Textarea
              id="program-repos"
              name="reposText"
              rows={6}
              required
              value={reposText}
              onChange={(event) => setReposText(event.target.value)}
              placeholder={"itqan-org/repo-one\nitqan-org/repo-two"}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {parsed.length > 0
                ? `سيتم اعتماد ${parsed.length} مستودع`
                : "اكتب كل مستودع في سطر، بصيغة owner/repo"}
              {duplicates.size > parsed.length ? " (توجد مدخلات مكررة)" : ""}
            </p>
            {state.errors?.reposText ? (
              <p className="text-sm text-destructive">{state.errors.reposText}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="program-maintainers">مشرفو الحملة</Label>
            <Textarea
              id="program-maintainers"
              name="maintainersText"
              rows={3}
              value={maintainersText}
              onChange={(event) => setMaintainersText(event.target.value)}
              placeholder={"@username-one\nusername-two"}
              aria-describedby="program-maintainers-help"
              className="font-mono text-sm"
            />
            <p id="program-maintainers-help" className="text-xs text-muted-foreground">
              {parsedMaintainers.length > 0
                ? `سيُستبعد ${parsedMaintainers.length} مشرفًا تلقائيًا، بصرف النظر عن أي توكن`
                : "اختياري.GitHub لا يعلن من يشرف على مستودع عام إلا بصلاحية إشراف عليه، فاكتب أسماء مشرفي الحملة هنا ليُستبعدوا تلقائيًا."}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="isActive"
              defaultChecked={program?.isActive ?? true}
              aria-label="تفعيل الحملة"
            />
            الحملة مفعّلة (يظهرها المشاركون)
          </label>

          {!state.ok && state.message ? (
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

function DeleteDialog({
  program,
  onClose,
}: {
  program: ProgramWithRepos;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    const formData = new FormData();
    formData.set("id", String(program.id));
    await deleteProgramAction(formData);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>حذف الحملة</DialogTitle>
          <DialogDescription>
            سيتم حذف حملة <span className="font-medium text-foreground">{program.nameAr}</span>.
            الشهادات المرتبطة بها تبقى، لكن يتوقف المطابقة بها.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            تراجع
          </Button>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending ? "جارٍ الحذف…" : "حذف"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
