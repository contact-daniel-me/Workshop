import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhotoCaptureInput } from "@/components/auth/PhotoCaptureInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Edit,
  Save,
  Key,
  Copy,
  Check,
  RefreshCw,
  FileDown,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Camera,
  Trash2,
} from "lucide-react";
import { adminUpdateParticipantDetails } from "@/lib/admin.functions";
import { downloadParticipantCredentialsPdf } from "@/lib/credential-pdf";
import { generateDefaultStudentPassword } from "@/lib/auth-helpers";
import { fileToBase64 } from "@/lib/image-validation";
import { normalizePhone, INDIAN_PHONE } from "@/lib/attendance";

export interface ParticipantEditableData {
  id: string;
  full_name: string;
  participant_code: string;
  email: string;
  phone: string;
  verification_status: string;
  remarks?: string | null;
  photo_url?: string | null;
}

interface EditParticipantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participant: ParticipantEditableData | null;
  onSuccess?: () => void;
}

export function EditParticipantDialog({
  open,
  onOpenChange,
  participant,
  onSuccess,
}: EditParticipantDialogProps) {
  // Form fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<"verified" | "pending" | "rejected">("verified");
  const [remarks, setRemarks] = useState("");

  // Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  // Password state: if empty, existing password is kept. If filled, updates to that password.
  const [customPassword, setCustomPassword] = useState("");

  // Submission & Post-save state
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedData, setSavedData] = useState<{
    id: string;
    fullName: string;
    participantCode: string;
    email: string;
    phone: string;
    verificationStatus: string;
    photoUrl: string | null;
    rawPassword?: string;
  } | null>(null);

  // Initialize form when participant changes
  useEffect(() => {
    if (participant) {
      setFullName(participant.full_name || "");
      setPhone(participant.phone || "");
      setEmail(participant.email || "");
      setVerificationStatus(
        (participant.verification_status as "verified" | "pending" | "rejected") || "verified"
      );
      setRemarks(participant.remarks || "");
      setPhotoFile(null);
      setPhotoPreview(participant.photo_url || null);
      setRemovePhoto(false);
      setCustomPassword("");
      setSavedData(null);
    }
  }, [participant, open]);

  // Dynamically generated default password based on current Name & Mobile
  const cleanPhone = normalizePhone(phone);
  const autoDefaultPassword = generateDefaultStudentPassword(fullName.trim() || "User", cleanPhone);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSavedData(null);
    }
    onOpenChange(isOpen);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participant) return;

    const cleanName = fullName.trim();
    if (!cleanName || cleanName.length < 2) {
      toast.error("Participant name must be at least 2 characters.");
      return;
    }

    if (cleanPhone && !INDIAN_PHONE.test(cleanPhone)) {
      toast.error("Please enter a valid 10-digit mobile number.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    const cleanPassword = customPassword.trim();
    if (cleanPassword && cleanPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    const passwordToSend = cleanPassword || undefined;

    setSaving(true);
    try {
      let photoBase64: string | undefined = undefined;
      if (photoFile) {
        photoBase64 = await fileToBase64(photoFile);
      }

      const res = await adminUpdateParticipantDetails({
        data: {
          targetUserId: participant.id,
          fullName: cleanName,
          phone: cleanPhone || undefined,
          email: cleanEmail || undefined,
          verificationStatus,
          remarks: remarks.trim() || undefined,
          newPassword: passwordToSend,
          photoBase64,
          removePhoto,
        },
      });

      if (!res.ok || !res.participant) {
        throw new Error("Failed to update participant.");
      }

      toast.success(`Participant ${res.participant.participantCode} updated successfully!`);

      // Set saved data to allow instant updated PDF download
      setSavedData({
        id: res.participant.id,
        fullName: res.participant.fullName,
        participantCode: res.participant.participantCode,
        email: res.participant.email,
        phone: res.participant.phone,
        verificationStatus: res.participant.verificationStatus,
        photoUrl: res.participant.photoUrl ?? photoPreview,
        rawPassword: passwordToSend,
      });

      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save participant updates.");
    } finally {
      setSaving(false);
    }
  };

  // Download Updated PDF Pass immediately
  const handleDownloadUpdatedPdf = async () => {
    const dataToPrint = savedData || {
      id: participant?.id || "",
      fullName: fullName.trim(),
      participantCode: participant?.participant_code || "SA-2026",
      email: email.trim(),
      phone: cleanPhone || phone,
      verificationStatus,
      photoUrl: photoPreview,
      rawPassword: customPassword.trim() || autoDefaultPassword,
    };

    setDownloadingPdf(true);
    try {
      await downloadParticipantCredentialsPdf({
        fullName: dataToPrint.fullName,
        participantCode: dataToPrint.participantCode,
        email: dataToPrint.email,
        phone: dataToPrint.phone,
        rawPassword: dataToPrint.rawPassword,
        verificationStatus: dataToPrint.verificationStatus,
        photoUrl: dataToPrint.photoUrl,
        portalUrl: typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth",
        workshopName: "Event Management Portal",
      });
      toast.success("Updated credentials PDF downloaded!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate updated PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleCopyCredentials = () => {
    const pCode = savedData?.participantCode || participant?.participant_code || "";
    const pName = savedData?.fullName || fullName;
    const pPhone = savedData?.phone || cleanPhone || phone;
    const pEmail = savedData?.email || email;
    const pStatus = savedData?.verificationStatus || verificationStatus;
    const pPassword = savedData?.rawPassword || customPassword.trim() || autoDefaultPassword;

    const text = [
      `Event Management Portal — Updated Account Credentials`,
      `Participant Name: ${pName}`,
      `Participant ID: ${pCode}`,
      `Mobile Number: ${pPhone}`,
      `Email Address: ${pEmail}`,
      `Default Password: ${pPassword}`,
      `Status: ${pStatus.toUpperCase()}`,
      `Login URL: ${window.location.origin}/auth`,
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Updated credentials copied to clipboard!");
    setTimeout(() => setCopied(false), 3000);
  };

  if (!participant) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {!savedData ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-primary">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Edit className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold font-display text-foreground flex items-center gap-2">
                    Edit Participant Details
                    <Badge variant="outline" className="font-mono text-xs">
                      {participant.participant_code}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Modify participant information, credentials, or photo. All changes automatically update in future PDF passes.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSave} className="space-y-4 pt-2">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Full Name</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ananya Sharma"
                  className="text-sm"
                />
              </div>

              {/* Mobile Number & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Mobile Number</Label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Email Address <span className="text-muted-foreground font-normal">(Optional)</span>
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. ananya@example.com"
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Verification Status */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Verification Status</Label>
                <Select
                  value={verificationStatus}
                  onValueChange={(val) => setVerificationStatus(val as "verified" | "pending" | "rejected")}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verified">Verified (Approved for Attendance)</SelectItem>
                    <SelectItem value="pending">Pending (Review Required)</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Profile Photograph Option */}
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Profile Photograph</Label>
                  {photoPreview && !removePhoto && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRemovePhoto(true);
                        setPhotoFile(null);
                        setPhotoPreview(null);
                      }}
                      className="h-6 text-xs text-destructive hover:text-destructive gap-1 px-2"
                    >
                      <Trash2 className="h-3 w-3" /> Remove Photo
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 rounded-xl border shadow-xs shrink-0">
                    <AvatarImage src={photoPreview || undefined} alt={fullName} className="object-cover" />
                    <AvatarFallback className="rounded-xl font-bold text-sm bg-muted">
                      {fullName.slice(0, 2).toUpperCase() || "PA"}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <PhotoCaptureInput
                      value={photoFile}
                      onChange={(f) => {
                        setPhotoFile(f);
                        setRemovePhoto(false);
                        if (f) {
                          setPhotoPreview(URL.createObjectURL(f));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Password Management */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                    <Key className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Participant Login Password</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomPassword(autoDefaultPassword)}
                      className="h-6 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 border-emerald-300 bg-white dark:bg-slate-900 cursor-pointer"
                    >
                      Use Formula ({autoDefaultPassword})
                    </Button>
                    {customPassword && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCustomPassword("")}
                        className="h-6 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Keep Existing
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Input
                    type="text"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder="Leave blank to keep existing password"
                    className="font-mono text-sm bg-card"
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span>
                      Formula: <strong>{autoDefaultPassword}</strong> (1st 4 letters of name + 1st 4 digits of mobile)
                    </span>
                    {customPassword ? (
                      <span className="text-emerald-600 font-semibold font-mono">
                        ✓ Password will update on Save
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Existing password preserved
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Administrative Remarks</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional notes or batch details"
                  rows={2}
                  className="text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="gap-2 font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Saving Changes…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          /* SUCCESS VIEW WITH INSTANT UPDATED PDF DOWNLOAD */
          <div className="space-y-4 py-2">
            <DialogHeader>
              <div className="flex items-center gap-2 text-emerald-600">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold font-display text-foreground">
                    Participant Updated Successfully!
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Changes have been saved to the database and will be reflected on all future PDF credential passes.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Profile Summary Card */}
            <div className="rounded-xl border bg-muted/30 p-3.5 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 rounded-xl border">
                  <AvatarImage src={savedData.photoUrl || undefined} alt={savedData.fullName} className="object-cover" />
                  <AvatarFallback className="rounded-xl font-bold bg-muted">
                    {savedData.fullName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-bold text-sm text-foreground">{savedData.fullName}</h4>
                  <p className="font-mono text-xs text-muted-foreground">{savedData.participantCode}</p>
                </div>
                <Badge className="ml-auto bg-emerald-600 text-white text-[10px]">
                  {savedData.verificationStatus.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-card p-2.5 rounded-lg border">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Mobile Login:</span>
                  <span className="font-mono font-medium">{savedData.phone || "None"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Email Address:</span>
                  <span className="font-medium truncate block">{savedData.email || "None"}</span>
                </div>
                <div className="col-span-2 pt-1 border-t">
                  <span className="text-muted-foreground block text-[10px]">Login Password:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-xs border border-emerald-200">
                      {savedData.rawPassword || autoDefaultPassword}
                    </code>
                    <Badge variant="outline" className="text-[10px] font-mono text-emerald-700 border-emerald-200">
                      {savedData.rawPassword ? "UPDATED" : "FORMULA DEFAULT"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadUpdatedPdf}
                disabled={downloadingPdf}
                className="w-full sm:w-auto gap-1.5 font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 cursor-pointer"
              >
                {downloadingPdf ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                ) : (
                  <FileDown className="h-4 w-4 text-emerald-600" />
                )}
                {downloadingPdf ? "Generating PDF…" : "Download Updated PDF Pass"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyCredentials}
                className="w-full sm:w-auto gap-1.5 font-semibold"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy Details"}
              </Button>
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="w-full sm:w-auto font-bold"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

