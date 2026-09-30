"use client";

import { useActionState, useState } from "react";
import { Check, Pencil, RefreshCw, ShieldOff, Trash2 } from "lucide-react";

import {
  clearRosterAction,
  decideCandidateAction,
  recheckCandidateAction,
  refreshRosterAction,
  removeCandidateAction,
} from "@/lib/actions/programs";
import { idle } from "@/lib/action-state";
import type { CandidateRow, RosterSummary } from "@/lib/roster";
import type { ProgramWithRepos } from "@/lib/repo-ref";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* ------------------------------------------------------------------ *
 * Roster panel — the list of people a campaign scan found
 * ------------------------------------------------------------------ */

const STATUS_LABEL: Record<CandidateRow["status"], string> = {
  eligible: "مؤهل",
  unverified: "يحتاج مراجعة",
  maintainer: "مشرف",
  claimed: "استلم شهادته",
  excluded: "مستبعد",
};

const STATUS_CLASS: Record<CandidateRow["status"], string> = {
  eligible: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unverified: "border-amber-300 bg-amber-50 text-amber-900",
  maintainer: "border-border bg-muted text-muted-foreground",
  claimed: "border-sky-200 bg-sky-50 text-sky-800",
  excluded: "border-border bg-muted text-muted-foreground line-through",
};

