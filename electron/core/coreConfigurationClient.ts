import { coreNativeExecutable, requestCoreNative, type CoreNativeOptions } from "./coreNativeRequest";
export type CoreConfigurationOptions = CoreNativeOptions;
export async function requestCoreConfiguration(filePath: string, request: Record<string, string>, options: CoreConfigurationOptions = {}): Promise<unknown> {
  const executable = coreNativeExecutable(options, "core-configuration/v1", "configuration-host", "Cap7CE.Core.Configuration.Host.exe");
  const response = await requestCoreNative(executable, ["--favorites-file", filePath], request, "favorite-directories") as { ok?: unknown; error?: unknown; directories?: unknown } | null;
  if (response?.ok !== true) throw new Error(typeof response?.error === "string" && /^favorite-director(?:y|ies)-[a-z-]+$/.test(response.error)
    ? response.error : "favorite-directories-host-invalid-response");
  return response.directories;
}
