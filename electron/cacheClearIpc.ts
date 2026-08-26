import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

interface CacheClearAuthorization {
  token: string;
  expiresAt: number;
}

export interface CacheClearIpcDependencies {
  registrar: IpcRegistrar;
  createToken: () => string;
  now?: () => number;
  authorizationLifetimeMs?: number;
  translateConfirmationRequired: () => string;
  clearFormalCache: () => Promise<unknown>;
  clearThumbnailCache: () => Promise<unknown>;
  getSkimCacheStats: () => unknown;
  clearSkimCache: () => Promise<unknown>;
}

export const registerCacheClearIpc = ({
  registrar,
  createToken,
  now = Date.now,
  authorizationLifetimeMs = 30_000,
  translateConfirmationRequired,
  clearFormalCache,
  clearThumbnailCache,
  getSkimCacheStats,
  clearSkimCache
}: CacheClearIpcDependencies): void => {
  let formalAuthorization: CacheClearAuthorization | null = null;
  let skimAuthorization: CacheClearAuthorization | null = null;

  const authorize = (): CacheClearAuthorization => ({
    token: createToken(),
    expiresAt: now() + authorizationLifetimeMs
  });
  const assertAuthorized = (token: string | undefined, authorization: CacheClearAuthorization | null): void => {
    if (!authorization || token !== authorization.token || now() > authorization.expiresAt) {
      throw new Error(translateConfirmationRequired());
    }
  };

  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "cache:authorizeClear",
        listener: () => {
          formalAuthorization = authorize();
          return formalAuthorization.token;
        }
      },
      {
        kind: "handle",
        channel: "cache:clearAll",
        listener: async (_event, token?: string) => {
          const authorization = formalAuthorization;
          formalAuthorization = null;
          assertAuthorized(token, authorization);
          return clearFormalCache();
        }
      },
      {
        kind: "handle",
        channel: "cache:clearThumbnails",
        listener: async (_event, token?: string) => {
          const authorization = formalAuthorization;
          formalAuthorization = null;
          assertAuthorized(token, authorization);
          return clearThumbnailCache();
        }
      },
      {
        kind: "handle",
        channel: "skimCache:stats",
        listener: () => getSkimCacheStats()
      },
      {
        kind: "handle",
        channel: "skimCache:authorizeClear",
        listener: () => {
          skimAuthorization = authorize();
          return skimAuthorization.token;
        }
      },
      {
        kind: "handle",
        channel: "skimCache:clear",
        listener: async (_event, token?: string) => {
          const authorization = skimAuthorization;
          skimAuthorization = null;
          assertAuthorized(token, authorization);
          return clearSkimCache();
        }
      }
    ]
  });
};
