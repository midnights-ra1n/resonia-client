function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === "object" && segment in acc) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  );
}

export function resolveTranslation(
  dict: unknown,
  fallbackDict: unknown,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const value = getByPath(dict, key) ?? getByPath(fallbackDict, key);

  if (typeof value !== "string") {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Clé de traduction manquante : "${key}"`);
    }
    return key;
  }

  return interpolate(value, vars);
}
