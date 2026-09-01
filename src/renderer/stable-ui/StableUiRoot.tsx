import { useEffect } from "react";
import { useAlwaysOnTopController } from "../controllers/useAlwaysOnTopController";
import StableMainShell from "./StableMainShell";
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
      <StableMainShell />
    </main>
  );
};

export default StableUiRoot;
