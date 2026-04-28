import { describe, it, expect } from "vitest";
import { formatContact } from "./contact-format";

describe("formatContact", () => {
  describe("email", () => {
    it("returns raw value, mailto href, and raw copyValue", () => {
      expect(formatContact("email", "jane@example.com")).toEqual({
        display: "jane@example.com",
        href: "mailto:jane@example.com",
        copyValue: "jane@example.com",
      });
    });
  });

  describe("phone", () => {
    it("returns raw value, tel href, and raw copyValue", () => {
      expect(formatContact("phone", "+1 555 123 4567")).toEqual({
        display: "+1 555 123 4567",
        href: "tel:+1 555 123 4567",
        copyValue: "+1 555 123 4567",
      });
    });
  });

  describe("website", () => {
    it("strips https:// and trailing slash for display", () => {
      expect(formatContact("website", "https://example.com/")).toEqual({
        display: "example.com",
        href: "https://example.com/",
        copyValue: "https://example.com/",
      });
    });

    it("strips http:// for display", () => {
      const r = formatContact("website", "http://example.com/path");
      expect(r.display).toBe("example.com/path");
      expect(r.href).toBe("http://example.com/path");
      expect(r.copyValue).toBe("http://example.com/path");
    });

    it("leaves value untouched when no protocol", () => {
      const r = formatContact("website", "example.com/path");
      expect(r.display).toBe("example.com/path");
      expect(r.href).toBe("example.com/path");
    });
  });

  describe("linkedin", () => {
    it("extracts handle from /in/ path", () => {
      const r = formatContact("linkedin", "https://www.linkedin.com/in/jane-doe/");
      expect(r.display).toBe("@jane-doe");
      expect(r.href).toBe("https://www.linkedin.com/in/jane-doe/");
      expect(r.copyValue).toBe("https://www.linkedin.com/in/jane-doe/");
    });

    it("extracts handle from /company/ path", () => {
      const r = formatContact("linkedin", "https://linkedin.com/company/acme");
      expect(r.display).toBe("@acme");
      expect(r.href).toBe("https://linkedin.com/company/acme");
    });

    it("falls back to stripped URL when no /in/ or /company/ segment", () => {
      const r = formatContact("linkedin", "https://linkedin.com/");
      expect(r.display).toBe("linkedin.com");
      expect(r.href).toBe("https://linkedin.com/");
    });

    it("ignores query string and fragment when extracting handle", () => {
      const r = formatContact("linkedin", "https://linkedin.com/in/jane-doe?utm=foo#section");
      expect(r.display).toBe("@jane-doe");
    });
  });

  describe("instagram", () => {
    it("extracts handle from URL", () => {
      const r = formatContact("instagram", "https://instagram.com/john_doe");
      expect(r.display).toBe("@john_doe");
      expect(r.href).toBe("https://instagram.com/john_doe");
      expect(r.copyValue).toBe("https://instagram.com/john_doe");
    });

    it("extracts handle from URL with trailing slash", () => {
      const r = formatContact("instagram", "https://instagram.com/john_doe/");
      expect(r.display).toBe("@john_doe");
    });

    it("normalizes bare @handle into a URL for href and copyValue", () => {
      expect(formatContact("instagram", "@john_doe")).toEqual({
        display: "@john_doe",
        href: "https://instagram.com/john_doe",
        copyValue: "https://instagram.com/john_doe",
      });
    });

    it("normalizes bare handle (no @) into a URL for href and copyValue", () => {
      expect(formatContact("instagram", "john_doe")).toEqual({
        display: "@john_doe",
        href: "https://instagram.com/john_doe",
        copyValue: "https://instagram.com/john_doe",
      });
    });
  });
});
