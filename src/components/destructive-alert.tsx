import { AlertTriangle, Trash2, LogOut } from "lucide-react";

type AlertSeverity = "warning" | "danger";

interface DestructiveAlertProps {
  severity?: AlertSeverity;
  title?: string;
  message: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const alertStyles: Record<AlertSeverity, { border: string; bg: string; text: string; icon: string }> = {
  warning: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
    icon: "text-amber-500",
  },
  danger: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    text: "text-red-700 dark:text-red-400",
    icon: "text-red-500",
  },
};

export function DestructiveAlert({
  severity = "warning",
  title,
  message,
  icon,
  children,
}: DestructiveAlertProps) {
  const styles = alertStyles[severity];
  const defaultIcon = severity === "danger" ? <Trash2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />;

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} p-3 space-y-2`}>
      <div className="flex items-start gap-2">
        <div className={`${styles.icon} mt-0.5 shrink-0`}>{icon || defaultIcon}</div>
        <div className={`text-sm ${styles.text}`}>
          {title && <p className="font-semibold">{title}</p>}
          <p>{message}</p>
        </div>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
