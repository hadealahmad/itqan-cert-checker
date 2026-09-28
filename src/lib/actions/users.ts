"use server";

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { GENDERS, isGender, type Gender } from "@/lib/gender-text";

import {
  createUser as createUserRow,
  certificatesForUser,
  deleteUser as deleteUserRow,
  findUserByNameKey,
  getUser,
  updateUser as updateUserRow,
} from "@/lib/certs";
import type { ActionState, BulkResult } from "@/lib/action-state";
import { deleteRenderedFiles } from "@/lib/render";
import { nameKey } from "@/lib/utils";

const genderSchema = z.enum(GENDERS, { error: "الرجاء تحديد الجنس" });

const userSchema = z.object({
  name: z.string().trim().min(3, "الاسم قصير جدًا").max(120, "الاسم طويل جدًا"),
  gender: genderSchema,
  email: z
    .union([z.literal(""), z.email("البريد الإلكتروني غير صالح")])
    .optional()
    .transform((v) => (v ? v : null)),
  phone: z
    .union([z.literal(""), z.string().trim().max(30)])
    .optional()
    .transform((v) => (v ? v : null)),
  notes: z
    .union([z.literal(""), z.string().trim().max(1000)])
    .optional()
    .transform((v) => (v ? v : null)),
});

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Rendered PDFs/PNGs bake in the wording, so changing a name or a gender makes
 * any existing file wrong. Delete them and the next download regenerates.
 */
async function invalidateRenders(userId: number) {
  const rows = certificatesForUser(userId);
  for (const row of rows) {
    await deleteRenderedFiles(row.code).catch(() => undefined);
  }
  return rows.length;
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "يرجى تصحيح الحقول", errors: flatten(parsed.error) };
  }

  const { name, gender, email, phone, notes } = parsed.data;
  const key = nameKey(name);
  const existing = findUserByNameKey(key);
  if (existing) {
    return {
      ok: false,
      message: `يوجد مستخدم مسجّل مسبقًا بهذا الاسم: ${existing.name}`,
    };
  }

  const user = createUserRow({ name, gender, email, phone, notes });
  revalidatePath("/admin/users");
  return { ok: true, message: `تمت إضافة ${user.name}` };
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "معرّف غير صالح" };

  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "يرجى تصحيح الحقول", errors: flatten(parsed.error) };
  }

  const { name, gender, email, phone, notes } = parsed.data;
  const clash = findUserByNameKey(nameKey(name));
  if (clash && clash.id !== id) {
    return { ok: false, message: `يوجد مستخدم آخر بنفس الاسم: ${clash.name}` };
  }

  const before = getUser(id);
  const user = updateUserRow(id, { name, gender, email, phone, notes });

  // Anything that changes the printed wording invalidates the rendered files.
  let invalidated = 0;
  if (before && (before.name !== name || before.gender !== gender)) {
    invalidated = await invalidateRenders(id);
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/certs");

  return {
    ok: true,
    message:
      invalidated > 0
        ? `تم تحديث ${user?.name ?? name} — ${invalidated} شهادة سيُعاد توليدها عند التحميل`
        : `تم تحديث ${user?.name ?? name}`,
  };
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) deleteUserRow(id);
  revalidatePath("/admin/users");
  revalidatePath("/admin/certs");
}

/**
 * Adds many people at once from a pasted list — one name per line. This is the
 * replacement for the CSV importer: same ergonomics, no encoding surprises.
 *
 * The gender chosen here applies to everyone in the batch; edit individuals
 * afterwards if needed.
 */
export async function bulkCreateUsersAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { result?: BulkResult }> {
  const raw = String(formData.get("names") ?? "");
  const genderRaw = String(formData.get("gender") ?? "");
  const gender: Gender = isGender(genderRaw) ? genderRaw : "male";

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { ok: false, message: "لم يتم إدخال أي أسماء" };
  }
  if (lines.length > 2000) {
    return { ok: false, message: "الحد الأقصى 2000 اسم في المرة الواحدة" };
  }

  const seen = new Set<string>();
  const created: string[] = [];
  let skipped = 0;

  for (const line of lines) {
    const name = line.replace(/\s+/g, " ").slice(0, 120);
    const key = nameKey(name);
    if (key.length < 3 || seen.has(key) || findUserByNameKey(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    createUserRow({ name, gender, email: null, phone: null, notes: null });
    created.push(name);
  }

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `تمت إضافة ${created.length} مستخدم` + (skipped ? `، وتجاوز ${skipped}` : ""),
    result: { created: created.length, skipped, names: created },
  };
}
