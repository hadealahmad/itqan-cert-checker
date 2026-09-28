import { ProgramsManager } from "@/components/programs/programs-manager";
import { listPrograms, listTemplates, syncTemplateCatalogue } from "@/lib/programs";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">الحملات</h1>
        <p className="text-sm text-muted-foreground">
          كل حملة تحدد قالب الشهادة والفترة والمستودعات. يتأهل المشارك إذا كانت له مساهمة مدمجة
          داخل الفترة في أحد هذه المستودعات، ولم يكن من مشرفيها.
        </p>
      </div>

      <ProgramsManager programs={programs} templates={templates} />
    </div>
  );
}
