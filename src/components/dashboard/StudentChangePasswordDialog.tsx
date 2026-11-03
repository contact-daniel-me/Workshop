import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAppPassword } from "@/lib/auth-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, KeyRound, Check, RefreshCw, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullName?: string;
  participantCode?: string;
}

export function StudentChangePasswordDialog({
  open,
  onOpenChange,
  fullName,
  participantCode,
}: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setSubmitting(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPwd = newPassword.trim();
    if (!cleanPwd || cleanPwd.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    if (cleanPwd !== confirmPassword.trim()) {
      toast.error("New passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const normalized = normalizeAppPassword(cleanPwd);
      const { error } = await supabase.auth.updateUser({
        password: normalized,
        data: {
          initial_password: cleanPwd,
          display_password: cleanPwd,
        },
      });

      if (error) {
        throw error;
      }

      toast.success("Password updated successfully! Use your new password on your next login.");
      handleOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <div className="p-2 rounded-lg bg-primary/10">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold font-display">
                Change Your Password
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Update your login password from the default format to your own private password.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {fullName && (
          <div className="rounded-lg border bg-muted/30 p-2.5 text-xs flex items-center justify-between">
            <span className="text-muted-foreground font-medium truncate">{fullName}</span>
            {participantCode && (
              <span className="font-mono font-bold text-primary">{participantCode}</span>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              New Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="pr-9 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Confirm New Password <span className="text-destructive">*</span>
            </Label>
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="font-mono text-sm"
            />
          </div>

          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Updating your password takes effect immediately. You can sign in using either your registered mobile number or email address with this new password.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="font-bold min-w-[140px] gap-2">
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Update Password
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
