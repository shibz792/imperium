// The faint architectural grid used on the login page — reused wherever a
// dark navy surface needs texture instead of a flat fill or a gradient.
export function GridPattern({ opacity = 0.06 }: { opacity?: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        opacity,
        backgroundImage:
          "linear-gradient(rgba(204,162,116,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(204,162,116,0.6) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    />
  );
}
