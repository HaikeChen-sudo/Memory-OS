CREATE TABLE `connections` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL DEFAULT 'default',
	`source_id` varchar(36) NOT NULL,
	`target_id` varchar(36) NOT NULL,
	`connection_type` varchar(50) NOT NULL,
	`weight` float NOT NULL DEFAULT 0.5,
	`label` varchar(255),
	`color` varchar(20) NOT NULL DEFAULT '#3b82f6',
	`animation_state` varchar(50) NOT NULL DEFAULT 'idle',
	`spatial_path` json,
	`metadata` json NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_contents` (
	`file_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL DEFAULT 'default',
	`extracted_text` longtext NOT NULL,
	`chunks` json NOT NULL,
	`extracted_at` datetime NOT NULL,
	CONSTRAINT `file_contents_file_id` PRIMARY KEY(`file_id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL DEFAULT 'default',
	`memory_id` varchar(36) NOT NULL,
	`folder_id` varchar(36) NOT NULL,
	`type` varchar(20) NOT NULL,
	`original_name` varchar(500) NOT NULL,
	`parse_status` varchar(20) NOT NULL DEFAULT 'pending',
	`created_at` datetime NOT NULL,
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL DEFAULT 'default',
	`name` varchar(255) NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#3b82f6',
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL DEFAULT 'default',
	`folder_id` varchar(36) NOT NULL,
	`type` varchar(50) NOT NULL,
	`title` varchar(500) NOT NULL,
	`content` longtext NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	`source_id` varchar(36),
	`source_url` longtext,
	`summary` longtext,
	`preview` longtext,
	`time_layer` varchar(50) NOT NULL DEFAULT 'today',
	`embedding` json,
	`position` json,
	`color` varchar(20) NOT NULL DEFAULT '#3b82f6',
	`animation_state` varchar(50) NOT NULL DEFAULT 'idle',
	`metadata` json NOT NULL,
	`keywords` json,
	CONSTRAINT `memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL DEFAULT 'default',
	`session_id` varchar(36) NOT NULL,
	`role` varchar(20) NOT NULL,
	`content` longtext NOT NULL,
	`citations` json NOT NULL,
	`animation_state` varchar(50) NOT NULL DEFAULT 'idle',
	`created_at` datetime NOT NULL,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL DEFAULT 'default',
	`folder_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL DEFAULT '新对话',
	`color` varchar(20) NOT NULL DEFAULT '#3b82f6',
	`animation_state` varchar(50) NOT NULL DEFAULT 'idle',
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` varchar(36) NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` json,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
