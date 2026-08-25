const assert = require("node:assert/strict");
const { registerEmbeddedMetadataIpc } = require("../dist-electron/embeddedMetadataIpc.js");

const run = async () => {
  const handles = new Map();
  const status = { phase: "idle" };
  registerEmbeddedMetadataIpc({
    registrar: { handle: (channel, listener) => handles.set(channel, listener), on: () => undefined },
    isSenderAllowed: (event) => event.sender.allowed === true,
    getStatus: () => status,
    startBackfill: async () => ({ phase: "running" }),
    cancelBackfill: async () => true
  });
  assert.deepEqual([...handles.keys()], [
    "embeddedMetadata:status",
    "embeddedMetadata:startBackfill",
    "embeddedMetadata:cancelBackfill"
  ]);
  const event = { sender: { allowed: true } };
  assert.equal(await handles.get("embeddedMetadata:status")(event), status);
  assert.deepEqual(await handles.get("embeddedMetadata:startBackfill")(event), { phase: "running" });
  assert.equal(await handles.get("embeddedMetadata:cancelBackfill")(event), true);
  await assert.rejects(handles.get("embeddedMetadata:status")({ sender: { allowed: false } }), /not allowed/);
  console.log("Embedded metadata IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
