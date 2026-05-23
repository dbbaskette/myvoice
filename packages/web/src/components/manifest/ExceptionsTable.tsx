import { useState } from "react";

import type { PermittedException } from "../../api/manifest";

interface ExceptionsTableProps {
  values: PermittedException[];
  onChange: (next: PermittedException[]) => void;
}

export function ExceptionsTable({ values, onChange }: ExceptionsTableProps): JSX.Element {
  const [newTerm, setNewTerm] = useState("");
  const [newReason, setNewReason] = useState("");

  const updateRow = (i: number, patch: Partial<PermittedException>): void => {
    onChange(values.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const removeRow = (i: number): void => {
    onChange(values.filter((_, idx) => idx !== i));
  };
  const addRow = (): void => {
    if (!newTerm.trim() || !newReason.trim()) return;
    onChange([...values, { term: newTerm.trim(), reason: newReason.trim() }]);
    setNewTerm("");
    setNewReason("");
  };

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 text-xs uppercase border-b border-slate-800">
            <th className="py-2 w-1/3">Term</th>
            <th className="py-2">Reason</th>
            <th className="py-2 w-8" aria-label="remove" />
          </tr>
        </thead>
        <tbody>
          {values.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: exceptions table rows ordered; no stable id available
            <tr key={i} className="border-b border-slate-800">
              <td className="py-1 pr-2">
                <input
                  type="text"
                  value={row.term}
                  onChange={(e) => updateRow(i, { term: e.target.value })}
                  aria-label={`Exception ${i + 1} term`}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="text"
                  value={row.reason}
                  onChange={(e) => updateRow(i, { reason: e.target.value })}
                  aria-label={`Exception ${i + 1} reason`}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
                />
              </td>
              <td className="py-1">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove exception ${row.term}`}
                  className="text-slate-500 hover:text-red-400"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-2 pr-2">
              <input
                type="text"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="term"
                aria-label="New exception term"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="reason"
                aria-label="New exception reason"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
              />
            </td>
            <td className="py-2 text-right">
              <button
                type="button"
                onClick={addRow}
                disabled={!newTerm.trim() || !newReason.trim()}
                className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
              >
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
