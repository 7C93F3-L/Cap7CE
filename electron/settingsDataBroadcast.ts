type SettingsDataChannel = "preferences:changed" | "directories:changed";

interface SettingsDataBroadcastTargets {
  sendToMain: (channel: SettingsDataChannel, value: unknown) => void; sendToSettings: (channel: SettingsDataChannel, value: unknown) => void; sendToPreview: (channel: SettingsDataChannel, value: unknown) => void;
}

export const createSettingsDataBroadcaster = ({ sendToMain, sendToSettings, sendToPreview }: SettingsDataBroadcastTargets) => (
  <T>(channel: SettingsDataChannel, value: T) => {
    sendToMain(channel, value);
    sendToSettings(channel, value);
    sendToPreview(channel, value);
    return value;
  }
);
