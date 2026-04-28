CREATE TABLE `broadcast_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageText` text NOT NULL,
	`status` enum('pending','processing','completed','cancelled') NOT NULL DEFAULT 'pending',
	`totalRecipients` int NOT NULL DEFAULT 0,
	`sentCount` int NOT NULL DEFAULT 0,
	`blockedCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`createdBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `broadcast_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `broadcast_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`broadcastJobId` int NOT NULL,
	`telegramUserId` varchar(64) NOT NULL,
	`chatId` varchar(64) NOT NULL,
	`firstName` varchar(128),
	`status` enum('pending','sent','blocked','failed') NOT NULL DEFAULT 'pending',
	`errorDescription` varchar(512),
	`attemptCount` int NOT NULL DEFAULT 0,
	`sentAt` timestamp,
	`failedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `broadcast_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `broadcast_deliveries_job_user_unique` UNIQUE(`broadcastJobId`, `telegramUserId`)
);
--> statement-breakpoint
CREATE INDEX `broadcast_jobs_status_createdAt_idx` ON `broadcast_jobs` (`status`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `broadcast_deliveries_job_status_idx` ON `broadcast_deliveries` (`broadcastJobId`, `status`);
