import { jsPDF } from "jspdf";
import { generateDefaultStudentPassword } from "./auth-helpers";

export interface ParticipantCredentialPdfData {
  fullName: string;
  participantCode: string;
  email: string;
  phone: string;
  rawPassword?: string;
  verificationStatus: string;
  photoUrl?: string | null;
  workshopName?: string;
  portalUrl?: string;
  issuedAt?: string;
}

/**
 * Converts an image URL into a base64 Data URL safely for jsPDF embedding
 */
async function toDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Renders a single official participant credential pass page on the given jsPDF document.
 */
export async function renderParticipantCredentialPage(
  doc: jsPDF,
  data: ParticipantCredentialPdfData,
  pageNumber: number = 1,
  totalPages: number = 1
): Promise<void> {
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const brandDark = [4, 47, 46]; // #042f2e deep teal
  const brandPrimary = [13, 148, 136]; // #0d9488 teal
  const emeraldAccent = [16, 185, 129]; // #10b981
  const bgLight = [248, 250, 252]; // #f8fafc slate-50
  const borderLight = [226, 232, 240]; // #e2e8f0 slate-200
  const textDark = [15, 23, 42]; // #0f172a slate-900
  const textMuted = [100, 116, 139]; // #64748b slate-500

  // Fallback to automatic default student password if rawPassword is not provided
  const displayPassword =
    data.rawPassword || generateDefaultStudentPassword(data.fullName, data.phone);

  // 1. TOP HEADER BANNER
  doc.setFillColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
  doc.rect(0, 0, pageWidth, 40, "F");

  // Top accent stripe
  doc.setFillColor(emeraldAccent[0]!, emeraldAccent[1]!, emeraldAccent[2]!);
  doc.rect(0, 40, pageWidth, 2.5, "F");

  // Header Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(data.workshopName || "EVENT MANAGEMENT PORTAL", margin, 17);

  // Header Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(167, 243, 208); // light emerald
  doc.text("Official Student Account & Login Credentials Pass", margin, 25);

  // Timestamp on right
  const now = data.issuedAt || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  doc.setFontSize(8);
  doc.setTextColor(204, 251, 241);
  doc.text(`Issued: ${now} IST`, pageWidth - margin, 25, { align: "right" });

  // Document Badge
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - margin - 38, 9, 38, 7, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
  doc.text("OFFICIAL PASS", pageWidth - margin - 19, 13.8, { align: "center" });

  let y = 49;

  // 2. PARTICIPANT IDENTITY PROFILE CARD
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.roundedRect(margin, y, contentWidth, 42, 3, 3, "FD");

  // Participant Avatar / Photograph
  const avatarSize = 30;
  const avatarX = margin + 6;
  const avatarY = y + 6;

  let imageEmbedded = false;
  if (data.photoUrl) {
    try {
      const dataUrl = await toDataUrl(data.photoUrl);
      if (dataUrl) {
        doc.addImage(dataUrl, "JPEG", avatarX, avatarY, avatarSize, avatarSize);
        doc.setDrawColor(brandPrimary[0]!, brandPrimary[1]!, brandPrimary[2]!);
        doc.setLineWidth(0.6);
        doc.roundedRect(avatarX, avatarY, avatarSize, avatarSize, 2, 2, "D");
        imageEmbedded = true;
      }
    } catch {
      imageEmbedded = false;
    }
  }

  if (!imageEmbedded) {
    // Fallback Initial Avatar
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(avatarX, avatarY, avatarSize, avatarSize, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
    const initials = (data.fullName || "SA").slice(0, 2).toUpperCase();
    doc.text(initials, avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 5, { align: "center" });
  }

  // Identity Text details
  const textX = avatarX + avatarSize + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  doc.text(data.fullName || "Student Attendee", textX, y + 12);

  // Participant Code
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(brandPrimary[0]!, brandPrimary[1]!, brandPrimary[2]!);
  doc.text(`Registration No: ${data.participantCode}`, textX, y + 19);

  // Status Badge Pill
  const isApproved = (data.verificationStatus || "").toLowerCase() === "verified";
  const statusText = isApproved ? "APPROVED ATTENDEE" : "REGISTRATION PENDING";
  const badgeWidth = isApproved ? 38 : 44;
  const badgeColor = isApproved ? [16, 185, 129] : [217, 119, 6];

  doc.setFillColor(badgeColor[0]!, badgeColor[1]!, badgeColor[2]!);
  doc.roundedRect(textX, y + 24, badgeWidth, 5.5, 1.2, 1.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(statusText, textX + badgeWidth / 2, y + 27.8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text(`Workshop: ${data.workshopName || "Workshop Attendance Portal"}`, textX, y + 36);

  y += 50;

  // 3. STUDENT LOGIN CREDENTIALS SECTION
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
  doc.text("STUDENT LOGIN CREDENTIALS", margin, y);

  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 2.5, pageWidth - margin, y + 2.5);

  y += 7;

  // 2-Column Credentials Grid
  const colWidth = (contentWidth - 6) / 2;
  const cardHeight = 22;

  // Row 1: Student Name & Registration Number
  // Box 1A: Student Name
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.roundedRect(margin, y, colWidth, cardHeight, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("STUDENT NAME", margin + 4, y + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  const cleanNameDisplay = data.fullName.length > 24 ? data.fullName.slice(0, 22) + "…" : data.fullName;
  doc.text(cleanNameDisplay, margin + 4, y + 13.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("Registered attendee name", margin + 4, y + 18.5);

  // Box 1B: Registration Number
  const col2X = margin + colWidth + 6;
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.roundedRect(col2X, y, colWidth, cardHeight, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("REGISTRATION NUMBER", col2X + 4, y + 5.5);

  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.setTextColor(brandPrimary[0]!, brandPrimary[1]!, brandPrimary[2]!);
  doc.text(data.participantCode, col2X + 4, y + 13.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("Unique workshop identification code", col2X + 4, y + 18.5);

  y += cardHeight + 4;

  // Row 2: Registered Mobile Number & Registered Email Address
  // Box 2A: Registered Mobile Number
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.roundedRect(margin, y, colWidth, cardHeight, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("REGISTERED MOBILE NUMBER (PRIMARY LOGIN)", margin + 4, y + 5.5);

  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  doc.text(data.phone || "Not provided", margin + 4, y + 13.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("Enter 10-digit mobile number to log in", margin + 4, y + 18.5);

  // Box 2B: Registered Email Address
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.roundedRect(col2X, y, colWidth, cardHeight, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("REGISTERED EMAIL ADDRESS", col2X + 4, y + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  const emailText = data.email.length > 27 ? data.email.slice(0, 25) + "…" : data.email;
  doc.text(emailText, col2X + 4, y + 13.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("Alternate login identifier", col2X + 4, y + 18.5);

  y += cardHeight + 5;

  // Row 3: DEFAULT LOGIN PASSWORD HIGHLIGHT BOX (Full width emerald card)
  const pwdBoxHeight = 31;
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(emeraldAccent[0]!, emeraldAccent[1]!, emeraldAccent[2]!);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, contentWidth, pwdBoxHeight, 3, 3, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text("DEFAULT LOGIN PASSWORD", margin + 5, y + 7.5);

  // Password Confidentiality Badge
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(209, 250, 229);
  doc.roundedRect(pageWidth - margin - 40, y + 3.5, 36, 6, 1, 1, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(4, 120, 87);
  doc.text("CONFIDENTIAL PASS", pageWidth - margin - 22, y + 7.5, { align: "center" });

  // Big Bold Monospace Password
  doc.setFont("courier", "bold");
  doc.setFontSize(17);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  doc.text(displayPassword, margin + 5, y + 18);

  // Password Formula Explanation
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text(
    "Format: First 4 letters of name + First 4 digits of mobile. Case-sensitive. Please change upon first login.",
    margin + 5,
    y + 26
  );

  y += pwdBoxHeight + 5;

  // LOGIN PORTAL URL BOX
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 18, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("OFFICIAL ATTENDANCE PORTAL LOGIN URL", margin + 5, y + 5.5);

  const loginUrl =
    data.portalUrl || (typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth");
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.setTextColor(brandPrimary[0]!, brandPrimary[1]!, brandPrimary[2]!);
  doc.text(loginUrl, margin + 5, y + 13);

  y += 24;

  // 4. SIGN-IN INSTRUCTIONS & STEP-BY-STEP CHECKLIST
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
  doc.text("HOW TO SIGN IN & ACCESS ATTENDANCE", margin, y);

  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.line(margin, y + 2, pageWidth - margin, y + 2);

  y += 7;

  const steps = [
    {
      num: "1",
      title: "Open Attendance Portal",
      desc: "Navigate to the Login URL on your mobile phone browser or computer.",
    },
    {
      num: "2",
      title: "Enter Mobile / Email & Password",
      desc: "Type your registered mobile number or email, followed by the default password above.",
    },
    {
      num: "3",
      title: "Display Your Daily Attendance QR",
      desc: "Once signed in, present your dynamic daily QR pass to the administrator to record attendance.",
    },
    {
      num: "4",
      title: "Update Password After Initial Login",
      desc: "For security, visit your student dashboard and select 'Change Password' to set your private password.",
    },
  ];

  steps.forEach((step, idx) => {
    const stepY = y + idx * 10;

    // Step Number Circle
    doc.setFillColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
    doc.circle(margin + 3, stepY + 1.5, 2.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(step.num, margin + 3, stepY + 2.5, { align: "center" });

    // Step text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
    doc.text(step.title, margin + 8, stepY + 1.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
    doc.text(step.desc, margin + 8, stepY + 4.8);
  });

  // 5. SECURITY BANNER AT BOTTOM
  const secY = pageHeight - 34;
  doc.setFillColor(254, 243, 199); // amber-100
  doc.setDrawColor(245, 158, 11); // amber-500
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, secY, contentWidth, 14, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(180, 83, 9); // amber-700
  doc.text("IMPORTANT SECURITY & PRIVACY NOTICE:", margin + 4, secY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(146, 64, 14);
  doc.text(
    "This document contains private student credentials. Never share passwords. Change default password on first login.",
    margin + 4,
    secY + 9.5
  );

  // 6. PAGE FOOTER
  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("Generated by Workshop Attendance System • GrowIOTA Innovations", margin, pageHeight - 8);
  doc.text(`Page ${pageNumber} of ${totalPages} • Official Student Credentials`, pageWidth - margin, pageHeight - 8, {
    align: "right",
  });
}

/**
 * Builds a professional single-participant PDF document containing student login credentials,
 * registration number, mobile & email login identifiers, and default password.
 */
export async function buildParticipantCredentialsPdf(
  data: ParticipantCredentialPdfData
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  await renderParticipantCredentialPage(doc, data, 1, 1);
  return doc;
}

/**
 * Generates and triggers automatic browser download of the participant credentials PDF
 */
export async function downloadParticipantCredentialsPdf(
  data: ParticipantCredentialPdfData,
  fileName?: string
): Promise<void> {
  const doc = await buildParticipantCredentialsPdf(data);
  const cleanCode = (data.participantCode || "student").replace(/[^a-zA-Z0-9_-]/g, "_");
  const finalFileName = fileName || `${cleanCode}_login_credentials.pdf`;
  doc.save(finalFileName);
}

/**
 * Builds a multi-page PDF document containing credentials for all specified participants.
 */
export async function buildBulkParticipantCredentialsPdf(
  participants: ParticipantCredentialPdfData[]
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  if (participants.length === 0) {
    return doc;
  }

  for (let i = 0; i < participants.length; i++) {
    if (i > 0) doc.addPage();
    await renderParticipantCredentialPage(doc, participants[i]!, i + 1, participants.length);
  }

  return doc;
}

/**
 * Generates and downloads a bulk multi-page PDF pass for all provided participants.
 */
export async function downloadBulkParticipantCredentialsPdf(
  participants: ParticipantCredentialPdfData[],
  fileName?: string
): Promise<void> {
  const doc = await buildBulkParticipantCredentialsPdf(participants);
  const finalFileName = fileName || `workshop_bulk_student_credentials_${Date.now()}.pdf`;
  doc.save(finalFileName);
}
