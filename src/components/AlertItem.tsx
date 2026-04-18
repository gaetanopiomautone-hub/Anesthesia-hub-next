interface AlertItemProps {
  title: string;
  description: string;
  severity: "amber" | "red" | "blue" | "green";
}

const severityStyles = {
  amber: "border-clinical-amber bg-clinical-amber/5",
  red: "border-clinical-red bg-clinical-red/5",
  blue: "border-clinical-blue bg-clinical-blue/5",
  green: "border-clinical-green bg-clinical-green/5",
};

const dotStyles = {
  amber: "bg-clinical-amber",
  red: "bg-clinical-red",
  blue: "bg-clinical-blue",
  green: "bg-clinical-green",
};

const AlertItem = ({ title, description, severity }: AlertItemProps) => {
  return (
    <div className={`flex items-start gap-3 p-3 border-l-2 ${severityStyles[severity]}`}>
      <div className="pt-1">
        <div className={`size-2 rounded-full ${dotStyles[severity]}`} />
      </div>
      <div>
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
};

export default AlertItem;
