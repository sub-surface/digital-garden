import styles from "./PrivacyPage.module.scss"

export function PrivacyPage() {
  return (
    <div className={styles.privacy}>
      <h1>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: 16 March 2026</p>

      <h2>What data we collect</h2>
      <p>
        When you create an account, we store your email address, chosen username,
        and optional profile information (bio, avatar). Chat messages you send are
        stored alongside your user ID. Bookmark and edit history data is stored for
        authenticated users.
      </p>

      <h2>How we use your data</h2>
      <p>
        Your data is used solely to provide site functionality: authentication,
        chat, wiki editing, and bookmarks. We do not sell, share, or use your data
        for advertising.
      </p>

      <h2>Cookies</h2>
      <p>
        This site uses a cross-subdomain authentication cookie (domain:
        .subsurfaces.net) to maintain your session across subsurfaces.net,
        wiki.subsurfaces.net, and chat.subsurfaces.net. If you reject cookies via
        the consent banner, authentication falls back to localStorage and sessions
        will not persist across subdomains.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li><strong>Supabase</strong> (EU-West) — authentication, database, file storage</li>
        <li><strong>Cloudflare</strong> — hosting, CDN, DDoS protection</li>
        <li><strong>Cloudflare Turnstile</strong> — bot protection on forms</li>
        <li><strong>Google Fonts</strong> — typeface delivery</li>
      </ul>

      <h2>Data retention</h2>
      <p>
        Account data is retained until you request deletion. Chat messages may be
        retained for moderation purposes. Permanently banned accounts have their
        messages deleted and profile anonymised.
      </p>

      <h2>Your rights</h2>
      <p>
        You may request access to, correction of, or deletion of your personal
        data at any time by contacting us.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy-related inquiries, reach out via the site chat or email the
        site administrator.
      </p>
    </div>
  )
}
