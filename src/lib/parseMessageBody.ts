export type MessageToken =
  | { type: "text"; value: string }
  | { type: "emote"; name: string }
  | { type: "image"; url: string }
  | { type: "video"; url: string }
  | { type: "youtube"; videoId: string; url: string }
  | { type: "twitter"; username: string; url: string }
  | { type: "url"; url: string; label: string }
  | { type: "footnote-ref"; index: number };

const EMOTE_RE = /^:[a-z0-9-]+:$/;
const MARKDOWN_IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const FOOTNOTE_DEF_RE = /^\[\^(\d+)\]:\s*(.+)$/
const FOOTNOTE_REF_RE = /^\[\^(\d+)\]$/
const IMAGE_EXT_RE = /\.(?:jpg|jpeg|png|gif|webp)(?:[?#].*)?$/i;
const VIDEO_EXT_RE = /\.(?:mp4|webm|mov|ogg)(?:[?#].*)?$/i;
const IMAGE_CDN_HOSTS = new Set([
  "i.imgur.com",
  "pbs.twimg.com",
  "media.tenor.com",
  "cdn.discordapp.com",
  "i.giphy.com",
]);
const URL_RE = /^https?:\/\//i;

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" && parsed.searchParams.has("v")) {
      const id = parsed.searchParams.get("v");
      return id && id.length > 0 ? id : null;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id && id.length > 0 ? id : null;
    }
  } catch {
    // malformed URL
  }
  return null;
}

function extractTwitterInfo(url: string): { username: string } | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "")
    if (host !== "twitter.com" && host !== "x.com") return null
    // Match /{username}/status/{id}
    const match = parsed.pathname.match(/^\/([^/]+)\/status\/\d+/)
    if (!match) return null
    return { username: match[1] }
  } catch {
    return null
  }
}

function isImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (IMAGE_CDN_HOSTS.has(host)) return true;
    if (IMAGE_EXT_RE.test(parsed.pathname)) return true;
  } catch {
    // malformed URL
  }
  return false;
}

function isVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return VIDEO_EXT_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Tokenise a single whitespace-delimited word that is known to start with
// http(s):// or is a markdown image. Returns null if it cannot be classified
// as anything special.
function classifyWord(
  word: string,
  embedUsed: boolean
): Exclude<MessageToken, { type: "text" }> | null {
  // Markdown image: ![alt](url)
  const mdImg = MARKDOWN_IMAGE_RE.exec(word);
  if (mdImg) {
    const url = mdImg[2];
    if (!embedUsed) {
      return { type: "image", url };
    }
    return { type: "url", url, label: getHostname(url) };
  }

  if (!URL_RE.test(word)) return null;

  // Strip trailing punctuation that is unlikely to be part of the URL
  // (commas, periods, closing parens/brackets) so prose reads correctly.
  let url = word;
  const trailingPunct = /[.,!?)]+$/.exec(url);
  if (trailingPunct) {
    url = url.slice(0, url.length - trailingPunct[0].length);
  }

  if (url.length === 0) return null;

  // YouTube
  const ytId = extractYouTubeId(url);
  if (ytId !== null) {
    if (!embedUsed) {
      return { type: "youtube", videoId: ytId, url };
    }
    return { type: "url", url, label: getHostname(url) };
  }

  // Twitter/X status
  const twitterMatch = extractTwitterInfo(url)
  if (twitterMatch) {
    if (!embedUsed) {
      return { type: "twitter", username: twitterMatch.username, url }
    }
    return { type: "url", url, label: getHostname(url) }
  }

  // Video URL
  if (isVideoUrl(url)) {
    if (!embedUsed) {
      return { type: "video", url };
    }
    return { type: "url", url, label: getHostname(url) };
  }

  // Image URL
  if (isImageUrl(url)) {
    if (!embedUsed) {
      return { type: "image", url };
    }
    return { type: "url", url, label: getHostname(url) };
  }

  return { type: "url", url, label: getHostname(url) };
}

export function parseMessageBody(text: string): MessageToken[] {
  if (text.length === 0) return [];

  // Split into segments: we want to split on whitespace while preserving the
  // whitespace itself so that text tokens can include spacing between words.
  // Strategy: split into alternating [non-ws, ws, non-ws, ...] chunks.
  const parts = text.split(/(\s+)/);

  const tokens: MessageToken[] = [];
  let pendingText = "";
  let embedUsed = false;

  function flushText() {
    if (pendingText.length > 0) {
      tokens.push({ type: "text", value: pendingText });
      pendingText = "";
    }
  }

  for (const part of parts) {
    // Pure whitespace — always accumulate as text
    if (/^\s+$/.test(part)) {
      pendingText += part;
      continue;
    }

    if (part.length === 0) continue;

    if (FOOTNOTE_REF_RE.test(part)) {
      flushText()
      tokens.push({ type: "footnote-ref", index: Number(part.slice(2, -1)) })
      continue
    }

    // Check emote: must be exactly :name: with no surrounding content
    if (EMOTE_RE.test(part)) {
      flushText();
      tokens.push({ type: "emote", name: part.slice(1, -1) });
      continue;
    }

    // Check markdown image or URL
    const isMarkdownImage = MARKDOWN_IMAGE_RE.test(part);
    const isUrl = URL_RE.test(part);

    if (isMarkdownImage || isUrl) {
      const classified = classifyWord(part, embedUsed);
      if (classified !== null) {
        flushText();
        tokens.push(classified);
        if (classified.type === "image" || classified.type === "video" || classified.type === "youtube" || classified.type === "twitter") {
          embedUsed = true;
        }
        // If the original word had trailing punctuation that was stripped,
        // emit that punctuation as a text token.
        if (isUrl && !isMarkdownImage) {
          const strippedUrl =
            classified.type === "url"
              ? classified.url
              : classified.type === "image"
              ? classified.url
              : classified.type === "video"
              ? classified.url
              : classified.type === "youtube"
              ? classified.url
              : classified.type === "twitter"
              ? classified.url
              : "";
          if (strippedUrl.length < part.length) {
            const trailing = part.slice(strippedUrl.length);
            pendingText += trailing;
          }
        }
        continue;
      }
    }

    // Plain text word
    pendingText += part;
  }

  flushText();

  // Merge adjacent text tokens (can arise from punctuation flushing)
  const merged: MessageToken[] = [];
  for (const tok of tokens) {
    if (
      tok.type === "text" &&
      merged.length > 0 &&
      merged[merged.length - 1].type === "text"
    ) {
      (merged[merged.length - 1] as { type: "text"; value: string }).value +=
        tok.value;
    } else {
      merged.push(tok);
    }
  }

  return merged;
}

export interface ParsedMessage {
  tokens: MessageToken[]
  footnotes: Map<number, string>
}

export function parseMessageBodyWithFootnotes(text: string): ParsedMessage {
  const footnotes = new Map<number, string>()
  const bodyLines: string[] = []
  for (const line of text.split("\n")) {
    const defMatch = FOOTNOTE_DEF_RE.exec(line.trim())
    if (defMatch) {
      footnotes.set(Number(defMatch[1]), defMatch[2])
    } else {
      bodyLines.push(line)
    }
  }
  const tokens = parseMessageBody(bodyLines.join("\n"))
  return { tokens, footnotes }
}
