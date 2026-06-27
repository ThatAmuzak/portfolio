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

// --- projects.yaml ---

export interface ProjectStatus {
  label: string;
  color?: string;
}

export interface ProjectLink {
  url: string;
  icon: string;
  label: string;
}

export interface Project {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  status: string;
  featured: boolean;
  links: ProjectLink[];
  tech: string[];
}

export interface Projects {
  label?: string;
  heading?: string;
  statuses: ProjectStatus[];
  items: Project[];
}
