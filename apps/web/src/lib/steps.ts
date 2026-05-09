import type { Step } from "@/components/ui/StepBar";

// ─── Personal documents stepper (Passport → Marital Status) ──

export const PERSONAL_STEPS = {
  passport: [
    { label: "Passport", status: "active" },
    { label: "Photograph", status: "upcoming" },
    { label: "Aadhar Card", status: "upcoming" },
    { label: "Pan", status: "upcoming" },
    { label: "Marital Status", status: "upcoming" },
  ],
  photograph: [
    { label: "Passport", status: "complete" },
    { label: "Photograph", status: "active" },
    { label: "Aadhar Card", status: "upcoming" },
    { label: "Pan", status: "upcoming" },
    { label: "Marital Status", status: "upcoming" },
  ],
  aadharCard: [
    { label: "Passport", status: "complete" },
    { label: "Photograph", status: "complete" },
    { label: "Aadhar Card", status: "active" },
    { label: "Pan", status: "upcoming" },
    { label: "Marital Status", status: "upcoming" },
  ],
  pan: [
    { label: "Passport", status: "complete" },
    { label: "Photograph", status: "complete" },
    { label: "Aadhar Card", status: "complete" },
    { label: "Pan", status: "active" },
    { label: "Marital Status", status: "upcoming" },
  ],
  maritalStatus: [
    { label: "Passport", status: "complete" },
    { label: "Photograph", status: "complete" },
    { label: "Aadhar Card", status: "complete" },
    { label: "Pan", status: "complete" },
    { label: "Marital Status", status: "active" },
  ],
} satisfies Record<string, Step[]>;

// ─── Data-collection stepper (Trip Sponsor → Banking Details) ─

export const DATA_STEPS = {
  tripSponsor: [
    { label: "Trip Sponsor", status: "active" },
    { label: "Employment Details", status: "upcoming" },
    { label: "Employment Documents", status: "upcoming" },
    { label: "Banking Details", status: "upcoming" },
  ],
  employmentDetails: [
    { label: "Trip Sponsor", status: "complete" },
    { label: "Employment Details", status: "active" },
    { label: "Employment Documents", status: "upcoming" },
    { label: "Banking Details", status: "upcoming" },
  ],
  employmentDocuments: [
    { label: "Trip Sponsor", status: "complete" },
    { label: "Employment Details", status: "complete" },
    { label: "Employment Documents", status: "active" },
    { label: "Banking Details", status: "upcoming" },
  ],
  bankingDetails: [
    { label: "Trip Sponsor", status: "complete" },
    { label: "Employment Details", status: "complete" },
    { label: "Employment Documents", status: "complete" },
    { label: "Banking Details", status: "active" },
  ],
  itr: [
    { label: "Trip Sponsor", status: "complete" },
    { label: "Employment Details", status: "complete" },
    { label: "Banking Details", status: "complete" },
    { label: "ITR / Tax Docs", status: "active" },
  ],
} satisfies Record<string, Step[]>;

// ─── Document-generation stepper (Embassy Form → Invitation) ─

export const DOC_STEPS = {
  sponsorLetter: [
    { label: "Embassy Form", status: "complete" },
    { label: "Sponsor Letter", status: "active" },
    { label: "Invitation Letter", status: "upcoming" },
    { label: "Cover Letter", status: "upcoming" },
  ],
  invitationLetter: [
    { label: "Embassy Form", status: "complete" },
    { label: "Sponsor Letter", status: "complete" },
    { label: "Invitation Letter", status: "active" },
    { label: "Cover Letter", status: "upcoming" },
  ],
  coverLetter: [
    { label: "Embassy Form", status: "complete" },
    { label: "Sponsor Letter", status: "complete" },
    { label: "Invitation Letter", status: "complete" },
    { label: "Cover Letter", status: "active" },
  ],
} satisfies Record<string, Step[]>;
