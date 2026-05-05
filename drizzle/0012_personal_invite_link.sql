ALTER TABLE `bot_starts`
  ADD COLUMN `personalInviteLink` varchar(256) NULL,
  ADD COLUMN `personalInviteLinkExpiresAt` timestamp NULL;
