import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../../../electron/localization";
import iconSignatureCap7CESvg from "../assets/icons/icon-signature-cap7ce.svg?raw";
import SvgIcon from "../components/SvgIcon";

export const SettingsFooter = () => {
  const [originImageUrl, setOriginImageUrl] = useState<string | null>(null);
  const [originVisible, setOriginVisible] = useState(false);
  const originSequenceRef = useRef({ count: 0, lastClickAt: 0 });
  const originLoadingRef = useRef(false);

  useEffect(() => {
    if (!originVisible) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOriginVisible(false);
    };

    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [originVisible]);

  useEffect(() => () => {
    if (originImageUrl) {
      URL.revokeObjectURL(originImageUrl);
    }
  }, [originImageUrl]);

  const revealOrigin = async () => {
    if (originImageUrl) {
      setOriginVisible(true);
      return;
    }
    if (originLoadingRef.current) return;

    originLoadingRef.current = true;
    try {
      const encodedPayload = (await import("../assets/archive/phase7.dat?raw")).default.trim();
      const payloadText = window.atob(encodedPayload);
      const payload = new Uint8Array(payloadText.length);
      for (let index = 0; index < payloadText.length; index += 1) {
        payload[index] = payloadText.charCodeAt(index);
      }
      if (payload.byteLength <= 28) {
        throw new Error("Origin fragment is incomplete.");
      }

      const keyBytes = new Uint8Array([
        0x8f, 0x3a, 0x1c, 0x7d, 0x5e, 0x29, 0xb6, 0x40,
        0xd2, 0xa4, 0x7f, 0x11, 0x9b, 0xc8, 0x65, 0x30,
        0xe7, 0x1d, 0x4a, 0x9f, 0x26, 0x0b, 0x5c, 0x83,
        0xf8, 0xd1, 0x42, 0x6e, 0xa9, 0x50, 0x3b, 0x7c
      ]);
      const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: payload.slice(0, 12) },
        key,
        payload.slice(12)
      );
      const nextImageUrl = URL.createObjectURL(new Blob([decrypted], { type: "image/png" }));
      setOriginImageUrl(nextImageUrl);
      setOriginVisible(true);
    } catch {
      originSequenceRef.current = { count: 0, lastClickAt: 0 };
    } finally {
      originLoadingRef.current = false;
    }
  };

  const handleEchoClick = () => {
    const now = performance.now();
    const sequence = originSequenceRef.current;
    const count = now - sequence.lastClickAt <= 850 ? sequence.count + 1 : 1;
    originSequenceRef.current = { count, lastClickAt: now };
    if (count < 7) return;

    originSequenceRef.current = { count: 0, lastClickAt: 0 };
    void revealOrigin();
  };

  return (
    <>
      <div className="cap7ce-signature" aria-label="Cap7CE">
        <SvgIcon svg={iconSignatureCap7CESvg} className="cap-svg-icon cap-signature-svg-icon" />
        <small>
          <button
            className="cap7ce-release-link"
            type="button"
            title={t("settings.openReleasesHint")}
            aria-label={t("settings.openReleasesHint")}
            onClick={() => void window.cap7ce?.app.openReleasePage()}
          >
            0.9.8
          </button>
          {" · 7C93F3-L & "}
          <button
            className="cap7ce-echo-trigger"
            type="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              handleEchoClick();
            }}
          >
            Echo
          </button>
        </small>
      </div>
      {originVisible && originImageUrl && createPortal(
        <div
          className="cap7ce-origin-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Cap7CE origin"
          onClick={() => setOriginVisible(false)}
        >
          <figure className="cap7ce-origin-card">
            <img src={originImageUrl} alt="" />
            <figcaption>
              <span>一切始于一只找不到的狗。</span>
              <small>It began with a dog that could not be found.</small>
            </figcaption>
          </figure>
        </div>,
        document.body
      )}
    </>
  );
};
