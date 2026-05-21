"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobStage } from "@prisma/client";
import { setJobStage } from "@/lib/actions/job-stages";
import {
  FLOW_STAGES,
  STAGE_LABELS,
  getStagePosition,
  isValidTransition,
  prevStage,
} from "@/lib/job-flow";

/**
 * Interactive Job Flow chart — the right column of the job detail page.
 *
 * Visual states per stage button:
 * - GRAY:   not current (either upcoming or already passed)
 * - RED:    current stage
 * - YELLOW: current stage but needs attention (e.g. Awaiting Stock)
 *
 * Click rules:
 * - Click a previous stage → step back (always allowed)
 * - Click the next stage → advance one (only one-at-a-time forward)
 * - Click a stage two-or-more ahead → disabled (no-skip rule)
 */

type Props = {
  jobId: string;
  currentStage: JobStage;
  isOnHold?: boolean;
  canWrite: boolean;
};

export function JobFlowChart({
  jobId,
  currentStage,
  isOnHold = false,
  canWrite,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(target: JobStage) {
    if (!canWrite) return;
    if (!isValidTransition(currentStage, target)) return;

    // Deactivating requires reviewing return-to-inventory / scrap decisions
    // per pick list line, so route to the dedicated page instead of
    // flipping the stage directly.
    if (target === "DEACTIVATED") {
      router.push(`/job-flow/jobs/${jobId}/deactivate`);
      return;
    }

    startTransition(async () => {
      await setJobStage(jobId, target);
      router.refresh();
    });
  }

  const prev = prevStage(currentStage);
  const canRevert = canWrite && prev !== null && !isPending;

  return (
    <section className="rounded-lg border border-white bg-brand/15 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
        Job Flow
      </h2>

      <div className="mt-4 flex flex-col items-center gap-2">
        {FLOW_STAGES.map((stage, idx) => (
          <div key={stage} className="flex w-full flex-col items-center gap-2">
            <StageButton
              stage={stage}
              label={STAGE_LABELS[stage]}
              currentStage={currentStage}
              isOnHold={isOnHold}
              disabled={!canWrite || isPending || !isValidTransition(currentStage, stage)}
              onClick={() => handleClick(stage)}
            />
            {idx < FLOW_STAGES.length - 1 && <Arrow />}
          </div>
        ))}

        {/* Terminal split: COMPLETE (Built) or DEACTIVATED */}
        <Arrow />
        <div className="flex w-full justify-center gap-3">
          <StageButton
            stage="COMPLETE"
            label="Built"
            currentStage={currentStage}
            isOnHold={false}
            disabled={!canWrite || isPending || !isValidTransition(currentStage, "COMPLETE")}
            onClick={() => handleClick("COMPLETE")}
            compact
          />
          <StageButton
            stage="DEACTIVATED"
            label="Deactivated"
            currentStage={currentStage}
            isOnHold={false}
            disabled={!canWrite || isPending || !isValidTransition(currentStage, "DEACTIVATED")}
            onClick={() => handleClick("DEACTIVATED")}
            compact
          />
        </div>
      </div>

      {currentStage === "NEW" && (
        <p className="mt-4 text-xs text-white">
          Job hasn&apos;t started yet — click Allocated to begin.
        </p>
      )}

      {prev && (
        <div className="mt-5 border-t border-white pt-4">
          <button
            type="button"
            onClick={() => handleClick(prev)}
            disabled={!canRevert}
            className={`w-full rounded-md border px-3 py-2 text-sm font-medium transition ${
              canRevert
                ? "border-white bg-canvas text-white hover:border-brand hover:text-brand cursor-pointer"
                : "border-white bg-canvas text-white cursor-not-allowed"
            }`}
            title={`Revert to ${STAGE_LABELS[prev]}`}
          >
            ← Revert to {STAGE_LABELS[prev]}
          </button>
        </div>
      )}
    </section>
  );
}

function StageButton({
  stage,
  label,
  currentStage,
  isOnHold,
  disabled,
  onClick,
  compact = false,
}: {
  stage: JobStage;
  label: string;
  currentStage: JobStage;
  isOnHold: boolean;
  disabled: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const isCurrent = currentStage === stage;
  const showYellow = isCurrent && isOnHold;
  const position = getStagePosition(stage, currentStage);

  let classes = "rounded-md border px-4 py-2 text-sm font-medium transition";
  if (compact) classes += " min-w-[8rem]";
  else classes += " w-full max-w-[16rem]";

  if (showYellow) {
    classes +=
      " border-yellow-500 bg-yellow-500/20 text-yellow-100 ring-2 ring-yellow-500/40";
  } else if (position === "current") {
    classes += " border-brand bg-brand text-ink hover:bg-brand-hover";
  } else if (position === "past") {
    classes += " border-white bg-canvas text-white";
  } else {
    classes += " border-white bg-card text-white";
  }

  if (disabled) {
    classes += " cursor-not-allowed";
  } else {
    classes += " hover:border-brand cursor-pointer";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classes}
      aria-pressed={isCurrent}
    >
      {label}
    </button>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center text-white" aria-hidden>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 2v9m0 0l-3-3m3 3l3-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
