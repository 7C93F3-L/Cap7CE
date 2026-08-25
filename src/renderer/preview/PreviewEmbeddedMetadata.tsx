import type { PreviewEmbeddedMetadata as PreviewEmbeddedMetadataData, PreviewEmbeddedMetadataKind } from "../../shared/types";
import { t, type TranslationKey } from "../../../electron/localization";

interface PreviewEmbeddedMetadataProps {
  data: PreviewEmbeddedMetadataData;
  variant: "summary" | "details" | "sheet";
  expanded?: boolean;
}

const metadataKindLabels: Record<PreviewEmbeddedMetadataKind, TranslationKey> = {
  visual_content: "preview.metadata.visualContent",
  embedded_title: "preview.metadata.title",
  embedded_subject: "preview.metadata.subject",
  embedded_description: "preview.metadata.description",
  embedded_keywords: "preview.metadata.keywords",
  software_family: "preview.metadata.software",
  capture_device: "preview.metadata.device",
  media_title: "preview.metadata.mediaTitle",
  media_artist: "preview.metadata.artist",
  media_album: "preview.metadata.album",
  font_family: "preview.metadata.fontFamily",
  font_style: "preview.metadata.fontStyle"
};

const getMetadataRows = (data: PreviewEmbeddedMetadataData) => [
  ...data.items.map((item) => ({ label: t(metadataKindLabels[item.kind]), text: item.text })),
  ...(data.capturedAt ? [{ label: t("preview.metadata.capturedAt"), text: new Date(data.capturedAt).toLocaleString() }] : [])
];

const MetadataRows = ({ data }: { data: PreviewEmbeddedMetadataData }) => (
  <dl className="preview-embedded-metadata-list">
    {getMetadataRows(data).map((row, index) => (
      <div key={`${row.label}:${index}`}>
        <dt>{row.label}</dt>
        <dd>{row.text}</dd>
      </div>
    ))}
  </dl>
);

const PreviewEmbeddedMetadata = ({ data, variant, expanded = false }: PreviewEmbeddedMetadataProps) => {
  const rows = getMetadataRows(data);
  if (rows.length === 0) return null;

  if (variant === "summary") {
    return (
      <div className="preview-embedded-metadata-summary" title={rows.map((row) => `${row.label}: ${row.text}`).join(" · ")}>
        {rows.slice(0, 2).map((row) => `${row.label}: ${row.text}`).join(" · ")}
      </div>
    );
  }

  if (variant === "details") {
    return (
      <section className="preview-embedded-metadata-details" aria-label={t("preview.metadata.heading")}>
        <h2>{t("preview.metadata.heading")}</h2>
        <MetadataRows data={data} />
      </section>
    );
  }

  return (
    <section className={`preview-embedded-metadata-layer${expanded ? " is-expanded" : ""}`}>
      <div className="preview-embedded-metadata-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="preview-embedded-metadata-sheet-content">
          <h2>{t("preview.metadata.heading")}</h2>
          <MetadataRows data={data} />
        </div>
      </div>
    </section>
  );
};

export default PreviewEmbeddedMetadata;
