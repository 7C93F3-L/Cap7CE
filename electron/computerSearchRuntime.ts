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
import { CoreHostController, type CoreControllerSnapshot, type CoreControllerDiagnostics } from "./core/coreHostController";
import type { CoreCatalogStatus, CoreResolvedScope, CoreSearchPage } from "./core/coreProductProtocolTypes";
import { getFileFormatCapability } from "./formatCapabilities";
import type { MetadataBuildApi } from "../src/shared/metadataBuildTypes";
import { CoreMetadataBuildClient } from "./core/coreMetadataBuildClient";
import { toCoreSearchFacts } from "./computerSearchFactConditions";
import { readComputerSearchFileConditions } from "./computerSearchFileConditions";
import { CoreCatalogChangeProtocol } from "./core/coreCatalogChangeProtocol";
import { CoreCatalogChangeWatcher } from "./core/coreCatalogChangeWatcher";
import { FavoriteDirectoryStore } from "./favoriteDirectories/favoriteDirectoryStore";
import type { FavoriteDirectoryRegistry } from "../src/shared/favoriteDirectoryTypes";
import { ComputerSearchThumbnailLeases } from "./computerSearchThumbnailLeases";
import { createCatalogKeywordsRuntime, type CatalogKeywordsApi } from "./catalogKeywordsRuntime";

