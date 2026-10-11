export interface SettingsWindowApi {
  open: () => Promise<boolean>;
  openMetadataBuild: () => Promise<boolean>;
  onMetadataBuildRequested: (callback: () => void) => () => void;
}
