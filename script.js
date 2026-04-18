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
  const markRadius = radius - 38;

  romanNumerals.forEach((text, index) => {
    const angle = ((index * 30) - 90) * (Math.PI / 180);
    const x = Math.cos(angle) * markRadius;
    const y = Math.sin(angle) * markRadius;

    const mark = document.createElement("span");
    mark.className = "ring-mark";
    mark.textContent = text;
    mark.style.transform = `translate(${x}px, ${y}px) rotate(${index * 30}deg)`;

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

continents.forEach((continent) => {
  const name = continent.dataset.name || "Unknown";

  continent.addEventListener("mouseenter", () => {
    continents.forEach((item) => item.classList.remove("active"));
    continent.classList.add("active");
    setActiveContinent(name);
  });

  continent.addEventListener("mouseleave", () => {
    continent.classList.remove("active");
    resetLegend();
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
