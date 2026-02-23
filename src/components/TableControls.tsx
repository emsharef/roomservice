"use client";

import { useState, useRef, useEffect } from "react";

// ─── Filter Popover ───────────────────────────────────────────────

interface DropdownOption {
  value: string;
  label: string;
}

export function FilterPopover({
  column,
  value,
  onApply,
  onClose,
  dropdownOptions,
}: {
  column: string;
  value: string;
  onApply: (value: string) => void;
  onClose: () => void;
  dropdownOptions?: DropdownOption[];
}) {
  const [localValue, setLocalValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dropdownOptions) inputRef.current?.focus();
  }, [dropdownOptions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onApply(localValue);
  }

  if (dropdownOptions) {
    return (
      <div
        ref={ref}
        className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[160px]"
      >
        {dropdownOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onApply(opt.value)}
            className={`block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors ${
              value === opt.value ? "bg-gray-100 font-medium" : ""
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[200px]"
    >
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          placeholder={`Filter by ${column}...`}
          className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <button
          type="submit"
          className="rounded bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Apply
        </button>
      </form>
      {value && (
        <button
          onClick={() => onApply("")}
          className="mt-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

// ─── Sort Icon ────────────────────────────────────────────────────

export function SortIcon({ active, direction }: { active: boolean; direction: string }) {
  if (!active) {
    return (
      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  if (direction === "asc") {
    return (
      <svg className="w-3.5 h-3.5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ─── Filter Icon ──────────────────────────────────────────────────

export function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-3 h-3 ${active ? "text-gray-900" : "text-gray-400"}`}
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}

// ─── Column Header ────────────────────────────────────────────────

export function ColumnHeader({
  label,
  column,
  currentSort,
  currentOrder,
  filterValue,
  onSort,
  onFilter,
  align,
  className,
  dropdownOptions,
  sortOnly,
}: {
  label: string;
  column: string;
  currentSort: string;
  currentOrder: string;
  filterValue: string;
  onSort: (column: string) => void;
  onFilter: (column: string, value: string) => void;
  align?: "right";
  className?: string;
  dropdownOptions?: DropdownOption[];
  sortOnly?: boolean;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const isSorted = currentSort === column;
  const hasFilter = filterValue !== "";

  return (
    <th
      className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider relative ${
        align === "right" ? "text-right" : "text-left"
      } ${className ?? ""}`}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        <button
          onClick={() => onSort(column)}
          className="flex items-center gap-1 hover:text-gray-900 transition-colors group"
        >
          <span>{label}</span>
          <SortIcon active={isSorted} direction={isSorted ? currentOrder : ""} />
        </button>
        {!sortOnly && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFilterOpen(!filterOpen);
            }}
            className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${hasFilter ? "bg-gray-200" : ""}`}
            title={`Filter by ${label}`}
          >
            <FilterIcon active={hasFilter} />
          </button>
        )}
      </div>
      {filterOpen && (
        <FilterPopover
          column={column}
          value={filterValue}
          onApply={(value) => {
            onFilter(column, value);
            setFilterOpen(false);
          }}
          onClose={() => setFilterOpen(false)}
          dropdownOptions={dropdownOptions}
        />
      )}
    </th>
  );
}

// ─── Active Filters Bar ───────────────────────────────────────────

export function ActiveFilters({
  filters,
  labels,
  onRemove,
  onClearAll,
}: {
  filters: { [key: string]: string };
  labels: { [key: string]: string };
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  const active = Object.entries(filters).filter(([, v]) => v !== "");
  if (active.length === 0) return null;

  return (
    <div className="mb-3 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">Filters:</span>
      {active.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
        >
          {labels[key] || key}: {value}
          <button onClick={() => onRemove(key)} className="hover:text-gray-900">
            &times;
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-gray-500 hover:text-gray-700 underline"
      >
        Clear all
      </button>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────

export function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  ) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Previous
      </button>
      <div className="flex gap-1">
        {generatePageNumbers(currentPage, totalPages).map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-3 py-2 text-sm text-gray-500">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                p === currentPage
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {p}
            </button>
          )
        )}
      </div>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  );
}
