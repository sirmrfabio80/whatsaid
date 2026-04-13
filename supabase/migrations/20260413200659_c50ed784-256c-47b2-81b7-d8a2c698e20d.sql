-- Set file size limit on temp-audio bucket (250MB max, covers 60min audio files)
UPDATE storage.buckets
SET file_size_limit = 262144000,
    allowed_mime_types = ARRAY['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/mp3']
WHERE id = 'temp-audio';
