import path from "node:path";
import { randomBytes } from "node:crypto";
import type {
  ComputerSearchAuthorization, ComputerSearchAuthorizationBatch, ComputerSearchItem,
  ComputerSearchCapabilityOptions, ComputerSearchCapabilityRequest, ComputerSearchCapabilityResult,
  ComputerSearchNextPageRequest, ComputerSearchPage,
  ComputerSearchRequest, ComputerSearchState, ComputerSearchStatus
} from "./computerSearchTypes";
import { ComputerSearchCapabilityController } from "./computerSearchCapability";
import { startComputerSearchCatalogSynchronization } from "./computerSearchCatalogBootstrap";
import { CoreHostController, type CoreControllerSnapshot } from "./core/coreHostController";
import type { CoreCatalogStatus, CoreResolvedScope, CoreSearchPage } from "./core/coreProductProtocolTypes";
import { getFileFormatCapability } from "./formatCapabilities";

export interface ComputerSearchRuntime {
  status(): Promise<ComputerSearchStatus>;
  capabilityOptions(): Promise<ComputerSearchCapabilityOptions>;
  configureCapability(request: ComputerSearchCapabilityRequest): Promise<ComputerSearchCapabilityResult>;
  search(request: ComputerSearchRequest): Promise<ComputerSearchPage>;
  nextPage(request: ComputerSearchNextPageRequest): Promise<ComputerSearchPage>;
  cancel(taskId: string): Promise<boolean>;
  resolveAuthorizedItem(request: ComputerSearchAuthorization): ComputerSearchItem | null;
  resolveAuthorizedItems(request: ComputerSearchAuthorizationBatch): ComputerSearchItem[] | null;
  getVisualSessionId(taskId: string): string | null;
  stop(): Promise<void>;
}

interface RuntimeOptions {
  packaged: boolean;
  productVersion: string;
  resourcesPath?: string;
  executablePath?: string;
  beginVisualSession?: (sessionId: string) => boolean;
  cancelVisualSession?: (sessionId: string) => boolean;
}
interface SearchContext { requestId: string; volumeNames: Map<string, string> }
interface AuthorizationSession { items: Map<string, ComputerSearchItem>; visualSessionId: string }

const emptyStatus = (state: ComputerSearchState, reason?: string): ComputerSearchStatus => ({
  state, reason, searchAvailable: false, catalogRevision: 0, volumes: []
});

export const classifyComputerSearchCatalog = (catalog: CoreCatalogStatus): ComputerSearchStatus => {
  const volumes = catalog.volumes.map(({ volumeId, displayName, state, processed, total, queryable }) =>
    ({ volumeId, displayName, state, processed, total, queryable }));
  const queryable = catalog.volumes.some((volume) => volume.selected && volume.queryable);
  let state: ComputerSearchState = "unavailable";
  let reason: string | undefined = catalog.volumes.length === 0 ? "catalog-empty" : undefined;
  const taskRunning = catalog.tasks.some((task) => task.state === "running");
  if (catalog.volumes.some((volume) => volume.state === "building" || volume.state === "discovering")) {
    state = "building";
  } else if (catalog.volumes.some((volume) => volume.state === "catchingUp")) {
    state = "syncing";
  } else if (taskRunning) {
    state = queryable ? "syncing" : "building";
  } else if (catalog.volumes.some((volume) => volume.needsRebuild)) {
    state = "needs-rebuild";
  } else if (catalog.volumes.some((volume) => volume.state === "offline" || volume.state === "degraded")) {
    state = "offline";
  } else if (queryable) {
    state = "ready";
  }
  return { state, reason, searchAvailable: queryable && state !== "building" && state !== "needs-rebuild",
    catalogRevision: catalog.catalogRevision, volumes };
};

export const recoverComputerSearchStatus = (
  lastStatus: ComputerSearchStatus | null
): ComputerSearchStatus => lastStatus ?? emptyStatus("unavailable", "catalog-unavailable");

const controllerFailure = (snapshot: CoreControllerSnapshot): ComputerSearchStatus => {
  if (snapshot.state === "starting") return emptyStatus("starting");
  if (snapshot.reason === "core-host-missing" || snapshot.reason === "packaged-core-not-installed") {
    return emptyStatus("not-enabled", "core-not-installed");
  }
  return emptyStatus(snapshot.state === "failed" ? "repair-required" : "unavailable", snapshot.reason);
};

