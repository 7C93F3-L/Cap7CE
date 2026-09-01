interface StablePlaceholderGridProps {
  count: number;
  kind: "results" | "skim";
}

const StablePlaceholderGrid = ({ count, kind }: StablePlaceholderGridProps) => (
  <div className={`cap-stable-placeholder-grid cap-stable-${kind}-grid`} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => (
      <span className="cap-stable-placeholder-tile" key={index} />
    ))}
  </div>
);

export default StablePlaceholderGrid;
