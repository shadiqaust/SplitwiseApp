import { cn } from "@/lib/utils";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserAvatar({
  name,
  url,
  size = 32,
  className,
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={style}
        className={cn(
          "rounded-full object-cover flex-shrink-0 bg-muted",
          className,
        )}
      />
    );
  }
  return (
    <div
      style={style}
      className={cn(
        "rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0 font-medium",
        className,
      )}
    >
      <span style={{ fontSize: size * 0.38 }}>{getInitials(name || "?")}</span>
    </div>
  );
}
