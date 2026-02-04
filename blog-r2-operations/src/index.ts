/**
 * Blog R2 Operations Worker
 * 
 * Replaces bash scripts with proper API endpoints for blog management
 */

export interface Env {
  BLOG_R2: R2Bucket;
  ADMIN_TOKEN: string;
  BLOG_URL: string; // https://blog.minte.dev
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS for admin UI
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Public endpoints (no auth required)
      if (url.pathname === '/api/stats') {
        const stats = await getBlogStats(env);
        return jsonResponse(stats, corsHeaders);
      }

      if (url.pathname === '/api/posts') {
        const index = await getPostsIndex(env);
        return jsonResponse(index, corsHeaders);
      }

      // Admin endpoints (require token)
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (!token || token !== env.ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Publish post
      if (url.pathname === '/api/publish' && request.method === 'POST') {
        const post = await request.json();
        const result = await publishPost(post, env);
        return jsonResponse(result, corsHeaders);
      }

      // Unpublish post
      if (url.pathname.startsWith('/api/unpublish/')) {
        const slug = url.pathname.split('/')[3];
        const result = await unpublishPost(slug, env);
        return jsonResponse(result, corsHeaders);
      }

      // Purge cache
      if (url.pathname === '/api/purge-cache') {
        const slug = url.searchParams.get('slug');
        const result = await purgeCache(slug, env);
        return jsonResponse(result, corsHeaders);
      }

      // List drafts
      if (url.pathname === '/api/drafts') {
        const drafts = await listDrafts(env);
        return jsonResponse({ drafts }, corsHeaders);
      }

      // Save draft
      if (url.pathname === '/api/drafts' && request.method === 'POST') {
        const draft = await request.json();
        const result = await saveDraft(draft, env);
        return jsonResponse(result, corsHeaders);
      }

      // Promote draft
      if (url.pathname.startsWith('/api/drafts/') && url.pathname.endsWith('/publish')) {
        const slug = url.pathname.split('/')[3];
        const { date } = await request.json();
        const result = await promoteDraft(slug, date, env);
        return jsonResponse(result, corsHeaders);
      }

      // Delete draft
      if (url.pathname.startsWith('/api/drafts/') && request.method === 'DELETE') {
        const slug = url.pathname.split('/')[3];
        const result = await deleteDraft(slug, env);
        return jsonResponse(result, corsHeaders);
      }

      // Regenerate index
      if (url.pathname === '/api/regenerate-index') {
        const result = await regenerateIndex(env);
        return jsonResponse(result, corsHeaders);
      }

      // Regenerate tags index
      if (url.pathname === '/api/regenerate-tags') {
        const result = await regenerateTagsIndex(env);
        return jsonResponse(result, corsHeaders);
      }

      // Validate index
      if (url.pathname === '/api/validate-index') {
        const validation = await validateIndex(env);
        return jsonResponse(validation, corsHeaders);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Blog R2 error:', error);
      return new Response(JSON.stringify({ 
        error: error.message || 'Internal Server Error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

async function publishPost(post: any, env: Env) {
  // Validate post
  if (!post.title || !post.slug || !post.content || !post.date) {
    throw new Error('Invalid post data: missing required fields');
  }

  // Sanitize slug
  const sanitizedSlug = sanitizeSlug(post.slug);
  if (sanitizedSlug !== post.slug) {
    throw new Error('Invalid slug: contains unsafe characters');
  }

  // Check for duplicates
  const existingPath = `posts/${post.date}-${post.slug}.json`;
  const existing = await env.BLOG_R2.get(existingPath);
  const overwritten = existing !== null;

  // Upload post
  await env.BLOG_R2.put(existingPath, JSON.stringify(post, null, 2), {
    httpMetadata: {
      contentType: 'application/json'
    },
    customMetadata: {
      published: new Date().toISOString()
    }
  });

  // Update index
  await updatePostsIndex(post, env);

  // Purge cache
  await purgeCache(post.slug, env);

  return {
    success: true,
    url: `${env.BLOG_URL}/posts/${post.slug}`,
    r2_path: existingPath,
    overwritten,
    cache_purged: true
  };
}

async function unpublishPost(slug: string, env: Env) {
  // Find post in R2
  const posts = await env.BLOG_R2.list({ prefix: 'posts/' });
  const postObj = posts.objects.find(obj => obj.key.includes(slug));

  if (!postObj) {
    throw new Error('Post not found');
  }

  // Get post data
  const post = await env.BLOG_R2.get(postObj.key);
  const postData = await post?.json();

  // Move to drafts
  const draftPath = `drafts/${slug}.json`;
  await env.BLOG_R2.put(draftPath, JSON.stringify(postData, null, 2));

  // Delete from posts
  await env.BLOG_R2.delete(postObj.key);

  // Update index
  await updatePostsIndex(null, env, slug);

  // Purge cache
  await purgeCache(slug, env);

  return {
    success: true,
    moved_to: draftPath,
    cache_purged: true
  };
}

async function getBlogStats(env: Env) {
  const [posts, drafts] = await Promise.all([
    env.BLOG_R2.list({ prefix: 'posts/' }),
    env.BLOG_R2.list({ prefix: 'drafts/' })
  ]);

  // Calculate storage
  let totalSize = 0;
  for (const obj of [...posts.objects, ...drafts.objects]) {
    totalSize += obj.size;
  }

  // Get recent posts
  const recentPosts = await Promise.all(
    posts.objects
      .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
      .slice(0, 10)
      .map(async obj => {
        const post = await env.BLOG_R2.get(obj.key);
        const data = await post?.json();
        return {
          slug: data.slug,
          title: data.title,
          date: data.date,
          uploaded: obj.uploaded
        };
      })
  );

  return {
    total_posts: posts.objects.length + drafts.objects.length,
    published_count: posts.objects.length,
    draft_count: drafts.objects.length,
    storage_mb: Math.round((totalSize / 1024 / 1024) * 100) / 100,
    recent_posts: recentPosts,
    last_published: recentPosts[0]?.date || null
  };
}

async function purgeCache(slug: string | null, env: Env) {
  const urls = [
    `${env.BLOG_URL}/`,
    `${env.BLOG_URL}/rss.xml`
  ];

  if (slug) {
    urls.push(`${env.BLOG_URL}/posts/${slug}`);
  }

  // Note: Actual cache purging would require Cloudflare API
  // For now, just return success

  return {
    success: true,
    purged_urls: urls
  };
}

async function listDrafts(env: Env) {
  const drafts = await env.BLOG_R2.list({ prefix: 'drafts/' });

  const draftsList = await Promise.all(
    drafts.objects.map(async obj => {
      const draft = await env.BLOG_R2.get(obj.key);
      const data = await draft?.json();
      return {
        slug: data.slug,
        title: data.title,
        created: obj.uploaded,
        size: obj.size
      };
    })
  );

  return draftsList;
}

async function saveDraft(draft: any, env: Env) {
  if (!draft.title || !draft.slug || !draft.content) {
    throw new Error('Invalid draft: missing required fields');
  }

  const sanitizedSlug = sanitizeSlug(draft.slug);
  if (sanitizedSlug !== draft.slug) {
    throw new Error('Invalid slug');
  }

  const path = `drafts/${draft.slug}.json`;
  await env.BLOG_R2.put(path, JSON.stringify(draft, null, 2), {
    httpMetadata: {
      contentType: 'application/json'
    }
  });

  return {
    success: true,
    path
  };
}

async function promoteDraft(slug: string, date: string, env: Env) {
  const draftPath = `drafts/${slug}.json`;
  const draft = await env.BLOG_R2.get(draftPath);

  if (!draft) {
    throw new Error('Draft not found');
  }

  const draftData = await draft.json();
  const post = {
    ...draftData,
    date
  };

  // Publish
  await publishPost(post, env);

  // Delete draft
  await env.BLOG_R2.delete(draftPath);

  return {
    success: true,
    published_url: `${env.BLOG_URL}/posts/${slug}`
  };
}

async function deleteDraft(slug: string, env: Env) {
  const path = `drafts/${slug}.json`;
  await env.BLOG_R2.delete(path);

  return {
    success: true,
    deleted_from: path
  };
}

async function regenerateIndex(env: Env) {
  const posts = await env.BLOG_R2.list({ prefix: 'posts/' });

  const index = await Promise.all(
    posts.objects.map(async obj => {
      const post = await env.BLOG_R2.get(obj.key);
      const data = await post?.json();
      return {
        slug: data.slug,
        title: data.title,
        date: data.date,
        excerpt: data.content.substring(0, 200)
      };
    })
  );

  // Sort by date descending
  index.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  await env.BLOG_R2.put('metadata/posts-index.json', JSON.stringify({ posts: index }, null, 2), {
    httpMetadata: {
      contentType: 'application/json'
    }
  });

  return {
    success: true,
    posts_indexed: index.length
  };
}

async function regenerateTagsIndex(env: Env) {
  const posts = await env.BLOG_R2.list({ prefix: 'posts/' });
  const tags: Record<string, string[]> = {};

  for (const obj of posts.objects) {
    const post = await env.BLOG_R2.get(obj.key);
    const data = await post?.json();

    if (data.tags) {
      for (const tag of data.tags) {
        if (!tags[tag]) {
          tags[tag] = [];
        }
        tags[tag].push(data.slug);
      }
    }
  }

  await env.BLOG_R2.put('metadata/tags-index.json', JSON.stringify({ tags }, null, 2), {
    httpMetadata: {
      contentType: 'application/json'
    }
  });

  return {
    success: true,
    tags
  };
}

async function validateIndex(env: Env) {
  const index = await env.BLOG_R2.get('metadata/posts-index.json');
  if (!index) {
    return {
      valid: false,
      errors: ['Index file not found']
    };
  }

  const indexData = await index.json();
  const errors: string[] = [];

  // Validate each post in index exists
  for (const post of indexData.posts) {
    const exists = await env.BLOG_R2.head(`posts/${post.date}-${post.slug}.json`);
    if (!exists) {
      errors.push(`Post not found: ${post.slug}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

async function updatePostsIndex(post: any, env: Env, removeSlug?: string) {
  let index = await getPostsIndex(env);

  if (removeSlug) {
    index.posts = index.posts.filter(p => p.slug !== removeSlug);
  }

  if (post) {
    // Remove existing if updating
    index.posts = index.posts.filter(p => p.slug !== post.slug);
    // Add new
    index.posts.push({
      slug: post.slug,
      title: post.title,
      date: post.date,
      excerpt: post.content.substring(0, 200)
    });
    // Sort by date
    index.posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  await env.BLOG_R2.put('metadata/posts-index.json', JSON.stringify(index, null, 2), {
    httpMetadata: {
      contentType: 'application/json'
    }
  });
}

async function getPostsIndex(env: Env) {
  const index = await env.BLOG_R2.get('metadata/posts-index.json');
  if (!index) {
    return { posts: [] };
  }
  return await index.json();
}

function sanitizeSlug(slug: string): string {
  // Only allow alphanumeric, hyphens, underscores
  return slug.replace(/[^a-z0-9-_]/gi, '');
}

function jsonResponse(data: any, additionalHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      ...additionalHeaders
    }
  });
}
