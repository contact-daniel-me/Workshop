import { unzipSync } from "fflate";
import { normalizePhone, INDIAN_PHONE } from "./attendance";
import { generateDefaultStudentPassword } from "./auth-helpers";

export interface ParsedEsdpParticipant {
  id: string; // Temporary client-side UUID
  serialNo: number;
  fullName: string;
  age: string;
  category: string;
  phone: string;
  email: string;
  defaultPassword: string;
  isValid: boolean;
  validationError: string | null;
  isScientificNotation: boolean;
  isDuplicate: boolean;
}

export interface ParseEsdpDocxResult {
  total: number;
  validCount: number;
  invalidCount: number;
  participants: ParsedEsdpParticipant[];
  warnings: string[];
}

/**
 * Normalizes strings extracted from Word XML cells, cleaning excessive whitespace and line breaks.
 */
function cleanCellText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\u00A0/g, " ") // Non-breaking space
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validates an extracted ESDP participant record.
 */
export function validateEsdpParticipant(
  p: Omit<ParsedEsdpParticipant, "defaultPassword" | "isValid" | "validationError" | "isScientificNotation" | "isDuplicate">,
  existingPhones: Set<string> = new Set(),
  existingEmails: Set<string> = new Set()
): {
  isValid: boolean;
  validationError: string | null;
  defaultPassword: string;
  isScientificNotation: boolean;
  isDuplicate: boolean;
} {
  const cleanName = cleanCellText(p.fullName);
  const rawPhone = cleanCellText(p.phone);
  const cleanEmail = cleanCellText(p.email).toLowerCase();

  const isScientificNotation = /[0-9]+\.?[0-9]*[eE][+-]?[0-9]+/.test(rawPhone);

  if (!cleanName || cleanName.length < 2) {
    return {
      isValid: false,
      validationError: "Full name is missing or too short.",
      defaultPassword: "",
      isScientificNotation: false,
      isDuplicate: false,
    };
  }

  if (isScientificNotation) {
    return {
      isValid: false,
      validationError: `Scientific notation detected (${rawPhone}). Digits are truncated. Enter 10-digit mobile number.`,
      defaultPassword: "",
      isScientificNotation: true,
      isDuplicate: false,
    };
  }

  const normalizedPhone = normalizePhone(rawPhone);
  if (!normalizedPhone || !INDIAN_PHONE.test(normalizedPhone)) {
    return {
      isValid: false,
      validationError: "Invalid mobile number. 10 valid digits required.",
      defaultPassword: "",
      isScientificNotation: false,
      isDuplicate: false,
    };
  }

  if (!cleanEmail) {
    return {
      isValid: false,
      validationError: "Email address is missing.",
      defaultPassword: "",
      isScientificNotation: false,
      isDuplicate: false,
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      isValid: false,
      validationError: "Invalid email address format.",
      defaultPassword: "",
      isScientificNotation: false,
      isDuplicate: false,
    };
  }

  if (existingPhones.has(normalizedPhone)) {
    return {
      isValid: false,
      validationError: `Duplicate mobile number (${normalizedPhone}) in list.`,
      defaultPassword: "",
      isScientificNotation: false,
      isDuplicate: true,
    };
  }

  if (existingEmails.has(cleanEmail)) {
    return {
      isValid: false,
      validationError: `Duplicate email address (${cleanEmail}) in list.`,
      defaultPassword: "",
      isScientificNotation: false,
      isDuplicate: true,
    };
  }

  // All fields valid — generate default password
  const defaultPassword = generateDefaultStudentPassword(cleanName, normalizedPhone);

  return {
    isValid: true,
    validationError: null,
    defaultPassword,
    isScientificNotation: false,
    isDuplicate: false,
  };
}

/**
 * Parses an ESDP participant list Word document (.docx buffer).
 * Supports multiline names, extracts all columns, flags scientific notation and missing emails.
 */
