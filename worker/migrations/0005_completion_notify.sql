-- 既存の課題と繰り返しは従来どおり完了を通知する。
ALTER TABLE tasks ADD COLUMN completion_notify integer NOT NULL DEFAULT 1;
ALTER TABLE task_series ADD COLUMN completion_notify integer NOT NULL DEFAULT 1;
