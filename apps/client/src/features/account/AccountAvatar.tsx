import type { StoredServer } from "../../stores/serversStore";

interface AccountAvatarProps {
  server: Pick<StoredServer, "username" | "avatarColor">;
  size?: number;
  className?: string;
}

/** Bulle du compte : initiale du nom d'utilisateur sur la couleur tirée à l'ajout du serveur. */
export function AccountAvatar({ server, size = 32, className = "" }: AccountAvatarProps) {
  const initial = server.username.trim().charAt(0).toLocaleUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-on-accent ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.44),
        backgroundColor: server.avatarColor ?? "var(--color-accent)",
      }}
    >
      {initial}
    </span>
  );
}
