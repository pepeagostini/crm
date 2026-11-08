import React from "react";
import { Button } from "./Button";

export interface Column {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
}

export interface Action {
  label: string;
  onClick: (item: any) => void;
  variant?: "primary" | "secondary" | "outline" | "destructive";
  /** Decide per ROW whether this action applies (was wrongly evaluated once). */
  showCondition?: (item: any) => boolean;
}

interface TableProps {
  data: any[];
  columns: Column[];
  actions?: Action[];
  emptyMessage?: string;
  /** Override a cell — return undefined to fall back to the raw value. */
  renderCell?: (item: any, key: string) => React.ReactNode;
}

export const Table: React.FC<TableProps> = ({
  data,
  columns,
  actions,
  emptyMessage = "No hay registros todavía",
  renderCell,
}) => {
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <svg
          className="w-12 h-12 text-slate-300 mb-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M9 4v16" />
        </svg>
        <p className="text-slate-500 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 font-medium whitespace-nowrap ${
                  col.align === "right" ? "text-right" : ""
                }`}
              >
                {col.label}
              </th>
            ))}
            {actions && actions.length > 0 && (
              <th scope="col" className="px-4 py-3 font-medium text-right whitespace-nowrap">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            // Evaluate visibility per row, not once against data[0]
            const visibleActions = (actions || []).filter((a) =>
              a.showCondition ? a.showCondition(item) : true
            );

            return (
              <tr
                key={item.id || index}
                className={`border-b border-slate-100 last:border-0 transition-colors ${
                  index % 2 === 1 ? "bg-slate-50/60" : "bg-white"
                } hover:bg-primary-50/60`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3.5 text-slate-700 align-top max-w-[280px] ${
                      col.align === "right" ? "text-right" : ""
                    }`}
                  >
                    {(() => {
                      const custom = renderCell?.(item, col.key);
                      if (custom !== undefined) return custom;
                      const value = item[col.key];
                      return value !== undefined && value !== null && value !== ""
                        ? String(value)
                        : "—";
                    })()}
                  </td>
                ))}

                {actions && actions.length > 0 && (
                  <td className="px-4 py-3.5 text-right align-top">
                    <div className="inline-flex flex-wrap gap-1.5 justify-end">
                      {visibleActions.map((action, aIdx) => (
                        <Button
                          key={aIdx}
                          variant={action.variant || "secondary"}
                          size="sm"
                          onClick={() => action.onClick(item)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
