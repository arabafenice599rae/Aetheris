import { opCall, opCallV, opErc20Xfer, opSettle, opTake } from "../compiler/payloads";
import { encodeSync, encodeSettleFor, encodeTake } from "../compiler/pm_abi_encode";

export type Currency = `0x${string}`;

export type Delta = {
  currency: Currency;
  amount: bigint;               // signed: >0 take, <0 pay+settle
  token?: `0x${string}`;        // ERC20 contract address used for transfer(PM, amount)
  isNative?: boolean;           // true => use CALLV + settleFor
};

export type ClosePlan = {
  recipient: `0x${string}`;
  takeTo: `0x${string}`;
  deltas: Delta[];
};

export function buildAutoCloseOps(plan: ClosePlan): Uint8Array[] {
  const ops: Uint8Array[] = [];

  // pay & settle negatives
  for (const d of plan.deltas) {
    if (d.amount >= 0n) continue;
    const pay = -d.amount;
    const settleCd = encodeSettleFor(plan.recipient);

    if (d.isNative) {
      ops.push(opCallV(pay, settleCd));
    } else {
      if (!d.token) throw new Error(`missing token for ERC20 funding of ${d.currency}`);
      ops.push(opCall(encodeSync(d.currency)));
      ops.push(opErc20Xfer(d.token, pay));
      ops.push(opSettle(settleCd));
    }
  }

  // take positives
  for (const d of plan.deltas) {
    if (d.amount <= 0n) continue;
    ops.push(opTake(encodeTake(d.currency, plan.takeTo, d.amount)));
  }

  return ops;
}