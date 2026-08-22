import { useCallback, useState } from "react";

export function useContextMenu() {
  const [state, setState] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ open: true, x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return { open: state.open, x: state.x, y: state.y, handleContextMenu, close };
}
