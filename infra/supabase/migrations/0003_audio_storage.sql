-- Phase 3: a private Storage bucket for recorded audio (voice notes and
-- meetings both use it — object paths are "{user_id}/voice-notes/{id}"
-- and "{user_id}/meetings/{id}"). Objects are private; the app requests a
-- short-lived signed URL per file rather than making the bucket public.

insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

-- storage.foldername(name) splits the object path into an array of
-- folder segments — the first segment is always this user's id, by
-- convention enforced here (not by the client): nobody can read, write,
-- or delete under another user's prefix even with the anon key.
create policy "own audio files" on storage.objects
  for all
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
