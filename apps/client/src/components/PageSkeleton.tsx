const ROWS = 8;

/** Squelette d'une page de collection (album, playlist, artiste, favoris) pendant son
 *  chargement. Invisible les 250 premières ms (délai CSS de l'animation, aucun timer JS) :
 *  un chargement rapide n'affiche donc RIEN — plus de « Chargement... » qui clignote — et un
 *  chargement lent montre la forme de la page en fondu plutôt qu'un texte. Statique (pas de
 *  pulsation) : aucune animation continue pendant l'attente. */
export function PageSkeleton() {
  return (
    <div className="animate-fade-in p-8 [animation-delay:250ms]" aria-busy="true">
      <div className="flex items-end gap-6">
        <div className="h-56 w-56 shrink-0 rounded-cover bg-surface-2" />
        <div className="flex-1 space-y-3 pb-2">
          <div className="h-3 w-24 rounded-full bg-surface-2" />
          <div className="h-10 w-2/3 rounded-full bg-surface-2" />
          <div className="h-3 w-1/3 rounded-full bg-surface-2" />
        </div>
      </div>
      <div className="mt-8 h-14 w-14 rounded-full bg-surface-2" />
      <div className="mt-8 space-y-2">
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="h-12 rounded-xl bg-surface-2/60" />
        ))}
      </div>
    </div>
  );
}
