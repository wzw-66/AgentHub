"use client";

interface DebateRow {
  label: string;
  values: string[];
  winner?: number;
}

interface DebateTableProps {
  columns: string[];
  rows: DebateRow[];
  conclusion: string;
}

export default function DebateTable({
  columns,
  rows,
  conclusion,
}: DebateTableProps) {
  if (columns.length === 0 || rows.length === 0) {
    return null;
  }

  return (
    <div className="debate-table-design" style={{ margin: "8px 0" }}>
      <table>
        <thead>
          <tr>
            <th></th>
            {columns.map((col, i) => (
              <th key={i}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              <td>{row.label}</td>
              {row.values.map((val, vi) => (
                <td key={vi} className={row.winner === vi ? "win" : ""}>
                  {val}{row.winner === vi ? " ✓" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td
              colSpan={columns.length + 1}
              style={{
                textAlign: "center",
                fontWeight: 600,
                color: "var(--accent)",
                background: "var(--accent-light)",
                padding: "6px 10px",
              }}
            >
              {conclusion}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
