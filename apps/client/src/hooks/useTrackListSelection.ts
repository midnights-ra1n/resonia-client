import { useEffect, useRef, useState } from "react";

export function useTrackListSelection(count: number) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(),
  );
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  function clearSelection() {
    setSelectedIndices(new Set());
    setAnchorIndex(null);
    setFocusIndex(null);
  }

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (!containerRef.current) return;
      const target = e.target as HTMLElement;
      if (containerRef.current.contains(target)) return;
      // Le menu contextuel (et ses sous-menus) est rendu via un portail vers
      // document.body : ce n'est donc jamais un descendant du conteneur, même
      // quand on interagit avec pour agir sur la sélection courante.
      if (target.closest("[data-context-menu-panel]")) return;
      clearSelection();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function selectRange(from: number, to: number) {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const next = new Set<number>();
    for (let i = start; i <= end; i++) next.add(i);
    setSelectedIndices(next);
  }

  function handleRowClick(e: React.MouseEvent, index: number) {
    if (e.shiftKey && anchorIndex !== null) {
      selectRange(anchorIndex, index);
      setFocusIndex(index);
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      setAnchorIndex(index);
      setFocusIndex(index);
      return;
    }

    setSelectedIndices(new Set([index]));
    setAnchorIndex(index);
    setFocusIndex(index);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (count === 0) return;
      const all = new Set<number>();
      for (let i = 0; i < count; i++) all.add(i);
      setSelectedIndices(all);
      setAnchorIndex(0);
      setFocusIndex(count - 1);
      return;
    }

    if (e.key === "Escape") {
      clearSelection();
      return;
    }

    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.shiftKey) {
      if (count === 0) return;
      e.preventDefault();
      const current = focusIndex ?? anchorIndex ?? 0;
      const next =
        e.key === "ArrowDown"
          ? Math.min(current + 1, count - 1)
          : Math.max(current - 1, 0);
      const anchor = anchorIndex ?? current;
      selectRange(anchor, next);
      setAnchorIndex(anchor);
      setFocusIndex(next);
      rowRefs.current.get(next)?.scrollIntoView({ block: "nearest" });
    }
  }

  function registerRow(index: number, el: HTMLDivElement | null) {
    if (el) rowRefs.current.set(index, el);
    else rowRefs.current.delete(index);
  }

  /** À utiliser avant l'ouverture d'un menu contextuel : si la ligne cliquée ne fait pas
   *  déjà partie de la sélection, on remplace la sélection par cette seule ligne (sinon on
   *  garde la sélection multiple en cours, pour permettre des actions groupées). */
  function ensureSelected(index: number) {
    if (selectedIndices.has(index)) return;
    setSelectedIndices(new Set([index]));
    setAnchorIndex(index);
    setFocusIndex(index);
  }

  return {
    selectedIndices,
    isSelected: (index: number) => selectedIndices.has(index),
    handleRowClick,
    handleKeyDown,
    clearSelection,
    ensureSelected,
    containerRef,
    registerRow,
  };
}
