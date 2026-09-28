"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import {
  deleteCertificate as deleteCertificateRow,
  getCertificateById,
  issueCertificate as issueCertificateRow,
  setCertStatus,
} from "@/lib/certs";
import { deleteRenderedFiles, renderCertificate } from "@/lib/render";
import type { ActionState } from "@/lib/action-state";

const issueSchema = z.object({
  userIds: z.array(z.coerce.number().int().positive()).min(1, "اختر مستخدمًا واحدًا على الأقل"),
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
    issuedOn: String(formData.get("issuedOn") ?? ""),
    description: String(formData.get("description") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  const issued: string[] = [];
  for (const userId of parsed.data.userIds) {
    const cert = issueCertificateRow({
      userId,
      issuedOn: parsed.data.issuedOn,
      description: parsed.data.description,
    });
    issued.push(cert.code);
  }

  revalidatePath("/admin/certs");
  revalidatePath("/admin");
  return { ok: true, message: `تم إصدار ${issued.length} شهادة: ${issued.join("، ")}` };
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

/** Render one certificate now (admin "generate" button). */
export async function renderCertificateAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await renderCertificate(id).catch(() => undefined);
  revalidatePath("/admin/certs");
}