export function parseEsdpDocx(buffer: ArrayBuffer | Uint8Array): ParseEsdpDocxResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const unzipped = unzipSync(bytes);

  const docXmlBytes = unzipped["word/document.xml"];
  if (!docXmlBytes) {
    throw new Error("Invalid Word document: word/document.xml not found.");
  }

  const xml = new TextDecoder("utf-8").decode(docXmlBytes);

  // Split XML into table rows and cells cleanly
  const trBlocks = xml.split("</w:tr>");
  const rawRows: string[][] = [];

  for (const tr of trBlocks) {
    if (!tr.includes("<w:tr")) continue;
    const tcBlocks = tr.split("</w:tc>");
    const cells: string[] = [];
    for (const tc of tcBlocks) {
      if (!tc.includes("<w:tc")) continue;
      const text = tc
        .replace(/<[^>]+>/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      cells.push(text);
    }
    if (cells.some((c) => c.length > 0)) {
      rawRows.push(cells);
    }
  }

  if (rawRows.length <= 1) {
    throw new Error("No participant data table found in Word document.");
  }

  // Check header row (row 0)
  const header = rawRows[0]!.map((c) => c.toLowerCase());
  let nameIdx = header.findIndex((h) => h.includes("name"));
  let ageIdx = header.findIndex((h) => h.includes("age"));
  let catIdx = header.findIndex((h) => h.includes("category"));
  let phoneIdx = header.findIndex((h) => h.includes("mobile") || h.includes("phone"));
  let emailIdx = header.findIndex((h) => h.includes("email"));

  // Fallback default column indices if headers weren't named identically
  if (nameIdx === -1) nameIdx = 1;
  if (ageIdx === -1) ageIdx = 2;
  if (catIdx === -1) catIdx = 3;
  if (phoneIdx === -1) phoneIdx = 4;
  if (emailIdx === -1) emailIdx = 5;

  const participants: ParsedEsdpParticipant[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const warnings: string[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i]!;
    const serialNo = i;
    const fullName = cleanCellText(row[nameIdx] ?? "");
    const age = cleanCellText(row[ageIdx] ?? "");
    const category = cleanCellText(row[catIdx] ?? "General");
    const phone = cleanCellText(row[phoneIdx] ?? "");
    const email = cleanCellText(row[emailIdx] ?? "");

    const baseRecord = {
      id: `esdp-row-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serialNo,
      fullName,
      age,
      category,
      phone,
      email,
    };

    const validation = validateEsdpParticipant(baseRecord, seenPhones, seenEmails);

    if (validation.isValid) {
      seenPhones.add(normalizePhone(phone));
      seenEmails.add(email.toLowerCase());
    } else {
      warnings.push(`Row ${serialNo} (${fullName || "Unknown"}): ${validation.validationError}`);
    }

    participants.push({
      ...baseRecord,
      ...validation,
    });
  }

  const validCount = participants.filter((p) => p.isValid).length;
  const invalidCount = participants.length - validCount;

  return {
    total: participants.length,
    validCount,
    invalidCount,
    participants,
    warnings,
  };
}

/**
 * Built-in standard ESDP 30-participant dataset provided in the course brief.
 * Allows quick one-click loading in the admin dashboard.
 */
export const DEFAULT_ESDP_PARTICIPANTS: Array<{
  serialNo: number;
  fullName: string;
  age: string;
  category: string;
  phone: string;
  email: string;
}> = [
  { serialNo: 1, fullName: "Nandha.S", age: "23", category: "General", phone: "8610376037", email: "snandha1305@gmail.com" },
  { serialNo: 2, fullName: "Surendhar M", age: "21", category: "SC", phone: "7558199742", email: "surendharappu237@gmail.com" },
  { serialNo: 3, fullName: "R KARTHICK", age: "35", category: "SC", phone: "9751603674", email: "karthickjoy6643@gmail.com" },
  { serialNo: 4, fullName: "Priyanka M", age: "32", category: "General", phone: "9952075502", email: "priyankanspjsrm@gmail.com" },
  { serialNo: 5, fullName: "Jailabdeen.B", age: "37", category: "General", phone: "9444982786", email: "Jailabdeen1989@gmail.com" },
  { serialNo: 6, fullName: "DEEPAK P", age: "20", category: "SC", phone: "9487350306", email: "deepak.work006@gmail.com" },
  { serialNo: 7, fullName: "Gandh. D", age: "33", category: "SC", phone: "9159934257", email: "aadarshgandhi2016@gmail.com" },
  { serialNo: 8, fullName: "S Ruban", age: "26", category: "OBC", phone: "9025499373", email: "heyiamruban@gmail.com" },
  { serialNo: 9, fullName: "Selvakumar. D", age: "47", category: "SC", phone: "7448823435", email: "kskselva1010@gmail.com" },
  { serialNo: 10, fullName: "K.Esa", age: "19", category: "OBC", phone: "8300789710", email: "dawlathk487@gmail.com" },
  { serialNo: 11, fullName: "Kathiravan Dhasarathan", age: "30", category: "SC", phone: "8760603581", email: "kathiravanda95@gmail.com" },
  { serialNo: 12, fullName: "Mohammed Aathif", age: "21", category: "SC", phone: "7639338969", email: "aathifmd3@gmail.com" },
  { serialNo: 13, fullName: "K Mohammad Abuzar", age: "25", category: "General", phone: "9.18439E+11", email: "acroabuzar@gmail.com" },
  { serialNo: 14, fullName: "S. Prakash", age: "26", category: "OBC", phone: "7806831488", email: "Prakashprakashgilla@gmail.com" },
  { serialNo: 15, fullName: "D Navaj", age: "41", category: "OBC", phone: "9849016240", email: "husnanawaz2012@gmail.com" },
  { serialNo: 16, fullName: "Imaduddin A", age: "29", category: "OBC", phone: "8778587846", email: "imadofficial175@gmail.com" },
  { serialNo: 17, fullName: "Rahamath. N", age: "35", category: "OBC", phone: "9790165916", email: "myfamilybuggy91@gmail.com" },
  { serialNo: 18, fullName: "B.karthi", age: "24", category: "SC", phone: "8220308715", email: "mohanabalaram49@gmail.com" },
  { serialNo: 19, fullName: "Monisha B", age: "26", category: "SC", phone: "7904729950", email: "monis5680@gmail.com" },
  { serialNo: 20, fullName: "Kishore N", age: "36", category: "SC", phone: "9092239061", email: "arunkishore1991@gmail.com" },
  { serialNo: 21, fullName: "Syed Afzal Hussaini N", age: "23", category: "OBC", phone: "7868092209", email: "hussainiafzal226@gmail.com" },
  { serialNo: 22, fullName: "ABDUL SAMAD M", age: "20", category: "General", phone: "9092934793", email: "abdulsamad79028@gmail.com" },
  { serialNo: 23, fullName: "P Ajay", age: "20", category: "General", phone: "9047098575", email: "pajay0077a@gmail.com" },
  { serialNo: 24, fullName: "Sanjay", age: "24", category: "OBC", phone: "9043813567", email: "" },
  { serialNo: 25, fullName: "Thirunavukkarasu. J", age: "43", category: "OBC", phone: "9942244838", email: "arasu.vpk@gmail.com" },
  { serialNo: 26, fullName: "Vignesh G", age: "28", category: "OBC", phone: "9944039403", email: "vickycivil077@gmail.com" },
  { serialNo: 27, fullName: "Murali.D", age: "29", category: "General", phone: "6382120408", email: "muralid05051997@gmail.com" },
  { serialNo: 28, fullName: "Mohammed Huzaifa", age: "23", category: "General", phone: "9944571403", email: "gmhuzaifa2003@gmail.com" },
  { serialNo: 29, fullName: "Kumaran", age: "49", category: "OBC", phone: "7010475485", email: "skumaran_77@yahoo.com" },
  { serialNo: 30, fullName: "Parthasarathy Thamodharan", age: "32", category: "MBC", phone: "8122778870", email: "perumal7573@gmail.com" },
];
