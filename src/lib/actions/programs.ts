"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { idle, type ActionState } from "@/lib/action-state";
import { collaboratorRole, scanAccess, scanReady, scanRoster, scanToken } from "@/lib/github";
import { getProgram, listTemplates, parseRepoLines } from "@/lib/programs";
import {
  clearRoster,
  deleteCandidate,
  getCandidate,
  setCandidateStatus,
  upsertRoster,
} from "@/lib/roster";
import {
  createProgram,
  deleteProgram,
  updateProgram,
} from "@/lib/programs";

const programSchema = z.object({
  id: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
  nameAr: z.string().trim().min(2, "اسم الحملة قصير جدًا").max(120, "اسم الحملة طويل جدًا"),
  templateId: z.coerce.number().int().positive("اختر قالب الشهادة"),
  contributionFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ البداية غير صالح"),
  contributionTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ النهاية غير صالح"),
  reposText: z.string().trim().min(1, "أضف مستودعًا واحدًا على الأقل"),
  isActive: z.union([z.literal("on"), z.literal("")]).optional(),
});

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

export async function saveProgramAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = programSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "يرجى تصحيح الحقول", errors: flatten(parsed.error) };
  }

  const { id, nameAr, templateId, contributionFrom, contributionTo, reposText, isActive } = parsed.data;

  if (contributionFrom > contributionTo) {
    return {
      ok: false,
      message: "يرجى التحقق من التواريخ",
      errors: { contributionTo: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" },
    };
  }

  const repos = parseRepoLines(reposText);
  if (repos.length === 0) {
    return {
      ok: false,
      message: "لم يتم التعرّف على أي مستودع",
      errors: { reposText: "اكتب المستودعات بصيغة owner/repo" },
    };
  }

  if (!listTemplates().some((template) => template.id === templateId)) {
    return { ok: false, message: "قالب الشهادة غير موجود" };
  }

  const payload = {
    nameAr,
    templateId,
    contributionFrom,
    contributionTo,
    repos,
    isActive: isActive === "on",
  };

  if (id) {
    updateProgram(id, payload);
  } else {
    createProgram(payload);
  }

  revalidatePath("/admin/programs");
  revalidatePath("/admin");
  return {
    ok: true,
    message: id ? `تم تحديث حملة ${nameAr}` : `تم إنشاء حملة ${nameAr} بـ ${repos.length} مستودع`,
  };
}

export async function deleteProgramAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) deleteProgram(id);
  revalidatePath("/admin/programs");
  revalidatePath("/admin");
}

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

const rosterIdSchema = z.coerce.number().int().positive();

/**
 * Every action here mutates campaign data, so each re-checks the session.
 *
 * The admin layout already guards the page, but a server action is its own
 * endpoint and can be invoked directly. Reading the cookie inline keeps
 * `next/headers` out of the client bundle: this module is a "use server" file
 * that a client component imports. Same note as lib/actions/auth.ts.
 */
async function assertAdmin() {
  const store = await cookies();
  if (!verifyAdminToken(store.get(ADMIN_COOKIE)?.value)) redirect("/login");
}

/**
 * Ask GitHub who should be on this campaign's list.
 *
 * Runs inline rather than in the background: an admin is waiting for the answer,
 * and the scan is bounded (see ROSTER_MAX_PRS_PER_REPO) so it finishes in a
 * sensible time or reports that it could not.
 */
