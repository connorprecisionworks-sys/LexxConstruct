"use client";

export interface ProcessingStepperProps {
  stages: string[];
  currentStage: number; // 0-indexed; stages.length means done
  error?: string;
}

export function ProcessingStepper({ stages, currentStage, error }: ProcessingStepperProps) {
  const isDone = !error && currentStage >= stages.length;

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex items-center gap-0">
        {stages.map((label, i) => {
          const isCompleted = error ? i < currentStage : isDone || i < currentStage;
          const isActive = !error && !isDone && i === currentStage;
          const isErrorStage = error && i === currentStage;

          return (
            <li key={label} className="flex items-center">
              {/* Node */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={[
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                    isErrorStage
                      ? "bg-red-500 text-white"
                      : isCompleted
                      ? "bg-blue-600 text-white"
                      : isActive
                      ? "bg-blue-600 text-white soft-pulse"
                      : "bg-gray-200 text-gray-400",
                  ].join(" ")}
                >
                  {isCompleted && !isErrorStage ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isErrorStage ? (
                    "!"
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={[
                    "text-[10px] font-medium whitespace-nowrap",
                    isErrorStage
                      ? "text-red-500"
                      : isActive
                      ? "text-blue-600"
                      : isCompleted
                      ? "text-gray-500"
                      : "text-gray-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>

              {/* Connector */}
              {i < stages.length - 1 && (
                <div
                  className={[
                    "h-px w-10 mx-1 mb-4 transition-colors",
                    isCompleted ? "bg-blue-600" : "bg-gray-200",
                  ].join(" ")}
                />
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
