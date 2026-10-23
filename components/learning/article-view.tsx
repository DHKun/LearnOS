import type { ReactElement } from "react";

import { compileMDX } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { mdxComponents } from "@/components/mdx";

// MDX compilation is pure for a given source string, so it can be reused
// across requests. The cache key changes automatically when content changes.
const compiledCache = new Map<string, Promise<ReactElement>>();

function compileArticle(source: string): Promise<ReactElement> {
  const cached = compiledCache.get(source);
  if (cached) return cached;

  const promise = compileMDX({
    source,
    components: mdxComponents,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeSlug],
      },
    },
  }).then((result) => result.content);

  compiledCache.set(source, promise);
  void promise.catch(() => compiledCache.delete(source));
  return promise;
}

/** Render trusted repository MDX. Never pass user-authored MDX here. */
export async function ArticleView({ source }: { source: string }) {
  const content = await compileArticle(source);
  return <article className="prose-learn min-w-0 max-w-none">{content}</article>;
}
