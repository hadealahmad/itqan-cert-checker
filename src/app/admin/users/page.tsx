import { UsersManager } from "@/components/users/users-manager";
import { listUsers } from "@/lib/certs";

export const metadata = { title: "المستخدمون" };

export default async function AdminUsersPage() {
  const rows = listUsers({ limit: 500 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">المستخدمون</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} مستخدم — يمكن لنفس المستخدم الحصول على أكثر من شهادة
        </p>
      </div>

      <UsersManager rows={rows} />
    </div>
  );
}
