import { t } from "../../../electron/localization";
import { EmbeddedMetadataSettingsRow } from "../settings/EmbeddedMetadataSettingsRow";
import SettingsMetadataBuildControl from "./SettingsMetadataBuildControl";

const cards = [
  { title: "stableSettings.metadataBuild", description: "stableSettings.desc.metadataBuild", Control: SettingsMetadataBuildControl },
  { title: "settings.embeddedMetadata", description: "stableSettings.desc.metadata", Control: () => <EmbeddedMetadataSettingsRow stableUi /> }
] as const;

export default function SettingsIndexSection({ query }: { query: string }) {
  const normalized = query.trim().toLocaleLowerCase();
  return <section className="cap-stable-settings-section">
    <h2>{t("stableSettings.section.index")}</h2>
    <div className="cap-stable-settings-section-cards">{cards.filter(card => !normalized ||
      [t(card.title), t(card.description)].some(text => text.toLocaleLowerCase().includes(normalized))).map(({ title, description, Control }) =>
      <div className="cap-stable-settings-card" key={title}>
        <div className="cap-stable-settings-copy"><h3>{t(title)}</h3><p>{t(description)}</p></div>
        <div className="cap-stable-settings-control"><Control /></div>
      </div>)}</div>
  </section>;
}
