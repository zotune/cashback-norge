// Browsers report IDN hosts in punycode (trøndermobil.no → xn--trndermobil-hgb.no).
// Decode before a host label is shown as a name. RFC 3492, no dependency so it
// also runs in the extension and the userscript.

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function digitValue(code: number): number {
  if (code >= 48 && code <= 57) return code - 22; // 0-9 → 26-35
  if (code >= 65 && code <= 90) return code - 65; // A-Z
  if (code >= 97 && code <= 122) return code - 97; // a-z
  return BASE;
}

/** Decodes one punycode label body (without "xn--"); undefined when malformed. */
export function decodePunycode(input: string): string | undefined {
  const output: number[] = [];
  const basicEnd = input.lastIndexOf("-");
  if (basicEnd > 0) {
    for (let j = 0; j < basicEnd; j++) {
      const code = input.charCodeAt(j);
      if (code >= 0x80) return undefined;
      output.push(code);
    }
  }
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let index = basicEnd > 0 ? basicEnd + 1 : 0; index < input.length;) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return undefined;
      const digit = digitValue(input.charCodeAt(index++));
      if (digit >= BASE) return undefined;
      i += digit * w;
      if (!Number.isSafeInteger(i)) return undefined;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const length = output.length + 1;
    bias = adapt(i - oldi, length, oldi === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff) return undefined;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

/** "xn--trndermobil-hgb.no" → "trøndermobil.no"; other hosts unchanged. */
export function toUnicodeHostname(hostname: string): string {
  return hostname
    .split(".")
    .map((label) => {
      if (!/^xn--/i.test(label)) return label;
      return decodePunycode(label.slice(4).toLowerCase()) ?? label;
    })
    .join(".");
}

/** A shop name from its host when nothing better is known: "Trøndermobil". */
export function hostnameDisplayLabel(hostname: string): string {
  const label = toUnicodeHostname(hostname.replace(/^www\./i, "")).split(".")[0] ?? hostname;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
