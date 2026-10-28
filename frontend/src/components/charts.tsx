import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { compactMoney, monthLabel } from "../utils/formatters";

export const CHART_COLORS = ["#285a85", "#5b8fc0", "#8fb6d9", "#183153", "#b9cfe4", "#6c8ca8", "#3e6e9e", "#a2c0dc"];

export const STATUS_COLORS: Record<string, string> = {
  submitted: "#8a97a7",
  under_verification: "#d19a2a",
  verified: "#2f9461",
  verification_failed: "#c0504d",
  release_pending: "#b5762a",
  released: "#1f7a53",
};

type Slice = { name: string; value: number };

export function DonutChart({ data, colors = CHART_COLORS, height = 280, centerLabel }: {
  data: Slice[];
  colors?: string[];
  height?: number;
  centerLabel?: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <ChartEmpty height={height} />;
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%"
            paddingAngle={2} stroke="#fff" strokeWidth={2}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip moneyMode={false} />} />
          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 14.5, color: "#4a5c73" }} />
          {centerLabel && (
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 28, fontWeight: 750, fill: "#16304e" }}>{total}</text>
          )}
          {centerLabel && (
            <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 14, fill: "#7d8b9b" }}>{centerLabel}</text>
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendAreaChart({ data, height = 280, valueMode = "count" }: {
  data: { label: string; value: number }[];
  height?: number;
  valueMode?: "count" | "money";
}) {
  if (!data.some(item => item.value > 0)) return <ChartEmpty height={height} />;
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: valueMode === "money" ? 4 : -18 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#285a85" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#285a85" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8edf2" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 14, fill: "#5f7086" }} tickLine={false} axisLine={{ stroke: "#e3e9f0" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 14, fill: "#5f7086" }} tickLine={false} axisLine={false}
            tickFormatter={(value: number) => (valueMode === "money" ? compactMoney(value) : String(value))} />
          <Tooltip content={<ChartTooltip moneyMode={valueMode === "money"} />} />
          <Area type="monotone" dataKey="value" name={valueMode === "money" ? "Deposit value" : "Registrations"}
            stroke="#285a85" strokeWidth={2} fill="url(#areaFill)" activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OutcomeTrendChart({ data, height = 280 }: {
  data: { label: string; verified: number; failed: number; pending: number }[];
  height?: number;
}) {
  const hasData = data.some(item => item.verified + item.failed + item.pending > 0);
  if (!hasData) return <ChartEmpty height={height} />;
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8edf2" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 14, fill: "#5f7086" }} tickLine={false} axisLine={{ stroke: "#e3e9f0" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 14, fill: "#5f7086" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip moneyMode={false} />} />
          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 14.5, color: "#4a5c73" }} />
          <Line type="monotone" dataKey="verified" stroke="#2f9461" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="failed" stroke="#c0504d" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pending" stroke="#d19a2a" strokeWidth={2} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalBarChart({ data, height = 260, moneyMode = true }: {
  data: { label: string; value: number }[];
  height?: number;
  moneyMode?: boolean;
}) {
  if (!data.length || !data.some(item => item.value > 0)) return <ChartEmpty height={height} />;
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8edf2" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 14, fill: "#5f7086" }} tickLine={false} axisLine={false}
            tickFormatter={(value: number) => (moneyMode ? compactMoney(value) : String(value))} />
          <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 14, fill: "#4a5c73" }} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip moneyMode={moneyMode} />} cursor={{ fill: "rgba(40,90,133,0.05)" }} />
          <Bar dataKey="value" name={moneyMode ? "Deposit value" : "Records"} fill="#285a85" radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartTooltip({ active, payload, label, moneyMode }: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  moneyMode: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label !== undefined && <div className="chart-tooltip-label">{typeof label === "string" && /^\d{4}-\d{2}$/.test(label) ? monthLabel(label) : label}</div>}
      {payload.map((entry, index) => (
        <div className="chart-tooltip-row" key={index}>
          <span className="chart-tooltip-dot" style={{ background: entry.color }} />
          <span>{entry.name}</span>
          <strong>{moneyMode ? compactMoney(entry.value) : Number(entry.value ?? 0).toLocaleString("en-IN")}</strong>
        </div>
      ))}
    </div>
  );
}

export function ChartEmpty({ height = 280 }: { height?: number }) {
  return (
    <div className="chart-empty" style={{ height }}>
      <p>No data for this period</p>
    </div>
  );
}

export function monthTick(label: string): string {
  return monthLabel(label);
}
