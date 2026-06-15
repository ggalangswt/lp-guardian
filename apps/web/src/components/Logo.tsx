interface Props {
  size?: number;
}

export function Logo({ size = 22 }: Props) {
  return (
    <img
      src="/logo-lp-guardian.webp"
      alt=""
      aria-hidden
      width={Math.round(size * 1.18)}
      height={size}
      style={{
        display: "block",
        objectFit: "contain",
        flexShrink: 0,
      }}
    />
  );
}
