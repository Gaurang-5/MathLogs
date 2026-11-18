import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ProUpgradeSheet } from "../components/plans/ProUpgradeSheet";
import { useAuth } from "./AuthContext";
import {
  subscribeToProFeatureRequired,
  type ProFeaturePrompt,
} from "../services/proFeatureGate";

interface ProUpgradeContextValue {
  openProUpgrade: (prompt: ProFeaturePrompt) => void;
  runProFeature: (prompt: ProFeaturePrompt, action: () => void) => void;
}
const ProUpgradeContext = createContext<ProUpgradeContextValue | null>(null);

export function ProUpgradeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState<ProFeaturePrompt | null>(null);

  const openProUpgrade = useCallback((nextPrompt: ProFeaturePrompt) => {
    setPrompt(nextPrompt);
  }, []);

  const runProFeature = useCallback(
    (nextPrompt: ProFeaturePrompt, action: () => void) => {
      if (user?.productPlan === "BASIC") {
        setPrompt(nextPrompt);
        return;
      }
      action();
    },
    [user?.productPlan],
  );

  useEffect(
    () => subscribeToProFeatureRequired(openProUpgrade),
    [openProUpgrade],
  );

  useEffect(() => {
    if (user?.productPlan === "PRO") setPrompt(null);
  }, [user?.productPlan]);

  const value = useMemo(
    () => ({ openProUpgrade, runProFeature }),
    [openProUpgrade, runProFeature],
  );

  return (
    <ProUpgradeContext.Provider value={value}>
      {children}
      <ProUpgradeSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </ProUpgradeContext.Provider>
  );
}

export function useProUpgrade(): ProUpgradeContextValue {
  const context = useContext(ProUpgradeContext);
  if (!context)
    throw new Error("useProUpgrade must be used inside ProUpgradeProvider");
  return context;
}
