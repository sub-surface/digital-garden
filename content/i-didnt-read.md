---
title: I didn't read all that lol
description: But, like, I read some of it. And I think I got the gist of it. But, like, I didn't read all of it. So, like, don't ask me about it. Because I didn't read all of it.
tags:
  - thoughts
created: 2026-08-01
id: blog
layout: article
growth: becoming
---

I ain't read all that.

I'm happy for you. Or sorry that happened. I have been holding both of those in superposition since Tuesday and I'm not going to collapse the wavefunction by opening the link a second time.[^superposition]

But I want to be clear, because I think this is where people get me twisted: I *opened* it. The tab existed. The tab **still** exists, four devices deep, syncing across continents, a small blue candle burning for a thing I will never finish. Do not tell me I didn't engage with your content.

---

## The complete record of my reading

| What | Time on screen | What I retained |
|---|---|---|
| The title | 1.4 s | Perfectly. Verbatim. I would get it tattooed. |
| The first sentence | 3.0 s | It began. That much I'm sure of. |
| Paragraphs two through nine | 0.4 s | A colour. A general mood. Blue-ish. |
| One middle paragraph, selected at random | 11.0 s | The word *ultimately*. Load-bearing, obviously. |
| The pull quote | 2.0 s | Agreed with it. Still do. Would die for it. |
| The bit with the numbers in it | — | Numbers are essentially an appendix. |
| The last two words | 0.5 s | Devastating. No notes. Genuinely floored. |

**Total engagement: 18.3 seconds.** The article's own stated read time was twenty-four minutes, which means I extracted the full argument at roughly 7,800% efficiency, and frankly nobody has congratulated me for that yet.

---

## The gist theorem

People act like comprehension is about *volume*. It isn't. It's a ratio:

$$\text{Comprehension} = \frac{\varepsilon}{L} \cdot K$$

where $\varepsilon$ is the number of words actually read, $L$ is the total length, and $K$ is confidence.

Note that $K$ is unbounded above. This is the entire trick. This is why comprehension can exceed 1, and it is why, on a good day, with the right amount of $K$, I understand an article **better than the person who wrote it**.

> [!warning] Do not quiz me
> The gist is a delicate structure. It is load-bearing but it is not *inspectable*. If you poke it with a specific question it will fall over and take my whole personality with it.

---

## Here is the gist, since you asked

> It's basically about how everything is kind of a network now, and that's bad. Or good. It's about how that's *significant*. And then at the end he sort of turns it around on you, which I respected.

I would like it noted that at no point did anyone verify whether the piece had an author, a thesis, or the word "network" anywhere in it. That's on you for asking me to check.

---

## Questions I am fully prepared to answer

- Whether it was *good* — yes
- Whether it was *long* — devastatingly
- Whether it "really made you think" — it did, about other things, constantly, the entire time
- Whether you should read it — absolutely, and then tell me about it, and I will nod at the parts I recognise

## Questions I am not taking at this time

- What it said
- Who wrote it
- What the numbers were
- What happened after the pull quote
- The title[^title]

---

## My actual process, documented for science

```js
function read(link) {
  const gist = link.title.split(":")[0]          // the colon is padding
  if (scrollDepth() > 0.1) confidence += 40      // earned it
  if (encountered("ultimately")) return gist     // the argument has concluded
  return "so true"                               // ship it
}
```

I have run this in production for eleven years. Zero incidents.[^incidents]

- [x] Opened the link
- [x] Scrolled with real intent
- [x] Felt something
- [ ] Read the link

Three out of four. In most systems that's a pass. In some systems that's a **distinction**.

---

Anyway. Send me another one. I'll open that too, I'll hold it in the tab bar like a hostage, and in eight months I will bring it up at dinner as though I have lived inside it. I'll say *"ultimately, though"* and you'll say *"exactly"* and neither of us will ever know.

I'm happy for you. Or sorry that happened.

[^superposition]: Observation is the failure mode here. The link is only unread once you check.
[^title]: I retained the title perfectly and I will not be reproducing it, because the moment I say it out loud you'll ask a follow-up and we both know how that ends.
[^incidents]: One incident. I confidently summarised a recipe as a manifesto. In fairness to me, it was.
