import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@sierra/shared";
import { en } from "../i18n/en";
import { pl } from "../i18n/pl";

export type TKey = keyof typeof pl;
export type TFn = (key: TKey, vars?: Record<string, string | number>) => string;

const dictionaries: Record<Locale, Record<TKey, string>> = { pl, en };
const KEY = "sierra.locale";
const plural: Record<Locale, Intl.PluralRules> = { pl: new Intl.PluralRules("pl"), en: new Intl.PluralRules("en") };

function initialLocale(): Locale {
  const stored = localStorage.getItem(KEY);
  if (stored === "pl" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "pl";
}

const Ctx = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: TFn }>({ locale: "pl", setLocale: () => undefined, t: (k) => k });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(KEY, l);
    document.documentElement.lang = l;
    setState(l);
  }, []);
  const value = useMemo(() => {
    const dict = dictionaries[locale];
    const t: TFn = (key, vars) => {
      let text: string = dict[key] ?? key;
      // "one|few|many" (pl) or "one|other" (en), picked by the `n` variable.
      if (typeof vars?.n === "number" && text.includes("|")) {
        const forms = text.split("|");
        const rule = plural[locale].select(vars.n);
        const index = rule === "one" ? 0 : rule === "few" ? 1 : forms.length - 1;
        text = forms[Math.min(index, forms.length - 1)]!;
      }
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
      return text;
    };
    return { locale, setLocale, t };
  }, [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;

/** Label of an enum value, e.g. `label(t, "status", "todo")`; unknown values are shown as-is. */
export function label(t: TFn, group: string, value: string) {
  const key = `${group}.${value}` as TKey;
  const text = t(key);
  return text === key ? value : text;
}
