import "./style.css";
import { planDeposit, planSwap, type Proposal, type Step } from "./agent";
import { addLiquidity, coins, explain, loadPool, swap, type PoolState } from "./chain";
import type { Address } from "viem";

const status = document.querySelector("#status") as HTMLParagraphElement;
const label0 = document.querySelector("#label0") as HTMLParagraphElement;
const label1 = document.querySelector("#label1") as HTMLParagraphElement;
const reserve0El = document.querySelector("#reserve0") as HTMLParagraphElement;
const reserve1El = document.querySelector("#reserve1") as HTMLParagraphElement;
const stepsEl = document.querySelector("#steps") as HTMLOListElement;
const planEl = document.querySelector("#plan") as HTMLElement;
const planTitle = document.querySelector("#plan-title") as HTMLHeadingElement;
const planLines = document.querySelector("#plan-lines") as HTMLDivElement;
const decision = document.querySelector("#decision") as HTMLDivElement;
const approveButton = document.querySelector("#approve") as HTMLButtonElement;
const declineButton = document.querySelector("#decline") as HTMLButtonElement;
const requestButtons = [...document.querySelectorAll<HTMLButtonElement>(".actions button")];

let pool: PoolState | null = null;
let pending: Proposal | null = null;

function setBusy(busy: boolean) {
  for (const button of [...requestButtons, approveButton, declineButton]) button.disabled = busy;
}

function showSteps(steps: Step[]) {
  stepsEl.replaceChildren();
  for (const step of steps) {
    const item = document.createElement("li");
    const tool = document.createElement("span");
    tool.className = "tool";
    tool.textContent = step.tool;
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = step.detail;
    item.append(tool, detail);
    stepsEl.append(item);
  }
}

function showPlan(proposal: Proposal) {
  pending = proposal;
  showSteps(proposal.steps);
  planTitle.textContent = proposal.title;
  planLines.replaceChildren();
  for (const line of proposal.lines) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    planLines.append(paragraph);
  }
  planEl.hidden = false;
  planEl.className = proposal.action ? "plan" : "plan refused";
  decision.hidden = proposal.action === null;
}

function showReserves() {
  if (!pool) return;
  label0.textContent = `${pool.symbol0} in the pool`;
  label1.textContent = `${pool.symbol1} in the pool`;
  reserve0El.textContent = coins(pool.reserve0);
  reserve1El.textContent = coins(pool.reserve1);
}

async function refresh() {
  if (!pool) return;
  pool = await loadPool(pool.pool);
  showReserves();
}

async function propose(kind: "deposit" | "swap" | "greedy") {
  if (!pool) return;
  setBusy(true);
  status.textContent = "Reading the pool. Nothing is being sent.";
  try {
    await refresh();
    const proposal =
      kind === "deposit" ? await planDeposit(pool) : await planSwap(pool, kind === "greedy");
    showPlan(proposal);
    status.textContent = proposal.action ? "Waiting for you. Decline leaves the pool unchanged." : "Refused. Nothing was sent.";
  } catch (error) {
    status.textContent = explain(error);
    planEl.hidden = true;
    pending = null;
  } finally {
    setBusy(false);
  }
}

document.querySelector("#deposit")!.addEventListener("click", () => void propose("deposit"));
document.querySelector("#swap")!.addEventListener("click", () => void propose("swap"));
document.querySelector("#greedy")!.addEventListener("click", () => void propose("greedy"));

declineButton.addEventListener("click", () => {
  pending = null;
  decision.hidden = true;
  planTitle.textContent = "Declined";
  planLines.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.textContent = "Nothing was sent. The pool balances above are unchanged.";
  planLines.append(paragraph);
  planEl.className = "plan";
  status.textContent = "Declined.";
});

approveButton.addEventListener("click", () => {
  const action = pending?.action;
  if (!pool || !action) return;
  void (async () => {
    setBusy(true);
    status.textContent = "Sending the plan you approved…";
    try {
      if (action.kind === "deposit") {
        const gas = await addLiquidity(pool, action.amount);
        await refresh();
        status.textContent = `Deposit sent. Gas used: ${gas.toString()}.`;
      } else {
        const result = await swap(pool, action.amountIn, action.minOut);
        await refresh();
        status.textContent = `Swap sent. Received ${coins(result.received)} ${pool.symbol1}. Gas used: ${result.gas.toString()}.`;
      }
      pending = null;
      decision.hidden = true;
    } catch (error) {
      status.textContent = explain(error);
    } finally {
      setBusy(false);
    }
  })();
});

const loaded = (await fetch("/addresses.json", { cache: "no-store" }).then((response) => response.json())) as {
  pool: Address;
};

if (loaded.pool === "0x0000000000000000000000000000000000000000") {
  status.textContent = "The exchange is not on the local chain yet. Run start-local-pages.ps1 from the portfolio folder.";
  setBusy(true);
} else {
  try {
    pool = await loadPool(loaded.pool);
    showReserves();
    status.textContent = "Connected. Plan a deposit first if both balances are zero.";
  } catch (error) {
    status.textContent = explain(error);
    setBusy(true);
  }
}
