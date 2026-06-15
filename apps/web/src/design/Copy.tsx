import { useState, type MouseEvent } from "react";

interface Props {
  value: string;
  small?: boolean;
}

export function Copy({ value, small }: Props) {
  const [done, setDone] = useState(false);
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(value);
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={value}
      style={{
        width: small ? 16 : 20,
        height: small ? 16 : 20,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: done ? "var(--healthy)" : "var(--text-tertiary)",
        transition: "color 160ms",
      }}
    >
      {done ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6.5L5 9.5L10 3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M2 8V2.5C2 2.22 2.22 2 2.5 2H8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
