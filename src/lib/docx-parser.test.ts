import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { parseEsdpDocx, validateEsdpParticipant, DEFAULT_ESDP_PARTICIPANTS } from "./docx-parser";

describe("ESDP Word Document Parser & Participant Validator", () => {
  it("has exactly 30 participants in default ESDP list", () => {
    expect(DEFAULT_ESDP_PARTICIPANTS.length).toBe(30);
  });

  it("parses the actual uploaded ESDP .docx file if available", () => {
    const docxPath =
      "C:\\Users\\Dell\\.gemini\\antigravity\\brain\\5d429e85-159d-481b-aa88-7e2e137eeb14\\.user_uploaded\\media_1793630466989_2f3254d3.docx";

    if (!existsSync(docxPath)) {
      console.warn("Docx file not present at path, skipping direct file parse.");
      return;
    }

    const buf = readFileSync(docxPath);
    const result = parseEsdpDocx(buf);

    expect(result.total).toBe(30);
    // 28 valid, 2 invalid (Abuzar with scientific notation & Sanjay with missing email)
    expect(result.validCount).toBe(28);
    expect(result.invalidCount).toBe(2);

    // Check Row 1: Nandha.S
    const nandha = result.participants[0]!;
    expect(nandha.fullName).toBe("Nandha.S");
    expect(nandha.phone).toBe("8610376037");
    expect(nandha.email).toBe("snandha1305@gmail.com");
    expect(nandha.defaultPassword).toBe("Nand8610");
    expect(nandha.isValid).toBe(true);

    // Check Row 13: K Mohammad Abuzar (scientific notation flagged)
    const abuzar = result.participants[12]!;
    expect(abuzar.fullName).toBe("K Mohammad Abuzar");
    expect(abuzar.phone).toBe("9.18439E+11");
    expect(abuzar.isValid).toBe(false);
    expect(abuzar.isScientificNotation).toBe(true);
    expect(abuzar.defaultPassword).toBe(""); // Password not generated for invalid phone

    // Check Row 24: Sanjay (missing email flagged)
    const sanjay = result.participants[23]!;
    expect(sanjay.fullName).toBe("Sanjay");
    expect(sanjay.phone).toBe("9043813567");
    expect(sanjay.email).toBe("");
    expect(sanjay.isValid).toBe(false);
    expect(sanjay.validationError).toContain("Email address is missing");
  });

  it("allows correcting flagged records and successfully validates them", () => {
    // When administrator provides the missing mobile number for Abuzar
    const correctedAbuzar = validateEsdpParticipant({
      id: "test-abuzar",
      serialNo: 13,
      fullName: "K Mohammad Abuzar",
      age: "25",
      category: "General",
      phone: "8439123456", // Corrected real mobile number
      email: "acroabuzar@gmail.com",
    });

    expect(correctedAbuzar.isValid).toBe(true);
    expect(correctedAbuzar.defaultPassword).toBe("KMoh8439");

    // When administrator provides the missing email for Sanjay
    const correctedSanjay = validateEsdpParticipant({
      id: "test-sanjay",
      serialNo: 24,
      fullName: "Sanjay",
      age: "24",
      category: "OBC",
      phone: "9043813567",
      email: "sanjay24@gmail.com", // Corrected email
    });

    expect(correctedSanjay.isValid).toBe(true);
    expect(correctedSanjay.defaultPassword).toBe("Sanj9043");
  });
});

