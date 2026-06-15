import type { HookFamily } from "./hookDiscovery.js";

// Uniswap V4 encodes a hook's permissions in the low 14 bits of its address.
// Decoding them gives the REAL set of lifecycle callbacks a hook implements.
const FLAGS: { bit: number; name: string }[] = [
  { bit: 1 << 13, name: "beforeInitialize" },
  { bit: 1 << 12, name: "afterInitialize" },
  { bit: 1 << 11, name: "beforeAddLiquidity" },
  { bit: 1 << 10, name: "afterAddLiquidity" },
  { bit: 1 << 9, name: "beforeRemoveLiquidity" },
  { bit: 1 << 8, name: "afterRemoveLiquidity" },
  { bit: 1 << 7, name: "beforeSwap" },
  { bit: 1 << 6, name: "afterSwap" },
  { bit: 1 << 5, name: "beforeDonate" },
  { bit: 1 << 4, name: "afterDonate" },
  { bit: 1 << 3, name: "beforeSwapReturnsDelta" },
  { bit: 1 << 2, name: "afterSwapReturnsDelta" },
  { bit: 1 << 1, name: "afterAddLiquidityReturnsDelta" },
  { bit: 1 << 0, name: "afterRemoveLiquidityReturnsDelta" },
];

export interface DecodedHook {
  flagsBitmap: number;
  activeFlags: string[];
  family: HookFamily;
}

/** Decodes a V4 hook address into its permission flags + a coarse family. */
export function decodeHookAddress(hookAddress: string): DecodedHook {
  let bits = 0;
  try {
    bits = Number(BigInt(hookAddress) & 0x3fffn);
  } catch {
    bits = 0;
  }
  const activeFlags = FLAGS.filter(({ bit }) => (bits & bit) !== 0).map(
    ({ name }) => name,
  );
  return { flagsBitmap: bits, activeFlags, family: classifyFamily(activeFlags) };
}

const has = (flags: string[], name: string) => flags.includes(name);

function classifyFamily(flags: string[]): HookFamily {
  const swapReturnsDelta =
    has(flags, "beforeSwapReturnsDelta") || has(flags, "afterSwapReturnsDelta");
  const swap = has(flags, "beforeSwap") || has(flags, "afterSwap");
  const liquidityGate =
    has(flags, "beforeAddLiquidity") || has(flags, "beforeRemoveLiquidity");
  const initGate = has(flags, "beforeInitialize") || has(flags, "afterInitialize");

  if (swap && swapReturnsDelta) return "SWAP_DELTA_CUT";
  if (has(flags, "beforeSwap") && has(flags, "afterSwap")) return "DYNAMIC_FEE_ADVANCED";
  if (liquidityGate && swap) return "GATED_SWAP";
  if (has(flags, "afterDonate") || has(flags, "beforeDonate")) return "MEMECOIN_ROYALTY";
  if (initGate && !swap) return "INIT_GATE";
  if (liquidityGate) return "CUSTOM_LIFECYCLE";
  if (swap) return "DYNAMIC_FEE_ADVANCED";
  return "UNKNOWN";
}
