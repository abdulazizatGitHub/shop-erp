import { createContext, useContext } from 'react';
import { en } from './en.js';
import { ur } from './ur.js';

export type Lang = 'en' | 'ur';
export type TranslationKey = keyof typeof en;

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { en, ur };

/** Defaults to English — no language switcher UI exists yet (Phase 4.5). */
const LangContext = createContext<Lang>('en');

export const LanguageProvider = LangContext.Provider;

export function useTranslation(): (key: TranslationKey) => string {
  const lang = useContext(LangContext);
  return (key: TranslationKey): string => dictionaries[lang][key] || dictionaries.en[key];
}
