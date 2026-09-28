"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Pencil, Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import {
  BulkUsersDialog,
  DeleteUserButton,
  UserDialog,
} from "@/components/users/user-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GENDER_LABELS, type Gender } from "@/lib/gender-text";

export interface UserListRow {
  id: number;
  name: string;
  gender: Gender;
  email: string | null;
  phone: string | null;
  notes: string | null;
  certCount: number;
}

export function UsersManager({ rows }: { rows: UserListRow[] }) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [editing, setEditing] = useState<UserListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) || (row.email ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const columns = useMemo<ColumnDef<UserListRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "الاسم",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            {row.original.notes ? (
              <p className="truncate text-xs text-muted-foreground">{row.original.notes}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "gender",
        header: "الجنس",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={
              row.original.gender === "female"
                ? "border-pink-200 bg-pink-50 text-pink-800"
                : "border-sky-200 bg-sky-50 text-sky-800"
            }
          >
            {GENDER_LABELS[row.original.gender]}
          </Badge>
        ),
      },
      {
        accessorKey: "email",
        header: "البريد",
        cell: ({ row }) =>
          row.original.email ? (
            <span dir="ltr" className="text-sm">
              {row.original.email}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "phone",
        header: "الجوال",
        cell: ({ row }) =>
          row.original.phone ? (
            <span dir="ltr" className="text-sm">
              {row.original.phone}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "certCount",
        header: "الشهادات",
        cell: ({ row }) => (
          <Badge variant="outline" className="tabular-nums">
            {row.original.certCount}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`تعديل ${row.original.name}`}
              onClick={() => setEditing(row.original)}
            >
              <Pencil className="size-4" />
            </Button>
            <DeleteUserButton
              id={row.original.id}
              name={row.original.name}
              certCount={row.original.certCount}
            />
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم أو البريد…"
            className="pe-9"
            aria-label="بحث"
          />
        </div>
        <Button variant="outline" onClick={() => setBulk(true)}>
          <Upload className="size-4" />
          إضافة دفعة
        </Button>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          إضافة مستخدم
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => {
                      const sortable = header.column.getCanSort();
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : sortable ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="flex items-center gap-1 font-medium hover:text-foreground"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <ArrowUpDown className="size-3.5 opacity-60" />
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                      {rows.length === 0 ? "لا يوجد مستخدمون بعد" : "لا توجد نتائج مطابقة"}
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

      <UserDialog open={creating} onOpenChange={setCreating} />
      {editing ? (
        <UserDialog
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          user={editing}
        />
      ) : null}
      <BulkUsersDialog open={bulk} onOpenChange={setBulk} />
    </div>
  );
}
