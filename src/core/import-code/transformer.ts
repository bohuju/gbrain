import type { CodeNode, CodeEdge } from './types';
import { NODE_TO_PAGE_TYPE, EDGE_TO_LINK_TYPE, EMBEDDABLE_NODE_TYPES } from './types';
import { buildCodeSlug, buildCodeFrontmatter } from './slug-builder';
import type { PageInput, ChunkInput } from '../types';
import type { LinkBatchInput } from '../engine';

export interface TransformedData {
  pages: Array<{ slug: string; page: PageInput }>;
  links: LinkBatchInput[];
  chunks: Array<{ slug: string; chunks: ChunkInput[] }>;
  slugMap: Map<string, string>;  // nodeId → slug
}

/**
 * Transform GitNexus nodes and edges into GBrain pages, links, and chunks.
 * The slugMap (nodeId → slug) is built and used internally for link resolution.
 */
export function transformGraphData(
  nodes: CodeNode[],
  edges: CodeEdge[],
  repo: string,
): TransformedData {
  const slugMap = new Map<string, string>();
  const pages: Array<{ slug: string; page: PageInput }> = [];
  const chunks: Array<{ slug: string; chunks: ChunkInput[] }> = [];

  // Transform nodes → pages + chunks
  for (const node of nodes) {
    const slug = buildCodeSlug(repo, node);
    slugMap.set(node.id, slug);

    const pageType = (NODE_TO_PAGE_TYPE[node.label] ?? 'code_file') as PageInput['type'];

    const page: PageInput = {
      type: pageType,
      title: node.properties.name ?? slug,
      compiled_truth: formatCodePageContent(node),
      frontmatter: buildCodeFrontmatter(repo, node),
    };
    pages.push({ slug, page });

    // Generate chunks for embeddable node types
    if (EMBEDDABLE_NODE_TYPES.has(node.label) && node.properties.source) {
      const nodeChunks: ChunkInput[] = [];
      const text = generateNodeText(node);
      if (text.trim()) {
        // Single chunk per symbol (can be extended to semantic chunking later)
        nodeChunks.push({
          chunk_index: 1,
          chunk_text: text.slice(0, 8000),  // embedding char limit
          chunk_source: 'source_code',
          model: 'embo-01',
          symbol_name: node.properties.name,
          symbol_kind: node.label,
          start_line: node.properties.line,
          end_line: node.properties.endLine,
        });
      }
      chunks.push({ slug, chunks: nodeChunks });
    }
  }

  // Transform edges → links (only if both ends have slugs)
  const links: LinkBatchInput[] = [];
  for (const edge of edges) {
    const fromSlug = slugMap.get(edge.from);
    const toSlug = slugMap.get(edge.to);
    if (!fromSlug || !toSlug) continue;

    const linkType = EDGE_TO_LINK_TYPE[edge.type];
    if (!linkType) continue;

    links.push({
      from_slug: fromSlug,
      to_slug: toSlug,
      link_type: linkType,
      link_source: 'code_import',
      from_source_id: 'code',
      to_source_id: 'code',
      context: `${edge.type}${edge.properties.reason ? ` (${edge.properties.reason})` : ''}`,
    });
  }

  return { pages, links, chunks, slugMap };
}

function formatCodePageContent(node: CodeNode): string {
  const parts: string[] = [];
  const name = node.properties.name ?? 'unknown';
  const source = node.properties.source ?? '';

  parts.push(`# ${node.label}: \`${name}\``);
  parts.push('');
  if (node.properties.file) {
    parts.push(`> **File:** ${node.properties.file}${node.properties.line ? `:${node.properties.line}` : ''}`);
  }
  if (node.properties.signature) {
    parts.push(`> **Signature:** \`${node.properties.signature}\``);
  }
  if (source) {
    const lang = node.properties.language ?? '';
    parts.push('');
    parts.push('```' + lang);
    parts.push(source);
    parts.push('```');
  }

  return parts.join('\n');
}

function generateNodeText(node: CodeNode): string {
  const parts: string[] = [];
  parts.push(`${node.label}: ${node.properties.name}`);
  if (node.properties.signature) {
    parts.push(`Signature: ${node.properties.signature}`);
  }
  if (node.properties.source) {
    parts.push(node.properties.source);
  }
  return parts.join('\n');
}
