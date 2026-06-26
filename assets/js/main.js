window.Portfolio = window.Portfolio || {};

// ---- Accordion helpers ----
const getAccordionHeaders = () =>
  Array.from(document.querySelectorAll(".accordion")).filter((acc) =>
    acc.nextElementSibling?.classList.contains("panel"),
  );

const resetSkillBars = () => {
  if (!document.querySelector("#skill-panel")) return;
  let skillBars = Array.from(document.querySelectorAll("#skill-percent"));
  skillBars.forEach((elem) => {
    elem.style.width = "0";
  });
};

const fillSkillBars = () => {
  let skillBars = Array.from(document.querySelectorAll("#skill-percent"));
  skillBars.forEach((elem) => {
    elem.style.width = elem.classList[0];
  });
};

const closeAccordion = (accordion) => {
  if (!accordion) return;
  accordion.classList.remove("active");
  const panel = accordion.nextElementSibling;
  if (panel?.classList.contains("panel")) {
    panel.style.maxHeight = null;
  }
  if (panel?.id === "skill-panel") {
    resetSkillBars();
  }
};

const openAccordion = (accordion) => {
  if (!accordion) return;
  const panel = accordion.nextElementSibling;
  if (!panel?.classList.contains("panel")) return;

  accordion.classList.add("active");
  panel.style.maxHeight = panel.scrollHeight + "px";
  if (panel.id === "skill-panel") {
    fillSkillBars();
  }
};

const updateAccordionToggleButton = () => {
  const button = document.querySelector("#accordion-toggle-button");
  if (!button) return;

  const accordions = getAccordionHeaders();
  const allExpanded =
    accordions.length > 0 &&
    accordions.every((accordion) => accordion.classList.contains("active"));

  const icon = button.querySelector("i");

  if (icon) {
    icon.classList.toggle("bi-chevron-double-down", !allExpanded);
    icon.classList.toggle("bi-chevron-double-up", allExpanded);
  }

  const label = allExpanded
    ? "Collapse all sections"
    : "Expand all sections";
  button.title = label;
  button.setAttribute("aria-label", label);
};

const collapseAllAccordions = () => {
  getAccordionHeaders().forEach((accordion) => closeAccordion(accordion));
  updateAccordionToggleButton();
};

const expandAllAccordions = () => {
  getAccordionHeaders().forEach((accordion) => openAccordion(accordion));
  updateAccordionToggleButton();
};

const toggleAllAccordions = () => {
  const accordions = getAccordionHeaders();
  const allExpanded =
    accordions.length > 0 &&
    accordions.every((accordion) => accordion.classList.contains("active"));

  if (allExpanded) {
    collapseAllAccordions();
  } else {
    expandAllAccordions();
  }
};

const expandAccordion = (elem) => {
  const currentAccordion = elem.closest(".accordion");
  if (!currentAccordion) return;

  const isActive = currentAccordion.classList.contains("active");
  if (isActive) {
    closeAccordion(currentAccordion);
    updateAccordionToggleButton();
    return;
  }

  getAccordionHeaders().forEach((accordion) => {
    if (accordion !== currentAccordion) {
      closeAccordion(accordion);
    }
  });
  openAccordion(currentAccordion);
  updateAccordionToggleButton();
};

// ---- Theme handling ----
let html = document.querySelector("html");
let theme = window.localStorage.getItem("theme");

const fixThemeToggleIcon = (theme) => {
  let themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    if (theme === "dark") {
      themeToggle.classList.remove("bi-moon");
      themeToggle.classList.add("bi-brightness-high");
    } else {
      themeToggle.classList.remove("bi-brightness-high");
      themeToggle.classList.add("bi-moon");
    }
  }
};

const setTheme = (theme) => {
  html.classList.remove("light");
  if (theme === "dark") {
    html.classList.add("dark");
    window.localStorage.setItem("theme", "dark");
  } else {
    html.classList.remove("dark");
    window.localStorage.setItem("theme", "light");
  }
  fixThemeToggleIcon(theme);
};

if (theme == null) {
  if (html.classList.contains("dark")) {
    theme = "dark";
  } else if (html.classList.contains("light")) {
    theme = "light";
  } else {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    if (prefersDark) {
      theme = "dark";
    } else {
      theme = "light";
    }
  }
}

setTheme(theme);

const toggleTheme = () => {
  html.classList.contains("dark") ? setTheme("light") : setTheme("dark");
};

// ---- Resize handling ----
const resizeOpenAccordions = () => {
  getAccordionHeaders().forEach((accordion) => {
    if (accordion.classList.contains("active")) {
      const panel = accordion.nextElementSibling;
      if (panel?.classList.contains("panel")) {
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    }
  });
};

// ---- Public API ----
window.Portfolio.expandAccordion = expandAccordion;
window.Portfolio.toggleTheme = toggleTheme;
window.Portfolio.toggleAllAccordions = toggleAllAccordions;
window.Portfolio.collapseAllAccordions = collapseAllAccordions;
window.Portfolio.expandAllAccordions = expandAllAccordions;

// ---- Init ----
window.addEventListener("load", () => {
  fixThemeToggleIcon(theme);
  resizeOpenAccordions();
  updateAccordionToggleButton();
});

window.addEventListener("resize", () => {
  resizeOpenAccordions();
  updateAccordionToggleButton();
});
