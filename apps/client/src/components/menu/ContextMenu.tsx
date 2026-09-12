import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | {
      type: "action";
      label: string;
      icon?: LucideIcon;
      onClick: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | {
      type: "submenu";
      label: string;
      icon?: LucideIcon;
      renderSubmenu: (close: () => void) => React.ReactNode;
    }
  | { type: "separator" };

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

function useClampedPosition(
  x: number,
  y: number,
  ref: React.RefObject<HTMLElement | null>,
) {
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Recalcule à chaque changement de taille du panneau, pas seulement à l'ouverture :
    // un contenu qui grandit après coup (ex. liste chargée de façon asynchrone) doit
    // repousser le panneau plutôt que de le laisser déborder de la fenêtre.
    function recompute() {
      const rect = el!.getBoundingClientRect();
      const clampedX =
        x + rect.width > window.innerWidth
          ? Math.max(0, window.innerWidth - rect.width)
          : x;
      const clampedY =
        y + rect.height > window.innerHeight
          ? Math.max(0, window.innerHeight - rect.height)
          : y;
      setPos({ x: clampedX, y: clampedY });
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  return pos;
}

/** Position d'un sous-menu ancré à un élément (bord droit par défaut) : bascule à gauche
 *  de l'ancre si l'espace à droite est insuffisant, et clampe verticalement — sans ça un
 *  sous-menu ouvert près d'un bord de fenêtre se retrouvait partiellement hors écran.
 *  Recalcule aussi au redimensionnement du contenu (ex. AddToPlaylistSubmenu, dont la
 *  liste de playlists arrive après coup et peut faire grandir le panneau une fois déjà
 *  positionné). */
function useClampedSubmenuPosition(
  anchorRect: { left: number; right: number; top: number } | null,
  ref: React.RefObject<HTMLElement | null>,
) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchorRect) return;

    function recompute() {
      const rect = el!.getBoundingClientRect();
      const fitsRight = anchorRect!.right + rect.width <= window.innerWidth;
      const x = fitsRight
        ? anchorRect!.right
        : Math.max(0, anchorRect!.left - rect.width);
      const y =
        anchorRect!.top + rect.height > window.innerHeight
          ? Math.max(0, window.innerHeight - rect.height)
          : anchorRect!.top;
      setPos({ x, y });
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRect]);

  return pos;
}

function SubmenuPanel({
  anchorRect,
  children,
}: {
  anchorRect: { left: number; right: number; top: number };
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = useClampedSubmenuPosition(anchorRect, panelRef);

  return createPortal(
    <div
      ref={panelRef}
      data-context-menu-panel
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 1001 }}
      className="min-w-[220px] max-w-[280px] rounded-xl border border-white/10 bg-neutral-900/95 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

function MenuPanel({
  x,
  y,
  items,
  onClose,
  isRoot,
}: ContextMenuProps & { isRoot: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(x, y, panelRef);
  const [openSubmenuIndex, setOpenSubmenuIndex] = useState<number | null>(null);
  const [submenuAnchorRect, setSubmenuAnchorRect] = useState<{
    left: number;
    right: number;
    top: number;
  } | null>(null);
  // Petite transition d'apparition (fondu + zoom léger) plutôt qu'un pop-in instantané —
  // c'est ce qui donnait au menu un rendu "natif du navigateur" plutôt qu'intégré à
  // l'app. Positionné avant le premier paint (useLayoutEffect), donc pas de flash.
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => setVisible(true), []);

  useLayoutEffect(() => {
    if (!isRoot) return;

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-context-menu-panel]")) return;
      onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleScrollOrResize() {
      onClose();
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoot]);

  function openSubmenu(index: number, anchor: HTMLButtonElement) {
    const rect = anchor.getBoundingClientRect();
    setSubmenuAnchorRect({ left: rect.left, right: rect.right, top: rect.top });
    setOpenSubmenuIndex(index);
  }

  const panel = (
    <div
      ref={panelRef}
      data-context-menu-panel
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 1000 }}
      className={`min-w-[220px] max-w-[280px] origin-top-left overflow-visible rounded-xl border border-white/10 bg-neutral-900/95 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl transition-[opacity,transform] duration-100 ease-out ${
        visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        if (item.type === "separator") {
          return <div key={index} className="mx-1.5 my-1.5 h-px bg-white/10" />;
        }

        const Icon = item.icon;

        if (item.type === "submenu") {
          const isOpen = openSubmenuIndex === index;
          return (
            <div key={index} className="relative px-1.5">
              <button
                type="button"
                onMouseEnter={(e) => openSubmenu(index, e.currentTarget)}
                onFocus={(e) => openSubmenu(index, e.currentTarget)}
                onClick={(e) => openSubmenu(index, e.currentTarget)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-200 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white"
              >
                {Icon && (
                  <Icon size={16} className="shrink-0 text-neutral-400" />
                )}
                <span className="flex-1 truncate">{item.label}</span>
                <ChevronRight size={14} className="shrink-0 text-neutral-500" />
              </button>
              {isOpen && submenuAnchorRect && (
                <SubmenuPanel anchorRect={submenuAnchorRect}>
                  {item.renderSubmenu(onClose)}
                </SubmenuPanel>
              )}
            </div>
          );
        }

        return (
          <div key={index} className="px-1.5">
            <button
              type="button"
              disabled={item.disabled}
              onMouseEnter={() => setOpenSubmenuIndex(null)}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger
                  ? "text-red-400 hover:bg-red-500/10 hover:text-red-300 focus-visible:bg-red-500/10 focus-visible:text-red-300"
                  : "text-neutral-200 hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white"
              }`}
            >
              {Icon && <Icon size={16} className="shrink-0 text-neutral-400" />}
              <span className="flex-1 truncate">{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );

  return isRoot ? createPortal(panel, document.body) : panel;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return <MenuPanel x={x} y={y} items={items} onClose={onClose} isRoot />;
}
