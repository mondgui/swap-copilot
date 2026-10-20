import { coins, quote, simulateSwap, type PoolState } from "./chain";

export type Step = { tool: string; detail: string };

export type Proposal = {
  steps: Step[];
  title: string;
  lines: string[];
  action: { kind: "deposit"; amount: bigint } | { kind: "swap"; amountIn: bigint; minOut: bigint } | null;
};

const ONE = 10n ** 18n;
export const SWAP_IN = 100n * ONE;
export const DEPOSIT = 1000n * ONE;

export async function planDeposit(pool: PoolState): Promise<Proposal> {
  return {
    steps: [
      {
        tool: "read_pool",
        detail: `${coins(pool.reserve0)} ${pool.symbol0} and ${coins(pool.reserve1)} ${pool.symbol1}`,
      },
      { tool: "stop_for_approval", detail: "waiting" },
    ],
    title: `Add 1,000 ${pool.symbol0} and 1,000 ${pool.symbol1}`,
    lines: [
      "This only prepares the pool so a later swap has a price.",
      "Nothing is sent until you approve.",
    ],
    action: { kind: "deposit", amount: DEPOSIT },
  };
}

export async function planSwap(pool: PoolState, greedy: boolean): Promise<Proposal> {
  const steps: Step[] = [
    {
      tool: "read_pool",
      detail:
        pool.reserve0 === 0n
          ? "pool is empty"
          : `${coins(pool.reserve0)} ${pool.symbol0} and ${coins(pool.reserve1)} ${pool.symbol1}`,
    },
  ];

  if (pool.reserve0 === 0n || pool.reserve1 === 0n) {
    steps.push({ tool: "stop", detail: "nothing to quote" });
    return {
      steps,
      title: "No swap was planned",
      lines: ["The pool is empty. Approve a deposit first. Nothing was sent."],
      action: null,
    };
  }

  const quoted = await quote(pool, SWAP_IN);
  const minimum = greedy ? quoted + 1n : (quoted * 99n) / 100n;
  steps.push({
    tool: "quote",
    detail: `${coins(SWAP_IN)} ${pool.symbol0} would return ${coins(quoted)} ${pool.symbol1}`,
  });
  steps.push({
    tool: "set_minimum",
    detail: greedy
      ? `${coins(minimum)} ${pool.symbol1}, one unit above the quote`
      : `${coins(minimum)} ${pool.symbol1}, 1% under the quote`,
  });

  if (greedy) {
    const reason = await simulateSwap(pool, SWAP_IN, minimum);
    steps.push({ tool: "simulate", detail: reason ?? "the contract accepted it" });
    return {
      steps,
      title: "This swap will not be sent",
      lines: [
        reason ?? "The contract did not reject the extra demand.",
        "There is no approve button. Asking for more than the quote is refused.",
      ],
      action: null,
    };
  }

  steps.push({ tool: "stop_for_approval", detail: "waiting" });
  return {
    steps,
    title: `Swap 100 ${pool.symbol0} for ${pool.symbol1}`,
    lines: [
      `Expected output is ${coins(quoted)} ${pool.symbol1}, after the pool's 0.30% fee.`,
      `The minimum you would accept is ${coins(minimum)} ${pool.symbol1}.`,
      "No gas has been spent. Nothing is sent until you approve.",
    ],
    action: { kind: "swap", amountIn: SWAP_IN, minOut: minimum },
  };
}
