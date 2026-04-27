/**
 * Full-screen dark navy + gold KK while CRM session is first resolved (no flash of wrong shell).
 */
export function CrmSessionBootScreen() {
  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(180deg, #0a0f1a 0%, #050d1a 100%)" }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-extrabold text-[#0f172a] shadow-[0_0_48px_rgba(201,168,76,0.25)]"
        style={{ background: "linear-gradient(135deg, #C9A84C 0%, #8B6914 100%)" }}
      >
        ΚΚ
      </div>
      <p className="mt-6 text-sm font-medium text-slate-400">Φόρτωση…</p>
    </div>
  );
}
