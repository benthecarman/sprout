/**
 * Modal confirmation for "Clear settings" in the Agent Provider panel.
 *
 * Uses Radix `AlertDialog` (via our shared wrapper) so we get focus
 * trapping, portal + overlay, outside-content `aria-hidden`, scroll lock,
 * and ESC-to-cancel for free. The destructive action requires explicit
 * intent — `AlertDialogCancel` (not Action) is the default-focused button.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";

export function ClearSettingsDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent data-testid="agent-provider-clear-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete saved agent provider settings?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The encrypted settings file will be removed. Sprout Agent will fall
            back to environment variables until you save again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button
              data-testid="agent-provider-clear-cancel"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              data-testid="agent-provider-clear-confirm"
              onClick={onConfirm}
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
