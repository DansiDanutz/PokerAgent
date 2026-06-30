"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BarPoint {
  label: string;
  value: number; // major units
}

export function RakeBarChart({ data }: { data: BarPoint[] }) {
  const colors = ["#19c37d", "#2fd897", "#d4af37", "#e9c46a", "#19c37d", "#d4af37"];
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <XAxis dataKey="label" tick={{ fill: "#6e7f76", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#6e7f76", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              background: "#0e1813",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              color: "#f4f7f5",
              fontSize: 12,
            }}
            formatter={(v: number) => [`$${v.toLocaleString()}`, "Rake"]}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
