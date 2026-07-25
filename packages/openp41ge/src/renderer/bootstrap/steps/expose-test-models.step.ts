/**
 * Expose test models on window.__testModels for test injection.
 *
 * This step has no dependencies and never fails — it only sets a window property.
 * In production builds, test model imports are tree-shaken.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";

const log = createLogger("bootstrap:expose-test-models");

// ── Test models (tree-shaken from production) ──────────────────────────
import { FileDragSource } from "../../services/drag-sources/file-drag-source";
import { RepoDragSource } from "../../services/drag-sources/repo-drag-source";
import { TopBarDropTarget } from "../../services/drop-targets/topbar-drop-target";
import {
  TestRepoService,
  TestRepositoryModel,
  TestWorktreeModel,
  TestFileContent,
} from "../../models/test-models";
import {
  resolveFileReferences,
  getUncoveredPaths,
  isFileScopedTab,
  parentDirForVisibility,
} from "../../services/scope-expansion-utils";
import { Openp41geScopeExpandModal } from "../../components/openp41ge-scope-expand-modal";

export class ExposeTestModelsStep implements IStartupStep {
  readonly name = "expose-test-models";

  async run(_context: StartupContext): Promise<void> {
    (window as unknown as Record<string, unknown>).__testModels = {
      TestRepoService,
      TestRepositoryModel,
      TestWorktreeModel,
      TestFileContent,
      FileDragSource,
      RepoDragSource,
      TopBarDropTarget,
      // Scope expansion utilities
      resolveFileReferences,
      getUncoveredPaths,
      isFileScopedTab,
      parentDirForVisibility,
      Openp41geScopeExpandModal,
    };
    log.info("test models exposed");
  }
}
