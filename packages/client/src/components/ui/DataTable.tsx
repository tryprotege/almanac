import { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  title?: string;
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  showAll?: () => void;
}

export function DataTable<T extends Record<string, any>>({
  title,
  columns,
  data,
  loading,
  showAll,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="table-container">
        {title && (
          <div className="table-header">
            <h3 className="text-base font-semibold text-text-primary">
              {title}
            </h3>
          </div>
        )}
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-bg-active rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      {title && (
        <div className="table-header">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          {showAll && (
            <button
              onClick={showAll}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1"
            >
              Show All →
            </button>
          )}
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-8 text-text-tertiary"
              >
                No data available
              </td>
            </tr>
          ) : (
            data.map((item, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render ? column.render(item) : item[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
