import { MEDIA_TYPES } from "@objekt/shared";

import { createEnsMediaCommand } from "./ens-media";

export default createEnsMediaCommand({
  name: "header",
  description: "Manage ENS headers",
  mediaType: MEDIA_TYPES.cover,
  pathSuffix: "/h",
});
