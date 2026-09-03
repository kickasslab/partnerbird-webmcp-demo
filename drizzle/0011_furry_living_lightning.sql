CREATE TABLE "agent_model_configurations" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"configuration" jsonb DEFAULT '{"schemaVersion":1,"primaryModels":{"free":{"modelId":"minimax/minimax-m3:free","name":"MiniMax M3","description":""},"pro":{"modelId":"minimax/minimax-m3:free","name":"MiniMax M3","description":""},"business":{"modelId":"minimax/minimax-m3:free","name":"MiniMax M3","description":""}},"fallbackModels":[]}'::jsonb NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
