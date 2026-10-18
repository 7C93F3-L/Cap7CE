export interface SettingsWindowApi {
  open: () => Promise<boolean>;
  openMetadataBuild: () => Promise<boolean>;
  consumeMetadataBuildRequest: () => Promise<boolean>;
  onMetadataBuildRequested: (callback: () => void) => () => void;
}
