import { opCall, opCallV, opErc20Xfer, opSettle, opTake, opClear } from "../compiler/payloads";
import { encodeSync, encodeSettleFor, encodeTake, encodeClear } from "../compiler/pm_abi_encode";

export type Currency = `0x${string}`; // address-style currency

export type Delta = {
  currency: Currency;
  // signed amount: >0 means PM owes you (take), <0 means you owe PM (fund+settle)
  amount: bigint;
  // ERC20 token address for funding (if currency is ERC20)
  token?: `0x${string}`;
  // if true: treat as native funding via CALLV+settleFor
  isNative?: boolean;
};

export type ClosePlan = {
  recipient: `0x${string}`;   // where settleFor credits
  takeTo: `0x${string}`;      // where take sends funds
  // deltas after economic ops, computed by Brain/sim
  deltas: Delta[];
};

export function buildAutoCloseOps(plan: ClosePlan): Uint8Array[] {
  const ops: Uint8Array[] = [];

  // 1) fund + settle for negatives
  for (const d of plan.deltas) {
    if (d.amount >= 0n) continue;

    const pay = -d.amount;

    // settleFor(recipient) call-data
    const settleCd = encodeSettleFor(plan.recipient);

    if (d.isNative) {
      // native funding: CALLV(value, settleFor)
      ops.push(opCallV(pay, settleCd));
    } else {
      if (!d.currency) throw new Error("missing currency");
      if (!d.token) throw new Error(`missing token for ERC20 funding of ${d.currency}`);
      // ERC20 path: sync(currency) -> token.transfer(PM, pay) -> settleFor(recipient)
      ops.push(opCall(encodeSync(d.currency)));
      ops.push(opErc20Xfer(d.token, pay));
      ops.push(opSettle(settleCd));
    }
  }

  // 2) take positives
  for (const d of plan.deltas) {
    if (d.amount <= 0n) continue;

    const takeCd = encodeTake(d.currency, plan.takeTo, d.amount);
    ops.push(opTake(takeCd));
  }

  // 3) optional: if you ever need to clear without take (rare), keep hook:
  // here we clear only if amount==0? no-op. If you want forced cleanups, add policy.
  // Provided as utility:
  for (const d of plan.deltas) {
    if (d.amount === 0n) continue;
    // If your policy wants explicit clear for any remaining positive deltas not taken:
    // ops.push(opClear(encodeClear(d.currency, d.amount>0n?d.amount:0n)));
  }

  return ops;
}