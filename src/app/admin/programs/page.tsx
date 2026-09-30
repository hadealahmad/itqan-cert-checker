import { ProgramsManager } from "@/components/programs/programs-manager";
import {
  listMaintainers,
  listPrograms,
  listTemplates,
  syncTemplateCatalogue,
} from "@/lib/programs";
import { listCandidates, rosterSummary } from "@/lib/roster";
import { scanConfigured } from "@/lib/github";

export const metadata = { title: "الحملات" };

export default function AdminProgramsPage() {
  // Rows are created on demand for every registered renderer, so a newly added
  // design becomes selectable without a manual insert.
  syncTemplateCatalogue();

  const programs = listPrograms();
  const templates = listTemplates().map((template) => ({
    id: template.id,
    slug: template.slug,
    nameAr: template.nameAr,
  }));

  // The roster is read per campaign and only when the admin opens it, so a page
  // with many campaigns does not pull every scan result into the payload.
  const rosters = Object.fromEntries(
    programs.map((program) => [
      program.id,
      {
        candidates: listCandidates(program.id),
        summary: rosterSummary(program.id),
        maintainers: listMaintainers(program.id),
      },
    ]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">الحملات</h1>
        <p className="text-sm text-muted-foreground">
          كل حملة تحدد قالب الشهادة والفترة والمستودعات. يتأهل المشارك إذا كانت له مساهمة مدمجة
          داخل الفترة في أحد هذه المستودعات، ولم يكن من مشرفيها.
        </p>
        <p className="text-sm text-muted-foreground">
          اضغط «تحديث قائمة المؤهلين» في أي حملة ليقرأ النظام المساهمات ويستخرج من يستحق الشهادة
          مسبقًا، ثم يستلم كلٌّ منهم شهادته عند دخوله.
        </p>
      </div>

      <ProgramsManager
        programs={programs}
        templates={templates}
        rosters={rosters}
        scanConfigured={scanConfigured()}
      />
    </div>
  );
}
