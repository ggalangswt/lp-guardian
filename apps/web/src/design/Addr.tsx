import { Copy } from "./Copy.js";
import { shortAddr } from "./atoms.js";

interface Props {
  value: string;
  head?: number;
  tail?: number;
}

export function Addr({ value, head = 6, tail = 4 }: Props) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span className="mono" style={{ color: "var(--text-secondary)" }}>
        {shortAddr(value, head, tail)}
      </span>
      <Copy value={value} small />
    </span>
  );
}
