/**
 * Tests for SVG icon functions in icons/index.ts.
 *
 * Verifies SVG output structure, dimensions, and required elements.
 */

import { describe, it, expect } from "vitest";
import {
  gitBranchIcon,
  gitInfoIcon,
  gitCommitIcon,
  fileAddedIcon,
  fileDeletedIcon,
  fileModifiedIcon,
  fileRenamedIcon,
} from "@openp41ge/renderer/icons/index";

describe("Icons", () => {
  describe("gitBranchIcon", () => {
    it("returns an SVG string", () => {
      const svg = gitBranchIcon();
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("uses default size 16", () => {
      const svg = gitBranchIcon();
      expect(svg).toContain('width="16"');
      expect(svg).toContain('height="16"');
    });

    it("accepts custom size", () => {
      const svg = gitBranchIcon(24);
      expect(svg).toContain('width="24"');
      expect(svg).toContain('height="24"');
    });

    it("contains stroke currentColor", () => {
      const svg = gitBranchIcon();
      expect(svg).toContain('stroke="currentColor"');
    });

    it("contains branch path elements (circles + connecting lines)", () => {
      const svg = gitBranchIcon();
      expect(svg).toContain("<circle");
      expect(svg.match(/<circle/g)).toHaveLength(3);
    });
  });

  describe("gitInfoIcon", () => {
    it("returns an SVG string", () => {
      const svg = gitInfoIcon();
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("contains circle and line elements", () => {
      const svg = gitInfoIcon();
      expect(svg).toContain("<circle");
      expect(svg).toContain("<line");
    });

    it("accepts custom size", () => {
      const svg = gitInfoIcon(32);
      expect(svg).toContain('width="32"');
    });
  });

  describe("gitCommitIcon", () => {
    it("returns an SVG string", () => {
      const svg = gitCommitIcon();
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("contains circle (commit dot) and two lines (connecting)", () => {
      const svg = gitCommitIcon();
      expect(svg).toContain("<circle");
      expect(svg.match(/<line/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it("accepts custom size", () => {
      const svg = gitCommitIcon(20);
      expect(svg).toContain('width="20"');
    });
  });

  describe("fileAddedIcon", () => {
    it("returns an SVG string", () => {
      const svg = fileAddedIcon();
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("contains circle and plus-shaped lines", () => {
      const svg = fileAddedIcon();
      expect(svg).toContain("<circle");
      // Plus shape: 2 lines (vertical + horizontal)
      const lines = svg.match(/<line/g);
      expect(lines).toHaveLength(2);
    });

    it("accepts custom size", () => {
      const svg = fileAddedIcon(12);
      expect(svg).toContain('width="12"');
    });
  });

  describe("fileDeletedIcon", () => {
    it("returns an SVG string", () => {
      const svg = fileDeletedIcon();
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("contains circle and minus line", () => {
      const svg = fileDeletedIcon();
      expect(svg).toContain("<circle");
      expect(svg.match(/<line/g)).toHaveLength(1);
    });
  });

  describe("fileModifiedIcon", () => {
    it("returns an SVG string", () => {
      const svg = fileModifiedIcon();
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("contains circle and path", () => {
      const svg = fileModifiedIcon();
      expect(svg).toContain("<circle");
      expect(svg).toContain("<path");
    });
  });

  describe("fileRenamedIcon", () => {
    it("returns an SVG string", () => {
      const svg = fileRenamedIcon();
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("contains circle and arrow path", () => {
      const svg = fileRenamedIcon();
      expect(svg).toContain("<circle");
      expect(svg).toContain("<path");
    });
  });
});
