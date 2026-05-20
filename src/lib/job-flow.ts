import type { JobStage } from "@prisma/client";

/**
 * The visible flow stages in order. NEW is the implicit pre-allocation state
 * and isn't shown as a chart box; ALLOCATED through INSPECTION render as the
 * main pipeline; COMPLETE and DEACTIVATED are the two terminal states under
 * Inspection.
 */
export const FLOW_STAGES: JobStage[] = [
  "ALLOCATED",
  "BUILT",
  "STAGED",
  "INSTALLED",
  "INSPECTION",
];

export const TERMINAL_STAGES: JobStage[] = ["COMPLETE", "DEACTIVATED"];

export const STAGE_LABELS: Record<JobStage, string> = {
  NEW: "Not started",
  ALLOCATED: "Allocated",
  BUILT: "Built",
  STAGED: "Staged",
  INSTALLED: "Installed",
  INSPECTION: "Inspection",
  COMPLETE: "Built",
  DEACTIVATED: "Deactivated",
};

/**
 * Movement rules:
 * - Can move backward to any prior stage in sequence (undo a too-eager click).
 * - Can only move forward one stage at a time.
 * - From INSPECTION, terminal jump is allowed to either COMPLETE or DEACTIVATED.
 * - From a terminal state, can revert back to INSPECTION (or further).
 */
export function isValidTransition(from: JobStage, to: JobStage): boolean {
  if (from === to) return false;

  const order = ["NEW", ...FLOW_STAGES] as JobStage[];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);

  // Both inside the linear pipeline
  if (fromIdx >= 0 && toIdx >= 0) {
    // Backward is always fine; forward must be exactly one step
    return toIdx < fromIdx || toIdx === fromIdx + 1;
  }

  // Terminal jumps from INSPECTION
  if (from === "INSPECTION" && (to === "COMPLETE" || to === "DEACTIVATED")) {
    return true;
  }

  // Reverting from a terminal state — allow back to INSPECTION
  if ((from === "COMPLETE" || from === "DEACTIVATED") && to === "INSPECTION") {
    return true;
  }

  return false;
}

export function nextStage(current: JobStage): JobStage | null {
  const idx = FLOW_STAGES.indexOf(current);
  if (idx === -1) {
    // NEW → ALLOCATED
    if (current === "NEW") return "ALLOCATED";
    return null;
  }
  if (idx === FLOW_STAGES.length - 1) return null;
  return FLOW_STAGES[idx + 1];
}

export function prevStage(current: JobStage): JobStage | null {
  if (current === "NEW") return null;
  if (current === "COMPLETE" || current === "DEACTIVATED") return "INSPECTION";
  const order = ["NEW", ...FLOW_STAGES] as JobStage[];
  const idx = order.indexOf(current);
  if (idx <= 0) return null;
  return order[idx - 1];
}

export type StagePosition = "past" | "current" | "future";

/**
 * Where does `stage` sit relative to `currentStage` on the timeline?
 * - "current": the stage the job is in right now
 * - "past":    a stage already completed
 * - "future":  a stage not yet reached (or the unchosen terminal)
 *
 * Used by the Job Flow panel to color each button: future = gray,
 * current = red, past = black.
 */
export function getStagePosition(
  stage: JobStage,
  currentStage: JobStage,
): StagePosition {
  if (stage === currentStage) return "current";

  const order = ["NEW", ...FLOW_STAGES] as JobStage[];
  const currentIdx = order.indexOf(currentStage);
  const stageIdx = order.indexOf(stage);

  if (currentIdx >= 0 && stageIdx >= 0) {
    return stageIdx < currentIdx ? "past" : "future";
  }

  // currentStage is terminal — every linear pipeline stage is past
  if (
    (currentStage === "COMPLETE" || currentStage === "DEACTIVATED") &&
    stageIdx >= 0
  ) {
    return "past";
  }

  // Anything else (typically the unchosen terminal) hasn't been reached
  return "future";
}
