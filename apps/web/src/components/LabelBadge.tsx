import type { Label } from "@lp-guardian/core";

interface Props {
  label: Label;
}

const LABEL_CLS: Record<Label, string> = {
  VERIFIED:  "honesty-badge honesty-badge--verified",
  COMPUTED:  "honesty-badge honesty-badge--computed",
  ESTIMATED: "honesty-badge honesty-badge--estimated",
  EMULATED:  "honesty-badge honesty-badge--emulated",
  LABELED:   "honesty-badge honesty-badge--labeled",
};

export function LabelBadge({ label }: Props) {
  return (
    <span className={LABEL_CLS[label]} title={`source label: ${label}`}>
      {label}
    </span>
  );
}
