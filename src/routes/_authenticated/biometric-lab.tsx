import { useState, useEffect, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Fingerprint,
  Cpu,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Usb,
  Trash2,
  FlaskConical,
  HelpCircle,
  ArrowRight,
  Terminal,
  Activity,
  Layers,
  Lock,
} from "lucide-react";
import type {
  StartekHardwareInfo,
  StartekDeviceState,
  FingerType,
  BiometricVerificationResult,
  BiometricEnrollmentRecord,
} from "@/lib/biometric/types";
import {
  fetchBiometricHardwareStatus,
  captureBiometricFingerprint,
  enrollBiometricFingerprint,
  verifyBiometricFingerprint,
  fetchTestEnrollments,
  deleteTestEnrollments,
} from "@/lib/biometric/biometric-bridge-client";

export const Route = createFileRoute("/_authenticated/biometric-lab")({
  component: FingerprintBiometricTestLab,
});

const FINGER_OPTIONS: Array<{ value: FingerType; label: string }> = [
  { value: "right_thumb", label: "Right Hand — Thumb" },
  { value: "right_index", label: "Right Hand — Index Finger (Recommended)" },
  { value: "right_middle", label: "Right Hand — Middle Finger" },
  { value: "right_ring", label: "Right Hand — Ring Finger" },
  { value: "right_little", label: "Right Hand — Little Finger" },
  { value: "left_thumb", label: "Left Hand — Thumb" },
  { value: "left_index", label: "Left Hand — Index Finger" },
  { value: "left_middle", label: "Left Hand — Middle Finger" },
  { value: "left_ring", label: "Left Hand — Ring Finger" },
  { value: "left_little", label: "Left Hand — Little Finger" },
];

function getDeviceStateBadge(state: StartekDeviceState) {
  switch (state) {
    case "DEVICE_READY":
      return (
        <Badge className="bg-emerald-600 text-white gap-1 px-2.5 py-0.5 text-xs font-semibold">
          <CheckCircle2 className="h-3.5 w-3.5" /> Device Ready
        </Badge>
      );
    case "DEVICE_DETECTED":
      return (
        <Badge className="bg-teal-600 text-white gap-1 px-2.5 py-0.5 text-xs font-semibold">
          <Usb className="h-3.5 w-3.5" /> Device Detected
        </Badge>
      );
    case "SDK_UNAVAILABLE":
      return (
        <Badge className="bg-amber-600 text-white gap-1 px-2.5 py-0.5 text-xs font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" /> SDK / RD Service Unavailable
        </Badge>
      );
    case "DRIVER_MISSING":
      return (
        <Badge className="bg-rose-600 text-white gap-1 px-2.5 py-0.5 text-xs font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" /> Driver Missing
        </Badge>
      );
    case "DRIVER_INCOMPATIBLE":
      return (
        <Badge className="bg-rose-700 text-white gap-1 px-2.5 py-0.5 text-xs font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" /> Driver Incompatible
        </Badge>
      );
    case "DEVICE_INIT_FAILED":
      return (
        <Badge className="bg-destructive text-white gap-1 px-2.5 py-0.5 text-xs font-semibold">
          <XCircle className="h-3.5 w-3.5" /> Initialization Failed
        </Badge>
      );
    case "DEVICE_NOT_CONNECTED":
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground gap-1 px-2.5 py-0.5 text-xs font-semibold">
          <Usb className="h-3.5 w-3.5" /> Device Not Connected
        </Badge>
      );
  }
}

