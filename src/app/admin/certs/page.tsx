import { CertsManager } from "@/components/certs/certs-manager";
import { listCertificates, listUsers } from "@/lib/certs";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export const metadata = { title: "الشهادات" };

export default async function AdminCertsPage() {
  const rows = listCertificates({ limit: 1000 });
  const users = listUsers({ limit: 2000 }).map((user) => ({ id: user.id, name: user.name }));

  // Print tokens power the admin preview link.
  const tokens: Record<number, string> = {};
  if (rows.length > 0) {
    const tokenRows = db
      .select({ id: certificates.id, printToken: certificates.printToken })
      .from(certificates)
      .where(
        inArray(
          certificates.id,
          rows.map((row) => row.id),
        ),
      )
      .all();
    for (const token of tokenRows) tokens[token.id] = token.printToken;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">الشهادات</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} شهادة — رقمها يُولَّد تلقائيًا ولا يتكرر
        </p>
      </div>

      <CertsManager rows={rows} users={users} printTokens={tokens} />
    </div>
  );
}
