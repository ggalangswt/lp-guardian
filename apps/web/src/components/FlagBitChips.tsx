// Tiny visual breakdown of the 14-bit V4 hook flag bitmap. Used in the
// HooksPanel detail view to show *which* permissions a hook implements.

const FLAG_NAMES = [
  "rmLqRetDelta",
  "addLqRetDelta",
  "afterSwapRetDelta",
  "beforeSwapRetDelta",
  "afterDonate",
  "beforeDonate",
  "afterSwap",
  "beforeSwap",
  "afterRemoveLq",
  "beforeRemoveLq",
  "afterAddLq",
  "beforeAddLq",
  "afterInit",
  "beforeInit",
] as const;

interface Props {
  bitmap: number;
}

export function FlagBitChips({ bitmap }: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      {FLAG_NAMES.map((name, idx) => {
        const set = (bitmap & (1 << idx)) !== 0;
        return (
          <span
            key={name}
            title={`${name} bit ${idx}`}
            className={`px-1 py-0.5 text-[9px] font-mono rounded border ${
              set
                ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/40"
                : "border-slate-800 text-slate-600"
            }`}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}
