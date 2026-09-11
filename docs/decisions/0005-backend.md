# ADR 0005: Supabase as the backend

Date: 2026-09-11 · Status: Accepted

## Context
MyNotes is single-user for V1 (no team accounts, no shared workspaces).
Building custom auth, storage, and sync from scratch is over-engineering
for that scope.

## Decision
Use Supabase: managed Postgres, Auth, Storage, and Row-Level Security.
RLS policies (see `infra/supabase/migrations/0001_init.sql`) scope every
row to `auth.uid()`, which is the technical guarantee behind the PRD's
"must never expose one user's information to another" (Section 32).
