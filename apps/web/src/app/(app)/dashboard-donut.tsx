"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "oklch(0.6 0.2 210)",
  "oklch(0.65 0.18 300)",
  "oklch(0.55 0.15 180)",
];

export interface DonutSlice {
  name: string;
  value: number;
}

export function SpendingDonut({ data }: { data: DonutSlice[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <div className="size-16 rounded-full border-4 border-dashed border-muted" />
        <span>No categorized spending yet this month.</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={70}
          outerRadius={105}
          paddingAngle={3}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) =>
            new Intl.NumberFormat("en-IL", { style: "currency", currency: "ILS" }).format(Number(value ?? 0))
          }
          contentStyle={{
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--card-foreground)",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
