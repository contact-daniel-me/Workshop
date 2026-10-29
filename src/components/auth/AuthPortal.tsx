import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appUniversalSignIn, normalizeAppPassword, phoneToAuthEmail } from "@/lib/auth-helpers";
import { lookupProfileByPhone, uploadRegistrationPhoto, type LookupProfileResult } from "@/lib/lookup.functions";
import { INDIAN_PHONE, normalizePhone } from "@/lib/attendance";
import { signedUrls } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CheckCircle2,
  Clock,
  Search,
  AlertCircle,
  ArrowRight,
  User,
  Phone,
  Mail,
  Lock,
  Camera,
  RefreshCw,
} from "lucide-react";
import { PhotoCaptureInput } from "./PhotoCaptureInput";
import { validateClientImageFile, fileToBase64, optimizeImageFile } from "@/lib/image-validation";

export type AuthMode = "login" | "register" | "lookup" | "forgot";

interface AuthPortalProps {
  initialMode?: AuthMode;
  redirectTo?: string;
  className?: string;
}

export function AuthPortal({ initialMode = "login", redirectTo, className = "" }: AuthPortalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [prefilledIdentifier, setPrefilledIdentifier] = useState<string>("");

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  return (
    <div className={`w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl sm:p-8 ${className}`}>
      {/* Navigation tabs: Sign In | Register | View Details */}
      <div className="flex rounded-xl border bg-muted/60 p-1 text-xs font-semibold mb-6">
        <button
          type="button"
          className={`flex-1 py-2 text-center rounded-lg transition-all ${
            mode === "login"
              ? "bg-card text-foreground shadow-sm font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("login")}
        >
          Sign In
        </button>
        <button
          type="button"
          className={`flex-1 py-2 text-center rounded-lg transition-all ${
            mode === "register"
              ? "bg-card text-foreground shadow-sm font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("register")}
        >
          Register
        </button>
        <button
          type="button"
          className={`flex-1 py-2 text-center rounded-lg transition-all ${
            mode === "lookup"
              ? "bg-card text-foreground shadow-sm font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("lookup")}
        >
          View Details
        </button>
      </div>

      {mode === "login" && (
        <PhoneLogin
          setMode={setMode}
          redirectTo={redirectTo}
          prefilledIdentifier={prefilledIdentifier}
        />
      )}

      {mode === "register" && (
        <RegisterForm
          setMode={setMode}
          onFoundExisting={(phone) => {
            setPrefilledIdentifier(phone);
          }}
        />
      )}

      {mode === "lookup" && (
        <PhoneLookupView
          setMode={setMode}
          initialPhone={prefilledIdentifier}
          onSelectPhone={(phone) => setPrefilledIdentifier(phone)}
        />
      )}

      {mode === "forgot" && <ForgotPassword setMode={setMode} />}
    </div>
  );
}

/**
 * 1. Simple Email or Phone Number & Password Login Form
 * Requirement:
 * - Placeholder: "Enter email address or mobile number"
 * - Accepts both: Email + password OR Phone + password
 * - Identifies input type automatically
 * - Authenticates the same underlying account
 */
function PhoneLogin({
  setMode,
  redirectTo,
  prefilledIdentifier,
}: {
  setMode: (m: AuthMode) => void;
  redirectTo?: string;
  prefilledIdentifier?: string;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [identifierVal, setIdentifierVal] = useState(prefilledIdentifier ?? "");

  useEffect(() => {
    if (prefilledIdentifier) setIdentifierVal(prefilledIdentifier);
  }, [prefilledIdentifier]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const identifier = String(f.get("identifier") ?? f.get("phone") ?? "").trim();
        const password = String(f.get("password") ?? "");

        setBusy(true);
        const { data, error } = await appUniversalSignIn(identifier, password);
        setBusy(false);

        if (error || !data?.user) {
          toast.error(error?.message ?? "Invalid email address, mobile number, or password.");
          return;
        }

        // Fetch user roles and profile verification status to direct appropriately
        const [{ data: roles }, { data: profile }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", data.user.id),
          supabase.from("profiles").select("verification_status").eq("id", data.user.id).maybeSingle(),
        ]);

        const isStaff = (roles ?? []).some(
          (r) => r.role === "super_admin" || r.role === "attendance_admin"
        );

        if (isStaff) {
          toast.success("Welcome back, Administrator!");
          navigate({ to: "/admin" });
        } else if (profile?.verification_status === "rejected") {
          toast.error("Your account has been rejected or suspended by an administrator.");
          navigate({ to: "/dashboard" });
        } else if (profile?.verification_status === "pending") {
          toast.info("Registration pending admin verification.");
          navigate({ to: "/dashboard" });
        } else {
          toast.success("Signed in successfully!");
          if (redirectTo) {
            window.location.assign(redirectTo);
          } else {
            navigate({ to: "/dashboard" });
          }
        }
      }}
    >
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Sign In</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter your registered email address or mobile number and password.
        </p>
      </div>

      <Field label="Email Address or Mobile Number">
        <Input
          name="identifier"
          placeholder="Enter email address or mobile number"
          value={identifierVal}
          onChange={(e) => setIdentifierVal(e.target.value)}
          required
          autoComplete="username"
          className="text-base"
        />
      </Field>

      <Field label="Password">
        <Input
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="current-password"
          className="text-base"
        />
      </Field>

      <Button type="submit" className="w-full text-base font-bold py-5 mt-2" disabled={busy}>
        {busy ? "Signing in…" : "Sign In"}
      </Button>

      <div className="flex items-center justify-between pt-2 text-xs">
        <button
          type="button"
          className="text-primary hover:underline font-medium"
          onClick={() => setMode("forgot")}
        >
          Forgot password?
        </button>
        <button
          type="button"
          className="text-primary hover:underline font-semibold"
          onClick={() => setMode("lookup")}
        >
          View details by phone number
        </button>
      </div>
    </form>
  );
}

/**
 * 2. Participant Registration Form
 * Note: Account type selector is REMOVED completely per user instructions.
 * Normal registration strictly creates participant accounts.
 * Includes real-time phone number lookup: entering a mobile number displays their details if already registered.
 */
function RegisterForm({
  setMode,
  onFoundExisting,
}: {
  setMode: (m: AuthMode) => void;
  onFoundExisting?: (phone: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registeredCode, setRegisteredCode] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Phone lookup preview state
  const [phoneInput, setPhoneInput] = useState("");
  const [existingProfile, setExistingProfile] = useState<LookupProfileResult["profile"] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Auto-detect existing registration on entering phone number
  useEffect(() => {
    const cleaned = normalizePhone(phoneInput);
    if (INDIAN_PHONE.test(cleaned)) {
      setLookingUp(true);
      void lookupProfileByPhone({ data: { phone: cleaned } })
        .then((res) => {
          if (res.found && res.profile) {
            setExistingProfile(res.profile);
            onFoundExisting?.(cleaned);
          } else {
            setExistingProfile(null);
          }
        })
        .finally(() => setLookingUp(false));
    } else {
      setExistingProfile(null);
    }
  }, [phoneInput, onFoundExisting]);

  if (registeredCode) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-success/15 flex items-center justify-center text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Registration Complete!</h2>
            <p className="text-xs text-muted-foreground">
              Participant ID: <span className="font-mono font-bold text-primary">{registeredCode}</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-xs text-warning-foreground space-y-2">
          <p className="font-bold flex items-center gap-1.5 text-sm">
            <Clock className="h-4 w-4" /> Approval Pending
          </p>
          <p className="leading-relaxed">
            Your registration details and photograph have been received. An administrator will verify your profile before attendance marking begins.
          </p>
        </div>

        <Button className="w-full font-bold" onClick={() => setMode("login")}>
          Sign In with Mobile Number
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const name = String(f.get("name") ?? "").trim();
        const phone = normalizePhone(String(f.get("phone") ?? ""));
        const email = String(f.get("email") ?? "").trim().toLowerCase();
        const pw = String(f.get("password") ?? "");

        const errs: Record<string, string> = {};
        if (!name || name.length < 2 || name.length > 100) {
          errs["name"] = "Full name is required (2–100 characters).";
        }
        if (!phone || !INDIAN_PHONE.test(phone)) {
          errs["phone"] = "Enter a valid 10-digit mobile number.";
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errs["email"] = "Enter a valid email address.";
        }
        if (!pw || pw.length < 8) {
          errs["password"] = "Password must be at least 8 characters long.";
        }
        if (!photoFile) {
          errs["photo"] = "A clear profile photograph is required. Please upload or take a photo.";
        } else {
          try {
            await validateClientImageFile(photoFile);
          } catch (imgErr: unknown) {
            errs["photo"] = imgErr instanceof Error ? imgErr.message : "Invalid photograph.";
          }
        }

        setErrors(errs);
        if (Object.keys(errs).length) {
          toast.error("Please fill in all mandatory fields marked with an asterisk (*).");
          return;
        }

        setBusy(true);

        // Check for duplicates
        const { data: taken } = await supabase.rpc("registration_taken", {
          _email: email,
          _phone: phone,
        });

        if (taken) {
          setBusy(false);
          return setErrors({
            [taken]: `This ${taken === "phone" ? "mobile number" : "email address"} is already registered.`,
          });
        }

        // Authenticate via deterministic phone identifier
        const authEmail = phoneToAuthEmail(phone);
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: normalizeAppPassword(pw),
          options: {
            data: {
              full_name: name,
              phone,
              email,
              consent: "true",
              role: "participant",
            },
          },
        });

        if (error) {
          setBusy(false);
          return toast.error(error.message);
        }

        // Record explicit consent
        if (data.user) {
          try {
            await supabase.from("consent_records").insert({
              user_id: data.user.id,
              consent_type: "privacy_policy_and_biometric_face_verification",
              agreed: true,
            });
          } catch {
            // Non-blocking consent record
          }
        }

        // Upload photo securely via server function (bypasses storage RLS issues)
        if (data.user && photoFile) {
          try {
            const photoBase64 = await fileToBase64(photoFile);
            await uploadRegistrationPhoto({
              data: {
                userId: data.user.id,
                photoBase64,
              },
            });
          } catch (photoErr: unknown) {
            console.error("Photo upload failed:", photoErr);
            toast.error(
              photoErr instanceof Error
                ? photoErr.message
                : "Photo upload issue, but account was registered."
            );
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("participant_code")
            .eq("id", data.user.id)
            .maybeSingle();

          setRegisteredCode(profile?.participant_code ?? "SA-2026");
        } else {
          setRegisteredCode("SA-2026");
        }

        setBusy(false);
      }}
    >
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Create Account</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Register your participant profile for workshop attendance.
        </p>
      </div>

      {/* Mandatory fields alert banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900 flex items-center gap-2 font-medium">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
        <span>All fields marked with an asterisk (<span className="text-destructive font-bold">*</span>) are required.</span>
      </div>

      {/* If existing profile is found by phone number, show details card */}
      {existingProfile && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5 space-y-2.5">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 border">
              <AvatarImage src={existingProfile.photoUrl ?? undefined} />
              <AvatarFallback className="font-bold text-xs bg-primary/20 text-primary">
                {existingProfile.fullName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm text-foreground truncate">{existingProfile.fullName}</p>
                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                  {existingProfile.role.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-xs font-mono text-muted-foreground">{existingProfile.participantCode}</p>
            </div>
            <Badge
              className={
                existingProfile.verificationStatus === "verified"
                  ? "bg-success text-success-foreground text-[10px]"
                  : existingProfile.verificationStatus === "rejected"
                  ? "bg-destructive text-destructive-foreground text-[10px]"
                  : "bg-warning text-warning-foreground text-[10px]"
              }
            >
              {existingProfile.verificationStatus.toUpperCase()}
            </Badge>
          </div>
          <div className="flex items-center justify-between pt-1 border-t text-xs">
            <span className="text-muted-foreground text-[11px]">Already registered with this phone.</span>
            <Button
              size="sm"
              type="button"
              variant="default"
              className="h-7 text-xs font-bold"
              onClick={() => setMode("login")}
            >
              Sign In Instead <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Field label="Full Name" required error={errors["name"]}>
        <Input
          name="name"
          placeholder="e.g. Rahul Sharma"
          defaultValue={existingProfile?.fullName ?? ""}
          required
          maxLength={100}
        />
      </Field>

      <Field label="Mobile Number (Login Identifier)" required error={errors["phone"]}>
        <div className="relative">
          <Input
            name="phone"
            inputMode="tel"
            placeholder="e.g. 9876543210"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            required
            autoComplete="tel"
          />
          {lookingUp && (
            <div className="absolute right-3 top-2.5 text-xs text-muted-foreground animate-pulse">
              Checking…
            </div>
          )}
        </div>
      </Field>

      <Field label="Email Address" required error={errors["email"]}>
        <Input
          name="email"
          type="email"
          placeholder="rahul@example.com"
          defaultValue={existingProfile?.email ?? ""}
          required
        />
      </Field>

      <Field label="Password" required error={errors["password"]}>
        <Input
          name="password"
          type="password"
          placeholder="At least 8 characters"
          required
          minLength={8}
        />
      </Field>

      <Field label="Profile Photograph (Front-facing selfie)" required error={errors["photo"]}>
        <PhotoCaptureInput
          value={photoFile}
          onChange={(file) => {
            setPhotoFile(file);
            if (file) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next.photo;
                return next;
              });
            }
          }}
          error={errors["photo"]}
          disabled={busy}
        />
      </Field>

      <Button type="submit" className="w-full font-bold py-5 mt-2" disabled={busy}>
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Registering account…
          </span>
        ) : (
          "Submit Registration"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground pt-1">
        Already registered?{" "}
        <button
          type="button"
          className="text-primary hover:underline font-semibold"
          onClick={() => setMode("login")}
        >
          Sign in with Phone
        </button>
      </p>
    </form>
  );
}

/**
 * 3. View Details by Phone Number
 * Requirement: Users can view their details by entering their phone number.
 */
function PhoneLookupView({
  setMode,
  initialPhone = "",
  onSelectPhone,
}: {
  setMode: (m: AuthMode) => void;
  initialPhone?: string;
  onSelectPhone?: (phone: string) => void;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupProfileResult | null>(null);

  useEffect(() => {
    if (initialPhone) {
      setPhone(initialPhone);
    }
  }, [initialPhone]);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPhone = normalizePhone(phone);
    if (!INDIAN_PHONE.test(cleanPhone)) {
      toast.error("Enter a valid 10-digit mobile number.");
      return;
    }

    setBusy(true);
    try {
      // 1. Direct Supabase RPC (fast, resilient, direct to Postgres)
      const { data: rpcData, error: rpcErr } = await supabase.rpc("lookup_profile_by_phone", {
        _phone: cleanPhone,
      });

      let res: LookupProfileResult | null = null;
      if (!rpcErr && rpcData) {
        res = rpcData as LookupProfileResult;
      } else {
        // 2. Fall back to server function if RPC call didn't succeed
        res = await lookupProfileByPhone({ data: { phone: cleanPhone } });
      }

      if (res?.found && res.profile) {
        const path = res.profile.photoPath || (res.profile as unknown as { photo_path?: string }).photo_path;
        if (path && !res.profile.photoUrl) {
          try {
            const map = await signedUrls("photos", [path]);
            if (map[path]) res.profile.photoUrl = map[path];
          } catch {
            // photoUrl fallback
          }
        }
      }

      setResult(res);
      if (!res?.found) {
        toast.error(res?.message || "No registered account found with that mobile number.");
      } else {
        toast.success("Profile details retrieved!");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">View Registration Details</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter your registered mobile number to view your account details and approval status.
        </p>
      </div>

      <form onSubmit={handleLookup} className="space-y-3">
        <Field label="Enter Mobile Number">
          <div className="flex gap-2">
            <Input
              type="tel"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="text-base"
            />
            <Button type="submit" disabled={busy || !phone.trim()} className="gap-1.5 font-bold">
              <Search className="h-4 w-4" /> {busy ? "Checking…" : "Lookup"}
            </Button>
          </div>
        </Field>
      </form>

      {result?.found && result.profile && (
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-3.5 border-b pb-4">
            <Avatar className="h-14 w-14 border-2 border-primary/20">
              <AvatarImage src={result.profile.photoUrl ?? undefined} />
              <AvatarFallback className="font-bold text-base bg-primary/10 text-primary">
                {result.profile.fullName ? result.profile.fullName.slice(0, 2).toUpperCase() : "SA"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-foreground truncate">{result.profile.fullName}</h3>
                <Badge
                  className={
                    result.profile.verificationStatus === "verified"
                      ? "bg-success text-success-foreground text-[10px]"
                      : result.profile.verificationStatus === "rejected"
                      ? "bg-destructive text-destructive-foreground text-[10px]"
                      : "bg-warning text-warning-foreground text-[10px]"
                  }
                >
                  {result.profile.verificationStatus.toUpperCase()}
                </Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground mt-0.5">{result.profile.participantCode}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Mobile Number</span>
              <p className="font-mono font-medium text-foreground mt-0.5">{result.profile.phone}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Email Address</span>
              <p className="font-medium text-foreground mt-0.5 truncate">{result.profile.email}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Account Role</span>
              <p className="font-medium capitalize text-foreground mt-0.5">
                {result.profile.role.replace("_", " ")}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Registered On</span>
              <p className="font-medium text-foreground mt-0.5">
                {new Date(result.profile.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <Button
            className="w-full font-bold"
            onClick={() => {
              if (result.profile?.phone) {
                onSelectPhone?.(result.profile.phone);
              }
              setMode("login");
            }}
          >
            Sign In with this Account <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      )}

      {result && !result.found && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
          <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
          <p className="text-xs text-muted-foreground">
            No registration found for this mobile number. You can register a new account below.
          </p>
          <Button size="sm" variant="outline" onClick={() => setMode("register")}>
            Register New Account
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * 4. Password Recovery — Admin-Managed Recovery Notice
 * Requirement: For security reasons, participants do not receive password-reset emails.
 * They are instructed to contact their workshop administrator.
 */
function ForgotPassword({ setMode }: { setMode: (m: AuthMode) => void }) {
  return (
    <div className="space-y-5 text-center py-2">
      <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <Lock className="h-6 w-6" />
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold text-foreground">Forgot your password?</h2>
        <p className="text-xs text-muted-foreground leading-relaxed text-left sm:text-center">
          Password recovery is managed by your SmartAttend administrator. Please contact your workshop administrator to reset your password. For security reasons, password-reset emails are not sent.
        </p>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-left space-y-2">
        <p className="font-semibold text-primary flex items-center gap-1.5">
          <Mail className="h-4 w-4" /> Workshop Administrator Contact:
        </p>
        <p className="text-foreground font-mono font-medium text-xs">admin@growiota.in</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Your authorized administrator can securely update your account password directly from the management console.
        </p>
      </div>

      <Button
        type="button"
        className="w-full font-bold"
        onClick={() => setMode("login")}
      >
        Back to Sign In
      </Button>
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold flex items-center gap-1">
        <span>{label}</span>
        {required && <span className="text-destructive font-bold">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