export async function refreshRosterAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertAdmin();

  const parsed = rosterIdSchema.safeParse(formData.get("programId"));
  if (!parsed.success) return { ok: false, message: "حملة غير صالحة" };

  const program = getProgram(parsed.data);
  if (!program) return { ok: false, message: "الحملة غير موجودة" };
  if (program.repos.length === 0) {
    return { ok: false, message: "أضف مستودعات إلى الحملة قبل تحديث القائمة" };
  }

  const preflight = await scanReady();
  if (!preflight.ok) {
    return { ok: false, message: preflight.error ?? "تعذّر بدء الفحص" };
  }

  // Say up front which repos we can verify supervisors on, so a scan that will
  // produce a wall of "needs review" rows is explained before it runs.
  const token = scanToken();
  const notes: string[] = [];
  const blind: typeof program.repos = [];
  for (const repo of program.repos) {
    if ((await scanAccess(repo, token)) !== "push") blind.push(repo);
  }
  if (blind.length > 0) {
    notes.push(
      `لا يملك التوكن صلاحية إشراف على: ${blind.map((r) => `${r.owner}/${r.repo}`).join("، ")} — ` +
        `سيُسجَّل أصحاب هذه المساهمات كـ«يحتاج مراجعة» بدل اعتمادهم تلقائيًا.`,
    );
  }

  let scan: Awaited<ReturnType<typeof scanRoster>>;
  try {
    scan = await scanRoster(
      {
        repos: program.repos,
        contributionFrom: program.contributionFrom,
        contributionTo: program.contributionTo,
      },
      token,
    );
  } catch (error) {
    return {
      ok: false,
      message: `تعذّر الفحص: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const summary = upsertRoster(program.id, scan.entries);

  revalidatePath("/admin/programs");
  revalidatePath("/admin");

  return {
    ok: true,
    message:
      `قُرئت القائمة: ${summary.total} شخصًا — ` +
      `${summary.eligible} مؤهل، ${summary.unverified} يحتاج مراجعة، ` +
      `${summary.claimed} استلم شهادته، ${summary.maintainer} مشرف.`,
    notes: [...notes, ...scan.notes],
  };
}

/**
 * Re-read one person's role and settle their row.
 *
 * This is the escape hatch for the `unverified` rows a scan leaves behind when
 * the scan token has no push access to a listed repo: the admin points at the
 * person, and the answer is fetched fresh rather than assumed.
 */
export async function recheckCandidateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertAdmin();

  const programId = rosterIdSchema.safeParse(formData.get("programId"));
  const candidateId = rosterIdSchema.safeParse(formData.get("candidateId"));
  if (!programId.success || !candidateId.success) return { ok: false, message: "طلب غير صالح" };

  const program = getProgram(programId.data);
  const candidate = getCandidate(candidateId.data);
  if (!program || !candidate) return { ok: false, message: "الحملة أو السجل غير موجود" };
  if (candidate.status === "claimed") {
    return { ok: false, message: "استلم شهادته بالفعل" };
  }

  const preflight = await scanReady();
  if (!preflight.ok) return { ok: false, message: preflight.error ?? "تعذّر الفحص" };

  let status: "eligible" | "maintainer" | "unverified" = "unverified";
  let reason = "لم تتغيّر صلاحية الإشراف";
  let blocker = "";
  for (const repo of program.repos) {
    const role = await collaboratorRole(repo, candidate.githubLogin, scanToken());
    if (role === "admin" || role === "maintain") {
      status = "maintainer";
      blocker = `${repo.owner}/${repo.repo}`;
      break;
    }
    if (role === "member") {
      status = "eligible";
      reason = "ليست له صلاحية إشراف على مستودعات الحملة";
    }
  }
  if (status === "maintainer") reason = `مشرف على ${blocker}`;

  setCandidateStatus(candidate.id, status, reason, { manual: false });
  revalidatePath("/admin/programs");
  return { ok: true, message: `${candidate.githubLogin}: ${reason}` };
}

/** Let the admin settle a row by hand, which is the point of "one by one". */
export async function decideCandidateAction(formData: FormData): Promise<void> {
  await assertAdmin();

  const candidateId = rosterIdSchema.safeParse(formData.get("candidateId"));
  const decision = z.enum(["eligible", "maintainer", "excluded"]).safeParse(formData.get("decision"));
  if (!candidateId.success || !decision.success) return;

  const reason =
    decision.data === "eligible"
      ? "مؤهل — حُدّد يدويًا"
      : decision.data === "maintainer"
        ? "مشرف — حُدّد يدويًا"
        : "مستبعد من القائمة";

  setCandidateStatus(candidateId.data, decision.data, reason);
  revalidatePath("/admin/programs");
}

export async function removeCandidateAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const candidateId = rosterIdSchema.safeParse(formData.get("candidateId"));
  if (candidateId.success) deleteCandidate(candidateId.data);
  revalidatePath("/admin/programs");
}

/** Wipe a scan's output, keeping anyone who already claimed. */
export async function clearRosterAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const programId = rosterIdSchema.safeParse(formData.get("programId"));
  if (programId.success) clearRoster(programId.data);
  revalidatePath("/admin/programs");
}
