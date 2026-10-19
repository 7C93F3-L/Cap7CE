import "./GradientProgress.css";

export default function GradientProgress({ label, value }: { label: string; value?: number | null }) {
  const fraction = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
  return <progress className="cap-gradient-progress" aria-label={label} max={1} value={fraction} />;
}
