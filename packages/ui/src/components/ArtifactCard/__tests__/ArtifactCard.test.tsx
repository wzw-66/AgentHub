import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ArtifactCard } from "../ArtifactCard.js";
import { ArtifactType, ArtifactStatus } from "@agenthub/shared";
import type { Artifact } from "@agenthub/shared";

const buildingArtifact: Artifact = {
  id: "art-1",
  messageId: "msg-1",
  type: ArtifactType.Code,
  status: ArtifactStatus.Building,
  title: "app.tsx",
  content: "",
  metadata: {},
  createdAt: "2026-05-27T10:30:00Z",
  updatedAt: "2026-05-27T10:30:00Z",
};

const completedArtifact: Artifact = {
  id: "art-2",
  messageId: "msg-1",
  type: ArtifactType.Code,
  status: ArtifactStatus.Completed,
  title: "app.tsx",
  content: "const x = 1;",
  metadata: {},
  createdAt: "2026-05-27T10:31:00Z",
  updatedAt: "2026-05-27T10:31:00Z",
};

const failedArtifact: Artifact = {
  id: "art-3",
  messageId: "msg-1",
  type: ArtifactType.Code,
  status: ArtifactStatus.Failed,
  title: "app.tsx",
  content: "",
  metadata: {},
  createdAt: "2026-05-27T10:32:00Z",
  updatedAt: "2026-05-27T10:32:00Z",
};

afterEach(cleanup);

describe("ArtifactCard", () => {
  it("building state shows loading indicator", () => {
    render(<ArtifactCard artifact={buildingArtifact} />);
    expect(screen.getByTestId("artifact-spinner")).toBeInTheDocument();
    expect(screen.getByTestId("artifactcard").textContent).toContain("Building");
  });

  it("completed state shows content", () => {
    render(<ArtifactCard artifact={completedArtifact} />);
    expect(screen.getByTestId("artifactcard").textContent).toContain("Completed");
    expect(screen.getByTestId("artifactcard").textContent).toContain("const x = 1;");
  });

  it("failed state shows error message", () => {
    render(<ArtifactCard artifact={failedArtifact} />);
    expect(screen.getByTestId("artifactcard").textContent).toContain("Build failed");
    expect(screen.getByTestId("artifactcard").textContent).toContain("error occurred");
  });

  it("applies className to root element", () => {
    render(<ArtifactCard artifact={buildingArtifact} className="custom-ac" />);
    expect(screen.getByTestId("artifactcard").className).toContain("custom-ac");
  });
});
