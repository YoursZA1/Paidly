import { RequestCoordinator } from "@/core/network/RequestCoordinator";

/** Process-wide HTTP concurrency + pause gate (reads RuntimeCoordinator). */
let shared = null;

export function getSharedRequestCoordinator() {
  if (!shared) {
    shared = new RequestCoordinator(6);
  }
  return shared;
}
