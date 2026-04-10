/**
 * LEXX — Active Storage Adapter
 *
 * THIS IS THE ONLY FILE YOU CHANGE TO SWAP DATABASES.
 *
 * V1 (now):
 *   import { JsonAdapter } from "./json";
 *   export const db = JsonAdapter;
 *
 * V2 (Supabase):
 *   import { SupabaseAdapter } from "./supabase";
 *   export const db = SupabaseAdapter;
 *
 * V2 (Prisma/Postgres):
 *   import { PrismaAdapter } from "./prisma";
 *   export const db = PrismaAdapter;
 */

import { JsonAdapter } from "./json";

export const db = JsonAdapter;
