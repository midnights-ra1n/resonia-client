import { useContext } from "react";
import { I18nContext } from "./I18nContext";

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation doit être utilisé à l'intérieur de <I18nProvider>");
  }
  return context;
}
