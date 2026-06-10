"use client";

import { useState, useEffect, useRef } from "react";
import { DAG_NODES, type DemoPhase } from "@/lib/demo-data";

// ─── Props ──────────────────────────────────────────────────────────────

interface DAGIndicatorProps {
  currentPhase: DemoPhase;
  agentLabels?: string[];
}

// ─── Node colors per status ─────────────────────────────────────────────

type NodeStatus = "pending" | "active" | "processing" | "done";

const NODE_STYLES: Record<
  NodeStatus,
  { bg: string; border: string; text: string; glow: string }
> = {
  pending: {
    bg: "var(--bg-app)",
    border: "var(--border)",
    text: "var(--text-tertiary)",
    glow: "transparent",
  },
  active: {
    bg: "rgba(124,58,237,0.12)",
    border: "#7c3aed",
    text: "#7c3aed",
    glow: "0 0 12px rgba(124,58,237,0.3)",
  },
  processing: {
    bg: "rgba(124,58,237,0.2)",
    border: "#7c3aed",
    text: "#7c3aed",
    glow: "0 0 24px rgba(124,58,237,0.7)",
  },
  done: {
    bg: "rgba(16,185,129,0.1)",
    border: "#10b981",
    text: "#10b981",
    glow: "0 0 6px rgba(16,185,129,0.2)",
  },
};

// ─── Component ──────────────────────────────────────────────────────────

/**
 * Animated DAG orchestrator indicator shown during the demo sequence.
 * Displays a horizontal node chain where each node lights up green
 * as its phase becomes active/completed.
 */
export default function DAGIndicator({
  currentPhase,
  agentLabels = ["Agent 1", "Agent 2", "Agent 3"],
}: DAGIndicatorProps) {
  // ─── Phase transition animation state ──────────────────────────
  const [processingNode, setProcessingNode] = useState<string | null>(null);
  const prevPhaseRef = useRef(currentPhase);

  useEffect(() => {
    if (prevPhaseRef.current && prevPhaseRef.current !== currentPhase && currentPhase) {
      // The previous phase's node just completed — brief intense glow
      setProcessingNode(prevPhaseRef.current);
      const t = setTimeout(() => setProcessingNode(null), 700);
      prevPhaseRef.current = currentPhase;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = currentPhase;
  }, [currentPhase]);

  if (!currentPhase || currentPhase === "done") return null;

  /** Get visible nodes — progressive reveal: intro/decompose show only up to current, agents show all. */
  function getVisibleNodes(): readonly { key: string; label: string }[] {
    const phaseIndex = DAG_NODES.findIndex((n) => n.key === currentPhase);
    // During intro/decompose, show nodes incrementally
    if (phaseIndex <= 1) return DAG_NODES.slice(0, phaseIndex + 1);
    // From agent_1 onward, show all nodes
    return DAG_NODES;
  }

  function getNodeStatus(
    nodeKey: string,
  ): "pending" | "active" | "done" {
    const nodeIndex = DAG_NODES.findIndex((n) => n.key === nodeKey);
    const phaseIndex = DAG_NODES.findIndex((n) => n.key === currentPhase);
    if (nodeIndex < phaseIndex) return "done";
    if (nodeIndex === phaseIndex) return "active";
    return "pending";
  }

  function getNodeLabel(node: { key: string; label: string }): string {
    if (node.key === "agent_1") return agentLabels[0] ? `${agentLabels[0]}: 首页` : node.label;
    if (node.key === "agent_2") return agentLabels[1] ? `${agentLabels[1]}: 文章列表` : node.label;
    if (node.key === "agent_3") return agentLabels[2] ? `${agentLabels[2]}: 关于页` : node.label;
    return node.label;
  }

  return (
    <div
      className="flex items-center justify-center gap-0 px-4 py-3"
      style={{
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--border-light)",
        animation: "msgIn 0.35s ease forwards",
        overflow: "hidden",
      }}
    >
      {/* Small orb icon */}
      <span
        className="flex-shrink-0"
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: "#7c3aed",
          marginRight: "10px",
          boxShadow: "0 0 6px rgba(124, 58, 237, 0.4)",
          animation: "pulse-glow 1.5s ease infinite",
        }}
      />

      <div className="flex items-center gap-1.5 overflow-x-auto" style={{ flexWrap: "nowrap" }}>
        {getVisibleNodes().map((node, i) => {
          const baseStatus = getNodeStatus(node.key);
          const isProcessing = processingNode === node.key;
          const effectiveStatus: NodeStatus = isProcessing ? "processing" : baseStatus;
          const style = NODE_STYLES[effectiveStatus];
          const visibleNodes = getVisibleNodes();
          const isLast = i === visibleNodes.length - 1;

          return (
            <div key={node.key} className="flex items-center gap-0">
              {/* Node */}
              <div
                className="flex-shrink-0 flex items-center gap-1.5 rounded-full"
                style={{
                  padding: "4px 12px",
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  boxShadow: style.glow,
                  transition: isProcessing ? "none" : "all 0.5s",
                  animation: isProcessing
                    ? "processing-pulse 0.7s ease forwards"
                    : "none",
                }}
              >
                {/* Status dot */}
                <span
                  className="flex-shrink-0 rounded-full"
                  style={{
                    width: "6px",
                    height: "6px",
                    background: style.text,
                    animation:
                      baseStatus === "active" && !isProcessing
                        ? "pulse-glow 1s ease infinite"
                        : "none",
                  }}
                />
                {/* Label */}
                <span
                  className="flex-shrink-0 text-xs font-medium whitespace-nowrap"
                  style={{ color: style.text, fontSize: "10px" }}
                >
                  {getNodeLabel(node)}
                </span>
              </div>

              {/* Arrow connector */}
              {!isLast && (
                <span
                  className="flex-shrink-0"
                  style={{
                    color: "var(--border)",
                    fontSize: "12px",
                    margin: "0 4px",
                  }}
                >
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
