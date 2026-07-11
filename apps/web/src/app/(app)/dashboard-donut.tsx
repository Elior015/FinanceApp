"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#171717", "#525252", "#737373", "#a3a3a3", "#d4d4d4", "#404040", "#8a8a8a", "#c2c2c2"];

export interface DonutSlice {
  name: string;
  value: number;
}

export function SpendingDonut({ data }: { data: DonutSlice[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No categorized spending yet this month.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => new Intl.NumberFormat("en-IL", { style: "currency", currency: "ILS" }).format(Number(value ?? 0))}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
