import { t } from "../../../electron/localization";

const cards = [
  { title: "stableSettings.metadataBuild", description: "stableSettings.desc.metadataBuild" }
] as const;

export default function SettingsIndexSection({ query, onManage }: { query: string; onManage: () => void }) {
  const normalized = query.trim().toLocaleLowerCase();
  return <section className="cap-stable-settings-section">
    <h2>{t("stableSettings.section.index")}</h2>
    <div className="cap-stable-settings-section-cards">{cards.filter(card => !normalized ||
      [t(card.title), t(card.description)].some(text => text.toLocaleLowerCase().includes(normalized))).map(({ title, description }) =>
      <div className="cap-stable-settings-card" key={title}>
        <div className="cap-stable-settings-copy"><h3>{t(title)}</h3><p>{t(description)}</p></div>
        <div className="cap-stable-settings-control"><button className="cap-stable-settings-button" type="button" onClick={onManage}>{t("stableSettings.manageMetadataBuild")}</button></div>
      </div>)}</div>
  </section>;
}
