"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type UseClientPaginationOptions<T> = {
  items: T[];
  pageSize?: number;
  searchQuery?: string;
  getSearchText: (item: T) => string;
  /** When this value changes, page resets to 1 (e.g. active tab id). */
  resetWhen?: unknown;
};

export function useClientPagination<T>({
  items,
  pageSize = 50,
  searchQuery = "",
  getSearchText,
  resetWhen,
}: UseClientPaginationOptions<T>) {
  const [page, setPage] = useState(1);
  const getSearchTextRef = useRef(getSearchText);
  getSearchTextRef.current = getSearchText;

  const filtered = useMemo(() => {
    const t = normalizeSearchText(searchQuery.trim());
    if (!t) return items;
    return items.filter((item) => normalizeSearchText(getSearchTextRef.current(item)).includes(t));
  }, [items, searchQuery]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    setPage(1);
  }, [searchQuery, resetWhen]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const from = (page - 1) * pageSize;
    return filtered.slice(from, from + pageSize);
  }, [filtered, page, pageSize]);

  const goToPrev = () => setPage((p) => Math.max(1, p - 1));
  const goToNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return {
    filtered,
    pageItems,
    page,
    setPage,
    totalPages,
    totalCount,
    pageSize,
    goToPrev,
    goToNext,
    showPagination: totalPages > 1,
  };
}
