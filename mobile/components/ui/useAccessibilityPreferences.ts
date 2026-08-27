import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

export function useAccessibilityPreferences() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);

    const motionSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    const transparencySubscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );

    return () => {
      motionSubscription.remove();
      transparencySubscription.remove();
    };
  }, []);

  return { reduceMotion, reduceTransparency };
}
