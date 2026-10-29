import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  UserPlus,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Upload,
  RefreshCw,
  Camera,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Clock,
  AlertCircle,
} from "lucide-react";
import { registerParticipantByAdmin } from "@/lib/admin.functions";
import { validateClientImageFile, fileToBase64, optimizeImageFile } from "@/lib/image-validation";
import { normalizePhone, INDIAN_PHONE } from "@/lib/attendance";

interface RegisterParticipantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  canApprove?: boolean;
}

/**
 * Generates a high-entropy, random temporary password containing
 * uppercase, lowercase, numbers, and special symbols.
 */
function generateSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  const array = new Uint32Array(14);
  crypto.getRandomValues(array);

  // Guarantee at least one from each character set
  const pwdChars = [
    upper[array[0] % upper.length],
    lower[array[1] % lower.length],
    digits[array[2] % digits.length],
    special[array[3] % special.length],
  ];

  for (let i = 4; i < 14; i++) {
    pwdChars.push(all[array[i] % all.length]);
  }

  // Shuffle using Fisher-Yates
  for (let i = pwdChars.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff) * (i + 1));
    [pwdChars[i], pwdChars[j]] = [pwdChars[j], pwdChars[i]];
  }

  return pwdChars.join("");
}

export function RegisterParticipantDialog({
  open,
  onOpenChange,
  onSuccess,
  canApprove = true,
}: RegisterParticipantDialogProps) {
  // Form fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isGeneratedPassword, setIsGeneratedPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"verified" | "pending">("verified");
  const [remarks, setRemarks] = useState("");

  // Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission & validation state
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Success view state (one-time credentials card)
  const [createdParticipant, setCreatedParticipant] = useState<{
    id: string;
    fullName: string;
    participantCode: string;
    phone: string;
    email: string;
    verificationStatus: string;
    photoUrl: string | null;
    rawPassword: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setFullName("");
    setPhone("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setIsGeneratedPassword(false);
    setShowPassword(false);
    setVerificationStatus(canApprove ? "verified" : "pending");
    setRemarks("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setErrors({});
    setSubmitting(false);
    setCreatedParticipant(null);
    setCopied(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const handleGeneratePassword = () => {
    const pwd = generateSecurePassword();
    setPassword(pwd);
    setConfirmPassword(pwd);
    setIsGeneratedPassword(true);
    setShowPassword(true);
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.password;
      delete copy.confirmPassword;
      return copy;
    });
    toast.success("Generated secure temporary password!");
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Auto-compress large phone photos to standard JPEG & validate magic bytes
      const optimized = await optimizeImageFile(file);
      await validateClientImageFile(optimized);
      setPhotoFile(optimized);
      const previewUrl = URL.createObjectURL(optimized);
      setPhotoPreview(previewUrl);
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy.photo;
        return copy;
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Invalid photograph selected.");
      setPhotoFile(null);
      setPhotoPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const cleanName = fullName.trim();
    const cleanPhone = normalizePhone(phone);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || cleanName.length < 2) {
      newErrors.fullName = "Full name is required (at least 2 characters).";
    }
    if (!cleanPhone || !INDIAN_PHONE.test(cleanPhone)) {
      newErrors.phone = "Enter a valid 10-digit Indian mobile number.";
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      newErrors.email = "Enter a valid email address.";
    }
    if (!password || password.length < 8) {
      newErrors.password = "Password must be at least 8 characters.";
    }
    if (!isGeneratedPassword && password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
    }
    if (!photoFile) {
      newErrors.photo = "A genuine profile photograph is required.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Please correct the errors in the form.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Convert photo to Base64
      const photoBase64 = await fileToBase64(photoFile!);

      // 2. Submit server-side creation
      const res = await registerParticipantByAdmin({
        data: {
          fullName: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          password,
          verificationStatus,
          photoBase64,
          remarks: remarks.trim() || undefined,
        },
      });

      if (!res.ok || !res.participant) {
        throw new Error("Failed to register participant.");
      }

      toast.success(`Participant ${res.participant.participantCode} registered successfully!`);

      // 3. Set created participant to show the credentials card
      setCreatedParticipant({
        ...res.participant,
        rawPassword: password,
      });

      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to register participant.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdParticipant) return;
    const text = [
      `Event Management Portal — Account Credentials`,
      `Participant Name: ${createdParticipant.fullName}`,
      `Participant ID: ${createdParticipant.participantCode}`,
      `Mobile Number: ${createdParticipant.phone}`,
      `Email Address: ${createdParticipant.email}`,
      `Temporary Password: ${createdParticipant.rawPassword}`,
      `Status: ${createdParticipant.verificationStatus.toUpperCase()}`,
      `Login URL: ${window.location.origin}/`,
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Credentials copied to clipboard!");
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {!createdParticipant ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-primary">
                <div className="p-2 rounded-lg bg-primary/10">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold font-display text-foreground">
                    Register New Participant
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Create a verified participant profile with a mandatory photograph and login credentials.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              {/* Participant ID Notice */}
              <div className="rounded-lg border bg-muted/30 px-3.5 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground font-medium">Participant ID:</span>
                </div>
                <Badge variant="outline" className="font-mono font-bold text-xs bg-card">
                  Auto-Generated (e.g. SA-2026-XXXX)
                </Badge>
              </div>

              {/* Personal Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="e.g. Ananya Sharma"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className={errors.fullName ? "border-destructive text-sm" : "text-sm"}
                  />
                  {errors.fullName && <p className="text-[11px] text-destructive">{errors.fullName}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Mobile Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className={errors.phone ? "border-destructive font-mono text-sm" : "font-mono text-sm"}
                  />
                  {errors.phone && <p className="text-[11px] text-destructive">{errors.phone}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="email"
                    placeholder="e.g. ananya@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={errors.email ? "border-destructive text-sm" : "text-sm"}
                  />
                  {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
                </div>
              </div>

              {/* Password Section */}
              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-primary" />
                    Account Password <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGeneratePassword}
                    className="h-7 text-xs gap-1 font-semibold text-primary border-primary/30 hover:bg-primary/10"
                  >
                    <Sparkles className="h-3 w-3" />
                    Generate Temporary Password
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Choose or generate password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setIsGeneratedPassword(false);
                        }}
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
                    {errors.password && <p className="text-[11px] text-destructive">{errors.password}</p>}
                  </div>

                  {!isGeneratedPassword ? (
                    <div className="space-y-1.5">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="font-mono text-sm"
                      />
                      {errors.confirmPassword && (
                        <p className="text-[11px] text-destructive">{errors.confirmPassword}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>Temporary password generated.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Profile Photograph Section */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>
                    Profile Photograph (Front-facing) <span className="text-destructive">*</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    Max 5 MB • JPEG, PNG, or WebP
                  </span>
                </Label>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />

                {!photoPreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      errors.photo
                        ? "border-destructive bg-destructive/5 hover:bg-destructive/10"
                        : "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5"
                    }`}
                  >
                    <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Click to upload participant photograph</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Genuine portrait/selfie for attendance identity verification
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 rounded-xl border bg-card p-3.5">
                    <Avatar className="h-16 w-16 border-2 border-primary/20 shrink-0">
                      <AvatarImage src={photoPreview} alt="Preview" className="object-cover" />
                      <AvatarFallback>PIC</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {photoFile?.name ?? "photograph.jpg"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {photoFile ? `${(photoFile.size / 1024).toFixed(1)} KB` : ""} • Validated genuine image
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="h-7 text-xs gap-1"
                        >
                          <RefreshCw className="h-3 w-3" /> Replace Photo
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPhotoFile(null);
                            setPhotoPreview(null);
                          }}
                          className="h-7 text-xs text-destructive hover:text-destructive"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {errors.photo && <p className="text-[11px] text-destructive">{errors.photo}</p>}
              </div>

              {/* Registration Status & Remarks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Initial Status</Label>
                  <Select
                    value={verificationStatus}
                    onValueChange={(val: "verified" | "pending") => setVerificationStatus(val)}
                  >
                    <SelectTrigger className="text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verified">
                        <span className="flex items-center gap-1.5 text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          Approved (Verified)
                        </span>
                      </SelectItem>
                      <SelectItem value="pending">
                        <span className="flex items-center gap-1.5 text-amber-700">
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          Pending Review
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Administrative Remarks (Optional)</Label>
                  <Input
                    placeholder="e.g. Registered in-person at desk"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="text-xs"
                  />
                </div>
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
                <Button type="submit" disabled={submitting} className="gap-2 font-bold min-w-[160px]">
                  {submitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Registering…
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Register Participant
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          /* ONE-TIME CREDENTIALS & SUCCESS CARD */
          <div className="space-y-5 py-2">
            <div className="text-center space-y-1.5">
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <DialogTitle className="text-xl font-bold font-display text-foreground">
                Participant Registered Successfully!
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Account created and photograph verified in private storage.
              </DialogDescription>
            </div>

            {/* Profile Summary Card */}
            <div className="rounded-xl border bg-card p-4 space-y-3.5 shadow-sm">
              <div className="flex items-center gap-3 border-b pb-3.5">
                <Avatar className="h-14 w-14 border-2 border-primary/20">
                  <AvatarImage src={createdParticipant.photoUrl ?? undefined} />
                  <AvatarFallback className="font-bold text-sm bg-primary/10 text-primary">
                    {createdParticipant.fullName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-foreground truncate">
                      {createdParticipant.fullName}
                    </h3>
                    <Badge
                      className={
                        createdParticipant.verificationStatus === "verified"
                          ? "bg-emerald-600 text-white text-[10px]"
                          : "bg-amber-600 text-white text-[10px]"
                      }
                    >
                      {createdParticipant.verificationStatus === "verified" ? "APPROVED" : "PENDING"}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs font-semibold text-primary mt-0.5">
                    {createdParticipant.participantCode}
                  </p>
                </div>
              </div>

              {/* Login Credentials Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Mobile Login
                  </span>
                  <p className="font-mono font-medium text-foreground mt-0.5">
                    {createdParticipant.phone}
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Email Login
                  </span>
                  <p className="font-medium text-foreground mt-0.5 truncate">
                    {createdParticipant.email}
                  </p>
                </div>

                <div className="sm:col-span-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-primary uppercase font-bold tracking-wider">
                      Temporary Password
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-card font-mono">
                      One-Time Display
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-sm font-bold text-foreground tracking-wide select-all">
                      {createdParticipant.rawPassword}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(createdParticipant.rawPassword);
                        toast.success("Password copied!");
                      }}
                      className="h-7 text-xs gap-1 text-primary hover:text-primary"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                  </div>
                </div>
              </div>

              {/* Security Warning Notice */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 flex items-start gap-2 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  For security reasons, this temporary password is not stored in plaintext and will not be displayed again. Communicate it to the participant via SMS, email, or in person.
                </p>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyCredentials}
                className="w-full sm:w-auto gap-1.5 font-semibold"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied All Credentials!" : "Copy Full Credentials"}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  resetForm();
                  onOpenChange(false);
                }}
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

