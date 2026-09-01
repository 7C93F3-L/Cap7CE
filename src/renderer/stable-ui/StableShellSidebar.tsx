import settingsIcon from "../assets/icons/icon-settings.svg";
import skimIcon from "../assets/icons/icon-skim.svg";

interface StableShellSidebarProps {
  skimOpen: boolean;
  onToggleSkim: () => void;
}

const skeletonRows = ["AI 增强", "排序", "搜索范围"];

const StableShellSidebar = ({ skimOpen, onToggleSkim }: StableShellSidebarProps) => (
  <aside className="cap-stable-sidebar">
    <div className="cap-stable-brand" aria-label="Cap7CE">Cap7CE</div>
    <div className="cap-stable-sidebar-controls" aria-hidden="true">
      {skeletonRows.map((label) => (
        <div className="cap-stable-sidebar-row" key={label}>
          <span className="cap-stable-sidebar-row-icon" />
          <span className="cap-stable-sidebar-row-copy"><strong>{label}</strong><small>功能待接入</small></span>
        </div>
      ))}
    </div>
    <section className="cap-stable-directory-skeleton" aria-hidden="true">
      <span className="cap-stable-sidebar-section-title">已添加目录</span>
      {Array.from({ length: 6 }, (_, index) => (
        <span className="cap-stable-directory-row" key={index}><i /><b /></span>
      ))}
    </section>
    <div className="cap-stable-sidebar-footer">
      <button className={skimOpen ? "is-active" : ""} type="button" title={skimOpen ? "隐藏 Skim 占位区" : "显示 Skim 占位区"}
        aria-label={skimOpen ? "隐藏 Skim 占位区" : "显示 Skim 占位区"} aria-pressed={skimOpen} onClick={onToggleSkim}>
        <img src={skimIcon} alt="" />
      </button>
      <span className="cap-stable-settings-placeholder" title="Settings 将在后续轮次接入" aria-hidden="true">
        <img src={settingsIcon} alt="" />
      </span>
    </div>
  </aside>
);

export default StableShellSidebar;
