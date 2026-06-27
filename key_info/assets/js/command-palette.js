// ---- Shared Command Palette ----
// Registry, matching, and execution used by both vim (:) and emacs (M-x) modes.
window.Portfolio = window.Portfolio || {};

// ---- Command Registry ----
const paletteCommands = [
  { aliases: ["about_me", "about me", "about"], action: "accordion", target: "about_me" },
  { aliases: ["experiences", "experience", "exp", "work"], action: "accordion", target: "experiences" },
  { aliases: ["education", "edu"], action: "accordion", target: "education" },
  { aliases: ["publications", "publication", "pubs", "pub"], action: "accordion", target: "publications" },
  { aliases: ["skills", "skill"], action: "accordion", target: "skills" },
  { aliases: ["sudo"], action: "sudo" },
  { aliases: ["blogs", "blog"], action: "navigate", target: "/blogs" },
  { aliases: ["resume", "cv"], action: "resume" },
  { aliases: ["toggle_dark_mode", "toggle_theme", "theme", "dark_mode"], action: "toggle_theme" },
  { aliases: ["home"], action: "navigate", target: "/" },
];

// Accordion title mapping
const accordionTitles = {
  about_me: "(Sorta) About Me",
  experiences: "Experience",
  education: "Education",
  publications: "Publications",
  skills: "Skills",
};

// ---- Matching ----
const computeMatches = (query, commands) => {
  const q = query.toLowerCase();
  if (!q) return [];
  const seen = new Set();
  const results = [];
  for (let i = 0; i < commands.length; i++) {
    for (const alias of commands[i].aliases) {
      if (alias.toLowerCase().includes(q)) {
        if (!seen.has(i)) {
          seen.add(i);
          results.push({ alias, cmdIndex: i });
        }
        break;
      }
    }
  }
  return results;
};

// ---- Execution ----
const executeCommand = (cmd) => {
  switch (cmd.action) {
    case "accordion": {
      const targetTitle = accordionTitles[cmd.target];
      if (!targetTitle) break;
      const headers = document.querySelectorAll("h2.accordion");
      for (const header of headers) {
        if (header.textContent.trim() === targetTitle) {
          const p = header.querySelector("p");
          if (p && window.Portfolio.expandAccordion) window.Portfolio.expandAccordion(p);
          break;
        }
      }
      break;
    }
    case "sudo":
      if (window.Portfolio.openSudoTerminal) window.Portfolio.openSudoTerminal();
      break;
    case "navigate":
      window.location.href = cmd.target;
      break;
    case "resume": {
      const a = document.createElement("a");
      a.href = "/ResumeRishavBanerjee.pdf";
      a.download = "";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      break;
    }
    case "toggle_theme":
      if (window.Portfolio.toggleTheme) window.Portfolio.toggleTheme();
      break;
  }
};

// ---- Helpers ----
const isInputFocused = () => {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

// ---- Public API ----
window.Portfolio.paletteCommands = paletteCommands;
window.Portfolio.computePaletteMatches = (query) => computeMatches(query, paletteCommands);
window.Portfolio.executePaletteCommand = executeCommand;
window.Portfolio.paletteIsInputFocused = isInputFocused;
