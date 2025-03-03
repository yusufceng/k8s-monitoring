"use client";

import React from "react";
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from "recharts";

export type MiniChartData = {
  time: string; // Örneğin ISO formatında tarih
  value: number;
};

type MiniChartProps = {
  data: MiniChartData[];
};

export const MiniChart: React.FC<MiniChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey="time" hide />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'var(--tooltip-bg, #fff)',
            border: '1px solid var(--tooltip-border, #ccc)',
            borderRadius: '4px',
            color: 'var(--tooltip-text, #1e293b)',
            fontSize: "10px"
          }} 
          itemStyle={{
            color: 'var(--tooltip-text, #1e293b)'
          }}
          cursor={{ stroke: 'var(--tooltip-cursor, #94a3b8)' }}
        />
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke="var(--chart-line, #3b82f6)" 
          strokeWidth={2} 
          dot={false} 
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
