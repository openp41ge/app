/**
 * <tab-content> — renders tab content containers that preserve mounted DOM.
 *
 * Each tab renders a container div with a stable data-tab-id attribute.
 * The host can mount controller-managed DOM into the controller slot using
 * mountController/unmountController. Lit re-renders preserve these elements
 * because they have stable identifiers.
 *
 * If a tab has string content (from tabData), it's rendered via unsafeHTML
 * in the string-content div. When a controller is mounted, the string-content
 * div is hidden.
 *
 * Light DOM for compatibility with elementFromPoint and query selectors.
 */

import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

const _emojiPool = [
  // Faces
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "🤣",
  "😂",
  "🙂",
  "🙃",
  "😉",
  "😊",
  "😇",
  "🥰",
  "😍",
  "🤩",
  "😘",
  "😗",
  "😚",
  "😋",
  "😛",
  "😜",
  "🤪",
  "😝",
  "🤑",
  "🤗",
  "🤭",
  "🫢",
  "🫣",
  "🤫",
  "🤔",
  "😐",
  "😑",
  "😶",
  "🫥",
  "😏",
  "😒",
  "🙄",
  "😬",
  "🤥",
  "😌",
  "😔",
  "😪",
  "🤤",
  "😴",
  "😷",
  "🤒",
  "🤕",
  "🤢",
  "🤮",
  "🤧",
  "🥵",
  "🥶",
  "🥴",
  "😵",
  "🤯",
  "🤠",
  "🥳",
  "🥸",
  "😎",
  "🤓",
  "🧐",
  "😕",
  "😟",
  "🙁",
  "😮",
  "😯",
  "😲",
  "😳",
  "🥺",
  "😦",
  "😧",
  "😨",
  "😰",
  "😥",
  "😢",
  "😭",
  "😱",
  "😖",
  "😣",
  "😞",
  "😓",
  "😩",
  "😫",
  "🥱",
  "😤",
  "😡",
  "😠",
  "🤬",
  // Gestures & body
  "👍",
  "👎",
  "👊",
  "✊",
  "🤛",
  "🤜",
  "👏",
  "🙌",
  "👐",
  "🤲",
  "🤝",
  "🙏",
  "✌️",
  "🤞",
  "🫰",
  "🤟",
  "🤘",
  "🤙",
  "👈",
  "👉",
  "👆",
  "🖕",
  "👇",
  "☝️",
  "🖐️",
  "✋",
  "🤚",
  "🫱",
  "🫲",
  "🫳",
  "🫴",
  "👋",
  "🤙",
  "🖖",
  "🫶",
  "💪",
  "🦵",
  "🦶",
  "👂",
  "🦻",
  "👃",
  "🧠",
  "🫀",
  "🫁",
  "🦷",
  "🦴",
  "👀",
  "👁️",
  "👅",
  "👄",
  // Animals
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐻‍❄️",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🙈",
  "🙉",
  "🙊",
  "🐒",
  "🐔",
  "🐧",
  "🐦",
  "🐤",
  "🐣",
  "🐥",
  "🦆",
  "🦅",
  "🦉",
  "🦇",
  "🐺",
  "🐗",
  "🐴",
  "🦄",
  "🐝",
  "🐛",
  "🦋",
  "🐌",
  "🐞",
  "🐜",
  "🦟",
  "🦗",
  "🐢",
  "🐍",
  "🦎",
  "🦖",
  "🦕",
  "🐙",
  "🦑",
  "🦐",
  "🦞",
  "🦀",
  "🐡",
  "🐠",
  "🐟",
  "🐬",
  "🐳",
  "🐋",
  "🦈",
  "🐊",
  "🐅",
  "🐆",
  "🦓",
  "🦍",
  "🐘",
  "🦣",
  "🐪",
  "🐫",
  "🦙",
  "🦒",
  "🐃",
  "🐂",
  "🐄",
  "🐎",
  "🐖",
  "🐏",
  "🐑",
  "🦌",
  "🐕",
  "🐩",
  "🦮",
  "🐕‍🦺",
  "🐈",
  "🐈‍⬛",
  "🐓",
  "🦃",
  "🦤",
  "🦚",
  "🦜",
  "🦢",
  "🦩",
  "🕊️",
  "🐇",
  "🦝",
  "🦨",
  "🦡",
  "🦫",
  "🦦",
  "🦥",
  "🐁",
  "🐀",
  "🐿️",
  "🦔",
  // Nature & popular
  "🌟",
  "🔥",
  "🌈",
  "☀️",
  "🌙",
  "⭐",
  "💫",
  "⚡",
  "🌊",
  "🌸",
  "🌺",
  "🌻",
  "🌷",
  "🌹",
  "🍀",
  "🌿",
  "🍄",
  "🌵",
  "🎄",
  "🌲",
  "🌳",
  "🌴",
  "🍁",
  "🍂",
  "🍃",
  // Food
  "🍕",
  "🍔",
  "🌭",
  "🍟",
  "🥨",
  "🥯",
  "🥞",
  "🧇",
  "🧀",
  "🥚",
  "🍳",
  "🥓",
  "🥩",
  "🍗",
  "🍖",
  "🦴",
  "🌮",
  "🌯",
  "🫔",
  "🥗",
  "🥘",
  "🫕",
  "🥫",
  "🍝",
  "🍜",
  "🍲",
  "🍛",
  "🍣",
  "🍱",
  "🥟",
  "🦪",
  "🍤",
  "🍙",
  "🍚",
  "🍘",
  "🍥",
  "🥠",
  "🥮",
  "🍢",
  "🍡",
  "🍧",
  "🍨",
  "🍦",
  "🍰",
  "🎂",
  "🧁",
  "🥧",
  "🍫",
  "🍬",
  "🍭",
  "🍮",
  "🍯",
  "☕",
  "🍵",
  "🧋",
  "🥤",
  "🍺",
  "🍻",
  "🥂",
  "🍷",
  "🥃",
  "🍸",
  "🍹",
  // Activities & objects
  "🚀",
  "🎉",
  "🎊",
  "🎈",
  "🎁",
  "🎀",
  "🪅",
  "🎃",
  "🎄",
  "🎆",
  "🎇",
  "✨",
  "🎶",
  "🎵",
  "🎸",
  "🎺",
  "🎻",
  "🥁",
  "🪘",
  "🎮",
  "🕹️",
  "🎲",
  "♟️",
  "🧩",
  "🧸",
  "🪀",
  "🪁",
  "📚",
  "📖",
  "🔮",
  "💎",
  "🕶️",
  "👑",
  "🎒",
  "🧳",
  "🌍",
  "🌎",
  "🌏",
  "🗺️",
  "🧭",
  "⏰",
  "⌚",
  "📱",
  "💻",
  "⌨️",
  "🖥️",
  "🖨️",
  "🖱️",
  "🖲️",
  "💾",
  "💿",
  "📀",
  "📸",
  "📹",
  "🎥",
  "📽️",
  "🎞️",
  "📞",
  "☎️",
  "📟",
  "📠",
  "🔊",
  "🔔",
  "🎵",
  "🎶",
];

