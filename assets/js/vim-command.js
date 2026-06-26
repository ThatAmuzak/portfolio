// ---- Command Registry ----
const vimCommands = [
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

// Accordion title mapping (used to locate the right h2.accordion element)
const accordionTitles = {
  about_me: "(Sorta) About Me",
  experiences: "Experience",
  education: "Education",
  publications: "Publications",
  skills: "Skills",
};

// ---- State ----
let vimActive = false;
let vimInput = "";
let vimMatches = []; // { alias, cmdIndex }
let vimSelectedIndex = 0;

// ---- DOM helpers ----
const getVimOverlay = () => document.getElementById("vim-command-overlay");
const getVimInput = () => document.getElementById("vim-command-input");
const getVimSuggestions = () => document.getElementById("vim-command-suggestions");
const getSudoOverlay = () => document.getElementById("sudo-terminal-overlay");

const isInputFocused = () => {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

// ---- Matching ----
const computeVimMatches = () => {
  const query = vimInput.toLowerCase();
  if (!query) return [];

  const seen = new Set();
  const results = [];

  for (let i = 0; i < vimCommands.length; i++) {
    for (const alias of vimCommands[i].aliases) {
      if (alias.toLowerCase().includes(query)) {
        if (!seen.has(i)) {
          seen.add(i);
          results.push({ alias, cmdIndex: i });
        }
        break; // first matching alias wins for display
      }
    }
  }

  return results;
};

// ---- Rendering ----
const renderVimSuggestions = () => {
  const container = getVimSuggestions();
  if (!container) return;

  // Hide only on exact match (case-insensitive)
  const exactMatch =
    vimMatches.length === 1 &&
    vimMatches[0].alias.toLowerCase() === vimInput.toLowerCase();

  if (exactMatch) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  // Always show suggestions bar otherwise
  container.classList.remove("hidden");
  container.innerHTML = "";

  if (vimMatches.length === 0) {
    if (vimInput.length > 0) {
      const span = document.createElement("span");
      span.textContent = "no matches";
      span.className = "px-2 py-1 text-gray-500 text-sm italic";
      container.appendChild(span);
    }
    return;
  }

  vimMatches.forEach((match, idx) => {
    const span = document.createElement("span");
    span.textContent = match.alias;
    span.className =
      "px-2 py-1 mx-0.5 rounded cursor-pointer font-mono text-sm " +
      (idx === vimSelectedIndex
        ? "bg-blue-500 text-white"
        : "bg-gray-700 text-gray-300 hover:bg-gray-600");
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      vimSelectedIndex = idx;
      executeVimCommand();
    });
    container.appendChild(span);
  });
};

const renderVimInput = () => {
  const input = getVimInput();
  if (input) input.textContent = vimInput;
};

// ---- Execution ----
const executeVimCommand = () => {
  if (vimMatches.length === 0 || vimSelectedIndex >= vimMatches.length) return;

  const cmd = vimCommands[vimMatches[vimSelectedIndex].cmdIndex];
  closeVimBar();

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

// ---- Open / Close ----
const openVimBar = () => {
  if (vimActive) return;
  const overlay = getVimOverlay();
  if (!overlay) return;

  vimActive = true;
  vimInput = "";
  vimMatches = [];
  vimSelectedIndex = 0;

  overlay.classList.remove("hidden");
  renderVimInput();
  renderVimSuggestions();
};

const closeVimBar = () => {
  vimActive = false;
  vimInput = "";
  vimMatches = [];
  vimSelectedIndex = 0;

  const overlay = getVimOverlay();
  if (overlay) overlay.classList.add("hidden");

  const suggestions = getVimSuggestions();
  if (suggestions) {
    suggestions.innerHTML = "";
    suggestions.classList.add("hidden");
  }

  const input = getVimInput();
  if (input) input.textContent = "";
};

// ---- Keyboard handling ----
document.addEventListener("keydown", (e) => {
  // Open vim bar on colon
  if (e.key === ":" && !vimActive && !isInputFocused()) {
    const sudoOverlay = getSudoOverlay();
    if (sudoOverlay && !sudoOverlay.classList.contains("hidden")) return;
    e.preventDefault();
    openVimBar();
    return;
  }

  if (!vimActive) return;

  const overlay = getVimOverlay();
  if (!overlay || overlay.classList.contains("hidden")) return;

  if (e.key === "Escape") {
    e.preventDefault();
    closeVimBar();
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    if (vimMatches.length > 0 && vimSelectedIndex < vimMatches.length) {
      executeVimCommand();
    } else {
      closeVimBar();
    }
    return;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    if (vimMatches.length === 0) return;
    if (vimMatches.length === 1) {
      // Autocomplete to the alias
      vimInput = vimMatches[0].alias;
      renderVimInput();
      vimMatches = computeVimMatches();
      vimSelectedIndex = 0;
      renderVimSuggestions();
    } else {
      // Cycle through matches
      vimSelectedIndex = (vimSelectedIndex + 1) % vimMatches.length;
      renderVimSuggestions();
    }
    return;
  }

  if (e.key === "Backspace") {
    e.preventDefault();
    vimInput = vimInput.slice(0, -1);
    renderVimInput();
    vimMatches = computeVimMatches();
    vimSelectedIndex = 0;
    renderVimSuggestions();
    return;
  }

  // Printable characters
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    vimInput += e.key;
    renderVimInput();
    vimMatches = computeVimMatches();
    vimSelectedIndex = 0;
    renderVimSuggestions();
  }
});
