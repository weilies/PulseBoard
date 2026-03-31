import { Button } from "@/components/ui/button";
import { DestructiveAlert } from "./destructive-alert";

interface ConfirmActionDialogProps {
  isOpen: boolean;
  severity?: "warning" | "danger";
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "destructive" | "default";
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmActionDialog({
  isOpen,
  severity = "warning",
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "destructive",
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmActionDialogProps) {
  if (!isOpen) return null;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <div className="space-y-3">
      <DestructiveAlert severity={severity} title={title} message={message}>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            size="sm"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmLabel}
          </Button>
        </div>
      </DestructiveAlert>
    </div>
  );
}
