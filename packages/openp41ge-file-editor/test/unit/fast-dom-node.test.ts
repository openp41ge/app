/**
 * Tests for FastDomNode.
 */
import { describe, it, expect } from "vitest";
import { createFastDomNode } from "@openp41ge-file-editor/view/fast-dom-node";

describe("FastDomNode", () => {
  it("creates a div by default", () => {
    const node = createFastDomNode();
    expect(node.element.tagName).toBe("DIV");
  });

  it("creates element with default tag (div)", () => {
    const node = createFastDomNode();
    expect(node.element.tagName).toBe("DIV");
  });

  it("sets and gets className", () => {
    const node = createFastDomNode();
    node.setClassName("foo bar");
    expect(node.element.className).toBe("foo bar");
  });

  it("sets and gets position", () => {
    const node = createFastDomNode();
    node.setPosition("absolute");
    expect(node.element.style.position).toBe("absolute");
  });

  it("sets and gets top", () => {
    const node = createFastDomNode();
    node.setTop(42);
    expect(node.element.style.top).toBe("42px");
  });

  it("sets and gets left", () => {
    const node = createFastDomNode();
    node.setLeft(10);
    expect(node.element.style.left).toBe("10px");
  });

  it("sets and gets width", () => {
    const node = createFastDomNode();
    node.setWidth(100);
    expect(node.element.style.width).toBe("100px");
  });

  it("sets and gets height", () => {
    const node = createFastDomNode();
    node.setHeight(20);
    expect(node.element.style.height).toBe("20px");
  });

  it("sets and gets display", () => {
    const node = createFastDomNode();
    node.setDisplay("flex");
    expect(node.element.style.display).toBe("flex");
  });

  it("sets and gets zIndex", () => {
    const node = createFastDomNode();
    node.setZIndex(5);
    expect(node.element.style.zIndex).toBe("5");
  });

  it("sets and gets innerHTML", () => {
    const node = createFastDomNode();
    node.setInnerHTML("<span>hello</span>");
    expect(node.element.innerHTML).toBe("<span>hello</span>");
  });

  it("appends child", () => {
    const parent = createFastDomNode();
    const child = createFastDomNode();
    parent.appendChild(child.element);
    expect(parent.element.childNodes.length).toBe(1);
    expect(parent.element.firstChild).toBe(child.element);
  });

  it("sets lineHeight", () => {
    const node = createFastDomNode();
    node.setLineHeight(20);
    expect(node.element.style.lineHeight).toBe("20px");
  });

  it("does not set a style if value is falsy (except 0)", () => {
    const node = createFastDomNode();
    node.setWidth(0);
    expect(node.element.style.width).toBe("0px");
  });

  it("removes child elements", () => {
    const parent = createFastDomNode();
    const child1 = createFastDomNode();
    const child2 = createFastDomNode();
    parent.appendChild(child1.element);
    parent.appendChild(child2.element);
    expect(parent.element.childNodes.length).toBe(2);
    child1.element.remove();
    expect(parent.element.childNodes.length).toBe(1);
  });

  it("sets visibility (boolean)", () => {
    const node = createFastDomNode();
    node.setVisibility(true);
    expect(node.element.style.visibility).toBe("visible");
    node.setVisibility(false);
    expect(node.element.style.visibility).toBe("hidden");
  });

  it("scrollTop getter/setter works", () => {
    const node = createFastDomNode();
    node.scrollTop = 100;
    expect(node.scrollTop).toBe(100);
  });

  it("scrollLeft getter/setter works", () => {
    const node = createFastDomNode();
    node.scrollLeft = 50;
    expect(node.scrollLeft).toBe(50);
  });
});
