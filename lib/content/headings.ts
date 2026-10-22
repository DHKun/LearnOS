import GithubSlugger from "github-slugger";

export type LessonHeading = {
  id: string;
  text: string;
  depth: 2 | 3;
};

/**
 * Extract h2/h3 headings from trusted MDX for the in-page outline.
 * IDs match the ones injected by rehype-slug at render time.
 */
export function extractHeadings(markdown: string): LessonHeading[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "");
  const slugger = new GithubSlugger();
  const headings: LessonHeading[] = [];

  for (const line of withoutCode.split("\n")) {
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const text = match[2]
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!text) continue;

    headings.push({
      id: slugger.slug(text),
      text,
      depth: match[1].length === 3 ? 3 : 2,
    });
  }

  return headings;
}
