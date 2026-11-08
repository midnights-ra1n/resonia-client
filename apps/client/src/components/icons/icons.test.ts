import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { Play, useIconPackStore } from ".";
import lucide from "./packs/lucide";

// Le repli Material (SVG via vite-plugin-svgr) n'est pas transformé par la config vitest : on
// teste le chemin pack, qui partage la même logique de taille et de couleur.
const roots: Root[] = [];
afterEach(() => {
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  useIconPackStore.setState({ pack: null });
});

// Rendu client (le rendu serveur de zustand lit l'état initial, pas l'état courant).
function render(el: ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const div = document.createElement("div");
  const root = createRoot(div);
  roots.push(root);
  act(() => root.render(el));
  return div.innerHTML;
}

test("le pack actif remplace l'icône : taille × --icon-scale, fill → color, pas d'attribut fill imposé", () => {
  useIconPackStore.setState({ pack: lucide });
  const html = render(createElement(Play, { size: 18, fill: "white" }));
  expect(html).toContain('stroke="currentColor"');
  expect(html).toContain('fill="none"');
  expect(html).toContain("width: calc(18px * var(--icon-scale, 1))");
  expect(html).toContain("color: white");
});

test("fill=currentColor ne force pas de couleur", () => {
  useIconPackStore.setState({ pack: lucide });
  expect(render(createElement(Play, { size: 18, fill: "currentColor" }))).not.toContain("color: currentcolor");
});
