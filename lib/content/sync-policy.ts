export type CourseMetadataSource = {
  version: string;
  title: string;
  description: string;
};

/**
 * Status for a newly created course row. Manual sync keeps the review step
 * (`draft`); the deployment updater passes `--publish-new` so a copied course
 * is visible to students immediately after a successful deploy.
 */
export function initialCourseStatus(options: {
  publish?: boolean;
  publishNew?: boolean;
}): "draft" | "published" {
  return options.publish || options.publishNew ? "published" : "draft";
}

/**
 * Repository manifests own course structure and content version. Title and
 * description become admin-editable after creation; a normal sync must not
 * overwrite them. `--refresh-metadata` opts into replacing them explicitly.
 */
export function buildCourseUpdate(
  manifest: CourseMetadataSource,
  options: { publish?: boolean; refreshMetadata?: boolean },
) {
  const update: Record<string, unknown> = {
    content_version: manifest.version,
  };
  if (options.refreshMetadata) {
    update.title = manifest.title;
    update.description = manifest.description;
  }
  if (options.publish) update.status = "published";
  return update;
}
