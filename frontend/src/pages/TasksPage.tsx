import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { Field, Input, Select, Textarea } from "../components/Form";

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "done";
  companyId?: string | null;
  assignedTo?: string | null;
}

const PRIORITY_LABEL: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta" };
const PRIORITY_BADGE: Record<string, string> = { low: "badge-neutral", medium: "badge-info", high: "badge-danger" };

/** Calendar chip colors per priority. */
const PRIORITY_CHIP: Record<string, string> = {
  low: "bg-slate-200 text-slate-700",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-red-100 text-red-800",
};

const emptyForm = {
  title: "",
  description: "",
  dueDate: "",
  priority: "medium",
  companyId: "",
  assignedTo: "",
};

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** YYYY-MM-DD in local time (the format the API stores). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Handlers a task row needs, so the row can be rendered from any view. */
interface TaskRowProps {
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  companyName: (id?: string | null) => string;
  userName: (id?: string | null) => string;
}

/**
 * Grouped list view. Hoisted to module level so React keeps a stable component
 * type across renders (defining it inside the page would remount the tree).
 */
const Section: React.FC<{ title: string; items: Task[]; empty: string } & TaskRowProps> = ({
  title,
  items,
  empty,
  ...handlers
}) => (
  <div className="card p-4">
    <h2 className="font-semibold text-slate-900 mb-2">
      {title} <span className="text-slate-400 font-normal text-sm">({items.length})</span>
    </h2>
    {items.length === 0 ? (
      <p className="text-sm text-slate-400">{empty}</p>
    ) : (
      <ul>{items.map((t) => (
        <TaskRow key={t.id} task={t} {...handlers} />
      ))}</ul>
    )}
  </div>
);

/** One task row, shared by the list view and the calendar's day detail. */
const TaskRow: React.FC<{ task: Task } & TaskRowProps> = ({
  task: t,
  onToggle,
  onEdit,
  onDelete,
  companyName,
  userName,
}) => (
  <li className="flex items-start gap-3 p-3 border-b border-slate-100 last:border-0">
    <input
      type="checkbox"
      checked={t.status === "done"}
      onChange={() => onToggle(t)}
      aria-label={`${t.status === "done" ? "Reabrir" : "Completar"} ${t.title}`}
      className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
    />
    <div className="min-w-0 flex-1">
      <p className={`text-sm ${t.status === "done" ? "line-through text-slate-400" : "text-slate-900"}`}>{t.title}</p>
      <p className="text-xs text-slate-500 mt-0.5">
        {t.dueDate ? `Vence: ${t.dueDate}` : "Sin fecha"}
        {t.companyId ? ` · ${companyName(t.companyId)}` : ""}
        {t.assignedTo ? ` · ${userName(t.assignedTo)}` : ""}
      </p>
    </div>
    <span className={`badge ${PRIORITY_BADGE[t.priority] || "badge-neutral"}`}>{PRIORITY_LABEL[t.priority] || t.priority}</span>
    <div className="flex gap-1">
      <button type="button" onClick={() => onEdit(t)} className="p-1.5 text-slate-400 hover:text-primary-600 rounded" aria-label="Editar">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
      </button>
      <button type="button" onClick={() => onDelete(t)} className="p-1.5 text-slate-400 hover:text-red-600 rounded" aria-label="Eliminar">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
      </button>
    </div>
  </li>
);

