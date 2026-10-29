# SmartAttend — Supabase Integration & Setup Guide

This document provides step-by-step instructions for integrating, configuring, and deploying Supabase with **SmartAttend — 30-Day Workshop Attendance Portal**.

---

## 1. Stack & Architecture

- **Frontend & App Framework**: React 19, TypeScript, Vite, TanStack Router & Start, Tailwind CSS, Shadcn UI.
- **Database**: Supabase PostgreSQL with Row Level Security (RLS) enabled on all exposed tables.
- **Authentication**: Supabase Auth with deterministic phone-to-identity mapping (`{phone}@smartattend.in`) and salted passwords to bypass dictionary blocks without requiring SMS OTP providers.
- **Storage**: Supabase Storage with two **private** buckets (`photos` and `selfies`), protected by folder-based RLS policies (`(storage.foldername(name))[1] = auth.uid()::text`).
- **Server Functions**: TanStack Start server functions running privileged operations with `supabaseAdmin` service role keys strictly server-side.
- **Face Verification**: Server-side computer vision engine with explicit consent logging in `consent_records`, similarity scoring in `verification_attempts`, and manual fallback queue.
- **Reporting**: ExcelJS for multi-sheet `.xlsx` workbooks with formula-injection sanitization.

---

## 2. Environment Variables Configuration

Copy `.env.example` to `.env` in the root of your project:

```bash
cp .env.example .env
```

Set the following variables:

```env
# Supabase Project Configuration (Client & Server)
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-or-publishable-key"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-or-publishable-key"
VITE_SUPABASE_PROJECT_ID="your-project-id"

# Server-Side Privileged Secrets (Kept strictly on the server; never exposed to browser)
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-secret-key"
SUPABASE_PUBLISHABLE_KEY="your-anon-or-publishable-key"

# Optional: Real Face Verification Configuration
FACE_VERIFICATION_PROVIDER="server_vision" # Options: 'server_vision' | 'rekognition' | 'faceplusplus'
FACE_VERIFICATION_API_KEY=""
FACE_VERIFICATION_API_URL=""
FACE_VERIFICATION_CONFIDENCE_THRESHOLD="75"
```

---

## 3. Database Migrations

The full schema migration file is located at:
`supabase/migrations/20261029000000_smartattend_core.sql`

### Tables Created:
1. `profiles`: Participant records, assigned ID (`SA-2026-XXXX`), normalized phone/email, verification status (`pending`, `verified`, `rejected`).
2. `user_roles`: RBAC roles (`super_admin`, `attendance_admin`, `participant`).
3. `workshop_settings`: Configuration for workshop name, start date, duration (30 days), QR validity, low attendance threshold.
4. `workshops`: Master workshop records.
5. `workshop_days`: The 30 calendar days of the workshop.
6. `qr_sessions`: Daily rotating cryptographically secure QR tokens and 6-digit short codes.
7. `attendance`: Attendance records with transactional duplicate prevention (`unique(user_id, day_date)`).
8. `verification_attempts`: Biometric match audit logs with confidence scores and provider responses.
9. `consent_records`: Explicit consent records for privacy policy and biometric face processing.
10. `audit_logs`: Audit trail for admin actions and security events.

### How to Apply the Migration:

#### Option A: Supabase Dashboard (Recommended)
1. Open your project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor** tab from the left sidebar.
3. Open `supabase/migrations/20261029000000_smartattend_core.sql` in your code editor, copy the entire SQL content.
4. Paste it into the SQL Editor in Supabase and click **Run**.
5. All tables, functions, triggers, security policies, and storage buckets will be created instantly.

#### Option B: Supabase CLI
If you have the Supabase CLI installed and linked:
```bash
supabase db push
```

---

## 4. Storage Buckets Setup

The migration automatically creates and configures the storage buckets with access controls:
- **`photos`**: Private bucket for registration reference portraits (Max size: 5 MB; Allowed: JPEG, PNG, WebP).
- **`selfies`**: Private bucket for check-in verification captures (Max size: 5 MB; Allowed: JPEG, PNG, WebP).

RLS Policies on `storage.objects`:
- **Upload**: Authenticated users can upload only into their own folder: `(storage.foldername(name))[1] = auth.uid()::text`.
- **Read**: Authenticated users can read their own folder; authorized staff (`is_staff(auth.uid())`) can read all photos.
- **Serving**: The frontend fetches signed URLs via `supabase.storage.from(...).createSignedUrls(...)` which expire after a short time window.

---

## 5. Creating the Initial Super Administrator

The schema includes an automatic bootstrapping trigger in `handle_new_user()`:
1. The **very first account** that signs up on the portal is automatically assigned the `super_admin` role.
2. All subsequent registrations are assigned the `participant` role with `pending` verification status.

### Manual Promotion via SQL Editor:
If you already registered an account and wish to grant administrator privileges manually, run this in the Supabase SQL Editor:

```sql
-- Find user id by phone or email
select id, full_name, email, phone from public.profiles;

-- Assign super_admin role
insert into public.user_roles (user_id, role)
values ('<INSERT-USER-UUID-HERE>', 'super_admin')
on conflict (user_id, role) do nothing;
```

---

## 6. Running the Application

### Install Dependencies:
```bash
npm install
```

### Run Tests:
Verify pure attendance calculations, RLS logic, phone normalization, and Excel exports:
```bash
npm test -- --run
```

### Start Local Development Server:
```bash
npm run dev
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

### Build for Production:
```bash
npm run build
```

---

## 7. Security & Compliance Checklist

- [x] **No Plaintext Passwords**: Passwords hashed securely by Supabase Auth (Argon2/bcrypt).
- [x] **Password Freedom**: Passwords salted with application secret before reaching Supabase to remove HaveIBeenPwned dictionary block.
- [x] **No SMS OTP Dependency**: Deterministic phone mapping allows standard password login with 10-digit mobile number.
- [x] **Row Level Security (RLS)**: Enforced on all tables. Participants cannot read other users' records.
- [x] **Prevent Privilege Escalation**: Database trigger `protect_profile_cols()` blocks participants from altering their own `verification_status` or `participant_code`.
- [x] **Strict Server Enforcement**: Direct check-in API calls verify `profile.verification_status === "verified"` before allowing attendance recording.
- [x] **Audit Trail**: Every admin approval, rejection (with mandatory reason), manual check-in, and QR rotation is permanently recorded in `audit_logs`.
- [x] **Formula Injection Protection**: All Excel workbook exports sanitize cells beginning with `=`, `+`, `-`, or `@`.

