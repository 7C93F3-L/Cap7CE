const assert = require("node:assert/strict");
const { registerIpcDomain } = require("../dist-electron/ipcRegistration.js");

const createRegistrar = () => {
  const handles = new Map();
  const events = new Map();
  return {
    handles,
    events,
    registrar: {
      handle(channel, listener) {
        handles.set(channel, listener);
      },
      on(channel, listener) {
        events.set(channel, listener);
      }
    }
  };
};

const run = async () => {
  {
    const { registrar, handles, events } = createRegistrar();
    const invokeEvent = { sender: { id: 1 } };
    const event = { sender: { id: 1 } };
    const received = [];

    registerIpcDomain({
      registrar,
      registrations: [
        {
          kind: "handle",
          channel: "sample:invoke",
          listener: (receivedEvent, ...args) => {
            received.push(["handle", receivedEvent, args]);
            return { ok: true };
          }
        },
        {
          kind: "on",
          channel: "sample:event",
          listener: (receivedEvent, ...args) => {
            received.push(["on", receivedEvent, args]);
          }
        }
      ]
    });

    assert.deepEqual(await handles.get("sample:invoke")(invokeEvent, "value", 7), { ok: true });
    events.get("sample:event")(event, { enabled: true });
    assert.deepEqual(received, [
      ["handle", invokeEvent, ["value", 7]],
      ["on", event, [{ enabled: true }]]
    ]);
  }

  {
    const { registrar, handles, events } = createRegistrar();
    let invokeCalls = 0;
    let eventCalls = 0;

    registerIpcDomain({
      registrar,
      isSenderAllowed: (event) => event.sender.id === 1,
      registrations: [
        {
          kind: "handle",
          channel: "guarded:invoke",
          listener: () => {
            invokeCalls += 1;
          }
        },
        {
          kind: "on",
          channel: "guarded:event",
          listener: () => {
            eventCalls += 1;
          }
        }
      ]
    });

    await assert.rejects(
      handles.get("guarded:invoke")({ sender: { id: 2 } }),
      /IPC sender is not allowed for channel: guarded:invoke/
    );
    events.get("guarded:event")({ sender: { id: 2 } });
    assert.equal(invokeCalls, 0);
    assert.equal(eventCalls, 0);

    await handles.get("guarded:invoke")({ sender: { id: 1 } });
    events.get("guarded:event")({ sender: { id: 1 } });
    assert.equal(invokeCalls, 1);
    assert.equal(eventCalls, 1);
  }

  {
    const { registrar } = createRegistrar();
    assert.throws(() => registerIpcDomain({
      registrar,
      registrations: [
        { kind: "handle", channel: "duplicate", listener: () => undefined },
        { kind: "on", channel: "duplicate", listener: () => undefined }
      ]
    }), /IPC channel is registered more than once/);

    assert.throws(() => registerIpcDomain({
      registrar,
      registrations: [
        { kind: "handle", channel: "   ", listener: () => undefined }
      ]
    }), /IPC channel must not be empty/);
  }

  console.log("IPC registration integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
