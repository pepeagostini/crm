import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useSettings } from "../hooks/useSettings";
import { currency } from "../lib/format";

interface Deal {
  id: string;
  name: string;
  value?: number;
  currency?: string;
  stage: string;
  probability?: number | null;
  companyId?: string | null;
}

export const DealsKanban: React.FC<{
  deals: Deal[];
  companyName: (id?: string | null) => string;
  onMove: (dealId: string, stage: string, probability?: number) => void;
}> = ({ deals, companyName, onMove }) => {
  const { stages } = useSettings();
  const [busyId, setBusyId] = useState<string | null>(null);

  const move = async (dealId: string, stage: string) => {
    setBusyId(dealId);
    try {
      const res: any = await api.patch(`deals/${dealId}/status`, { stage });
      onMove(dealId, res.data?.stage || stage, res.data?.probability);
    } catch {
      // leave the UI unchanged on failure
    } finally {
      setBusyId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) move(id, stage);
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-flow-col auto-cols-[280px] gap-4 min-w-full">
        {stages.map((st) => {
          const column = deals.filter((d) => d.stage === st.id);
          const total = column.reduce((s, d) => s + (d.value || 0), 0);
          return (
            <section
              key={st.id}
              className="bg-slate-50 rounded-xl border border-slate-200 p-3 min-h-[200px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, st.id)}
              aria-label={`Columna ${st.label}`}
            >
              <header className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-slate-800">
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: st.color }} />
                  {st.label}
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">
                  {column.length} · {currency(total)}
                </span>
              </header>
              <div className="space-y-2">
                {column.map((d) => (
                  <article
                    key={d.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
                    className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm cursor-grab active:cursor-grabbing"
                  >
                    <Link to={`/deals/${d.id}`} className="block text-sm font-medium text-slate-900 hover:text-primary-600 truncate">
                      {d.name}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">{companyName(d.companyId) || "Sin empresa"}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">{currency(d.value || 0, d.currency)}</span>
                      <select
                        aria-label={`Mover ${d.name} de etapa`}
                        disabled={busyId === d.id}
                        value={d.stage}
                        onChange={(e) => move(d.id, e.target.value)}
                        className="text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-600"
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
                {column.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Arrastra aquí</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default DealsKanban;
