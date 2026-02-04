# Blog R2 Operations

Clean API for managing blog.minte.dev content stored in Cloudflare R2.

## Overview

Replaces bash scripts (`blog-r2-admin.sh`) with proper REST API endpoints for blog management.

**What it does:**
- ✅ Publish/unpublish posts
- ✅ Draft management
- ✅ Cache purging
- ✅ Index regeneration
- ✅ Blog statistics

**Built for:** Daily blog automation

## Quick Start

### 1. Deploy

```bash
cd /home/flo/atlas-cf-skills/blog-r2-operations
wrangler deploy
```

### 2. Configure

```bash
wrangler secret put ADMIN_TOKEN
wrangler secret put BLOG_URL <<< "https://blog.minte.dev"
```

### 3. Use

**Publish post:**
```bash
curl -X POST https://blog.minte.dev/api/publish \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Post",
    "slug": "my-post",
    "content": "Post content...",
    "date": "2026-02-04"
  }'
```

**Get stats (no auth):**
```bash
curl https://blog.minte.dev/api/stats
```

## API Endpoints

### Public (No Auth)

```
GET /api/stats - Blog statistics
GET /api/posts - Posts index
```

### Admin (Requires Token)

```
POST /api/publish - Publish post
DELETE /api/unpublish/{slug} - Unpublish post
POST /api/purge-cache - Purge cache
GET /api/drafts - List drafts
POST /api/drafts - Save draft
POST /api/drafts/{slug}/publish - Promote draft
DELETE /api/drafts/{slug} - Delete draft
POST /api/regenerate-index - Regenerate posts index
POST /api/regenerate-tags - Regenerate tags index
GET /api/validate-index - Validate index integrity
```

## R2 Bucket Structure

```
minte-blog-prod/
├── posts/                    # Published posts
│   └── 2026-02-04-my-post.json
├── drafts/                   # Unpublished drafts
│   └── my-draft.json
├── assets/                   # Images, avatars
│   └── avatars/
├── metadata/                 # Indexes
│   ├── posts-index.json
│   └── tags-index.json
└── config/                   # Branding, settings
    └── branding.json
```

## Post Format

```json
{
  "title": "My Blog Post",
  "slug": "my-blog-post",
  "content": "Full markdown content...",
  "date": "2026-02-04",
  "author": "Flo",
  "tags": ["development", "cloudflare"],
  "excerpt": "Optional excerpt..."
}
```

## Daily Automation Workflow

### 1. Generate Post (9 AM CST)

```bash
# Reads yesterday's memory + GitHub activity
node /home/flo/clawd/scripts/generate-blog-post.js > /tmp/blog-post.json
```

### 2. Publish via API

```bash
curl -X POST https://blog.minte.dev/api/publish \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/blog-post.json
```

### 3. Send for Approval

Posts to Discord **#blog-approvals** with preview.

### 4. Minte's Responses

- `approve blog` → Stays published
- `deny blog` → Unpublish via API
- `iterate [feedback]` → Regenerate with changes

## Security

**Token Authentication:**
- All write operations require `Authorization: Bearer <token>`
- Token never committed to git (Worker secret)

**Slug Sanitization:**
- Only `a-z`, `0-9`, `-`, `_` allowed
- Prevents path traversal

**CORS:**
- Allows all origins (safe with token auth)

## Testing

```bash
npm test -- tests/blog.test.ts
```

**Test coverage:**
- Publishing (valid, invalid, duplicates)
- Unpublishing
- Drafts (list, save, promote, delete)
- Stats and indexes
- Security (auth, slug validation)

## Troubleshooting

### 401 Unauthorized?
- Verify `ADMIN_TOKEN` secret is set
- Check `Authorization: Bearer <token>` header

### Post not showing on blog?
```bash
# Purge cache
curl -X POST https://blog.minte.dev/api/purge-cache \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Regenerate index
curl -X POST https://blog.minte.dev/api/regenerate-index \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Slow responses?
- R2 list operations scale with object count
- Consider caching index in KV for faster reads

## Integration with bash scripts

**Replace this:**
```bash
/home/flo/clawd/scripts/blog-r2-admin.sh publish /path/to/post.json
```

**With this:**
```bash
curl -X POST https://blog.minte.dev/api/publish \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/path/to/post.json
```

**Benefits:**
- No local dependencies
- Works from anywhere (VPS, container, GitHub Actions)
- Proper error handling
- Cleaner automation scripts

## Files

```
blog-r2-operations/
├── SKILL.md            # Agent instructions
├── README.md           # This file (human docs)
├── src/
│   └── index.ts        # Worker implementation
├── tests/
│   └── blog.test.ts    # Test suite
└── wrangler.toml       # Worker config
```

## Support

**Issues:** https://github.com/Atlas-Os1/atlas-cf-skills/issues
**Docs:** See SKILL.md for detailed agent instructions
**Minte:** Message in Discord #dev-team channel

---

**Built for automation-first blog management. 📝**
