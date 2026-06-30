"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SeriesPoint {
  label: string;
  value: number; // in major units
}

export function BankrollChart({ data }: { data: SeriesPoint[] }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="emeraldFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#19c37d" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#19c37d" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: "#6e7f76", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6e7f76", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "#0e1813",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              color: "#f4f7f5",
              fontSize: 12,
            }}
            formatter={(v: number) => [`$${v.toLocaleString()}`, "Bankroll"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#2fd897"
            strokeWidth={2}
            fill="url(#emeraldFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
