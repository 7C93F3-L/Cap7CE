import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FontPreviewData, PreviewWindowData } from "../shared/types";
import { t } from "../../electron/localization";

interface FontPreviewPanelProps {
  data: PreviewWindowData & { fontPreview: FontPreviewData };
  onError: () => void;
}

const fontFaceLoadTimeoutMs = 10_000;

const FontPreviewPanel = ({ data, onError }: FontPreviewPanelProps) => {
  const [loadedAlias, setLoadedAlias] = useState("");
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fontAlias = useMemo(
    () => `Cap7CEFontPreview_${data.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    [data.sessionId]
  );

  useEffect(() => {
    setLoadedAlias("");
    const controller = new AbortController();
    let cancelled = false;
    let failed = false;
    let loadedFace: FontFace | null = null;
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      onErrorRef.current();
    };
    const timeout = window.setTimeout(() => {
      controller.abort();
      fail();
    }, fontFaceLoadTimeoutMs);
    const load = async () => {
      try {
        const url = `cap7cefont://preview?path=${encodeURIComponent(data.filePath)}&session=${encodeURIComponent(data.sessionId)}`;
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Font preview data is unavailable.");
        const buffer = await response.arrayBuffer();
        const style = data.fontPreview.styleName.toLowerCase().includes("italic") ? "italic" : "normal";
        const face = new FontFace(fontAlias, buffer, {
          style,
          weight: String(data.fontPreview.weight)
        });
        await face.load();
        if (cancelled || failed) return;
        document.fonts.add(face);
        loadedFace = face;
        window.clearTimeout(timeout);
        setLoadedAlias(fontAlias);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) fail();
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
      if (loadedFace) document.fonts.delete(loadedFace);
    };
  }, [data.filePath, data.fontPreview.styleName, data.fontPreview.weight, data.sessionId, fontAlias]);

  const sampleStyle = loadedAlias ? {
    fontFamily: `"${loadedAlias}"`,
    fontStyle: data.fontPreview.styleName.toLowerCase().includes("italic") ? "italic" : "normal",
    fontWeight: data.fontPreview.weight
  } as CSSProperties : undefined;
  const axes = data.fontPreview.variationAxes
    .map((axis) => `${axis.tag} ${axis.minimum}–${axis.maximum}`)
    .join(" · ");

  return (
    <section className="preview-font-panel">
      <header>
        <div>
          <strong>{data.fontPreview.familyName}</strong>
          <span>{data.fontPreview.styleName}</span>
        </div>
        <span>{t("preview.fontGlyphCount", { count: data.fontPreview.glyphCount })}</span>
      </header>
      {axes && <p className="preview-font-axes">{t("preview.fontVariableAxes")}: {axes}</p>}
      <div className="preview-font-samples">
        {!loadedAlias ? (
          <p className="preview-font-loading">{t("preview.fontLoading")}</p>
        ) : <>
          <div className="preview-font-sample">
            <span>{t("preview.fontEnglishSample")}</span>
            {data.fontPreview.supportsLatinSample
              ? <p className="preview-font-latin-sample" style={sampleStyle}>
                  <span>ABCDEFGHIJKLMNOPQRSTUVWXYZ</span>
                  <span>abcdefghijklmnopqrstuvwxyz</span>
                  <span>0123456789</span>
                </p>
              : <p className="preview-font-unsupported">{t("preview.fontNoLatin")}</p>}
          </div>
          <div className="preview-font-sample">
            <span>{t("preview.fontChineseSample")}</span>
            {data.fontPreview.supportsChineseSample
              ? <p className="preview-font-chinese-sample" style={sampleStyle}>物无非彼物无非是自彼则不见自之则知之</p>
              : <p className="preview-font-unsupported">{t("preview.fontNoChinese")}</p>}
          </div>
        </>}
      </div>
    </section>
  );
};

export default FontPreviewPanel;
