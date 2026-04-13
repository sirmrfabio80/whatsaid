-- One-time fix: replace "Channel N:" labels with "Speaker A/B/C:" in existing transcript outputs
UPDATE job_outputs
SET content = regexp_replace(
  regexp_replace(
    regexp_replace(content, '(^|\n\n)Channel 1:', '\1Speaker A:', 'g'),
    '(^|\n\n)Channel 2:', '\1Speaker B:', 'g'),
  '(^|\n\n)Channel 3:', '\1Speaker C:', 'g')
WHERE output_type = 'transcript'
  AND content LIKE 'Channel %:%';