/**
 * businessNumberValidator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side validation for country-specific business registration numbers.
 * Mirrors the patterns in the client's lib/businessNumberPatterns.ts.
 *
 * Field mapping:
 *   cinNumber  → Company/Registration ID
 *   gstNumber  → Tax / VAT ID
 *   panNumber  → Secondary / National ID
 */

// ─── Pattern registry ─────────────────────────────────────────────────────────

const PATTERNS: Record<
  string,
  {
    cin?: RegExp;  // Registration number
    gst?: RegExp;  // Tax / VAT number
    pan?: RegExp;  // Secondary / National ID
  }
> = {
  India: {
    cin: /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/, // CIN
    gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/,       // GSTIN
    pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,                           // PAN
  },
  "United States": {
    cin: /^[0-9]{2}-[0-9]{7}$/,  // EIN format XX-XXXXXXX
    // gst: no federal VAT — omitted
    // pan: varies by state — omitted
  },
  "United Kingdom": {
    cin: /^(SC|NI|OC|SO|NC|R|IP|SP|FC|GE|GS|IC|LP|NA|NF|NL|NP|NR|NV|RC|RS|SA|SR|SZ|ZC)?[0-9]{6,8}$/, // Company Number
    gst: /^GB[0-9]{9}$/,    // VAT Number
    pan: /^[0-9]{10}$/,     // UTR — 10 digits
  },
  Singapore: {
    cin: /^([0-9]{9}[A-Z]|[TRS][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z])$/, // UEN
    gst: /^M[0-9]{1}-[0-9]{7}-[0-9]{1}$/,                          // GST Reg No
    // pan: NRIC free-text — not strictly validated server-side
  },
  Germany: {
    cin: /^HR[AB]\s?[0-9]+\s?[A-Z]*$/i, // HRB / HRA number
    gst: /^DE[0-9]{9}$/,                // EU VAT
    // pan: Steuernummer free-text
  },
  Australia: {
    cin: /^[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // ACN — 9 digits
    gst: /^[0-9]{2}\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // ABN — 11 digits
    pan: /^[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // TFN — 9 digits
  },
  "United Arab Emirates": {
    // Trade license: free-text (varies per emirate)
    gst: /^[0-9]{15}$/, // TRN — 15 digits
    // nat: Emirates ID — free-text
  },
  Canada: {
    cin: /^[0-9]{9}$/,               // BN — 9 digits
    gst: /^[0-9]{9}RT[0-9]{4}$/,    // GST / HST — BN + RT + 4 digits
  },
  Netherlands: {
    cin: /^[0-9]{8}$/,               // KvK — 8 digits
    gst: /^NL[0-9]{9}B[0-9]{2}$/,   // BTW VAT
    pan: /^[0-9]{9}$/,               // RSIN — 9 digits
  },
  France: {
    cin: /^[0-9]{14}$/,              // SIRET — 14 digits
    gst: /^FR[A-Z0-9]{2}[0-9]{9}$/, // TVA VAT
    pan: /^[0-9]{9}$/,               // SIREN — 9 digits
  },
};

// ─── Human-readable format descriptions for error messages ───────────────────

const FORMAT_HINTS: Record<
  string,
  { cin?: string; gst?: string; pan?: string }
> = {
  India: {
    cin: "21 characters (e.g. U74999MH2020PTC123456)",
    gst: "15 characters (e.g. 29ABCDE1234F1Z5)",
    pan: "10 characters (e.g. ABCDE1234F)",
  },
  "United States": {
    cin: "XX-XXXXXXX (e.g. 12-3456789)",
  },
  "United Kingdom": {
    cin: "8 digits or SC/NI prefix + 6 digits (e.g. 12345678, SC123456)",
    gst: "GB + 9 digits (e.g. GB123456789)",
    pan: "10 digits (e.g. 1234567890)",
  },
  Singapore: {
    cin: "9 digits + letter, or T/S/R + 2 digits + 2 letters + 4 digits + letter (e.g. 202012345A)",
    gst: "M + digit + hyphen + 7 digits + hyphen + 1 digit (e.g. M2-1234567-5)",
  },
  Germany: {
    cin: "HRB/HRA + number (e.g. HRB 12345 B)",
    gst: "DE + 9 digits (e.g. DE123456789)",
  },
  Australia: {
    cin: "9 digits — ACN (e.g. 123 456 789)",
    gst: "11 digits — ABN (e.g. 51 824 753 556)",
    pan: "9 digits — TFN (e.g. 123 456 782)",
  },
  "United Arab Emirates": {
    gst: "15 digits — TRN (e.g. 100123456700003)",
  },
  Canada: {
    cin: "9 digits — BN (e.g. 123456789)",
    gst: "9 digits + RT + 4 digits (e.g. 123456789RT0001)",
  },
  Netherlands: {
    cin: "8 digits — KvK (e.g. 12345678)",
    gst: "NL + 9 digits + B + 2 digits (e.g. NL123456789B01)",
    pan: "9 digits — RSIN (e.g. 123456789)",
  },
  France: {
    cin: "14 digits — SIRET (e.g. 73282932000074)",
    gst: "FR + 2 chars + 9 digits — TVA (e.g. FR12345678901)",
    pan: "9 digits — SIREN (e.g. 732829320)",
  },
};

// ─── Validation result ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: {
    cinNumber?: string;
    gstNumber?: string;
    panNumber?: string;
  };
}

/**
 * Validate the business number fields for a given country.
 * Only validates non-empty values — empty optional fields are allowed.
 */
export function validateBusinessNumbers(data: {
  country?: string;
  cinNumber?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
}): ValidationResult {
  const country = data.country ?? "";
  const patterns = PATTERNS[country] ?? {};
  const hints = FORMAT_HINTS[country] ?? {};

  const errors: ValidationResult["errors"] = {};

  const check = (
    fieldKey: "cin" | "gst" | "pan",
    value: string | null | undefined,
    dbField: "cinNumber" | "gstNumber" | "panNumber",
  ) => {
    const v = (value ?? "").trim();

    // Only validate if a value is provided (allows skipping during registration)
    if (!v) {
      return;
    }

    const pattern = patterns[fieldKey];
    if (pattern && !pattern.test(v)) {
      const hint = hints[fieldKey];
      errors[dbField] = hint
        ? `Invalid format. Expected: ${hint}`
        : `Invalid format for ${country}`;
    }
  };

  check("cin", data.cinNumber, "cinNumber");
  check("gst", data.gstNumber, "gstNumber");
  check("pan", data.panNumber, "panNumber");

  return { valid: Object.keys(errors).length === 0, errors };
}
