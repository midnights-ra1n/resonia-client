import { useEffect } from "react";
import { useInViewport } from "../hooks/useInViewport";

/** Sentinelle de fin de liste : appelle `onVisible` à l'approche de l'écran. useInViewport ne se
 *  déclenche qu'une fois — l'appelant la remonte (prop `key`) à chaque nouvelle tranche. */
export function LoadMore({ onVisible }: { onVisible: () => void }) {
  const [ref, inView] = useInViewport<HTMLDivElement>();
  useEffect(() => {
    if (inView) onVisible();
  }, [inView, onVisible]);
  return <div ref={ref} className="h-px" />;
}
