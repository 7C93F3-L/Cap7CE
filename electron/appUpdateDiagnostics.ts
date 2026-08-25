import { promises as fs } from "node:fs";
import path from "node:path";

export const writeAppUpdateDiagnostic = async (userDataPath: string, details: string): Promise<void> => {
  const logDirectory = path.join(userDataPath, "logs");
  await fs.mkdir(logDirectory, { recursive: true });
  await fs.appendFile(path.join(logDirectory, "app-update.log"), `${details}\n`, "utf8");
};

