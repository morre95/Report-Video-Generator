import { ZipArchive } from "archiver";

export interface ArchiveArtifact {
  filePath: string;
  archiveName: string;
}

export function createJobArchive(artifacts: ArchiveArtifact[]): ZipArchive {
  if (artifacts.length === 0) {
    throw new Error("Cannot create an empty job archive");
  }

  const archive = new ZipArchive({ store: true });
  for (const artifact of artifacts) {
    archive.file(artifact.filePath, { name: artifact.archiveName });
  }
  return archive;
}
