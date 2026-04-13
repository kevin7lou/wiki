# Wiki Schema

## Page Types
| Type       | Directory          | Purpose                              |
|------------|--------------------|--------------------------------------|
| entity     | content/entities/  | People, organizations, products, tools, datasets |
| concept    | content/concepts/  | Techniques, methods, theories, frameworks |
| source     | content/sources/   | Article summaries with link to original |
| synthesis  | content/synthesis/ | Cross-topic analysis and conclusions |

## Frontmatter
All pages must include YAML frontmatter:

---
type: entity | concept | source | synthesis
title: Human-readable title
tags: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: ["original filename"]
---

Source pages also include:

url: "https://..."
date: YYYY-MM-DD

## Naming Conventions
- Filenames: kebab-case.md
- Entities: official name (e.g., openai.md, claude.md)
- Concepts: descriptive noun phrase (e.g., chain-of-thought.md)
- Sources: origin-date-slug (e.g., arxiv-2024-03-attention.md)

## Cross-referencing
- Use [[wikilink]] syntax between wiki pages
- Every entity and concept must appear in index.md
- Link on first mention only, don't repeat
- Source pages link to entities and concepts they discuss

## Contradiction Handling
When sources contradict:
1. Note the contradiction in the relevant concept/entity page
2. Link both sources
3. Resolve in a synthesis page when sufficient evidence exists
