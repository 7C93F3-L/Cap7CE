export interface CatalogHomeEntry {
  id: string;
  path: string;
  name: string;
  icon: string;
  kind: "folder" | "drive";
}
