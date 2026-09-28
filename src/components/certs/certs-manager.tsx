"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Ban, Download, Eye, FileArchive, Plus, Search, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { IssueDialog, type IssuableUser } from "@/components/certs/issue-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteCertificateAction, setCertStatusAction } from "@/lib/actions/certs";
import { formatCode } from "@/lib/code-format";
import { formatGregorianArabic } from "@/lib/dates";

export interface CertListRow {
  id: number;
  code: string;
  status: "issued" | "revoked";
  issuedOn: string;
  recipientName: string;
  userName: string | null;
  userEmail: string | null;
  printToken?: string;
}

type Tab = "all" | "issued" | "revoked";

export function CertsManager({
  rows,
  users,
  printTokens,
}: {
  rows: CertListRow[];
  users: IssuableUser[];
  printTokens: Record<number, string>;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "issuedOn", desc: true }]);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState<CertListRow | null>(null);
  const [deleting, setDeleting] = useState<CertListRow | null>(null);
  const [archiving, startArchive] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab !== "all" && row.status !== tab) return false;
      if (!q) return true;
      return (
        row.recipientName.toLowerCase().includes(q) ||
        row.code.includes(q.replace(/[^0-9]/g, "")) ||
        formatCode(row.code).toLowerCase().includes(q)
      );
    });
  }, [rows, search, tab]);

  const columns = useMemo<ColumnDef<CertListRow>[]>(
    () => [
      {
        accessorKey: "recipientName",
        header: "المستلم",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.recipientName}</p>
            {row.original.userEmail ? (
              <p dir="ltr" className="truncate text-xs text-muted-foreground">
                {row.original.userEmail}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "code",
        header: "رقم الشهادة",
        cell: ({ row }) => (
          <span dir="ltr" className="font-semibold tabular-nums">
            {formatCode(row.original.code)}
          </span>
        ),
      },
      {
        accessorKey: "issuedOn",
        header: "تاريخ الإصدار",
        cell: ({ row }) => <span className="text-sm">{formatGregorianArabic(row.original.issuedOn)}</span>,
      },
      {
        accessorKey: "status",
        header: "الحالة",
        cell: ({ row }) =>
          row.original.status === "revoked" ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
              ملغاة
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
              سارية
            </Badge>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const cert = row.original;
          const token = printTokens[cert.id];
          return (
            <div className="flex items-center justify-end gap-0.5">
              {token ? (
                <Button asChild variant="ghost" size="icon-sm" aria-label="معاينة">
                  <Link href={`/p/${token}`} target="_blank">
                    <Eye className="size-4" />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="icon-sm" aria-label="تحميل PDF">
                <a href={`/api/admin/certs/${cert.id}/download?format=pdf`}>
                  <Download className="size-4" />
                </a>
              </Button>
              {cert.status === "issued" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="إلغاء الشهادة"
                  onClick={() => setRevoking(cert)}
                >
                  <Ban className="size-4" />
                </Button>
              ) : (
                <StatusButton id={cert.id} status="issued" icon={<Undo2 className="size-4" />} label="إعادة تفعيل" />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="حذف"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleting(cert)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [printTokens],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const readyCount = rows.filter((row) => row.status === "issued").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="all">الكل ({rows.length})</TabsTrigger>
            <TabsTrigger value="issued">سارية ({readyCount})</TabsTrigger>
            <TabsTrigger value="revoked">ملغاة ({rows.length - readyCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم أو الرقم…"
            className="pe-9"
            aria-label="بحث"
          />
        </div>

        <Button
          variant="outline"
          disabled={archiving || readyCount === 0}
          onClick={() =>
            startArchive(async () => {
              try {
                const response = await fetch("/api/admin/certs/archive?status=issued", { method: "POST" });
                if (!response.ok) throw new Error(String(response.status));
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `certificates-${new Date().toISOString().slice(0, 10)}.zip`;
                link.click();
                URL.revokeObjectURL(url);
                toast.success("تم تنزيل الحزمة");
              } catch {
                toast.error("تعذّر إنشاء الحزمة");
              }
            })
          }
        >
          <FileArchive className="size-4" />
          {archiving ? "جارٍ…" : "تنزيل الكل (ZIP)"}
        </Button>

        <Button onClick={() => setIssuing(true)}>
          <Plus className="size-4" />
          إصدار شهادة
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                      {rows.length === 0 ? "لم تُصدر أي شهادة بعد" : "لا توجد نتائج مطابقة"}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <IssueDialog open={issuing} onOpenChange={setIssuing} users={users} />

      {revoking ? (
        <RevokeDialog
          cert={revoking}
          onClose={() => setRevoking(null)}
        />
      ) : null}

      {deleting ? (
        <DeleteDialog
          cert={deleting}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

function StatusButton({
  id,
  status,
  icon,
  label,
}: {
  id: number;
  status: "issued" | "revoked";
  icon: React.ReactNode;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const formData = new FormData();
          formData.set("id", String(id));
          formData.set("status", status);
          await setCertStatusAction(formData);
          toast.success("تم التحديث");
        })
      }
    >
      {icon}
    </Button>
  );
}

function RevokeDialog({ cert, onClose }: { cert: CertListRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>إلغاء الشهادة</DialogTitle>
          <DialogDescription>
            ستظهر هذه الشهادة ملغاة عند التحقق، ولن تعد صالحة.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="revoke-reason">سبب الإلغاء (اختياري)</Label>
          <Textarea
            id="revoke-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            تراجع
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const formData = new FormData();
                formData.set("id", String(cert.id));
                formData.set("status", "revoked");
                formData.set("reason", reason);
                await setCertStatusAction(formData);
                toast.success("تم إلغاء الشهادة");
                onClose();
              })
            }
          >
            {pending ? "جارٍ…" : "إلغاء الشهادة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ cert, onClose }: { cert: CertListRow; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>حذف الشهادة نهائيًا</DialogTitle>
          <DialogDescription>
            سيتم حذف شهادة <span className="font-medium text-foreground">{cert.recipientName}</span> (
            <span className="ltr">{formatCode(cert.code)}</span>) مع ملفاتها. لا يمكن التراجع.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            تراجع
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const formData = new FormData();
                formData.set("id", String(cert.id));
                await deleteCertificateAction(formData);
                toast.success("تم الحذف");
                onClose();
              })
            }
          >
            {pending ? "جارٍ الحذف…" : "حذف نهائي"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
