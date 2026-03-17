export interface Env {
  DB: D1Database;
  AI: Ai;
  KV_STORE: KVNamespace;
  IMAGES: R2Bucket;
  JWT_SECRET: string;
  ADMIN_SECRET: string;
  SITE_URL: string;
  API_URL: string;
}

export interface JWTPayload {
  sub: number;
  username: string;
  role: string;
  exp: number;
  iat: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category_id: number;
  category_name?: string;
  category_slug?: string;
  author_id: number | null;
  status: string;
  ai_generated: number;
  meta_title: string | null;
  meta_desc: string | null;
  featured_image: string | null;
  read_time: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  published_at: string;
  tags?: string[];
  liked_by_user?: boolean;
}

export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  username?: string;
  parent_id: number | null;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
  replies?: Comment[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
}

export interface GeneratedPost {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  meta_title: string;
  meta_desc: string;
  read_time: number;
}
