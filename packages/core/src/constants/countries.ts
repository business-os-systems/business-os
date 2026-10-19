/**
 * Canonical ISO 3166-1 alpha-2 Country List
 * Pinned with India (IN) at the very top for local business reality.
 */

export interface CountryOption {
  value: string;
  label: string;
  code: string;
  name: string;
}

export const DEFAULT_COUNTRY_CODE = "IN" as const;

export const COUNTRY_OPTIONS: ReadonlyArray<CountryOption> = [
  // Pinned Default
  { value: "IN", label: "India (IN)", code: "IN", name: "India" },

  // Frequently Used Regional & International Trading Partners
  { value: "AE", label: "United Arab Emirates (AE)", code: "AE", name: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia (SA)", code: "SA", name: "Saudi Arabia" },
  { value: "SG", label: "Singapore (SG)", code: "SG", name: "Singapore" },
  { value: "US", label: "United States (US)", code: "US", name: "United States" },
  { value: "GB", label: "United Kingdom (GB)", code: "GB", name: "United Kingdom" },
  { value: "CA", label: "Canada (CA)", code: "CA", name: "Canada" },
  { value: "AU", label: "Australia (AU)", code: "AU", name: "Australia" },
  { value: "DE", label: "Germany (DE)", code: "DE", name: "Germany" },
  { value: "FR", label: "France (FR)", code: "FR", name: "France" },
  { value: "JP", label: "Japan (JP)", code: "JP", name: "Japan" },

  // Alphabetical Global Directory
  { value: "AF", label: "Afghanistan (AF)", code: "AF", name: "Afghanistan" },
  { value: "AL", label: "Albania (AL)", code: "AL", name: "Albania" },
  { value: "DZ", label: "Algeria (DZ)", code: "DZ", name: "Algeria" },
  { value: "AR", label: "Argentina (AR)", code: "AR", name: "Argentina" },
  { value: "AM", label: "Armenia (AM)", code: "AM", name: "Armenia" },
  { value: "AT", label: "Austria (AT)", code: "AT", name: "Austria" },
  { value: "BH", label: "Bahrain (BH)", code: "BH", name: "Bahrain" },
  { value: "BD", label: "Bangladesh (BD)", code: "BD", name: "Bangladesh" },
  { value: "BE", label: "Belgium (BE)", code: "BE", name: "Belgium" },
  { value: "BT", label: "Bhutan (BT)", code: "BT", name: "Bhutan" },
  { value: "BR", label: "Brazil (BR)", code: "BR", name: "Brazil" },
  { value: "CH", label: "Switzerland (CH)", code: "CH", name: "Switzerland" },
  { value: "CL", label: "Chile (CL)", code: "CL", name: "Chile" },
  { value: "CN", label: "China (CN)", code: "CN", name: "China" },
  { value: "CO", label: "Colombia (CO)", code: "CO", name: "Colombia" },
  { value: "DK", label: "Denmark (DK)", code: "DK", name: "Denmark" },
  { value: "EG", label: "Egypt (EG)", code: "EG", name: "Egypt" },
  { value: "ES", label: "Spain (ES)", code: "ES", name: "Spain" },
  { value: "FI", label: "Finland (FI)", code: "FI", name: "Finland" },
  { value: "GR", label: "Greece (GR)", code: "GR", name: "Greece" },
  { value: "HK", label: "Hong Kong (HK)", code: "HK", name: "Hong Kong" },
  { value: "ID", label: "Indonesia (ID)", code: "ID", name: "Indonesia" },
  { value: "IE", label: "Ireland (IE)", code: "IE", name: "Ireland" },
  { value: "IL", label: "Israel (IL)", code: "IL", name: "Israel" },
  { value: "IT", label: "Italy (IT)", code: "IT", name: "Italy" },
  { value: "JO", label: "Jordan (JO)", code: "JO", name: "Jordan" },
  { value: "KE", label: "Kenya (KE)", code: "KE", name: "Kenya" },
  { value: "KR", label: "South Korea (KR)", code: "KR", name: "South Korea" },
  { value: "KW", label: "Kuwait (KW)", code: "KW", name: "Kuwait" },
  { value: "LK", label: "Sri Lanka (LK)", code: "LK", name: "Sri Lanka" },
  { value: "MY", label: "Malaysia (MY)", code: "MY", name: "Malaysia" },
  { value: "MV", label: "Maldives (MV)", code: "MV", name: "Maldives" },
  { value: "MX", label: "Mexico (MX)", code: "MX", name: "Mexico" },
  { value: "MU", label: "Mauritius (MU)", code: "MU", name: "Mauritius" },
  { value: "NP", label: "Nepal (NP)", code: "NP", name: "Nepal" },
  { value: "NL", label: "Netherlands (NL)", code: "NL", name: "Netherlands" },
  { value: "NZ", label: "New Zealand (NZ)", code: "NZ", name: "New Zealand" },
  { value: "NO", label: "Norway (NO)", code: "NO", name: "Norway" },
  { value: "OM", label: "Oman (OM)", code: "OM", name: "Oman" },
  { value: "PH", label: "Philippines (PH)", code: "PH", name: "Philippines" },
  { value: "PK", label: "Pakistan (PK)", code: "PK", name: "Pakistan" },
  { value: "PL", label: "Poland (PL)", code: "PL", name: "Poland" },
  { value: "PT", label: "Portugal (PT)", code: "PT", name: "Portugal" },
  { value: "QA", label: "Qatar (QA)", code: "QA", name: "Qatar" },
  { value: "RU", label: "Russia (RU)", code: "RU", name: "Russia" },
  { value: "SE", label: "Sweden (SE)", code: "SE", name: "Sweden" },
  { value: "TH", label: "Thailand (TH)", code: "TH", name: "Thailand" },
  { value: "TR", label: "Turkey (TR)", code: "TR", name: "Turkey" },
  { value: "VN", label: "Vietnam (VN)", code: "VN", name: "Vietnam" },
  { value: "ZA", label: "South Africa (ZA)", code: "ZA", name: "South Africa" },
] as const;
