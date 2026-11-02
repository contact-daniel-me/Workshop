import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileDown,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Info,
  ShieldCheck,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import {
  parseEsdpDocx,
  validateEsdpParticipant,
  DEFAULT_ESDP_PARTICIPANTS,
  type ParsedEsdpParticipant,
} from "@/lib/docx-parser";
import {
  bulkRegisterParticipantsAdmin,
  type BulkRegistrationResultItem,
} from "@/lib/admin.functions";
import { downloadEsdpCredentialsPdf, type EsdpCredentialEntry } from "@/lib/esdp-pdf";

interface BulkParticipantRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type DialogStep = "preview" | "registering" | "completed";
type FilterView = "all" | "valid" | "flagged";

export function BulkParticipantRegistrationDialog({
  open,
  onOpenChange,
  onSuccess,
}: BulkParticipantRegistrationDialogProps) {
  // Step & Data state
  const [step, setStep] = useState<DialogStep>("preview");
  const [participants, setParticipants] = useState<ParsedEsdpParticipant[]>(() => {
    // Initialize with standard ESDP records
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();
    return DEFAULT_ESDP_PARTICIPANTS.map((p) => {
      const base = {
        id: `esdp-${p.serialNo}`,
        ...p,
      };
      const val = validateEsdpParticipant(base, seenPhones, seenEmails);
      return { ...base, ...val };
    });
  });

  const [filter, setFilter] = useState<FilterView>("all");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Results state post-registration
  const [results, setResults] = useState<BulkRegistrationResultItem[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    created: number;
    duplicates: number;
    failed: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived counts
  const validCount = useMemo(
    () => participants.filter((p) => p.isValid).length,
    [participants]
  );
  const invalidCount = useMemo(
    () => participants.filter((p) => !p.isValid).length,
    [participants]
  );

  const filteredParticipants = useMemo(() => {
    if (filter === "valid") return participants.filter((p) => p.isValid);
    if (filter === "flagged") return participants.filter((p) => !p.isValid);
    return participants;
  }, [participants, filter]);

  // Handle editing participant row
  const handleUpdateParticipant = (
    id: string,
    field: "fullName" | "phone" | "email",
    value: string
  ) => {
    setParticipants((prev) => {
      const targetIndex = prev.findIndex((p) => p.id === id);
      if (targetIndex === -1) return prev;

      const current = prev[targetIndex]!;
      const updatedItem = {
        ...current,
        [field]: value,
      };

      // Recalculate validation & default password
      const val = validateEsdpParticipant(updatedItem);
      const nextList = [...prev];
      nextList[targetIndex] = {
        ...updatedItem,
        ...val,
      };
      return nextList;
    });
  };

  // Handle Docx File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Please upload a Microsoft Word document (.docx).");
      return;
    }

    setIsParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = parseEsdpDocx(new Uint8Array(buffer));

      if (result.participants.length === 0) {
        toast.error("No participant table rows found in the document.");
        return;
      }

      setParticipants(result.participants);
      toast.success(
        `Successfully loaded ${result.total} participants (${result.validCount} valid, ${result.invalidCount} need attention).`
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to parse .docx file."
      );
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Reset to default standard list
  const handleResetToStandard = () => {
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();
    const standard = DEFAULT_ESDP_PARTICIPANTS.map((p) => {
      const base = {
        id: `esdp-${p.serialNo}`,
        ...p,
      };
      const val = validateEsdpParticipant(base, seenPhones, seenEmails);
      return { ...base, ...val };
    });
    setParticipants(standard);
    setFilter("all");
    toast.info("Reset to default ESDP 30-participant list.");
  };

  // Execute bulk registration
  const handleBulkRegister = async (onlyValid: boolean = true) => {
    const toRegister = onlyValid
      ? participants.filter((p) => p.isValid)
      : participants;

    if (toRegister.length === 0) {
      toast.error("No valid participants to register.");
      return;
    }

    setIsSubmitting(true);
    setStep("registering");

    try {
      const res = await bulkRegisterParticipantsAdmin({
        data: {
          participants: toRegister.map((p) => ({
            serialNo: p.serialNo,
            fullName: p.fullName,
            phone: p.phone,
            email: p.email,
            age: p.age,
            category: p.category,
            password: p.defaultPassword,
          })),
        },
      });

      if (!res.ok) {
        throw new Error("Bulk registration failed on server.");
      }

      setResults(res.results);
      setSummary(res.summary);
      setStep("completed");
      toast.success(
        `Bulk registration completed! ${res.summary.created} accounts created.`
      );
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to execute bulk registration."
      );
      setStep("preview");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download PDF Pass
  const handleDownloadPdf = async () => {
    if (!results || results.length === 0) return;
    setDownloadingPdf(true);
    try {
      const credentialEntries: EsdpCredentialEntry[] = results.map((r) => ({
        serialNo: r.serialNo,
        fullName: r.fullName,
        participantCode: r.participantCode,
        phone: r.phone,
        email: r.email,
        rawPassword: r.password,
        status:
          r.status === "created"
            ? "success"
            : r.status === "duplicate"
              ? "duplicate"
              : "failed",
        error: r.error,
      }));

      // Add any skipped invalid records if any
      const skipped = participants.filter((p) => !p.isValid);
      for (const sk of skipped) {
        if (!credentialEntries.some((c) => c.serialNo === sk.serialNo)) {
          credentialEntries.push({
            serialNo: sk.serialNo,
            fullName: sk.fullName,
            participantCode: "HELD",
            phone: sk.phone,
            email: sk.email || "MISSING",
            rawPassword: "N/A",
            status: "failed",
            error: sk.validationError,
          });
        }
      }

      credentialEntries.sort((a, b) => a.serialNo - b.serialNo);

      await downloadEsdpCredentialsPdf({
        workshopName: "ESDP Workshop Attendance Portal",
        totalRecords: participants.length,
        successCount: summary?.created ?? 0,
        failedCount: (summary?.failed ?? 0) + (summary?.duplicates ?? 0),
        participants: credentialEntries,
        portalUrl: typeof window !== "undefined" ? window.location.origin : undefined,
      });

      toast.success("ESDP Credentials PDF Pass downloaded successfully!");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to generate ESDP credentials PDF."
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Copy all credentials to clipboard
  const handleCopyAll = () => {
    if (!results || results.length === 0) return;
    const lines = [
      "ESDP PARTICIPANT CREDENTIALS PASS",
      `Total: ${results.length} | Created: ${summary?.created ?? 0}`,
      "----------------------------------------------------------------------",
      "Sl | Name | ID | Mobile Login | Email Login | Default Password | Status",
    ];

    results.forEach((r) => {
      lines.push(
        `${r.serialNo} | ${r.fullName} | ${r.participantCode} | ${r.phone} | ${r.email} | ${r.password} | ${r.status.toUpperCase()}`
      );
    });

    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedAll(true);
    toast.success("All credentials copied to clipboard!");
    setTimeout(() => setCopiedAll(false), 3000);
  };

  const handleClose = () => {
    setStep("preview");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-teal-600 text-white shadow-sm">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold font-display text-foreground flex items-center gap-2">
                  ESDP Bulk Participant Registration
                  <Badge variant="outline" className="text-xs bg-teal-50 text-teal-800 border-teal-200">
                    Auto-Password & Auto-Approve
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Import Word document (.docx), preview & correct participant records, generate default passwords, and download the official credentials pass.
                </DialogDescription>
              </div>
            </div>

            {/* Quick Upload Action */}
            {step === "preview" && (
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".docx"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                  className="gap-1.5 text-xs h-8"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {isParsing ? "Reading .docx…" : "Upload .docx"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetToStandard}
                  className="text-xs h-8 text-muted-foreground hover:text-foreground"
                >
                  Reset to ESDP List
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* STEP 1: PREVIEW & VALIDATION */}
          {step === "preview" && (
            <>
              {/* Alert banner if invalid records exist */}
              {invalidCount > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-3 text-xs text-amber-900">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-800">
                      Attention Required ({invalidCount} {invalidCount === 1 ? "record needs" : "records need"} correction):
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                      <li>
                        <strong>Row 13 (K Mohammad Abuzar):</strong> Mobile number in Word document was exported in scientific notation (<code className="bg-amber-100 px-1 py-0.5 rounded font-mono">9.18439E+11</code>). Please enter the full 10-digit number.
                      </li>
                      <li>
                        <strong>Row 24 (Sanjay):</strong> Missing email address. Please enter a valid email address.
                      </li>
                    </ul>
                    <p className="text-amber-800 font-medium pt-1">
                      💡 You can edit mobile numbers and email addresses directly in the table below. Default passwords update automatically!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3 text-xs text-emerald-900">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold">All {participants.length} participant records are fully validated and ready for registration!</span> Default passwords have been automatically generated.
                  </div>
                </div>
              )}

              {/* Status Summary Cards & Filter Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-2.5 rounded-lg border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground mr-1">Filter:</span>
                  <Button
                    type="button"
                    variant={filter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("all")}
                    className="h-7 text-xs px-2.5"
                  >
                    All ({participants.length})
                  </Button>
                  <Button
                    type="button"
                    variant={filter === "valid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("valid")}
                    className={`h-7 text-xs px-2.5 ${filter === "valid" ? "bg-emerald-600 hover:bg-emerald-700" : "text-emerald-700 border-emerald-300"}`}
                  >
                    Valid & Ready ({validCount})
                  </Button>
                  {invalidCount > 0 && (
                    <Button
                      type="button"
                      variant={filter === "flagged" ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => setFilter("flagged")}
                      className={`h-7 text-xs px-2.5 ${filter === "flagged" ? "" : "text-amber-700 border-amber-300"}`}
                    >
                      Needs Attention ({invalidCount})
                    </Button>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  Format: <span className="font-mono font-medium text-foreground">First 4 letters of name + First 4 digits of phone</span>
                </div>
              </div>

              {/* Interactive Participant Table */}
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-10 text-center font-bold">#</TableHead>
                      <TableHead className="min-w-[140px] font-bold">Full Name</TableHead>
                      <TableHead className="w-24 font-bold">Category</TableHead>
                      <TableHead className="min-w-[150px] font-bold">Mobile Number</TableHead>
                      <TableHead className="min-w-[200px] font-bold">Email Address</TableHead>
                      <TableHead className="w-32 font-bold">Default Password</TableHead>
                      <TableHead className="w-28 text-center font-bold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredParticipants.map((p) => {
                      const isRowFlagged = !p.isValid;
                      return (
                        <TableRow
                          key={p.id}
                          className={isRowFlagged ? "bg-amber-50/50 hover:bg-amber-50" : undefined}
                        >
                          <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground">
                            {p.serialNo}
                          </TableCell>

                          <TableCell className="font-medium text-xs">
                            <Input
                              value={p.fullName}
                              onChange={(e) =>
                                handleUpdateParticipant(p.id, "fullName", e.target.value)
                              }
                              className="h-7 text-xs font-medium"
                            />
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {p.age ? `${p.age}y` : ""} {p.category}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-0.5">
                              <Input
                                value={p.phone}
                                onChange={(e) =>
                                  handleUpdateParticipant(p.id, "phone", e.target.value)
                                }
                                placeholder="10-digit mobile"
                                className={`h-7 text-xs font-mono ${
                                  p.isScientificNotation || (!p.isValid && p.validationError?.toLowerCase().includes("mobile"))
                                    ? "border-amber-500 focus-visible:ring-amber-500 bg-amber-50"
                                    : ""
                                }`}
                              />
                              {p.isScientificNotation && (
                                <span className="text-[10px] text-amber-700 block font-sans">
                                  Scientific notation — enter 10 digits
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-0.5">
                              <Input
                                value={p.email}
                                onChange={(e) =>
                                  handleUpdateParticipant(p.id, "email", e.target.value)
                                }
                                placeholder="participant@example.com"
                                className={`h-7 text-xs ${
                                  !p.email || (!p.isValid && p.validationError?.toLowerCase().includes("email"))
                                    ? "border-amber-500 focus-visible:ring-amber-500 bg-amber-50"
                                    : ""
                                }`}
                              />
                              {!p.email && (
                                <span className="text-[10px] text-amber-700 block font-sans">
                                  Missing email — required for login
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            {p.defaultPassword ? (
                              <Badge
                                variant="outline"
                                className="font-mono text-xs font-semibold bg-emerald-50 text-emerald-800 border-emerald-300"
                              >
                                {p.defaultPassword}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                                Pending
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-center">
                            {p.isValid ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] gap-1">
                                <CheckCircle className="h-3 w-3" /> Ready
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900 text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3 text-amber-600" /> Incomplete
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* STEP 2: REGISTRATION IN PROGRESS */}
          {step === "registering" && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <RefreshCw className="h-12 w-12 text-teal-600 animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-display text-foreground">
                  Registering ESDP Participants…
                </h3>
                <p className="text-xs text-muted-foreground max-w-md">
                  Creating Supabase Auth accounts, salting passwords, setting roles to participant, and auto-approving accounts.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: COMPLETED & DOWNLOAD CREDENTIALS PASS */}
          {step === "completed" && summary && (
            <div className="space-y-5 py-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-emerald-600 text-white shrink-0">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-emerald-950 font-display">
                    ESDP Bulk Registration Completed!
                  </h3>
                  <p className="text-xs text-emerald-800">
                    Accounts have been registered and auto-approved. Participants can now sign in using their Mobile Number or Email Address with their Default Password.
                  </p>
                </div>
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-card p-3 text-center">
                  <div className="text-xs text-muted-foreground font-medium">Total Processed</div>
                  <div className="text-2xl font-bold font-display mt-0.5">{summary.total}</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center">
                  <div className="text-xs text-emerald-800 font-medium">Accounts Created</div>
                  <div className="text-2xl font-bold font-display text-emerald-700 mt-0.5">
                    {summary.created}
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <div className="text-xs text-muted-foreground font-medium">Already Registered</div>
                  <div className="text-2xl font-bold font-display text-muted-foreground mt-0.5">
                    {summary.duplicates}
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <div className="text-xs text-muted-foreground font-medium">Held / Failed</div>
                  <div className="text-2xl font-bold font-display text-destructive mt-0.5">
                    {summary.failed}
                  </div>
                </div>
              </div>

              {/* Results Table */}
              <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Participant</TableHead>
                      <TableHead>Assigned ID</TableHead>
                      <TableHead>Mobile / Email</TableHead>
                      <TableHead>Default Password</TableHead>
                      <TableHead className="text-right">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow key={r.serialNo}>
                        <TableCell className="text-center font-mono text-xs">{r.serialNo}</TableCell>
                        <TableCell className="font-medium text-xs">{r.fullName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {r.participantCode}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {r.phone} / {r.email}
                        </TableCell>
                        <TableCell>
                          <code className="bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-xs border border-emerald-200">
                            {r.password}
                          </code>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === "created" ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">
                              Created
                            </Badge>
                          ) : r.status === "duplicate" ? (
                            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 text-[10px]">
                              Duplicate
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          {step === "preview" && (
            <>
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{validCount}</span> of {participants.length} participants ready for registration.
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="w-full sm:w-auto text-xs"
                >
                  Cancel
                </Button>
                {invalidCount > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleBulkRegister(true)}
                    disabled={validCount === 0 || isSubmitting}
                    className="w-full sm:w-auto text-xs font-semibold text-teal-800 border-teal-300 hover:bg-teal-50"
                  >
                    Register Valid ({validCount})
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => handleBulkRegister(false)}
                  disabled={validCount === 0 || isSubmitting}
                  className="w-full sm:w-auto text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white gap-1.5"
                >
                  <Users className="h-3.5 w-3.5" />
                  {invalidCount === 0
                    ? `Register All Participants (${participants.length})`
                    : `Register All Valid (${validCount})`}
                </Button>
              </div>
            </>
          )}

          {step === "completed" && (
            <>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                All participants auto-approved and authorized for attendance.
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyAll}
                  className="w-full sm:w-auto text-xs gap-1.5 font-semibold"
                >
                  {copiedAll ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedAll ? "Copied All Credentials!" : "Copy All Credentials"}
                </Button>

                <Button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="w-full sm:w-auto text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 cursor-pointer"
                >
                  {downloadingPdf ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  {downloadingPdf ? "Generating PDF…" : "Download ESDP Credentials PDF"}
                </Button>

                <Button
                  type="button"
                  onClick={handleClose}
                  className="w-full sm:w-auto text-xs font-semibold"
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
