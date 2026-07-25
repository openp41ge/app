/**
 * SidebarView interface — contract for sidebar view panels.
 *
 * Each sidebar view (explorer, search, source control, etc.) implements
 * this interface and is associated with an activity bar button.
 *
 * Architecture (SOLID):
 *   - Single Responsibility: each view handles its own mount/unmount lifecycle
 *   - Interface Segregation: views only need mount/unmount/getTitle
 *   - Liskov Substitution: any implementation can be swapped in
 */

export interface SidebarView {
  readonly id: string;
  readonly label: string;
  mount(container: HTMLElement): void | Promise<void>;
  unmount(): void;
  getTitle(): string;
}
