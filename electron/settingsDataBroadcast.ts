type SettingsDataChannel = "preferences:changed" | "directories:changed";

interface SettingsDataBroadcastTargets {
  sendToMain: (channel: SettingsDataChannel, value: unknown) => void;
  sendToSettings: (channel: SettingsDataChannel, value: unknown) => void;
}

export const createSettingsDataBroadcaster = ({ sendToMain, sendToSettings }: SettingsDataBroadcastTargets) => (
  <T>(channel: SettingsDataChannel, value: T) => {
    sendToMain(channel, value);
    sendToSettings(channel, value);
    return value;
  }
);
