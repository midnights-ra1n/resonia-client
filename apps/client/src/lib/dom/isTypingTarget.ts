// Champs/éléments dans lesquels un raccourci clavier global (espace = play/pause, retour arrière
// = dossier parent...) doit garder son sens normal : la recherche, mais aussi tout champ texte ou
// élément interactif natif (inputs des modales, textarea, éléments édition).
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
