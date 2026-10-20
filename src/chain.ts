import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { foundry } from "viem/chains";

export const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

export const publicClient = createPublicClient({ chain: foundry, transport: http("/rpc") });
const owner = createWalletClient({ account: OWNER, chain: foundry, transport: http("/rpc") });

export const erc20 = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const poolAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "reserve0", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reserve1", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getAmountOut",
    stateMutability: "pure",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "reserveIn", type: "uint256" },
      { name: "reserveOut", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "addLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount0Desired", type: "uint256" },
      { name: "amount1Desired", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "swap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "error",
    name: "InsufficientOutput",
    inputs: [
      { name: "output", type: "uint256" },
      { name: "minimum", type: "uint256" },
    ],
  },
] as const;

export type PoolState = {
  pool: Address;
  token0: Address;
  token1: Address;
  symbol0: string;
  symbol1: string;
  reserve0: bigint;
  reserve1: bigint;
};

export function coins(value: bigint): string {
  const rounded = (value + 50_000_000_000_000n) / 100_000_000_000_000n;
  const whole = rounded / 10_000n;
  const frac = (rounded % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function explain(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name === "InsufficientOutput") return "The pool would pay less than the minimum, so the swap did not happen.";
      return `The contract rejected it (${name ?? "reverted"}).`;
    }
    return "The local chain is not running. Start it, then refresh this page.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "The local chain is not running. Start it, then refresh this page.";
}

export async function loadPool(pool: Address): Promise<PoolState> {
  const [token0, token1, reserve0, reserve1] = await Promise.all([
    publicClient.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
    publicClient.readContract({ address: pool, abi: poolAbi, functionName: "token1" }),
    publicClient.readContract({ address: pool, abi: poolAbi, functionName: "reserve0" }),
    publicClient.readContract({ address: pool, abi: poolAbi, functionName: "reserve1" }),
  ]);
  const [symbol0, symbol1] = await Promise.all([
    publicClient.readContract({ address: token0, abi: erc20, functionName: "symbol" }),
    publicClient.readContract({ address: token1, abi: erc20, functionName: "symbol" }),
  ]);
  return { pool, token0, token1, symbol0, symbol1, reserve0, reserve1 };
}

export async function quote(pool: PoolState, amountIn: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: pool.pool,
    abi: poolAbi,
    functionName: "getAmountOut",
    args: [amountIn, pool.reserve0, pool.reserve1],
  });
}

export async function simulateSwap(pool: PoolState, amountIn: bigint, minOut: bigint): Promise<string | null> {
  try {
    await publicClient.simulateContract({
      account: OWNER,
      address: pool.pool,
      abi: poolAbi,
      functionName: "swap",
      args: [pool.token0, amountIn, minOut, OWNER],
    });
    return null;
  } catch (error) {
    return explain(error);
  }
}

async function send(address: Address, abi: typeof erc20 | typeof poolAbi, functionName: string, args: readonly unknown[]) {
  const request = { account: OWNER, address, abi, functionName, args };
  await publicClient.simulateContract(request as never);
  const hash = await owner.writeContract(request as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction was rejected.");
  return receipt.gasUsed;
}

export async function addLiquidity(pool: PoolState, amount: bigint): Promise<bigint> {
  let gas = 0n;
  gas += await send(pool.token0, erc20, "mint", [OWNER, amount]);
  gas += await send(pool.token1, erc20, "mint", [OWNER, amount]);
  gas += await send(pool.token0, erc20, "approve", [pool.pool, amount]);
  gas += await send(pool.token1, erc20, "approve", [pool.pool, amount]);
  gas += await send(pool.pool, poolAbi, "addLiquidity", [amount, amount, OWNER]);
  return gas;
}

export async function swap(pool: PoolState, amountIn: bigint, minOut: bigint): Promise<{ received: bigint; gas: bigint }> {
  const before = await publicClient.readContract({
    address: pool.token1,
    abi: erc20,
    functionName: "balanceOf",
    args: [OWNER],
  });
  let gas = 0n;
  gas += await send(pool.token0, erc20, "mint", [OWNER, amountIn]);
  gas += await send(pool.token0, erc20, "approve", [pool.pool, amountIn]);
  gas += await send(pool.pool, poolAbi, "swap", [pool.token0, amountIn, minOut, OWNER]);
  const after = await publicClient.readContract({
    address: pool.token1,
    abi: erc20,
    functionName: "balanceOf",
    args: [OWNER],
  });
  return { received: after - before, gas };
}
