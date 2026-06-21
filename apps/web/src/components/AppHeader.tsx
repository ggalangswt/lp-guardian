import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo.js";
import { Chip } from "../design/atoms.js";
import { ConnectButton } from "./ConnectButton.js";

// Single header used on every page. Modeled on the original Landing
// inline header — relative position, no border, no backdrop blur,
// no sticky behavior. Brand on the left, lightweight nav inline,
// Connect wallet at the far right of the nav. Active route is
// highlighted with text color only — no pill background — so the
// marketing chrome reads identically on /atlas as on /.

interface NavItem {
  to: string;
  label: string;
  matches?: (path: string) => boolean;
}

const NAV: NavItem[] = [
  {
    to: "/atlas",
    label: "Atlas",
    matches: (p) =>
      p.startsWith("/atlas") ||
      p.startsWith("/diagnose") ||
      p.startsWith("/report"),
  },
  {
    to: "/agent",
    label: "Agent",
  },
  {
    to: "/developers",
    label: "Developers",
  },
  {
    to: "/deck",
    label: "Deck",
  },
  {
    to: "/roadmap",
    label: "Roadmap",
  },
];

const GIT_TAG =
  (import.meta.env.VITE_GIT_TAG as string | undefined) ?? "v1.0.2";

interface Props {
  /** Optional slot rendered to the left of the Connect wallet button. */
  right?: ReactNode;
}

export function AppHeader({ right }: Props) {
  const { pathname } = useLocation();
  return (
    <header className="app-header">
      <Link
        className="app-header-brand"
        to="/"
        style={{
          color: "var(--text)",
          textDecoration: "none",
        }}
      >
        <Logo />
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          LP Guardian
        </span>
        <Chip tone="cyan" style={{ marginLeft: 4 }}>
          {GIT_TAG}
        </Chip>
      </Link>
      <nav className="app-header-nav" aria-label="Primary navigation">
        {NAV.map((n) => {
          const active = n.matches ? n.matches(pathname) : pathname === n.to;
          const isExternal = n.to.startsWith("http");
          const sx = {
            color: active ? "var(--text)" : "var(--text-secondary)",
            textDecoration: "none",
            transition: "color 160ms",
            background: "transparent",
            border: "none",
            padding: 0,
            font: "inherit",
            cursor: "pointer",
          } as const;
          const className = `app-header-nav-link${active ? " app-header-nav-link--active" : ""}`;
          return isExternal ? (
            <a
              key={n.to}
              className={className}
              href={n.to}
              target="_blank"
              rel="noreferrer"
              style={sx}
            >
              {n.label}
            </a>
          ) : (
            <Link key={n.to} className={className} to={n.to} style={sx}>
              {n.label}
            </Link>
          );
        })}
        {right}
        {/* TODO(arch): TEE attestation chip */}
        <span
          className="app-header-attestation"
          title="Verdicts run on a TEE Compute provider with a broker-verifiable attestation report. See /agent for the live signer address."
        >
          <Chip tone="cyan">TEE attested</Chip>
        </span>
        <ConnectButton />
      </nav>
    </header>
  );
}
