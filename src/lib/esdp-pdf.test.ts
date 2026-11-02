import { describe, it, expect } from "vitest";
import { buildEsdpCredentialsPdf, type EsdpCredentialEntry } from "./esdp-pdf";
import { DEFAULT_ESDP_PARTICIPANTS } from "./docx-parser";
import { generateDefaultStudentPassword } from "./auth-helpers";

describe("ESDP Credentials PDF Pass Generation", () => {
  it("generates a multi-page PDF document for all 30 ESDP participants", async () => {
    const participants: EsdpCredentialEntry[] = DEFAULT_ESDP_PARTICIPANTS.map((p) => ({
      serialNo: p.serialNo,
      fullName: p.fullName,
      participantCode: `SA-2026-${String(p.serialNo).padStart(4, "0")}`,
      phone: p.phone,
      email: p.email || "pending@example.com",
      rawPassword: p.phone.includes("E+")
        ? "PENDING"
        : generateDefaultStudentPassword(p.fullName, p.phone),
      status: p.email && !p.phone.includes("E+") ? "success" : "failed",
      error: !p.email ? "Missing email" : p.phone.includes("E+") ? "Scientific notation" : undefined,
    }));

    const doc = await buildEsdpCredentialsPdf({
      workshopName: "Entrepreneurship and Skill Development Programme (ESDP)",
      issuedAt: "November 2, 2026",
      portalUrl: "http://localhost:3000",
      totalRecords: 30,
      successCount: 28,
      failedCount: 2,
      participants,
    });

    expect(doc).toBeDefined();
    // 30 participants with 17 rows/page should span 2 pages
    expect(doc.getNumberOfPages()).toBe(2);

    const pdfBuffer = doc.output("arraybuffer");
    expect(pdfBuffer.byteLength).toBeGreaterThan(1000);
  });

  it("handles empty or single participant lists gracefully", async () => {
    const doc = await buildEsdpCredentialsPdf({
      totalRecords: 1,
      successCount: 1,
      failedCount: 0,
      participants: [
        {
          serialNo: 1,
          fullName: "Daniel",
          participantCode: "SA-2026-0001",
          phone: "9876543210",
          email: "daniel@example.com",
          rawPassword: "Dani9876",
          status: "success",
        },
      ],
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });
});