export interface ComputerSearchRuntime {
  thumbnailLeases: ComputerSearchThumbnailLeases;
  metadataBuild?: MetadataBuildApi;
  keywords?: CatalogKeywordsApi;
  favoriteDirectories?: FavoriteDirectoryRegistry;
  subscribeCatalogChanges?: (callback: (revision: number) => void) => () => void;
  refreshStorage?: () => Promise<void>;
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
  favoritePreferencesPath?: string;
  diagnostics?: CoreControllerDiagnostics;
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
  const interrupted = !taskRunning && catalog.tasks.some((task) => task.state === "failed" || task.state === "cancelled")
    && catalog.volumes.some((volume) => volume.selected && (volume.needsRebuild || volume.state === "building" || volume.state === "catchingUp"));
  if (interrupted) {
    state = catalog.tasks.some((task) => task.state === "failed" && task.errorCode === "reader-repair-required") ? "repair-required" : "needs-rebuild";
  } else if (catalog.volumes.some((volume) => volume.state === "building" || volume.state === "discovering")) {
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
  return { state, reason, searchAvailable: queryable,
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
  : path.resolve(__dirname, "../core/artifacts/development-product-host/Cap7CE.Core.Host.exe");

export const createComputerSearchRuntime = (options: RuntimeOptions): ComputerSearchRuntime => {
  const controller = new CoreHostController({
    packaged: options.packaged,
    executablePath: options.executablePath ?? defaultExecutablePath(options.packaged),
    productVersion: options.productVersion,
    launchMode: "product", diagnostics: options.diagnostics
  });
  const capability = new ComputerSearchCapabilityController({
    packaged: options.packaged, resourcesPath: options.resourcesPath ?? process.resourcesPath
  });
  const active = new Map<string, SearchContext>();
  const authorizationSessions = new Map<string, AuthorizationSession>();
  const thumbnailLeases = new ComputerSearchThumbnailLeases(request => authorizationSessions.get(request.taskId)?.items.get(request.authorizationId) ?? null,
    id => options.beginVisualSession?.(id), id => options.cancelVisualSession?.(id));
  const cancelledTasks = new Set<string>();
  const runningTasks = new Set<string>();
  let catalogSessionInitialized = false;
  let catalogInitialization: Promise<CoreCatalogStatus> | null = null;
  let lastCatalogStatus: ComputerSearchStatus | null = null;
  let stopping: Promise<void> | undefined;

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
    thumbnailLeases.releaseTask(taskId);
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
    if (stopping) throw new Error("computer-search-stopping");
    const snapshot = await controller.start();
    if (snapshot.state !== "ready") throw new Error(controllerFailure(snapshot).reason ?? snapshot.state);
    if (stopping) throw new Error("computer-search-stopping");
    await observeHost(snapshot);
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

  const metadataBuild = new CoreMetadataBuildClient({
    request: <T>(operation: string, body: Record<string, unknown>, deadlineMs?: number) => controller.startRequest<T>(operation, body, deadlineMs).response,
    ensureCatalog: readCatalog, supports: operation => controller.supports(operation), processId: () => controller.snapshot().processId ?? null,
    active: () => !stopping, reportStorageError: details => options.diagnostics?.log("warn", "metadata.directory-store-failed", { ...details }) });
  const favorites = options.favoritePreferencesPath || process.env.LOCALAPPDATA
    ? new FavoriteDirectoryStore(options.favoritePreferencesPath ?? path.join(process.env.LOCALAPPDATA!, "Cap7CE", "Core", "favorite-directories.json"), options) : undefined;
  let observedRevision: number | undefined;
  let observedProcess: number | undefined;
  const keywords = createCatalogKeywordsRuntime({ request: controller.request.bind(controller), start: () => controller.start(),
    supports: name => controller.supports?.(name) ?? false, processId: () => controller.snapshot().processId, active: () => !stopping });
  const changeListeners = new Set<(revision: number) => void>();
  const watcher = new CoreCatalogChangeWatcher(new CoreCatalogChangeProtocol({ request: controller.request.bind(controller),
    startRequest: controller.startRequest.bind(controller), cancel: controller.cancelRequest.bind(controller) }), notice => {
      if (notice.catalogRevision === observedRevision) return;
      observedRevision = notice.catalogRevision;
      for (const listener of changeListeners) { try { listener(notice.catalogRevision); } catch { /* A retired view cannot stop maintenance. */ } }
      void metadataBuild.notifyCatalogChange().catch(() => undefined);
    });
  const observeHost = async (snapshot: CoreControllerSnapshot) => {
    if (observedProcess !== snapshot.processId) { observedProcess = snapshot.processId; observedRevision = undefined; }
    await watcher.observe(snapshot.processId, controller.supports?.("catalog.awaitChanges") ?? false);
  };
  return {
    metadataBuild, thumbnailLeases, keywords,
    favoriteDirectories: favorites,
    async refreshStorage() {
      if (stopping || controller.snapshot().state !== "ready") return;
      if (catalogInitialization) await catalogInitialization.catch(() => undefined);
      if (stopping) return;
      catalogSessionInitialized = false;
      const catalog = await readInitializedCatalog();
      if (!stopping) lastCatalogStatus = classifyComputerSearchCatalog(catalog);
    },
    subscribeCatalogChanges(callback) {
      if (changeListeners.size >= 32) throw new Error("computer-search-too-many-observers");
      changeListeners.add(callback);
      if (observedRevision !== undefined) { try { callback(observedRevision); } catch { /* A view may already be closing. */ } }
      return () => { changeListeners.delete(callback); };
    },
    async status() {
      if (stopping) return recoverComputerSearchStatus(lastCatalogStatus);
      const snapshot = await controller.start();
      if (snapshot.state !== "ready") return controllerFailure(snapshot);
      if (stopping) return recoverComputerSearchStatus(lastCatalogStatus);
      try {
        await observeHost(snapshot);
        const next = classifyComputerSearchCatalog(await readInitializedCatalog());
        void metadataBuild.restore().catch(() => undefined);
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
      if (request.scopeKind !== undefined && ((request.scopeKind !== "direct-children" && request.scopeKind !== "directory-descendants") || request.scopePath === null))
        throw new Error("computer-search-invalid-request");
      if (request.randomSeed !== undefined && (!Number.isInteger(request.randomSeed) || request.randomSeed < 0 || request.randomSeed > 0xffffffff)) throw new Error("computer-search-invalid-request");
      await this.cancel(request.taskId);
      cancelledTasks.delete(request.taskId);
      runningTasks.add(request.taskId);
      try {
        const catalog = await readCatalog();
        if (controller.supports?.("search.manualKeywords")) await keywords.prepare(catalog.volumes.filter(volume => volume.queryable).map(volume => volume.volumeId).sort().join("|")).catch(() => {
          options.diagnostics?.log("warn", "catalog-keywords-import-unavailable", {});
        });
        if (cancelledTasks.has(request.taskId)) throw new Error("search-cancelled");
        if (request.randomSeed !== undefined && !controller.supports?.("search.random")) throw new Error("random-browse-unavailable");
        if (request.fileConditions?.excludedExtensions?.length && !controller.supports?.("search.excludeExtensions")) throw new Error("computer-search-filter-unavailable");
        const names = new Map(catalog.volumes.map((volume) => [volume.volumeId, volume.displayName]));
        let scope: Record<string, unknown> = { kind: "all-volumes" };
        let volumeIds: string[] = [];
        if (request.scopePath !== null) {
          const resolved = await controller.request<CoreResolvedScope>(
            "catalog.resolveScope", { path: request.scopePath }, 5_000
          );
          if (cancelledTasks.has(request.taskId)) throw new Error("search-cancelled");
          if (!resolved.resolved || !resolved.queryable || !resolved.volumeId) {
            throw new Error(resolved.state === "offline" ? "scope-offline"
              : ["building", "discovering"].includes(resolved.state ?? "") ? "scope-preparing" : "scope-not-indexed");
          }
          volumeIds = [resolved.volumeId];
          if (request.scopeKind === "direct-children" && !resolved.directoryFileReference)
            throw new Error("scope-not-indexed");
          scope = request.scopeKind === "direct-children"
            ? { kind: "direct-children", volumeId: resolved.volumeId, rootFileReference: resolved.directoryFileReference }
            : resolved.rootFileReference
            ? { kind: "directory-descendants", volumeId: resolved.volumeId,
              rootFileReference: resolved.rootFileReference }
            : { kind: "all-volumes" };
        }
        const pending = controller.startRequest<CoreSearchPage>("search.start", {
          query: request.query, pageSize: 100, ...(request.randomSeed !== undefined ? { randomSeed: request.randomSeed } : {}), sort: request.sort ?? "name-ascending", excludeHidden: request.excludeHidden ?? false, volumeIds, scope,
          ...(controller.supports?.("search.live") ? { continuation: "live" } : {}),
          entryType: request.scopeKind === "directory-descendants" || request.facts || request.fileConditions || (!request.query && !request.scopeKind) ? "file" : "any", textTarget: controller.supports?.("search.manualKeywords") ? "name-path-or-keywords" : "name-or-path",
          ...(request.facts ? { facts: toCoreSearchFacts(request.facts) } : {}),
          ...(request.fileConditions ? { fileConditions: readComputerSearchFileConditions(request.fileConditions) } : {})
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
      if (stopping) return stopping;
      stopping = (async () => {
        await watcher.stop();
        try { await metadataBuild.shutdown(); }
        finally {
        active.clear();
        cancelledTasks.clear();
        runningTasks.clear();
        for (const taskId of [...authorizationSessions.keys()]) releaseAuthorizationSession(taskId);
        await favorites?.waitForIdle();
        await controller.stop();
        catalogSessionInitialized = false;
        catalogInitialization = null;
        lastCatalogStatus = null;
        observedRevision = undefined; observedProcess = undefined;
        }
      })().finally(() => { stopping = undefined; });
      return stopping;
    }
  };
};
