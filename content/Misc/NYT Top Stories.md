```dataviewjs
// NYT Top 5 headlines – needs your NYT API key (https://developer.nytimes.com/)
const apiKey = "A5HryyNfw4R5mKw1Vc207Tms05T41Ak9";

const url = `https://api.nytimes.com/svc/topstories/v2/home.json?api-key=${apiKey}`;

try {
  const res = await fetch(url);
  if (!res.ok) {
    dv.paragraph(`NYT request failed: ${res.status} ${res.statusText}`);
  } else {
    const data = await res.json();
    const stories = (data.results || []).slice(0, 5);

    dv.table(
      ["Section", "Headline", "Link"],
      stories.map(s => [
        s.section || "",
        s.title || "",
        s.url ? `[link](${s.url})` : ""
      ])
    );
  }
} catch (e) {
  dv.paragraph(`NYT fetch error: ${e}`);
}

```
