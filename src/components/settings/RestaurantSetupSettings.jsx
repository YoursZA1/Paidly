import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { fetchRestaurantSetup, restaurantSetup } from "@/services/PosRestaurantService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLS = 12;
const MIN_ROWS = 6;
const MAX_INDEX = 23;
const SHAPES = [
  { id: "square", label: "Square" },
  { id: "round", label: "Round" },
  { id: "long", label: "Long" },
];

function nextTableName(tables) {
  const numbers = tables.map((t) => Number(t.name)).filter((n) => Number.isFinite(n));
  return String((numbers.length ? Math.max(...numbers) : 0) + 1);
}

/**
 * POS → Restaurant setup: floors and a drag-to-place table grid. The same grid positions drive
 * the till's floor plan. Tables with an open order cannot be deleted (the API enforces it).
 */
export default function RestaurantSetupSettings() {
  const { toast } = useToast();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [floorId, setFloorId] = useState(null);
  const [newFloor, setNewFloor] = useState("");
  const [editor, setEditor] = useState(null); // { mode: "create" | "edit", table?, pos_x, pos_y, name, seats, shape }
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(null); // { id, x, y }
  const gridRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setState(await fetchRestaurantSetup());
      setMissing(false);
    } catch (err) {
      if (err?.code === "RESTAURANT_SCHEMA_MISSING") setMissing(true);
      else toast({ title: "Could not load restaurant setup", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const floors = state?.floors || [];
  const activeFloorId = floorId && floors.some((f) => f.id === floorId) ? floorId : floors[0]?.id || null;
  const tables = useMemo(() => (state?.tables || []).filter((t) => t.floor_id === activeFloorId), [state, activeFloorId]);
  const rows = Math.min(MAX_INDEX + 1, Math.max(MIN_ROWS, ...tables.map((t) => t.pos_y + 2)));
  // A long table spans two columns, so it also blocks the cell to its right.
  const occupied = (x, y, exceptId = null) =>
    tables.some((t) => t.id !== exceptId && t.pos_y === y && (t.pos_x === x || (t.shape === "long" && t.pos_x + 1 === x)));

  const run = async (body, success) => {
    setBusy(true);
    try {
      const result = await restaurantSetup(body);
      await load();
      if (success) toast({ title: success, variant: "success" });
      return result;
    } catch (err) {
      toast({ title: "Not saved", description: err?.message, variant: "destructive" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addFloor = async () => {
    const name = newFloor.trim();
    if (!name) return;
    const result = await run({ action: "create_floor", name, sort_order: floors.length }, `${name} added`);
    if (result?.floor) {
      setNewFloor("");
      setFloorId(result.floor.id);
    }
  };

  const renameFloor = async (floor) => {
    const name = window.prompt("Floor name", floor.name)?.trim();
    if (name && name !== floor.name) await run({ action: "update_floor", id: floor.id, name }, "Floor renamed");
  };

  const deleteFloor = async (floor) => {
    if (!window.confirm(`Delete ${floor.name} and its tables?`)) return;
    await run({ action: "delete_floor", id: floor.id }, `${floor.name} deleted`);
    setFloorId(null);
  };

  const cellFromPointer = (event) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * COLS);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
    if (x < 0 || y < 0 || x >= COLS || y > MAX_INDEX) return null;
    return { x, y };
  };

  const moveTable = async (table, x, y) => {
    if ((x === table.pos_x && y === table.pos_y) || occupied(x, y, table.id)) return;
    // Optimistic: move locally, then save.
    setState((prev) => ({ ...prev, tables: prev.tables.map((t) => (t.id === table.id ? { ...t, pos_x: x, pos_y: y } : t)) }));
    try {
      await restaurantSetup({ action: "update_table", id: table.id, pos_x: x, pos_y: y });
    } catch (err) {
      toast({ title: "Table not moved", description: err?.message, variant: "destructive" });
      await load();
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    const body = {
      name: editor.name,
      seats: Number(editor.seats) || 2,
      shape: editor.shape,
      assigned_membership_id: editor.assigned && editor.assigned !== "none" ? editor.assigned : null,
    };
    const ok =
      editor.mode === "create"
        ? await run({ action: "create_table", floor_id: activeFloorId, pos_x: editor.pos_x, pos_y: editor.pos_y, ...body }, `Table ${editor.name} added`)
        : await run({ action: "update_table", id: editor.table.id, ...body }, "Table saved");
    if (ok) setEditor(null);
  };

  const deleteTable = async () => {
    if (!editor?.table || !window.confirm(`Delete table ${editor.table.name}?`)) return;
    const ok = await run({ action: "delete_table", id: editor.table.id }, "Table deleted");
    if (ok) setEditor(null);
  };

  const openCreate = (x, y) =>
    setEditor({ mode: "create", pos_x: x, pos_y: y, name: nextTableName(state?.tables || []), seats: "4", shape: "square", assigned: "none" });

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (missing) {
    return (
      <p className="text-sm text-muted-foreground">
        Restaurant tables are not installed on this database yet. Run <code>supabase/migrations/20260927100000_pos_restaurant_tables.sql</code> in the Supabase SQL Editor.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {floors.map((floor) => (
          <div key={floor.id} className="flex items-center">
            <Button type="button" variant={floor.id === activeFloorId ? "default" : "outline"} className="h-10 rounded-r-none" onClick={() => setFloorId(floor.id)}>
              {floor.name}
            </Button>
            <Button type="button" variant="outline" size="icon" className="size-10 rounded-none border-l-0" aria-label={`Rename ${floor.name}`} onClick={() => void renameFloor(floor)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="size-10 rounded-l-none border-l-0" aria-label={`Delete ${floor.name}`} onClick={() => void deleteFloor(floor)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addFloor();
          }}
        >
          <Input className="h-10 w-40" placeholder="e.g. Patio" value={newFloor} maxLength={40} onChange={(e) => setNewFloor(e.target.value)} aria-label="New floor name" />
          <Button type="submit" variant="secondary" className="h-10" disabled={busy || !newFloor.trim()}>
            <Plus className="size-4" /> Add floor
          </Button>
        </form>
      </div>

      {activeFloorId ? (
        <>
          <p className="text-xs text-muted-foreground">Tap an empty square to add a table. Drag tables to arrange them like your room; select one and use the arrow keys to nudge it.</p>
          <div className="overflow-x-auto">
            <div
              ref={gridRef}
              className="relative grid min-w-[36rem] touch-none select-none gap-1 rounded-xl border border-border bg-muted/30 p-1"
              style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, 3.25rem)` }}
              onPointerMove={(e) => {
                if (!drag) return;
                const cell = cellFromPointer(e);
                if (cell) setDrag((d) => ({ ...d, x: cell.x, y: Math.min(cell.y, rows - 1) }));
              }}
              onPointerUp={() => {
                if (!drag) return;
                const table = tables.find((t) => t.id === drag.id);
                setDrag(null);
                if (table) void moveTable(table, drag.x, drag.y);
              }}
            >
              {Array.from({ length: COLS * rows }, (_, i) => {
                const x = i % COLS;
                const y = Math.floor(i / COLS);
                if (occupied(x, y)) return null;
                return (
                  <button
                    key={`cell-${x}-${y}`}
                    type="button"
                    className="rounded-md border border-dashed border-transparent text-xs text-muted-foreground/0 hover:border-border hover:text-muted-foreground"
                    style={{ gridColumnStart: x + 1, gridRowStart: y + 1 }}
                    aria-label={`Add a table at column ${x + 1}, row ${y + 1}`}
                    onClick={() => openCreate(x, y)}
                  >
                    +
                  </button>
                );
              })}
              {tables.map((table) => {
                const dragging = drag?.id === table.id;
                const x = dragging ? drag.x : table.pos_x;
                const y = dragging ? drag.y : table.pos_y;
                const blocked = dragging && occupied(x, y, table.id);
                return (
                  <button
                    key={table.id}
                    type="button"
                    className={cn(
                      "z-10 flex cursor-grab flex-col items-center justify-center rounded-lg border-2 border-primary/50 bg-card text-sm font-semibold shadow-sm active:cursor-grabbing",
                      table.shape === "round" && "rounded-full",
                      dragging && "opacity-80 ring-2 ring-primary",
                      blocked && "ring-destructive"
                    )}
                    style={{
                      gridColumnStart: x + 1,
                      gridColumnEnd: table.shape === "long" ? `span 2` : undefined,
                      gridRowStart: y + 1,
                    }}
                    aria-label={`Table ${table.name}, ${table.seats} seats. Press Enter to edit, arrow keys to move.`}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      setDrag({ id: table.id, x: table.pos_x, y: table.pos_y, startX: e.clientX, startY: e.clientY });
                    }}
                    onClick={(e) => {
                      if (drag && (Math.abs(e.clientX - drag.startX) > 4 || Math.abs(e.clientY - drag.startY) > 4)) return;
                      setEditor({
                        mode: "edit",
                        table,
                        name: table.name,
                        seats: String(table.seats),
                        shape: table.shape || "square",
                        assigned: table.assigned_membership_id || "none",
                      });
                    }}
                    onKeyDown={(e) => {
                      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
                      if (!delta) return;
                      e.preventDefault();
                      const nx = Math.min(COLS - 1, Math.max(0, table.pos_x + delta[0]));
                      const ny = Math.min(MAX_INDEX, Math.max(0, table.pos_y + delta[1]));
                      void moveTable(table, nx, ny);
                    }}
                  >
                    <span>{table.name}</span>
                    <span className="flex items-center gap-0.5 text-[10px] font-normal text-muted-foreground">
                      <Users className="size-2.5" /> {table.seats}
                    </span>
                    {table.assigned_name ? (
                      <span className="max-w-full truncate px-1 text-[10px] font-normal text-primary">{table.assigned_name}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Add your first floor (for example “Main Floor”) to start placing tables.</p>
      )}

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editor?.mode === "create" ? "Add table" : `Table ${editor?.table?.name || ""}`}</DialogTitle>
            <DialogDescription>Names like “12” show as “Table 12” on the till.</DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="rs-table-name">Name</Label>
                <Input id="rs-table-name" value={editor.name} maxLength={40} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rs-table-seats">Seats</Label>
                <Input id="rs-table-seats" inputMode="numeric" value={editor.seats} onChange={(e) => setEditor({ ...editor, seats: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rs-table-server">Assigned server</Label>
                <Select value={editor.assigned || "none"} onValueChange={(v) => setEditor({ ...editor, assigned: v })}>
                  <SelectTrigger id="rs-table-server">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Anyone</SelectItem>
                    {(state?.operators || []).map((op) => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">One server can look after many tables. Staff see theirs under “My tables” on the till.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Shape</Label>
                <div className="flex gap-2">
                  {SHAPES.map((shape) => (
                    <Button key={shape.id} type="button" variant={editor.shape === shape.id ? "default" : "outline"} className="h-10" onClick={() => setEditor({ ...editor, shape: shape.id })}>
                      {shape.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            {editor?.mode === "edit" ? (
              <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void deleteTable()}>
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" disabled={busy || !editor?.name?.trim()} onClick={() => void saveEditor()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
