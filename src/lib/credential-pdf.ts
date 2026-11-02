import { jsPDF } from "jspdf";

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
 * Builds a professional, official PDF document containing participant login credentials,
 * mobile & email login identifiers, temporary password, and portal access instructions.
 */
export async function buildParticipantCredentialsPdf(
  data: ParticipantCredentialPdfData
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

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

  // 1. TOP HEADER BANNER
  doc.setFillColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
  doc.rect(0, 0, pageWidth, 42, "F");

  // Top accent stripe
  doc.setFillColor(emeraldAccent[0]!, emeraldAccent[1]!, emeraldAccent[2]!);
  doc.rect(0, 42, pageWidth, 2.5, "F");

  // Header Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(data.workshopName || "EVENT MANAGEMENT PORTAL", margin, 18);

  // Header Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(167, 243, 208); // light emerald
  doc.text("Official Participant Account & Login Credentials Pass", margin, 26);

  // Timestamp on right
  const now = data.issuedAt || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  doc.setFontSize(8.5);
  doc.setTextColor(204, 251, 241);
  doc.text(`Issued: ${now} IST`, pageWidth - margin, 26, { align: "right" });

  // Document Badge
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - margin - 38, 10, 38, 7, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
  doc.text("OFFICIAL PASS", pageWidth - margin - 19, 14.8, { align: "center" });

  let y = 52;

  // 2. PARTICIPANT IDENTITY PROFILE CARD
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.roundedRect(margin, y, contentWidth, 48, 3, 3, "FD");

  // Participant Avatar / Photograph
  const avatarSize = 34;
  const avatarX = margin + 6;
  const avatarY = y + 7;

  let imageEmbedded = false;
  if (data.photoUrl) {
    try {
      const dataUrl = await toDataUrl(data.photoUrl);
      if (dataUrl) {
        doc.addImage(dataUrl, "JPEG", avatarX, avatarY, avatarSize, avatarSize);
        // Draw avatar border
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
    doc.setFontSize(16);
    doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
    const initials = data.fullName.slice(0, 2).toUpperCase() || "SA";
    doc.text(initials, avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 5, { align: "center" });
  }

  // Identity Text details
  const textX = avatarX + avatarSize + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  doc.text(data.fullName, textX, y + 14);

  // Participant Code
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(brandPrimary[0]!, brandPrimary[1]!, brandPrimary[2]!);
  doc.text(`ID: ${data.participantCode}`, textX, y + 22);

  // Status Badge Pill
  const isApproved = data.verificationStatus.toLowerCase() === "verified";
  const statusText = isApproved ? "APPROVED ATTENDEE" : "REGISTRATION PENDING";
  const badgeWidth = isApproved ? 40 : 46;
  const badgeColor = isApproved ? [16, 185, 129] : [217, 119, 6];

  doc.setFillColor(badgeColor[0]!, badgeColor[1]!, badgeColor[2]!);
  doc.roundedRect(textX, y + 27, badgeWidth, 6, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(statusText, textX + badgeWidth / 2, y + 31.2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text(`Workshop: ${data.workshopName || "Workshop Attendance Portal"}`, textX, y + 40);

  y += 58;

  // 3. LOGIN CREDENTIALS SECTION
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
  doc.text("LOGIN CREDENTIALS & ACCESS DETAILS", margin, y);

  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 2.5, pageWidth - margin, y + 2.5);

  y += 8;

  // Two columns for Mobile Login and Email Login
  const colWidth = (contentWidth - 6) / 2;

  // Mobile Login Box
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.roundedRect(margin, y, colWidth, 25, 2.5, 2.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("MOBILE NUMBER (PRIMARY LOGIN)", margin + 4, y + 6);

  doc.setFont("courier", "bold");
  doc.setFontSize(13);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  doc.text(data.phone || "Not provided", margin + 4, y + 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("Enter 10-digit mobile number on sign in", margin + 4, y + 21);

  // Email Login Box
  const col2X = margin + colWidth + 6;
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.roundedRect(col2X, y, colWidth, 25, 2.5, 2.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("REGISTERED EMAIL ADDRESS", col2X + 4, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  const emailText = data.email.length > 28 ? data.email.slice(0, 26) + "…" : data.email;
  doc.text(emailText, col2X + 4, y + 14.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("Sign in with email or mobile phone seamlessly", col2X + 4, y + 21);

  y += 31;

  // TEMPORARY PASSWORD HIGHLIGHT BOX (Full width, eye-catching emerald card)
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(emeraldAccent[0]!, emeraldAccent[1]!, emeraldAccent[2]!);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, contentWidth, 32, 3, 3, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text("TEMPORARY LOGIN PASSWORD (ONE-TIME INITIAL DISPLAY)", margin + 5, y + 8);

  // Password Badge
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(209, 250, 229);
  doc.roundedRect(pageWidth - margin - 38, y + 4, 34, 6, 1, 1, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(4, 120, 87);
  doc.text("CONFIDENTIAL", pageWidth - margin - 21, y + 8.2, { align: "center" });

  // Big Bold Password
  doc.setFont("courier", "bold");
  doc.setFontSize(16);
  doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
  doc.text(data.rawPassword || "Set during registration", margin + 5, y + 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text(
    "Case-sensitive. Communicate this temporary password directly to the participant. Not stored in plaintext.",
    margin + 5,
    y + 27
  );

  y += 38;

  // LOGIN PORTAL URL BOX
  doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 20, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
  doc.text("OFFICIAL ATTENDANCE PORTAL LOGIN URL", margin + 5, y + 6);

  const loginUrl =
    data.portalUrl || (typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth");
  doc.setFont("courier", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(brandPrimary[0]!, brandPrimary[1]!, brandPrimary[2]!);
  doc.text(loginUrl, margin + 5, y + 14);

  y += 27;

  // 4. SIGN-IN INSTRUCTIONS & STEP-BY-STEP CHECKLIST
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
  doc.text("HOW TO SIGN IN & CHECK ATTENDANCE", margin, y);

  doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
  doc.line(margin, y + 2, pageWidth - margin, y + 2);

  y += 8;

  const steps = [
    {
      num: "1",
      title: "Open Attendance Portal",
      desc: "Navigate to the Login URL on your mobile phone browser or computer.",
    },
    {
      num: "2",
      title: "Enter Mobile / Email & Password",
      desc: "Type your 10-digit mobile number or email address, followed by the temporary password above.",
    },
    {
      num: "3",
      title: "Access Dynamic QR Attendance",
      desc: "Once signed in, your daily rotating attendance pass is immediately visible on your dashboard.",
    },
    {
      num: "4",
      title: "Change Your Password",
      desc: "For security, visit your profile settings after your first login to set a private password.",
    },
  ];

  steps.forEach((step, idx) => {
    const stepY = y + idx * 11.5;

    // Step Number Circle
    doc.setFillColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
    doc.circle(margin + 3.5, stepY + 1.5, 3.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(step.num, margin + 3.5, stepY + 2.6, { align: "center" });

    // Step text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
    doc.text(step.title, margin + 9, stepY + 1.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
    doc.text(step.desc, margin + 9, stepY + 5.2);
  });

  // 5. SECURITY BANNER AT BOTTOM
  const secY = pageHeight - 34;
  doc.setFillColor(254, 243, 199); // amber-100
  doc.setDrawColor(245, 158, 11); // amber-500
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, secY, contentWidth, 14, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9); // amber-700
  doc.text("IMPORTANT SECURITY & PRIVACY NOTICE:", margin + 4, secY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(146, 64, 14);
  doc.text(
    "This document contains private account credentials. Do not share your password. For questions, contact the workshop administrator.",
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
  doc.text("Page 1 of 1 • Official Credential Pass", pageWidth - margin, pageHeight - 8, {
    align: "right",
  });

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
  const cleanCode = data.participantCode.replace(/[^a-zA-Z0-9_-]/g, "_");
  const finalFileName = fileName || `${cleanCode}_login_credentials.pdf`;
  doc.save(finalFileName);
}
