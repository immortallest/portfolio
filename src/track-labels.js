/**
 * src/track-labels.js
 * ----------------------------------------------------------------------
 * Turns a tracking slug (e.g. "faq-2", "project-5", "dl-3-raw",
 * "contact-telegram") into something readable in a Telegram report,
 * instead of just the raw slug. EDIT THIS FILE alongside public/index.html
 * if you add/rename FAQ questions or projects — keep the numbering here
 * in sync with the data-track="..." attributes and #project-N ids there.
 * ----------------------------------------------------------------------
 */

const FAQ_LABELS = {
  "faq-1": "What kind of projects do you take on?",
  "faq-2": "Which tools do you work with?",
  "faq-3": "How do you handle sensitive or confidential data?",
  "faq-4": "How long does a typical project take?",
  "faq-5": "How do we get started?",
};

const PROJECT_LABELS = {
  "project-1": "Regional Sales Performance Dashboard",
  "project-2": "Customer Churn Risk Model",
  "project-3": "Marketing Campaign ROI Tracker",
  "project-4": "Inventory Demand Forecast",
  "project-5": "Automated Monthly Finance Report",
  "project-6": "Website Funnel Analysis",
  "project-7": "Employee Attrition Study",
  "project-8": "Supply Chain KPI Tracker",
};

const CONTACT_LABELS = {
  "contact-telegram": "Telegram",
  "contact-whatsapp": "WhatsApp",
  "contact-x": "X (Twitter)",
  "contact-linkedin": "LinkedIn",
  "contact-email": "Email",
};

export function labelFor(slug) {
  if (FAQ_LABELS[slug]) return `FAQ — ${FAQ_LABELS[slug]}`;
  if (PROJECT_LABELS[slug]) return `Project viewed — ${PROJECT_LABELS[slug]}`;
  if (CONTACT_LABELS[slug]) return `Contact method — ${CONTACT_LABELS[slug]}`;

  const dl = slug.match(/^dl-(\d+)-(raw|processed)$/);
  if (dl) {
    const projectSlug = `project-${dl[1]}`;
    const projectName = PROJECT_LABELS[projectSlug] || `project ${dl[1]}`;
    const kind = dl[2] === "raw" ? "raw data" : "processed data";
    return `Download (${kind}) — ${projectName}`;
  }

  return slug; // unrecognized slug — show it as-is rather than hiding it
}
