CREATE TABLE `telegram_join_request_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telegramUserId` varchar(64) NOT NULL,
	`telegramUsername` varchar(128),
	`telegramFirstName` varchar(128),
	`channelId` varchar(64) NOT NULL,
	`decision` enum('approved','declined') NOT NULL,
	`reason` varchar(128),
	`hadBotStart` int NOT NULL DEFAULT 0,
	`inviteLinkName` varchar(128),
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telegram_join_request_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `telegram_join_request_audit_decidedAt_idx` ON `telegram_join_request_audit` (`decidedAt`);
--> statement-breakpoint
CREATE INDEX `telegram_join_request_audit_decision_decidedAt_idx` ON `telegram_join_request_audit` (`decision`, `decidedAt`);
--> statement-breakpoint
CREATE INDEX `telegram_join_request_audit_user_idx` ON `telegram_join_request_audit` (`telegramUserId`);
--> statement-breakpoint
CREATE INDEX `bot_starts_joinedAt_idx` ON `bot_starts` (`joinedAt`);
--> statement-breakpoint
CREATE INDEX `telegram_joins_attributionStatus_idx` ON `telegram_joins` (`attributionStatus`);