function _randomGrid(): string[] {
  const grid: string[] = [];
  for (let i = 0; i < 9; i++) {
    grid.push(_emojiPool[Math.floor(Math.random() * _emojiPool.length)]);
  }
  return grid;
}

function _mutateGrid(grid: string[]): string[] {
  const next = [...grid];
  const count = 1 + Math.floor(Math.random() * 3); // 1–3 positions change
  for (let i = 0; i < count; i++) {
    next[Math.floor(Math.random() * 9)] = _emojiPool[Math.floor(Math.random() * _emojiPool.length)];
  }
  return next;
}

export class TabContent extends LitElement {
  @property({ type: Array }) tabIds: string[] = [];
  @property({ type: String }) activeTabId: string = "";
  @property({ type: Object }) tabs: Record<string, { content: string }> = {};

  @state() private _emojiGrid: string[] = _randomGrid();
  private _timer: ReturnType<typeof setTimeout> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._scheduleTick();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _scheduleTick(): void {
    this._timer = setTimeout(
      () => {
        if (!this.isConnected) return;
        this._emojiGrid = _mutateGrid(this._emojiGrid);
        this._scheduleTick();
      },
      5000 + Math.random() * 10000,
    ); // 5–15 seconds
  }

  createRenderRoot() {
    return this;
  }

