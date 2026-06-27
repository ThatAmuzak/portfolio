---
title: "Welcome to my blog"
date: 2026-06-04
draft: true
tags: ["hugo", "portfolio", "markdown"]
summary: "A starter post showing the markdown features supported by this site."
---

This is a normal Markdown post in `content/blogs/`. Each `.md` file here becomes its own blog post.

## Supported Markdown

- Lists
- **Bold** / *italic* / ~~strikethrough~~
- [Links](https://gohugo.io/)
- `inline code`
- Task lists
- Tables
- Images
- Raw HTML embeds for video/iframes

### Task list

- [x] Hugo blog enabled
- [x] Markdown rendering enabled
- [ ] Replace this with your real post

### Table

| Item | Notes                 |
|------|-----------------------|
| Hugo | Static site generator |
| Aafu | Portfolio theme       |

### Code block

```ts
export function greet(name: string) {
  return `Hello, ${name}`
}
```

### Image

![Sample diagram](/blogs/sample-diagram.svg)

### Video embed

Because raw HTML is enabled, this works:

<video controls width="100%">
  <source src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

### YouTube embed

Use the shortcode instead of raw iframe HTML:

{{< youtube dQw4w9WgXcQ >}}
