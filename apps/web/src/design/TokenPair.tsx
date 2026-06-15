interface Props {
  t0: string;
  t1: string;
  size?: number;
}

const TOKEN_COLORS: Record<string, [string, string]> = {
  ETH: ["#627EEA", "#8FA2F5"],
  USDC: ["#2775CA", "#5698E0"],
  WBTC: ["#F7931A", "#FDB45E"],
  PEPE: ["#4CAE4C", "#7FCC7F"],
  USDT: ["#26A17B", "#4FBF98"],
  ARB: ["#28A0F0", "#5DBAFC"],
  LINK: ["#2A5ADA", "#5380E8"],
  UNI: ["#FF007A", "#FF66B0"],
  WETH: ["#627EEA", "#8FA2F5"],
};

function colorsFor(symbol: string): [string, string] {
  return TOKEN_COLORS[symbol] ?? ["#666", "#999"];
}

export function TokenPair({ t0, t1, size = 22 }: Props) {
  const [c0a, c0b] = colorsFor(t0);
  const [c1a, c1b] = colorsFor(t1);
  return (
    <div style={{ position: "relative", width: size * 1.55, height: size }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: 999,
          background: `radial-gradient(circle at 30% 30%, ${c0b}, ${c0a})`,
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div
          style={{
            fontSize: size * 0.38,
            color: "#fff",
            textAlign: "center",
            lineHeight: `${size}px`,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display)",
          }}
        >
          {t0[0]}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: size * 0.55,
          top: 0,
          width: size,
          height: size,
          borderRadius: 999,
          background: `radial-gradient(circle at 30% 30%, ${c1b}, ${c1a})`,
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div
          style={{
            fontSize: size * 0.38,
            color: "#fff",
            textAlign: "center",
            lineHeight: `${size}px`,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display)",
          }}
        >
          {t1[0]}
        </div>
      </div>
    </div>
  );
}
