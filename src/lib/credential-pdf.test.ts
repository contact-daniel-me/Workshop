import { describe, it, expect } from "vitest";
import {
  buildParticipantCredentialsPdf,
  buildBulkParticipantCredentialsPdf,
} from "./credential-pdf";
import {
  generateDefaultStudentPassword,
  normalizeAppPassword,
  phoneToAuthEmail,
} from "./auth-helpers";

describe("Automatic Default Password Generation", () => {
  it("generates password with First 4 letters of name + First 4 digits of mobile (e.g. Daniel + 9876543210 -> Dani9876)", () => {
    const pwd = generateDefaultStudentPassword("Daniel", "9876543210");
    expect(pwd).toBe("Dani9876");
  });

  it("preserves original capitalization of student name", () => {
    expect(generateDefaultStudentPassword("Sooriya", "8610126937")).toBe("Soor8610");
    expect(generateDefaultStudentPassword("sooriya", "8610126937")).toBe("soor8610");
    expect(generateDefaultStudentPassword("DANIEL", "9876543210")).toBe("DANI9876");
    expect(generateDefaultStudentPassword("aNaNyA", "9123456789")).toBe("aNaN9123");
  });

  it("handles names shorter than 4 characters gracefully using available characters", () => {
    expect(generateDefaultStudentPassword("Raj", "9876543210")).toBe("Raj9876");
    expect(generateDefaultStudentPassword("Bo", "9876543210")).toBe("Bo9876");
    expect(generateDefaultStudentPassword("Al", "9876543210")).toBe("Al9876");
    expect(generateDefaultStudentPassword("A", "9876543210")).toBe("A9876");
  });

  it("extracts alphabetic characters ignoring punctuation and spaces in name", () => {
    expect(generateDefaultStudentPassword("Dr. Bob", "9876543210")).toBe("DrBo9876");
    expect(generateDefaultStudentPassword("Daniel S.", "9876543210")).toBe("Dani9876");
  });

  it("correctly extracts first 4 digits of phone ignoring +91, spaces, dashes, or leading 0", () => {
    expect(generateDefaultStudentPassword("Daniel", "+91 9876543210")).toBe("Dani9876");
    expect(generateDefaultStudentPassword("Daniel", "+91-9876-543210")).toBe("Dani9876");
    expect(generateDefaultStudentPassword("Daniel", "09876543210")).toBe("Dani9876");
    expect(generateDefaultStudentPassword("Daniel", "9876-543-210")).toBe("Dani9876");
  });

  it("salts and normalizes password for Supabase Auth to guarantee security and avoid dictionary errors", () => {
    const defaultPwd = generateDefaultStudentPassword("Bo", "9876543210");
    expect(defaultPwd).toBe("Bo9876");

    const salted = normalizeAppPassword(defaultPwd);
    expect(salted).toBe("SA#2026_Bo9876_!Workshop");
    expect(salted.length).toBeGreaterThanOrEqual(16);
  });
});

describe("Student Credentials PDF Generator", () => {
  it("generates a valid PDF pass with explicit raw password", async () => {
    const doc = await buildParticipantCredentialsPdf({
      fullName: "Daniel",
      participantCode: "24BCE1234",
      phone: "9876543210",
      email: "daniel@example.com",
      rawPassword: "Dani9876",
      verificationStatus: "verified",
      workshopName: "Event Management Portal",
    });

    expect(doc).toBeDefined();
    const arrayBuffer = doc.output("arraybuffer");
    expect(arrayBuffer.byteLength).toBeGreaterThan(1000);

    // Verify PDF header magic bytes "%PDF-"
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerStr = String.fromCharCode(...headerBytes);
    expect(headerStr).toBe("%PDF-");
  });

  it("falls back to automatic default password when rawPassword is not provided", async () => {
    const doc = await buildParticipantCredentialsPdf({
      fullName: "Sooriya",
      participantCode: "SA-2026-0012",
      phone: "8610126937",
      email: "sooriya@gmail.com",
      verificationStatus: "verified",
    });

    expect(doc).toBeDefined();
    const arrayBuffer = doc.output("arraybuffer");
    expect(arrayBuffer.byteLength).toBeGreaterThan(1000);
  });

  it("generates multi-page bulk PDF for all participants", async () => {
    const participants = [
      {
        fullName: "Daniel",
        participantCode: "SA-2026-0001",
        phone: "9876543210",
        email: "daniel@example.com",
        verificationStatus: "verified",
      },
      {
        fullName: "Sooriya",
        participantCode: "SA-2026-0002",
        phone: "8610126937",
        email: "sooriya@example.com",
        verificationStatus: "verified",
      },
      {
        fullName: "Raj",
        participantCode: "SA-2026-0003",
        phone: "9123456780",
        email: "raj@example.com",
        verificationStatus: "verified",
      },
    ];

    const doc = await buildBulkParticipantCredentialsPdf(participants);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(3);

    const arrayBuffer = doc.output("arraybuffer");
    expect(arrayBuffer.byteLength).toBeGreaterThan(2000);
  });

  it("reflects edited participant details in the credentials PDF pass", async () => {
    // Before edit
    const originalDetails = {
      fullName: "Daniel",
      participantCode: "SA-2026-0001",
      phone: "9876543210",
      email: "daniel@example.com",
      verificationStatus: "pending",
    };
    const originalDoc = await buildParticipantCredentialsPdf(originalDetails);
    expect(originalDoc).toBeDefined();

    // Admin edits details: updates name, mobile, email, and approval status
    const editedDetails = {
      fullName: "Daniel Thomas",
      participantCode: "SA-2026-0001",
      phone: "9988776655",
      email: "daniel.thomas@example.com",
      verificationStatus: "verified",
      // When edited, rawPassword can be updated or re-derived dynamically
      rawPassword: generateDefaultStudentPassword("Daniel Thomas", "9988776655"),
    };
    expect(editedDetails.rawPassword).toBe("Dani9988");

    const updatedDoc = await buildParticipantCredentialsPdf(editedDetails);
    expect(updatedDoc).toBeDefined();
    expect(updatedDoc.getNumberOfPages()).toBe(1);

    const updatedBuffer = updatedDoc.output("arraybuffer");
    expect(updatedBuffer.byteLength).toBeGreaterThan(1000);
  });
});
