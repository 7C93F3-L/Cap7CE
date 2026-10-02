import path from "node:path";

export interface ApplicationDataPathEnvironment {
  applicationName: string;
  localAppDataPath: string | undefined;
  fallbackAppDataPath: string;
}

export interface ApplicationDataPaths {
  productRoot: string;
  userDataRoot: string;
}

const normalizeRoot = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : null;
};

export const resolveApplicationDataPaths = ({
  applicationName,
  localAppDataPath,
  fallbackAppDataPath
}: ApplicationDataPathEnvironment): ApplicationDataPaths => {
  const baseRoot = normalizeRoot(localAppDataPath) ?? path.resolve(fallbackAppDataPath);
  const productRoot = path.join(baseRoot, applicationName);
  return {
    productRoot,
    userDataRoot: path.join(productRoot, "UserData")
  };
};
