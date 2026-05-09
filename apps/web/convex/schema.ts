import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─────────────────────────────────────────────────────────────
  // Traveler profile (created once per Clerk user)
  // ─────────────────────────────────────────────────────────────
  travelers: defineTable({
    tokenIdentifier: v.string(),   // Clerk identity.tokenIdentifier — never userId
    email: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"]),

  // ─────────────────────────────────────────────────────────────
  // Visa application — one per submission attempt
  // ─────────────────────────────────────────────────────────────
  applications: defineTable({
    travelerId: v.id("travelers"),
    createdBy: v.string(),          // tokenIdentifier for ownership checks

    // Passport step
    passportDataId: v.optional(v.id("passportData")),

    // Occupation step
    occupationType: v.optional(
      v.union(
        v.literal("salaried"),
        v.literal("self_employed"),
        v.literal("real_estate"),
        v.literal("student"),
        v.literal("homemaker"),
        v.literal("retired"),
        v.literal("not_employed")
      )
    ),
    employmentSubtype: v.optional(
      v.union(v.literal("private"), v.literal("government"))
    ),

    // Document step status (tracked per doc type)
    salarySlipsStatus: v.optional(
      v.union(v.literal("pending"), v.literal("uploaded"), v.literal("verified"))
    ),
    leaveLetterId: v.optional(v.id("documents")),
    bankStatementsStatus: v.optional(
      v.union(v.literal("not_provided"), v.literal("uploaded"), v.literal("verified"))
    ),

    // Target destination country
    destination: v.optional(v.string()),

    // Visa type and travel window
    visaType: v.optional(v.string()),          // e.g. "tourist", "business", "student"
    travelDateFrom: v.optional(v.string()),    // YYYY-MM-DD
    travelDateTo: v.optional(v.string()),      // YYYY-MM-DD

    // Cover letter step
    coverLetterId: v.optional(v.id("coverLetters")),

    // Overall application state
    status: v.union(
      v.literal("draft"),
      v.literal("passport_verified"),
      v.literal("documents_uploaded"),
      v.literal("cover_letter_generated"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected")
    ),

    // AI approval score (0–100), updated after each major step
    approvalScore: v.optional(v.number()),
    approvalScoreUpdatedAt: v.optional(v.number()),

    submittedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_traveler", ["travelerId"])
    .index("by_creator", ["createdBy"])
    .index("by_status", ["status"]),

  // ─────────────────────────────────────────────────────────────
  // Passport data — extracted from MRZ scan
  // ─────────────────────────────────────────────────────────────
  passportData: defineTable({
    applicationId: v.id("applications"),
    createdBy: v.string(),

    // MRZ-extracted fields
    surname: v.string(),
    givenNames: v.string(),
    nationality: v.string(),
    dateOfBirth: v.string(),          // YYYY-MM-DD
    sex: v.union(v.literal("M"), v.literal("F"), v.literal("X")),
    expiryDate: v.string(),           // YYYY-MM-DD
    passportNumber: v.string(),
    issuingCountry: v.string(),

    // Validation
    isValid: v.boolean(),
    mrz1: v.string(),
    mrz2: v.string(),
    checkDigitsPassed: v.boolean(),

    // Back-page personal details (optional — extracted from last page)
    fathersName: v.optional(v.string()),
    mothersName: v.optional(v.string()),
    spouseName: v.optional(v.string()),
    address: v.optional(v.string()),

    // Raw storage references
    firstPageStorageId: v.id("_storage"),
    lastPageStorageId: v.id("_storage"),

    createdAt: v.number(),
  })
    .index("by_application", ["applicationId"]),

  // ─────────────────────────────────────────────────────────────
  // Documents — salary slips, leave letters, bank statements
  // ─────────────────────────────────────────────────────────────
  documents: defineTable({
    applicationId: v.id("applications"),
    createdBy: v.string(),

    type: v.union(
      v.literal("salary_slip"),
      v.literal("leave_letter"),
      v.literal("company_appointment_letter"),
      v.literal("bank_statement"),
      v.literal("sponsor_letter"),
      v.literal("invitation_letter"),
      v.literal("itr")
    ),

    // For salary slips: month label e.g. "2025-01"
    month: v.optional(v.string()),

    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    mimeType: v.string(),

    // OCR extracted data (optional, set after processing)
    extractedData: v.optional(v.any()),

    uploadedAt: v.number(),
  })
    .index("by_application", ["applicationId"])
    .index("by_application_and_type", ["applicationId", "type"]),

  // ─────────────────────────────────────────────────────────────
  // Cover letters — AI-generated, one per application
  // ─────────────────────────────────────────────────────────────
  coverLetters: defineTable({
    applicationId: v.id("applications"),
    createdBy: v.string(),

    // Generated content
    content: v.string(),
    template: v.string(),           // which template was used

    // Input context used for generation
    applicantName: v.string(),
    occupation: v.string(),
    destination: v.optional(v.string()),
    purpose: v.optional(v.string()),

    // Self-employed: company logo uploaded to Convex storage
    logoStorageId: v.optional(v.id("_storage")),

    // Regeneration support
    version: v.number(),            // increments on each regeneration
    approved: v.boolean(),          // traveler approved this version

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_application", ["applicationId"]),
});
