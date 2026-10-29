import { useState } from "react";
import { adminChangeParticipantPassword } from "@/lib/admin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Lock, Eye, EyeOff, KeyRound, Check, RefreshCw, AlertCircle, Copy, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participant: {
    id: string;
    full_name: string;
    participant_code: string;
  } | null;
  onSuccess?: () => void;
}

export function ChangeParticipantPasswordDialog({
  open,
  onOpenChange,
  participant,
  onSuccess,
}: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generatedTemp, setGeneratedTemp] = useState<string | null>(null);

  const generateStrongPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%^&*";
    let pwd = "";
    // Ensure at least one uppercase, lowercase, number, symbol
    pwd += "ABCDEFGHJKMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)];
    pwd += "abcdefghjkmnpqrstuvwxyz"[Math.floor(Math.random() * 24)];
    pwd += "23456789"[Math.floor(Math.random() * 8)];
    pwd += "!@#$%^&*"[Math.floor(Math.random() * 8)];
    for (let i = 0; i < 10; i++) {
      pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    // Shuffle
    pwd = pwd.split("").sort(() => 0.5 - Math.random()).join("");

    setNewPassword(pwd);
    setConfirmPassword(pwd);
    setGeneratedTemp(pwd);
    setShowPassword(true);
    void navigator.clipboard.writeText(pwd);
    toast.success("Strong temporary password generated and copied to clipboard!");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participant) return;

    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await adminChangeParticipantPassword({
        data: {
          targetUserId: participant.id,
          newPassword,
        },
      });

      toast.success(res.message);
      onOpenChange(false);
      setNewPassword("");
      setConfirmPassword("");
      setGeneratedTemp(null);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setBusy(false);
    }
  };

  if (!participant) return null;

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const lengthValid = newPassword.length >= 8;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg">Change Participant Password</DialogTitle>
              <DialogDescription className="text-xs">
                Admin-managed password reset for participant account.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Target Participant Info Card */}
        <div className="rounded-xl border bg-muted/30 p-3 flex items-center justify-between text-xs">
          <div>
            <p className="font-bold text-foreground">{participant.full_name}</p>
            <p className="text-muted-foreground font-mono text-[11px]">{participant.participant_code}</p>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            PARTICIPANT
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Quick Generate Temporary Password Action */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Quick Generator:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generateStrongPassword}
              className="h-7 text-xs gap-1.5 font-semibold text-primary"
            >
              <KeyRound className="h-3 w-3" /> Generate Temp Password
            </Button>
          </div>

          {generatedTemp && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-primary">Temporary Password:</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(generatedTemp);
                    toast.success("Copied to clipboard!");
                  }}
                  className="text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
              <p className="font-mono text-sm font-bold text-foreground bg-white/60 dark:bg-black/40 px-2 py-1 rounded">
                {generatedTemp}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Provide this password directly to the participant. No recovery email will be sent.
              </p>
            </div>
          )}

          {/* New Password Field */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>New Password</span>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
              >
                {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showPassword ? "Hide" : "Show"}
              </button>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter at least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="text-xs pr-10"
              />
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Confirm New Password</Label>
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="text-xs"
            />
          </div>

          {/* Password Validation Checklist */}
          <div className="space-y-1 text-[11px] bg-muted/20 p-2.5 rounded-lg border">
            <p className="font-semibold text-muted-foreground text-[10px] uppercase">Requirements:</p>
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${lengthValid ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              <span className={lengthValid ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                Minimum 8 characters
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${passwordsMatch ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              <span className={passwordsMatch ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                Passwords must match
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !lengthValid || !passwordsMatch}
              className="font-bold gap-2 bg-primary text-primary-foreground"
            >
              {busy ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Updating…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Update Password
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

