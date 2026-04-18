interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  trendPositive?: boolean;
}

const StatCard = ({ label, value, subtitle, trend, trendPositive }: StatCardProps) => {
  return (
    <div className="clinical-card p-5">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">
        {label}
      </p>
      <p className="text-2xl font-mono font-bold text-foreground tabular-nums">{value}</p>
      {subtitle && (
        <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>
      )}
      {trend && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`text-[10px] font-mono uppercase tracking-widest ${
              trendPositive ? "text-clinical-green" : "text-clinical-red"
            }`}
          >
            {trend}
          </span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
