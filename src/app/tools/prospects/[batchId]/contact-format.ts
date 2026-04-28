export type ContactChannel = "email" | "phone" | "website" | "linkedin" | "instagram";

export interface ContactFormat {
  display: string;
  href: string;
  copyValue: string;
}

function stripUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function formatContact(channel: ContactChannel, value: string): ContactFormat {
  switch (channel) {
    case "email":
      return { display: value, href: `mailto:${value}`, copyValue: value };

    case "phone":
      return { display: value, href: `tel:${value}`, copyValue: value };

    case "website":
      return { display: stripUrl(value), href: value, copyValue: value };

    case "linkedin": {
      const match = value.match(/\/(?:in|company)\/([^/?#]+)/i);
      const display = match ? `@${match[1]}` : stripUrl(value);
      return { display, href: value, copyValue: value };
    }

    case "instagram": {
      const isUrl = /^https?:\/\//i.test(value);
      if (isUrl) {
        const path = value.replace(/[?#].*$/, "").replace(/\/$/, "");
        const handle = path.split("/").pop() || value;
        return {
          display: `@${handle}`,
          href: value,
          copyValue: value,
        };
      }
      const bare = value.replace(/^@/, "");
      const url = `https://instagram.com/${bare}`;
      return { display: `@${bare}`, href: url, copyValue: url };
    }
  }
}
