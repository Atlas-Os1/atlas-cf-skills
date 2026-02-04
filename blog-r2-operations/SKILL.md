# Blog R2 Operations

---
name: blog-r2-operations
description: Use when managing blog.minte.dev content via API. Replaces bash scripts with proper Worker endpoints for publishing, unpublishing, stats, cache purging, and draft management.
---

## Overview

Clean API for managing blog.minte.dev content stored in R2. Replaces bash scripts (`blog-r2-admin.sh`) with proper REST endpoints.

**Core Principle:** Automation-first API design. Built for daily blog automation.

## When to Use This Skill

**Triggers:**
- "Publish blog post"
- "Unpublish blog post"
- "Get blog stats"
- "Purge blog cache"
- "List blog drafts"
- "Manage blog content"

**Context Required:**
- Admin token (for write operations)
- Blog URL (https://blog.minte.dev)
- R2 bucket (minte-blog-prod)

## Implementation Guide

### Deployment

```bash
cd /home/flo/atlas-cf-skills/blog-r2-operations
wrangler deploy

# Set secrets
wrangler secret put ADMIN_TOKEN
wrangler secret put BLOG_URL <<< "https://blog.minte.dev"
```

### API Endpoints

#### Public (No Auth)

**Get Stats:**
```bash
GET /api/stats

Response:
{
  "total_posts": 15,
  "published_count": 12,
  "draft_count": 3,
  "storage_mb": 2.5,
  "recent_posts": [...],
  "last_published": "2026-02-04"
}
```

**Get Posts Index:**
```bash
GET /api/posts

Response:
{
  "posts": [
    {
      "slug": "my-post",
      "title": "My Post",
      "date": "2026-02-04",
      "excerpt": "..."
    }
  ]
}
```

#### Admin (Require `Authorization: Bearer <token>`)

**Publish Post:**
```bash
POST /api/publish
Authorization: Bearer $ADMIN_TOKEN
Content-Type: application/json

{
  "title": "My Blog Post",
  "slug": "my-blog-post",
  "content": "Post content here...",
  "date": "2026-02-04",
  "author": "Flo",
  "tags": ["development", "cloudflare"]
}

Response:
{
  "success": true,
  "url": "https://blog.minte.dev/posts/my-blog-post",
  "r2_path": "posts/2026-02-04-my-blog-post.json",
  "overwritten": false,
  "cache_purged": true
}
```

**Unpublish Post:**
```bash
DELETE /api/unpublish/{slug}
Authorization: Bearer $ADMIN_TOKEN

Response:
{
  "success": true,
  "moved_to": "drafts/my-blog-post.json",
  "cache_purged": true
}
```

**Purge Cache:**
```bash
POST /api/purge-cache
Authorization: Bearer $ADMIN_TOKEN

# Or specific post:
POST /api/purge-cache?slug=my-blog-post

Response:
{
  "success": true,
  "purged_urls": [
    "https://blog.minte.dev/",
    "https://blog.minte.dev/rss.xml",
    "https://blog.minte.dev/posts/my-blog-post"
  ]
}
```

**List Drafts:**
```bash
GET /api/drafts
Authorization: Bearer $ADMIN_TOKEN

Response:
{
  "drafts": [
    {
      "slug": "draft-post",
      "title": "Draft Post",
      "created": "2026-02-04T10:00:00Z",
      "size": 2048
    }
  ]
}
```

**Save Draft:**
```bash
POST /api/drafts
Authorization: Bearer $ADMIN_TOKEN
Content-Type: application/json

{
  "title": "Draft Post",
  "slug": "draft-post",
  "content": "Draft content..."
}

Response:
{
  "success": true,
  "path": "drafts/draft-post.json"
}
```

**Promote Draft to Published:**
```bash
POST /api/drafts/{slug}/publish
Authorization: Bearer $ADMIN_TOKEN
Content-Type: application/json

{
  "date": "2026-02-04"
}

Response:
{
  "success": true,
  "published_url": "https://blog.minte.dev/posts/draft-post"
}
```

**Delete Draft:**
```bash
DELETE /api/drafts/{slug}
Authorization: Bearer $ADMIN_TOKEN

Response:
{
  "success": true,
  "deleted_from": "drafts/draft-post.json"
}
```

**Regenerate Posts Index:**
```bash
POST /api/regenerate-index
Authorization: Bearer $ADMIN_TOKEN

Response:
{
  "success": true,
  "posts_indexed": 12
}
```

**Regenerate Tags Index:**
```bash
POST /api/regenerate-tags
Authorization: Bearer $ADMIN_TOKEN

Response:
{
  "success": true,
  "tags": {
    "cloudflare": ["post-1", "post-2"],
    "development": ["post-3"]
  }
}
```

**Validate Index:**
```bash
GET /api/validate-index
Authorization: Bearer $ADMIN_TOKEN

Response:
{
  "valid": true,
  "errors": []
}
```

---

### Usage Examples

#### Example 1: Daily Blog Automation

```typescript
// Generate post from yesterday's memory
const post = {
  title: "Building in Public: Feb 4, 2026",
  slug: "building-in-public-2026-02-04",
  content: generateContentFromMemory(),
  date: "2026-02-04",
  author: "Flo",
  tags: ["daily", "building-in-public"]
};

// Publish
const response = await fetch('https://blog.minte.dev/api/publish', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(post)
});

const result = await response.json();
console.log(`Published: ${result.url}`);
```

#### Example 2: Draft → Publish Workflow

```typescript
// Save draft first
await fetch('https://blog.minte.dev/api/drafts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: "Work in Progress",
    slug: "work-in-progress",
    content: "Not ready yet..."
  })
});

// Later, promote to published
await fetch('https://blog.minte.dev/api/drafts/work-in-progress/publish', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ date: "2026-02-05" })
});
```

#### Example 3: Blog Stats Monitoring

```typescript
const stats = await fetch('https://blog.minte.dev/api/stats')
  .then(r => r.json());

console.log(`Total posts: ${stats.total_posts}`);
console.log(`Published: ${stats.published_count}`);
console.log(`Drafts: ${stats.draft_count}`);
console.log(`Storage: ${stats.storage_mb}MB`);
console.log(`Last published: ${stats.last_published}`);
```

---

### Security

**Token Authentication:**
- All write operations require `Authorization: Bearer <token>`
- Token stored as Worker secret (`ADMIN_TOKEN`)
- Never commit token to git

**Slug Sanitization:**
- Only alphanumeric, hyphens, underscores allowed
- Prevents path traversal attacks
- Rejects invalid slugs

**CORS:**
- Allows all origins (`*`) for API
- Safe because auth is token-based

---

### Common Pitfalls

**Avoid these mistakes:**

1. **Forgetting to set ADMIN_TOKEN** - Write operations will fail
2. **Hardcoding token** - Use environment variables
3. **Not purging cache** - Old content stays cached
4. **Invalid slug characters** - Sanitize before publishing
5. **Missing required fields** - title, slug, content, date all required

---

### Integration with Daily Automation

**Morning Cron (9 AM CST):**

```bash
#!/bin/bash
# Generate post from yesterday's memory + GitHub activity

# 1. Generate content
POST_JSON=$(node /home/flo/clawd/scripts/generate-blog-post.js)

# 2. Publish via API
curl -X POST https://blog.minte.dev/api/publish \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$POST_JSON"

# 3. Auto-posts to Discord #blog-approvals for review
```

**Approval Workflow:**
- Minte replies `approve blog` → Post stays published
- Minte replies `deny blog` → Unpublish via API
- Minte replies `iterate [feedback]` → Regenerate and re-publish

---

### Troubleshooting

**401 Unauthorized?**
- Check `ADMIN_TOKEN` is set correctly
- Verify `Authorization: Bearer <token>` header

**Post not appearing on blog?**
- Purge cache: `POST /api/purge-cache`
- Regenerate index: `POST /api/regenerate-index`
- Check R2 bucket: `wrangler r2 object get minte-blog-prod posts/...`

**Duplicate posts?**
- Publishing same slug overwrites previous post
- Check `overwritten: true` in response

**Slow API responses?**
- R2 list operations can be slow with many posts
- Consider caching posts index in KV

---

**Remember:** This replaces bash scripts. Automation-first design means every operation has a clean API endpoint.

Use it for daily blog generation, manual publishing, and content management.
