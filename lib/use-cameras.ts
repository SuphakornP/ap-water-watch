"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraCatalog } from "./cameras";

export function useCameras(enabled: boolean) {
  const [catalog, setCatalog] = useState<CameraCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const response = await fetch("/api/cameras", { signal: request.signal });
      if (!response.ok) throw new Error(`Camera catalogue HTTP ${response.status}`);
      const data: CameraCatalog = await response.json();
      if (!Array.isArray(data.cameras) || !Array.isArray(data.sources)) throw new Error("Invalid camera catalogue response");
      if (request.signal.aborted) return;
      setCatalog(data);
      setError("");
    } catch (err) {
      if (request.signal.aborted) return;
      console.error("Camera catalogue request failed", err);
      setError("โหลดทะเบียนกล้องไม่ได้ หากมีรายการเดิมจะแสดงต่อพร้อมเวลาเดิม โปรดลองอีกครั้ง");
    } finally {
      if (controller.current === request) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled && !catalog) void refresh();
    return () => controller.current?.abort();
  }, [enabled, refresh]);
  return { catalog, loading, error, refresh };
}