function StatusBadge({ status }: { status: CandidateRow["status"] }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** Tooltips need a provider; this panel has no other one. */
function TooltipScope({ children }: { children: React.ReactNode }) {
  return <TooltipProvider delayDuration={200}>{children}</TooltipProvider>;
}

export function RosterPanel({
  program,
  candidates,
  summary,
  scanConfigured,
}: {
  program: ProgramWithRepos;
  candidates: CandidateRow[];
  summary: RosterSummary;
  scanConfigured: boolean;
}) {
  const [scanState, scanAction, scanning] = useActionState(refreshRosterAction, idle);
  const [recheckState, recheckAction, rechecking] = useActionState(recheckCandidateAction, idle);
  const [confirmClear, setConfirmClear] = useState(false);

  const pending = scanning || rechecking;

  return (
    <TooltipScope>
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">قائمة المؤهلين</p>
          {summary.total > 0 ? (
            <span className="text-xs text-muted-foreground">
              {summary.eligible} مؤهل · {summary.unverified} مراجعة · {summary.claimed} استلم ·{" "}
              {summary.maintainer} مشرف
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <form action={scanAction}>
            <input type="hidden" name="programId" value={program.id} />
            <Button type="submit" size="sm" disabled={pending || !scanConfigured}>
              {scanning ? "جارٍ الفحص…" : "تحديث قائمة المؤهلين"}
            </Button>
          </form>
          {summary.total > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmClear(true)}
              disabled={pending}
            >
              إفراغ
            </Button>
          ) : null}
        </div>
      </div>

      {!scanConfigured ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          يُقرأ الفحص من GitHub مباشرة، ويحتاج{" "}
          {/* dir=ltr + isolate keeps the Latin token from being reordered by the
              surrounding Arabic text. */}
          <span className="ltr font-mono">GITHUB_SCAN_TOKEN</span>{" "}
          منحًا بصلاحية قراءة مستودعات المؤسسة — وإلا فلن نستطيع معرفة من يشرف على أي
          مستودع.
        </p>
      ) : null}

      {scanState.message ? (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            scanState.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          <p>{scanState.message}</p>
          {scanState.notes?.length ? (
            <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs opacity-80">
              {scanState.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {recheckState.message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {recheckState.message}
        </p>
      ) : null}

      {summary.unverified > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {summary.unverified} شخصًا يحتاجون مراجعة: لم نتمكن من قراءة صلاحية إشرافهم على مستودعات
          الحملة. اعتمدهم واحدًا واحدًا بزر «قرار يدوي»، أو أضف توكن بصلاحية إشراف على المستودعات،
          أو اكتب أسماء المشرفين في خانة «مشرفو الحملة» لتُستبعد تلقائيًا.
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          لم يُفحص بعد. اضغط «تحديث قائمة المؤهلين» ليقرأ النظام المساهمات المدمجة داخل الفترة
          ويستخرج من يستحق الشهادة.
        </p>
      ) : (
        /* A plain overflow container, not ScrollArea: with only a max-height the
           viewport did not clip, so rows spilled out past the border and covered
           the page. Native overflow is also the horizontal scrollbar for free. */
        <div className="max-h-[26rem] overflow-auto rounded-md border">
          <Table className="min-w-[34rem]">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>المشارك</TableHead>
                <TableHead className="w-40">الحالة</TableHead>
                <TableHead className="w-28 text-center">مساهمات مدمجة</TableHead>
                <TableHead className="w-28 text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((row) => (
                <CandidateRowView
                  key={row.id}
                  row={row}
                  programId={program.id}
                  recheckAction={recheckAction}
                  busy={pending}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {confirmClear ? (
        <ClearRosterDialog
          program={program}
          summary={summary}
          onClose={() => setConfirmClear(false)}
        />
      ) : null}
    </div>
    </TooltipScope>
  );
}

function CandidateRowView({
  row,
  programId,
  recheckAction,
  busy,
}: {
  row: CandidateRow;
  programId: number;
  recheckAction: (payload: FormData) => void;
  busy: boolean;
}) {
  const [deciding, setDeciding] = useState(false);
  const claimed = row.status === "claimed";

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          {row.avatarUrl ? (
            // Avatars come from github.com; plain img keeps us off the next/image host list.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.avatarUrl} alt="" className="h-6 w-6 rounded-full" loading="lazy" />
          ) : null}
          <a
            href={row.profileUrl ?? `https://github.com/${row.githubLogin}`}
            target="_blank"
            rel="noreferrer noopener"
            className="ltr truncate font-mono text-sm hover:underline"
          >
            {row.githubLogin}
          </a>
        </div>
        {/* The repo moves under the name: as a column it was the widest thing
            here, and it pushed the actions off the edge of the card. */}
        {row.qualifiedIn ? (
          row.evidenceUrl ? (
            <a
              href={row.evidenceUrl}
              target="_blank"
              rel="noreferrer noopener"
              title="شاهد المساهمة المدمجة"
              className="ltr mt-0.5 block truncate font-mono text-xs text-muted-foreground hover:underline"
            >
              {row.qualifiedIn}
            </a>
          ) : (
            <span className="ltr mt-0.5 block truncate font-mono text-xs text-muted-foreground">
              {row.qualifiedIn}
            </span>
          )
        ) : null}
        {/* Reasons repeat identically across a whole scan, so they are shown in
            the summary above rather than on all 70 rows. */}
        {row.reason && row.status !== "unverified" && row.status !== "eligible" ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={row.reason}>
            {row.reason}
          </p>
        ) : null}
      </TableCell>

      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>

      <TableCell className="text-center tabular-nums">{row.mergedPrCount}</TableCell>

      <TableCell className="text-left">
        {claimed ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : deciding ? (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  aria-label="اعتماد كمؤهل"
                  onClick={() => {
                    const data = new FormData();
                    data.set("candidateId", String(row.id));
                    data.set("decision", "eligible");
                    decideCandidateAction(data);
                    setDeciding(false);
                  }}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>اعتماد كمؤهل</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  aria-label="اعتماد كمشرف"
                  onClick={() => {
                    const data = new FormData();
                    data.set("candidateId", String(row.id));
                    data.set("decision", "maintainer");
                    decideCandidateAction(data);
                    setDeciding(false);
                  }}
                >
                  <ShieldOff className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>اعتماد كمشرف (غير مؤهل)</TooltipContent>
            </Tooltip>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDeciding(false)}>
              إلغاء
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <form action={recheckAction}>
                  <input type="hidden" name="programId" value={programId} />
                  <input type="hidden" name="candidateId" value={row.id} />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="إعادة الفحص من GitHub"
                    disabled={busy}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </form>
              </TooltipTrigger>
              <TooltipContent>إعادة الفحص من GitHub</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label="قرار يدوي"
                  onClick={() => setDeciding(true)}
                  disabled={busy}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>قرار يدوي</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <form
                  action={async (formData) => {
                    formData.set("candidateId", String(row.id));
                    await removeCandidateAction(formData);
                  }}
                >
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="حذف من القائمة"
                    disabled={busy}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </TooltipTrigger>
              <TooltipContent>حذف من القائمة</TooltipContent>
            </Tooltip>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function ClearRosterDialog({
  program,
  summary,
  onClose,
}: {
  program: ProgramWithRepos;
  summary: RosterSummary;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const claimed = summary.claimed;

  async function clear() {
    setPending(true);
    const data = new FormData();
    data.set("programId", String(program.id));
    await clearRosterAction(data);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>إفراغ القائمة</DialogTitle>
          <DialogDescription>
            سيُحذف ما لم يتبقَّ منه إلا {claimed} شخصًا استلموا شهاداتهم. الشهادات نفسها لا تُمس.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            تراجع
          </Button>
          <Button variant="destructive" onClick={clear} disabled={pending}>
            {pending ? "جارٍ الإفراغ…" : "إفراغ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
