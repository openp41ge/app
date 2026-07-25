/**
 * Video app registration — HTML5 video player with YouTube embed support.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { VideoController } from "./video-controller";

export const videoAppRegistration: AppTypeRegistration = {
  id: "video",
  label: "Video Player",
  icon: "\u25B6",
  description: "Stream video",
  createController: (tabId: string) => new VideoController(tabId, "video"),
};
