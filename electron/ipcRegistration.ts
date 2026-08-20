import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

type IpcInvokeListener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type IpcEventListener = (event: IpcMainEvent, ...args: unknown[]) => void;

export interface IpcRegistrar {
  handle(channel: string, listener: IpcInvokeListener): void;
  on(channel: string, listener: IpcEventListener): void;
}

export type IpcDomainRegistration =
  | {
    kind: "handle";
    channel: string;
    listener: IpcInvokeListener;
  }
  | {
    kind: "on";
    channel: string;
    listener: IpcEventListener;
  };

export interface RegisterIpcDomainOptions {
  registrar: IpcRegistrar;
  registrations: readonly IpcDomainRegistration[];
  isSenderAllowed?: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
}

const assertValidChannel = (channel: string): void => {
  if (channel.trim().length === 0) {
    throw new Error("IPC channel must not be empty.");
  }
};

export const registerIpcDomain = ({
  registrar,
  registrations,
  isSenderAllowed = () => true
}: RegisterIpcDomainOptions): void => {
  const registeredChannels = new Set<string>();

  for (const registration of registrations) {
    assertValidChannel(registration.channel);
    if (registeredChannels.has(registration.channel)) {
      throw new Error(`IPC channel is registered more than once in the same domain: ${registration.channel}`);
    }
    registeredChannels.add(registration.channel);

    if (registration.kind === "handle") {
      registrar.handle(registration.channel, async (event, ...args) => {
        if (!isSenderAllowed(event)) {
          throw new Error(`IPC sender is not allowed for channel: ${registration.channel}`);
        }
        return registration.listener(event, ...args);
      });
      continue;
    }

    registrar.on(registration.channel, (event, ...args) => {
      if (!isSenderAllowed(event)) {
        return;
      }
      registration.listener(event, ...args);
    });
  }
};
