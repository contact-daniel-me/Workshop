import { describe, it, expect } from "vitest";
import { buildParticipantCredentialsPdf } from "./credential-pdf";

describe("Participant Credentials PDF Generator", () => {
  it("generates a valid PDF document with participant credentials", async () => {
    const doc = await buildParticipantCredentialsPdf({
      fullName: "Sooriya",
      participantCode: "SA-2026-0012",
      phone: "8610126937",
      email: "sooriya@gmail.com",
      rawPassword: "Sooriya123@",
      verificationStatus: "pending",
      workshopName: "Workshop Attendance Portal",
      portalUrl: "https://workshop.example.com/auth",
    });

    expect(doc).toBeDefined();
    const arrayBuffer = doc.output("arraybuffer");
    expect(arrayBuffer.byteLength).toBeGreaterThan(1000);

    // Verify PDF header magic bytes "%PDF-"
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerStr = String.fromCharCode(...headerBytes);
    expect(headerStr).toBe("%PDF-");
  });

  it("handles verified status and fallback values gracefully", async () => {
    const doc = await buildParticipantCredentialsPdf({
      fullName: "Daniel S",
      participantCode: "SA-2026-0003",
      phone: "9943023522",
      email: "daniel@gmail.com",
      rawPassword: "SecurePassword123!",
      verificationStatus: "verified",
    });

    expect(doc).toBeDefined();
    const arrayBuffer = doc.output("arraybuffer");
    expect(arrayBuffer.byteLength).toBeGreaterThan(1000);
  });
});
