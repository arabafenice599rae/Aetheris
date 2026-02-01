// offchain/risk/hooks.ts
export type HookClass = "vanilla-safe" | "hook-safe" | "hook-hostile";

export type HookPolicy = {
  hooks: `0x${string}`;
  cls: HookClass;
  flags14: number;
  note?: string;
};

export function allowByClass(cls: HookClass): boolean {
  return cls !== "hook-hostile";
}