import StablePlaceholderGrid from "./StablePlaceholderGrid";

const StableSkimSlot = () => (
  <aside className="cap-stable-skim-slot" aria-label="Skim 布局占位区">
    <div className="cap-stable-skim-toolbar" aria-hidden="true">
      <span className="cap-stable-skim-back">‹</span>
      <span className="cap-stable-skim-address">Skim</span>
      <span className="cap-stable-skim-action" />
      <span className="cap-stable-skim-action" />
    </div>
    <StablePlaceholderGrid kind="skim" count={16} />
  </aside>
);

export default StableSkimSlot;
