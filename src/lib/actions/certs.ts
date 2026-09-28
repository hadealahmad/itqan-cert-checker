"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import {
  DuplicateCertificateError,
  deleteCertificate as deleteCertificateRow,
  getCertificateById,
  getUser,
  issueCertificate as issueCertificateRow,
  setCertStatus,
} from "@/lib/certs";
import { deleteRenderedFiles } from "@/lib/render";
import type { ActionState } from "@/lib/action-state";

const issueSchema = z.object({
  userIds: z.array(z.coerce.number().int().positive()).min(1, "اختر مستخدمًا واحدًا على الأقل"),
  templateId: z.coerce.number().int().positive("اختر قالب الشهادة"),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح"),
  description: z
    .union([z.literal(""), z.string().trim().max(1000)])
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function issueCertificatesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = issueSchema.safeParse({
    userIds: formData.getAll("userIds"),
    templateId: String(formData.get("templateId") ?? ""),
    issuedOn: String(formData.get("issuedOn") ?? ""),
    description: String(formData.get("description") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  // One certificate per person per template, whoever issues it.
  const issued: string[] = [];
  const skipped: string[] = [];
  for (const userId of parsed.data.userIds) {
    try {
      const cert = issueCertificateRow({
        userId,
        templateId: parsed.data.templateId,
        source: "admin",
        issuedOn: parsed.data.issuedOn,
        description: parsed.data.description,
      });
      issued.push(cert.code);
    } catch (error) {
      if (error instanceof DuplicateCertificateError) {
        skipped.push(getUser(userId)?.name ?? String(userId));
        continue;
      }
      throw error;
    }
  }

  revalidatePath("/admin/certs");
  revalidatePath("/admin");

  const parts = [`تم إصدار ${issued.length} شهادة`];
  if (issued.length > 0) parts.push(issued.join("، "));
  if (skipped.length > 0) parts.push(`تُخطّي ${skipped.length} (لديهم شهادة لنفس القالب): ${skipped.join("، ")}`);

  return { ok: true, message: parts.join(" — ") };
}

export async function setCertStatusAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(id) || (status !== "issued" && status !== "revoked")) return;

  setCertStatus(id, status, String(formData.get("reason") ?? "") || null);
  revalidatePath("/admin/certs");
}

export async function deleteCertificateAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const cert = Number.isInteger(id) ? getCertificateById(id) : undefined;
  if (!cert) return;

  deleteCertificateRow(id);
  await deleteRenderedFiles(cert.code).catch(() => undefined);
  revalidatePath("/admin/certs");
  revalidatePath("/admin");
}
