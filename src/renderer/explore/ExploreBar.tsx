import "./ExploreBar.css";

export type ExploreFacetOption = {
  id: string;
  label: string;
  count: number;
  color?: string;
  disabled?: boolean;
};

export type ExploreFacetGroup = {
  id: string;
  label: string;
  options: ExploreFacetOption[];
};

export type ExploreSelection = Record<string, string[]>;

type ExploreBarProps = {
  groups: ExploreFacetGroup[];
  selection: ExploreSelection;
  resultCount: number;
  randomEnabled: boolean;
  batchNumber: number;
  density?: "compact" | "roomy";
  state?: "ready" | "loading" | "empty";
  onToggleOption: (groupId: string, optionId: string) => void;
  onToggleRandom: () => void;
  onNextBatch: () => void;
  onClear: () => void;
  onCollapse: () => void;
};

const formatCount = (count: number) => new Intl.NumberFormat("zh-CN").format(count);

const ExploreBar = ({
  groups,
  selection,
  resultCount,
  randomEnabled,
  batchNumber,
  density = "compact",
  state = "ready",
  onToggleOption,
  onToggleRandom,
  onNextBatch,
  onClear,
  onCollapse
}: ExploreBarProps) => {
  const selectedCount = Object.values(selection).reduce((total, values) => total + values.length, 0);
  const hasActiveState = selectedCount > 0 || randomEnabled;
  const resultSummary = state === "loading"
    ? "正在统计当前范围…"
    : state === "empty"
      ? "没有符合当前条件的素材"
      : `当前条件下 ${formatCount(resultCount)} 项`;

  return (
    <section className={`cap-explore-bar is-${density}${state === "loading" ? " is-loading" : ""}`} aria-label="素材探索">
      <header className="cap-explore-header">
        <div className="cap-explore-heading">
          <span className="cap-explore-heading-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 2.8l1.35 5.1 4.75 2.75-4.75 2.75L12 18.5l-1.35-5.1-4.75-2.75 4.75-2.75L12 2.8Z" /><path d="m18.4 16.1.62 2.22 2.08 1.18-2.08 1.18-.62 2.22-.62-2.22-2.08-1.18 2.08-1.18.62-2.22Z" /></svg>
          </span>
          <span className="cap-explore-title-copy"><strong>素材探索</strong><small>{resultSummary}</small></span>
        </div>

        <div className="cap-explore-actions">
          <button className={`cap-explore-random${randomEnabled ? " is-active" : ""}`} type="button" role="switch" aria-checked={randomEnabled} onClick={onToggleRandom}>
            <span>随机浏览</span><i aria-hidden="true"><b /></i>
          </button>
          <button className="cap-explore-action-button cap-explore-next" type="button" disabled={!randomEnabled || state === "loading"} onClick={onNextBatch}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3.2c4.8 0 4.8 10 9.6 10H20m-3-3 3 3-3 3M4 17h3.2c1.55 0 2.6-1.04 3.5-2.35m2.6-5.3C14.2 8.04 15.25 7 16.8 7H20m-3-3 3 3-3 3" /></svg>
            <span>换一批</span>{randomEnabled && <small>{batchNumber}</small>}
          </button>
          <button className="cap-explore-action-button" type="button" disabled={!hasActiveState || state === "loading"} onClick={onClear}>清除</button>
          <button className="cap-explore-collapse" type="button" aria-label="收起素材探索" title="收起素材探索" onClick={onCollapse}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg>
          </button>
        </div>
      </header>

      <div className="cap-explore-facets" aria-busy={state === "loading"}>
        {groups.map((group) => (
          <section className="cap-explore-facet" key={group.id} aria-label={group.label}>
            <h3>{group.label}</h3>
            <div className="cap-explore-option-list">
              {group.options.map((option) => {
                const selected = selection[group.id]?.includes(option.id) ?? false;
                return (
                  <button
                    className={`cap-explore-option${selected ? " is-selected" : ""}${option.color ? " has-color" : ""}`}
                    type="button"
                    aria-pressed={selected}
                    disabled={option.disabled || state === "loading"}
                    key={option.id}
                    onClick={() => onToggleOption(group.id, option.id)}
                  >
                    {option.color && <i className="cap-explore-color" style={{ background: option.color }} aria-hidden="true" />}
                    <span>{option.label}</span><small>{state === "loading" ? "—" : formatCount(option.count)}</small>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
};

export default ExploreBar;
