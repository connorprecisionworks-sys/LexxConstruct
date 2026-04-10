export type CaseType =
  | "construction_delay"
  | "construction_defect"
  | "construction_payment"
  | "construction_general";

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  keywords: string[]; // used for fuzzy matching against document names + extracted content
  required: boolean;  // true = must-have, false = commonly expected
}

// ── General construction checklist ──────────────────────────────────────────
// Used when the specific dispute type is unclear. Forms the base for all
// type-specific checklists.

export const CONSTRUCTION_GENERAL_CHECKLIST: ChecklistItem[] = [
  {
    id: "prime_contract",
    label: "Prime contract (owner-GC agreement)",
    description: "The primary agreement between owner and general contractor",
    keywords: ["prime contract", "owner-contractor agreement", "owner-gc agreement", "general contract", "construction agreement", "AIA A101", "AIA A102", "stipulated sum"],
    required: true,
  },
  {
    id: "subcontracts",
    label: "Subcontracts",
    description: "Subcontract agreements with key subcontractors",
    keywords: ["subcontract", "subcontractor agreement", "sub-tier contract", "subcontract agreement"],
    required: true,
  },
  {
    id: "general_conditions",
    label: "General conditions and special conditions",
    description: "Contract general conditions and any supplementary or special conditions",
    keywords: ["general conditions", "special conditions", "supplementary conditions", "AIA A201", "contract conditions", "general requirements"],
    required: true,
  },
  {
    id: "specifications",
    label: "Technical specifications",
    description: "Project technical specifications by division or section",
    keywords: ["specification", "technical specification", "spec section", "division", "project manual", "CSI division"],
    required: true,
  },
  {
    id: "drawings",
    label: "Drawings / plans",
    description: "Construction drawings including architectural, structural, and MEP",
    keywords: ["drawing", "plans", "blueprint", "architectural", "structural", "sheet", "floor plan", "site plan", "construction drawing"],
    required: true,
  },
  {
    id: "schedule_of_values",
    label: "Schedule of values",
    description: "Cost breakdown of work items used to support pay applications",
    keywords: ["schedule of values", "SOV", "cost breakdown", "line item budget", "AIA G703"],
    required: true,
  },
  {
    id: "baseline_schedule",
    label: "Baseline schedule",
    description: "The approved as-planned project schedule",
    keywords: ["baseline schedule", "original schedule", "as-planned schedule", "project schedule", "CPM schedule", "Primavera", "MS Project", "master schedule"],
    required: true,
  },
  {
    id: "pay_applications",
    label: "Pay applications",
    description: "Contractor applications for payment submitted to the owner",
    keywords: ["pay application", "payment application", "AIA G702", "G703", "application for payment", "pay app", "progress payment"],
    required: true,
  },
  {
    id: "change_order_log",
    label: "Change order log",
    description: "Log of all change orders, potential change orders, and change directives",
    keywords: ["change order", "CO log", "change order log", "PCO", "potential change order", "construction change directive", "CCD", "change order register"],
    required: true,
  },
  {
    id: "rfi_log",
    label: "RFI log",
    description: "Log of all requests for information submitted during the project",
    keywords: ["RFI", "request for information", "RFI log", "RFI register", "RFI response"],
    required: true,
  },
  {
    id: "daily_logs",
    label: "Daily logs / superintendent reports",
    description: "Field superintendent daily reports documenting site conditions and progress",
    keywords: ["daily log", "daily report", "superintendent report", "field report", "construction diary", "daily field report", "job log"],
    required: true,
  },
  {
    id: "meeting_minutes",
    label: "Meeting minutes (OAC meetings)",
    description: "Minutes from owner-architect-contractor progress meetings",
    keywords: ["meeting minutes", "OAC meeting", "owner architect contractor", "project meeting", "progress meeting", "job meeting", "site meeting"],
    required: true,
  },
  {
    id: "notice_letters",
    label: "Notice letters / claim letters",
    description: "Formal notice letters, claim notices, and reservation of rights letters",
    keywords: ["notice", "claim letter", "notice of claim", "reservation of rights", "formal notice", "letter of intent", "default notice", "notice to cure"],
    required: true,
  },
  {
    id: "correspondence",
    label: "Correspondence (email archive)",
    description: "Project correspondence including emails and letters",
    keywords: ["correspondence", "email", "letter", "communication", "project email"],
    required: false,
  },
  {
    id: "photos",
    label: "Photographs / progress photos",
    description: "Site photographs documenting progress and conditions",
    keywords: ["photo", "photograph", "progress photo", "site photo", "image", "picture", "documentation photo"],
    required: false,
  },
  {
    id: "inspection_reports",
    label: "Inspection reports",
    description: "Third-party or owner inspection reports",
    keywords: ["inspection", "inspection report", "special inspection", "third-party inspection", "commissioning", "testing report"],
    required: false,
  },
  {
    id: "punch_list",
    label: "Punch list",
    description: "List of incomplete or non-conforming work items at project completion",
    keywords: ["punch list", "deficiency list", "punchlist", "incomplete work", "final inspection list", "correction list"],
    required: false,
  },
  {
    id: "cert_substantial_completion",
    label: "Certificate of substantial completion",
    description: "Official certificate establishing the date of substantial completion",
    keywords: ["certificate of substantial completion", "substantial completion", "AIA G704", "substantial completion date", "beneficial occupancy"],
    required: false,
  },
  {
    id: "cert_occupancy",
    label: "Certificate of occupancy",
    description: "Certificate of occupancy issued by the authority having jurisdiction",
    keywords: ["certificate of occupancy", "temporary certificate", "occupancy permit", "TCO", "final inspection approval"],
    required: false,
  },
];

