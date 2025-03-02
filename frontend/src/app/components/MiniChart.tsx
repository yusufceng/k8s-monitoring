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
        <Tooltip contentStyle={{ fontSize: "10px" }} />
        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};
