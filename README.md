# Digital Loyalty SaaS Platform

A scalable digital loyalty platform for businesses in Algeria and eventually other markets.

The platform allows businesses to create loyalty programs, customers to join through QR/NFC without downloading an app, employees to award stamps or points and redeem rewards, and customers to use a persistent digital loyalty card.

> **Core principle:** Simple for the business owner. Fast for the employee. Frictionless for the customer.

---

## 1. Product Overview

The product is functionally inspired by modern loyalty platforms, but must have its own branding, UX, codebase, and product identity.

### Main objectives

- Business owners can create and manage loyalty programs.
- Customers can join using a QR code or NFC link.
- Customers do not need to install a mobile application.
- Employees can award stamps or points.
- Customers can track their progress and rewards.
- Employees can redeem eligible rewards.
- Business owners can view useful analytics.
- The platform must securely isolate each business's data.

---

## 2. User Roles

| Role | Responsibilities |
|---|---|
| **Business Owner** | Manage business profile, loyalty programs, rewards, customers, employees, analytics, locations, and settings. |
| **Manager** | Operational management within assigned business/location with configurable permissions. |
| **Employee** | Scan/search customers, add stamps/points, and redeem rewards. No billing or owner settings. |
| **Customer** | Join programs, view digital card, track progress, view rewards/history, and present QR code for identification. |
| **Platform Admin** | Manage businesses, platform activity, support, and account controls. |

---

## 3. Core End-to-End Flow

```text
BUSINESS SIGNUP
      ↓
BUSINESS CREATES LOYALTY PROGRAM
      ↓
REWARD CREATED
      ↓
SYSTEM GENERATES JOIN QR/NFC URL
      ↓
CUSTOMER SCANS/TAPS
      ↓
CUSTOMER JOINS
      ↓
DIGITAL CARD CREATED
      ↓
EMPLOYEE SCANS CUSTOMER
      ↓
STAMP/POINT ADDED
      ↓
TRANSACTION RECORDED
      ↓
REWARD UNLOCKED
      ↓
EMPLOYEE REDEEMS REWARD
      ↓
ANALYTICS UPDATED
```

---

## 4. Loyalty Programs

The database and application must support both loyalty models from the beginning.

### Stamp Model

Example:

```text
10 visits/stamps = Free Coffee
```

The business defines:

- Required number of stamps
- Reward
- Optional expiration
- Program status

### Points Model

Example:

```text
1 point per 100 DZD spent
```

The business defines:

- Earning rules
- Points required for rewards
- Rewards and thresholds
- Optional expiration
- Program status

---

## 5. Employee / Counter Flow

The employee workflow should be fast and simple:

```text
Scan Customer
      ↓
Camera Opens
      ↓
Customer QR Scanned
      ↓
Membership Verified
      ↓
Customer / Program Displayed
      ↓
Add Stamp / Add Points
      ↓
Confirmation
      ↓
Transaction Created
      ↓
Balance / Progress Updated
```

### Duplicate protection

The server must prevent accidental duplicate submissions.

Requirements:

- Server-side idempotency/duplicate protection
- Clear success feedback
- Transaction validation before modifying loyalty state

---

## 6. Rewards & Redemption

### Reward fields

- `name`
- `description`
- `image` (optional)
- Required stamps or points
- `expiration` (optional)
- `active/inactive` status

### Redemption rules

A customer becomes eligible when the required threshold is reached.

When an employee redeems a reward, the server must verify:

- Customer identity
- Business ownership
- Loyalty program
- Reward eligibility
- Redemption status
- Employee authorization

Each successful redemption must create an immutable redemption record containing:

- Customer
- Business
- Location
- Employee
- Reward
- Timestamp

Double redemption must be prevented.

---

## 7. Customer QR / NFC

### Business Join QR / NFC

The business join QR/NFC should contain only a public loyalty-program URL.

Example:

```text
/join/{programId}
```

NFC is simply a physical way of opening the same public URL.

### Customer QR

Customer QR codes must use a secure random membership identifier/token.

Never encode sensitive personal information directly into the QR code.

The backend must:

1. Resolve the identifier to the correct membership.
2. Verify authorization.
3. Allow only the actions permitted for that customer/business/program.

---

## 8. Database / Data Model

Core tables:

```text
users
businesses
business_locations
employees
loyalty_programs
customers
customer_memberships
rewards
transactions
reward_redemptions
customer_events
```

Wallet-related tables can be added later:

```text
wallet_passes
```

### Database principles