// ── Delay-specific checklist ──────────────────────────────────────────────────

export const CONSTRUCTION_DELAY_CHECKLIST: ChecklistItem[] = [
  ...CONSTRUCTION_GENERAL_CHECKLIST,
  {
    id: "baseline_schedule_logic",
    label: "Baseline schedule with logic ties",
    description: "CPM schedule showing predecessor/successor relationships and critical path",
    keywords: ["baseline schedule", "logic ties", "predecessor", "successor", "critical path", "CPM", "network logic", "schedule logic", "as-planned schedule"],
    required: true,
  },
  {
    id: "monthly_schedule_updates",
    label: "Monthly schedule updates",
    description: "Monthly schedule updates showing progress against baseline",
    keywords: ["schedule update", "monthly update", "progress schedule", "updated schedule", "schedule revision", "period schedule", "as-built schedule"],
    required: true,
  },
  {
    id: "recovery_schedule",
    label: "Recovery schedule",
    description: "Schedule prepared in response to identified delays",
    keywords: ["recovery schedule", "acceleration", "revised schedule", "catch-up schedule", "mitigation schedule"],
    required: false,
  },
  {
    id: "time_impact_analysis",
    label: "Time impact analysis (TIA)",
    description: "Forensic schedule analysis quantifying delay impacts",
    keywords: ["time impact analysis", "TIA", "fragnet", "delay analysis", "schedule analysis", "critical path analysis", "forensic schedule"],
    required: false,
  },
  {
    id: "weather_records",
    label: "Weather records",
    description: "Weather data documenting rain days, temperature, and weather-related delays",
    keywords: ["weather", "rain day", "weather day", "temperature log", "NOAA", "weather report", "precipitation", "weather delay"],
    required: false,
  },
  {
    id: "force_majeure_notices",
    label: "Force majeure notices",
    description: "Notices asserting force majeure or excusable delay events",
    keywords: ["force majeure", "unforeseen conditions", "act of god", "pandemic", "force majeure notice", "excusable delay", "unforeseeable event"],
    required: false,
  },
  {
    id: "owner_directed_changes",
    label: "Owner-directed changes documentation",
    description: "Documentation of owner-directed changes and their schedule impacts",
    keywords: ["owner-directed", "owner direction", "directed change", "change directive", "unilateral change", "owner change", "scope change", "constructive change"],
    required: true,
  },
  {
    id: "expert_delay_report",
    label: "Expert delay report",
    description: "Expert scheduling report analyzing delay causation and impact",
    keywords: ["delay expert", "schedule expert", "forensic schedule", "expert report", "expert analysis", "delay opinion", "scheduling consultant"],
    required: false,
  },
];

// ── Defect-specific checklist ─────────────────────────────────────────────────