export function FingerprintBiometricTestLab() {
  // Hardware status state
  const [hardwareInfo, setHardwareInfo] = useState<StartekHardwareInfo | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Enrollment workflow state
  const [enrollUserId, setEnrollUserId] = useState("TEST-PARTICIPANT-01");
  const [enrollFinger, setEnrollFinger] = useState<FingerType>("right_index");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<BiometricEnrollmentRecord | null>(null);

  // Verification workflow state
  const [verifyUserId, setVerifyUserId] = useState("TEST-PARTICIPANT-01");
  const [verifyFinger, setVerifyFinger] = useState<FingerType>("right_index");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<BiometricVerificationResult | null>(null);

  // Negative test scenario state
  const [negativeScenario, setNegativeScenario] = useState<
    "DIFFERENT_PERSON" | "DIFFERENT_FINGER" | "POOR_QUALITY" | "NOT_ENROLLED"
  >("DIFFERENT_PERSON");
  const [runningNegativeTest, setRunningNegativeTest] = useState(false);

  // Active test enrollments list
  const [enrolledList, setEnrolledList] = useState<
    Array<Omit<BiometricEnrollmentRecord, "encryptedTemplate">>
  >([]);

  // 1. Fetch hardware status
  const refreshHardware = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const info = await fetchBiometricHardwareStatus();
      setHardwareInfo(info);
    } catch {
      toast.error("Failed to query hardware status.");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // 2. Fetch test enrollments
  const refreshEnrollments = useCallback(async () => {
    try {
      const list = await fetchTestEnrollments();
      setEnrolledList(list);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    void refreshHardware();
    void refreshEnrollments();
  }, [refreshHardware, refreshEnrollments]);

  // 3. Handle Enrollment
  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollUserId.trim()) {
      toast.error("Please enter a valid test user ID.");
      return;
    }

    setEnrolling(true);
    setEnrollResult(null);

    try {
      const res = await enrollBiometricFingerprint(enrollUserId.trim(), enrollFinger);
      if (res.success && res.record) {
        setEnrollResult(res.record);
        toast.success(`Fingerprint enrolled successfully for ${enrollUserId}!`);
        void refreshEnrollments();
      } else {
        toast.error(res.error || "Enrollment failed.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Enrollment error.");
    } finally {
      setEnrolling(false);
    }
  };

  // 4. Handle Verification
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyUserId.trim()) {
      toast.error("Please enter the enrolled test user ID to verify.");
      return;
    }

    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await verifyBiometricFingerprint(verifyUserId.trim(), verifyFinger);
      setVerifyResult(res);

      if (res.verified) {
        toast.success(`Biometric Match Confirmed! Score: ${res.matchScore}/100`);
      } else {
        toast.warning(`Verification Rejected: ${res.message}`);
      }
    } catch (err) {
      toast.error((err as Error).message || "Verification request failed.");
    } finally {
      setVerifying(false);
    }
  };

  // 5. Run Negative Test Case
  const handleRunNegativeTest = async () => {
    if (!enrolledList.length) {
      toast.error("Please enroll at least one test fingerprint before running negative tests.");
      return;
    }

    const targetUser = enrolledList[0]?.testUserId || "TEST-PARTICIPANT-01";
    const targetFinger = enrolledList[0]?.finger || "right_index";

    setRunningNegativeTest(true);
    try {
      if (negativeScenario === "NOT_ENROLLED") {
        const res = await verifyBiometricFingerprint("UNREGISTERED-USER-99", "left_little");
        setVerifyResult(res);
        toast.info("Negative Test Executed: Unenrolled identity test");
      } else {
        const res = await verifyBiometricFingerprint(targetUser, targetFinger, {
          isNegativeTest: true,
          testScenario: negativeScenario,
        });
        setVerifyResult(res);
        toast.info(`Negative Test Executed: ${negativeScenario}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunningNegativeTest(false);
    }
  };

  // 6. Delete test enrollments
  const handleDeleteEnrollment = async (userId: string, finger: FingerType) => {
    const res = await deleteTestEnrollments(userId, finger);
    if (res.success) {
      toast.success(res.message);
      void refreshEnrollments();
      if (enrollResult?.testUserId === userId && enrollResult?.finger === finger) {
        setEnrollResult(null);
      }
      if (verifyResult?.testUserId === userId) {
        setVerifyResult(null);
      }
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Clear all isolated test fingerprint enrollments?")) return;
    const res = await deleteTestEnrollments();
    if (res.success) {
      toast.success("All test enrollments cleared.");
      void refreshEnrollments();
      setEnrollResult(null);
      setVerifyResult(null);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header & Breadcrumbs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-emerald-600/10 text-emerald-600 flex items-center justify-center">
                <Fingerprint className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold font-display text-foreground">
                Fingerprint Biometric Test Lab
              </h1>
              <Badge variant="outline" className="border-emerald-600 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-[10px] font-mono">
                PHASE 1 PROTOTYPE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Hardware-first validation, enrollment and 1-to-1 verification for Startek FM220 on Windows 11.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshHardware}
              disabled={loadingStatus}
              className="gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingStatus ? "animate-spin text-emerald-600" : ""}`} />
              Refresh Device Status
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-xs gap-1">
              <Link to="/admin">
                <span>Admin Dashboard</span> <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Isolation Notice Banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 p-3.5 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300 shadow-2xs">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">Prototype & Hardware Isolation Protocol:</p>
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
              This lab operates strictly in a non-destructive testing sandbox. No production student records or attendance logs are modified. Biometric templates are stored encrypted with AES-256-GCM. Raw fingerprint images are never retained.
            </p>
          </div>
        </div>

        {/* SECTION A: HARDWARE STATUS PANEL */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-bold">Startek FM220 Hardware Status</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Real-time Windows 11 PnP device detection, driver validation, and SDK bridge health.
                </CardDescription>
              </div>
              <div>{hardwareInfo && getDeviceStateBadge(hardwareInfo.state)}</div>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {/* Status Description Box */}
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span>Diagnostic Assessment:</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {hardwareInfo?.stateDescription ||
                  "Checking hardware communication layer on Windows 11 host…"}
              </p>
            </div>

            {/* Hardware Telemetry Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  USB Connection
                </span>
                <p className="font-bold text-foreground mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      hardwareInfo?.connected ? "bg-emerald-500" : "bg-muted-foreground"
                    }`}
                  />
                  {hardwareInfo?.connected ? "CONNECTED" : "DISCONNECTED"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  {hardwareInfo?.hardwareId || "USB\\VID_0B39&PID_8220"}
                </p>
              </div>

              <div className="p-3 rounded-lg border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  Device Driver
                </span>
                <p className="font-bold text-foreground mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      hardwareInfo?.driverInstalled ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {hardwareInfo?.driverInstalled ? "INSTALLED" : "NOT DETECTED"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Arch: {hardwareInfo?.driverArchitecture || "x64 (Win11)"}
                </p>
              </div>

              <div className="p-3 rounded-lg border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  ACPL RD Service
                </span>
                <p className="font-bold text-foreground mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      hardwareInfo?.rdServiceRunning ? "bg-emerald-500" : "bg-muted-foreground"
                    }`}
                  />
                  {hardwareInfo?.rdServiceRunning
                    ? `ACTIVE (: ${hardwareInfo.rdServicePort})`
                    : "NOT RUNNING"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Target ports: 11100 / 11200
                </p>
              </div>

              <div className="p-3 rounded-lg border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  Local Bridge Service
                </span>
                <p className="font-bold text-foreground mt-0.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  127.0.0.1:8099
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  Checked: {hardwareInfo?.lastCheckedAt ? new Date(hardwareInfo.lastCheckedAt).toLocaleTimeString() : "Just now"}
                </p>
              </div>
            </div>

            {/* Bridge Setup Command Guide if device is not connected */}
            {!hardwareInfo?.connected && (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-primary">
                  <Terminal className="h-3.5 w-3.5" />
                  <span>How to connect your physical Startek FM220 scanner:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-[11px] leading-relaxed">
                  <li>Plug the Startek FM220 USB cable into any available USB 2.0 / 3.0 port on this Windows 11 PC.</li>
                  <li>In a PowerShell terminal, start the dedicated biometric bridge: <code className="bg-background px-1.5 py-0.5 rounded font-mono text-foreground font-bold">npm run biometric:bridge</code></li>
                  <li>Click <strong>Refresh Device Status</strong> above to immediately verify hardware recognition.</li>
                </ol>
              </div>
            )}
          </CardContent>
        </Card>

        {/* WORKFLOWS GRID: ENROLLMENT & VERIFICATION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SECTION B: FINGERPRINT ENROLLMENT */}
          <Card className="border shadow-xs flex flex-col">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Layers className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base font-bold">1. Fingerprint Enrollment</CardTitle>
                  <CardDescription className="text-xs">
                    Enroll a test fingerprint template into encrypted prototype storage.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4 flex-1 flex flex-col justify-between">
              <form onSubmit={handleEnroll} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Test Participant ID / Code</Label>
                  <Input
                    placeholder="e.g. SA-2026-0003 or TEST-01"
                    value={enrollUserId}
                    onChange={(e) => setEnrollUserId(e.target.value)}
                    required
                    className="text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Select Finger to Enroll</Label>
                  <Select
                    value={enrollFinger}
                    onValueChange={(val: FingerType) => setEnrollFinger(val)}
                  >
                    <SelectTrigger className="text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FINGER_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value} className="text-xs">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Finger placement instruction notice */}
                <div className="rounded-lg border bg-muted/40 p-3 text-xs flex items-start gap-2.5">
                  <Fingerprint className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-foreground">Sensor Placement Guide:</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Place the chosen finger firmly flat on the FM220 optical prism until capture completes. Ensure the scanner surface is clean.
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={enrolling}
                  className="w-full font-bold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {enrolling ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Capturing & Enrolling…
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-4 w-4" />
                      Capture & Enroll Fingerprint
                    </>
                  )}
                </Button>
              </form>

              {/* Enrollment Result Card */}
              {enrollResult && (
                <div className="mt-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Enrollment Successful
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-white dark:bg-black font-mono">
                      ANSI-378 Standard
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">User ID:</span>
                      <p className="font-mono font-bold text-foreground">{enrollResult.testUserId}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quality Score:</span>
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">
                        {enrollResult.qualityScore} / 100
                      </p>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-emerald-200 dark:border-emerald-900 text-[10px] text-muted-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1 font-mono">
                      <Lock className="h-3 w-3 text-emerald-600" />
                      Encrypted SHA-256: {enrollResult.templateHash.slice(0, 16)}…
                    </span>
                    <span>{new Date(enrollResult.enrolledAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION C: FINGERPRINT VERIFICATION */}
          <Card className="border shadow-xs flex flex-col">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base font-bold">2. 1-to-1 Biometric Verification</CardTitle>
                  <CardDescription className="text-xs">
                    Perform genuine one-to-one template matching against the enrolled fingerprint.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4 flex-1 flex flex-col justify-between">
              <form onSubmit={handleVerify} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Test Participant ID to Verify</Label>
                  <Input
                    placeholder="Enter enrolled user ID"
                    value={verifyUserId}
                    onChange={(e) => setVerifyUserId(e.target.value)}
                    required
                    className="text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Finger Presented on Scanner</Label>
                  <Select
                    value={verifyFinger}
                    onValueChange={(val: FingerType) => setVerifyFinger(val)}
                  >
                    <SelectTrigger className="text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FINGER_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value} className="text-xs">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border bg-muted/40 p-3 text-xs flex items-start gap-2.5">
                  <Activity className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-foreground">Matching Threshold Rule:</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Verification requires an alignment score &ge; 60 out of 100 on ANSI-378 normalized minutiae. Impostor or different fingers are rejected.
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={verifying}
                  className="w-full font-bold gap-2 bg-primary text-primary-foreground"
                >
                  {verifying ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Scanning & Comparing…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Scan & Verify Fingerprint
                    </>
                  )}
                </Button>
              </form>

              {/* Verification Result Card */}
              {verifyResult && (
                <div
                  className={`mt-4 rounded-xl border p-3.5 space-y-2 text-xs ${
                    verifyResult.verified
                      ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20"
                      : "border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-bold flex items-center gap-1.5 ${
                        verifyResult.verified
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-rose-800 dark:text-rose-300"
                      }`}
                    >
                      {verifyResult.verified ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-600" />
                      )}
                      {verifyResult.verified ? "VERIFICATION SUCCESSFUL" : "VERIFICATION REJECTED"}
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-white dark:bg-black font-mono">
                      Score: {verifyResult.matchScore} / 100
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Match Score:</span>
                      <span className="font-bold font-mono">
                        {verifyResult.matchScore}% (Threshold: {verifyResult.threshold}%)
                      </span>
                    </div>
                    <Progress
                      value={verifyResult.matchScore}
                      className={`h-2 ${verifyResult.verified ? "[&>div]:bg-emerald-600" : "[&>div]:bg-rose-600"}`}
                    />
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t">
                    {verifyResult.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground/80 italic font-mono">
                    {verifyResult.scale}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SECTION D: NEGATIVE TESTING SUITE */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              <div>
                <CardTitle className="text-base font-bold">3. Negative Testing Suite</CardTitle>
                <CardDescription className="text-xs">
                  Validate biometric rejection criteria: different fingers, unenrolled users, and impostor attempts.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Select Negative Scenario to Test</Label>
                <Select
                  value={negativeScenario}
                  onValueChange={(val: any) => setNegativeScenario(val)}
                >
                  <SelectTrigger className="text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIFFERENT_PERSON" className="text-xs">
                      Scenario A: Fingerprint from a different person (Impostor test)
                    </SelectItem>
                    <SelectItem value="DIFFERENT_FINGER" className="text-xs">
                      Scenario B: Different finger from the same user (Cross-finger check)
                    </SelectItem>
                    <SelectItem value="NOT_ENROLLED" className="text-xs">
                      Scenario C: Fingerprint not enrolled in the system
                    </SelectItem>
                    <SelectItem value="POOR_QUALITY" className="text-xs">
                      Scenario D: Poor-quality / partial lift capture
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={handleRunNegativeTest}
                  disabled={runningNegativeTest}
                  className="w-full text-xs font-bold gap-1.5"
                  variant="outline"
                >
                  {runningNegativeTest ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5 text-primary" />
                  )}
                  Execute Negative Test
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION E: ISOLATED TEST ENROLLMENTS STORAGE */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="text-base font-bold">Active Prototype Test Enrollments</CardTitle>
                <CardDescription className="text-xs">
                  Sandbox storage records. Isolated from production database.
                </CardDescription>
              </div>
              {enrolledList.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-xs text-destructive hover:text-destructive border-destructive/30 gap-1.5 h-8 font-semibold"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All Test Enrollments
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            {!enrolledList.length ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No test fingerprints enrolled yet. Use the enrollment form above to create prototype test records.
              </div>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden text-xs">
                {enrolledList.map((rec) => (
                  <div
                    key={`${rec.testUserId}_${rec.finger}`}
                    className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold font-mono text-foreground">{rec.testUserId}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {rec.finger.replace("_", " ")} • Quality: {rec.qualityScore}% • {rec.algorithm}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(rec.enrolledAt).toLocaleDateString()} {new Date(rec.enrolledAt).toLocaleTimeString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteEnrollment(rec.testUserId, rec.finger)}
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        title="Delete test enrollment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

