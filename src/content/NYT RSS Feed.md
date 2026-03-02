
```dataviewjs

const url = "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml";

try {
  const res = await fetch(url);
  if (!res.ok) {
    dv.paragraph(`NYT RSS request failed: ${res.status} ${res.statusText}`);
  } else {
    const xmlText = await res.text();
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");

    const items = Array.from(doc.querySelectorAll("item")).slice(0, 25);

    dv.table(
      ["Title", "Category", "Published", "Link"],
      items.map(item => {
        const title   = item.querySelector("title")?.textContent?.trim() ?? "";
        const link    = item.querySelector("link")?.textContent?.trim() ?? "";
        const category= item.querySelector("category")?.textContent?.trim() ?? "";
        const pubDate = item.querySelector("pubDate")?.textContent?.trim() ?? "";
        return [title, category, pubDate, link ? `[link](${link})` : ""];
      })
    );
  }
} catch (e) {
  dv.paragraph(`NYT RSS fetch error: ${e}`);
}

```
