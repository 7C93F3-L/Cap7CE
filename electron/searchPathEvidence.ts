import path from "node:path";
import type { PersistedDirectory } from "./directoryStore";

export const SEARCH_PATH_EVIDENCE_VERSION = 1;

export const toSearchTerms = (query: string) => query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

export const normalizeSearchEvidence = (value: string) => value.toLocaleLowerCase();

export const escapeSqlLikeTerm = (term: string) => `%${term.replace(/([%_\\])/g, "\\$1")}%`;

export const getRelativeDirectoryEvidence = (rootPath: string, filePath: string): string | null => {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedFileDirectory = path.dirname(path.resolve(filePath));
  const relativeDirectory = path.relative(resolvedRoot, resolvedFileDirectory);
  if (relativeDirectory === "") return "";
  if (relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)) return null;
  return relativeDirectory.split(/[\\/]+/).filter(Boolean).join("/");
};

export const directoryMatchesSearchTerm = (directory: PersistedDirectory, term: string) => {
  const rootName = path.basename(path.resolve(directory.path)) || directory.path;
  return normalizeSearchEvidence(rootName).includes(term)
    || normalizeSearchEvidence(directory.name).includes(term);
};

export const getDirectoryTermMatches = (directories: PersistedDirectory[], terms: string[]) => (
  terms.map((term) => new Set(
    directories
      .filter((directory) => directoryMatchesSearchTerm(directory, term))
      .map((directory) => directory.id)
  ))
);

export interface SearchableFilePathEvidence {
  directory_id: string;
  directory_path: string;
  file_path: string;
  file_name: string;
  extension: string;
}

export const fileMatchesDeterministicSearchTerm = (
  file: SearchableFilePathEvidence,
  term: string,
  directoryTermMatches: Set<string> | undefined
) => {
  const fileName = normalizeSearchEvidence(file.file_name);
  const extension = normalizeSearchEvidence(file.extension);
  const relativeDirectory = normalizeSearchEvidence(
    getRelativeDirectoryEvidence(file.directory_path, file.file_path) ?? ""
  );
  return fileName.includes(term)
    || extension.includes(term)
    || relativeDirectory.includes(term)
    || directoryTermMatches?.has(file.directory_id) === true;
};

export const fileMatchesDeterministicSearchTerms = (
  file: SearchableFilePathEvidence,
  terms: string[],
  directoryTermMatches: Set<string>[]
) => {
  return terms.every((term, index) => fileMatchesDeterministicSearchTerm(
    file,
    term,
    directoryTermMatches[index]
  ));
};
