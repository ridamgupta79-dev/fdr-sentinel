import { statusClass } from "../utils/formatters";

export default function StatusBadge({ value }: { value?: string | null }) {
  return <span className={`status-badge ${statusClass(value)}`}>
    <span className="status-mini-dot" />
    {(value || "Unknown").replaceAll("_", " ")}
  </span>;
}
