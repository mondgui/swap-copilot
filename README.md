# 07 — Guarded swap copilot

A local page for the mini exchange. You ask for a deposit or a swap. The assistant quotes it and waits. Approve sends that plan. Decline sends nothing. A demand above the quote is refused, with no approve button.

## Why this one

Agent roles want planning and a person in the loop. An assistant that spends on its own is not something to put on a resume. This one can only send the trade you just approved, on a chain running on your computer.

## Page

http://localhost:5179

From the portfolio folder, run `.\start-local-pages.ps1`. The local chain has to be up, because this page uses the exchange from project 04.

Try it in this order: plan a deposit and approve it, plan a swap of 100 and decline it, plan the same swap and approve it, then demand more than the quote.

## Stack

TypeScript, viem, the mini exchange from project 04, a local Anvil chain.

## Done when

- A quote is shown before anything is sent.
- Decline leaves the pool balances unchanged.
- Approve sends the minimum that was on screen.
- Asking for more than the quote produces no approve button.
