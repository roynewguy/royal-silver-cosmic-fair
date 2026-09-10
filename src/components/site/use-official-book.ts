"use client";

import { useQuery } from "@tanstack/react-query";
import { getOfficialBook } from "@/lib/public/api";

export function useOfficialBook() {
  return useQuery({
    queryKey: ["official-book"],
    queryFn: () => getOfficialBook(),
  });
}
