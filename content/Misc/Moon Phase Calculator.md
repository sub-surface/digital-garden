```dataviewjs
// Moon phase calculator (client-side)

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const day = now.getDate();

// Calculate moon phase using Conway's algorithm
function moonPhase(year, month, day) {
  let r = year % 100;
  r %= 19;
  if (r > 9) r -= 19;
  r = ((r * 11) % 30) + month + day;
  if (month < 3) r += 2;
  r -= ((year < 2000) ? 4 : 8.3);
  r = Math.floor(r + 0.5) % 30;
  return (r < 0) ? r + 30 : r;
}

const phase = moonPhase(year, month, day);
const illumination = Math.round(50 * (1 - Math.cos(phase * Math.PI / 14.765)));

// Phase names
const phaseNames = [
  "New Moon", "Waxing Crescent", "Waxing Crescent", "Waxing Crescent",
  "Waxing Crescent", "Waxing Crescent", "First Quarter", "First Quarter",
  "Waxing Gibbous", "Waxing Gibbous", "Waxing Gibbous", "Waxing Gibbous",
  "Waxing Gibbous", "Waxing Gibbous", "Full Moon", "Full Moon",
  "Waning Gibbous", "Waning Gibbous", "Waning Gibbous", "Waning Gibbous",
  "Waning Gibbous", "Waning Gibbous", "Last Quarter", "Last Quarter",
  "Waning Crescent", "Waning Crescent", "Waning Crescent", "Waning Crescent",
  "Waning Crescent", "Waning Crescent"
];

const phaseEmoji = ["🌑", "🌒", "🌒", "🌒", "🌒", "🌒", "🌓", "🌓",
  "🌔", "🌔", "🌔", "🌔", "🌔", "🌔", "🌕", "🌕",
  "🌖", "🌖", "🌖", "🌖", "🌖", "🌖", "🌗", "🌗",
  "🌘", "🌘", "🌘", "🌘", "🌘", "🌘"];

const phaseName = phaseNames[phase] ?? "Unknown";
const emoji = phaseEmoji[phase] ?? "🌙";

dv.paragraph(`${emoji} **${phaseName}** — ${illumination}% illuminated`);
```