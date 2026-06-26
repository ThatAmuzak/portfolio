window.Portfolio = window.Portfolio || {};

const sudoTerminalScript = [
  {
    cmd: "sudo make me a sandwich",
    out: "[sudo] password for visitor: ********\nSorry, visitor is not in the sudoers file.\nThis incident will be reported.",
  },
  { cmd: "whoami", out: "a very tired researcher" },
  { cmd: "cat /dev/thoughts", out: "Segmentation fault (core dumped)" },
  {
    cmd: "sudo apt-get install social-life",
    out: "Reading package lists... Done\nE: Unable to locate package social-life\nHave you tried going outside?",
  }
];

const interactiveResponses = (() => {
  const responses = [
    "bash: command not found. also, this isn't a real shell. sorry to disappoint.",
    "Nice try. This terminal has all the compute power of a potato.",
    "Permission denied. This is a static website on Cloudflare Pages. I can't even store a variable.",
	"command executed successfully. (not really, nothing happened, nothing can happen)",
    "Segmentation fault. Just kidding. Can't crash what doesn't run.",
    "Error: terminal running on vibes and client-side JavaScript.",
    "I would run that, but I'm just a <div> wearing a terminal costume.",
    "404: command not found. Much like a real bash session, but somehow worse.",
  ];
  // Fisher–Yates shuffle
  for (let i = responses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [responses[i], responses[j]] = [responses[j], responses[i]];
  }
  return responses;
})();

let sudoTyping = false;
let sudoInteractive = false;
let sudoGeneration = 0;
let sudoResetTimer = null;
let sudoActiveInput = null;
let sudoInputLine = "";
let sudoResponseIndex = 0;

const createInteractivePrompt = () => {
  const body = document.getElementById("sudo-terminal-body");
  if (!body) return;

  const line = document.createElement("div");

  const prompt = document.createElement("span");
  prompt.className = "text-blue-400";
  prompt.textContent = "visitor@portfolio:~$ ";
  line.appendChild(prompt);

  const input = document.createElement("span");
  input.className = "text-green-400";
  line.appendChild(input);

  const cursor = document.createElement("span");
  cursor.className = "blinking-cursor";
  cursor.textContent = "█";
  line.appendChild(cursor);

  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
  sudoActiveInput = input;
  sudoInputLine = "";
};

const openSudoTerminal = () => {
  const overlay = document.getElementById("sudo-terminal-overlay");
  const body = document.getElementById("sudo-terminal-body");
  if (!overlay || !body) return;

  if (sudoResetTimer) clearTimeout(sudoResetTimer);

  sudoInteractive = false;
  sudoActiveInput = null;
  sudoInputLine = "";
  sudoResponseIndex = 0;

  const gen = ++sudoGeneration;

  overlay.classList.remove("hidden");
  body.innerHTML = "";
  sudoTyping = true;

  let scriptIndex = 0;

  const typeCommand = () => {
    if (gen !== sudoGeneration) return;
    if (scriptIndex >= sudoTerminalScript.length) {
      sudoTyping = false;
      sudoInteractive = true;
      createInteractivePrompt();
      return;
    }

    const { cmd, out } = sudoTerminalScript[scriptIndex];

    const promptLine = document.createElement("div");
    promptLine.innerHTML =
      '<span class="text-blue-400">visitor@portfolio:~$</span> ';
    body.appendChild(promptLine);

    let charIndex = 0;
    const typeCmd = () => {
      if (gen !== sudoGeneration) return;
      if (charIndex < cmd.length) {
        const typed = cmd.substring(0, charIndex + 1);
        promptLine.innerHTML =
          '<span class="text-blue-400">visitor@portfolio:~$</span> ' +
          typed;
        body.scrollTop = body.scrollHeight;
        charIndex++;
        setTimeout(typeCmd, 40 + Math.random() * 40);
      } else {
        setTimeout(() => {
          if (gen !== sudoGeneration) return;
          const outLine = document.createElement("div");
          outLine.className = "text-gray-300";
          outLine.textContent = out;
          body.appendChild(outLine);
          body.scrollTop = body.scrollHeight;
          scriptIndex++;
          setTimeout(typeCommand, 1300);
        }, 1000);
      }
    };

    typeCmd();
  };

  setTimeout(() => {
    if (gen !== sudoGeneration) return;
    typeCommand();
  }, 400);
};

const closeSudoTerminal = () => {
  const overlay = document.getElementById("sudo-terminal-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  sudoInteractive = false;
  sudoGeneration++;
  if (sudoResetTimer) clearTimeout(sudoResetTimer);
};

window.Portfolio.openSudoTerminal = openSudoTerminal;
window.Portfolio.closeSudoTerminal = closeSudoTerminal;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSudoTerminal();
    return;
  }

  if (!sudoInteractive) return;

  const overlay = document.getElementById("sudo-terminal-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return;

  const inputEl = sudoActiveInput;
  if (!inputEl) return;

  if (e.key === "Enter") {
    e.preventDefault();

    // Remove cursor from current line
    const cursor = inputEl.nextElementSibling;
    if (cursor?.classList.contains("blinking-cursor")) cursor.remove();

    // Show response
    const body = document.getElementById("sudo-terminal-body");
    const response = interactiveResponses[sudoResponseIndex % interactiveResponses.length];
    sudoResponseIndex++;

    const responseLine = document.createElement("div");
    responseLine.className = "text-gray-300";
    responseLine.textContent = response;
    body.appendChild(responseLine);
    body.scrollTop = body.scrollHeight;

    createInteractivePrompt();
  } else if (e.key === "Backspace") {
    e.preventDefault();
    sudoInputLine = sudoInputLine.slice(0, -1);
    inputEl.textContent = sudoInputLine;
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    sudoInputLine += e.key;
    inputEl.textContent = sudoInputLine;
  }
});
