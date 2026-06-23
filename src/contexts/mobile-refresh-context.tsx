"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

type RefreshFn = () => void | Promise<void>;

type MobileRefreshContextValue = {
  registerRefresh: (fn: RefreshFn) => () => void;
  refresh: () => Promise<void>;
};

const MobileRefreshContext = createContext<MobileRefreshContextValue | null>(null);

export function MobileRefreshProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<RefreshFn | null>(null);

  const registerRefresh = useCallback((fn: RefreshFn) => {
    handlerRef.current = fn;
    return () => {
      if (handlerRef.current === fn) handlerRef.current = null;
    };
  }, []);

  const refresh = useCallback(async () => {
    const fn = handlerRef.current;
    if (fn) await fn();
  }, []);

  const value = useMemo(() => ({ registerRefresh, refresh }), [registerRefresh, refresh]);

  return <MobileRefreshContext.Provider value={value}>{children}</MobileRefreshContext.Provider>;
}

/** Pages register their list `load()` so pull-to-refresh can refetch client state. */
export function useRegisterMobileRefresh(fn: RefreshFn) {
  const ctx = useContext(MobileRefreshContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.registerRefresh(fn);
  }, [ctx, fn]);
}

export function useMobileRefresh() {
  return useContext(MobileRefreshContext);
}