const defaultExecutablePath = (packaged: boolean): string => packaged
  ? path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Cap7CE", "Core", "v1", "Cap7CE.Core.Host.exe")
  : path.resolve(__dirname, "../core/artifacts/bin/Cap7CE.Core.Host/Release/net10.0-windows/Cap7CE.Core.Host.exe");

export const createComputerSearchRuntime = (options: RuntimeOptions): ComputerSearchRuntime => {
  const controller = new CoreHostController({
    packaged: options.packaged,
    executablePath: options.executablePath ?? defaultExecutablePath(options.packaged),
    productVersion: options.productVersion,
    launchMode: "product"
  });
  const capability = new ComputerSearchCapabilityController({
    packaged: options.packaged, resourcesPath: options.resourcesPath ?? process.resourcesPath
  });
  const active = new Map<string, SearchContext>();
  const authorizationSessions = new Map<string, AuthorizationSession>();
  const cancelledTasks = new Set<string>();
  const runningTasks = new Set<string>();
  let catalogSessionInitialized = false;
  let catalogInitialization: Promise<CoreCatalogStatus> | null = null;
  let lastCatalogStatus: ComputerSearchStatus | null = null;

  const readInitializedCatalog = async (): Promise<CoreCatalogStatus> => {
    const current = await controller.request<CoreCatalogStatus>("catalog.status", {}, 5_000);
    if (catalogSessionInitialized) return current;
    if (!catalogInitialization) {
      catalogInitialization = startComputerSearchCatalogSynchronization(controller)
        .then((catalog) => { catalogSessionInitialized = true; return catalog; })
        .finally(() => { catalogInitialization = null; });
    }
    return catalogInitialization;
  };

  const releaseAuthorizationSession = (taskId: string) => {
    const session = authorizationSessions.get(taskId);
    if (!session) return false;
    authorizationSessions.delete(taskId);
    options.cancelVisualSession?.(session.visualSessionId);
    return true;
  };

  const getAuthorizationSession = (taskId: string) => {
    const current = authorizationSessions.get(taskId);
    if (current) return current;
    const session = { items: new Map<string, ComputerSearchItem>(), visualSessionId: `computer-search:${taskId}` };
    authorizationSessions.set(taskId, session);
    options.beginVisualSession?.(session.visualSessionId);
    return session;
  };

  const readCatalog = async (): Promise<CoreCatalogStatus> => {
    const snapshot = await controller.start();
    if (snapshot.state !== "ready") throw new Error(controllerFailure(snapshot).reason ?? snapshot.state);
    return readInitializedCatalog();
  };

  const toPage = (taskId: string, page: CoreSearchPage, names: Map<string, string>): ComputerSearchPage => {
    const authorizationSession = getAuthorizationSession(taskId);
    return {
      taskId,
      items: page.items.map((item): ComputerSearchItem => {
        const volumeId = item.volumeId ?? "";
        const volumeName = names.get(volumeId) ?? volumeId;
        const relativePath = item.relativePath.replace(/^\\+/, "");
        const extension = item.extension.startsWith(".") ? item.extension.toLowerCase() : `.${item.extension.toLowerCase()}`;
        const capability = item.isDirectory ? null : getFileFormatCapability(extension);
        const authorizationId = randomBytes(24).toString("base64url");
        const authorizedItem: ComputerSearchItem = {
          ...item,
          authorizationId,
          volumeId,
          fileReference: item.fileReference ?? "",
          path: relativePath ? `${volumeName}\\${relativePath}` : `${volumeName}\\`,
          iconName: capability?.iconName ?? "",
          previewKind: capability?.previewKind ?? "fileInfo",
          canThumbnail: Boolean(capability?.canThumbnail),
          canShellPreview: Boolean(capability?.canShellPreview),
          canDirectPreview: Boolean(capability?.canDirectPreview)
        };
        authorizationSession.items.set(authorizationId, authorizedItem);
        return authorizedItem;
      }),
      nextCursor: page.nextCursor,
      isComplete: page.isComplete,
      catalogRevision: page.catalogRevision
    };
  };

  const complete = async (
    taskId: string,
    pending: { requestId: string; response: Promise<CoreSearchPage> },
    names: Map<string, string>
  ): Promise<ComputerSearchPage> => {
    active.set(taskId, { requestId: pending.requestId, volumeNames: names });
    try {
      const response = await pending.response;
      if (cancelledTasks.has(taskId)) throw new Error("search-cancelled");
      const page = toPage(taskId, response, names);
      if (page.isComplete) active.delete(taskId);
      else active.set(taskId, { requestId: "", volumeNames: names });
      return page;
    } catch (error) {
      active.delete(taskId);
      throw error;
    }
  };

  return {
    async status() {
      const snapshot = await controller.start();
      if (snapshot.state !== "ready") return controllerFailure(snapshot);
      try {
        const next = classifyComputerSearchCatalog(await readInitializedCatalog());
        lastCatalogStatus = next;
        return next;
      } catch { return recoverComputerSearchStatus(lastCatalogStatus); }
    },
    capabilityOptions() { return capability.status(); },
    async configureCapability(request) {
      await this.stop();
      catalogSessionInitialized = false;
      catalogInitialization = null;
      lastCatalogStatus = null;
      return capability.configure(request);
    },
    async search(request) {
      await this.cancel(request.taskId);
      cancelledTasks.delete(request.taskId);
      runningTasks.add(request.taskId);
      try {
        const catalog = await readCatalog();
        if (cancelledTasks.has(request.taskId)) throw new Error("search-cancelled");
        const names = new Map(catalog.volumes.map((volume) => [volume.volumeId, volume.displayName]));
        let scope: Record<string, unknown> = { kind: "all-volumes" };
        let volumeIds: string[] = [];
        if (request.scopePath !== null) {
          const resolved = await controller.request<CoreResolvedScope>(
            "catalog.resolveScope", { path: request.scopePath }, 5_000
          );
          if (cancelledTasks.has(request.taskId)) throw new Error("search-cancelled");
          if (!resolved.resolved || !resolved.queryable || !resolved.volumeId) {
            throw new Error(resolved.state === "offline" ? "scope-offline" : "scope-not-indexed");
          }
          volumeIds = [resolved.volumeId];
          scope = resolved.rootFileReference
            ? { kind: "directory-descendants", volumeId: resolved.volumeId,
              rootFileReference: resolved.rootFileReference }
            : { kind: "all-volumes" };
        }
        const pending = controller.startRequest<CoreSearchPage>("search.start", {
          query: request.query, pageSize: 100, sort: "name-ascending", volumeIds, scope, entryType: "any"
        }, 30_000);
        return await complete(request.taskId, pending, names);
      } finally {
        runningTasks.delete(request.taskId);
        cancelledTasks.delete(request.taskId);
      }
    },
    async nextPage(request) {
      const context = active.get(request.taskId);
      if (!context) throw new Error("search-task-not-found");
      runningTasks.add(request.taskId);
      try {
        const pending = controller.startRequest<CoreSearchPage>(
          "search.nextPage", { cursor: request.cursor }, 30_000
        );
        return await complete(request.taskId, pending, context.volumeNames);
      } finally {
        runningTasks.delete(request.taskId);
        cancelledTasks.delete(request.taskId);
      }
    },
    async cancel(taskId) {
      if (runningTasks.has(taskId)) cancelledTasks.add(taskId);
      else cancelledTasks.delete(taskId);
      const context = active.get(taskId);
      active.delete(taskId);
      const released = releaseAuthorizationSession(taskId);
      const cancelled = context?.requestId ? await controller.cancelRequest(context.requestId).catch(() => false) : false;
      return released || cancelled;
    },
    resolveAuthorizedItem(request) {
      return authorizationSessions.get(request.taskId)?.items.get(request.authorizationId) ?? null;
    },
    resolveAuthorizedItems(request) {
      const session = authorizationSessions.get(request.taskId);
      if (!session) return null;
      const items = request.authorizationIds.map((authorizationId) => session.items.get(authorizationId));
      return items.every((item): item is ComputerSearchItem => Boolean(item)) ? items : null;
    },
    getVisualSessionId(taskId) { return authorizationSessions.get(taskId)?.visualSessionId ?? null; },
    async stop() {
      active.clear();
      cancelledTasks.clear();
      runningTasks.clear();
      for (const taskId of [...authorizationSessions.keys()]) releaseAuthorizationSession(taskId);
      await controller.stop();
      catalogSessionInitialized = false;
      catalogInitialization = null;
      lastCatalogStatus = null;
    }
  };
};
