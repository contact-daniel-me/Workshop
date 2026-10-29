# Workshop Attendence

Complete web-based workshop attendance management system built with React, TypeScript, TanStack Start, Tailwind CSS, and Supabase.

## Features

- **Participant Registration**: Single-step registration with full name, mobile number, email address, password, and profile selfie photograph.
- **Unified Login**: Sign in using either registered email address or registered mobile number with password.
- **Admin Verification**: Administrators verify participant profiles before attendance check-in is unlocked.
- **Daily Rotating QR Sessions**: Expiring QR codes for each workshop session.
- **Face Verification**: Biometric verification with explicit consent and administrator manual review fallback.
- **Real-Time Attendance Calendar**: Live status view of present, absent, pending, and excused days.
- **Excel Reports**: Downloadable `.xlsx` workbooks for master attendance, daily rosters, and individual participation summaries using ExcelJS.
- **Row Level Security (RLS)**: Comprehensive security policies on all tables and private storage buckets.

## Tech Stack

- **Frontend**: React 19, TypeScript, TanStack Router & TanStack Start, Tailwind CSS
- **Backend / Database**: Supabase PostgreSQL, Supabase Auth, Supabase Storage
- **Export**: ExcelJS

## Getting Started

1. Copy `.env.example` to `.env` and configure your Supabase project credentials:
   ```sh
   cp .env.example .env
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. Run the development server:
   ```sh
   npm run dev
   ```

4. Build for production:
   ```sh
   npm run build
   ```

5. Run test suite:
   ```sh
   npm test
   ```
