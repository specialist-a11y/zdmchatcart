-- Media details for the content library. Run after 0010. Safe to run twice.
-- width/height: so the app knows when a photo is too tall for an Instagram feed post (9:16).
-- thumb_path: a still frame of each video (cover image in the library, and what the AI looks at to write captions).
alter table public.video_clips
  add column if not exists width integer check (width is null or width > 0),
  add column if not exists height integer check (height is null or height > 0),
  add column if not exists thumb_path text;