export const CONSTRUCTION_DEFECT_CHECKLIST: ChecklistItem[] = [
  ...CONSTRUCTION_GENERAL_CHECKLIST,
  {
    id: "defect_list",
    label: "Defect list / punch list",
    description: "Documented list of alleged defects or non-conforming work",
    keywords: ["defect", "deficiency", "punch list", "non-conforming work", "latent defect", "patent defect", "defect list", "warranty item"],
    required: true,
  },
  {
    id: "expert_engineering_report",
    label: "Expert engineering report(s)",
    description: "Expert or forensic engineering reports analyzing alleged defects",
    keywords: ["engineering report", "expert report", "forensic report", "expert analysis", "structural analysis", "forensic engineer", "building envelope", "defect investigation"],
    required: true,
  },
  {
    id: "destructive_testing",
    label: "Destructive testing reports",
    description: "Reports from destructive investigation of alleged defect conditions",
    keywords: ["destructive testing", "core sample", "invasive testing", "destructive investigation", "material testing", "opening", "probe"],
    required: false,
  },
  {
    id: "non_destructive_testing",
    label: "Non-destructive testing reports",
    description: "Infrared, moisture, or other non-invasive testing reports",
    keywords: ["non-destructive testing", "NDT", "infrared", "moisture survey", "borescope", "ground penetrating radar", "thermal imaging", "moisture intrusion"],
    required: false,
  },
  {
    id: "repair_estimates",
    label: "Repair estimates",
    description: "Cost estimates for remediation or repair of alleged defects",
    keywords: ["repair estimate", "repair cost", "remediation cost", "cost to repair", "contractor estimate", "repair bid", "remediation estimate"],
    required: true,
  },
  {
    id: "warranty",
    label: "Warranty documentation",
    description: "Contractor, subcontractor, and manufacturer warranty documentation",
    keywords: ["warranty", "guarantee", "manufacturer warranty", "workmanship warranty", "warranty period", "warranty claim", "warranty letter"],
    required: true,
  },
  {
    id: "manufacturer_product_data",
    label: "Manufacturer product data",
    description: "Submittals, data sheets, and installation requirements for materials at issue",
    keywords: ["product data", "manufacturer", "submittal", "data sheet", "specifications sheet", "installation instructions", "product approval", "MSDS"],
    required: false,
  },
  {
    id: "code_compliance",
    label: "Code compliance documentation",
    description: "Permit records, code citations, and inspection records",
    keywords: ["code compliance", "building code", "code violation", "permit", "inspection record", "certificate of compliance", "AHJ", "fire marshal", "building official"],
    required: true,
  },
  {
    id: "defect_photos",
    label: "Photographs of defective conditions",
    description: "Photographs documenting the alleged defective work or conditions",
    keywords: ["defect photo", "photograph", "condition photo", "damage photo", "deficiency photo", "site photo", "documentation photo", "defect documentation"],
    required: true,
  },
];

// ── Payment-specific checklist ───────────────────────────────────────────────

export const CONSTRUCTION_PAYMENT_CHECKLIST: ChecklistItem[] = [
  ...CONSTRUCTION_GENERAL_CHECKLIST,
  {
    id: "mechanics_lien",
    label: "Mechanic's lien filing",
    description: "Filed mechanic's or materialman's lien",
    keywords: ["mechanic's lien", "mechanics lien", "lien filing", "claim of lien", "materialman's lien", "contractor's lien", "lien claim"],
    required: true,
  },
  {
    id: "lien_waivers",
    label: "Lien waivers (conditional and unconditional)",
    description: "All conditional and unconditional lien waivers and releases",
    keywords: ["lien waiver", "conditional waiver", "unconditional waiver", "waiver and release", "progress waiver", "final waiver", "lien release"],
    required: true,
  },
  {
    id: "notice_of_commencement",
    label: "Notice of commencement",
    description: "Filed notice of commencement establishing the lien priority date",
    keywords: ["notice of commencement", "NOC", "commencement notice", "lien commencement"],
    required: true,
  },
  {
    id: "notice_to_owner",
    label: "Notice to owner",
    description: "Preliminary notice or notice to owner required for lien rights",
    keywords: ["notice to owner", "NTO", "preliminary notice", "pre-lien notice", "lien notice", "notice to general contractor"],
    required: true,
  },
  {
    id: "pay_apps_backup",
    label: "Pay applications with supporting backup",
    description: "All pay applications with certified payroll, lien releases, and backup documentation",
    keywords: ["pay application", "payment application", "backup", "certified payroll", "supporting documentation", "pay app backup", "stored materials"],
    required: true,
  },
  {
    id: "payment_bond",
    label: "Payment bond",
    description: "Payment bond (required on public projects and some private projects)",
    keywords: ["payment bond", "labor and material bond", "Miller Act", "Little Miller Act", "surety bond", "performance and payment bond"],
    required: true,
  },
  {
    id: "proof_of_delivery",
    label: "Proof of delivery of materials",
    description: "Delivery tickets, bills of lading, and material receipts",
    keywords: ["delivery ticket", "bill of lading", "proof of delivery", "material receipt", "receiving report", "shipping receipt", "material delivery"],
    required: false,
  },
  {
    id: "payment_correspondence",
    label: "Correspondence regarding payment disputes",
    description: "Letters and emails concerning withholding, disputed amounts, or non-payment",
    keywords: ["payment dispute", "withholding", "underpayment", "wrongful withholding", "payment claim", "disputed payment", "payment objection", "application rejection"],
    required: true,
  },
];

export function getChecklist(caseType: CaseType): ChecklistItem[] {
  switch (caseType) {
    case "construction_delay":
      return CONSTRUCTION_DELAY_CHECKLIST;
    case "construction_defect":
      return CONSTRUCTION_DEFECT_CHECKLIST;
    case "construction_payment":
      return CONSTRUCTION_PAYMENT_CHECKLIST;
    case "construction_general":
      return CONSTRUCTION_GENERAL_CHECKLIST;
  }
}
