/**
 * VideoController — HTML5 video player with YouTube embed support.
 *
 * Lifecycle:
 *   mount(container)
 *     → creates header bar + URL input + video element
 *     → if a URL is in saved state, loads it
 *   unmount()
 *     → saves playback position (currentTime)
 *     → removes video (but keeps URL state)
 *   setVisible(false)
 *     → pauses playback, saves position
 *   setVisible(true)
 *     → restores video, resumes from saved position
 *
 * URL formats supported:
 *   - Direct video files (.mp4, .webm, .ogg)
 *   - YouTube watch URLs (youtube.com/watch?v=...)
 *   - YouTube short URLs (youtu.be/...)
 *   - YouTube embed URLs (youtube.com/embed/...)
 */

import { BaseController } from "../../controllers/base-controller";
import type { TabController } from "../../controllers/types";
import { paneHeaderButton } from "../../components/pane-header-button";

/**
 * Extract a YouTube video ID from various URL formats.
 * Returns null if the URL is not a recognized YouTube URL.
 */
function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim();
  // youtube.com/watch?v=VIDEO_ID
  const match = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

/**
 * Detect if a URL is a direct-playable video file.
 */
function isDirectVideoUrl(url: string): boolean {
  const trimmed = url.trim();
  // Common video extensions or blob/data URIs
  return (
    /\.(mp4|webm|ogg|mov|avi|mkv)(\?|#|$)/i.test(trimmed) ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:")
  );
}

export class VideoController extends BaseController implements TabController {
  /** The video element (or iframe for YouTube). */
  private videoEl: HTMLVideoElement | HTMLIFrameElement | null = null;
  /** The container div for the video player. */
  private playerContainer: HTMLElement | null = null;
  /** The URL input element. */
  private urlInput: HTMLInputElement | null = null;
  /** Saved playback time (seconds) for pause/resume across visibility changes. */
  private savedTime: number = 0;
  /** Whether playback was paused when hidden. */
  private wasPaused: boolean = true;
  /** Current video URL. */
  private videoUrl: string = "";
  /** Whether we're showing a YouTube embed (iframe) vs direct <video>. */
  private isYouTube: boolean = false;

  mount(container: HTMLElement): void {
    this.container = container;

    // Layout: flex column
    container.style.cssText =
      "width:100%;height:100%;display:flex;flex-direction:column;background:#111;overflow:hidden;";

    // ── Header bar ──
    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:0 0 0 8px;height:28px;background:var(--bg-gutter);border-bottom:1px solid var(--border-divider);flex-shrink:0;user-select:none;cursor:grab;";
    header.innerHTML = `
      <span class="pane-label" style="font-size:11px;color:var(--text-secondary);letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Video Player</span>
    `;
    container.appendChild(header);

    const closeBtn = paneHeaderButton({ content: "\u00D7", className: "pane-close" });
    header.appendChild(closeBtn);

    // ── URL input bar ──
    const inputBar = document.createElement("div");
    inputBar.style.cssText =
      "display:flex;align-items:center;gap:4px;padding:4px 8px;background:var(--bg-gutter);border-bottom:1px solid var(--border-divider);flex-shrink:0;";
    this.urlInput = document.createElement("input");
    this.urlInput.type = "text";
    this.urlInput.placeholder = "Paste video URL (mp4, webm, YouTube...)";
    this.urlInput.value = this.videoUrl;
    this.urlInput.style.cssText =
      "flex:1;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:4px;color:#ccc;font-size:12px;padding:4px 8px;outline:none;min-width:0;";
    this.urlInput.addEventListener("focus", () => {
      this.urlInput!.style.borderColor = "#4a9eff";
    });
    this.urlInput.addEventListener("blur", () => {
      this.urlInput!.style.borderColor = "#333";
    });
    this.urlInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        this._loadUrl(this.urlInput!.value);
      }
    });

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.style.cssText =
      "background:var(--accent);border:none;border-radius:4px;color:#fff;font-size:11px;padding:4px 12px;cursor:pointer;white-space:nowrap;transition:background 0.15s;";
    loadBtn.addEventListener("mouseenter", () => {
      loadBtn.style.background = "#3a7fe1";
    });
    loadBtn.addEventListener("mouseleave", () => {
      loadBtn.style.background = "#2a6fd1";
    });
    loadBtn.addEventListener("click", () => {
      this._loadUrl(this.urlInput!.value);
    });

    inputBar.appendChild(this.urlInput);
    inputBar.appendChild(loadBtn);
    container.appendChild(inputBar);

    // ── Player container ──
    this.playerContainer = document.createElement("div");
    this.playerContainer.className = "flex-1 min-h-0 relative bg-black flex items-center justify-center";
    container.appendChild(this.playerContainer);

    // If we have a saved URL, load it
    if (this.videoUrl) {
      this._loadUrl(this.videoUrl);
    } else {
      // Show placeholder message
      this._showPlaceholder("\u25B6 Enter a video URL above to start playing");
    }
  }

  unmount(): void {
    // Save playback position
    if (this.videoEl && this.videoEl instanceof HTMLVideoElement) {
      this.savedTime = this.videoEl.currentTime;
      this.wasPaused = this.videoEl.paused;
      // Pause and detach
      this.videoEl.pause();
      this.videoEl.removeAttribute("src");
      this.videoEl.load();
    }
    this.videoEl = null;
    this.playerContainer = null;
    this.urlInput = null;
    this.container = null;
  }

  setVisible(visible: boolean): void {
    if (!this.videoEl || !this.playerContainer) return;

    if (visible) {
      // Resume video
      if (this.videoEl instanceof HTMLVideoElement && this.savedTime > 0) {
        this.videoEl.currentTime = this.savedTime;
        if (!this.wasPaused) {
          this.videoEl.play().catch(() => {
            // Autoplay may be blocked; user must click
          });
        }
      }
    } else {
      // Pause and save position
      if (this.videoEl instanceof HTMLVideoElement) {
        this.savedTime = this.videoEl.currentTime;
        this.wasPaused = this.videoEl.paused;
        this.videoEl.pause();
      }
    }
  }

  snapshot(): Record<string, unknown> {
    // Save current playback info
    if (this.videoEl instanceof HTMLVideoElement) {
      this.savedTime = this.videoEl.currentTime;
      this.wasPaused = this.videoEl.paused;
    }
    return {
      ...this.state,
      videoUrl: this.videoUrl,
      savedTime: this.savedTime,
      wasPaused: this.wasPaused,
    };
  }

  restore(state: Record<string, unknown>): void {
    this.state = { ...state };
    if (typeof state.videoUrl === "string") {
      this.videoUrl = state.videoUrl;
    }
    if (typeof state.savedTime === "number") {
      this.savedTime = state.savedTime;
    }
    if (typeof state.wasPaused === "boolean") {
      this.wasPaused = state.wasPaused;
    }
  }

  // ── Private helpers ──

  private _showPlaceholder(message: string): void {
    if (!this.playerContainer) return;
    this.playerContainer.innerHTML = `<div class="text-muted text-sm text-center p-6 italic">${message}</div>`;
  }

  private _loadUrl(url: string): void {
    const trimmed = url.trim();
    if (!trimmed) return;

    this.videoUrl = trimmed;
    this.urlInput!.value = trimmed;

    // Check for YouTube
    const ytId = extractYouTubeId(trimmed);
    if (ytId) {
      this._loadYouTubeEmbed(ytId);
      return;
    }

    // Check for direct video file or valid URL
    let isValidUrl = false;
    try {
      isValidUrl = !!new URL(trimmed);
    } catch {
      isValidUrl = false;
    }
    if (isDirectVideoUrl(trimmed) || isValidUrl) {
      this._loadDirectVideo(trimmed);
      return;
    }

    // Not a recognized format
    this._showPlaceholder(
      `\u26A0 Unsupported URL format. Try a YouTube link or direct video file (.mp4, .webm)`,
    );
  }

  private _loadDirectVideo(url: string): void {
    if (!this.playerContainer) return;
    this.isYouTube = false;

    // Clear player container
    this.playerContainer.innerHTML = "";

    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.autoplay = false;
    video.preload = "metadata";
    video.className = "w-full h-full object-contain bg-black";

    // Set time if we have a saved position
    if (this.savedTime > 0) {
      video.currentTime = this.savedTime;
    }

    // Auto-play if it wasn't paused before
    if (!this.wasPaused) {
      video.addEventListener(
        "canplay",
        () => {
          video.play().catch(() => {
            // Autoplay may be blocked
          });
        },
        { once: true },
      );
    }

    this.playerContainer.appendChild(video);
    this.videoEl = video;
  }

  private _loadYouTubeEmbed(ytId: string): void {
    if (!this.playerContainer) return;
    this.isYouTube = true;

    // Clear player container
    this.playerContainer.innerHTML = "";

    const iframe = document.createElement("iframe");
    // Use youtube-nocookie.com for privacy and include autoplay if not paused
    const autoplay = this.wasPaused ? "0" : "1";
    const startTime = this.savedTime > 0 ? `&start=${Math.floor(this.savedTime)}` : "";
    iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=${autoplay}${startTime}&rel=0&modestbranding=1`;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.className = "w-full h-full border-none bg-black";

    this.playerContainer.appendChild(iframe);
    this.videoEl = iframe;
  }
}
