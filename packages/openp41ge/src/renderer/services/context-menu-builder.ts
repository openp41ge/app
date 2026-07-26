import type { IContextMenuBuilder } from "../interfaces/context-menu-builder";
import type { ICommandBus } from "../interfaces/command-bus";
import { isTabGrid, createOpenp41geContextMenu } from "../interfaces/element-guards";
import { toggleWorktree } from "../components/openp41ge-worktree-controller";
import { setContextMenuActive } from "./drag-context";

export class ContextMenuBuilder implements IContextMenuBuilder {
  private _commandBus: ICommandBus | null = null;

  init(commandBus: ICommandBus): void {
    this._commandBus = commandBus;
  }

  async showContextMenu(
    x: number,
    y: number,
    _row: number,
    _col: number,
    gridEl: HTMLElement,
  ): Promise<void> {
    if (!isTabGrid(gridEl)) return;
    const winId = gridEl.winId;
    const dispatch = this._commandBus!.dispatch.bind(this._commandBus);

    const items: Array<{ label: string; id: string }> = [
      { label: "Split right", id: "split" },
      { label: "Equalize column widths", id: "equalize" },
      { label: "---", id: "sep1" },
      { label: "Open explorer", id: "explorer" },
      { label: "Add workset", id: "add-workset" },
      { label: "---", id: "sep2" },
      { label: "Quit", id: "quit" },
    ];

    setContextMenuActive(true);

    // In test mode, render a DOM-based <openp41ge-contextmenu> element so
    // test steps like "the grid context menu shows" can detect it.
    // Also fire the native IPC call so __lastContextMenuTemplate is set
    // on the main process for the "selects … from the context menu" step.
    if (window.openp41ge?.isTest) {
      document.querySelectorAll("openp41ge-contextmenu").forEach((el) => el.remove());
      const menuItems = items.map((item) => {
        if (item.id === "sep1" || item.id === "sep2") {
          return { type: "separator" as const };
        }
        return { label: item.label, action: () => {} };
      });
      const ctx = createOpenp41geContextMenu({
        x,
        y,
        items: menuItems,
        onclose: () => setContextMenuActive(false),
      });
      document.body.appendChild(ctx);
      await window.openp41ge.showContextMenu(items);
      setTimeout(() => setContextMenuActive(false), 0);
      return;
    }

    const id = await window.openp41ge.showContextMenu(items);
    setTimeout(() => setContextMenuActive(false), 0);
    if (!id) return;

    switch (id) {
      case "split":
        window.openp41ge.workspace.cmdNewColumn();
        break;
      case "equalize": {
        const cols = gridEl.cols;
        if (cols > 0) {
          dispatch("resizeGrid", winId, winId, 1, cols);
        }
        break;
      }
      case "explorer":
        toggleWorktree();
        break;
      // add-workset removed — no more worksets
      case "quit":
        window.openp41ge.window.close();
        break;
    }
  }

  hideContextMenu(): void {
    const menus = document.querySelectorAll("openp41ge-contextmenu");
    for (const m of menus) m.remove();
  }
}
