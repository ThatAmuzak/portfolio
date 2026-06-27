// ---- Command Palette ----
// Triggered by : (vim-style) or Alt+x / M-x (emacs-style).
// Command registry, matching, and execution live in command-palette.js.
// This file handles the overlay UI and keyboard input.

// ---- State ----
let paletteActive = false;
let paletteMode = "vim";   // "vim" or "emacs"
let paletteInput = "";
let paletteMatches = [];
let paletteSelectedIndex = 0;

// ---- prompt prefix per mode ----
const promptPrefix = { vim: ":", emacs: "M-x" };

// ---- DOM helpers ----
const getPaletteOverlay = () => document.getElementById("vim-command-overlay");
const getPaletteInput = () => document.getElementById("vim-command-input");
const getPaletteSuggestions = () => document.getElementById("vim-command-suggestions");
const getPalettePrompt = () => document.getElementById("vim-command-prompt");
const getSudoOverlay = () => document.getElementById("sudo-terminal-overlay");

// ---- Rendering ----
const renderPaletteSuggestions = () => {
  const container = getPaletteSuggestions();
  if (!container) return;

  const exactMatch =
    paletteMatches.length === 1 &&
    paletteMatches[0].alias.toLowerCase() === paletteInput.toLowerCase();

  if (exactMatch) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = "";

  if (paletteMatches.length === 0) {
    if (paletteInput.length > 0) {
      const span = document.createElement("span");
      span.textContent = "no matches";
      span.className = "px-2 py-1 text-gray-500 text-sm italic";
      container.appendChild(span);
    }
    return;
  }

  paletteMatches.forEach((match, idx) => {
    const span = document.createElement("span");
    span.textContent = match.alias;
    span.className =
      "px-2 py-1 mx-0.5 rounded cursor-pointer font-mono text-sm " +
      (idx === paletteSelectedIndex
        ? "bg-blue-500 text-white"
        : "bg-gray-700 text-gray-300 hover:bg-gray-600");
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      paletteSelectedIndex = idx;
      executePaletteCommand();
    });
    container.appendChild(span);
  });
};

const renderPaletteInput = () => {
  const input = getPaletteInput();
  if (input) input.textContent = paletteInput;
};

const renderPalettePrompt = () => {
  const prompt = getPalettePrompt();
  if (prompt) prompt.textContent = promptPrefix[paletteMode];
};

// ---- Execution ----
const executePaletteCommand = () => {
  if (paletteMatches.length === 0 || paletteSelectedIndex >= paletteMatches.length) return;

  const cmd = window.Portfolio.paletteCommands[paletteMatches[paletteSelectedIndex].cmdIndex];
  closePaletteBar();
  window.Portfolio.executePaletteCommand(cmd);
};

// ---- Open / Close ----
const openPaletteBar = (mode) => {
  if (paletteActive) return;
  const overlay = getPaletteOverlay();
  if (!overlay) return;

  paletteActive = true;
  paletteMode = mode;
  paletteInput = "";
  paletteMatches = [];
  paletteSelectedIndex = 0;

  overlay.classList.remove("hidden");
  renderPalettePrompt();
  renderPaletteInput();
  renderPaletteSuggestions();
};

const closePaletteBar = () => {
  paletteActive = false;
  paletteMode = "vim";
  paletteInput = "";
  paletteMatches = [];
  paletteSelectedIndex = 0;

  const overlay = getPaletteOverlay();
  if (overlay) overlay.classList.add("hidden");

  const suggestions = getPaletteSuggestions();
  if (suggestions) {
    suggestions.innerHTML = "";
    suggestions.classList.add("hidden");
  }

  const input = getPaletteInput();
  if (input) input.textContent = "";
};

// ---- Keyboard handling ----
document.addEventListener("keydown", (e) => {
  const isInputFocused = window.Portfolio.paletteIsInputFocused;

  // Open on : (vim) or Alt+x / M-x (emacs)
  if (!paletteActive && !isInputFocused()) {
    const sudoOverlay = getSudoOverlay();
    if (sudoOverlay && !sudoOverlay.classList.contains("hidden")) return;

    if (e.key === ":") {
      e.preventDefault();
      openPaletteBar("vim");
      return;
    }

    // Alt+x (handles both Alt and Meta for macOS Option key)
    if ((e.altKey || e.metaKey) && e.key.toLowerCase() === "x" && !e.ctrlKey) {
      e.preventDefault();
      openPaletteBar("emacs");
      return;
    }
  }

  if (!paletteActive) return;

  const overlay = getPaletteOverlay();
  if (!overlay || overlay.classList.contains("hidden")) return;

  // Emacs C-g cancels, same as Escape
  if (e.key === "Escape" || (e.ctrlKey && e.key === "g")) {
    e.preventDefault();
    closePaletteBar();
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    if (paletteMatches.length > 0 && paletteSelectedIndex < paletteMatches.length) {
      executePaletteCommand();
    } else {
      closePaletteBar();
    }
    return;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    if (paletteMatches.length === 0) return;
    if (paletteMatches.length === 1) {
      paletteInput = paletteMatches[0].alias;
      renderPaletteInput();
      paletteMatches = window.Portfolio.computePaletteMatches(paletteInput);
      paletteSelectedIndex = 0;
      renderPaletteSuggestions();
    } else {
      paletteSelectedIndex = (paletteSelectedIndex + 1) % paletteMatches.length;
      renderPaletteSuggestions();
    }
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (paletteMatches.length > 0) {
      paletteSelectedIndex = (paletteSelectedIndex + 1) % paletteMatches.length;
      renderPaletteSuggestions();
    }
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (paletteMatches.length > 0) {
      paletteSelectedIndex = (paletteSelectedIndex - 1 + paletteMatches.length) % paletteMatches.length;
      renderPaletteSuggestions();
    }
    return;
  }

  if (e.key === "Backspace") {
    e.preventDefault();
    paletteInput = paletteInput.slice(0, -1);
    renderPaletteInput();
    paletteMatches = window.Portfolio.computePaletteMatches(paletteInput);
    paletteSelectedIndex = 0;
    renderPaletteSuggestions();
    return;
  }

  // Printable characters
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    paletteInput += e.key;
    renderPaletteInput();
    paletteMatches = window.Portfolio.computePaletteMatches(paletteInput);
    paletteSelectedIndex = 0;
    renderPaletteSuggestions();
  }
});
