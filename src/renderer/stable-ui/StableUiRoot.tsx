import { useEffect } from "react";
import { useAlwaysOnTopController } from "../controllers/useAlwaysOnTopController";
import StableSurface from "./StableSurface";
import StableTitlebar from "./StableTitlebar";
import "./StableUiFoundation.css";

const StableUiRoot = () => {
  const { isAlwaysOnTop, syncAlwaysOnTop, toggleAlwaysOnTop } = useAlwaysOnTopController();

  useEffect(() => {
    void syncAlwaysOnTop();
  }, [syncAlwaysOnTop]);

  return (
    <main className="cap-stable-ui">
      <StableTitlebar
        pinned={isAlwaysOnTop}
        onTogglePinned={() => { void toggleAlwaysOnTop("stable-ui"); }}
      />
      <div className="cap-stable-workspace">
        <StableSurface scrollable>
          <div className="cap-stable-foundation-card">
            <span className="cap-stable-section-label">Stable UI foundation</span>
            <strong>共用视觉基础</strong>
            <span>单一自由缩放窗口 · 连续响应式布局</span>
          </div>
          <div className="cap-stable-foundation-card" aria-hidden="true">
            <span className="cap-stable-section-label">Surface</span>
            <span>5px edge · 14px radius · shared scrollbar</span>
          </div>
        </StableSurface>
      </div>
    </main>
  );
};

export default StableUiRoot;
