"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { toast } from "sonner";
import { getDesk, lockDesk, pushPick, refreshBoard, runDesk, saveDailyPicks, saveWebhook, unlockDesk } from "@/lib/desk/api";
import type { DeskState } from "@/lib/sports/types";

const empty: DeskState = {
  record: { wins: 0, losses: 0, pushes: 0, units: 0, pending: 0 },
  games: [],
  picks: [],
  scans: [],
  log: [],
  lastScanAt: null,
  lastDeskAt: null,
  minEdgePct: 3,
  minConfidence: 58,
  postLeadMinutes: 150,
  maxDailyPicks: 3,
  hasWebhook: false,
  webhookSource: "none",
  operator: false,
  soccerDesk: "off",
  pinFromEnv: false,
  calibration: null,
};

type DeskApi = {
  data: DeskState;
  loading: boolean;
  scanning: boolean;
  running: boolean;
  posting: boolean;
  refresh: () => void;
  run: () => void;
  push: (input: { pickId: number; webhookUrl?: string }) => void;
  saveHook: (webhookUrl: string) => void;
  setDailyPicks: (count: number) => void;
  unlock: (pin: string) => void;
  lock: () => void;
};

const DeskContext = createContext<DeskApi | null>(null);

function useDeskController(): DeskApi {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["desk"],
    queryFn: () => getDesk(),
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => refreshBoard(),
    onSuccess: (data) => {
      qc.setQueryData(["desk"], data);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Scan failed."),
  });

  const run = useMutation({
    mutationFn: () => runDesk(),
    onSuccess: (data) => {
      qc.setQueryData(["desk"], data);
      toast.success("Desk run complete.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Desk run failed."),
  });

  const push = useMutation({
    mutationFn: (input: { pickId: number; webhookUrl?: string }) => pushPick({ data: input }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Post failed.");
        return;
      }
      if (res.state) qc.setQueryData(["desk"], res.state);
      toast.success("Posted to Discord.");
    },
    onError: () => toast.error("Post failed."),
  });

  const saveHook = useMutation({
    mutationFn: (webhookUrl: string) => saveWebhook({ data: { webhookUrl } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Webhook not saved.");
        return;
      }
      if (res.state) qc.setQueryData(["desk"], res.state);
      toast.success("Webhook saved on the desk.");
    },
  });

  const savePlays = useMutation({
    mutationFn: (count: number) => saveDailyPicks({ data: { count } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Could not save daily plays.");
        return;
      }
      if (res.state) qc.setQueryData(["desk"], res.state);
      toast.success(`Daily card set to ${res.state?.maxDailyPicks ?? ""} plays.`);
    },
  });

  const unlock = useMutation({
    mutationFn: (pin: string) => unlockDesk({ data: { pin } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if ("state" in res && res.state) qc.setQueryData(["desk"], res.state);
      toast.success("Desk unlocked.");
    },
  });

  const lock = useMutation({
    mutationFn: () => lockDesk(),
    onSuccess: (data) => qc.setQueryData(["desk"], data),
  });

  return {
    data: query.data ?? empty,
    loading: query.isLoading,
    scanning: refresh.isPending,
    running: run.isPending,
    posting: push.isPending,
    refresh: () => refresh.mutate(),
    run: () => run.mutate(),
    push: (input) => push.mutate(input),
    saveHook: (webhookUrl) => saveHook.mutate(webhookUrl),
    setDailyPicks: (count) => savePlays.mutate(count),
    unlock: (pin) => unlock.mutate(pin),
    lock: () => lock.mutate(),
  };
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const value = useDeskController();
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskApi {
  const ctx = useContext(DeskContext);
  if (!ctx) throw new Error("useDesk must be used within DeskProvider");
  return ctx;
}
