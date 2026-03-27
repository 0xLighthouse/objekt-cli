import { MEDIA_TYPES } from "@objekt/shared";

import { createEnsMediaCommand } from "./ens-media";

export default createEnsMediaCommand({
  name: "avatar",
  description: "Manage ENS avatars",
  mediaType: MEDIA_TYPES.avatar,
  pathSuffix: "",
});
