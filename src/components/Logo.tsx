import Image from "next/image";
import clsx from "clsx";

// Two real logo files, not one file faked two ways:
//  - logo-full.png       — navy "IMPERIUM" + gold mark/"REALTY", for light surfaces
//  - logo-full-dark.png  — white "IMPERIUM" + gold mark/"REALTY", for navy surfaces
// (the file's "IMPERIUM" is white text that's simply invisible against a
// white background — confirmed by compositing it over navy before wiring
// this up, not by guessing.) Different source files means different native
// aspect ratios, so each is sized from width down rather than forced into
// a shared square box — that's what made the wordmark unreadable before.
const ASPECT = { light: 1000 / 1000, dark: 2966 / 1994 };

export function Logo({
  variant = "full",
  tone = "dark",
  size = "md",
  className,
}: {
  variant?: "full" | "icon";
  tone?: "dark" | "light"; // "dark" = sits on a dark navy surface
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const iconSize = { sm: 24, md: 32, lg: 40, xl: 60 }[size];

  if (variant === "icon") {
    return (
      <Image
        src="/brand/logo-icon-square.png"
        alt="Imperium Realty"
        width={iconSize}
        height={iconSize}
        className={clsx("object-contain", className)}
        priority
      />
    );
  }

  const width = { sm: 108, md: 152, lg: 200, xl: 300 }[size];
  const aspect = ASPECT[tone];
  const height = Math.round(width / aspect);

  return (
    <Image
      src={tone === "dark" ? "/brand/logo-full-dark.png" : "/brand/logo-full.png"}
      alt="Imperium Realty"
      width={width}
      height={height}
      className={clsx("block object-contain", className)}
      priority
    />
  );
}
