export type Address = `0x${string}`;
export type Bytes   = `0x${string}`;

function strip0x(x:string){ return x.startsWith("0x")?x.slice(2):x; }
function pad32(h:string){ return h.padStart(64,"0"); }
function encUint(x:bigint){ return pad32(x.toString(16)); }
function toTwos(x:bigint){ return x>=0n?x:((1n<<256n)+x); }
function encInt(x:bigint){ return pad32(toTwos(x).toString(16)); }
function encBool(b:boolean){ return encUint(b?1n:0n); }
function encAddress(a:Address){
  const h=strip0x(a); if(h.length!==40) throw new Error("bad address");
  return pad32(h);
}
function encBytes32(b:Bytes){
  const h=strip0x(b); if(h.length!==64) throw new Error("bad bytes32");
  return h;
}
function encDynBytes(b:Bytes){
  const h=strip0x(b);
  const len=BigInt(h.length/2);
  const pad=(32n-(len%32n))%32n;
  return encUint(len)+h+"00".repeat(Number(pad));
}

export function abiEncode(args:{head:string; tail?:string; isDyn:boolean}[]): string {
  const headSlots:string[]=[];
  const tails:string[]=[];
  const headSize=32n*BigInt(args.length);
  let off=headSize;

  for(const a of args){
    if(!a.isDyn){ headSlots.push(a.head); }
    else{
      headSlots.push(encUint(off));
      const t=a.tail??"";
      tails.push(t);
      off += BigInt(t.length/2);
    }
  }
  return headSlots.join("") + tails.join("");
}

// v4 tuples
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;         // uint24
  tickSpacing: number; // int24
  hooks: Address;
};

export type ModifyLiquidityParams = {
  tickLower: number;      // int24
  tickUpper: number;      // int24
  liquidityDelta: bigint; // int256
  salt: Bytes;            // bytes32
};

export type SwapParams = {
  zeroForOne: boolean;       // bool
  amountSpecified: bigint;   // int256
  sqrtPriceLimitX96: bigint; // uint160
};

function encUint24(x:number){ return encUint(BigInt(x)&((1n<<24n)-1n)); }
function encInt24(x:number){ return encInt(BigInt(x)); }
function encUint160(x:bigint){ return encUint(x & ((1n<<160n)-1n)); }

export function encPoolKey(k:PoolKey): string {
  return (
    encAddress(k.currency0) +
    encAddress(k.currency1) +
    encUint24(k.fee) +
    encInt24(k.tickSpacing) +
    encAddress(k.hooks)
  );
}

export function encModifyLiquidityParams(p:ModifyLiquidityParams): string {
  return (
    encInt24(p.tickLower) +
    encInt24(p.tickUpper) +
    encInt(p.liquidityDelta) +
    encBytes32(p.salt)
  );
}

export function encSwapParams(p:SwapParams): string {
  return (
    encBool(p.zeroForOne) +
    encInt(p.amountSpecified) +
    encUint160(p.sqrtPriceLimitX96)
  );
}

export function dynBytesArg(b:Bytes){
  return { head:"", tail:encDynBytes(b), isDyn:true };
}
export function addrArg(a:Address){
  return { head: encAddress(a), isDyn:false };
}
export function uintArg(x:bigint){
  return { head: encUint(x), isDyn:false };
}