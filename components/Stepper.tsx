
import React from 'react';
import type { Step } from '../types';

interface StepperProps {
  steps: Step[];
  currentStep: number;
}

const CheckIcon = () => (
  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
  </svg>
);

const Stepper: React.FC<StepperProps> = ({ steps, currentStep }) => {
  const getStatus = (stepIndex: number) => {
    if (stepIndex < currentStep) return 'complete';
    if (stepIndex === currentStep) return 'current';
    return 'upcoming';
  };

  return (
    <nav aria-label="Progress">
      <ol role="list" className="space-y-6">
        {steps.map((step, index) => {
          const status = getStatus(index + 1);
          return (
            <li key={step.name} className="relative">
              {index !== steps.length - 1 && (
                <div
                  className={`absolute left-4 top-4 -ml-px mt-0.5 h-full w-0.5 ${
                    status === 'complete' ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                  aria-hidden="true"
                />
              )}
              <div className="relative flex items-start group">
                <span className="h-9 flex items-center">
                  <span
                    className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full ${
                      status === 'complete'
                        ? 'bg-indigo-600'
                        : status === 'current'
                        ? 'border-2 border-indigo-600 bg-slate-850'
                        : 'border-2 border-slate-700 bg-slate-850'
                    }`}
                  >
                    {status === 'complete' ? (
                      <CheckIcon />
                    ) : (
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          status === 'current' ? 'bg-indigo-600' : 'bg-slate-700'
                        }`}
                      />
                    )}
                  </span>
                </span>
                <span className="ml-4 flex min-w-0 flex-col">
                  <span
                    className={`text-sm font-medium ${
                      status === 'current' ? 'text-indigo-400' : 'text-slate-400'
                    }`}
                  >
                    {step.name}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Stepper;
