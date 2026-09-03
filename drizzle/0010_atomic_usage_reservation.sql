CREATE OR REPLACE FUNCTION partnerbird_reserve_usage(
  p_profile_id uuid,
  p_conversation_id uuid,
  p_idempotency_key varchar,
  p_monthly_start timestamptz,
  p_monthly_end timestamptz,
  p_daily_start timestamptz,
  p_daily_end timestamptz,
  p_includes_website boolean,
  p_monthly_ai_limit integer,
  p_daily_ai_limit integer,
  p_reply_limit integer,
  p_monthly_website_limit integer,
  p_conversation_website_limit integer,
  p_at timestamptz
)
RETURNS TABLE (
  "limitCode" text,
  "reservationId" uuid,
  "startsConversation" boolean,
  "monthlyAiConversations" integer,
  "dailyAiConversations" integer,
  "conversationAiReplies" integer,
  "monthlyWebsiteAnalyses" integer,
  "conversationWebsiteAnalyses" integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing usage_reservations%ROWTYPE;
  v_monthly_ai integer;
  v_daily_ai integer;
  v_conversation_replies integer;
  v_monthly_website integer;
  v_conversation_website integer;
  v_starts_conversation boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  DELETE FROM usage_reservations
  WHERE profile_id=p_profile_id AND scope='public'
    AND idempotency_key=p_idempotency_key AND status='released';

  SELECT * INTO v_existing
  FROM usage_reservations
  WHERE profile_id=p_profile_id AND scope='public'
    AND idempotency_key=p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    SELECT ai_conversations, website_analyses
      INTO v_monthly_ai, v_monthly_website
    FROM usage_periods
    WHERE profile_id=p_profile_id AND scope='public' AND period_type='monthly'
      AND period_start=p_monthly_start;
    SELECT ai_conversations INTO v_daily_ai
    FROM usage_periods
    WHERE profile_id=p_profile_id AND scope='public' AND period_type='daily'
      AND period_start=p_daily_start;
    SELECT ai_reply_count, website_analysis_count
      INTO v_conversation_replies, v_conversation_website
    FROM conversation_usage WHERE conversation_id=p_conversation_id;

    "limitCode" := NULL;
    "reservationId" := v_existing.id;
    "startsConversation" := v_existing.counted_conversation;
    "monthlyAiConversations" := COALESCE(v_monthly_ai, 0);
    "dailyAiConversations" := COALESCE(v_daily_ai, 0);
    "conversationAiReplies" := COALESCE(v_conversation_replies, 0);
    "monthlyWebsiteAnalyses" := COALESCE(v_monthly_website, 0);
    "conversationWebsiteAnalyses" := COALESCE(v_conversation_website, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO usage_periods (
    profile_id, scope, period_type, period_start, period_end,
    ai_conversations, ai_replies, website_analyses, created_at, updated_at
  ) VALUES (
    p_profile_id, 'public', 'monthly', p_monthly_start, p_monthly_end,
    0, 0, 0, p_at, p_at
  ) ON CONFLICT (profile_id, scope, period_type, period_start)
    DO UPDATE SET period_end=EXCLUDED.period_end;

  INSERT INTO usage_periods (
    profile_id, scope, period_type, period_start, period_end,
    ai_conversations, ai_replies, website_analyses, created_at, updated_at
  ) VALUES (
    p_profile_id, 'public', 'daily', p_daily_start, p_daily_end,
    0, 0, 0, p_at, p_at
  ) ON CONFLICT (profile_id, scope, period_type, period_start)
    DO UPDATE SET period_end=EXCLUDED.period_end;

  INSERT INTO conversation_usage (
    conversation_id, conversation_counted, ai_reply_count,
    website_analysis_count, created_at, updated_at
  ) VALUES (p_conversation_id, false, 0, 0, p_at, p_at)
  ON CONFLICT (conversation_id) DO NOTHING;

  SELECT ai_conversations, website_analyses
    INTO v_monthly_ai, v_monthly_website
  FROM usage_periods
  WHERE profile_id=p_profile_id AND scope='public' AND period_type='monthly'
    AND period_start=p_monthly_start;
  SELECT ai_conversations INTO v_daily_ai
  FROM usage_periods
  WHERE profile_id=p_profile_id AND scope='public' AND period_type='daily'
    AND period_start=p_daily_start;
  SELECT ai_reply_count, website_analysis_count, NOT conversation_counted
    INTO v_conversation_replies, v_conversation_website, v_starts_conversation
  FROM conversation_usage WHERE conversation_id=p_conversation_id;

  "limitCode" := CASE
    WHEN v_starts_conversation AND v_monthly_ai >= p_monthly_ai_limit
      THEN 'monthly_ai_conversations'
    WHEN v_starts_conversation AND v_daily_ai >= p_daily_ai_limit
      THEN 'daily_ai_conversations'
    WHEN v_conversation_replies >= p_reply_limit
      THEN 'conversation_ai_replies'
    WHEN p_includes_website AND v_monthly_website >= p_monthly_website_limit
      THEN 'monthly_website_analyses'
    WHEN p_includes_website AND v_conversation_website >= p_conversation_website_limit
      THEN 'conversation_website_analyses'
    ELSE NULL
  END;

  "startsConversation" := v_starts_conversation;
  IF "limitCode" IS NOT NULL THEN
    "reservationId" := NULL;
    "monthlyAiConversations" := v_monthly_ai;
    "dailyAiConversations" := v_daily_ai;
    "conversationAiReplies" := v_conversation_replies;
    "monthlyWebsiteAnalyses" := v_monthly_website;
    "conversationWebsiteAnalyses" := v_conversation_website;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO usage_reservations (
    profile_id, conversation_id, scope, idempotency_key,
    monthly_period_start, daily_period_start, counted_conversation,
    counted_reply, counted_website_analysis, status, created_at, updated_at
  ) VALUES (
    p_profile_id, p_conversation_id, 'public', p_idempotency_key,
    p_monthly_start, p_daily_start, v_starts_conversation,
    true, p_includes_website, 'reserved', p_at, p_at
  ) RETURNING id INTO "reservationId";

  UPDATE usage_periods
  SET ai_conversations=ai_conversations + CASE WHEN v_starts_conversation THEN 1 ELSE 0 END,
      ai_replies=ai_replies + 1,
      website_analyses=website_analyses + CASE WHEN p_includes_website THEN 1 ELSE 0 END,
      updated_at=p_at
  WHERE profile_id=p_profile_id AND scope='public' AND period_type='monthly'
    AND period_start=p_monthly_start;

  UPDATE usage_periods
  SET ai_conversations=ai_conversations + CASE WHEN v_starts_conversation THEN 1 ELSE 0 END,
      updated_at=p_at
  WHERE profile_id=p_profile_id AND scope='public' AND period_type='daily'
    AND period_start=p_daily_start;

  UPDATE conversation_usage
  SET conversation_counted=conversation_counted OR v_starts_conversation,
      ai_reply_count=ai_reply_count + 1,
      website_analysis_count=website_analysis_count + CASE WHEN p_includes_website THEN 1 ELSE 0 END,
      updated_at=p_at
  WHERE conversation_id=p_conversation_id;

  "monthlyAiConversations" := v_monthly_ai + CASE WHEN v_starts_conversation THEN 1 ELSE 0 END;
  "dailyAiConversations" := v_daily_ai + CASE WHEN v_starts_conversation THEN 1 ELSE 0 END;
  "conversationAiReplies" := v_conversation_replies + 1;
  "monthlyWebsiteAnalyses" := v_monthly_website + CASE WHEN p_includes_website THEN 1 ELSE 0 END;
  "conversationWebsiteAnalyses" := v_conversation_website + CASE WHEN p_includes_website THEN 1 ELSE 0 END;
  RETURN NEXT;
END;
$$;
