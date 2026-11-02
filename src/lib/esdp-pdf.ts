import { jsPDF } from "jspdf";

export interface EsdpCredentialEntry {
  serialNo: number;
  fullName: string;
  participantCode: string; // e.g. SA-2026-0001
  phone: string;
  email: string;
  rawPassword: string; // Plaintext default password generated during registration
  status: "success" | "duplicate" | "failed";
  error?: string | null;
}

export interface EsdpPdfData {
  workshopName?: string;
  issuedAt?: string;
  portalUrl?: string;
  totalRecords: number;
  successCount: number;
  failedCount: number;
  pendingCount?: number;
  participants: EsdpCredentialEntry[];
}

/**
 * Builds a professional multi-page A4 PDF document titled:
 * "ESDP – Participant Login Credentials"
 * Contains a table of all registered participants, their IDs, login identifiers, and default passwords.
 */
export async function buildEsdpCredentialsPdf(data: EsdpPdfData): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const brandDark = [4, 47, 46]; // #042f2e deep teal
  const brandPrimary = [13, 148, 136]; // #0d9488 teal
  const emeraldAccent = [16, 185, 129]; // #10b981
  const bgLight = [248, 250, 252]; // #f8fafc slate-50
  const borderLight = [226, 232, 240]; // #e2e8f0 slate-200
  const textDark = [15, 23, 42]; // #0f172a slate-900
  const textMuted = [100, 116, 139]; // #64748b slate-500

  // Only include participants that succeeded
  const registeredParticipants = data.participants.filter(
    (p) => p.status === "success" || !p.status
  );

  const rowsPerPage = 17;
  const totalPages = Math.max(1, Math.ceil(registeredParticipants.length / rowsPerPage));

  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) {
      doc.addPage();
    }

    // 1. TOP HEADER BANNER
    doc.setFillColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
    doc.rect(0, 0, pageWidth, 36, "F");

    // Accent Stripe
    doc.setFillColor(emeraldAccent[0]!, emeraldAccent[1]!, emeraldAccent[2]!);
    doc.rect(0, 36, pageWidth, 2, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("ESDP – Participant Login Credentials", margin, 15);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(167, 243, 208);
    doc.text(
      "Entrepreneurship and Skill Development Programme • Official Batch Credentials",
      margin,
      22
    );

    // Timestamp & Badge
    const timestamp =
      data.issuedAt || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    doc.setFontSize(7.5);
    doc.setTextColor(204, 251, 241);
    doc.text(`Issued: ${timestamp} IST`, pageWidth - margin, 22, { align: "right" });

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - margin - 40, 8, 40, 6.5, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
    doc.text("CONFIDENTIAL PASS", pageWidth - margin - 20, 12.3, { align: "center" });

    let y = 44;

    // 2. REGISTRATION SUMMARY BAR (Only on Page 1)
    if (page === 1) {
      doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
      doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
      doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "FD");

      const boxW = contentWidth / 4;

      // Box 1: Total
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
      doc.text("TOTAL IMPORTED", margin + 5, y + 6);
      doc.setFontSize(12);
      doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
      doc.text(String(data.totalRecords), margin + 5, y + 14);

      // Box 2: Registered
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
      doc.text("SUCCESSFULLY CREATED", margin + boxW + 5, y + 6);
      doc.setFontSize(12);
      doc.setTextColor(16, 185, 129); // emerald
      doc.text(String(data.successCount), margin + boxW + 5, y + 14);

      // Box 3: Incomplete/Failed
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
      doc.text("EXCLUDED / INCOMPLETE", margin + boxW * 2 + 5, y + 6);
      doc.setFontSize(12);
      doc.setTextColor(data.failedCount > 0 ? 220 : 100, 38, 38);
      doc.text(String(data.failedCount), margin + boxW * 2 + 5, y + 14);

      // Box 4: Login URL
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
      doc.text("OFFICIAL PORTAL LOGIN", margin + boxW * 3 + 5, y + 6);
      doc.setFont("courier", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(brandPrimary[0]!, brandPrimary[1]!, brandPrimary[2]!);
      const shortUrl = (data.portalUrl || "smartattend.in/auth").replace(/^https?:\/\//, "");
      doc.text(shortUrl, margin + boxW * 3 + 5, y + 13.5);

      y += 24;
    } else {
      y += 4;
    }

    // 3. TABLE HEADER
    const colWidths = {
      sl: 9,
      name: 44,
      id: 30,
      phone: 28,
      email: 45,
      pwd: 26,
    };

    doc.setFillColor(brandDark[0]!, brandDark[1]!, brandDark[2]!);
    doc.rect(margin, y, contentWidth, 8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    let curX = margin;
    doc.text("#", curX + 2, y + 5.5);
    curX += colWidths.sl;
    doc.text("PARTICIPANT NAME", curX + 2, y + 5.5);
    curX += colWidths.name;
    doc.text("REGISTRATION ID", curX + 2, y + 5.5);
    curX += colWidths.id;
    doc.text("MOBILE LOGIN", curX + 2, y + 5.5);
    curX += colWidths.phone;
    doc.text("EMAIL ADDRESS", curX + 2, y + 5.5);
    curX += colWidths.email;
    doc.text("DEFAULT PASSWORD", curX + 2, y + 5.5);

    y += 8;

    // 4. TABLE ROWS
    const startIndex = (page - 1) * rowsPerPage;
    const pageRows = registeredParticipants.slice(startIndex, startIndex + rowsPerPage);

    pageRows.forEach((p, idx) => {
      const isEven = idx % 2 === 0;
      const rowY = y;
      const rowHeight = 11;

      // Alternate background
      if (isEven) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(bgLight[0]!, bgLight[1]!, bgLight[2]!);
      }
      doc.rect(margin, rowY, contentWidth, rowHeight, "F");

      // Row bottom border
      doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
      doc.setLineWidth(0.2);
      doc.line(margin, rowY + rowHeight, margin + contentWidth, rowY + rowHeight);

      let x = margin;

      // Col 1: Serial No
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
      doc.text(String(p.serialNo), x + 2, rowY + 7);
      x += colWidths.sl;

      // Col 2: Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
      const displayName = p.fullName.length > 24 ? p.fullName.slice(0, 22) + "…" : p.fullName;
      doc.text(displayName, x + 2, rowY + 7);
      x += colWidths.name;

      // Col 3: Registration ID
      doc.setFont("courier", "bold");
      doc.setFontSize(8);
      doc.setTextColor(brandPrimary[0]!, brandPrimary[1]!, brandPrimary[2]!);
      doc.text(p.participantCode, x + 2, rowY + 7);
      x += colWidths.id;

      // Col 4: Mobile Number
      doc.setFont("courier", "bold");
      doc.setFontSize(8);
      doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
      doc.text(p.phone, x + 2, rowY + 7);
      x += colWidths.phone;

      // Col 5: Email Address
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(textDark[0]!, textDark[1]!, textDark[2]!);
      const displayEmail = p.email.length > 27 ? p.email.slice(0, 25) + "…" : p.email;
      doc.text(displayEmail, x + 2, rowY + 7);
      x += colWidths.email;

      // Col 6: Default Password (Highlighted in emerald rounded badge)
      doc.setFillColor(236, 253, 245); // emerald-50
      doc.setDrawColor(16, 185, 129); // emerald-500
      doc.setLineWidth(0.4);
      doc.roundedRect(x + 1, rowY + 2, colWidths.pwd - 3, 7, 1, 1, "FD");

      doc.setFont("courier", "bold");
      doc.setFontSize(9);
      doc.setTextColor(4, 120, 87); // emerald-700
      doc.text(p.rawPassword, x + colWidths.pwd / 2 - 1.5, rowY + 6.8, { align: "center" });

      y += rowHeight;
    });

    // 5. SECURITY & USAGE NOTE (At bottom)
    const noteY = pageHeight - 22;
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, noteY, contentWidth, 9, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(180, 83, 9);
    doc.text(
      "CONFIDENTIAL CREDENTIAL PASS: Students can sign in using either Mobile Number or Email with the Default Password above. Change password upon first login.",
      margin + 3,
      noteY + 5.5
    );

    // 6. PAGE FOOTER
    doc.setDrawColor(borderLight[0]!, borderLight[1]!, borderLight[2]!);
    doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(textMuted[0]!, textMuted[1]!, textMuted[2]!);
    doc.text(
      "Generated by Workshop Attendance System • Entrepreneurship and Skill Development Programme (ESDP)",
      margin,
      pageHeight - 5.5
    );
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 5.5, {
      align: "right",
    });
  }

  return doc;
}

/**
 * Generates and triggers automatic browser download of the ESDP Credentials PDF
 */
export async function downloadEsdpCredentialsPdf(
  data: EsdpPdfData,
  fileName?: string
): Promise<void> {
  const doc = await buildEsdpCredentialsPdf(data);
  const finalFileName = fileName || `ESDP_Participant_Login_Credentials_${Date.now()}.pdf`;
  doc.save(finalFileName);
}

