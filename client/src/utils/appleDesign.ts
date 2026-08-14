import type { Transition, Variants } from 'framer-motion';

// Apple Physics Spring Constants
// Damping Ratio = 1.0 (Critically Damped - smooth settle, zero unwanted wobble)
export const appleSpringDefault: Transition = {
  type: 'spring',
  stiffness: 350,
  damping: 30,
  mass: 0.8,
};

// Under-damped spring for momentum/flicks (damping ratio ~0.8 - slight organic bounce)
export const appleSpringMomentum: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 22,
  mass: 0.9,
};

// Snappy spring for quick micro-interactions (toggles, tabs, buttons)
export const appleSpringSnappy: Transition = {
  type: 'spring',
  stiffness: 450,
  damping: 32,
};

// Container stagger variants for grid items
export const appleStaggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

// Item reveal variant
export const appleItemReveal: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: appleSpringDefault,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.15 },
  },
};

// Page transition variant
export const applePageFade: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: appleSpringDefault,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2 },
  },
};
