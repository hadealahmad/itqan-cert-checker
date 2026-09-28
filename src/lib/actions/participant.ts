"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PARTICIPANT_COOKIE, verifyParticipantToken, type ParticipantSession } from "@/lib/auth";
import { idle, type ActionState } from "@/lib/action-state";
import {
  DuplicateCertificateError,
  certificatesForUser,
  getCertificateById,
  getUser,
  issueCertificate,
  updateCertificateDetails,
  updateUser,
} from "@/lib/certs";
import { GENDERS } from "@/lib/gender-text";
import { deleteRenderedFiles } from "@/lib/render";
import { getProgram } from "@/lib/programs";

/**
 * Read the participant cookie inline: this file is a "use server" module that
 * client components import, so it must reach `next/headers` directly rather
 * than through another module. See lib/actions/auth.ts for the same note.
 */
async function currentParticipant(): Promise<ParticipantSession | null> {
  const store = await cookies();
  return verifyParticipantToken(store.get(PARTICIPANT_COOKIE)?.value);
}

const claimSchema = z.object({
  programId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive(),
  name: z.string().trim().min(3, "الاسم قصير جدًا").max(120, "الاسم طويل جدًا"),
  gender: z.enum(GENDERS, { error: "الرجاء تحديد الجنس" }),
});

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

/**
 * A participant claims their certificate of participation.
 *
 * Re-checks eligibility server-side: the browser result is only a hint, and the
 * session cookie alone must not be enough to mint a certificate.
 */
export async function claimCertificateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const participant = await currentParticipant();
  if (!participant) {
    redirect("/login");
  }

  const parsed = claimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "يرجى تصحيح الحقول", errors: flatten(parsed.error) };
  }

  const { programId, templateId, name, gender } = parsed.data;
  const program = getProgram(programId);
  if (!program || program.templateId !== templateId) {
    return { ok: false, message: "الحملة غير متاحة" };
  }

  // The user must be linked and currently marked eligible.
  const user = getUser(participant.userId);
  if (!user || user.githubId === null) {
    return { ok: false, message: "يجب تسجيل الدخول عبر GitHub" };
  }
  if (user.lastEligible !== 1) {
    return { ok: false, message: "أنت غير مؤهل للحصول على شهادة لهذه الحملة" };
  }

  // Name and gender are the participant's to set, and both affect the wording.
  updateUser(user.id, { name, gender });
  for (const cert of certificatesForUser(user.id)) {
    await deleteRenderedFiles(cert.code).catch(() => undefined);
  }

  try {
    const cert = issueCertificate({
      userId: user.id,
      templateId,
      programId,
      source: "self",
      issuedOn: new Date().toISOString().slice(0, 10),
    });
    revalidatePath("/my/certificate");
    revalidatePath("/admin/certs");
    revalidatePath("/admin");
    return { ok: true, message: `تم إصدار شهادتك: ${cert.code}` };
  } catch (error) {
    if (error instanceof DuplicateCertificateError) {
      revalidatePath("/my/certificate");
      return { ok: false, message: "لديك شهادة لهذه الحملة بالفعل" };
    }
    throw error;
  }
}

const editSchema = z.object({
  certificateId: z.coerce.number().int().positive(),
  name: z.string().trim().min(3, "الاسم قصير جدًا").max(120, "الاسم طويلًا"),
  gender: z.enum(GENDERS, { error: "الرجاء تحديد الجنس" }),
});

/**
 * A participant edits the name and gender printed on a certificate they own.
 * The rendered file is dropped so the next download reflects the change.
 */
export async function editMyCertificateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const participant = await currentParticipant();
  if (!participant) redirect("/login");

  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "يرجى تصحيح الحقول", errors: flatten(parsed.error) };
  }

  const { certificateId, name, gender } = parsed.data;
  const cert = getCertificateById(certificateId);
  if (!cert || cert.userId !== participant.userId) {
    return { ok: false, message: "لا يمكنك تعديل هذه الشهادة" };
  }
  if (cert.status === "revoked") {
    return { ok: false, message: "لا يمكن تعديل شهادة ملغاة" };
  }

  updateCertificateDetails(cert.id, { name, gender });
  await deleteRenderedFiles(cert.code).catch(() => undefined);

  revalidatePath("/my/certificate");
  revalidatePath("/admin/certs");
  return { ok: true, message: "تم تحديث بيانات الشهادة" };
}
