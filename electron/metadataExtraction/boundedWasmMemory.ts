// Constrain the single, unshared 32-bit local memory of a bundled WASM reader.
// This transforms an in-memory copy; installed dependency bytes stay untouched.
export const boundWasmMemory = (source: Uint8Array, maximumBytes: number): Uint8Array => {
  const invalid = (): never => { throw new Error("archive-wasm-memory-contract-invalid"); };
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 65536 || maximumBytes % 65536 !== 0
    || maximumBytes > 512 * 1024 * 1024 || source.length < 8 || source.length > 16 * 1024 * 1024
    || [0, 97, 115, 109, 1, 0, 0, 0].some((byte, index) => source[index] !== byte)) return invalid();
  let cursor = 8;
  const readUnsigned = (limit: number): number => {
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      if (cursor >= limit) return invalid();
      const byte = source[cursor++];
      if (shift === 28 && byte > 15) return invalid();
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
    }
    return invalid();
  };
  const encode = (value: number): number[] => {
    const bytes: number[] = [];
    do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte + (value ? 128 : 0)); } while (value);
    return bytes;
  };
  let replacement: { start: number; end: number; bytes: Uint8Array } | undefined;
  while (cursor < source.length) {
    const start = cursor, section = source[cursor++], length = readUnsigned(source.length), end = cursor + length;
    if (end > source.length) return invalid();
    if (section === 5) {
      if (replacement || readUnsigned(end) !== 1) return invalid();
      const flags = readUnsigned(end);
      if (flags !== 0 && flags !== 1) return invalid();
      const minimum = readUnsigned(end), originalMaximum = flags === 1 ? readUnsigned(end) : 65536;
      const maximum = Math.min(originalMaximum, maximumBytes / 65536);
      if (cursor !== end || minimum > maximum) return invalid();
      const payload = [1, 1, ...encode(minimum), ...encode(maximum)];
      replacement = { start, end, bytes: Uint8Array.from([5, ...encode(payload.length), ...payload]) };
    }
    cursor = end;
  }
  if (!replacement) return invalid();
  const output = new Uint8Array(source.length - (replacement.end - replacement.start) + replacement.bytes.length);
  output.set(source.subarray(0, replacement.start)); output.set(replacement.bytes, replacement.start);
  output.set(source.subarray(replacement.end), replacement.start + replacement.bytes.length);
  if (!WebAssembly.validate(output)) return invalid();
  return output;
};
