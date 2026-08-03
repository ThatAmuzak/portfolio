//──────────────────────────────────────────────────────────────────────────────
// Type definitions for all YAML data files
//──────────────────────────────────────────────────────────────────────────────

// --- site.yaml ---

export interface SocialLink {
  label: string;
  url: string;
  icon: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

export interface Site {
  title: string;
  description: string;
  name: string;
  email: string;
  lang: string;
  ogImage?: string;
  themeColor?: string;
  social: SocialLink[];
  nav: NavItem[];
}

// --- hero.yaml ---

export interface CTA {
  label: string;
  href: string;
  icon?: string;
}

export interface Hero {
  subtitle: string;
  name: string;
  icon?: string;
  description?: string;
  cta?: {
    resume?: CTA;
    blogs?: CTA & { icon?: string };
    connect?: CTA;
  };
}

// --- about.yaml ---

export interface AboutSegment {
  text: string;
  bold?: boolean;
  href?: string;
}

export interface AboutParagraph {
  segments: AboutSegment[];
}

export interface AboutStat {
  value: string;
  label: string;
  icon?: string;
}

export interface About {
  label?: string;
  heading?: string;
  paragraphs: AboutParagraph[];
  stats?: AboutStat[];
}

// --- experience.yaml ---

export interface Job {
  company: string;
  url?: string;
  role: string;
  location?: string;
  dateRange: string;
  description?: string;
  details?: string[];
  tech?: string[];
}

export interface Experience {
  label?: string;
  heading?: string;
  jobs: Job[];
}

// --- publications.yaml ---

export interface Author {
  name: string;
  bold?: boolean;
}

export interface Paper {
  title: string;
  authors: Author[];
  venue?: string;
  year?: string;
  url?: string;
}

export interface Publications {
  label?: string;
  heading?: string;
  papers: Paper[];
}

// --- skills.yaml ---

export interface SkillCategory {
  name: string;
  icon?: string;
  items: string[];
}

export interface Skills {
  label?: string;
  heading?: string;
  categories: SkillCategory[];
}

// --- education.yaml ---

export interface DegreeHighlight {
  text: string;
  icon?: string;
  featured?: boolean;
}

export interface Degree {
  degree: string;
  institution: string;
  url?: string;
  dateRange: string;
  gpa?: string;
  highlights?: DegreeHighlight[];
}

export interface Education {
  label?: string;
  heading?: string;
  degrees: Degree[];
}

// --- contact.yaml ---

export interface ContactCTA {
  label: string;
  href: string;
  icon?: string;
}

export interface FooterData {
  copyrightPrefix?: string;
  copyrightLinkLabel?: string;
  copyrightLinkUrl?: string;
  copyrightSuffix?: string;
  iconsAttribution?: string;
  iconsUrl?: string;
}

export interface Contact {
  label?: string;
  heading?: string;
  description?: string;
  emailIcon?: string;
  cta?: ContactCTA[];
  footer?: FooterData;
}

// --- canvas toys (boids, particles, etc.) ---

/**
 * A self-describing canvas toy that can be plugged into the CanvasToy panel.
 * Each toy provides its own metadata (button label, icon, instructions,
 * footer explanation) and a `start` function that wires up the canvas and
 * returns a cleanup function to tear it down.
 */
export interface CanvasToy {
  /** Unique id, e.g. "boids", "particles", "life" */
  id: string;
  /** HTML string for the header bar (instructions, controls hint) */
  headerHtml: string;
  /** HTML string for the footer bar (title + explanation) */
  footerHtml: string;
  /**
   * Attach the simulation to a <canvas> element.
   * Returns a cleanup function (call to stop & detach).
   */
  start: (canvas: HTMLCanvasElement) => () => void;
  /**
   * Optional: render custom controls into the header bar.
   * Called with a container element; should append controls inside it.
   * Returns an optional cleanup function called when the toy is switched or closed.
   */
  renderHeaderControls?: (container: HTMLElement) => (() => void) | void;
}