- Use UUID primary keys.
- Use `created_at` and `updated_at` where appropriate.
- Add foreign keys.
- Add indexes for:
  - `business_id`
  - `customer_id`
  - `loyalty_program_id`
  - phone/email
  - timestamps
- Loyalty actions should create immutable transaction records.
- Do not simply overwrite historical loyalty activity.
- Balances may be maintained as derived/validated state, but the transaction ledger remains the audit trail.

---

## 9. Security & Multi-Tenancy

The platform must use secure multi-tenant architecture.

### Requirements

- Supabase Authentication
- PostgreSQL
- Row Level Security (RLS) for every business-owned table
- A business must never access another business's:
  - Customers
  - Programs
  - Transactions
  - Other protected data
- Employees can only access permitted business/location data.
- Client-side authorization must never be trusted.
- Permissions must be enforced server-side/database-side.
- Validate all inputs and ownership relationships.
- Use secure random IDs/tokens for public/customer QR identifiers.
- Protect against duplicate transactions and reward redemptions.
- Never expose secrets in frontend code.

---

## 10. Technology Stack

### Frontend

- React
- JavaScript
- Tailwind CSS
- Responsive component architecture

> **JavaScript is used instead of TypeScript.** The project should use clean JavaScript modules, reusable components, clear prop contracts, and consistent data structures instead of TypeScript interfaces/types.

### Backend / Data

- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security (RLS)

### Hosting

- Vercel-compatible deployment

### QR / NFC

- QR code generation
- Public URLs
- NFC tags pointing to the public join URL

The architecture should remain modular so external services can be added later without rewriting the core loyalty system.

---

## 11. Apple Wallet & Google Wallet

Wallet integration is part of the long-term architecture but should not block the core MVP.

### Apple Wallet

Production integration should:

- Generate legitimate signed `.pkpass` files using Apple's PassKit format.
- Use Apple-issued signing credentials.
- Include business branding.
- Include customer name/ID.
- Include current stamps/points.
- Include reward information.
- Include a customer QR/barcode.
- Support pass updates when loyalty balances change.
- Store the required pass serial/device relationships.

### Google Wallet

Production integration should:

- Use the official Google Wallet API.
- Use `LoyaltyClass` / `LoyaltyObject` concepts.
- Generate the official Google Wallet save flow.
- Keep server-side credentials secure.

### Security

Never expose:

- Apple private keys
- Google service-account credentials

Wallet credentials must be stored as environment secrets.

Do not claim production wallet integration is complete until real credentials and external platform configuration are available.

---

## 12. Wallet Update Flow

When a loyalty action occurs:

```text
Employee Adds Stamp / Points
          ↓
Transaction Saved
          ↓
Membership Balance Changes
          ↓
Backend Triggers Wallet Update
          ↓
Apple Pass / Google Wallet Reflects New Balance
```

Reward unlocking and redemption should also update wallet-visible status where supported.

---

## 13. UI / UX Direction

The application should have a:

- Premium, modern, minimal SaaS appearance
- Mobile-first customer experience
- Responsive merchant dashboard
- Strong typography
- Generous spacing
- Rounded cards
- Subtle shadows
- Restrained use of color
- Minimal unnecessary animation

### Customer experience

The customer card should feel like a digital membership card, not an admin dashboard.

### Business experience

A business owner should understand the onboarding process without technical knowledge.

---

## 14. MVP Scope

The MVP should include:

- Authentication and roles
- Business onboarding
- Business dashboard
- Stamp loyalty programs
- Points loyalty programs
- Rewards
- Customer registration
- Mobile digital loyalty card
- Business join QR/NFC URL
- Customer QR
- Employee customer scanning
- Add stamps/points
- Reward redemption
- Customer management
- Employee management
- Basic analytics
- Secure multi-tenant database

### Deferred Features

The following should be implemented after the core MVP works:

- Apple Wallet production integration
- Google Wallet production integration
- WhatsApp/SMS/email automation
- Referral programs
- Google review campaigns
- Subscription billing
- Advanced analytics/AI
- Custom domains / white-labeling
- Native mobile applications
- Offline mode

---

## 15. Development Phases

| Phase | Deliverables |
|---|---|
| **1. Foundation** | Project structure, Supabase, authentication, database schema, RLS, roles, basic application shell. |
| **2. Merchant** | Business onboarding, dashboard, programs, rewards. |
| **3. Customer** | Join flow, membership, mobile digital card. |
| **4. Operations** | Customer QR, employee scanner, stamp/point transactions. |
| **5. Rewards** | Eligibility, redemption, redemption history. |
| **6. Management** | Customer management, employees, analytics. |
| **7. Wallet** | Apple Wallet and Google Wallet integration/update architecture. |
| **8. Production** | Security review, testing, monitoring, deployment, and documentation. |

