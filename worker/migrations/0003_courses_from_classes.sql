-- 既存の授業(busy_blocks.kind = 'class')の名前から科目を一度だけ作る(仕様: ai-docs/decisions.md #38)
-- 比べ方は trim した名前の完全一致。科目の名前・別名に一致する授業は作らない
INSERT INTO `courses` (`id`, `name`)
SELECT
	lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
	n.`name`
FROM (
	SELECT DISTINCT trim(`label`) AS `name`
	FROM `busy_blocks`
	WHERE `kind` = 'class' AND trim(`label`) <> ''
) AS n
WHERE NOT EXISTS (SELECT 1 FROM `courses` c WHERE c.`name` = n.`name`)
	AND NOT EXISTS (SELECT 1 FROM `courses` c, json_each(c.`aliases`) a WHERE a.`value` = n.`name`);
