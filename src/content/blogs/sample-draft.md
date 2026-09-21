---
title: 'Sample Draft: Markdown & Media Cheat Sheet'
date: 2026-09-20
description: 'A scratch post showing how to embed local images, videos, and everything GFM supports.'
tags: ['meta', 'howto']
draft: true
---

## Local image

Put files in `public/blog/` and reference them as follows:

![A demo screenshot](/blog/demo.png)

## YouTube embed

Paste the share URL inside an iframe, raw HTML is allowed:

<iframe
  width="560"
  height="315"
  src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
  title="YouTube video"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen
></iframe>

## Hyperlinks

Inline [links](https://example.com) and bare autolinks like https://example.com both work.

## GFM extras

- [x] Task lists
- [ ] Drafts don't ship until `draft: false`
- ~~Mistakes~~ get struck through
- Footnotes too[^1]

| GFM feature   | Supported |
| ------------- | :-------: |
| Tables        |    ✅     |
| Task lists    |    ✅     |
| Strikethrough |    ✅     |

[^1]: Like this one.

```ts
// Fenced code with syntax highlighting
const answer = 42;
```

> Blockquotes pick up the teal accent border automatically.
