export type HookClass = "vanilla-safe" | "hook-safe" | "hook-hostile";

export type HookPolicy = {
  hooks: `0x${string}`;
  cls: HookClass;
  note?: string;
};

// Start minimal: you fill with observed hooks
const TABLE: HookPolicy[] = [
  { hooks: "0x0000000000000000000000000000000000000000", cls: "vanilla-safe", note: "no hooks" },
];

export function classifyHook(hooks: `0x${string}`): HookClass {
  const found = TABLE.find((x) => x.hooks.toLowerCase() === hooks.toLowerCase());
  return found?.cls ?? "hook-safe";
}

export function allowPoolByHook(hooks: `0x${string}`): boolean {
  const cls = classifyHook(hooks);
  return cls !== "hook-hostile";
}