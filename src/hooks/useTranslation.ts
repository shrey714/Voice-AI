import { useAppStore } from '../stores/useAppStore';
import { translations, TranslationKey } from '../i18n/translations';

export function useTranslation() {
  const language = useAppStore(s => s.settings.language);
  const t = (key: TranslationKey): string => {
    return translations[language]?.[key] ?? translations.en[key] ?? key;
  };
  return { t, language };
}