export const TasksPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Task | null>(null);

  // Calendar view state
  const [view, setView] = useState<"list" | "calendar">("list");
  const today = new Date().toISOString().slice(0, 10);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string>(today);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const load = async () => {
    try {
      setLoadError("");
      const [tRes, cRes, uRes]: any = [await api.get("tasks"), await api.get("companies"), await api.get("users").catch(() => ({ data: [] }))];
      setTasks(tRes.data || []);
      setCompanies(cRes.data || []);
      setUsers(uRes.data || []);
    } catch (e: any) {
      setLoadError(e.message || "No se pudieron cargar las tareas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    const isNew = searchParams.get("new");
    const presetCompany = searchParams.get("companyId") || "";
    if (isNew) {
      setEditing(null);
      setForm({ ...emptyForm, companyId: presetCompany });
      setFormError("");
      setModalOpen(true);
    } else if (editId) {
      const found = tasks.find((t) => t.id === editId);
      if (found) {
        setEditing(found);
        setForm({
          title: found.title,
          description: found.description || "",
          dueDate: found.dueDate || "",
          priority: found.priority || "medium",
          companyId: found.companyId || "",
          assignedTo: found.assignedTo || "",
        });
        setFormError("");
        setModalOpen(true);
      }
    } else {
      setModalOpen(false);
    }
  }, [searchParams, tasks]);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError("");
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("edit");
    next.delete("companyId");
    setSearchParams(next, { replace: true });
  };

  const set = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim()) {
      setFormError("El título es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title,
        description: form.description,
        dueDate: form.dueDate || null,
        priority: form.priority,
        companyId: form.companyId || null,
        assignedTo: form.assignedTo || null,
      };
      if (editing) {
        const res: any = await api.patch(`tasks/${editing.id}`, payload);
        setTasks((list) => list.map((t) => (t.id === editing.id ? res.data : t)));
      } else {
        const res: any = await api.post("tasks", payload);
        setTasks((list) => [res.data, ...list]);
      }
      closeModal();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar la tarea");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t: Task) => {
    try {
      const res: any = await api.patch(`tasks/${t.id}`, { status: t.status === "done" ? "pending" : "done" });
      setTasks((list) => list.map((x) => (x.id === t.id ? res.data : x)));
    } catch (err: any) {
      setLoadError(err.message || "No se pudo actualizar");
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`tasks/${toDelete.id}`);
      setTasks((list) => list.filter((t) => t.id !== toDelete.id));
      setToDelete(null);
    } catch (err: any) {
      setLoadError(err.message || "No se pudo eliminar");
      setToDelete(null);
    }
  };

  const companyName = (id?: string | null) => companies.find((c) => c.id === id)?.name || "";
  const userName = (id?: string | null) => users.find((u) => u.id === id)?.name || "";

  /** Handlers passed down to every task row, whichever view renders it. */
  const rowProps: TaskRowProps = {
    onToggle: toggle,
    onEdit: (t) => {
      const next = new URLSearchParams(searchParams);
      next.set("edit", t.id);
      setSearchParams(next);
    },
    onDelete: (t) => setToDelete(t),
    companyName,
    userName,
  };

  const pending = tasks.filter((t) => t.status === "pending");
  const overdue = pending.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = pending.filter((t) => t.dueDate === today);
  const upcoming = pending.filter((t) => t.dueDate && t.dueDate > today);
  const noDate = pending.filter((t) => !t.dueDate);
  const done = tasks.filter((t) => t.status === "done");

  // ---- Calendar data ----

  /** Tasks indexed by dueDate (YYYY-MM-DD). Tasks without a date are not shown. */
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.dueDate) continue;
      (map[t.dueDate] ||= []).push(t);
    }
    return map;
  }, [tasks]);

  const calendarCells = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-first offset: JS getDay() is Sunday=0.
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calMonth]);

  const selectedTasks = tasksByDate[selectedDay] || [];

  const goMonth = (delta: number) => {
    setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const goToToday = () => {
    const d = new Date();
    setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDay(today);
  };

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Tareas</h1>
          <p className="text-sm text-slate-500">{pending.length} pendiente{pending.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-300 overflow-hidden" role="tablist" aria-label="Vista de tareas">
            <button
              type="button"
              role="tab"
              aria-selected={view === "list"}
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === "list" ? "bg-primary-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Lista
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "calendar"}
              onClick={() => setView("calendar")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === "calendar" ? "bg-primary-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Calendario
            </button>
          </div>
          <Button variant="primary" onClick={() => { const next = new URLSearchParams(searchParams); next.set("new", "1"); setSearchParams(next); }}>+ Nueva tarea</Button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">{loadError} <button type="button" onClick={load} className="underline">Reintentar</button></div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-slate-400">Cargando…</div>
      ) : view === "list" ? (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          <Section title="Vencidas" items={overdue} empty="No hay tareas vencidas 🎉" {...rowProps} />
          <Section title="Hoy" items={dueToday} empty="Nada programado para hoy" {...rowProps} />
          <Section title="Próximas" items={upcoming} empty="Sin tareas próximas" {...rowProps} />
          <Section title="Sin fecha" items={noDate} empty="Sin tareas sin fecha" {...rowProps} />
          <div className="xl:col-span-2">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Completadas ({done.length})</summary>
              <div className="card p-4 mt-2">
                {done.length === 0 ? <p className="text-sm text-slate-400">Aún no completaste ninguna</p> : <ul>{done.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)}</ul>}
              </div>
            </details>
          </div>
        </div>
      ) : (
        /* ============================ CALENDARIO ============================ */
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] items-start">
          <div className="card p-4">
            {/* Month header */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-semibold text-slate-900">
                {MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}
              </h2>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => goMonth(-1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Mes anterior">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <button type="button" onClick={goToToday} className="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100">
                  Hoy
                </button>
                <button type="button" onClick={() => goMonth(1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Mes siguiente">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </div>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, i) => {
                if (day === null) return <div key={`pad-${i}`} className="min-h-[4.5rem] rounded-lg" />;
                const dateStr = toISODate(new Date(calMonth.getFullYear(), calMonth.getMonth(), day));
                const dayTasks = tasksByDate[dateStr] || [];
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDay;
                const hasOverdue = dayTasks.some((t) => t.status === "pending" && dateStr < today);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDay(dateStr)}
                    aria-label={`${day} de ${MONTH_NAMES[calMonth.getMonth()]}, ${dayTasks.length} tarea${dayTasks.length !== 1 ? "s" : ""}`}
                    aria-pressed={isSelected}
                    className={`min-h-[4.5rem] rounded-lg p-1.5 text-left align-top transition-colors border ${
                      isSelected
                        ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200"
                        : isToday
                        ? "border-primary-300 bg-primary-50/40"
                        : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                        isToday ? "bg-primary-600 text-white" : hasOverdue ? "text-red-600 font-semibold" : "text-slate-700"
                      }`}
                    >
                      {day}
                    </span>
                    <span className="mt-1 space-y-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className={`block truncate rounded px-1 py-0.5 text-[10px] leading-tight ${PRIORITY_CHIP[t.priority] || "bg-slate-200 text-slate-700"} ${
                            t.status === "done" ? "opacity-50 line-through" : ""
                          }`}
                        >
                          {t.title}
                        </span>
                      ))}
                      {dayTasks.length > 3 && (
                        <span className="block text-[10px] text-slate-400 px-1">+{dayTasks.length - 3} más</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-100 border border-red-200" /> Alta</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-100 border border-blue-200" /> Media</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200 border border-slate-300" /> Baja</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary-600" /> Hoy</span>
            </div>
          </div>

          {/* Selected day detail */}
          <div className="card p-4 xl:sticky xl:top-4">
            <h2 className="font-semibold text-slate-900 mb-1">
              {new Date(selectedDay + "T00:00:00").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            <p className="text-xs text-slate-500 mb-3">
              {selectedTasks.length === 0
                ? "Sin tareas este día"
                : `${selectedTasks.length} tarea${selectedTasks.length !== 1 ? "s" : ""}`}
            </p>
            {selectedTasks.length === 0 ? (
              <p className="text-sm text-slate-400">Nada programado</p>
            ) : (
              <ul className="divide-y divide-slate-100">{selectedTasks.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)}</ul>
            )}
            <div className="pt-3 mt-3 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setForm({ ...emptyForm, dueDate: selectedDay });
                  setEditing(null);
                  setFormError("");
                  setModalOpen(true);
                }}
              >
                + Agregar tarea este día
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? "Editar tarea" : "Nueva tarea"}
        onClose={closeModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} type="button">Cancelar</Button>
            <Button variant="primary" onClick={handleSubmit as any} type="button" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear tarea"}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">{formError}</div>}
          <Field label="Título" htmlFor="t-title" required>
            <Input id="t-title" value={form.title} onChange={set("title")} placeholder="Ej: Llamar a cliente" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Fecha de vencimiento" htmlFor="t-due">
              <Input id="t-due" type="date" value={form.dueDate} onChange={set("dueDate")} />
            </Field>
            <Field label="Prioridad" htmlFor="t-priority">
              <Select id="t-priority" value={form.priority} onChange={set("priority")}>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </Select>
            </Field>
          </div>
          <Field label="Empresa" htmlFor="t-company">
            <Select id="t-company" value={form.companyId} onChange={set("companyId")}>
              <option value="">— Ninguna —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Vendedor asignado" htmlFor="t-vendor">
            <Select id="t-vendor" value={form.assignedTo} onChange={set("assignedTo")}>
              <option value="">— Sin asignar —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Descripción" htmlFor="t-desc">
            <Textarea id="t-desc" value={form.description} onChange={set("description")} placeholder="Detalles de la tarea…" />
          </Field>
        </form>
      </Modal>

      <Modal open={!!toDelete} title="Eliminar tarea" onClose={() => setToDelete(null)} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)} type="button">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} type="button">Eliminar</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Vas a eliminar <strong className="text-slate-900">{toDelete?.title}</strong>. Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default TasksPage;