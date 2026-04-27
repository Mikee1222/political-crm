/** Stored in public.profiles.preferences (jsonb) */
export type UserPreferences = {
  theme?: "light" | "dark";
  language?: "el" | "en";
  notifications?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
  };
};

export function defaultUserPreferences(): UserPreferences {
  return { language: "el", theme: "dark", notifications: { email: true, push: true, sms: false } };
}

export function mergePreferences(
  a: UserPreferences | Record<string, unknown> | null | undefined,
  b: Partial<UserPreferences> | null | undefined,
): UserPreferences {
  const x = (a && typeof a === "object" ? a : {}) as UserPreferences;
  const y = b ?? {};
  return {
    ...defaultUserPreferences(),
    ...x,
    ...y,
    notifications: {
      ...defaultUserPreferences().notifications,
      ...(x.notifications ?? {}),
      ...(y.notifications ?? {}),
    },
  };
}
