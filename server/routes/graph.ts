import { Router } from 'express';
import * as wikiFs from '../lib/wiki-fs.js';

const router = Router();

interface GraphNode {
  id: string;
  label: string;
  path: string;
  type: 'source' | 'entity' | 'concept' | 'synthesis' | 'unknown';
  wordCount: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

function detectType(path: string): GraphNode['type'] {
  if (path.startsWith('sources/')) return 'source';
  if (path.startsWith('entities/')) return 'entity';
  if (path.startsWith('concepts/')) return 'concept';
  if (path.startsWith('syntheses/')) return 'synthesis';
  return 'unknown';
}

function slugToTitle(slug: string): string {
  // Convert kebab-case or snake_case to Title Case
  return slug
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  // Match [[Title]] or [[Title|Alias]]
  const regex = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

router.get('/', async (_req, res) => {
  try {
    const pages = await wikiFs.listPages();
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    // First pass: create all nodes
    for (const pagePath of pages) {
      const content = await wikiFs.readPage(pagePath).catch(() => '');
      const filename = pagePath.replace(/^.*\//, '').replace(/\.md$/, '');
      
      // Try to get title from frontmatter
      const titleMatch = content.match(/^---\n[\s\S]*?title:\s*"?([^"\n]+)"?\n[\s\S]*?^---/m);
      const title = titleMatch ? titleMatch[1].trim() : slugToTitle(filename);
      
      nodes.set(title, {
        id: title,
        label: title,
        path: pagePath,
        type: detectType(pagePath),
        wordCount: content.split(/\s+/).length,
      });
    }

    // Second pass: extract edges
    for (const pagePath of pages) {
      const content = await wikiFs.readPage(pagePath).catch(() => '');
      const filename = pagePath.replace(/^.*\//, '').replace(/\.md$/, '');
      const titleMatch = content.match(/^---\n[\s\S]*?title:\s*"?([^"\n]+)"?\n[\s\S]*?^---/m);
      const sourceTitle = titleMatch ? titleMatch[1].trim() : slugToTitle(filename);
      
      const links = extractWikiLinks(content);
      for (const link of links) {
        // Find matching node (exact or fuzzy)
        let targetId = link;
        if (!nodes.has(link)) {
          // Try case-insensitive match
          const found = Array.from(nodes.values()).find(
            (n) => n.label.toLowerCase() === link.toLowerCase()
          );
          if (found) targetId = found.id;
        }
        
        if (nodes.has(sourceTitle) && nodes.has(targetId)) {
          edges.push({ source: sourceTitle, target: targetId });
        }
      }
    }

    res.json({
      nodes: Array.from(nodes.values()),
      edges,
      stats: {
        totalPages: nodes.size,
        totalLinks: edges.length,
        sources: Array.from(nodes.values()).filter((n) => n.type === 'source').length,
        entities: Array.from(nodes.values()).filter((n) => n.type === 'entity').length,
        concepts: Array.from(nodes.values()).filter((n) => n.type === 'concept').length,
        syntheses: Array.from(nodes.values()).filter((n) => n.type === 'synthesis').length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