---

## 16. Business Model — Initial Concept

The initial target market is Algeria.

> Pricing is a business hypothesis and must be validated with real merchants.

| Plan | Illustrative Monthly Price | Potential Contents |
|---|---:|---|
| **Starter** | 1,500 DZD | Digital loyalty, QR/NFC join, stamps/points, rewards, basic dashboard |
| **Pro** | 3,000 DZD | Analytics, employees, automations, additional retention features |
| **Business** | 5,000–8,000 DZD | Multiple locations, advanced analytics, automation, priority support |

Physical NFC/QR plates can be sold separately as an acquisition/onboarding product.

---

## 17. Product Positioning

The long-term goal is to become a customer-retention platform rather than simply a digital stamp card.

Potential future capabilities include:

- Loyalty
- Customer database
- Rewards
- Automated re-engagement
- Referrals
- Review campaigns
- Wallet presence

### First Commercial Milestone

The first milestone is intentionally narrow:

1. A real business can create a loyalty program.
2. Customers can join quickly.
3. Employees can issue loyalty value in seconds.
4. Rewards can be redeemed safely.
5. The owner can see useful data.

---

## 18. MVP Acceptance Criteria

The MVP is considered functional when:

- A new business can sign up and create its first loyalty program without developer intervention.
- A customer can join using a QR/NFC link on a phone in approximately 30 seconds.
- A customer receives a persistent digital loyalty card.
- An employee can identify a customer and award loyalty value in a few seconds.
- Every loyalty action is recorded and auditable.
- A reward can only be redeemed when eligible.
- A reward cannot be redeemed twice.
- Business data is securely isolated from other businesses.
- Dashboard numbers match the underlying transaction data.
- The application works on modern mobile and desktop browsers.
- The architecture is ready for future Apple Wallet, Google Wallet, and external integrations.

---

## 19. Development Principles

- Do not build fake functionality or hardcoded production flows.
- Do not over-engineer the MVP.
- Build in phases and test each phase before moving to the next.
- Keep the database schema normalized and secure.
- Keep business logic on trusted server/database layers.
- Use reusable React components and clear JavaScript data contracts.
- Document environment variables and external credentials.
- Keep the code in the project owner's Git repository.
- Keep third-party account ownership under the project owner.

---

## 20. Suggested Project Structure

```text
loyalty-saas/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── lib/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── package.json
│   └── .env.example
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   └── seed.sql
│
├── README.md
└── .gitignore
```

This structure is a suggested JavaScript-oriented organization and can be adapted during implementation.

---

## 21. Environment Variables

Keep secrets out of the frontend source code and Git repository.

The browser talks only to the Express API. Supabase service credentials and the PostgreSQL URL belong in `backend/.env`, never in frontend source or Vite variables.

Frontend example:

```env
VITE_API_URL=http://localhost:3000
```

Server-side secrets should be stored separately and must never be exposed to the client.

For example:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

> Never commit real credentials to Git.

---

## 22. Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd loyalty-saas
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Configure environment variables

Create `backend/.env` from `backend/.env.example` and add the Supabase and PostgreSQL configuration. Create `frontend/.env` from `frontend/.env.example` with `VITE_API_URL=http://localhost:3000`.

### 4. Start the development server

```bash
cd backend && npm run dev
```

In a second terminal:

```bash
cd frontend && npm run dev
```

### 5. Configure Supabase

For a fresh database, run `supabase/migrations/001_initial.sql` in the Supabase SQL editor. Set up:

- PostgreSQL database
- Supabase Authentication
- Database migrations
- Row Level Security policies
- Required database functions/triggers

### 6. Test each development phase

Do not move to the next phase until the current phase has been tested and its core functionality works correctly.

---

## 23. Repository & Ownership

The project owner should retain ownership of:

- Git repository
- Supabase project
- Vercel project
- External service accounts
- Apple Developer account, if applicable
- Google Cloud/Wallet credentials, if applicable

Third-party credentials must be stored securely and must not be committed to the repository.

---

## 24. Handoff / Engineering Notes

This README is based on the product and technical specification.

Before implementation, the development team should:

- Convert requirements into an implementation plan.
- Confirm architecture decisions.
- Identify external dependencies.
- Estimate development phases.
- Clarify unresolved requirements.
- Define database migrations.
- Define RLS policies.
- Define authentication and role permissions.
- Test each phase before proceeding.

The first priority is a **reliable and secure MVP**, not a large collection of unfinished features.

---

## License

This project is proprietary unless otherwise specified by the project owner.
