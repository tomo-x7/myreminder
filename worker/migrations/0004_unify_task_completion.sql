-- 完了へ統合。submitted_at は互換名のまま完了時刻を記録する。
-- 既存の完了時刻がない課題は最終更新時刻を使用し、通知は過去分を再送しない。
UPDATE tasks SET submitted_at = COALESCE(submitted_at, updated_at), status = 'done'
WHERE status IN ('done', 'submitted');
-- 既存の未提出確認は統合後には送らない。
UPDATE notifications SET status = 'skipped'
WHERE kind = 'submit_check' AND status IN ('pending', 'deferred');
