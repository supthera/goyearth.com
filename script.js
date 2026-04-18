const ring = document.getElementById("timeRing");
const legendName = document.querySelector(".active-name");
const legendNote = document.querySelector(".active-note");
const continents = [...document.querySelectorAll(".continent")];

const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function placeRingMarks() {
  if (!ring) {
    return;
  }

  const ringRect = ring.getBoundingClientRect();
  const radius = ringRect.width / 2;
  const borderWidth = parseFloat(getComputedStyle(ring).borderTopWidth);
  const markRadius = radius - borderWidth * 0.65;

  romanNumerals.forEach((text, index) => {
    const angle = ((index * 30) - 90) * (Math.PI / 180);
    const x = Math.cos(angle) * markRadius;
    const y = Math.sin(angle) * markRadius;

    const mark = document.createElement("span");
    mark.className = "ring-mark";
    mark.textContent = text;
    mark.style.left = `calc(50% + ${x}px)`;
    mark.style.top = `calc(50% + ${y}px)`;
    mark.style.transform = `translate(-50%, -50%) rotate(${index * 30}deg)`;

    ring.appendChild(mark);
  });
}

function clearRingMarks() {
  const marks = ring.querySelectorAll(".ring-mark");
  marks.forEach((mark) => mark.remove());
}

function setActiveContinent(name) {
  legendName.textContent = name;
  legendNote.textContent = `Highlighted component: ${name}`;
}

function resetLegend() {
  legendName.textContent = "Hover a landmass";
  legendNote.textContent = "Each component responds independently.";
}

const tooltip = document.createElement("div");
tooltip.className = "map-tooltip";
document.body.appendChild(tooltip);

continents.forEach((continent) => {
  const name = continent.dataset.name || "Unknown";

  continent.addEventListener("mouseenter", () => {
    continents.forEach((item) => item.classList.remove("active"));
    continent.classList.add("active");
    setActiveContinent(name);
    tooltip.textContent = name;
    tooltip.classList.add("visible");
  });

  continent.addEventListener("mousemove", (e) => {
    tooltip.style.left = e.clientX + 14 + "px";
    tooltip.style.top = e.clientY + 14 + "px";
  });

  continent.addEventListener("mouseleave", () => {
    continent.classList.remove("active");
    resetLegend();
    tooltip.classList.remove("visible");
  });

  continent.addEventListener("focus", () => {
    continents.forEach((item) => item.classList.remove("active"));
    continent.classList.add("active");
    setActiveContinent(name);
  });

  continent.addEventListener("blur", () => {
    continent.classList.remove("active");
    resetLegend();
  });
});

window.addEventListener("resize", () => {
  clearRingMarks();
  placeRingMarks();
});

placeRingMarks();
