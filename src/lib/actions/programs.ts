"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { idle, type ActionState } from "@/lib/action-state";
import {
  createProgram,
  deleteProgram,
  listTemplates,
  parseRepoLines,
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
