import type { ReactNode } from "react";

export default function MetricCard({
  title, value, note, icon, tone = "neutral", onClick, compact,
}: {
  title: string;
  value: string;
  note?: string;
  icon?: ReactNode;
  tone?: "good" | "bad" | "pending" | "neutral";
  onClick?: () => void;
  compact?: boolean;
}) {
  const classes = ["metric-card", onClick ? "metric-clickable" : "", compact ? "metric-compact" : "",
    tone !== "neutral" ? `metric-tone-${tone}` : ""].filter(Boolean).join(" ");

  const content = (
    <>
      <div className="metric-top">
        <span>{title}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <div className="metric-value">{value}</div>
      {note && <p>{note}</p>}
    </>
  );

  if (onClick) {
    return <button type="button" className={classes} onClick={onClick}>{content}</button>;
  }
  return <section className={classes}>{content}</section>;
}
