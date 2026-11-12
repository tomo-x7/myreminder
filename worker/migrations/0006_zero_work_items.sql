-- 通常の課題と、作業時間・通知を持たないメモを区別する。
ALTER TABLE tasks ADD COLUMN task_kind TEXT NOT NULL DEFAULT 'work';
ALTER TABLE task_series ADD COLUMN task_kind TEXT NOT NULL DEFAULT 'work';
