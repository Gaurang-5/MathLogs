import { AccessibilityInfo, Platform } from 'react-native';
import { useEffect, useState } from 'react';

export function useAccessibilityPreferences() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));

    const transparencyAPI = AccessibilityInfo as unknown as {
      isReduceTransparencyEnabled?: () => Promise<boolean>;
    };
    const supportsTransparencyPreference =
      Platform.OS === 'ios' &&
      typeof transparencyAPI.isReduceTransparencyEnabled === 'function';

    if (supportsTransparencyPreference) {
      void transparencyAPI.isReduceTransparencyEnabled?.()
        .then(setReduceTransparency)
        .catch(() => setReduceTransparency(false));
    }

    const motionSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    const transparencySubscription = supportsTransparencyPreference
      ? AccessibilityInfo.addEventListener(
        'reduceTransparencyChanged',
        setReduceTransparency,
      )
      : null;

    return () => {
      motionSubscription.remove();
      transparencySubscription?.remove();
    };
  }, []);

  return { reduceMotion, reduceTransparency };
}
