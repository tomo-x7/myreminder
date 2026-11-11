-- 完了状態に残った旧版の未終了作業を修復する。
-- 0004を既に適用済みのDBにも適用するため、別migrationとする。
-- 完了時刻や最終更新時刻は変更しない。終了は開始より前にせず、
-- 長期間放置された記録を学習へ入れないよう、本人の確認待ちにする。
UPDATE sessions
SET end_at = max(start_at, (
    SELECT COALESCE(tasks.submitted_at, tasks.updated_at)
    FROM tasks WHERE tasks.id = sessions.task_id
)), review = 'needs_review'
WHERE kind = 'actual' AND end_at IS NULL
  AND task_id IN (SELECT id FROM tasks WHERE status IN ('done', 'submitted'));

UPDATE user_status SET mode = 'normal', task_id = NULL, until = NULL
WHERE mode = 'working'
  AND task_id IN (SELECT id FROM tasks WHERE status IN ('done', 'submitted'));
