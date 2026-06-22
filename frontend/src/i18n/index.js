import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import hyCommon from "./locales/hy/common.json";

const LANGUAGE_STORAGE_KEY = "hairbook.language";
const SUPPORTED_LANGUAGES = ["hy", "en"];

const getSavedLanguage = () => {
  if (typeof window === "undefined") return "hy";

  const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

  return SUPPORTED_LANGUAGES.includes(savedLanguage) ? savedLanguage : "hy";
};

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon },
    hy: { common: hyCommon },
  },
  lng: getSavedLanguage(),
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES,
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (language) => {
  if (typeof window !== "undefined" && SUPPORTED_LANGUAGES.includes(language)) {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
});

export default i18n;
