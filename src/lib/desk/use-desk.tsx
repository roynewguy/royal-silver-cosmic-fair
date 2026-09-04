"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { getDesk, pushPick, refreshBoard, runDesk, saveWebhook } from "@/lib/desk/api";
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
  hasWebhook: false,
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
};

const DeskContext = createContext<DeskApi | null>(null);

function useDeskController(): DeskApi {
  const qc = useQueryClient();
  const booted = useRef(false);

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
    onError: () => toast.error("Scan failed. Try again."),
  });

  const run = useMutation({
    mutationFn: () => runDesk(),
    onSuccess: (data) => {
      qc.setQueryData(["desk"], data);
      toast.success("Desk run complete.");
    },
    onError: () => toast.error("Desk run failed."),
  });

  const push = useMutation({
    mutationFn: (input: { pickId: number; webhookUrl?: string }) => pushPick({ data: input }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Post failed.");
        return;
      }
      if (res.state) qc.setQueryData(["desk"], res.state);
      toast.success("Posted to #picks.");
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
    },
  });

  useEffect(() => {
    if (booted.current) return;
    if (!query.isSuccess) return;
    booted.current = true;
    if (!query.data.lastScanAt && !refresh.isPending) {
      refresh.mutate();
    }
  }, [query.isSuccess, query.data?.lastScanAt, refresh]);

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
