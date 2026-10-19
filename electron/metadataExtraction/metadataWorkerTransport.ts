const maximumFrame = 256 * 1024;

// Private pipes only. The framed form is consumable by the ordinary Core without Node IPC internals.
export const metadataWorkerTransport = (receive: (message: unknown) => Promise<void>, stop: () => void) => {
  if (!process.argv.includes("--stdio")) {
    process.on("message", message => { void receive(message).catch(stop); });
    return (message: unknown) => { if (process.connected) process.send?.(message, error => { if (error) stop(); }); };
  }
  // Parser diagnostics must never become protocol bytes.
  for (const key of ["log", "info", "warn", "debug", "error"] as const) console[key] = () => {};
  process.stdout.on("error", stop);
  process.stdin.on("end", stop);
  process.stdin.on("error", stop);
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk: Buffer) => {
    if (buffer.length + chunk.length > maximumFrame + 4) return stop();
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readUInt32LE();
      if (size < 1 || size > maximumFrame) return stop();
      if (buffer.length < size + 4) return;
      try {
        const value: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(buffer.subarray(4, size + 4)));
        buffer = buffer.subarray(size + 4);
        void receive(value).catch(stop);
      } catch { stop(); return; }
    }
  });
  return (message: unknown) => {
    const bytes = Buffer.from(JSON.stringify(message));
    if (bytes.length > maximumFrame) return stop();
    const header = Buffer.alloc(4); header.writeUInt32LE(bytes.length);
    process.stdout.write(Buffer.concat([header, bytes]), error => { if (error) stop(); });
  };
};
