```dataviewjs
// DataviewJS: Weather + Solar times for Cardiff

const latitude = 51.48;
const longitude = -3.18;

const url =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${latitude}` +
  `&longitude=${longitude}` +
  `&current=weather_code,is_day` +
  `&daily=sunrise,sunset,daylight_duration,uv_index_max` +
  `&timezone=auto`;

try {
  const res = await fetch(url);

  if (!res.ok) {
    dv.paragraph(`Couldn't fetch weather (${res.status}).`);
  } else {
    const data = await res.json();
    const current = data.current ?? {};
    const daily = data.daily ?? {};
    const code = current.weather_code;
    const isDay = current.is_day === 1;

    // WMO weather codes
    const codeDescriptions = {
      0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
      45: "fog", 48: "rime fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
      61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow",
      75: "heavy snow", 80: "rain showers", 81: "heavy showers", 82: "violent showers",
      95: "thunderstorm", 96: "thunderstorm with hail"
    };
    const desc = codeDescriptions[code] ?? "uncertain conditions";

    // Parse times
    const sunrise = daily.sunrise?.[0] ? new Date(daily.sunrise[0]) : null;
    const sunset = daily.sunset?.[0] ? new Date(daily.sunset[0]) : null;
    const daylightMins = daily.daylight_duration?.[0] ? Math.round(daily.daylight_duration[0] / 60) : null;
    const uvMax = daily.uv_index_max?.[0] ?? null;

    const fmt = (d) => d ? d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '??';

    // Golden hour: ~1hr after sunrise, ~1hr before sunset
    let goldenMorning = sunrise ? new Date(sunrise.getTime() + 60*60*1000) : null;
    let goldenEvening = sunset ? new Date(sunset.getTime() - 60*60*1000) : null;

    // Weather message
    const sunnyCodes = [0, 1, 2];
    const sunShining = isDay && sunnyCodes.includes(code);
    let weatherMsg = sunShining
      ? `The sun is out in Cardiff — ${desc}.`
      : isDay
        ? `Daytime in Cardiff, but grey — ${desc}.`
        : `Night in Cardiff — ${desc}.`;

    // Build output
    dv.paragraph(weatherMsg);
    dv.paragraph(`**Sunrise** ${fmt(sunrise)} · **Sunset** ${fmt(sunset)} · *${daylightMins ? Math.floor(daylightMins/60) + 'h ' + (daylightMins%60) + 'm daylight' : ''}*`);
    dv.paragraph(`**Golden hour**: ${fmt(sunrise)}–${fmt(goldenMorning)} morning · ${fmt(goldenEvening)}–${fmt(sunset)} evening`);
    if (uvMax !== null) dv.paragraph(`Peak UV index: ${uvMax}`);
  }
} catch (e) {
  dv.paragraph(`Weather error: ${e}`);
}
```