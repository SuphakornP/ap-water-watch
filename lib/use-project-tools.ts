"use client";
import { useEffect, useRef } from "react";
import type { Assessment } from "./flood-types";
interface ToolRegistry {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}
export function useProjectTools(items: Assessment[], radius: number) {
  const state = useRef({ items, radius });
  useEffect(() => {
    state.current = { items, radius };
  }, [items, radius]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: ToolRegistry })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: "get_visible_project_water_status",
      title: "อ่านสถานการณ์น้ำของโครงการในมุมมอง",
      description:
        "Read the same AP project water screening results currently visible after filters, with source timestamps. This is proximity screening, not confirmed flooding.",
      inputSchema: {
        type: "object",
        properties: {
          projectIds: {
            type: "array",
            items: { type: "string" },
            maxItems: 30,
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: unknown) {
        if (!input || typeof input !== "object" || Array.isArray(input))
          throw new Error("Expected an object");
        const value = input as Record<string, unknown>;
        if (Object.keys(value).some((k) => k !== "projectIds"))
          throw new Error("Unknown property");
        if (
          value.projectIds !== undefined &&
          (!Array.isArray(value.projectIds) ||
            value.projectIds.length > 30 ||
            value.projectIds.some((id) => typeof id !== "string"))
        )
          throw new Error("projectIds must contain up to 30 strings");
        const ids = value.projectIds as string[] | undefined;
        const rows = state.current.items.filter(
          (a) => !ids || ids.includes(a.project.id),
        );
        return {
          radiusKm: state.current.radius,
          total: rows.length,
          projects: rows
            .slice(0, 30)
            .map((a) => ({
              id: a.project.id,
              name: a.project.name,
              risk: a.risk,
              reason: a.reason,
              coverage: a.coverage,
              trigger: a.trigger
                ? {
                    name: a.trigger.name,
                    distanceKm: a.trigger.distance,
                    observedAt: a.trigger.observedAt,
                  }
                : null,
            })),
          limitation:
            "Nearby station signals do not establish flooding or safety at a project.",
        };
      },
    };
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch((error) =>
        console.warn("Project tool registration failed", error),
      );
    } catch (error) {
      console.warn("Project tool registration failed", error);
    }
    return () => lifecycle.abort();
  }, []);
}
