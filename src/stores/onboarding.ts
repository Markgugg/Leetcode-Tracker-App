import { create } from 'zustand';
import type { LcStats } from '@/lib/leetcode';

// Holds in-progress onboarding answers between steps. The profile row is only
// written once, at the goal step — if the user quits mid-flow they simply
// restart onboarding on next launch (matches pre-redesign behavior).
interface OnboardingState {
  /** True while the user is inside the multi-step flow; the root layout
   *  suspends its auto-redirects so step navigation isn't hijacked. */
  active: boolean;
  username: string;
  displayName: string;
  lcUsername: string;
  lcPreview: LcStats | null;
  goal: number;
  set: (patch: Partial<Omit<OnboardingState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const initial = {
  active: false,
  username: '',
  displayName: '',
  lcUsername: '',
  lcPreview: null,
  goal: 5,
};

export const useOnboarding = create<OnboardingState>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));