  render() {
    if (this.tabIds.length === 0) {
      return html`
        <div
          class="tab-content-empty"
          style="display:grid;grid-template-columns:repeat(3,auto);place-content:center;place-items:center;gap:12px;height:100%;color:#666;font-size:2.5rem;"
        >
          ${this._emojiGrid.map((e) => html`<span>${e}</span>`)}
        </div>
      `;
    }
    return html`
      ${this.tabIds.map(
        (id) => html`
          <div
            class="tab-content-pane"
            data-tab-id=${id}
            ?hidden=${id !== this.activeTabId}
            style="display:${id === this.activeTabId ? "flex" : "none"};flex-direction:column;height:100%;overflow:hidden;box-sizing:border-box;"
          >
            <!-- String-based content (from tabData.content, used by demo) -->
            <div class="tab-content-string" style="flex:1;overflow-y:auto;padding:16px;">
              ${this.tabs[id] ? unsafeHTML(this.tabs[id].content) : ""}
            </div>
            <!-- Controller container (used by openp41ge for controllers) -->
            <div
              class="tab-content-controller"
              style="flex:1;overflow:hidden;display:none;min-height:0;"
            ></div>
          </div>
        `,
      )}
    `;
  }

  /**
   * Get the controller container for a tab. The host appends controller
   * DOM elements here. Returns null if the tab doesn't exist in this grid.
   */
  getControllerContainer(tabId: string): HTMLElement | null {
    const pane = this.querySelector(`[data-tab-id="${tabId}"]`);
    if (!pane) return null;
    return pane.querySelector(".tab-content-controller") as HTMLElement | null;
  }

  /**
   * Mount a controller element into a tab's content area.
   * This hides the string-content div (if any) and shows the controller div.
   * Returns true if the mount succeeded.
   */
  mountController(tabId: string, element: HTMLElement): boolean {
    const pane = this.querySelector(`[data-tab-id="${tabId}"]`);
    if (!pane) return false;

    const controllerDiv = pane.querySelector(".tab-content-controller") as HTMLElement;
    if (!controllerDiv) return false;

    // Hide string content, show controller
    const stringDiv = pane.querySelector(".tab-content-string") as HTMLElement;
    if (stringDiv) stringDiv.style.display = "none";
    controllerDiv.style.display = "flex";

    // Only append if not already a child
    if (!controllerDiv.contains(element)) {
      controllerDiv.appendChild(element);
    }
    return true;
  }

  /**
   * Unmount a controller element from a tab's content area.
   */
  unmountController(tabId: string, element: HTMLElement): boolean {
    const pane = this.querySelector(`[data-tab-id="${tabId}"]`);
    if (!pane) return false;

    const controllerDiv = pane.querySelector(".tab-content-controller") as HTMLElement;
    if (!controllerDiv) return false;

    if (controllerDiv.contains(element)) {
      controllerDiv.removeChild(element);
    }

    // Show string content again if no more controller children
    if (controllerDiv.children.length === 0) {
      controllerDiv.style.display = "none";
      const stringDiv = pane.querySelector(".tab-content-string") as HTMLElement;
      if (stringDiv) stringDiv.style.display = "";
    }
    return true;
  }
}

customElements.define("tab-content", TabContent);
