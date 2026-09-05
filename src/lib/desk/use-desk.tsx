"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteDiscordPost, getDesk, lockDesk, postManualPick, postTestPreview, pushPick, refreshBoard, runDesk, saveDailyPicks, saveDeskSettings, saveWebhook, unlockDesk } from "@/lib/desk/api";
import { EMPTY_HEALTH } from "@/lib/desk/health";
import type { DeskState, Market, Side } from "@/lib/sports/types";

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
  health: EMPTY_HEALTH,
  researchModels: null,
};

type DeskApi = {
  data: DeskState;
  loading: boolean;
  scanning: boolean;
  running: boolean;
  posting: boolean;
  refresh: () => void;
  run: () => void;
  push: (input: { pickId: number; webhookUrl?: string; allowLive?: boolean }) => void;
  manualPost: (input: { gameId: string; market: Market; side: Side }) => void;
  testPost: (gameId: string) => void;
  deletePost: (pickId: number) => void;
  saveHook: (webhookUrl: string) => void;
  saveSettings: (input: { minEdgePct: number; minConfidence: number; postLeadMinutes: number }) => void;
  setDailyPicks: (count: number) => void;
  unlock: (pin: string) => void;
  lock: () => void;
  testing: boolean;
};

const DeskContext = createContext<DeskApi | null>(null);

function useDeskController(): DeskApi {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["desk"],
    queryFn: () => getDesk(),
    refetchInterval: 60_000,
    staleTime: 20_000,
    placeholderData: (prev) => prev,
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
      const queued = data.picks.filter((pick) => pick.status === "queued" || pick.status === "posting");
      const recentMessages = data.log.slice(0, 6).map((entry) => entry.message);
      const discordPost = recentMessages.some((message) => message.includes("Discord confirmed"));
      const noPickReason = recentMessages.find(
        (message) => message.includes("PASS") || message.includes("DraftKings line unavailable"),
      );

      if (discordPost) {
        toast.success("Official pick posted to Discord.");
      } else if (queued.length > 0) {
        toast.success(`${queued.length} pick${queued.length === 1 ? "" : "s"} queued. It will post at the time shown.`);
      } else {
        toast.info(noPickReason ? `${noPickReason} Nothing was sent to Discord.` : "No pick qualified. Nothing was sent to Discord.");
      }
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

  const deletePost = useMutation({
    mutationFn: (pickId: number) => deleteDiscordPost({ data: { pickId } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Delete failed.");
        return;
      }
      if (res.state) qc.setQueryData(["desk"], res.state);
      toast.success("Discord post deleted. The record was kept.");
    },
    onError: () => toast.error("Delete failed."),
  });

  const testPost = useMutation({
    mutationFn: (gameId: string) => postTestPreview({ data: { gameId } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Test post failed.");
        return;
      }
      if (res.state) qc.setQueryData(["desk"], res.state);
      toast.success("Test preview posted to Discord.");
    },
    onError: () => toast.error("Test post failed."),
  });

  const manualPost = useMutation({
    mutationFn: (input: { gameId: string; market: Market; side: Side }) => postManualPick({ data: input }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Manual post failed.");
        return;
      }
      if (res.state) qc.setQueryData(["desk"], res.state);
      toast.success("Pick posted to Discord and recorded.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Manual post failed."),
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

  const saveSettings = useMutation({
    mutationFn: (input: { minEdgePct: number; minConfidence: number; postLeadMinutes: number }) =>
      saveDeskSettings({ data: input }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Could not save settings.");
        return;
      }
      if (res.state) qc.setQueryData(["desk"], res.state);
      toast.success("Settings saved.");
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
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unlock failed."),
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
    posting: push.isPending || manualPost.isPending,
    testing: testPost.isPending,
    refresh: () => refresh.mutate(),
    run: () => run.mutate(),
    push: (input) => push.mutate(input),
    testPost: (gameId) => testPost.mutate(gameId),
    manualPost: (input) => manualPost.mutate(input),
    deletePost: (pickId) => deletePost.mutate(pickId),
    saveHook: (webhookUrl) => saveHook.mutate(webhookUrl),
    saveSettings: (input) => saveSettings.mutate(input),
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
