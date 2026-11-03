import type { Brief } from "../brief/types"
import type { PageView } from "./model"
import type { ViewSpec } from "./spec"

// Pure function from (brief, spec) to the page. No model, no I/O.
// Contract stub. The implementation lands in the next lead commit.
export function buildView(brief: Brief, spec: ViewSpec): PageView {
  void brief
  void spec
  throw new Error("buildView is not implemented yet")
}
