import type { ArtifactType } from "../enums/artifact.js";
import type { ArtifactStatus } from "../enums/artifact.js";

export interface Artifact {
  id: string;
  messageId: string;
  type: ArtifactType;
  status: ArtifactStatus;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
