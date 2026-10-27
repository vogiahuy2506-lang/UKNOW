-- =====================================================================
-- schema.sql — CẤU TRÚC CSDL PRODUCTION (chỉ cấu trúc, không dữ liệu)
-- =====================================================================
-- Sinh ngày 27/10/2026 từ container uknow-postgres trên VPS bằng:
--
--   docker exec uknow-postgres pg_dump -U postgres -d uknow-campaign \
--     --schema-only --no-owner --no-privileges --no-comments \
--     -T 'public._bak_*' -T public.users_plan_backup_minh -T 'public.zalo_messages_bak_*'
--
-- (bỏ các bảng sao lưu tay; bỏ 2 dòng \restrict/\unrestrict của psql; bỏ dòng users.last_active_at vì migration 311 cùng
-- commit xoá cột đó). Tệp này chỉ để TRA CỨU hình dạng CSDL
-- thật; nguồn sự thật để đổi schema vẫn là backend/migrations/ (mirror sang
-- backend/tests/integration/sql/bootstrap.sql + fixtures/productionSchemaInventory.json). Lệch với production sau
-- ngày trên thì sinh lại bằng lệnh trên, đừng sửa tay.
-- Bản trước (820 dòng, viết tay, lệch production từ 25/08/2026 — ví dụ bảng courses sai 5 chỗ) đã bị thay toàn bộ.
-- =====================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Debian 16.13-1.pgdg12+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: amcheck; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS amcheck WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: campaign_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_status AS ENUM (
    'draft',
    'active',
    'paused',
    'completed',
    'archived',
    'running'
);


--
-- Name: campaign_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_type AS ENUM (
    'email',
    'zalo',
    'mixed',
    'zalo_group',
    'telegram',
    'telegram_group',
    'whatsapp'
);


--
-- Name: email_setting_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.email_setting_status AS ENUM (
    'active',
    'inactive',
    'blacklisted'
);


--
-- Name: execution_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.execution_status AS ENUM (
    'pending',
    'running',
    'waiting',
    'completed',
    'failed',
    'cancelled',
    'on_hold'
);


--
-- Name: gender_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_type AS ENUM (
    'male',
    'female',
    'other'
);


--
-- Name: message_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_status AS ENUM (
    'pending',
    'queued',
    'sent',
    'delivered',
    'opened',
    'clicked',
    'bounced',
    'failed',
    'spam',
    'unsubscribed'
);


--
-- Name: notification_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_status AS ENUM (
    'draft',
    'scheduled',
    'sending',
    'sent',
    'failed',
    'cancelled'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'maintenance',
    'announcement',
    'promotion',
    'warning',
    'reminder',
    'security'
);


--
-- Name: recurrence_pattern; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recurrence_pattern AS ENUM (
    'daily',
    'weekly',
    'monthly'
);


--
-- Name: schedule_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.schedule_type AS ENUM (
    'now',
    'scheduled',
    'recurring'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'inactive',
    'pending_activation',
    'deleted'
);


--
-- Name: set_campaign_origin_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_campaign_origin_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If marketplace_purchase_id is set, mark as marketplace_purchased
    IF NEW.marketplace_purchase_id IS NOT NULL THEN
        NEW.origin = 'marketplace_purchased';
    ELSE
        NEW.origin = 'self_created';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_campaign_share_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_campaign_share_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE campaigns SET share_count = COALESCE(share_count, 0) + 1 WHERE id = NEW.id_campaign;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE campaigns SET share_count = GREATEST(COALESCE(share_count, 0) - 1, 0) WHERE id = OLD.id_campaign;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_campaign_shares_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_campaign_shares_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_facebook_token_tracking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_facebook_token_tracking() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.credentials ? 'page_access_token' AND OLD.credentials->>'page_access_token' IS DISTINCT FROM NEW.credentials->>'page_access_token' THEN
    -- Token was refreshed, update tracking
    INSERT INTO facebook_token_tracking (channel_connection_id, token_created_at, token_expires_at, last_refreshed_at)
    VALUES (NEW.id, NOW(), NOW() + INTERVAL '55 days', NOW())
    ON CONFLICT (channel_connection_id)
    DO UPDATE SET
      token_created_at = NOW(),
      token_expires_at = NOW() + INTERVAL '55 days',
      last_refreshed_at = NOW(),
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_landing_page_share_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_landing_page_share_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE landing_pages SET share_count = COALESCE(share_count, 0) + 1 WHERE id = NEW.id_landing_page;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE landing_pages SET share_count = GREATEST(COALESCE(share_count, 0) - 1, 0) WHERE id = OLD.id_landing_page;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_landing_page_shares_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_landing_page_shares_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_marketplace_listing_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_marketplace_listing_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_marketplace_reviews_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_marketplace_reviews_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_marketplace_seller_stats_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_marketplace_seller_stats_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_menu_layouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_menu_layouts (
    scope character varying(32) NOT NULL,
    categories jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    links jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT admin_menu_layouts_categories_array_check CHECK ((jsonb_typeof(categories) = 'array'::text)),
    CONSTRAINT admin_menu_layouts_links_array_check CHECK ((jsonb_typeof(links) = 'array'::text)),
    CONSTRAINT admin_menu_layouts_scope_check CHECK (((scope)::text = ANY ((ARRAY['super_admin'::character varying, 'app_user'::character varying])::text[])))
);


--
-- Name: affiliate_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_ledger (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    entry_type character varying(20) NOT NULL,
    amount numeric(12,2) NOT NULL,
    ref_type character varying(20),
    ref_id bigint,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT affiliate_ledger_entry_type_check CHECK (((entry_type)::text = ANY ((ARRAY['commission'::character varying, 'withdrawal'::character varying, 'adjustment'::character varying])::text[])))
);


--
-- Name: affiliate_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.affiliate_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: affiliate_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.affiliate_ledger_id_seq OWNED BY public.affiliate_ledger.id;


--
-- Name: affiliate_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_periods (
    id bigint NOT NULL,
    referrer_user_id bigint NOT NULL,
    month_key character(7) NOT NULL,
    gross_revenue numeric(12,2) NOT NULL,
    tier_level smallint NOT NULL,
    rate_percent smallint NOT NULL,
    commission_amount numeric(12,2) NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: affiliate_periods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.affiliate_periods_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: affiliate_periods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.affiliate_periods_id_seq OWNED BY public.affiliate_periods.id;


--
-- Name: affiliate_revenue_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_revenue_events (
    id bigint NOT NULL,
    referrer_user_id bigint NOT NULL,
    buyer_user_id bigint NOT NULL,
    order_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    month_key character(7) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reversed_at timestamp with time zone
);


--
-- Name: affiliate_revenue_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.affiliate_revenue_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: affiliate_revenue_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.affiliate_revenue_events_id_seq OWNED BY public.affiliate_revenue_events.id;


--
-- Name: affiliate_withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_withdrawals (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    partner_type character varying(10) DEFAULT 'personal'::character varying NOT NULL,
    amount_gross numeric(12,2) NOT NULL,
    tax_amount numeric(12,2) NOT NULL,
    amount_net numeric(12,2) NOT NULL,
    full_name character varying(255) NOT NULL,
    tax_code character varying(20),
    bank_name character varying(255) NOT NULL,
    bank_account_number character varying(50) NOT NULL,
    bank_account_name character varying(255) NOT NULL,
    id_card_number_enc text,
    id_card_issued_date date,
    id_card_issued_place character varying(255),
    company_name character varying(255),
    company_address text,
    invoice_reference character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by bigint,
    note text,
    CONSTRAINT affiliate_withdrawals_partner_type_check CHECK (((partner_type)::text = ANY ((ARRAY['personal'::character varying, 'company'::character varying])::text[]))),
    CONSTRAINT affiliate_withdrawals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: affiliate_withdrawals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.affiliate_withdrawals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: affiliate_withdrawals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.affiliate_withdrawals_id_seq OWNED BY public.affiliate_withdrawals.id;


--
-- Name: ai_activity_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_activity_summaries (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    day_key character varying(10) NOT NULL,
    last_message_at timestamp with time zone,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_activity_summaries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_activity_summaries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_activity_summaries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_activity_summaries_id_seq OWNED BY public.ai_activity_summaries.id;


--
-- Name: ai_call_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_call_events (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_user_id bigint,
    actor_user_id bigint,
    layer character varying(10) DEFAULT 'gemini'::character varying NOT NULL,
    feature character varying(60) NOT NULL,
    model character varying(80),
    outcome character varying(20) NOT NULL,
    http_status integer,
    error_code character varying(60),
    duration_ms integer,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: ai_call_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_call_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_call_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_call_events_id_seq OWNED BY public.ai_call_events.id;


--
-- Name: ai_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chat_messages (
    id bigint NOT NULL,
    session_id bigint NOT NULL,
    role character varying(10) NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    type character varying(50),
    data jsonb,
    missing_fields jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_chat_messages_role_check CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'assistant'::character varying])::text[])))
);


--
-- Name: ai_chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_chat_messages_id_seq OWNED BY public.ai_chat_messages.id;


--
-- Name: ai_chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chat_sessions (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    title character varying(255) DEFAULT 'Cuộc trò chuyện mới'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    wizard_state jsonb
);


--
-- Name: ai_chat_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_chat_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_chat_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_chat_sessions_id_seq OWNED BY public.ai_chat_sessions.id;


--
-- Name: ai_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_models (
    model_id text NOT NULL,
    display_name text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    supports_generate_content boolean DEFAULT true NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    input_token_limit integer,
    output_token_limit integer,
    description text,
    version text,
    thinking boolean,
    is_fallback boolean DEFAULT false NOT NULL,
    CONSTRAINT ai_models_source_check CHECK ((source = ANY (ARRAY['google'::text, 'manual'::text])))
);


--
-- Name: ai_unavailable_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_unavailable_notices (
    id_user bigint NOT NULL,
    kind character varying(20) NOT NULL,
    notice_key character varying(200) DEFAULT ''::character varying NOT NULL,
    last_sent_at timestamp with time zone NOT NULL,
    send_count integer DEFAULT 1 NOT NULL,
    CONSTRAINT ai_unavailable_notices_kind_check CHECK (((kind)::text = ANY ((ARRAY['owner_email'::character varying, 'visitor_apology'::character varying])::text[])))
);


--
-- Name: alert_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_events (
    id bigint NOT NULL,
    rule_id integer NOT NULL,
    fired_at timestamp with time zone DEFAULT now() NOT NULL,
    measured_value numeric,
    message text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by bigint,
    notified boolean DEFAULT false NOT NULL
);


--
-- Name: alert_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_events_id_seq OWNED BY public.alert_events.id;


--
-- Name: alert_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_rules (
    id integer NOT NULL,
    code character varying(64) NOT NULL,
    name text NOT NULL,
    description text,
    threshold_value numeric,
    window_minutes integer,
    channel character varying(32) DEFAULT 'email'::character varying NOT NULL,
    severity character varying(16) DEFAULT 'warning'::character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    cooldown_minutes integer DEFAULT 60 NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alert_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_rules_id_seq OWNED BY public.alert_rules.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    id_user bigint,
    action character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id bigint,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    owner_id bigint,
    category character varying(20) DEFAULT 'workspace'::character varying NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: business_profile_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_profile_chunks (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    chunk_text text NOT NULL,
    embedding public.vector(768),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: business_profile_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_profile_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_profile_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_profile_chunks_id_seq OWNED BY public.business_profile_chunks.id;


--
-- Name: business_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_profiles (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    company_name character varying(255),
    industry character varying(100),
    products text,
    target_audience text,
    tone character varying(50) DEFAULT 'professional'::character varying,
    brand_color character varying(7),
    extra_context text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    logo_url text
);


--
-- Name: business_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_profiles_id_seq OWNED BY public.business_profiles.id;


--
-- Name: campaign_channel_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_channel_messages (
    id bigint NOT NULL,
    id_campaign bigint,
    id_run bigint,
    id_node bigint,
    channel character varying(30) NOT NULL,
    account_key text,
    recipient_key text NOT NULL,
    recipient_display text,
    step_index integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'queued'::character varying NOT NULL,
    error_category character varying(40),
    error_message text,
    provider_message_id text,
    is_preview boolean DEFAULT false NOT NULL,
    quota_reservation_id bigint,
    workspace_owner_id bigint,
    actor_user_id bigint,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_channel_messages_status_check CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'sent'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: campaign_channel_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_channel_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_channel_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_channel_messages_id_seq OWNED BY public.campaign_channel_messages.id;


--
-- Name: campaign_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_connections (
    id bigint NOT NULL,
    id_campaign bigint NOT NULL,
    source_node_id bigint NOT NULL,
    target_node_id bigint NOT NULL,
    connection_type character varying(50) DEFAULT 'default'::character varying,
    connection_label character varying(100),
    condition_config jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_no_self_connection CHECK ((source_node_id <> target_node_id))
);


--
-- Name: campaign_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_connections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_connections_id_seq OWNED BY public.campaign_connections.id;


--
-- Name: campaign_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_customers (
    id_campaign bigint NOT NULL,
    id_customer bigint NOT NULL,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    source_node_id bigint,
    email_received_count integer DEFAULT 0,
    email_opened_count integer DEFAULT 0,
    email_clicked_count integer DEFAULT 0,
    has_opened boolean DEFAULT false,
    has_clicked boolean DEFAULT false,
    first_email_sent_at timestamp without time zone,
    last_email_sent_at timestamp without time zone,
    first_email_opened_at timestamp without time zone,
    last_email_opened_at timestamp without time zone,
    first_email_clicked_at timestamp without time zone,
    last_email_clicked_at timestamp without time zone,
    last_activity_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    uknow_status character varying(20) DEFAULT NULL::character varying
);


--
-- Name: campaign_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_executions (
    id integer NOT NULL,
    id_campaign integer NOT NULL,
    id_run integer,
    id_customer integer,
    status character varying(50) DEFAULT 'success'::character varying NOT NULL,
    action_type character varying(50),
    path_taken jsonb,
    execution_data jsonb,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    node_id bigint,
    node_name character varying(255),
    node_type character varying(50),
    node_subtype character varying(50),
    node_order integer,
    progress_current integer,
    progress_total integer,
    node_result_json jsonb
);


--
-- Name: campaign_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_executions_id_seq OWNED BY public.campaign_executions.id;


--
-- Name: campaign_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_nodes (
    id bigint NOT NULL,
    id_campaign bigint NOT NULL,
    node_type character varying(50) DEFAULT 'action'::character varying NOT NULL,
    node_subtype character varying(50) NOT NULL,
    node_name character varying(255),
    node_description text,
    position_x integer DEFAULT 0,
    position_y integer DEFAULT 0,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    parallel_group_id character varying(50),
    id_email_template bigint,
    id_zalo_template bigint,
    id_message_sequence bigint,
    id_email_setting bigint,
    id_zalo_setting bigint,
    id_zalo_group bigint,
    execution_order integer,
    is_active boolean DEFAULT true,
    total_entered integer DEFAULT 0,
    total_completed integer DEFAULT 0,
    total_failed integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: campaign_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_nodes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_nodes_id_seq OWNED BY public.campaign_nodes.id;


--
-- Name: campaign_participations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_participations (
    id_customer bigint NOT NULL,
    id_campaign bigint NOT NULL,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    id_run integer
);


--
-- Name: campaign_run_recipient_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_run_recipient_steps (
    id bigint NOT NULL,
    id_run bigint NOT NULL,
    id_campaign bigint NOT NULL,
    id_node bigint NOT NULL,
    channel character varying(50) NOT NULL,
    recipient_key character varying(320) NOT NULL,
    last_completed_step integer DEFAULT 0 NOT NULL,
    is_fully_completed boolean DEFAULT false NOT NULL,
    first_seen_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_sent_at timestamp without time zone,
    meta jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    first_step_sent_at timestamp without time zone,
    next_due_at timestamp without time zone
);


--
-- Name: campaign_run_recipient_steps_backup_182; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_run_recipient_steps_backup_182 (
    id bigint NOT NULL,
    migration_batch_id uuid NOT NULL,
    source_id bigint NOT NULL,
    id_run bigint,
    source_row jsonb NOT NULL,
    backed_up_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_run_recipient_steps_backup_182_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_run_recipient_steps_backup_182_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_run_recipient_steps_backup_182_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_run_recipient_steps_backup_182_id_seq OWNED BY public.campaign_run_recipient_steps_backup_182.id;


--
-- Name: campaign_run_recipient_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_run_recipient_steps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_run_recipient_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_run_recipient_steps_id_seq OWNED BY public.campaign_run_recipient_steps.id;


--
-- Name: campaign_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_runs (
    id integer NOT NULL,
    id_campaign integer NOT NULL,
    id_schedule integer,
    run_type character varying(50) NOT NULL,
    status character varying(50) NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    total_recipients integer DEFAULT 0,
    successful_sends integer DEFAULT 0,
    failed_sends integer DEFAULT 0,
    error_message text,
    run_metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    run_name character varying(255),
    skipped_sends integer DEFAULT 0 NOT NULL,
    triggered_by bigint,
    workspace_owner_id bigint
);


--
-- Name: campaign_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_runs_id_seq OWNED BY public.campaign_runs.id;


--
-- Name: campaign_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_schedules (
    id integer NOT NULL,
    id_campaign integer NOT NULL,
    schedule_name character varying(255) NOT NULL,
    schedule_type character varying(50) NOT NULL,
    cron_expression character varying(255) NOT NULL,
    enabled boolean DEFAULT true,
    last_run_at timestamp without time zone,
    next_run_at timestamp without time zone,
    run_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    workspace_owner_id bigint,
    created_by bigint
);


--
-- Name: campaign_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_schedules_id_seq OWNED BY public.campaign_schedules.id;


--
-- Name: campaign_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_shares (
    id bigint NOT NULL,
    id_campaign bigint NOT NULL,
    id_owner bigint NOT NULL,
    id_recipient bigint,
    recipient_email character varying(255) NOT NULL,
    share_type character varying(20) DEFAULT 'view'::character varying NOT NULL,
    can_run boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    CONSTRAINT campaign_shares_share_type_check CHECK (((share_type)::text = ANY ((ARRAY['view'::character varying, 'edit'::character varying])::text[]))),
    CONSTRAINT campaign_shares_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'revoked'::character varying])::text[])))
);


--
-- Name: campaign_shares_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_shares_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_shares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_shares_id_seq OWNED BY public.campaign_shares.id;


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    campaign_name character varying(255) NOT NULL,
    description text,
    campaign_type public.campaign_type NOT NULL,
    status public.campaign_status DEFAULT 'draft'::public.campaign_status,
    id_data_source bigint,
    flow_json jsonb,
    landing_page_url character varying(500),
    landing_page_form_id character varying(100),
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    timezone character varying(50) DEFAULT 'Asia/Ho_Chi_Minh'::character varying,
    total_customers integer DEFAULT 0,
    total_sent integer DEFAULT 0,
    total_delivered integer DEFAULT 0,
    total_opened integer DEFAULT 0,
    total_clicked integer DEFAULT 0,
    total_converted integer DEFAULT 0,
    total_revenue numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    published_at timestamp without time zone,
    last_run_at timestamp without time zone,
    marketplace_purchase_id bigint,
    origin character varying(30) DEFAULT 'self_created'::character varying,
    share_count integer DEFAULT 0,
    workspace_owner_id bigint,
    created_by bigint,
    CONSTRAINT campaigns_origin_check CHECK (((origin)::text = ANY (ARRAY[('self_created'::character varying)::text, ('marketplace_purchased'::character varying)::text])))
);


--
-- Name: campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaigns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaigns_id_seq OWNED BY public.campaigns.id;


--
-- Name: channel_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_connections (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    channel character varying(20) NOT NULL,
    display_name character varying(255),
    is_active boolean DEFAULT true,
    credentials jsonb DEFAULT '{}'::jsonb,
    webhook_url text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    webhook_token character varying(64),
    external_channel_id character varying(128),
    fb_user_id text,
    fb_page_id text,
    fb_page_name text
);


--
-- Name: channel_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.channel_connections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: channel_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.channel_connections_id_seq OWNED BY public.channel_connections.id;


--
-- Name: channel_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_conversations (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    id_channel bigint NOT NULL,
    external_id character varying(255),
    visitor_name character varying(255),
    visitor_info jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    channel character varying(20) DEFAULT NULL::character varying NOT NULL,
    ai_paused boolean DEFAULT false NOT NULL,
    ai_paused_at timestamp with time zone
);


--
-- Name: channel_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.channel_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: channel_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.channel_conversations_id_seq OWNED BY public.channel_conversations.id;


--
-- Name: channel_disconnect_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_disconnect_alerts (
    channel character varying(20) NOT NULL,
    account_ref character varying(255) NOT NULL,
    id_user bigint NOT NULL,
    account_label character varying(255),
    disconnected_since timestamp with time zone,
    last_alerted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_disconnect_alerts_channel_check CHECK (((channel)::text = ANY ((ARRAY['zalo_personal'::character varying, 'telegram'::character varying, 'whatsapp'::character varying])::text[])))
);


--
-- Name: channel_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_messages (
    id bigint NOT NULL,
    id_conversation bigint NOT NULL,
    id_user bigint NOT NULL,
    id_channel bigint NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    message_type character varying(20) DEFAULT 'text'::character varying,
    external_id character varying(255),
    external_ts timestamp with time zone,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    raw_data jsonb,
    quota_reservation_id bigint
);


--
-- Name: channel_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.channel_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: channel_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.channel_messages_id_seq OWNED BY public.channel_messages.id;


--
-- Name: chat_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_attachments (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    source character varying(24) NOT NULL,
    storage_key text NOT NULL,
    display_name character varying(255),
    mime_type character varying(120),
    size_bytes bigint,
    conversation_ref character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    storage_object_id bigint,
    CONSTRAINT chat_attachments_source_check CHECK (((source)::text = ANY ((ARRAY['chatbot_web'::character varying, 'chatbot_studio'::character varying, 'ai_assistant'::character varying, 'inbox_outbound'::character varying])::text[])))
);


--
-- Name: chat_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_attachments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_attachments_id_seq OWNED BY public.chat_attachments.id;


--
-- Name: chatbot_channel_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_channel_connections (
    id integer NOT NULL,
    id_chatbot integer NOT NULL,
    channel_type character varying(32) NOT NULL,
    credentials jsonb DEFAULT '{}'::jsonb NOT NULL,
    webhook_token character varying(64) NOT NULL,
    webhook_url text,
    display_name character varying(255),
    external_channel_id character varying(128),
    is_active boolean DEFAULT true,
    connected_at timestamp with time zone DEFAULT now(),
    last_activity_at timestamp with time zone,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    phone_number character varying(32),
    waba_id character varying(64),
    phone_number_id character varying(64),
    business_id character varying(64),
    app_id character varying(64),
    CONSTRAINT chatbot_channel_connections_channel_type_check CHECK (((channel_type)::text = ANY ((ARRAY['zalo_oa'::character varying, 'facebook'::character varying, 'whatsapp'::character varying, 'whatsapp_baileys'::character varying, 'tiktok_business'::character varying])::text[])))
);


--
-- Name: chatbot_channel_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_channel_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_channel_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_channel_connections_id_seq OWNED BY public.chatbot_channel_connections.id;


--
-- Name: chatbot_contact_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_contact_alerts (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    contact_type character varying(10) NOT NULL,
    contact_value character varying(255) NOT NULL,
    first_seen_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    seen_count integer DEFAULT 1 NOT NULL,
    last_source character varying(20) NOT NULL,
    last_conversation_id bigint NOT NULL,
    last_message_id bigint NOT NULL,
    last_excerpt text,
    pending_notify boolean DEFAULT true NOT NULL,
    suppressed_reason character varying(30),
    last_notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    handled_at timestamp with time zone,
    handled_by bigint,
    CONSTRAINT chatbot_contact_alerts_contact_type_check CHECK (((contact_type)::text = ANY ((ARRAY['phone'::character varying, 'email'::character varying])::text[])))
);


--
-- Name: chatbot_contact_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_contact_alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_contact_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_contact_alerts_id_seq OWNED BY public.chatbot_contact_alerts.id;


--
-- Name: chatbot_contact_scan_cursors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_contact_scan_cursors (
    source character varying(20) NOT NULL,
    last_message_id bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chatbot_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_conversations (
    id integer NOT NULL,
    id_chatbot integer NOT NULL,
    id_channel integer,
    channel_type character varying(32) DEFAULT 'web'::character varying,
    external_id character varying(128),
    source character varying(32),
    visitor_name character varying(255),
    visitor_info jsonb DEFAULT '{}'::jsonb,
    status character varying(32) DEFAULT 'active'::character varying,
    unread_count integer DEFAULT 0,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_conversations_id_seq OWNED BY public.chatbot_conversations.id;


--
-- Name: chatbot_digest_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_digest_log (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    period_key character varying(16) NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    stats jsonb DEFAULT '{}'::jsonb NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chatbot_digest_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_digest_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_digest_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_digest_log_id_seq OWNED BY public.chatbot_digest_log.id;


--
-- Name: chatbot_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_messages (
    id integer NOT NULL,
    id_conversation integer NOT NULL,
    role character varying(32) NOT NULL,
    content text,
    message_type character varying(32) DEFAULT 'text'::character varying,
    external_id character varying(128),
    external_ts timestamp with time zone,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    ai_model character varying(64),
    ai_tokens_used integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_messages_id_seq OWNED BY public.chatbot_messages.id;


--
-- Name: chatbot_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_settings (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    id_sub_assistant bigint,
    channel character varying(20) NOT NULL,
    is_enabled boolean DEFAULT true,
    welcome_message text,
    ai_model character varying(50) DEFAULT 'gemini-2.5-flash'::character varying,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 2048,
    response_style character varying(20) DEFAULT 'friendly'::character varying,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    system_instruction text
);


--
-- Name: chatbot_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_settings_id_seq OWNED BY public.chatbot_settings.id;


--
-- Name: chatbot_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_shares (
    id bigint NOT NULL,
    id_chatbot bigint NOT NULL,
    id_owner bigint NOT NULL,
    id_recipient bigint,
    recipient_email character varying(255) NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chatbot_shares_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'revoked'::character varying])::text[])))
);


--
-- Name: chatbot_shares_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_shares_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_shares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_shares_id_seq OWNED BY public.chatbot_shares.id;


--
-- Name: chatbot_studio_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_studio_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    id_user bigint,
    id_chatbot bigint NOT NULL,
    session_id character varying(128),
    title character varying(255),
    status character varying(32) DEFAULT 'active'::character varying,
    message_count integer DEFAULT 0,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: chatbot_studio_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_studio_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    id_conversation uuid NOT NULL,
    role character varying(32) NOT NULL,
    content text,
    message_type character varying(32) DEFAULT 'text'::character varying,
    ai_model character varying(64),
    ai_tokens_used integer,
    ai_latency_ms integer,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chatbot_whatsapp_account_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_whatsapp_account_settings (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    id_channel_connection integer NOT NULL,
    id_chatbot bigint,
    is_enabled boolean DEFAULT false NOT NULL,
    id_sub_assistant bigint,
    welcome_message text,
    ai_model character varying(50) DEFAULT 'gemini-2.5-flash'::character varying,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 2048,
    response_style character varying(20) DEFAULT 'friendly'::character varying,
    system_instruction text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chatbot_whatsapp_account_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_whatsapp_account_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_whatsapp_account_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_whatsapp_account_settings_id_seq OWNED BY public.chatbot_whatsapp_account_settings.id;


--
-- Name: chatbot_whatsapp_baileys_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_whatsapp_baileys_settings (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    session_key character varying(128) NOT NULL,
    id_chatbot bigint,
    is_enabled boolean DEFAULT false NOT NULL,
    id_sub_assistant bigint,
    welcome_message text,
    ai_model character varying(50) DEFAULT 'gemini-2.5-flash'::character varying,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 2048,
    response_style character varying(20) DEFAULT 'friendly'::character varying,
    system_instruction text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chatbot_whatsapp_baileys_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_whatsapp_baileys_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_whatsapp_baileys_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_whatsapp_baileys_settings_id_seq OWNED BY public.chatbot_whatsapp_baileys_settings.id;


--
-- Name: chatbot_zalo_account_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_zalo_account_settings (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    id_zalo_setting bigint NOT NULL,
    is_enabled boolean DEFAULT false,
    id_sub_assistant bigint,
    welcome_message text,
    ai_model character varying(50) DEFAULT 'gemini-2.5-flash'::character varying,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 2048,
    response_style character varying(20) DEFAULT 'friendly'::character varying,
    system_instruction text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    id_chatbot bigint
);


--
-- Name: chatbot_zalo_account_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_zalo_account_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_zalo_account_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_zalo_account_settings_id_seq OWNED BY public.chatbot_zalo_account_settings.id;


--
-- Name: contact_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_submissions (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(50),
    company character varying(255),
    company_size character varying(50),
    message text,
    status character varying(50) DEFAULT 'new'::character varying,
    notes text,
    ip_address character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_submissions_status_check CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'contacted'::character varying, 'qualified'::character varying, 'closed'::character varying])::text[])))
);


--
-- Name: contact_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contact_submissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contact_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contact_submissions_id_seq OWNED BY public.contact_submissions.id;


--
-- Name: course_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_relations (
    id bigint NOT NULL,
    id_course bigint NOT NULL,
    id_related_course bigint NOT NULL,
    relation_type character varying(50) DEFAULT 'related'::character varying,
    priority integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_no_self_relation CHECK ((id_course <> id_related_course))
);


--
-- Name: course_relations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_relations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_relations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_relations_id_seq OWNED BY public.course_relations.id;


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    course_name character varying(255) NOT NULL,
    course_code character varying(100),
    description text,
    price numeric(15,2) DEFAULT 0,
    original_price numeric(15,2) DEFAULT 0,
    category character varying(100),
    thumbnail_url text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'publish'::character varying NOT NULL,
    workspace_owner_id bigint,
    created_by bigint
);


--
-- Name: courses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.courses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.courses_id_seq OWNED BY public.courses.id;


--
-- Name: cron_job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_job_runs (
    id bigint NOT NULL,
    job_code character varying(64) NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer,
    status character varying(32) NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text
);


--
-- Name: cron_job_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cron_job_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cron_job_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cron_job_runs_id_seq OWNED BY public.cron_job_runs.id;


--
-- Name: custom_chatbot_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_chatbot_chunks (
    id integer NOT NULL,
    chatbot_id bigint NOT NULL,
    user_id bigint NOT NULL,
    chunk_text text NOT NULL,
    embedding jsonb,
    chunk_index integer NOT NULL,
    source character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    document_id bigint
);


--
-- Name: custom_chatbot_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_chatbot_chunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_chatbot_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_chatbot_chunks_id_seq OWNED BY public.custom_chatbot_chunks.id;


--
-- Name: custom_chatbot_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_chatbot_documents (
    id bigint NOT NULL,
    chatbot_id bigint NOT NULL,
    owner_user_id bigint NOT NULL,
    source_type character varying(20) NOT NULL,
    source_key character varying(500) NOT NULL,
    title character varying(500),
    content_text text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    error_message text,
    extracted_chars bigint DEFAULT 0 NOT NULL,
    chunk_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_chatbot_documents_chunk_count_check CHECK ((chunk_count >= 0)),
    CONSTRAINT custom_chatbot_documents_extracted_chars_check CHECK ((extracted_chars >= 0)),
    CONSTRAINT custom_chatbot_documents_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['file'::character varying, 'text'::character varying, 'url'::character varying])::text[]))),
    CONSTRAINT custom_chatbot_documents_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'ready'::character varying, 'error'::character varying])::text[])))
);


--
-- Name: custom_chatbot_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_chatbot_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_chatbot_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_chatbot_documents_id_seq OWNED BY public.custom_chatbot_documents.id;


--
-- Name: custom_chatbots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_chatbots (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    name character varying(255) DEFAULT 'New Chatbot'::character varying NOT NULL,
    description text DEFAULT ''::text,
    system_instruction text DEFAULT ''::text,
    greeting_msg text DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?'::text,
    avatar_url text,
    is_active boolean DEFAULT true,
    theme_color character varying(7) DEFAULT '#6366F1'::character varying,
    "position" character varying(20) DEFAULT 'bottom-right'::character varying,
    welcome_message text DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?'::text,
    primary_color character varying(7) DEFAULT '#6366F1'::character varying,
    background_color character varying(7) DEFAULT '#FFFFFF'::character varying,
    text_color character varying(7) DEFAULT '#1F2937'::character varying,
    accent_color character varying(7) DEFAULT '#60A5FA'::character varying,
    logo_url text,
    show_avatar boolean DEFAULT true,
    border_radius integer DEFAULT 16,
    chat_height character varying(10) DEFAULT '600px'::character varying,
    suggested_questions text[] DEFAULT '{}'::text[],
    widget_key character varying(100) DEFAULT NULL::character varying,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 2048,
    ai_model character varying(50) DEFAULT 'gemini-2.5-flash'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    allow_attachments boolean DEFAULT false NOT NULL,
    reply_limit_config jsonb DEFAULT '{"version": 1, "windows": {}}'::jsonb NOT NULL,
    origin character varying(50) DEFAULT 'self_created'::character varying NOT NULL,
    response_style character varying(20) DEFAULT 'friendly'::character varying,
    launcher_label character varying(40) DEFAULT NULL::character varying,
    active_hours jsonb,
    replies_enabled boolean DEFAULT true NOT NULL,
    widget_auto_open boolean DEFAULT false NOT NULL,
    embed_show_header boolean DEFAULT true NOT NULL,
    embed_size character varying(10) DEFAULT 'medium'::character varying NOT NULL,
    allow_public_numeric_id boolean DEFAULT false NOT NULL,
    CONSTRAINT check_custom_chatbots_active_hours_object CHECK (((active_hours IS NULL) OR (jsonb_typeof(active_hours) = 'object'::text))),
    CONSTRAINT custom_chatbots_embed_size_check CHECK (((embed_size)::text = ANY ((ARRAY['small'::character varying, 'medium'::character varying, 'large'::character varying])::text[]))),
    CONSTRAINT custom_chatbots_reply_limit_config_object CHECK ((jsonb_typeof(reply_limit_config) = 'object'::text))
);


--
-- Name: custom_chatbots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_chatbots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_chatbots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_chatbots_id_seq OWNED BY public.custom_chatbots.id;


--
-- Name: custom_domain_ssl; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_domain_ssl (
    id integer NOT NULL,
    domain_id bigint NOT NULL,
    cert_arn character varying(255),
    cert_type character varying(20) DEFAULT 'letsencrypt'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    issued_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: custom_domain_ssl_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_domain_ssl_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_domain_ssl_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_domain_ssl_id_seq OWNED BY public.custom_domain_ssl.id;


--
-- Name: custom_domain_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_domain_verifications (
    id integer NOT NULL,
    domain_id bigint NOT NULL,
    verification_type character varying(20) NOT NULL,
    verification_token character varying(255),
    status character varying(20) NOT NULL,
    checked_at timestamp with time zone DEFAULT now(),
    response_data jsonb
);


--
-- Name: custom_domain_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_domain_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_domain_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_domain_verifications_id_seq OWNED BY public.custom_domain_verifications.id;


--
-- Name: custom_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_domains (
    id integer NOT NULL,
    user_id bigint NOT NULL,
    landing_page_id bigint,
    domain character varying(255) NOT NULL,
    subdomain character varying(128),
    status character varying(30) DEFAULT 'pending'::character varying,
    verification_status character varying(20) DEFAULT 'pending'::character varying,
    verification_token character varying(255),
    verification_method character varying(20) DEFAULT 'txt'::character varying,
    ssl_status character varying(20) DEFAULT 'pending'::character varying,
    ssl_cert_arn character varying(255),
    ssl_expires_at timestamp with time zone,
    dns_config jsonb DEFAULT '{}'::jsonb,
    cname_target character varying(255),
    is_primary boolean DEFAULT true,
    is_verified boolean DEFAULT false,
    is_active boolean DEFAULT true,
    error_message text,
    last_checked_at timestamp with time zone,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: custom_domains_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_domains_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_domains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_domains_id_seq OWNED BY public.custom_domains.id;


--
-- Name: custom_plan_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_plan_pricing (
    id bigint NOT NULL,
    item_key character varying(50) NOT NULL,
    plan_column character varying(50),
    unit_price bigint DEFAULT 0 NOT NULL,
    unit_size integer DEFAULT 1 NOT NULL,
    included_qty integer DEFAULT 0 NOT NULL,
    min_qty integer DEFAULT 0 NOT NULL,
    max_qty integer,
    step_qty integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_plan_pricing_min_qty_nonneg CHECK ((min_qty >= 0)),
    CONSTRAINT custom_plan_pricing_step_qty_positive CHECK ((step_qty > 0)),
    CONSTRAINT custom_plan_pricing_unit_size_positive CHECK ((unit_size > 0))
);


--
-- Name: custom_plan_pricing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_plan_pricing_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_plan_pricing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_plan_pricing_id_seq OWNED BY public.custom_plan_pricing.id;


--
-- Name: customer_journey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_journey (
    id bigint NOT NULL,
    id_customer bigint,
    id_campaign bigint,
    event_type character varying(100) NOT NULL,
    event_channel character varying(50),
    id_node bigint,
    id_email_message bigint,
    id_zalo_message bigint,
    event_data jsonb,
    ip_address character varying(50),
    user_agent text,
    device_type character varying(50),
    country character varying(100),
    city character varying(100),
    event_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    id_run integer,
    campaign_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_journey_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_journey_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_journey_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_journey_id_seq OWNED BY public.customer_journey.id;


--
-- Name: customer_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_purchases (
    id bigint NOT NULL,
    id_customer bigint NOT NULL,
    id_course bigint,
    id_campaign bigint,
    product_name character varying(255),
    product_type character varying(50),
    amount numeric(15,2) NOT NULL,
    currency character varying(10) DEFAULT 'VND'::character varying,
    purchase_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    order_id character varying(100),
    payment_method character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    id_email_message bigint,
    id_run integer,
    id_zalo_message bigint
);


--
-- Name: customer_purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_purchases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_purchases_id_seq OWNED BY public.customer_purchases.id;


--
-- Name: customer_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_tag_assignments (
    customer_id bigint NOT NULL,
    tag_id bigint NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by bigint,
    source character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    campaign_id bigint,
    run_id bigint,
    CONSTRAINT customer_tag_assignments_source_check CHECK (((source)::text = ANY ((ARRAY['manual'::character varying, 'campaign'::character varying])::text[])))
);


--
-- Name: customer_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_tags (
    id bigint NOT NULL,
    workspace_owner_id bigint NOT NULL,
    name character varying(60) NOT NULL,
    color character varying(16),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_tags_id_seq OWNED BY public.customer_tags.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    email character varying(255),
    phone character varying(20),
    zalo_id character varying(100),
    zalo_phone character varying(20),
    facebook_id character varying(100),
    full_name character varying(255),
    gender public.gender_type,
    customer_source character varying(100),
    source_landing_page character varying(500),
    source_form_id character varying(100),
    utm_source character varying(255),
    utm_medium character varying(255),
    utm_campaign character varying(255),
    zalo_in_group boolean DEFAULT false,
    id_zalo_group bigint,
    zalo_group_joined_at timestamp without time zone,
    zalo_is_friend boolean DEFAULT false,
    zalo_friend_added_at timestamp without time zone,
    has_purchased boolean DEFAULT false,
    total_orders integer DEFAULT 0,
    total_spent numeric(15,2) DEFAULT 0,
    last_order_at timestamp without time zone,
    email_subscribed boolean DEFAULT true,
    email_unsubscribed_at timestamp without time zone,
    last_email_sent_at timestamp without time zone,
    last_email_opened_at timestamp without time zone,
    last_zalo_sent_at timestamp without time zone,
    last_zalo_read_at timestamp without time zone,
    notes text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    email_hard_bounced boolean DEFAULT false,
    workspace_owner_id bigint,
    created_by bigint,
    consent_source character varying(30),
    CONSTRAINT chk_contact_required CHECK (((email IS NOT NULL) OR (phone IS NOT NULL) OR (zalo_id IS NOT NULL)))
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: dashboard_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_insights (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    payload jsonb NOT NULL,
    filters_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dashboard_insights_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dashboard_insights_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dashboard_insights_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dashboard_insights_id_seq OWNED BY public.dashboard_insights.id;


--
-- Name: diagnostic_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnostic_messages (
    id bigint NOT NULL,
    run_id bigint NOT NULL,
    seq integer NOT NULL,
    recipient character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    sent_at timestamp with time zone,
    delay_ms integer,
    error_code character varying(100),
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    wait_ms integer,
    wait_reason character varying(40),
    lookup_ms integer,
    send_ms integer,
    attempts integer,
    error_category character varying(60),
    resolved_uid character varying(64),
    zalo_name character varying(255),
    dry_run boolean DEFAULT false NOT NULL
);


--
-- Name: diagnostic_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diagnostic_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diagnostic_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diagnostic_messages_id_seq OWNED BY public.diagnostic_messages.id;


--
-- Name: diagnostic_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnostic_runs (
    id bigint NOT NULL,
    channel character varying(30) NOT NULL,
    account_id bigint,
    message_text text NOT NULL,
    inter_message_delay_ms integer DEFAULT 5000 NOT NULL,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    created_by bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    mode character varying(20) DEFAULT 'fast'::character varying NOT NULL,
    policy_snapshot jsonb,
    skipped_count integer DEFAULT 0 NOT NULL
);


--
-- Name: diagnostic_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diagnostic_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diagnostic_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diagnostic_runs_id_seq OWNED BY public.diagnostic_runs.id;


--
-- Name: einvoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.einvoices (
    id bigint NOT NULL,
    order_id integer NOT NULL,
    ma_tra_cuu character varying(100) NOT NULL,
    mtchieu character varying(20) NOT NULL,
    khmshdon character varying(20),
    khhdon character varying(20),
    ma_so_hdon text,
    so_hdon character varying(64),
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    cqt_code character varying(64),
    error_code character varying(64),
    error_message text,
    pdf_url text,
    request_payload jsonb,
    response_payload jsonb,
    issued_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_started_at timestamp with time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    email_status character varying(24),
    email_attempt_count integer DEFAULT 0 NOT NULL,
    email_last_attempt_at timestamp with time zone,
    email_next_attempt_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    email_last_error text,
    CONSTRAINT einvoices_email_status_check CHECK (((email_status IS NULL) OR ((email_status)::text = ANY ((ARRAY['pending'::character varying, 'sending'::character varying, 'sent'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])))),
    CONSTRAINT einvoices_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'issued'::character varying, 'failed'::character varying, 'cqt_ok'::character varying, 'cqt_rejected'::character varying])::text[])))
);


--
-- Name: einvoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.einvoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: einvoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.einvoices_id_seq OWNED BY public.einvoices.id;


--
-- Name: email_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_messages (
    id bigint NOT NULL,
    id_campaign bigint,
    id_execution bigint,
    id_customer bigint,
    id_email_template bigint,
    id_email_setting bigint,
    id_sequence bigint,
    id_enrollment bigint,
    sequence_message_order integer,
    message_id character varying(255),
    recipient_email character varying(255) NOT NULL,
    recipient_name character varying(255),
    sender_email character varying(255) NOT NULL,
    sender_name character varying(255),
    subject character varying(500) NOT NULL,
    body_html text,
    body_text text,
    status public.message_status DEFAULT 'pending'::public.message_status,
    queued_at timestamp without time zone,
    sent_at timestamp without time zone,
    delivered_at timestamp without time zone,
    first_opened_at timestamp without time zone,
    last_opened_at timestamp without time zone,
    open_count integer DEFAULT 0,
    first_clicked_at timestamp without time zone,
    click_count integer DEFAULT 0,
    bounced_at timestamp without time zone,
    bounce_reason text,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    tracking_token character varying(120),
    id_run integer,
    id_node bigint,
    email_step integer,
    from_address character varying(255),
    reply_to character varying(255),
    brand_domain character varying(255),
    is_preview boolean DEFAULT false NOT NULL,
    bounce_type character varying(10),
    bounce_code character varying(15),
    bounce_detected_via character varying(10),
    quota_reservation_id bigint,
    workspace_owner_id bigint,
    actor_user_id bigint
);


--
-- Name: email_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_messages_id_seq OWNED BY public.email_messages.id;


--
-- Name: email_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_settings (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    smtp_host character varying(255) NOT NULL,
    smtp_port integer DEFAULT 587 NOT NULL,
    smtp_username character varying(255),
    smtp_password text,
    use_tls boolean DEFAULT true,
    daily_limit integer DEFAULT 1000,
    hourly_limit integer DEFAULT 100,
    daily_sent_count integer DEFAULT 0,
    total_sent_count bigint DEFAULT 0,
    is_verified boolean DEFAULT false,
    status public.email_setting_status DEFAULT 'active'::public.email_setting_status,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reply_to character varying(255),
    domain_verification_status character varying(30) DEFAULT 'not_required'::character varying NOT NULL,
    brand_domain character varying(255),
    domain_dns_records jsonb,
    domain_verified_at timestamp with time zone,
    email_mode text DEFAULT 'platform'::text NOT NULL,
    platform_prefix character varying(50) DEFAULT 'no-reply'::character varying NOT NULL,
    user_daily_send_limit integer
);


--
-- Name: email_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_settings_id_seq OWNED BY public.email_settings.id;


--
-- Name: email_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_suppressions (
    id bigint NOT NULL,
    workspace_owner_id bigint NOT NULL,
    email_lower character varying(320) NOT NULL,
    reason character varying(20) NOT NULL,
    source character varying(40),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_suppressions_reason_check CHECK (((reason)::text = ANY ((ARRAY['unsubscribe'::character varying, 'hard_bounce'::character varying])::text[])))
);


--
-- Name: email_suppressions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_suppressions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_suppressions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_suppressions_id_seq OWNED BY public.email_suppressions.id;


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    template_name character varying(255) NOT NULL,
    template_code character varying(100),
    subject character varying(500) NOT NULL,
    body_html text,
    body_text text,
    variables jsonb DEFAULT '[]'::jsonb,
    category character varying(100),
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    attachments jsonb DEFAULT '[]'::jsonb
);


--
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;


--
-- Name: facebook_token_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facebook_token_tracking (
    id integer NOT NULL,
    channel_connection_id integer NOT NULL,
    token_created_at timestamp with time zone DEFAULT now(),
    token_expires_at timestamp with time zone,
    last_refreshed_at timestamp with time zone DEFAULT now(),
    last_check_at timestamp with time zone DEFAULT now(),
    is_valid boolean DEFAULT true,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: facebook_token_tracking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.facebook_token_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: facebook_token_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.facebook_token_tracking_id_seq OWNED BY public.facebook_token_tracking.id;


--
-- Name: file_access_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_access_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid,
    campaign_id integer,
    customer_id integer,
    email text,
    event_type text NOT NULL,
    ip_address character varying(50),
    user_agent text,
    occurred_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT file_access_events_event_type_check CHECK ((event_type = ANY (ARRAY['OPEN'::text, 'DOWNLOAD'::text])))
);


--
-- Name: file_download_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_download_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid,
    campaign_id integer,
    customer_id integer,
    storage_key text,
    email text,
    ip_address character varying(50),
    user_agent text,
    clicked_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    id_run integer
);


--
-- Name: form_file_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_file_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id bigint NOT NULL,
    workspace_owner_id bigint NOT NULL,
    field_key character varying(64) NOT NULL,
    object_key text NOT NULL,
    file_name character varying(255) NOT NULL,
    file_ext character varying(10) NOT NULL,
    content_type character varying(127) NOT NULL,
    declared_size bigint NOT NULL,
    max_bytes bigint NOT NULL,
    status character varying(10) DEFAULT 'pending'::character varying NOT NULL,
    submission_id bigint,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT form_file_uploads_declared_size_check CHECK ((declared_size > 0)),
    CONSTRAINT form_file_uploads_max_bytes_check CHECK ((max_bytes > 0)),
    CONSTRAINT form_file_uploads_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'used'::character varying])::text[])))
);


--
-- Name: form_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_submissions (
    id bigint NOT NULL,
    form_id bigint NOT NULL,
    workspace_owner_id bigint NOT NULL,
    access_token character varying(64) NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    respondent_name character varying(255),
    respondent_email character varying(255),
    respondent_phone character varying(50),
    marketing_consent boolean,
    status character varying(20) DEFAULT 'submitted'::character varying NOT NULL,
    appointment_at timestamp with time zone,
    confirmation_sent_at timestamp with time zone,
    reminder_sent_at timestamp with time zone,
    payment_code character varying(16),
    payment_amount bigint,
    payment_snapshot jsonb,
    hold_expires_at timestamp with time zone,
    paid_confirmed_at timestamp with time zone,
    paid_confirmed_by bigint,
    submitter_ip_hash character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    landing_page_slug character varying(255),
    utm_source character varying(255),
    utm_medium character varying(255),
    utm_campaign character varying(255),
    utm_content character varying(255),
    utm_term character varying(255),
    unsubscribe_token uuid DEFAULT gen_random_uuid() NOT NULL,
    consent_withdrawn_at timestamp with time zone,
    payer_reported_paid_at timestamp with time zone,
    payment_receipt_key text,
    payment_receipt_uploaded_at timestamp with time zone,
    payment_receipt_waived_reason character varying(40),
    payment_receipt_upload_count smallint DEFAULT 0 NOT NULL,
    CONSTRAINT form_submissions_status_check CHECK (((status)::text = ANY ((ARRAY['submitted'::character varying, 'pending_payment'::character varying, 'confirmed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: form_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.form_submissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.form_submissions_id_seq OWNED BY public.form_submissions.id;


--
-- Name: forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forms (
    id bigint NOT NULL,
    workspace_owner_id bigint NOT NULL,
    created_by_user_id bigint,
    public_key character varying(32) NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    booking_config jsonb,
    payment_config jsonb,
    theme jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    admin_disabled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    landing_page_id bigint,
    product_id integer,
    CONSTRAINT forms_fields_array_check CHECK ((jsonb_typeof(fields) = 'array'::text))
);


--
-- Name: forms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forms_id_seq OWNED BY public.forms.id;


--
-- Name: help_article_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_article_chunks (
    id bigint NOT NULL,
    article_id bigint NOT NULL,
    chunk_index integer NOT NULL,
    content_text text NOT NULL,
    embedding public.vector(768),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: help_article_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.help_article_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: help_article_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.help_article_chunks_id_seq OWNED BY public.help_article_chunks.id;


--
-- Name: help_article_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_article_media (
    id bigint NOT NULL,
    article_id bigint NOT NULL,
    type character varying(20) NOT NULL,
    url text NOT NULL,
    caption text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT help_article_media_type_check CHECK (((type)::text = ANY ((ARRAY['image'::character varying, 'video'::character varying])::text[])))
);


--
-- Name: help_article_media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.help_article_media_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: help_article_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.help_article_media_id_seq OWNED BY public.help_article_media.id;


--
-- Name: help_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_articles (
    id bigint NOT NULL,
    slug character varying(120) NOT NULL,
    title character varying(255) NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    body_md text DEFAULT ''::text NOT NULL,
    feature_key character varying(80) NOT NULL,
    primary_route character varying(255),
    sort_order integer DEFAULT 0 NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_html text,
    locale character varying(5) DEFAULT 'vi'::character varying NOT NULL,
    is_stale boolean DEFAULT false NOT NULL,
    source_locale character varying(5),
    translated_at timestamp with time zone
);


--
-- Name: help_articles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.help_articles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: help_articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.help_articles_id_seq OWNED BY public.help_articles.id;


--
-- Name: help_unanswered; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_unanswered (
    id bigint NOT NULL,
    question text NOT NULL,
    user_id bigint,
    asked_at timestamp with time zone DEFAULT now() NOT NULL,
    top_similarity real,
    reason character varying(32),
    CONSTRAINT help_unanswered_reason_check CHECK (((reason IS NULL) OR ((reason)::text = ANY ((ARRAY['low_similarity'::character varying, 'model_said_no_doc'::character varying, 'no_chunks'::character varying])::text[]))))
);


--
-- Name: help_unanswered_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.help_unanswered_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: help_unanswered_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.help_unanswered_id_seq OWNED BY public.help_unanswered.id;


--
-- Name: kb_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_chunks (
    id bigint NOT NULL,
    id_document bigint NOT NULL,
    id_kb bigint NOT NULL,
    id_user bigint NOT NULL,
    chunk_text text NOT NULL,
    embedding public.vector(768),
    chunk_index integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kb_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kb_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kb_chunks_id_seq OWNED BY public.kb_chunks.id;


--
-- Name: kb_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_documents (
    id bigint NOT NULL,
    id_kb bigint NOT NULL,
    id_user bigint NOT NULL,
    title character varying(500),
    source_type character varying(20) NOT NULL,
    source_url text,
    content_text text,
    file_name character varying(500),
    file_size bigint,
    mime_type character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying,
    error_message text,
    chunk_count integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    extracted_chars bigint DEFAULT 0 NOT NULL,
    CONSTRAINT kb_documents_extracted_chars_check CHECK ((extracted_chars >= 0))
);


--
-- Name: kb_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kb_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kb_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kb_documents_id_seq OWNED BY public.kb_documents.id;


--
-- Name: knowledge_bases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_bases (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    id_sub_assistant bigint,
    name character varying(255) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    chunking_mode character varying(20) DEFAULT 'paragraph'::character varying,
    chunk_size integer DEFAULT 500,
    embedding_model character varying(50) DEFAULT 'gemini-embedding-004'::character varying,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_bases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_bases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_bases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledge_bases_id_seq OWNED BY public.knowledge_bases.id;


--
-- Name: landing_featured_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_featured_courses (
    id bigint NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    title_vi character varying(500) NOT NULL,
    title_en character varying(500) NOT NULL,
    tag_vi character varying(200) DEFAULT ''::character varying NOT NULL,
    tag_en character varying(200) DEFAULT ''::character varying NOT NULL,
    image_url text,
    link_url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    id_user bigint NOT NULL
);


--
-- Name: landing_featured_courses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_featured_courses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_featured_courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_featured_courses_id_seq OWNED BY public.landing_featured_courses.id;


--
-- Name: landing_page_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_domains (
    id bigint NOT NULL,
    landing_page_id bigint NOT NULL,
    hostname text NOT NULL,
    verification_token text NOT NULL,
    status text DEFAULT 'pending_verification'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_at timestamp with time zone,
    cf_managed boolean DEFAULT false NOT NULL,
    cf_zone_id text,
    cf_record_id text,
    is_apex_domain boolean DEFAULT false NOT NULL,
    cf_hostname_id character varying(100) DEFAULT NULL::character varying,
    CONSTRAINT landing_page_domains_status_check CHECK ((status = ANY (ARRAY['pending_verification'::text, 'active'::text, 'disabled'::text])))
);


--
-- Name: landing_page_domains_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_page_domains_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_page_domains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_page_domains_id_seq OWNED BY public.landing_page_domains.id;


--
-- Name: landing_page_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_events (
    id bigint NOT NULL,
    event_type character varying(20) NOT NULL,
    landing_page_slug character varying(100),
    target_url text,
    utm_source character varying(255),
    utm_medium character varying(255),
    utm_campaign character varying(255),
    utm_content character varying(255),
    utm_term character varying(255),
    visitor_id character varying(64),
    referrer text,
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_user bigint,
    CONSTRAINT landing_page_events_event_type_check CHECK (((event_type)::text = ANY (ARRAY[('view'::character varying)::text, ('click'::character varying)::text, ('submit'::character varying)::text])))
);


--
-- Name: landing_page_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_page_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_page_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_page_events_id_seq OWNED BY public.landing_page_events.id;


--
-- Name: landing_page_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_forms (
    landing_page_id bigint NOT NULL,
    form_id bigint NOT NULL,
    "position" integer NOT NULL,
    kind character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: landing_page_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_overrides (
    id integer NOT NULL,
    page character varying(50) NOT NULL,
    section character varying(100) NOT NULL,
    key character varying(100) NOT NULL,
    value_vi text,
    value_en text,
    extra_data jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT landing_page_overrides_page_check CHECK (((page)::text = ANY ((ARRAY['hero'::character varying, 'contact'::character varying, 'pricing'::character varying])::text[])))
);


--
-- Name: landing_page_overrides_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_page_overrides_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_page_overrides_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_page_overrides_id_seq OWNED BY public.landing_page_overrides.id;


--
-- Name: landing_page_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_sections (
    id integer NOT NULL,
    page character varying(50) NOT NULL,
    section character varying(50) NOT NULL,
    html_content text,
    css_content text,
    config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: landing_page_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_page_sections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_page_sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_page_sections_id_seq OWNED BY public.landing_page_sections.id;


--
-- Name: landing_page_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_shares (
    id bigint NOT NULL,
    id_landing_page bigint NOT NULL,
    id_owner bigint NOT NULL,
    id_recipient bigint,
    recipient_email character varying(255) NOT NULL,
    share_type character varying(20) DEFAULT 'view'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    CONSTRAINT landing_page_shares_share_type_check CHECK (((share_type)::text = ANY ((ARRAY['view'::character varying, 'edit'::character varying])::text[]))),
    CONSTRAINT landing_page_shares_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'revoked'::character varying])::text[])))
);


--
-- Name: landing_page_shares_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_page_shares_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_page_shares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_page_shares_id_seq OWNED BY public.landing_page_shares.id;


--
-- Name: landing_page_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_templates (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    category character varying(50) NOT NULL,
    thumbnail_url text,
    description text,
    html_structure text NOT NULL,
    css_variables jsonb DEFAULT '{}'::jsonb,
    default_config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id integer,
    is_public boolean DEFAULT false
);


--
-- Name: landing_page_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_page_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_page_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_page_templates_id_seq OWNED BY public.landing_page_templates.id;


--
-- Name: landing_page_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_versions (
    id bigint NOT NULL,
    id_landing_page bigint NOT NULL,
    id_user bigint NOT NULL,
    storage_key text NOT NULL,
    title character varying(255),
    html_hash character varying(64) NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    source character varying(32) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_owner_id bigint,
    created_by bigint
);


--
-- Name: landing_page_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_page_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_page_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_page_versions_id_seq OWNED BY public.landing_page_versions.id;


--
-- Name: landing_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_pages (
    id bigint NOT NULL,
    slug character varying(100),
    title character varying(255) DEFAULT ''::character varying NOT NULL,
    html_content text DEFAULT ''::text NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    id_user bigint,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    template_id integer,
    custom_config jsonb DEFAULT '{}'::jsonb,
    custom_domain_id integer,
    domain_type character varying(20) DEFAULT 'system'::character varying NOT NULL,
    domain_subtype character varying(20) DEFAULT NULL::character varying,
    workspace_owner_id bigint,
    created_by bigint,
    share_count integer DEFAULT 0,
    CONSTRAINT landing_pages_domain_subtype_check CHECK (((domain_subtype IS NULL) OR ((domain_subtype)::text = ANY ((ARRAY['subdomain'::character varying, 'apex'::character varying])::text[])))),
    CONSTRAINT landing_pages_domain_type_check CHECK (((domain_type)::text = ANY ((ARRAY['system'::character varying, 'custom'::character varying])::text[]))),
    CONSTRAINT landing_pages_slug_format CHECK (((slug)::text ~ '^[a-z0-9][a-z0-9_-]*$'::text))
);


--
-- Name: landing_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_pages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_pages_id_seq OWNED BY public.landing_pages.id;


--
-- Name: landing_testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_testimonials (
    id bigint NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    quote_vi text NOT NULL,
    quote_en text NOT NULL,
    star_rating smallint NOT NULL,
    name_vi character varying(200) NOT NULL,
    name_en character varying(200) NOT NULL,
    role_vi character varying(300) DEFAULT ''::character varying NOT NULL,
    role_en character varying(300) DEFAULT ''::character varying NOT NULL,
    location_vi character varying(300) DEFAULT ''::character varying NOT NULL,
    location_en character varying(300) DEFAULT ''::character varying NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    id_user bigint NOT NULL,
    CONSTRAINT landing_testimonials_star_rating_check CHECK (((star_rating >= 1) AND (star_rating <= 5)))
);


--
-- Name: landing_testimonials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landing_testimonials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landing_testimonials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landing_testimonials_id_seq OWNED BY public.landing_testimonials.id;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id bigint NOT NULL,
    last_name character varying(255) NOT NULL,
    first_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(30) NOT NULL,
    occupation character varying(255) NOT NULL,
    interest_area character varying(500) NOT NULL,
    marketing_consent boolean,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    landing_page_slug character varying(100),
    utm_source character varying(255),
    utm_medium character varying(255),
    utm_campaign character varying(255),
    utm_content character varying(255),
    utm_term character varying(255),
    id_user bigint NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_owner_id bigint,
    unsubscribe_token uuid DEFAULT gen_random_uuid() NOT NULL,
    consent_withdrawn_at timestamp with time zone,
    CONSTRAINT leads_custom_fields_object_check CHECK ((jsonb_typeof(custom_fields) = 'object'::text))
);


--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leads_id_seq OWNED BY public.leads.id;


--
-- Name: login_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_history (
    id bigint NOT NULL,
    id_user bigint,
    email character varying(255) NOT NULL,
    login_status character varying(20) NOT NULL,
    failure_reason character varying(255),
    ip_address character varying(50),
    user_agent text,
    device_type character varying(50),
    browser character varying(100),
    os character varying(100),
    country character varying(100),
    city character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: login_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_history_id_seq OWNED BY public.login_history.id;


--
-- Name: marketplace_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_favorites (
    id_user bigint NOT NULL,
    listing_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketplace_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_listings (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    resource_type character varying(20) NOT NULL,
    resource_id bigint NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    category character varying(50),
    tags text[],
    price_credits integer DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    visibility character varying(20) DEFAULT 'public'::character varying,
    view_count integer DEFAULT 0,
    purchase_count integer DEFAULT 0,
    rating_avg numeric(3,2) DEFAULT 0,
    rating_count integer DEFAULT 0,
    snapshot_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone,
    CONSTRAINT marketplace_listings_resource_type_check CHECK (((resource_type)::text = ANY ((ARRAY['campaign'::character varying, 'chatbot'::character varying, 'landing_page'::character varying])::text[]))),
    CONSTRAINT marketplace_listings_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'paused'::character varying])::text[]))),
    CONSTRAINT marketplace_listings_visibility_check CHECK (((visibility)::text = ANY ((ARRAY['public'::character varying, 'team'::character varying])::text[])))
);


--
-- Name: marketplace_listings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketplace_listings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketplace_listings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketplace_listings_id_seq OWNED BY public.marketplace_listings.id;


--
-- Name: marketplace_payout_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_payout_requests (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    amount integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    payment_method character varying(50),
    payment_details jsonb,
    admin_notes text,
    requested_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    processed_by bigint,
    CONSTRAINT marketplace_payout_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'paid'::character varying])::text[])))
);


--
-- Name: marketplace_payout_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketplace_payout_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketplace_payout_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketplace_payout_requests_id_seq OWNED BY public.marketplace_payout_requests.id;


--
-- Name: marketplace_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_purchases (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    listing_id bigint NOT NULL,
    seller_id bigint NOT NULL,
    credits_spent integer NOT NULL,
    transaction_type character varying(20) NOT NULL,
    cloned_resource_id bigint,
    cloned_resource_type character varying(20),
    purchased_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketplace_purchases_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['purchase'::character varying, 'refund'::character varying])::text[])))
);


--
-- Name: marketplace_purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketplace_purchases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketplace_purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketplace_purchases_id_seq OWNED BY public.marketplace_purchases.id;


--
-- Name: marketplace_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_reviews (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    listing_id bigint NOT NULL,
    rating integer NOT NULL,
    review_text text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketplace_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: marketplace_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketplace_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketplace_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketplace_reviews_id_seq OWNED BY public.marketplace_reviews.id;


--
-- Name: marketplace_seller_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_seller_stats (
    id_user bigint NOT NULL,
    total_earnings integer DEFAULT 0,
    total_sales integer DEFAULT 0,
    total_views integer DEFAULT 0,
    available_balance integer DEFAULT 0,
    pending_payout integer DEFAULT 0,
    lifetime_paid_out integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_marketplace_seller_stats_available_balance_non_negative CHECK ((available_balance >= 0))
);


--
-- Name: member_channel_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_channel_accounts (
    id bigint NOT NULL,
    owner_id bigint NOT NULL,
    employee_id bigint NOT NULL,
    channel character varying(30) NOT NULL,
    account_ref text NOT NULL,
    source character varying(20) DEFAULT 'assigned'::character varying NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_member_channel_accounts_source CHECK (((source)::text = ANY ((ARRAY['assigned'::character varying, 'self_login'::character varying, 'legacy'::character varying])::text[])))
);


--
-- Name: member_channel_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_channel_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_channel_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_channel_accounts_id_seq OWNED BY public.member_channel_accounts.id;


--
-- Name: migration_runner_checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_runner_checkpoints (
    checkpoint character varying(100) NOT NULL,
    release_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migration_runner_preflight_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_runner_preflight_backups (
    migration_filename character varying(255) NOT NULL,
    backup_path text NOT NULL,
    content_sha256 character(64) NOT NULL,
    row_count integer NOT NULL,
    rows jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT migration_runner_preflight_backups_row_count_check CHECK ((row_count >= 0))
);


--
-- Name: migration_runner_repair_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_runner_repair_results (
    migration_filename character varying(255) NOT NULL,
    backup_path text NOT NULL,
    content_sha256 character(64) NOT NULL,
    preflight_row_count integer NOT NULL,
    repaired_row_count integer NOT NULL,
    skipped_row_count integer NOT NULL,
    preflight_created_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT migration_runner_repair_results_preflight_row_count_check CHECK ((preflight_row_count >= 0)),
    CONSTRAINT migration_runner_repair_results_repaired_row_count_check CHECK ((repaired_row_count >= 0)),
    CONSTRAINT migration_runner_repair_results_skipped_row_count_check CHECK ((skipped_row_count >= 0))
);


--
-- Name: notification_email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_email_logs (
    id integer NOT NULL,
    notification_id integer,
    user_id integer,
    email character varying(255) NOT NULL,
    message_id character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    sent_at timestamp without time zone,
    delivered_at timestamp without time zone,
    opened_at timestamp without time zone,
    bounced_at timestamp without time zone,
    error_message text,
    retry_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: notification_email_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_email_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_email_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_email_logs_id_seq OWNED BY public.notification_email_logs.id;


--
-- Name: notification_event_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_event_settings (
    event_type character varying(48) NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    user_can_disable_email boolean DEFAULT true NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id bigint NOT NULL,
    event_type character varying(48) NOT NULL,
    email_enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id integer NOT NULL,
    type_key character varying(32) NOT NULL,
    slug character varying(64) NOT NULL,
    name character varying(120) NOT NULL,
    description text,
    subject character varying(200) NOT NULL,
    body_html text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    schedule_type character varying(16) DEFAULT 'now'::character varying NOT NULL,
    scheduled_at timestamp with time zone,
    recurrence_pattern character varying(16),
    recurrence_end_date timestamp with time zone,
    last_dispatched_at timestamp with time zone,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_templates_recurrence_check CHECK (((recurrence_pattern IS NULL) OR ((recurrence_pattern)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying])::text[])))),
    CONSTRAINT notification_templates_schedule_check CHECK (((schedule_type)::text = ANY ((ARRAY['now'::character varying, 'scheduled'::character varying, 'recurring'::character varying])::text[]))),
    CONSTRAINT notification_templates_type_check CHECK (((type_key)::text = ANY ((ARRAY['maintenance'::character varying, 'announcement'::character varying, 'promotion'::character varying, 'warning'::character varying, 'reminder'::character varying, 'security'::character varying])::text[])))
);


--
-- Name: notification_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_templates_id_seq OWNED BY public.notification_templates.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    type public.notification_type DEFAULT 'announcement'::public.notification_type NOT NULL,
    title character varying(255) NOT NULL,
    title_en character varying(255),
    message text NOT NULL,
    message_en text,
    html_content text,
    html_content_en text,
    metadata jsonb DEFAULT '{}'::jsonb,
    priority public.notification_priority DEFAULT 'normal'::public.notification_priority,
    target_roles text[],
    target_plans text[],
    target_statuses text[],
    target_user_ids integer[],
    target_emails text[],
    registered_before timestamp without time zone,
    registered_after timestamp without time zone,
    schedule_type public.schedule_type DEFAULT 'now'::public.schedule_type,
    scheduled_at timestamp without time zone,
    recurrence_pattern character varying(20),
    recurrence_end_date timestamp without time zone,
    is_recurring boolean DEFAULT false,
    recipient_count integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    opened_count integer DEFAULT 0,
    open_rate numeric(5,2) DEFAULT 0,
    status public.notification_status DEFAULT 'draft'::public.notification_status,
    sent_at timestamp without time zone,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    channels text[] DEFAULT '{email}'::text[] NOT NULL,
    in_app_count integer DEFAULT 0 NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    user_id bigint,
    plan_id integer,
    amount numeric(12,2) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    code character varying(50),
    payment_method character varying(50) DEFAULT 'payos'::character varying NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    order_code bigint NOT NULL,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    total_amount numeric(12,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    final_amount numeric(12,2) DEFAULT 0,
    description text,
    user_email character varying(255),
    user_name character varying(255),
    plan_name character varying(255),
    note text,
    billing_period character varying(10) DEFAULT 'monthly'::character varying NOT NULL,
    original_amount numeric(12,2),
    voucher_id bigint,
    voucher_code character varying(64),
    topup_config jsonb,
    invoice_info jsonb,
    discount_source character varying(24),
    discount_label character varying(160),
    custom_plan_config jsonb,
    paid_at timestamp with time zone,
    refunded_at timestamp with time zone,
    refunded_by bigint,
    refund_reason text,
    refund_meta jsonb,
    payment_reminder_sent_at timestamp with time zone,
    CONSTRAINT orders_billing_period_check CHECK (((billing_period)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying])::text[]))),
    CONSTRAINT orders_discount_source_check CHECK (((discount_source IS NULL) OR ((discount_source)::text = ANY ((ARRAY['public_code'::character varying, 'private_code'::character varying, 'automatic'::character varying])::text[])))),
    CONSTRAINT orders_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['payos'::character varying, 'manual'::character varying, 'free'::character varying, 'voucher'::character varying])::text[]))),
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'success'::character varying, 'cancelled'::character varying, 'failed'::character varying, 'refunded'::character varying])::text[])))
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    price numeric(12,2) DEFAULT 0,
    max_campaigns integer DEFAULT 1,
    is_custom boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    daily_email_limit integer,
    monthly_email_limit integer,
    daily_zalo_limit integer,
    monthly_zalo_limit integer,
    code character varying(50),
    description text,
    status character varying(20) DEFAULT 'active'::character varying,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now(),
    features jsonb DEFAULT '[]'::jsonb,
    max_employees integer DEFAULT 0,
    max_zalo_accounts integer DEFAULT 0,
    max_email_accounts integer DEFAULT 0,
    max_zalo_templates integer DEFAULT 0,
    max_email_templates integer DEFAULT 0,
    max_landing_pages integer DEFAULT 0,
    duration_days integer,
    price_yearly bigint,
    max_zalo_campaigns integer,
    max_zalo_group_campaigns integer,
    max_email_campaigns integer,
    messages_per_period integer,
    is_fup_enabled boolean DEFAULT false,
    max_chatbots integer,
    ai_tokens_per_period integer,
    ai_model character varying(64) DEFAULT 'gemini-2.5-flash'::character varying,
    grace_period_days integer DEFAULT 0 NOT NULL,
    ai_credits_per_period integer,
    custom_owner_user_id bigint,
    custom_config jsonb,
    storage_limit_bytes bigint NOT NULL,
    max_kb_documents integer DEFAULT 3 NOT NULL,
    max_kb_extracted_chars bigint DEFAULT 100000 NOT NULL,
    max_whatsapp_accounts integer,
    max_telegram_accounts integer,
    monthly_telegram_limit integer,
    monthly_whatsapp_limit integer,
    CONSTRAINT plans_ai_credits_per_period_check CHECK (((ai_credits_per_period IS NULL) OR (ai_credits_per_period >= 0))),
    CONSTRAINT plans_ai_tokens_per_period_check CHECK (((ai_tokens_per_period IS NULL) OR (ai_tokens_per_period >= 0))),
    CONSTRAINT plans_grace_period_days_check CHECK ((grace_period_days >= 0)),
    CONSTRAINT plans_max_chatbots_check CHECK (((max_chatbots IS NULL) OR (max_chatbots >= 0))),
    CONSTRAINT plans_max_kb_documents_positive CHECK ((max_kb_documents > 0)),
    CONSTRAINT plans_max_kb_extracted_chars_positive CHECK ((max_kb_extracted_chars > 0)),
    CONSTRAINT plans_messages_per_period_check CHECK (((messages_per_period IS NULL) OR (messages_per_period >= 0))),
    CONSTRAINT plans_storage_limit_bytes_positive CHECK ((storage_limit_bytes > 0))
);


--
-- Name: plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plans_id_seq OWNED BY public.plans.id;


--
-- Name: product_chat_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_chat_mentions (
    id bigint NOT NULL,
    workspace_owner_id bigint NOT NULL,
    product_id integer NOT NULL,
    source character varying(20) NOT NULL,
    message_id bigint NOT NULL,
    conversation_key text NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: product_chat_mentions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_chat_mentions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_chat_mentions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_chat_mentions_id_seq OWNED BY public.product_chat_mentions.id;


--
-- Name: product_mention_scan_cursors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_mention_scan_cursors (
    source character varying(20) NOT NULL,
    last_message_id bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    id_user integer NOT NULL,
    product_code character varying(100),
    product_name character varying(255) NOT NULL,
    price character varying(100),
    original_price character varying(100),
    description text,
    usp text,
    category character varying(255),
    thumbnail_url text,
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    product_url text,
    target_audience text,
    workspace_owner_id bigint,
    created_by bigint,
    kind character varying(20) DEFAULT 'sale'::character varying NOT NULL,
    price_amount bigint,
    CONSTRAINT products_kind_check CHECK (((kind)::text = ANY ((ARRAY['sale'::character varying, 'event'::character varying])::text[]))),
    CONSTRAINT products_price_amount_check CHECK (((price_amount IS NULL) OR (price_amount >= 0)))
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    token_hash character varying(255) NOT NULL,
    device_info character varying(500),
    ip_address character varying(50),
    expires_at timestamp without time zone NOT NULL,
    is_revoked boolean DEFAULT false,
    revoked_at timestamp without time zone,
    revoked_reason character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_used_at timestamp without time zone
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id bigint NOT NULL,
    role_code character varying(50) NOT NULL,
    role_name character varying(255) NOT NULL,
    description text,
    is_system boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.roles ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: scheduled_plan_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_plan_changes (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    plan_id bigint NOT NULL,
    billing_period character varying(10) NOT NULL,
    order_id bigint,
    amount_paid bigint DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    activate_after timestamp with time zone NOT NULL,
    activated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scheduled_plan_changes_billing_period_check CHECK (((billing_period)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying])::text[]))),
    CONSTRAINT scheduled_plan_changes_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'activated'::character varying, 'superseded'::character varying])::text[])))
);


--
-- Name: scheduled_plan_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheduled_plan_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheduled_plan_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheduled_plan_changes_id_seq OWNED BY public.scheduled_plan_changes.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename character varying(255) NOT NULL,
    ran_at timestamp with time zone DEFAULT now(),
    checksum_sha256 character(64)
);


--
-- Name: send_quota_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.send_quota_reservations (
    id bigint NOT NULL,
    reservation_key character varying(191) NOT NULL,
    request_fingerprint character varying(64) NOT NULL,
    fingerprint_version character varying(10) DEFAULT 'v1'::character varying NOT NULL,
    billing_user_id bigint NOT NULL,
    actor_user_id bigint,
    membership_id bigint,
    channel character varying(10) NOT NULL,
    quantity integer NOT NULL,
    is_metered boolean DEFAULT true NOT NULL,
    wallet_item_key character varying(50),
    wallet_quantity integer DEFAULT 0 NOT NULL,
    source_type character varying(50) NOT NULL,
    source_ref jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) NOT NULL,
    vn_day_start timestamp with time zone NOT NULL,
    vn_day_end timestamp with time zone NOT NULL,
    cycle_start timestamp with time zone,
    cycle_end timestamp with time zone,
    expires_at timestamp with time zone,
    provider_reference character varying(255),
    failure_code character varying(100),
    response_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sending_at timestamp with time zone,
    consumed_at timestamp with time zone,
    released_at timestamp with time zone,
    uncertain_at timestamp with time zone,
    CONSTRAINT chk_sqr_channel CHECK (((channel)::text = ANY ((ARRAY['email'::character varying, 'zalo'::character varying, 'telegram'::character varying, 'whatsapp'::character varying])::text[]))),
    CONSTRAINT chk_sqr_fingerprint CHECK (((request_fingerprint)::text ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT chk_sqr_metered_wallet CHECK (((is_metered = true) OR (wallet_quantity = 0))),
    CONSTRAINT chk_sqr_response_snapshot_size CHECK (((response_snapshot IS NULL) OR (octet_length((response_snapshot)::text) <= 4096))),
    CONSTRAINT chk_sqr_status CHECK (((status)::text = ANY ((ARRAY['reserved'::character varying, 'sending'::character varying, 'consumed'::character varying, 'released'::character varying, 'uncertain'::character varying])::text[]))),
    CONSTRAINT chk_sqr_wallet_item_key CHECK ((((wallet_quantity > 0) AND ((wallet_item_key)::text = ANY ((ARRAY['emails'::character varying, 'zalo_messages'::character varying, 'telegram_messages'::character varying, 'whatsapp_messages'::character varying])::text[]))) OR ((wallet_quantity = 0) AND (wallet_item_key IS NULL)))),
    CONSTRAINT chk_sqr_wallet_quantity CHECK ((wallet_quantity <= quantity)),
    CONSTRAINT send_quota_reservations_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT send_quota_reservations_wallet_quantity_check CHECK ((wallet_quantity >= 0))
);


--
-- Name: send_quota_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.send_quota_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: send_quota_reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.send_quota_reservations_id_seq OWNED BY public.send_quota_reservations.id;


--
-- Name: send_quota_shadow_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.send_quota_shadow_daily (
    vn_day date NOT NULL,
    channel character varying(20) NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    both_allowed integer DEFAULT 0 NOT NULL,
    both_denied integer DEFAULT 0 NOT NULL,
    legacy_allow_atomic_deny integer DEFAULT 0 NOT NULL,
    legacy_deny_atomic_allow integer DEFAULT 0 NOT NULL,
    atomic_candidate_error integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: send_quota_shadow_mismatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.send_quota_shadow_mismatches (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vn_day date NOT NULL,
    channel character varying(20) NOT NULL,
    user_id bigint,
    ctx_billing_user_id bigint,
    atomic_billing_user_id bigint,
    legacy_allowed boolean NOT NULL,
    atomic_allowed boolean NOT NULL,
    legacy_detail text,
    atomic_diag jsonb,
    atomic_error text,
    source_type character varying(50)
);


--
-- Name: send_quota_shadow_mismatches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.send_quota_shadow_mismatches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: send_quota_shadow_mismatches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.send_quota_shadow_mismatches_id_seq OWNED BY public.send_quota_shadow_mismatches.id;


--
-- Name: storage_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_objects (
    id bigint NOT NULL,
    pool_type character varying(16) DEFAULT 'workspace'::character varying NOT NULL,
    owner_user_id bigint,
    actor_user_id bigint,
    storage_key text,
    temp_key text,
    category character varying(32) NOT NULL,
    state character varying(24) NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    reference_type character varying(40),
    reference_id character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storage_objects_live_key_check CHECK ((((state)::text <> ALL ((ARRAY['active'::character varying, 'temp'::character varying, 'cleanup_pending'::character varying])::text[])) OR (storage_key IS NOT NULL) OR (temp_key IS NOT NULL))),
    CONSTRAINT storage_objects_pool_owner_check CHECK (((((pool_type)::text = 'workspace'::text) AND (owner_user_id IS NOT NULL)) OR (((pool_type)::text = 'system'::text) AND (owner_user_id IS NULL)))),
    CONSTRAINT storage_objects_pool_type_check CHECK (((pool_type)::text = ANY ((ARRAY['workspace'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT storage_objects_size_bytes_check CHECK ((size_bytes >= 0)),
    CONSTRAINT storage_objects_state_check CHECK (((state)::text = ANY ((ARRAY['active'::character varying, 'temp'::character varying, 'cleanup_pending'::character varying, 'orphaned'::character varying, 'deleted'::character varying])::text[])))
);


--
-- Name: storage_objects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.storage_objects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: storage_objects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.storage_objects_id_seq OWNED BY public.storage_objects.id;


--
-- Name: sub_assistants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_assistants (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    avatar_url text,
    greeting_msg text DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?'::text,
    is_active boolean DEFAULT true,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sub_assistants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sub_assistants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sub_assistants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sub_assistants_id_seq OWNED BY public.sub_assistants.id;


--
-- Name: subscription_reminder_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_reminder_settings (
    id boolean DEFAULT true NOT NULL,
    days_before integer[] DEFAULT '{7,3}'::integer[] NOT NULL,
    updated_by bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    days_before_yearly integer[] DEFAULT '{30,7,3}'::integer[] NOT NULL,
    CONSTRAINT subscription_reminder_settings_id_check CHECK (id)
);


--
-- Name: support_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_messages (
    id bigint NOT NULL,
    ticket_id bigint NOT NULL,
    author_user_id bigint,
    author_role character varying(8) NOT NULL,
    body text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_ticket_messages_author_role_check CHECK (((author_role)::text = ANY ((ARRAY['user'::character varying, 'admin'::character varying])::text[])))
);


--
-- Name: support_ticket_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_ticket_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_ticket_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_ticket_messages_id_seq OWNED BY public.support_ticket_messages.id;


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    workspace_owner_id bigint,
    subject character varying(200) NOT NULL,
    category character varying(24) NOT NULL,
    status character varying(24) DEFAULT 'open'::character varying NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    last_admin_reply_at timestamp with time zone,
    closed_at timestamp with time zone,
    closed_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_tickets_category_check CHECK (((category)::text = ANY ((ARRAY['feedback'::character varying, 'bug'::character varying, 'billing'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT support_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'awaiting_user'::character varying, 'closed'::character varying])::text[])))
);


--
-- Name: support_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_tickets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_tickets_id_seq OWNED BY public.support_tickets.id;


--
-- Name: system_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_email_templates (
    template_key character varying(64) NOT NULL,
    subject text NOT NULL,
    body_html text NOT NULL,
    updated_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_email_templates_key_check CHECK (((template_key)::text = ANY ((ARRAY['welcome'::character varying, 'plan_expiring'::character varying, 'plan_expired'::character varying, 'employee_invitation'::character varying, 'order_payment_reminder'::character varying])::text[])))
);


--
-- Name: system_payment_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_payment_accounts (
    id integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    account_name text NOT NULL,
    account_number text NOT NULL,
    bank_bin text NOT NULL,
    bank_name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_account_number_format CHECK ((account_number ~ '^[0-9]{6,19}$'::text)),
    CONSTRAINT chk_bank_bin_format CHECK ((bank_bin ~ '^[0-9]{6}$'::text))
);


--
-- Name: system_payment_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_payment_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_payment_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_payment_accounts_id_seq OWNED BY public.system_payment_accounts.id;


--
-- Name: telegram_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_accounts (
    id integer NOT NULL,
    id_user integer NOT NULL,
    telegram_user_id bigint NOT NULL,
    phone character varying(32),
    first_name character varying(255),
    last_name character varying(255),
    username character varying(255),
    is_active boolean DEFAULT true,
    last_activity_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_daily_send_limit integer,
    outbound_delay_min_ms integer,
    outbound_delay_max_ms integer
);


--
-- Name: telegram_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_accounts_id_seq OWNED BY public.telegram_accounts.id;


--
-- Name: telegram_chatbot_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_chatbot_settings (
    id integer NOT NULL,
    id_telegram_account integer NOT NULL,
    id_chatbot integer NOT NULL,
    is_enabled boolean DEFAULT false,
    is_enabled_dm boolean DEFAULT true,
    is_enabled_group boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    chatbot_system_instruction text
);


--
-- Name: telegram_chatbot_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_chatbot_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_chatbot_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_chatbot_settings_id_seq OWNED BY public.telegram_chatbot_settings.id;


--
-- Name: telegram_personal_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_personal_conversations (
    id integer NOT NULL,
    id_user integer NOT NULL,
    id_telegram_account integer NOT NULL,
    external_id character varying(128) NOT NULL,
    display_name character varying(255),
    visitor_name character varying(255),
    visitor_info jsonb DEFAULT '{}'::jsonb,
    id_chatbot integer,
    ai_paused boolean DEFAULT false,
    ai_paused_at timestamp with time zone,
    status character varying(16) DEFAULT 'open'::character varying,
    started_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: telegram_personal_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_personal_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_personal_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_personal_conversations_id_seq OWNED BY public.telegram_personal_conversations.id;


--
-- Name: telegram_personal_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_personal_messages (
    id integer NOT NULL,
    id_conversation integer NOT NULL,
    id_user integer NOT NULL,
    external_message_id character varying(64),
    role character varying(16) NOT NULL,
    content text,
    message_type character varying(16) DEFAULT 'text'::character varying,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT telegram_personal_messages_role_check CHECK (((role)::text = ANY ((ARRAY['visitor'::character varying, 'bot'::character varying, 'agent'::character varying, 'system'::character varying])::text[])))
);


--
-- Name: telegram_personal_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_personal_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_personal_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_personal_messages_id_seq OWNED BY public.telegram_personal_messages.id;


--
-- Name: telegram_session_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_session_state (
    telegram_user_id bigint NOT NULL,
    state jsonb NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: template_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id integer,
    original_name text DEFAULT ''::text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    storage_key text NOT NULL,
    file_size bigint,
    mime_type text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: template_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_labels (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(20) DEFAULT '#6366f1'::character varying NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    workspace_owner_id integer
);


--
-- Name: template_labels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.template_labels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: template_labels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.template_labels_id_seq OWNED BY public.template_labels.id;


--
-- Name: tiktok_business_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tiktok_business_accounts (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    business_id text NOT NULL,
    display_name text,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    scope text,
    access_token_expires_at timestamp with time zone NOT NULL,
    refresh_token_expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_webhook_at timestamp with time zone,
    region text,
    role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tiktok_business_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tiktok_business_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tiktok_business_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tiktok_business_accounts_id_seq OWNED BY public.tiktok_business_accounts.id;


--
-- Name: tiktok_outbound_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tiktok_outbound_log (
    id bigint NOT NULL,
    business_id text NOT NULL,
    unique_identifier text NOT NULL,
    conversation_id text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tiktok_outbound_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tiktok_outbound_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tiktok_outbound_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tiktok_outbound_log_id_seq OWNED BY public.tiktok_outbound_log.id;


--
-- Name: tiktok_scheduled_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tiktok_scheduled_posts (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    account_id bigint NOT NULL,
    post_type text NOT NULL,
    caption text DEFAULT ''::text NOT NULL,
    video_url text,
    photo_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    privacy_level text DEFAULT 'PUBLIC_TO_EVERYONE'::text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    share_id text,
    tiktok_post_ids jsonb,
    poll_count integer DEFAULT 0 NOT NULL,
    next_poll_at timestamp with time zone,
    processing_started_at timestamp with time zone,
    published_at timestamp with time zone,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tiktok_scheduled_posts_post_type_check CHECK ((post_type = ANY (ARRAY['video'::text, 'photo'::text]))),
    CONSTRAINT tiktok_scheduled_posts_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'publishing'::text, 'processing'::text, 'published'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: tiktok_scheduled_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tiktok_scheduled_posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tiktok_scheduled_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tiktok_scheduled_posts_id_seq OWNED BY public.tiktok_scheduled_posts.id;


--
-- Name: topup_debits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topup_debits (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    item_key character varying(50) NOT NULL,
    qty integer NOT NULL,
    source_key character varying(120) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT topup_debits_qty_check CHECK ((qty > 0))
);


--
-- Name: topup_debits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.topup_debits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: topup_debits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.topup_debits_id_seq OWNED BY public.topup_debits.id;


--
-- Name: topup_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topup_grants (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    item_key character varying(50) NOT NULL,
    qty integer NOT NULL,
    order_id bigint NOT NULL,
    cycle_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT topup_grants_consumable_no_expiry CHECK ((((item_key)::text <> ALL ((ARRAY['zalo_messages'::character varying, 'emails'::character varying, 'ai_credits'::character varying, 'telegram_messages'::character varying, 'whatsapp_messages'::character varying])::text[])) OR (cycle_end IS NULL))),
    CONSTRAINT topup_grants_qty_check CHECK ((qty > 0))
);


--
-- Name: topup_grants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.topup_grants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: topup_grants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.topup_grants_id_seq OWNED BY public.topup_grants.id;


--
-- Name: topup_locked_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topup_locked_resources (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    resource_key character varying(50) NOT NULL,
    resource_id bigint NOT NULL,
    locked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: topup_locked_resources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.topup_locked_resources_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: topup_locked_resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.topup_locked_resources_id_seq OWNED BY public.topup_locked_resources.id;


--
-- Name: topup_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topup_pricing (
    id bigint NOT NULL,
    item_key character varying(50) NOT NULL,
    unit_price bigint DEFAULT 0 NOT NULL,
    min_qty integer DEFAULT 0 NOT NULL,
    step_qty integer DEFAULT 1 NOT NULL,
    max_qty integer,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT topup_pricing_min_qty_nonneg CHECK ((min_qty >= 0)),
    CONSTRAINT topup_pricing_step_qty_positive CHECK ((step_qty > 0)),
    CONSTRAINT topup_pricing_unit_price_nonneg CHECK ((unit_price >= 0))
);


--
-- Name: topup_pricing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.topup_pricing_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: topup_pricing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.topup_pricing_id_seq OWNED BY public.topup_pricing.id;


--
-- Name: tracking_short_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracking_short_links (
    id bigint NOT NULL,
    short_code character varying(24) NOT NULL,
    destination_url text NOT NULL,
    channel character varying(30),
    tracking_token character varying(100),
    link_key character varying(120),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tracking_short_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tracking_short_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tracking_short_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tracking_short_links_id_seq OWNED BY public.tracking_short_links.id;


--
-- Name: usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_logs (
    id bigint NOT NULL,
    id_user bigint,
    resource_type character varying(50) NOT NULL,
    delta integer DEFAULT 1 NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    actor_user_id bigint,
    quota_reservation_id bigint
);


--
-- Name: usage_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usage_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usage_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usage_logs_id_seq OWNED BY public.usage_logs.id;


--
-- Name: user_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_consents (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    purpose character varying(40) NOT NULL,
    granted boolean NOT NULL,
    document_version character varying(20) NOT NULL,
    document_hash character(64),
    source character varying(30) NOT NULL,
    ip_address character varying(64),
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_consents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_consents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_consents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_consents_id_seq OWNED BY public.user_consents.id;


--
-- Name: user_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_members (
    id integer NOT NULL,
    user_id bigint,
    name character varying(255),
    role character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    owner_id bigint,
    status character varying(20) DEFAULT 'active'::character varying,
    updated_at timestamp without time zone DEFAULT now(),
    employee_id bigint,
    daily_send_limit integer DEFAULT 0,
    zalo_daily_limit integer DEFAULT 0,
    email_daily_limit integer DEFAULT 0,
    permissions jsonb DEFAULT '[]'::jsonb,
    daily_email_limit integer,
    monthly_email_limit integer,
    daily_zalo_limit integer,
    monthly_zalo_limit integer,
    email character varying(255),
    phone character varying(20),
    deleted_at timestamp without time zone,
    member_status character varying(20) DEFAULT 'active'::character varying,
    daily_ai_credit_limit integer,
    period_ai_credit_limit integer,
    origin character varying(16) DEFAULT 'linked'::character varying NOT NULL,
    accepted_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_user_members_origin CHECK (((origin)::text = ANY ((ARRAY['created'::character varying, 'linked'::character varying])::text[]))),
    CONSTRAINT user_members_daily_email_limit_check CHECK (((daily_email_limit IS NULL) OR (daily_email_limit >= 0))),
    CONSTRAINT user_members_daily_zalo_limit_check CHECK (((daily_zalo_limit IS NULL) OR (daily_zalo_limit >= 0))),
    CONSTRAINT user_members_monthly_email_limit_check CHECK (((monthly_email_limit IS NULL) OR (monthly_email_limit >= 0))),
    CONSTRAINT user_members_monthly_zalo_limit_check CHECK (((monthly_zalo_limit IS NULL) OR (monthly_zalo_limit >= 0)))
);


--
-- Name: user_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_members_id_seq OWNED BY public.user_members.id;


--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notifications (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    event_type character varying(48) NOT NULL,
    title character varying(255) NOT NULL,
    title_en character varying(255),
    message text NOT NULL,
    message_en text,
    link character varying(500),
    severity character varying(16) DEFAULT 'info'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    notification_id integer,
    dedupe_key character varying(120),
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_notifications_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'success'::character varying, 'warning'::character varying, 'error'::character varying])::text[])))
);


--
-- Name: user_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_notifications_id_seq OWNED BY public.user_notifications.id;


--
-- Name: user_two_factor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_two_factor (
    user_id bigint NOT NULL,
    secret_enc text NOT NULL,
    enabled_at timestamp with time zone,
    recovery_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_used_step bigint,
    failed_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_whatsapp_app_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_whatsapp_app_credentials (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    app_id character varying(64) NOT NULL,
    app_secret_encrypted text NOT NULL,
    app_name character varying(255),
    webhook_verify_token character varying(128),
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_whatsapp_app_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_whatsapp_app_credentials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_whatsapp_app_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_whatsapp_app_credentials_id_seq OWNED BY public.user_whatsapp_app_credentials.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(255),
    avatar_url character varying(500),
    phone character varying(20),
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp without time zone,
    status public.user_status DEFAULT 'active'::public.user_status,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login_at timestamp without time zone,
    last_login_ip character varying(50),
    id_role bigint DEFAULT 2 NOT NULL,
    max_campaigns integer,
    max_zalo_accounts integer,
    max_email_accounts integer,
    max_email_templates integer,
    max_zalo_templates integer,
    max_landing_pages integer,
    is_verified boolean DEFAULT false,
    verified_at timestamp without time zone,
    subscription_expires_at timestamp with time zone,
    subscription_reminder_count smallint DEFAULT 0 NOT NULL,
    role_id integer,
    role character varying(50) DEFAULT 'user'::character varying,
    active_plan_id integer,
    max_zalo_campaigns integer,
    max_zalo_group_campaigns integer,
    max_email_campaigns integer,
    messages_per_period integer,
    is_fup_enabled boolean DEFAULT false,
    preferred_ai_model text,
    max_employees integer,
    must_change_password boolean DEFAULT false NOT NULL,
    bot_daily_reply_cap integer,
    ai_handoff_auto_resume_minutes integer,
    storage_quota_override_bytes bigint,
    auth_provider character varying(16) DEFAULT 'local'::character varying NOT NULL,
    invoice_profile jsonb,
    plan_activated_at timestamp with time zone,
    overage_grace_until timestamp with time zone,
    employee_campaign_approval_threshold integer,
    referral_code character varying(16),
    referred_by_user_id bigint,
    referred_at timestamp with time zone,
    deleted_at timestamp with time zone,
    phone_verified_at timestamp with time zone,
    subscription_reminders_sent jsonb DEFAULT '{}'::jsonb NOT NULL,
    chatbot_contact_alert_email boolean DEFAULT true NOT NULL,
    chatbot_digest_frequency character varying(10) DEFAULT 'weekly'::character varying NOT NULL,
    referral_prompt_dismissed_at timestamp with time zone,
    max_whatsapp_accounts integer,
    max_telegram_accounts integer,
    CONSTRAINT users_ai_handoff_auto_resume_minutes_allowed CHECK (((ai_handoff_auto_resume_minutes IS NULL) OR (ai_handoff_auto_resume_minutes = ANY (ARRAY[5, 15, 30, 60])))),
    CONSTRAINT users_auth_provider_check CHECK (((auth_provider)::text = ANY ((ARRAY['local'::character varying, 'google'::character varying])::text[]))),
    CONSTRAINT users_bot_daily_reply_cap_positive CHECK (((bot_daily_reply_cap IS NULL) OR (bot_daily_reply_cap > 0))),
    CONSTRAINT users_chatbot_digest_frequency_check CHECK (((chatbot_digest_frequency)::text = ANY ((ARRAY['none'::character varying, 'weekly'::character varying, 'monthly'::character varying])::text[]))),
    CONSTRAINT users_max_campaigns_non_negative CHECK (((max_campaigns IS NULL) OR (max_campaigns >= 0))),
    CONSTRAINT users_max_email_accounts_non_negative CHECK (((max_email_accounts IS NULL) OR (max_email_accounts >= 0))),
    CONSTRAINT users_max_email_templates_non_negative CHECK (((max_email_templates IS NULL) OR (max_email_templates >= 0))),
    CONSTRAINT users_max_zalo_accounts_non_negative CHECK (((max_zalo_accounts IS NULL) OR (max_zalo_accounts >= 0))),
    CONSTRAINT users_max_zalo_templates_non_negative CHECK (((max_zalo_templates IS NULL) OR (max_zalo_templates >= 0))),
    CONSTRAINT users_messages_per_period_check CHECK (((messages_per_period IS NULL) OR (messages_per_period >= 0))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'admin'::character varying])::text[]))),
    CONSTRAINT users_storage_quota_override_bytes_positive CHECK (((storage_quota_override_bytes IS NULL) OR (storage_quota_override_bytes > 0)))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: verification_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255),
    code text NOT NULL,
    type character varying(20) DEFAULT 'email_verification'::character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_id uuid,
    phone character varying(20),
    attempts smallint DEFAULT 0 NOT NULL
);


--
-- Name: voucher_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voucher_redemptions (
    id bigint NOT NULL,
    voucher_id bigint NOT NULL,
    order_id bigint NOT NULL,
    user_id bigint,
    user_email character varying(255),
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: voucher_redemptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voucher_redemptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voucher_redemptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voucher_redemptions_id_seq OWNED BY public.voucher_redemptions.id;


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id bigint NOT NULL,
    code character varying(64) NOT NULL,
    name character varying(160) NOT NULL,
    description text,
    discount_type character varying(20) NOT NULL,
    discount_value numeric(12,2) NOT NULL,
    max_discount_amount numeric(12,2),
    min_order_amount numeric(12,2) DEFAULT 0 NOT NULL,
    applies_to_plan_codes text[],
    applies_to_billing_periods text[],
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    usage_limit integer,
    usage_limit_per_user integer,
    used_count integer DEFAULT 0 NOT NULL,
    auto_apply boolean DEFAULT false NOT NULL,
    stackable boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    offer_mode character varying(24) DEFAULT 'public_code'::character varying NOT NULL,
    CONSTRAINT vouchers_discount_type_check CHECK (((discount_type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed_amount'::character varying])::text[]))),
    CONSTRAINT vouchers_discount_value_check CHECK ((discount_value >= (0)::numeric)),
    CONSTRAINT vouchers_min_order_amount_check CHECK ((min_order_amount >= (0)::numeric)),
    CONSTRAINT vouchers_offer_mode_check CHECK (((offer_mode)::text = ANY ((ARRAY['public_code'::character varying, 'private_code'::character varying, 'automatic'::character varying])::text[]))),
    CONSTRAINT vouchers_usage_limit_check CHECK (((usage_limit IS NULL) OR (usage_limit >= 0))),
    CONSTRAINT vouchers_usage_limit_per_user_check CHECK (((usage_limit_per_user IS NULL) OR (usage_limit_per_user >= 0))),
    CONSTRAINT vouchers_used_count_check CHECK ((used_count >= 0))
);


--
-- Name: vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vouchers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;


--
-- Name: web_widget_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_widget_configs (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    id_sub_assistant bigint,
    widget_key character varying(100) NOT NULL,
    display_name character varying(255),
    theme_color character varying(7) DEFAULT '#3B82F6'::character varying,
    "position" character varying(20) DEFAULT 'bottom-right'::character varying,
    welcome_message text,
    is_active boolean DEFAULT true,
    allowed_domains text[],
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    logo_url text,
    primary_color character varying(7) DEFAULT '#3B82F6'::character varying,
    background_color character varying(7) DEFAULT '#FFFFFF'::character varying,
    text_color character varying(7) DEFAULT '#1F2937'::character varying,
    accent_color character varying(7) DEFAULT '#60A5FA'::character varying,
    suggested_questions text[] DEFAULT '{}'::text[],
    border_radius integer DEFAULT 16,
    show_avatar boolean DEFAULT true,
    chat_height character varying(10) DEFAULT '500px'::character varying
);


--
-- Name: web_widget_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.web_widget_configs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: web_widget_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.web_widget_configs_id_seq OWNED BY public.web_widget_configs.id;


--
-- Name: webchat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_conversations (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    id_widget_config bigint NOT NULL,
    session_id character varying(100),
    visitor_name character varying(255),
    visitor_email character varying(255),
    visitor_info jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    ai_paused boolean DEFAULT false NOT NULL,
    ai_paused_at timestamp with time zone
);


--
-- Name: webchat_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webchat_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webchat_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webchat_conversations_id_seq OWNED BY public.webchat_conversations.id;


--
-- Name: webchat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_messages (
    id bigint NOT NULL,
    id_conversation bigint NOT NULL,
    id_user bigint NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    is_read boolean DEFAULT false,
    read_at timestamp with time zone
);


--
-- Name: webchat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webchat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webchat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webchat_messages_id_seq OWNED BY public.webchat_messages.id;


--
-- Name: whatsapp_account_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_account_settings (
    session_key text NOT NULL,
    id_user bigint NOT NULL,
    user_daily_send_limit integer,
    outbound_delay_min_ms integer,
    outbound_delay_max_ms integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL
);


--
-- Name: whatsapp_account_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.whatsapp_account_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: whatsapp_account_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.whatsapp_account_settings_id_seq OWNED BY public.whatsapp_account_settings.id;


--
-- Name: whatsapp_baileys_session_creds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_baileys_session_creds (
    session_key character varying(255) NOT NULL,
    creds jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_baileys_session_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_baileys_session_keys (
    session_key character varying(255) NOT NULL,
    type character varying(64) NOT NULL,
    id text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_baileys_session_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_baileys_session_profile (
    session_key character varying(255) NOT NULL,
    me_id character varying(64),
    me_name text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zalo_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_accounts (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    status character varying(20) DEFAULT 'disconnected'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zalo_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_accounts_id_seq OWNED BY public.zalo_accounts.id;


--
-- Name: zalo_friends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_friends (
    id bigint NOT NULL,
    id_zalo_setting bigint NOT NULL,
    friend_id character varying(100) NOT NULL,
    display_name character varying(255),
    phone character varying(32),
    avatar_url text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zalo_friends_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_friends_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_friends_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_friends_id_seq OWNED BY public.zalo_friends.id;


--
-- Name: zalo_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_groups (
    id bigint NOT NULL,
    id_zalo_setting bigint NOT NULL,
    group_id character varying(100) NOT NULL,
    group_name character varying(255),
    member_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zalo_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_groups_id_seq OWNED BY public.zalo_groups.id;


--
-- Name: zalo_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_messages (
    id bigint NOT NULL,
    id_campaign bigint,
    id_run integer,
    id_customer bigint,
    id_node bigint,
    channel character varying(50) NOT NULL,
    recipient_type character varying(50),
    recipient_value character varying(255),
    uid character varying(100),
    group_id character varying(100),
    account_id bigint,
    account_name character varying(255),
    message_text text,
    tracking_token character varying(120) NOT NULL,
    tracking_base_url text,
    tracking_metadata jsonb,
    click_count integer DEFAULT 0 NOT NULL,
    first_clicked_at timestamp without time zone,
    last_clicked_at timestamp without time zone,
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    is_preview boolean DEFAULT false NOT NULL,
    quota_reservation_id bigint,
    workspace_owner_id bigint,
    actor_user_id bigint
);


--
-- Name: zalo_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_messages_id_seq OWNED BY public.zalo_messages.id;


--
-- Name: zalo_personal_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_personal_conversations (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    id_zalo_setting bigint NOT NULL,
    external_id character varying(255),
    visitor_name character varying(255),
    visitor_info jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    ai_paused boolean DEFAULT false NOT NULL,
    ai_paused_at timestamp with time zone,
    id_chatbot bigint,
    session_reset_at timestamp with time zone
);


--
-- Name: zalo_personal_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_personal_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_personal_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_personal_conversations_id_seq OWNED BY public.zalo_personal_conversations.id;


--
-- Name: zalo_personal_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_personal_messages (
    id bigint NOT NULL,
    id_conversation bigint NOT NULL,
    id_user bigint NOT NULL,
    id_zalo_setting bigint NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    message_type character varying(20) DEFAULT 'text'::character varying,
    external_id character varying(255),
    external_ts timestamp with time zone,
    attachments jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    quota_reservation_id bigint
);


--
-- Name: zalo_personal_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_personal_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_personal_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_personal_messages_id_seq OWNED BY public.zalo_personal_messages.id;


--
-- Name: zalo_personal_sender_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_personal_sender_bindings (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    phone_normalized character varying(20) NOT NULL,
    id_zalo_account bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_campaign_run integer NOT NULL,
    error text,
    CONSTRAINT chk_zalo_sender_binding_account_xor_error CHECK ((((id_zalo_account IS NOT NULL) AND (error IS NULL)) OR ((id_zalo_account IS NULL) AND (error IS NOT NULL))))
);


--
-- Name: zalo_personal_sender_bindings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_personal_sender_bindings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_personal_sender_bindings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_personal_sender_bindings_id_seq OWNED BY public.zalo_personal_sender_bindings.id;


--
-- Name: zalo_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_settings (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    display_name character varying(255) NOT NULL,
    zalo_user_id character varying(100),
    login_method character varying(20) DEFAULT 'cookie'::character varying NOT NULL,
    cookie_text text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    notes text,
    last_connected_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    zalo_name character varying(255),
    zalo_phone character varying(30),
    zalo_personal_outbound_per_hour_limit integer,
    zalo_personal_outbound_delay_min_ms integer,
    zalo_personal_outbound_delay_max_ms integer,
    restore_fail_count integer DEFAULT 0 NOT NULL,
    first_restore_fail_at timestamp with time zone,
    last_restore_attempt_at timestamp with time zone,
    phone_lookup_cooldown_until timestamp with time zone,
    user_daily_send_limit integer,
    auto_accept_friend_requests boolean DEFAULT false NOT NULL
);


--
-- Name: zalo_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_settings_id_seq OWNED BY public.zalo_settings.id;


--
-- Name: zalo_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_templates (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    template_name character varying(255) NOT NULL,
    template_code character varying(100),
    subject character varying(500) NOT NULL,
    body_html text,
    body_text text,
    variables jsonb DEFAULT '[]'::jsonb,
    category character varying(100),
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    attachments jsonb DEFAULT '[]'::jsonb
);


--
-- Name: zalo_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_templates_id_seq OWNED BY public.zalo_templates.id;


--
-- Name: zalo_unreachable_phones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zalo_unreachable_phones (
    id bigint NOT NULL,
    id_user bigint NOT NULL,
    phone_normalized character varying(20) NOT NULL,
    reason character varying(50) DEFAULT 'not_found'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: zalo_unreachable_phones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zalo_unreachable_phones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zalo_unreachable_phones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zalo_unreachable_phones_id_seq OWNED BY public.zalo_unreachable_phones.id;


--
-- Name: affiliate_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_ledger ALTER COLUMN id SET DEFAULT nextval('public.affiliate_ledger_id_seq'::regclass);


--
-- Name: affiliate_periods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_periods ALTER COLUMN id SET DEFAULT nextval('public.affiliate_periods_id_seq'::regclass);


--
-- Name: affiliate_revenue_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_revenue_events ALTER COLUMN id SET DEFAULT nextval('public.affiliate_revenue_events_id_seq'::regclass);


--
-- Name: affiliate_withdrawals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_withdrawals ALTER COLUMN id SET DEFAULT nextval('public.affiliate_withdrawals_id_seq'::regclass);


--
-- Name: ai_activity_summaries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_activity_summaries ALTER COLUMN id SET DEFAULT nextval('public.ai_activity_summaries_id_seq'::regclass);


--
-- Name: ai_call_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_call_events ALTER COLUMN id SET DEFAULT nextval('public.ai_call_events_id_seq'::regclass);


--
-- Name: ai_chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.ai_chat_messages_id_seq'::regclass);


--
-- Name: ai_chat_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_sessions ALTER COLUMN id SET DEFAULT nextval('public.ai_chat_sessions_id_seq'::regclass);


--
-- Name: alert_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_events ALTER COLUMN id SET DEFAULT nextval('public.alert_events_id_seq'::regclass);


--
-- Name: alert_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_rules ALTER COLUMN id SET DEFAULT nextval('public.alert_rules_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: business_profile_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profile_chunks ALTER COLUMN id SET DEFAULT nextval('public.business_profile_chunks_id_seq'::regclass);


--
-- Name: business_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profiles ALTER COLUMN id SET DEFAULT nextval('public.business_profiles_id_seq'::regclass);


--
-- Name: campaign_channel_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_channel_messages ALTER COLUMN id SET DEFAULT nextval('public.campaign_channel_messages_id_seq'::regclass);


--
-- Name: campaign_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_connections ALTER COLUMN id SET DEFAULT nextval('public.campaign_connections_id_seq'::regclass);


--
-- Name: campaign_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_executions ALTER COLUMN id SET DEFAULT nextval('public.campaign_executions_id_seq'::regclass);


--
-- Name: campaign_nodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_nodes ALTER COLUMN id SET DEFAULT nextval('public.campaign_nodes_id_seq'::regclass);


--
-- Name: campaign_run_recipient_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_run_recipient_steps ALTER COLUMN id SET DEFAULT nextval('public.campaign_run_recipient_steps_id_seq'::regclass);


--
-- Name: campaign_run_recipient_steps_backup_182 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_run_recipient_steps_backup_182 ALTER COLUMN id SET DEFAULT nextval('public.campaign_run_recipient_steps_backup_182_id_seq'::regclass);


--
-- Name: campaign_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_runs ALTER COLUMN id SET DEFAULT nextval('public.campaign_runs_id_seq'::regclass);


--
-- Name: campaign_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_schedules ALTER COLUMN id SET DEFAULT nextval('public.campaign_schedules_id_seq'::regclass);


--
-- Name: campaign_shares id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_shares ALTER COLUMN id SET DEFAULT nextval('public.campaign_shares_id_seq'::regclass);


--
-- Name: campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns ALTER COLUMN id SET DEFAULT nextval('public.campaigns_id_seq'::regclass);


--
-- Name: channel_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections ALTER COLUMN id SET DEFAULT nextval('public.channel_connections_id_seq'::regclass);


--
-- Name: channel_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_conversations ALTER COLUMN id SET DEFAULT nextval('public.channel_conversations_id_seq'::regclass);


--
-- Name: channel_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_messages ALTER COLUMN id SET DEFAULT nextval('public.channel_messages_id_seq'::regclass);


--
-- Name: chat_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments ALTER COLUMN id SET DEFAULT nextval('public.chat_attachments_id_seq'::regclass);


--
-- Name: chatbot_channel_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_channel_connections ALTER COLUMN id SET DEFAULT nextval('public.chatbot_channel_connections_id_seq'::regclass);


--
-- Name: chatbot_contact_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_contact_alerts ALTER COLUMN id SET DEFAULT nextval('public.chatbot_contact_alerts_id_seq'::regclass);


--
-- Name: chatbot_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations ALTER COLUMN id SET DEFAULT nextval('public.chatbot_conversations_id_seq'::regclass);


--
-- Name: chatbot_digest_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_digest_log ALTER COLUMN id SET DEFAULT nextval('public.chatbot_digest_log_id_seq'::regclass);


--
-- Name: chatbot_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages ALTER COLUMN id SET DEFAULT nextval('public.chatbot_messages_id_seq'::regclass);


--
-- Name: chatbot_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings ALTER COLUMN id SET DEFAULT nextval('public.chatbot_settings_id_seq'::regclass);


--
-- Name: chatbot_shares id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_shares ALTER COLUMN id SET DEFAULT nextval('public.chatbot_shares_id_seq'::regclass);


--
-- Name: chatbot_whatsapp_account_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_account_settings ALTER COLUMN id SET DEFAULT nextval('public.chatbot_whatsapp_account_settings_id_seq'::regclass);


--
-- Name: chatbot_whatsapp_baileys_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_baileys_settings ALTER COLUMN id SET DEFAULT nextval('public.chatbot_whatsapp_baileys_settings_id_seq'::regclass);


--
-- Name: chatbot_zalo_account_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_zalo_account_settings ALTER COLUMN id SET DEFAULT nextval('public.chatbot_zalo_account_settings_id_seq'::regclass);


--
-- Name: contact_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_submissions ALTER COLUMN id SET DEFAULT nextval('public.contact_submissions_id_seq'::regclass);


--
-- Name: course_relations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_relations ALTER COLUMN id SET DEFAULT nextval('public.course_relations_id_seq'::regclass);


--
-- Name: courses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses ALTER COLUMN id SET DEFAULT nextval('public.courses_id_seq'::regclass);


--
-- Name: cron_job_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_job_runs ALTER COLUMN id SET DEFAULT nextval('public.cron_job_runs_id_seq'::regclass);


--
-- Name: custom_chatbot_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbot_chunks ALTER COLUMN id SET DEFAULT nextval('public.custom_chatbot_chunks_id_seq'::regclass);


--
-- Name: custom_chatbot_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbot_documents ALTER COLUMN id SET DEFAULT nextval('public.custom_chatbot_documents_id_seq'::regclass);


--
-- Name: custom_chatbots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbots ALTER COLUMN id SET DEFAULT nextval('public.custom_chatbots_id_seq'::regclass);


--
-- Name: custom_domain_ssl id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domain_ssl ALTER COLUMN id SET DEFAULT nextval('public.custom_domain_ssl_id_seq'::regclass);


--
-- Name: custom_domain_verifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domain_verifications ALTER COLUMN id SET DEFAULT nextval('public.custom_domain_verifications_id_seq'::regclass);


--
-- Name: custom_domains id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domains ALTER COLUMN id SET DEFAULT nextval('public.custom_domains_id_seq'::regclass);


--
-- Name: custom_plan_pricing id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_plan_pricing ALTER COLUMN id SET DEFAULT nextval('public.custom_plan_pricing_id_seq'::regclass);


--
-- Name: customer_journey id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey ALTER COLUMN id SET DEFAULT nextval('public.customer_journey_id_seq'::regclass);


--
-- Name: customer_purchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_purchases ALTER COLUMN id SET DEFAULT nextval('public.customer_purchases_id_seq'::regclass);


--
-- Name: customer_tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags ALTER COLUMN id SET DEFAULT nextval('public.customer_tags_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: dashboard_insights id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_insights ALTER COLUMN id SET DEFAULT nextval('public.dashboard_insights_id_seq'::regclass);


--
-- Name: diagnostic_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostic_messages ALTER COLUMN id SET DEFAULT nextval('public.diagnostic_messages_id_seq'::regclass);


--
-- Name: diagnostic_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostic_runs ALTER COLUMN id SET DEFAULT nextval('public.diagnostic_runs_id_seq'::regclass);


--
-- Name: einvoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.einvoices ALTER COLUMN id SET DEFAULT nextval('public.einvoices_id_seq'::regclass);


--
-- Name: email_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages ALTER COLUMN id SET DEFAULT nextval('public.email_messages_id_seq'::regclass);


--
-- Name: email_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_settings ALTER COLUMN id SET DEFAULT nextval('public.email_settings_id_seq'::regclass);


--
-- Name: email_suppressions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions ALTER COLUMN id SET DEFAULT nextval('public.email_suppressions_id_seq'::regclass);


--
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);


--
-- Name: facebook_token_tracking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_token_tracking ALTER COLUMN id SET DEFAULT nextval('public.facebook_token_tracking_id_seq'::regclass);


--
-- Name: form_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions ALTER COLUMN id SET DEFAULT nextval('public.form_submissions_id_seq'::regclass);


--
-- Name: forms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms ALTER COLUMN id SET DEFAULT nextval('public.forms_id_seq'::regclass);


--
-- Name: help_article_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_chunks ALTER COLUMN id SET DEFAULT nextval('public.help_article_chunks_id_seq'::regclass);


--
-- Name: help_article_media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_media ALTER COLUMN id SET DEFAULT nextval('public.help_article_media_id_seq'::regclass);


--
-- Name: help_articles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_articles ALTER COLUMN id SET DEFAULT nextval('public.help_articles_id_seq'::regclass);


--
-- Name: help_unanswered id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_unanswered ALTER COLUMN id SET DEFAULT nextval('public.help_unanswered_id_seq'::regclass);


--
-- Name: kb_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks ALTER COLUMN id SET DEFAULT nextval('public.kb_chunks_id_seq'::regclass);


--
-- Name: kb_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_documents ALTER COLUMN id SET DEFAULT nextval('public.kb_documents_id_seq'::regclass);


--
-- Name: knowledge_bases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_bases ALTER COLUMN id SET DEFAULT nextval('public.knowledge_bases_id_seq'::regclass);


--
-- Name: landing_featured_courses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_featured_courses ALTER COLUMN id SET DEFAULT nextval('public.landing_featured_courses_id_seq'::regclass);


--
-- Name: landing_page_domains id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_domains ALTER COLUMN id SET DEFAULT nextval('public.landing_page_domains_id_seq'::regclass);


--
-- Name: landing_page_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_events ALTER COLUMN id SET DEFAULT nextval('public.landing_page_events_id_seq'::regclass);


--
-- Name: landing_page_overrides id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_overrides ALTER COLUMN id SET DEFAULT nextval('public.landing_page_overrides_id_seq'::regclass);


--
-- Name: landing_page_sections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_sections ALTER COLUMN id SET DEFAULT nextval('public.landing_page_sections_id_seq'::regclass);


--
-- Name: landing_page_shares id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_shares ALTER COLUMN id SET DEFAULT nextval('public.landing_page_shares_id_seq'::regclass);


--
-- Name: landing_page_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_templates ALTER COLUMN id SET DEFAULT nextval('public.landing_page_templates_id_seq'::regclass);


--
-- Name: landing_page_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_versions ALTER COLUMN id SET DEFAULT nextval('public.landing_page_versions_id_seq'::regclass);


--
-- Name: landing_pages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages ALTER COLUMN id SET DEFAULT nextval('public.landing_pages_id_seq'::regclass);


--
-- Name: landing_testimonials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_testimonials ALTER COLUMN id SET DEFAULT nextval('public.landing_testimonials_id_seq'::regclass);


--
-- Name: leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads ALTER COLUMN id SET DEFAULT nextval('public.leads_id_seq'::regclass);


--
-- Name: login_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history ALTER COLUMN id SET DEFAULT nextval('public.login_history_id_seq'::regclass);


--
-- Name: marketplace_listings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_listings ALTER COLUMN id SET DEFAULT nextval('public.marketplace_listings_id_seq'::regclass);


--
-- Name: marketplace_payout_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_payout_requests ALTER COLUMN id SET DEFAULT nextval('public.marketplace_payout_requests_id_seq'::regclass);


--
-- Name: marketplace_purchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_purchases ALTER COLUMN id SET DEFAULT nextval('public.marketplace_purchases_id_seq'::regclass);


--
-- Name: marketplace_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_reviews ALTER COLUMN id SET DEFAULT nextval('public.marketplace_reviews_id_seq'::regclass);


--
-- Name: member_channel_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_channel_accounts ALTER COLUMN id SET DEFAULT nextval('public.member_channel_accounts_id_seq'::regclass);


--
-- Name: notification_email_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_logs ALTER COLUMN id SET DEFAULT nextval('public.notification_email_logs_id_seq'::regclass);


--
-- Name: notification_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates ALTER COLUMN id SET DEFAULT nextval('public.notification_templates_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans ALTER COLUMN id SET DEFAULT nextval('public.plans_id_seq'::regclass);


--
-- Name: product_chat_mentions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_chat_mentions ALTER COLUMN id SET DEFAULT nextval('public.product_chat_mentions_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: scheduled_plan_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_plan_changes ALTER COLUMN id SET DEFAULT nextval('public.scheduled_plan_changes_id_seq'::regclass);


--
-- Name: send_quota_reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_reservations ALTER COLUMN id SET DEFAULT nextval('public.send_quota_reservations_id_seq'::regclass);


--
-- Name: send_quota_shadow_mismatches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_shadow_mismatches ALTER COLUMN id SET DEFAULT nextval('public.send_quota_shadow_mismatches_id_seq'::regclass);


--
-- Name: storage_objects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_objects ALTER COLUMN id SET DEFAULT nextval('public.storage_objects_id_seq'::regclass);


--
-- Name: sub_assistants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_assistants ALTER COLUMN id SET DEFAULT nextval('public.sub_assistants_id_seq'::regclass);


--
-- Name: support_ticket_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages ALTER COLUMN id SET DEFAULT nextval('public.support_ticket_messages_id_seq'::regclass);


--
-- Name: support_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets ALTER COLUMN id SET DEFAULT nextval('public.support_tickets_id_seq'::regclass);


--
-- Name: system_payment_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_payment_accounts ALTER COLUMN id SET DEFAULT nextval('public.system_payment_accounts_id_seq'::regclass);


--
-- Name: telegram_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts ALTER COLUMN id SET DEFAULT nextval('public.telegram_accounts_id_seq'::regclass);


--
-- Name: telegram_chatbot_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_chatbot_settings ALTER COLUMN id SET DEFAULT nextval('public.telegram_chatbot_settings_id_seq'::regclass);


--
-- Name: telegram_personal_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_conversations ALTER COLUMN id SET DEFAULT nextval('public.telegram_personal_conversations_id_seq'::regclass);


--
-- Name: telegram_personal_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_messages ALTER COLUMN id SET DEFAULT nextval('public.telegram_personal_messages_id_seq'::regclass);


--
-- Name: template_labels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_labels ALTER COLUMN id SET DEFAULT nextval('public.template_labels_id_seq'::regclass);


--
-- Name: tiktok_business_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_business_accounts ALTER COLUMN id SET DEFAULT nextval('public.tiktok_business_accounts_id_seq'::regclass);


--
-- Name: tiktok_outbound_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_outbound_log ALTER COLUMN id SET DEFAULT nextval('public.tiktok_outbound_log_id_seq'::regclass);


--
-- Name: tiktok_scheduled_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_scheduled_posts ALTER COLUMN id SET DEFAULT nextval('public.tiktok_scheduled_posts_id_seq'::regclass);


--
-- Name: topup_debits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_debits ALTER COLUMN id SET DEFAULT nextval('public.topup_debits_id_seq'::regclass);


--
-- Name: topup_grants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_grants ALTER COLUMN id SET DEFAULT nextval('public.topup_grants_id_seq'::regclass);


--
-- Name: topup_locked_resources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_locked_resources ALTER COLUMN id SET DEFAULT nextval('public.topup_locked_resources_id_seq'::regclass);


--
-- Name: topup_pricing id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_pricing ALTER COLUMN id SET DEFAULT nextval('public.topup_pricing_id_seq'::regclass);


--
-- Name: tracking_short_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_short_links ALTER COLUMN id SET DEFAULT nextval('public.tracking_short_links_id_seq'::regclass);


--
-- Name: usage_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_logs ALTER COLUMN id SET DEFAULT nextval('public.usage_logs_id_seq'::regclass);


--
-- Name: user_consents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents ALTER COLUMN id SET DEFAULT nextval('public.user_consents_id_seq'::regclass);


--
-- Name: user_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_members ALTER COLUMN id SET DEFAULT nextval('public.user_members_id_seq'::regclass);


--
-- Name: user_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications ALTER COLUMN id SET DEFAULT nextval('public.user_notifications_id_seq'::regclass);


--
-- Name: user_whatsapp_app_credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_whatsapp_app_credentials ALTER COLUMN id SET DEFAULT nextval('public.user_whatsapp_app_credentials_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: voucher_redemptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions ALTER COLUMN id SET DEFAULT nextval('public.voucher_redemptions_id_seq'::regclass);


--
-- Name: vouchers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);


--
-- Name: web_widget_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_widget_configs ALTER COLUMN id SET DEFAULT nextval('public.web_widget_configs_id_seq'::regclass);


--
-- Name: webchat_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations ALTER COLUMN id SET DEFAULT nextval('public.webchat_conversations_id_seq'::regclass);


--
-- Name: webchat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages ALTER COLUMN id SET DEFAULT nextval('public.webchat_messages_id_seq'::regclass);


--
-- Name: whatsapp_account_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_account_settings ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_account_settings_id_seq'::regclass);


--
-- Name: zalo_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_accounts ALTER COLUMN id SET DEFAULT nextval('public.zalo_accounts_id_seq'::regclass);


--
-- Name: zalo_friends id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_friends ALTER COLUMN id SET DEFAULT nextval('public.zalo_friends_id_seq'::regclass);


--
-- Name: zalo_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_groups ALTER COLUMN id SET DEFAULT nextval('public.zalo_groups_id_seq'::regclass);


--
-- Name: zalo_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages ALTER COLUMN id SET DEFAULT nextval('public.zalo_messages_id_seq'::regclass);


--
-- Name: zalo_personal_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_conversations ALTER COLUMN id SET DEFAULT nextval('public.zalo_personal_conversations_id_seq'::regclass);


--
-- Name: zalo_personal_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_messages ALTER COLUMN id SET DEFAULT nextval('public.zalo_personal_messages_id_seq'::regclass);


--
-- Name: zalo_personal_sender_bindings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_sender_bindings ALTER COLUMN id SET DEFAULT nextval('public.zalo_personal_sender_bindings_id_seq'::regclass);


--
-- Name: zalo_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_settings ALTER COLUMN id SET DEFAULT nextval('public.zalo_settings_id_seq'::regclass);


--
-- Name: zalo_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_templates ALTER COLUMN id SET DEFAULT nextval('public.zalo_templates_id_seq'::regclass);


--
-- Name: zalo_unreachable_phones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_unreachable_phones ALTER COLUMN id SET DEFAULT nextval('public.zalo_unreachable_phones_id_seq'::regclass);


--
-- Name: admin_menu_layouts admin_menu_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_menu_layouts
    ADD CONSTRAINT admin_menu_layouts_pkey PRIMARY KEY (scope);


--
-- Name: affiliate_ledger affiliate_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_ledger
    ADD CONSTRAINT affiliate_ledger_pkey PRIMARY KEY (id);


--
-- Name: affiliate_periods affiliate_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_periods
    ADD CONSTRAINT affiliate_periods_pkey PRIMARY KEY (id);


--
-- Name: affiliate_periods affiliate_periods_referrer_user_id_month_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_periods
    ADD CONSTRAINT affiliate_periods_referrer_user_id_month_key_key UNIQUE (referrer_user_id, month_key);


--
-- Name: affiliate_revenue_events affiliate_revenue_events_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_revenue_events
    ADD CONSTRAINT affiliate_revenue_events_order_id_key UNIQUE (order_id);


--
-- Name: affiliate_revenue_events affiliate_revenue_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_revenue_events
    ADD CONSTRAINT affiliate_revenue_events_pkey PRIMARY KEY (id);


--
-- Name: affiliate_withdrawals affiliate_withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_withdrawals
    ADD CONSTRAINT affiliate_withdrawals_pkey PRIMARY KEY (id);


--
-- Name: ai_activity_summaries ai_activity_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_activity_summaries
    ADD CONSTRAINT ai_activity_summaries_pkey PRIMARY KEY (id);


--
-- Name: ai_call_events ai_call_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_call_events
    ADD CONSTRAINT ai_call_events_pkey PRIMARY KEY (id);


--
-- Name: ai_chat_messages ai_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_messages
    ADD CONSTRAINT ai_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: ai_chat_sessions ai_chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_sessions
    ADD CONSTRAINT ai_chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: ai_models ai_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_pkey PRIMARY KEY (model_id);


--
-- Name: ai_unavailable_notices ai_unavailable_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_unavailable_notices
    ADD CONSTRAINT ai_unavailable_notices_pkey PRIMARY KEY (id_user, kind, notice_key);


--
-- Name: alert_events alert_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_pkey PRIMARY KEY (id);


--
-- Name: alert_rules alert_rules_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_code_key UNIQUE (code);


--
-- Name: alert_rules alert_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: business_profile_chunks business_profile_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profile_chunks
    ADD CONSTRAINT business_profile_chunks_pkey PRIMARY KEY (id);


--
-- Name: business_profiles business_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profiles
    ADD CONSTRAINT business_profiles_pkey PRIMARY KEY (id);


--
-- Name: campaign_channel_messages campaign_channel_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_channel_messages
    ADD CONSTRAINT campaign_channel_messages_pkey PRIMARY KEY (id);


--
-- Name: campaign_connections campaign_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_connections
    ADD CONSTRAINT campaign_connections_pkey PRIMARY KEY (id);


--
-- Name: campaign_customers campaign_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_customers
    ADD CONSTRAINT campaign_customers_pkey PRIMARY KEY (id_campaign, id_customer);


--
-- Name: campaign_executions campaign_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_executions
    ADD CONSTRAINT campaign_executions_pkey PRIMARY KEY (id);


--
-- Name: campaign_nodes campaign_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_nodes
    ADD CONSTRAINT campaign_nodes_pkey PRIMARY KEY (id);


--
-- Name: campaign_participations campaign_participations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_participations
    ADD CONSTRAINT campaign_participations_pkey PRIMARY KEY (id_customer, id_campaign);


--
-- Name: campaign_run_recipient_steps_backup_182 campaign_run_recipient_steps_backup_182_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_run_recipient_steps_backup_182
    ADD CONSTRAINT campaign_run_recipient_steps_backup_182_pkey PRIMARY KEY (id);


--
-- Name: campaign_run_recipient_steps campaign_run_recipient_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_run_recipient_steps
    ADD CONSTRAINT campaign_run_recipient_steps_pkey PRIMARY KEY (id);


--
-- Name: campaign_runs campaign_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_runs
    ADD CONSTRAINT campaign_runs_pkey PRIMARY KEY (id);


--
-- Name: campaign_schedules campaign_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_schedules
    ADD CONSTRAINT campaign_schedules_pkey PRIMARY KEY (id);


--
-- Name: campaign_shares campaign_shares_id_campaign_id_recipient_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_shares
    ADD CONSTRAINT campaign_shares_id_campaign_id_recipient_key UNIQUE (id_campaign, id_recipient);


--
-- Name: campaign_shares campaign_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_shares
    ADD CONSTRAINT campaign_shares_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: channel_connections channel_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT channel_connections_pkey PRIMARY KEY (id);


--
-- Name: channel_connections channel_connections_webhook_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT channel_connections_webhook_token_key UNIQUE (webhook_token);


--
-- Name: channel_conversations channel_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_conversations
    ADD CONSTRAINT channel_conversations_pkey PRIMARY KEY (id);


--
-- Name: channel_disconnect_alerts channel_disconnect_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_disconnect_alerts
    ADD CONSTRAINT channel_disconnect_alerts_pkey PRIMARY KEY (channel, account_ref);


--
-- Name: channel_messages channel_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_messages
    ADD CONSTRAINT channel_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_attachments chat_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_pkey PRIMARY KEY (id);


--
-- Name: chat_attachments chat_attachments_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_storage_key_key UNIQUE (storage_key);


--
-- Name: chatbot_channel_connections chatbot_channel_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_channel_connections
    ADD CONSTRAINT chatbot_channel_connections_pkey PRIMARY KEY (id);


--
-- Name: chatbot_channel_connections chatbot_channel_connections_webhook_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_channel_connections
    ADD CONSTRAINT chatbot_channel_connections_webhook_token_key UNIQUE (webhook_token);


--
-- Name: chatbot_contact_alerts chatbot_contact_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_contact_alerts
    ADD CONSTRAINT chatbot_contact_alerts_pkey PRIMARY KEY (id);


--
-- Name: chatbot_contact_scan_cursors chatbot_contact_scan_cursors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_contact_scan_cursors
    ADD CONSTRAINT chatbot_contact_scan_cursors_pkey PRIMARY KEY (source);


--
-- Name: chatbot_conversations chatbot_conversations_id_channel_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_id_channel_external_id_key UNIQUE (id_channel, external_id);


--
-- Name: chatbot_conversations chatbot_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_pkey PRIMARY KEY (id);


--
-- Name: chatbot_digest_log chatbot_digest_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_digest_log
    ADD CONSTRAINT chatbot_digest_log_pkey PRIMARY KEY (id);


--
-- Name: chatbot_messages chatbot_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id);


--
-- Name: chatbot_settings chatbot_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings
    ADD CONSTRAINT chatbot_settings_pkey PRIMARY KEY (id);


--
-- Name: chatbot_shares chatbot_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_shares
    ADD CONSTRAINT chatbot_shares_pkey PRIMARY KEY (id);


--
-- Name: chatbot_studio_conversations chatbot_studio_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_studio_conversations
    ADD CONSTRAINT chatbot_studio_conversations_pkey PRIMARY KEY (id);


--
-- Name: chatbot_studio_conversations chatbot_studio_conversations_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_studio_conversations
    ADD CONSTRAINT chatbot_studio_conversations_session_id_key UNIQUE (session_id);


--
-- Name: chatbot_studio_messages chatbot_studio_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_studio_messages
    ADD CONSTRAINT chatbot_studio_messages_pkey PRIMARY KEY (id);


--
-- Name: chatbot_whatsapp_account_settings chatbot_whatsapp_account_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_account_settings
    ADD CONSTRAINT chatbot_whatsapp_account_settings_pkey PRIMARY KEY (id);


--
-- Name: chatbot_whatsapp_baileys_settings chatbot_whatsapp_baileys_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_baileys_settings
    ADD CONSTRAINT chatbot_whatsapp_baileys_settings_pkey PRIMARY KEY (id);


--
-- Name: chatbot_zalo_account_settings chatbot_zalo_account_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_zalo_account_settings
    ADD CONSTRAINT chatbot_zalo_account_settings_pkey PRIMARY KEY (id);


--
-- Name: contact_submissions contact_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_submissions
    ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);


--
-- Name: course_relations course_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_relations
    ADD CONSTRAINT course_relations_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: cron_job_runs cron_job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_job_runs
    ADD CONSTRAINT cron_job_runs_pkey PRIMARY KEY (id);


--
-- Name: custom_chatbot_chunks custom_chatbot_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbot_chunks
    ADD CONSTRAINT custom_chatbot_chunks_pkey PRIMARY KEY (id);


--
-- Name: custom_chatbot_documents custom_chatbot_documents_chatbot_id_source_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbot_documents
    ADD CONSTRAINT custom_chatbot_documents_chatbot_id_source_key_key UNIQUE (chatbot_id, source_key);


--
-- Name: custom_chatbot_documents custom_chatbot_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbot_documents
    ADD CONSTRAINT custom_chatbot_documents_pkey PRIMARY KEY (id);


--
-- Name: custom_chatbots custom_chatbots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbots
    ADD CONSTRAINT custom_chatbots_pkey PRIMARY KEY (id);


--
-- Name: custom_chatbots custom_chatbots_widget_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbots
    ADD CONSTRAINT custom_chatbots_widget_key_key UNIQUE (widget_key);


--
-- Name: custom_domain_ssl custom_domain_ssl_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domain_ssl
    ADD CONSTRAINT custom_domain_ssl_pkey PRIMARY KEY (id);


--
-- Name: custom_domain_verifications custom_domain_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domain_verifications
    ADD CONSTRAINT custom_domain_verifications_pkey PRIMARY KEY (id);


--
-- Name: custom_domains custom_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_pkey PRIMARY KEY (id);


--
-- Name: custom_plan_pricing custom_plan_pricing_item_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_plan_pricing
    ADD CONSTRAINT custom_plan_pricing_item_key_key UNIQUE (item_key);


--
-- Name: custom_plan_pricing custom_plan_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_plan_pricing
    ADD CONSTRAINT custom_plan_pricing_pkey PRIMARY KEY (id);


--
-- Name: customer_journey customer_journey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey
    ADD CONSTRAINT customer_journey_pkey PRIMARY KEY (id);


--
-- Name: customer_purchases customer_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_purchases
    ADD CONSTRAINT customer_purchases_pkey PRIMARY KEY (id);


--
-- Name: customer_tag_assignments customer_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tag_assignments
    ADD CONSTRAINT customer_tag_assignments_pkey PRIMARY KEY (customer_id, tag_id);


--
-- Name: customer_tags customer_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: dashboard_insights dashboard_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_insights
    ADD CONSTRAINT dashboard_insights_pkey PRIMARY KEY (id);


--
-- Name: diagnostic_messages diagnostic_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostic_messages
    ADD CONSTRAINT diagnostic_messages_pkey PRIMARY KEY (id);


--
-- Name: diagnostic_runs diagnostic_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostic_runs
    ADD CONSTRAINT diagnostic_runs_pkey PRIMARY KEY (id);


--
-- Name: einvoices einvoices_ma_tra_cuu_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.einvoices
    ADD CONSTRAINT einvoices_ma_tra_cuu_key UNIQUE (ma_tra_cuu);


--
-- Name: einvoices einvoices_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.einvoices
    ADD CONSTRAINT einvoices_order_id_key UNIQUE (order_id);


--
-- Name: einvoices einvoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.einvoices
    ADD CONSTRAINT einvoices_pkey PRIMARY KEY (id);


--
-- Name: email_messages email_messages_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_message_id_key UNIQUE (message_id);


--
-- Name: email_messages email_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);


--
-- Name: email_settings email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_pkey PRIMARY KEY (id);


--
-- Name: email_suppressions email_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_pkey PRIMARY KEY (id);


--
-- Name: email_suppressions email_suppressions_workspace_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_workspace_email_key UNIQUE (workspace_owner_id, email_lower);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: facebook_token_tracking facebook_token_tracking_channel_connection_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_token_tracking
    ADD CONSTRAINT facebook_token_tracking_channel_connection_id_key UNIQUE (channel_connection_id);


--
-- Name: facebook_token_tracking facebook_token_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_token_tracking
    ADD CONSTRAINT facebook_token_tracking_pkey PRIMARY KEY (id);


--
-- Name: file_access_events file_access_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_events
    ADD CONSTRAINT file_access_events_pkey PRIMARY KEY (id);


--
-- Name: file_download_events file_download_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_download_events
    ADD CONSTRAINT file_download_events_pkey PRIMARY KEY (id);


--
-- Name: form_file_uploads form_file_uploads_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_file_uploads
    ADD CONSTRAINT form_file_uploads_object_key_key UNIQUE (object_key);


--
-- Name: form_file_uploads form_file_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_file_uploads
    ADD CONSTRAINT form_file_uploads_pkey PRIMARY KEY (id);


--
-- Name: form_submissions form_submissions_access_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_access_token_key UNIQUE (access_token);


--
-- Name: form_submissions form_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);


--
-- Name: form_submissions form_submissions_unsubscribe_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_unsubscribe_token_unique UNIQUE (unsubscribe_token);


--
-- Name: forms forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_pkey PRIMARY KEY (id);


--
-- Name: forms forms_public_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_public_key_key UNIQUE (public_key);


--
-- Name: help_article_chunks help_article_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_chunks
    ADD CONSTRAINT help_article_chunks_pkey PRIMARY KEY (id);


--
-- Name: help_article_chunks help_article_chunks_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_chunks
    ADD CONSTRAINT help_article_chunks_unique UNIQUE (article_id, chunk_index);


--
-- Name: help_article_media help_article_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_media
    ADD CONSTRAINT help_article_media_pkey PRIMARY KEY (id);


--
-- Name: help_articles help_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_articles
    ADD CONSTRAINT help_articles_pkey PRIMARY KEY (id);


--
-- Name: help_articles help_articles_slug_locale_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_articles
    ADD CONSTRAINT help_articles_slug_locale_key UNIQUE (slug, locale);


--
-- Name: help_unanswered help_unanswered_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_unanswered
    ADD CONSTRAINT help_unanswered_pkey PRIMARY KEY (id);


--
-- Name: kb_chunks kb_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks
    ADD CONSTRAINT kb_chunks_pkey PRIMARY KEY (id);


--
-- Name: kb_documents kb_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_documents
    ADD CONSTRAINT kb_documents_pkey PRIMARY KEY (id);


--
-- Name: knowledge_bases knowledge_bases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_bases
    ADD CONSTRAINT knowledge_bases_pkey PRIMARY KEY (id);


--
-- Name: landing_featured_courses landing_featured_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_featured_courses
    ADD CONSTRAINT landing_featured_courses_pkey PRIMARY KEY (id);


--
-- Name: landing_page_domains landing_page_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_domains
    ADD CONSTRAINT landing_page_domains_pkey PRIMARY KEY (id);


--
-- Name: landing_page_events landing_page_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_events
    ADD CONSTRAINT landing_page_events_pkey PRIMARY KEY (id);


--
-- Name: landing_page_forms landing_page_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_forms
    ADD CONSTRAINT landing_page_forms_pkey PRIMARY KEY (landing_page_id, form_id);


--
-- Name: landing_page_overrides landing_page_overrides_page_section_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_overrides
    ADD CONSTRAINT landing_page_overrides_page_section_key_key UNIQUE (page, section, key);


--
-- Name: landing_page_overrides landing_page_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_overrides
    ADD CONSTRAINT landing_page_overrides_pkey PRIMARY KEY (id);


--
-- Name: landing_page_sections landing_page_sections_page_section_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_sections
    ADD CONSTRAINT landing_page_sections_page_section_key UNIQUE (page, section);


--
-- Name: landing_page_sections landing_page_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_sections
    ADD CONSTRAINT landing_page_sections_pkey PRIMARY KEY (id);


--
-- Name: landing_page_shares landing_page_shares_id_landing_page_id_recipient_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_shares
    ADD CONSTRAINT landing_page_shares_id_landing_page_id_recipient_key UNIQUE (id_landing_page, id_recipient);


--
-- Name: landing_page_shares landing_page_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_shares
    ADD CONSTRAINT landing_page_shares_pkey PRIMARY KEY (id);


--
-- Name: landing_page_templates landing_page_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_templates
    ADD CONSTRAINT landing_page_templates_pkey PRIMARY KEY (id);


--
-- Name: landing_page_versions landing_page_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_versions
    ADD CONSTRAINT landing_page_versions_pkey PRIMARY KEY (id);


--
-- Name: landing_pages landing_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_pkey PRIMARY KEY (id);


--
-- Name: landing_pages landing_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_slug_key UNIQUE (slug);


--
-- Name: landing_testimonials landing_testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_testimonials
    ADD CONSTRAINT landing_testimonials_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: leads leads_unsubscribe_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_unsubscribe_token_unique UNIQUE (unsubscribe_token);


--
-- Name: login_history login_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_pkey PRIMARY KEY (id);


--
-- Name: marketplace_favorites marketplace_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_favorites
    ADD CONSTRAINT marketplace_favorites_pkey PRIMARY KEY (id_user, listing_id);


--
-- Name: marketplace_listings marketplace_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_listings
    ADD CONSTRAINT marketplace_listings_pkey PRIMARY KEY (id);


--
-- Name: marketplace_payout_requests marketplace_payout_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_payout_requests
    ADD CONSTRAINT marketplace_payout_requests_pkey PRIMARY KEY (id);


--
-- Name: marketplace_purchases marketplace_purchases_id_user_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_purchases
    ADD CONSTRAINT marketplace_purchases_id_user_listing_id_key UNIQUE (id_user, listing_id);


--
-- Name: marketplace_purchases marketplace_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_purchases
    ADD CONSTRAINT marketplace_purchases_pkey PRIMARY KEY (id);


--
-- Name: marketplace_reviews marketplace_reviews_id_user_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_reviews
    ADD CONSTRAINT marketplace_reviews_id_user_listing_id_key UNIQUE (id_user, listing_id);


--
-- Name: marketplace_reviews marketplace_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_reviews
    ADD CONSTRAINT marketplace_reviews_pkey PRIMARY KEY (id);


--
-- Name: marketplace_seller_stats marketplace_seller_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_seller_stats
    ADD CONSTRAINT marketplace_seller_stats_pkey PRIMARY KEY (id_user);


--
-- Name: member_channel_accounts member_channel_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_channel_accounts
    ADD CONSTRAINT member_channel_accounts_pkey PRIMARY KEY (id);


--
-- Name: migration_runner_checkpoints migration_runner_checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_runner_checkpoints
    ADD CONSTRAINT migration_runner_checkpoints_pkey PRIMARY KEY (checkpoint);


--
-- Name: migration_runner_preflight_backups migration_runner_preflight_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_runner_preflight_backups
    ADD CONSTRAINT migration_runner_preflight_backups_pkey PRIMARY KEY (migration_filename);


--
-- Name: migration_runner_repair_results migration_runner_repair_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_runner_repair_results
    ADD CONSTRAINT migration_runner_repair_results_pkey PRIMARY KEY (migration_filename);


--
-- Name: notification_email_logs notification_email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_logs
    ADD CONSTRAINT notification_email_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_event_settings notification_event_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_event_settings
    ADD CONSTRAINT notification_event_settings_pkey PRIMARY KEY (event_type);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id, event_type);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_slug_unique UNIQUE (type_key, slug);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_code_key UNIQUE (order_code);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: plans plans_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_code_unique UNIQUE (code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: product_chat_mentions product_chat_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_chat_mentions
    ADD CONSTRAINT product_chat_mentions_pkey PRIMARY KEY (id);


--
-- Name: product_mention_scan_cursors product_mention_scan_cursors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_mention_scan_cursors
    ADD CONSTRAINT product_mention_scan_cursors_pkey PRIMARY KEY (source);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_role_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_code_key UNIQUE (role_code);


--
-- Name: scheduled_plan_changes scheduled_plan_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_plan_changes
    ADD CONSTRAINT scheduled_plan_changes_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: send_quota_reservations send_quota_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_reservations
    ADD CONSTRAINT send_quota_reservations_pkey PRIMARY KEY (id);


--
-- Name: send_quota_reservations send_quota_reservations_reservation_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_reservations
    ADD CONSTRAINT send_quota_reservations_reservation_key_key UNIQUE (reservation_key);


--
-- Name: send_quota_shadow_daily send_quota_shadow_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_shadow_daily
    ADD CONSTRAINT send_quota_shadow_daily_pkey PRIMARY KEY (vn_day, channel);


--
-- Name: send_quota_shadow_mismatches send_quota_shadow_mismatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_shadow_mismatches
    ADD CONSTRAINT send_quota_shadow_mismatches_pkey PRIMARY KEY (id);


--
-- Name: storage_objects storage_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_objects
    ADD CONSTRAINT storage_objects_pkey PRIMARY KEY (id);


--
-- Name: storage_objects storage_objects_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_objects
    ADD CONSTRAINT storage_objects_storage_key_key UNIQUE (storage_key);


--
-- Name: storage_objects storage_objects_temp_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_objects
    ADD CONSTRAINT storage_objects_temp_key_key UNIQUE (temp_key);


--
-- Name: sub_assistants sub_assistants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_assistants
    ADD CONSTRAINT sub_assistants_pkey PRIMARY KEY (id);


--
-- Name: subscription_reminder_settings subscription_reminder_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_reminder_settings
    ADD CONSTRAINT subscription_reminder_settings_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_messages support_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_email_templates system_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_email_templates
    ADD CONSTRAINT system_email_templates_pkey PRIMARY KEY (template_key);


--
-- Name: system_payment_accounts system_payment_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_payment_accounts
    ADD CONSTRAINT system_payment_accounts_pkey PRIMARY KEY (id);


--
-- Name: telegram_accounts telegram_accounts_id_user_telegram_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_id_user_telegram_user_id_key UNIQUE (id_user, telegram_user_id);


--
-- Name: telegram_accounts telegram_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_pkey PRIMARY KEY (id);


--
-- Name: telegram_accounts telegram_accounts_telegram_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_telegram_user_id_key UNIQUE (telegram_user_id);


--
-- Name: telegram_chatbot_settings telegram_chatbot_settings_id_telegram_account_id_chatbot_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_chatbot_settings
    ADD CONSTRAINT telegram_chatbot_settings_id_telegram_account_id_chatbot_key UNIQUE (id_telegram_account, id_chatbot);


--
-- Name: telegram_chatbot_settings telegram_chatbot_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_chatbot_settings
    ADD CONSTRAINT telegram_chatbot_settings_pkey PRIMARY KEY (id);


--
-- Name: telegram_personal_conversations telegram_personal_conversatio_id_telegram_account_external__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_conversations
    ADD CONSTRAINT telegram_personal_conversatio_id_telegram_account_external__key UNIQUE (id_telegram_account, external_id, status);


--
-- Name: telegram_personal_conversations telegram_personal_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_conversations
    ADD CONSTRAINT telegram_personal_conversations_pkey PRIMARY KEY (id);


--
-- Name: telegram_personal_messages telegram_personal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_messages
    ADD CONSTRAINT telegram_personal_messages_pkey PRIMARY KEY (id);


--
-- Name: telegram_session_state telegram_session_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_session_state
    ADD CONSTRAINT telegram_session_state_pkey PRIMARY KEY (telegram_user_id);


--
-- Name: template_files template_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_files
    ADD CONSTRAINT template_files_pkey PRIMARY KEY (id);


--
-- Name: template_files template_files_storage_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_files
    ADD CONSTRAINT template_files_storage_key_unique UNIQUE (storage_key);


--
-- Name: template_labels template_labels_name_workspace_owner_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_labels
    ADD CONSTRAINT template_labels_name_workspace_owner_key UNIQUE (name, workspace_owner_id);


--
-- Name: template_labels template_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_labels
    ADD CONSTRAINT template_labels_pkey PRIMARY KEY (id);


--
-- Name: tiktok_business_accounts tiktok_business_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_business_accounts
    ADD CONSTRAINT tiktok_business_accounts_pkey PRIMARY KEY (id);


--
-- Name: tiktok_outbound_log tiktok_outbound_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_outbound_log
    ADD CONSTRAINT tiktok_outbound_log_pkey PRIMARY KEY (id);


--
-- Name: tiktok_scheduled_posts tiktok_scheduled_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_scheduled_posts
    ADD CONSTRAINT tiktok_scheduled_posts_pkey PRIMARY KEY (id);


--
-- Name: topup_debits topup_debits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_debits
    ADD CONSTRAINT topup_debits_pkey PRIMARY KEY (id);


--
-- Name: topup_debits topup_debits_source_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_debits
    ADD CONSTRAINT topup_debits_source_unique UNIQUE (item_key, source_key);


--
-- Name: topup_grants topup_grants_order_item_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_grants
    ADD CONSTRAINT topup_grants_order_item_unique UNIQUE (order_id, item_key);


--
-- Name: topup_grants topup_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_grants
    ADD CONSTRAINT topup_grants_pkey PRIMARY KEY (id);


--
-- Name: topup_locked_resources topup_locked_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_locked_resources
    ADD CONSTRAINT topup_locked_resources_pkey PRIMARY KEY (id);


--
-- Name: topup_locked_resources topup_locked_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_locked_resources
    ADD CONSTRAINT topup_locked_unique UNIQUE (resource_key, resource_id);


--
-- Name: topup_pricing topup_pricing_item_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_pricing
    ADD CONSTRAINT topup_pricing_item_key_key UNIQUE (item_key);


--
-- Name: topup_pricing topup_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_pricing
    ADD CONSTRAINT topup_pricing_pkey PRIMARY KEY (id);


--
-- Name: tracking_short_links tracking_short_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_short_links
    ADD CONSTRAINT tracking_short_links_pkey PRIMARY KEY (id);


--
-- Name: course_relations uk_course_relation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_relations
    ADD CONSTRAINT uk_course_relation UNIQUE (id_course, id_related_course);


--
-- Name: ai_activity_summaries uniq_ai_activity_user_day; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_activity_summaries
    ADD CONSTRAINT uniq_ai_activity_user_day UNIQUE (id_user, day_key);


--
-- Name: custom_domains unique_user_domain; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT unique_user_domain UNIQUE (user_id, domain);


--
-- Name: business_profiles uq_business_profile_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profiles
    ADD CONSTRAINT uq_business_profile_user UNIQUE (user_id);


--
-- Name: campaign_run_recipient_steps uq_campaign_run_recipient_steps; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_run_recipient_steps
    ADD CONSTRAINT uq_campaign_run_recipient_steps UNIQUE (id_run, id_node, channel, recipient_key);


--
-- Name: channel_conversations uq_channel_external_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_conversations
    ADD CONSTRAINT uq_channel_external_id UNIQUE (id_channel, external_id);


--
-- Name: channel_connections uq_channel_user_channel_fb_page; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT uq_channel_user_channel_fb_page UNIQUE (id_user, channel, fb_page_id);


--
-- Name: chatbot_contact_alerts uq_chatbot_contact_alert; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_contact_alerts
    ADD CONSTRAINT uq_chatbot_contact_alert UNIQUE (id_user, contact_type, contact_value);


--
-- Name: chatbot_digest_log uq_chatbot_digest_user_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_digest_log
    ADD CONSTRAINT uq_chatbot_digest_user_period UNIQUE (id_user, period_key);


--
-- Name: chatbot_settings uq_chatbot_user_channel; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings
    ADD CONSTRAINT uq_chatbot_user_channel UNIQUE (id_user, channel);


--
-- Name: chatbot_whatsapp_account_settings uq_chatbot_whatsapp_account_chatbot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_account_settings
    ADD CONSTRAINT uq_chatbot_whatsapp_account_chatbot UNIQUE (id_user, id_channel_connection, id_chatbot);


--
-- Name: chatbot_whatsapp_baileys_settings uq_chatbot_whatsapp_baileys_user_session_chatbot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_baileys_settings
    ADD CONSTRAINT uq_chatbot_whatsapp_baileys_user_session_chatbot UNIQUE (id_user, session_key, id_chatbot);


--
-- Name: chatbot_zalo_account_settings uq_chatbot_zalo_account_chatbot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_zalo_account_settings
    ADD CONSTRAINT uq_chatbot_zalo_account_chatbot UNIQUE (id_user, id_zalo_setting, id_chatbot);


--
-- Name: member_channel_accounts uq_member_channel_accounts; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_channel_accounts
    ADD CONSTRAINT uq_member_channel_accounts UNIQUE (owner_id, employee_id, channel, account_ref);


--
-- Name: user_members uq_owner_employee; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_members
    ADD CONSTRAINT uq_owner_employee UNIQUE (owner_id, employee_id);


--
-- Name: product_chat_mentions uq_product_chat_mention; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_chat_mentions
    ADD CONSTRAINT uq_product_chat_mention UNIQUE (source, message_id, product_id);


--
-- Name: tiktok_business_accounts uq_tiktok_business_accounts_user_business; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_business_accounts
    ADD CONSTRAINT uq_tiktok_business_accounts_user_business UNIQUE (id_user, business_id);


--
-- Name: zalo_personal_conversations uq_zalo_personal_external_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_conversations
    ADD CONSTRAINT uq_zalo_personal_external_id UNIQUE (id_zalo_setting, external_id);


--
-- Name: zalo_personal_sender_bindings uq_zalo_sender_binding_user_run_phone; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_sender_bindings
    ADD CONSTRAINT uq_zalo_sender_binding_user_run_phone UNIQUE (id_user, id_campaign_run, phone_normalized);


--
-- Name: zalo_unreachable_phones uq_zalo_unreachable_user_phone; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_unreachable_phones
    ADD CONSTRAINT uq_zalo_unreachable_user_phone UNIQUE (id_user, phone_normalized);


--
-- Name: usage_logs usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_logs
    ADD CONSTRAINT usage_logs_pkey PRIMARY KEY (id);


--
-- Name: user_consents user_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_pkey PRIMARY KEY (id);


--
-- Name: user_members user_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_members
    ADD CONSTRAINT user_members_pkey PRIMARY KEY (id);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: user_two_factor user_two_factor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_two_factor
    ADD CONSTRAINT user_two_factor_pkey PRIMARY KEY (user_id);


--
-- Name: user_whatsapp_app_credentials user_whatsapp_app_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_whatsapp_app_credentials
    ADD CONSTRAINT user_whatsapp_app_credentials_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: verification_codes verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_pkey PRIMARY KEY (id);


--
-- Name: voucher_redemptions voucher_redemptions_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_order_id_key UNIQUE (order_id);


--
-- Name: voucher_redemptions voucher_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: web_widget_configs web_widget_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_widget_configs
    ADD CONSTRAINT web_widget_configs_pkey PRIMARY KEY (id);


--
-- Name: web_widget_configs web_widget_configs_widget_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_widget_configs
    ADD CONSTRAINT web_widget_configs_widget_key_key UNIQUE (widget_key);


--
-- Name: webchat_conversations webchat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_pkey PRIMARY KEY (id);


--
-- Name: webchat_messages webchat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages
    ADD CONSTRAINT webchat_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_account_settings whatsapp_account_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_account_settings
    ADD CONSTRAINT whatsapp_account_settings_pkey PRIMARY KEY (session_key);


--
-- Name: whatsapp_baileys_session_creds whatsapp_baileys_session_creds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_baileys_session_creds
    ADD CONSTRAINT whatsapp_baileys_session_creds_pkey PRIMARY KEY (session_key);


--
-- Name: whatsapp_baileys_session_keys whatsapp_baileys_session_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_baileys_session_keys
    ADD CONSTRAINT whatsapp_baileys_session_keys_pkey PRIMARY KEY (session_key, type, id);


--
-- Name: whatsapp_baileys_session_profile whatsapp_baileys_session_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_baileys_session_profile
    ADD CONSTRAINT whatsapp_baileys_session_profile_pkey PRIMARY KEY (session_key);


--
-- Name: zalo_accounts zalo_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_accounts
    ADD CONSTRAINT zalo_accounts_pkey PRIMARY KEY (id);


--
-- Name: zalo_friends zalo_friends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_friends
    ADD CONSTRAINT zalo_friends_pkey PRIMARY KEY (id);


--
-- Name: zalo_friends zalo_friends_setting_friend_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_friends
    ADD CONSTRAINT zalo_friends_setting_friend_key UNIQUE (id_zalo_setting, friend_id);


--
-- Name: zalo_groups zalo_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_groups
    ADD CONSTRAINT zalo_groups_pkey PRIMARY KEY (id);


--
-- Name: zalo_messages zalo_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages
    ADD CONSTRAINT zalo_messages_pkey PRIMARY KEY (id);


--
-- Name: zalo_messages zalo_messages_tracking_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages
    ADD CONSTRAINT zalo_messages_tracking_token_key UNIQUE (tracking_token);


--
-- Name: zalo_personal_conversations zalo_personal_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_conversations
    ADD CONSTRAINT zalo_personal_conversations_pkey PRIMARY KEY (id);


--
-- Name: zalo_personal_messages zalo_personal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_messages
    ADD CONSTRAINT zalo_personal_messages_pkey PRIMARY KEY (id);


--
-- Name: zalo_personal_sender_bindings zalo_personal_sender_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_sender_bindings
    ADD CONSTRAINT zalo_personal_sender_bindings_pkey PRIMARY KEY (id);


--
-- Name: zalo_settings zalo_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_settings
    ADD CONSTRAINT zalo_settings_pkey PRIMARY KEY (id);


--
-- Name: zalo_templates zalo_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_templates
    ADD CONSTRAINT zalo_templates_pkey PRIMARY KEY (id);


--
-- Name: zalo_unreachable_phones zalo_unreachable_phones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_unreachable_phones
    ADD CONSTRAINT zalo_unreachable_phones_pkey PRIMARY KEY (id);


--
-- Name: ai_models_one_fallback; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_models_one_fallback ON public.ai_models USING btree (is_fallback) WHERE is_fallback;


--
-- Name: idx_affiliate_ledger_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_ledger_user ON public.affiliate_ledger USING btree (user_id, created_at DESC);


--
-- Name: idx_affiliate_periods_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_periods_month ON public.affiliate_periods USING btree (month_key);


--
-- Name: idx_affiliate_withdrawals_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_affiliate_withdrawals_one_pending ON public.affiliate_withdrawals USING btree (user_id) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_affiliate_withdrawals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_withdrawals_status ON public.affiliate_withdrawals USING btree (status, requested_at);


--
-- Name: idx_affiliate_withdrawals_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_withdrawals_user ON public.affiliate_withdrawals USING btree (user_id, requested_at DESC);


--
-- Name: idx_ai_activity_summaries_user_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_activity_summaries_user_day ON public.ai_activity_summaries USING btree (id_user, day_key);


--
-- Name: idx_ai_call_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_call_events_created ON public.ai_call_events USING btree (created_at);


--
-- Name: idx_ai_call_events_feature_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_call_events_feature_created ON public.ai_call_events USING btree (feature, created_at);


--
-- Name: idx_ai_chat_messages_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_chat_messages_session ON public.ai_chat_messages USING btree (session_id, id);


--
-- Name: idx_ai_chat_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_chat_sessions_user ON public.ai_chat_sessions USING btree (id_user, updated_at DESC);


--
-- Name: idx_ai_models_enabled_output; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_models_enabled_output ON public.ai_models USING btree (is_enabled, supports_generate_content, output_token_limit, model_id);


--
-- Name: idx_ai_unavailable_notices_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_unavailable_notices_sent ON public.ai_unavailable_notices USING btree (last_sent_at);


--
-- Name: idx_alert_events_rule_fired; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_events_rule_fired ON public.alert_events USING btree (rule_id, fired_at DESC);


--
-- Name: idx_alert_events_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_events_unresolved ON public.alert_events USING btree (resolved, fired_at DESC) WHERE (resolved = false);


--
-- Name: idx_are_buyer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_are_buyer_user_id ON public.affiliate_revenue_events USING btree (buyer_user_id);


--
-- Name: idx_are_referrer_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_are_referrer_month ON public.affiliate_revenue_events USING btree (referrer_user_id, month_key);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_category ON public.audit_logs USING btree (category);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_id_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_id_user ON public.audit_logs USING btree (id_user);


--
-- Name: idx_audit_logs_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_owner_id ON public.audit_logs USING btree (owner_id);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (id_user);


--
-- Name: idx_bpc_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bpc_embedding ON public.business_profile_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='10');


--
-- Name: idx_bpc_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bpc_user ON public.business_profile_chunks USING btree (user_id);


--
-- Name: idx_business_profile_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_profile_chunks_embedding ON public.business_profile_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='10');


--
-- Name: idx_business_profile_chunks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_profile_chunks_user ON public.business_profile_chunks USING btree (user_id);


--
-- Name: idx_business_profiles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_profiles_user ON public.business_profiles USING btree (user_id);


--
-- Name: idx_campaign_channel_messages_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_channel_messages_account ON public.campaign_channel_messages USING btree (account_key, channel, sent_at);


--
-- Name: idx_campaign_channel_messages_node_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_channel_messages_node_dedupe ON public.campaign_channel_messages USING btree (id_node, channel, recipient_key, step_index, created_at) WHERE ((status)::text = 'sent'::text);


--
-- Name: idx_campaign_channel_messages_run_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_channel_messages_run_channel ON public.campaign_channel_messages USING btree (id_run, channel);


--
-- Name: idx_campaign_channel_messages_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_channel_messages_workspace_owner ON public.campaign_channel_messages USING btree (workspace_owner_id, channel, sent_at);


--
-- Name: idx_campaign_customers_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_customers_campaign ON public.campaign_customers USING btree (id_campaign);


--
-- Name: idx_campaign_customers_clicked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_customers_clicked ON public.campaign_customers USING btree (has_clicked);


--
-- Name: idx_campaign_customers_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_customers_customer ON public.campaign_customers USING btree (id_customer);


--
-- Name: idx_campaign_customers_last_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_customers_last_activity ON public.campaign_customers USING btree (last_activity_at);


--
-- Name: idx_campaign_customers_opened; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_customers_opened ON public.campaign_customers USING btree (has_opened);


--
-- Name: idx_campaign_executions_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_campaign ON public.campaign_executions USING btree (id_campaign);


--
-- Name: idx_campaign_executions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_created_at ON public.campaign_executions USING btree (created_at DESC);


--
-- Name: idx_campaign_executions_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_customer ON public.campaign_executions USING btree (id_customer);


--
-- Name: idx_campaign_executions_error_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_error_updated ON public.campaign_executions USING btree (updated_at DESC) WHERE (error_message IS NOT NULL);


--
-- Name: idx_campaign_executions_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_run ON public.campaign_executions USING btree (id_run);


--
-- Name: idx_campaign_executions_run_created_id_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_run_created_id_desc ON public.campaign_executions USING btree (id_run, created_at DESC, id DESC);


--
-- Name: idx_campaign_executions_run_node_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_run_node_order ON public.campaign_executions USING btree (id_run, node_order, created_at);


--
-- Name: idx_campaign_executions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_status ON public.campaign_executions USING btree (status);


--
-- Name: idx_campaign_executions_status_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_executions_status_updated ON public.campaign_executions USING btree (status, updated_at DESC);


--
-- Name: idx_campaign_participations_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_participations_campaign ON public.campaign_participations USING btree (id_campaign);


--
-- Name: idx_campaign_participations_id_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_participations_id_run ON public.campaign_participations USING btree (id_run);


--
-- Name: idx_campaign_run_recipient_steps_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_run_recipient_steps_completed ON public.campaign_run_recipient_steps USING btree (id_run, is_fully_completed);


--
-- Name: idx_campaign_run_recipient_steps_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_run_recipient_steps_due ON public.campaign_run_recipient_steps USING btree (id_run, next_due_at);


--
-- Name: idx_campaign_run_recipient_steps_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_run_recipient_steps_recipient ON public.campaign_run_recipient_steps USING btree (recipient_key);


--
-- Name: idx_campaign_run_recipient_steps_run_node_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_run_recipient_steps_run_node_channel ON public.campaign_run_recipient_steps USING btree (id_run, id_node, channel);


--
-- Name: idx_campaign_runs_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_campaign ON public.campaign_runs USING btree (id_campaign);


--
-- Name: idx_campaign_runs_run_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_run_name ON public.campaign_runs USING btree (run_name);


--
-- Name: idx_campaign_runs_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_schedule ON public.campaign_runs USING btree (id_schedule);


--
-- Name: idx_campaign_runs_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_started_at ON public.campaign_runs USING btree (started_at DESC);


--
-- Name: idx_campaign_runs_started_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_started_at_desc ON public.campaign_runs USING btree (started_at DESC);


--
-- Name: idx_campaign_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_status ON public.campaign_runs USING btree (status);


--
-- Name: idx_campaign_runs_status_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_status_started_at ON public.campaign_runs USING btree (status, started_at DESC);


--
-- Name: idx_campaign_runs_triggered_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_triggered_by ON public.campaign_runs USING btree (triggered_by) WHERE (triggered_by IS NOT NULL);


--
-- Name: idx_campaign_runs_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_runs_workspace_owner ON public.campaign_runs USING btree (workspace_owner_id);


--
-- Name: idx_campaign_schedules_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_schedules_campaign ON public.campaign_schedules USING btree (id_campaign);


--
-- Name: idx_campaign_schedules_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_schedules_created_by ON public.campaign_schedules USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_campaign_schedules_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_schedules_enabled ON public.campaign_schedules USING btree (enabled);


--
-- Name: idx_campaign_schedules_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_schedules_next_run ON public.campaign_schedules USING btree (next_run_at) WHERE (enabled = true);


--
-- Name: idx_campaign_schedules_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_schedules_workspace_owner ON public.campaign_schedules USING btree (workspace_owner_id);


--
-- Name: idx_campaign_shares_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_shares_campaign ON public.campaign_shares USING btree (id_campaign);


--
-- Name: idx_campaign_shares_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_shares_owner ON public.campaign_shares USING btree (id_owner);


--
-- Name: idx_campaign_shares_pending_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_shares_pending_email ON public.campaign_shares USING btree (lower((recipient_email)::text)) WHERE ((id_recipient IS NULL) AND ((status)::text = 'pending'::text));


--
-- Name: idx_campaign_shares_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_shares_recipient ON public.campaign_shares USING btree (id_recipient);


--
-- Name: idx_campaigns_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_created_by ON public.campaigns USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_campaigns_effective_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_effective_workspace_owner ON public.campaigns USING btree (COALESCE(workspace_owner_id, id_user));


--
-- Name: idx_campaigns_marketplace_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_marketplace_purchase ON public.campaigns USING btree (marketplace_purchase_id);


--
-- Name: idx_campaigns_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_origin ON public.campaigns USING btree (origin);


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);


--
-- Name: idx_campaigns_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_type ON public.campaigns USING btree (campaign_type);


--
-- Name: idx_campaigns_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_user ON public.campaigns USING btree (id_user);


--
-- Name: idx_campaigns_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_workspace_owner ON public.campaigns USING btree (workspace_owner_id);


--
-- Name: idx_channel_conn_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conn_channel ON public.channel_connections USING btree (channel);


--
-- Name: idx_channel_conn_fb_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conn_fb_page ON public.channel_connections USING btree (fb_page_id) WHERE (fb_page_id IS NOT NULL);


--
-- Name: idx_channel_conn_fb_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conn_fb_user ON public.channel_connections USING btree (fb_user_id) WHERE (fb_user_id IS NOT NULL);


--
-- Name: idx_channel_conn_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conn_user ON public.channel_connections USING btree (id_user);


--
-- Name: idx_channel_connections_webhook_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_connections_webhook_token ON public.channel_connections USING btree (webhook_token) WHERE (webhook_token IS NOT NULL);


--
-- Name: idx_channel_conv_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conv_channel ON public.channel_conversations USING btree (id_channel);


--
-- Name: idx_channel_conv_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conv_user ON public.channel_conversations USING btree (id_user);


--
-- Name: idx_channel_conv_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conv_user_status ON public.channel_conversations USING btree (id_user, status);


--
-- Name: idx_channel_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conversations_last_message ON public.channel_conversations USING btree (last_message_at DESC);


--
-- Name: idx_channel_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_conversations_status ON public.channel_conversations USING btree (status);


--
-- Name: idx_channel_disconnect_alerts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_disconnect_alerts_user ON public.channel_disconnect_alerts USING btree (id_user);


--
-- Name: idx_channel_messages_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_messages_channel ON public.channel_messages USING btree (id_channel);


--
-- Name: idx_channel_messages_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_messages_conv ON public.channel_messages USING btree (id_conversation);


--
-- Name: idx_channel_messages_conv_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_messages_conv_created ON public.channel_messages USING btree (id_conversation, created_at DESC);


--
-- Name: idx_chat_attachments_storage_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_attachments_storage_object ON public.chat_attachments USING btree (storage_object_id) WHERE (storage_object_id IS NOT NULL);


--
-- Name: idx_chat_attachments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_attachments_user ON public.chat_attachments USING btree (id_user, created_at DESC);


--
-- Name: idx_chatbot_channels_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_channels_active ON public.chatbot_channel_connections USING btree (id_chatbot, channel_type, is_active) WHERE (is_active = true);


--
-- Name: idx_chatbot_channels_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_channels_chatbot ON public.chatbot_channel_connections USING btree (id_chatbot);


--
-- Name: idx_chatbot_channels_phone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_channels_phone_id ON public.chatbot_channel_connections USING btree (phone_number_id) WHERE (phone_number_id IS NOT NULL);


--
-- Name: idx_chatbot_channels_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_channels_token ON public.chatbot_channel_connections USING btree (webhook_token);


--
-- Name: idx_chatbot_channels_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_channels_type ON public.chatbot_channel_connections USING btree (channel_type);


--
-- Name: idx_chatbot_contact_alerts_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_contact_alerts_conv ON public.chatbot_contact_alerts USING btree (id_user, last_source, last_conversation_id);


--
-- Name: idx_chatbot_contact_alerts_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_contact_alerts_pending ON public.chatbot_contact_alerts USING btree (id_user) WHERE (pending_notify = true);


--
-- Name: idx_chatbot_contact_alerts_user_handled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_contact_alerts_user_handled ON public.chatbot_contact_alerts USING btree (id_user, handled_at);


--
-- Name: idx_chatbot_conv_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_conv_channel ON public.chatbot_conversations USING btree (id_channel);


--
-- Name: idx_chatbot_conv_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_conv_chatbot ON public.chatbot_conversations USING btree (id_chatbot);


--
-- Name: idx_chatbot_conv_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_conv_external ON public.chatbot_conversations USING btree (external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_chatbot_conv_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_conv_status ON public.chatbot_conversations USING btree (id_chatbot, status);


--
-- Name: idx_chatbot_digest_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_digest_log_user ON public.chatbot_digest_log USING btree (id_user);


--
-- Name: idx_chatbot_msg_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_msg_conv ON public.chatbot_messages USING btree (id_conversation);


--
-- Name: idx_chatbot_msg_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_msg_created ON public.chatbot_messages USING btree (id_conversation, created_at DESC);


--
-- Name: idx_chatbot_settings_user_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_settings_user_channel ON public.chatbot_settings USING btree (id_user, channel);


--
-- Name: idx_chatbot_shares_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_shares_chatbot ON public.chatbot_shares USING btree (id_chatbot);


--
-- Name: idx_chatbot_shares_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_shares_owner ON public.chatbot_shares USING btree (id_owner);


--
-- Name: idx_chatbot_shares_pending_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_shares_pending_email ON public.chatbot_shares USING btree (lower((recipient_email)::text)) WHERE ((id_recipient IS NULL) AND ((status)::text = 'pending'::text));


--
-- Name: idx_chatbot_shares_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_shares_recipient ON public.chatbot_shares USING btree (id_recipient);


--
-- Name: idx_chatbot_whatsapp_baileys_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_whatsapp_baileys_chatbot ON public.chatbot_whatsapp_baileys_settings USING btree (id_chatbot) WHERE (id_chatbot IS NOT NULL);


--
-- Name: idx_chatbot_whatsapp_baileys_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_whatsapp_baileys_session ON public.chatbot_whatsapp_baileys_settings USING btree (session_key);


--
-- Name: idx_chatbot_whatsapp_baileys_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_whatsapp_baileys_user ON public.chatbot_whatsapp_baileys_settings USING btree (id_user);


--
-- Name: idx_chatbot_whatsapp_settings_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_whatsapp_settings_channel ON public.chatbot_whatsapp_account_settings USING btree (id_channel_connection);


--
-- Name: idx_chatbot_whatsapp_settings_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_whatsapp_settings_chatbot ON public.chatbot_whatsapp_account_settings USING btree (id_chatbot) WHERE (id_chatbot IS NOT NULL);


--
-- Name: idx_chatbot_whatsapp_settings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_whatsapp_settings_user ON public.chatbot_whatsapp_account_settings USING btree (id_user);


--
-- Name: idx_chatbot_zalo_account_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_zalo_account_chatbot ON public.chatbot_zalo_account_settings USING btree (id_chatbot);


--
-- Name: idx_chatbot_zalo_account_setting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_zalo_account_setting ON public.chatbot_zalo_account_settings USING btree (id_zalo_setting);


--
-- Name: idx_chatbot_zalo_account_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_zalo_account_user ON public.chatbot_zalo_account_settings USING btree (id_user);


--
-- Name: idx_connections_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_campaign ON public.campaign_connections USING btree (id_campaign);


--
-- Name: idx_connections_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_source ON public.campaign_connections USING btree (source_node_id);


--
-- Name: idx_connections_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_target ON public.campaign_connections USING btree (target_node_id);


--
-- Name: idx_contact_submissions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_submissions_email ON public.contact_submissions USING btree (email);


--
-- Name: idx_contact_submissions_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_submissions_status_created ON public.contact_submissions USING btree (status, created_at DESC);


--
-- Name: idx_course_relations_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_relations_course ON public.course_relations USING btree (id_course);


--
-- Name: idx_courses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_category ON public.courses USING btree (category);


--
-- Name: idx_courses_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_created_by ON public.courses USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_courses_effective_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_effective_workspace_owner ON public.courses USING btree (COALESCE(workspace_owner_id, id_user));


--
-- Name: idx_courses_unique_workspace_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_courses_unique_workspace_code ON public.courses USING btree (COALESCE(workspace_owner_id, id_user), course_code) WHERE (course_code IS NOT NULL);


--
-- Name: idx_courses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_user ON public.courses USING btree (id_user);


--
-- Name: idx_courses_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_workspace_owner ON public.courses USING btree (workspace_owner_id);


--
-- Name: idx_cron_job_runs_job_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cron_job_runs_job_started ON public.cron_job_runs USING btree (job_code, started_at DESC);


--
-- Name: idx_crrs_id_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crrs_id_run ON public.campaign_run_recipient_steps USING btree (id_run);


--
-- Name: idx_crrs_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crrs_run ON public.campaign_run_recipient_steps USING btree (id_run);


--
-- Name: idx_custom_chatbot_chunks_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbot_chunks_chatbot ON public.custom_chatbot_chunks USING btree (chatbot_id);


--
-- Name: idx_custom_chatbot_chunks_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbot_chunks_document ON public.custom_chatbot_chunks USING btree (document_id, chunk_index);


--
-- Name: idx_custom_chatbot_chunks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbot_chunks_user ON public.custom_chatbot_chunks USING btree (user_id);


--
-- Name: idx_custom_chatbot_documents_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbot_documents_chatbot ON public.custom_chatbot_documents USING btree (chatbot_id, created_at DESC);


--
-- Name: idx_custom_chatbot_documents_owner_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbot_documents_owner_usage ON public.custom_chatbot_documents USING btree (owner_user_id, status, extracted_chars);


--
-- Name: idx_custom_chatbots_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbots_active ON public.custom_chatbots USING btree (is_active);


--
-- Name: idx_custom_chatbots_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbots_key ON public.custom_chatbots USING btree (widget_key);


--
-- Name: idx_custom_chatbots_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbots_origin ON public.custom_chatbots USING btree (origin) WHERE (is_active = true);


--
-- Name: idx_custom_chatbots_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_chatbots_user ON public.custom_chatbots USING btree (id_user);


--
-- Name: idx_custom_domains_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_domains_domain ON public.custom_domains USING btree (domain);


--
-- Name: idx_custom_domains_landing_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_domains_landing_page ON public.custom_domains USING btree (landing_page_id);


--
-- Name: idx_custom_domains_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_domains_status ON public.custom_domains USING btree (status);


--
-- Name: idx_custom_domains_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_domains_user ON public.custom_domains USING btree (user_id);


--
-- Name: idx_customer_journey_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_journey_campaign ON public.customer_journey USING btree (campaign_id);


--
-- Name: idx_customer_journey_channel_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_journey_channel_at ON public.customer_journey USING btree (event_channel, event_at DESC);


--
-- Name: idx_customer_journey_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_journey_created_at ON public.customer_journey USING btree (created_at DESC);


--
-- Name: idx_customer_journey_id_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_journey_id_run ON public.customer_journey USING btree (id_run);


--
-- Name: idx_customer_journey_type_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_journey_type_at ON public.customer_journey USING btree (event_type, event_at DESC);


--
-- Name: idx_customer_purchases_id_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_purchases_id_run ON public.customer_purchases USING btree (id_run);


--
-- Name: idx_customer_purchases_id_zalo_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_purchases_id_zalo_message ON public.customer_purchases USING btree (id_zalo_message);


--
-- Name: idx_customer_tag_assignments_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_tag_assignments_tag ON public.customer_tag_assignments USING btree (tag_id);


--
-- Name: idx_customers_consent_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_consent_source ON public.customers USING btree (consent_source);


--
-- Name: idx_customers_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_created_by ON public.customers USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_customers_effective_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_effective_workspace_owner ON public.customers USING btree (COALESCE(workspace_owner_id, id_user));


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_customers_id_user_lower_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_id_user_lower_email ON public.customers USING btree (id_user, lower((email)::text));


--
-- Name: idx_customers_id_user_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_id_user_phone ON public.customers USING btree (id_user, phone);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_customers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_user ON public.customers USING btree (id_user);


--
-- Name: idx_customers_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_workspace_owner ON public.customers USING btree (workspace_owner_id);


--
-- Name: idx_customers_ws_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_ws_created ON public.customers USING btree (COALESCE(workspace_owner_id, id_user), created_at DESC, id DESC);


--
-- Name: idx_customers_ws_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_ws_email_key ON public.customers USING btree (COALESCE(workspace_owner_id, id_user), lower((email)::text));


--
-- Name: idx_customers_ws_phone_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_ws_phone_key ON public.customers USING btree (COALESCE(workspace_owner_id, id_user), "right"(regexp_replace((phone)::text, '[^0-9]'::text, ''::text, 'g'::text), 9));


--
-- Name: idx_customers_zalo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_zalo ON public.customers USING btree (zalo_id);


--
-- Name: idx_customers_zalo_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_zalo_group ON public.customers USING btree (id_zalo_group);


--
-- Name: idx_dashboard_insights_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dashboard_insights_user_created ON public.dashboard_insights USING btree (id_user, created_at DESC);


--
-- Name: idx_diagnostic_messages_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_messages_run ON public.diagnostic_messages USING btree (run_id, seq);


--
-- Name: idx_domain_ssl_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domain_ssl_domain ON public.custom_domain_ssl USING btree (domain_id);


--
-- Name: idx_domain_verifications_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domain_verifications_domain ON public.custom_domain_verifications USING btree (domain_id);


--
-- Name: idx_einvoices_email_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_einvoices_email_worker ON public.einvoices USING btree (email_status, email_next_attempt_at, email_last_attempt_at);


--
-- Name: idx_einvoices_status_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_einvoices_status_retry ON public.einvoices USING btree (status, error_code, updated_at);


--
-- Name: idx_einvoices_worker_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_einvoices_worker_claim ON public.einvoices USING btree (status, next_attempt_at, updated_at);


--
-- Name: idx_email_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_created ON public.notification_email_logs USING btree (created_at);


--
-- Name: idx_email_logs_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_email ON public.notification_email_logs USING btree (email);


--
-- Name: idx_email_logs_notification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_notification ON public.notification_email_logs USING btree (notification_id);


--
-- Name: idx_email_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_status ON public.notification_email_logs USING btree (status);


--
-- Name: idx_email_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_user ON public.notification_email_logs USING btree (user_id);


--
-- Name: idx_email_messages_brand_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_brand_domain ON public.email_messages USING btree (brand_domain) WHERE (brand_domain IS NOT NULL);


--
-- Name: idx_email_messages_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_campaign ON public.email_messages USING btree (id_campaign);


--
-- Name: idx_email_messages_campaign_preview; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_campaign_preview ON public.email_messages USING btree (id_campaign) WHERE (NOT is_preview);


--
-- Name: idx_email_messages_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_customer ON public.email_messages USING btree (id_customer);


--
-- Name: idx_email_messages_id_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_id_run ON public.email_messages USING btree (id_run);


--
-- Name: idx_email_messages_node_recipient_step_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_node_recipient_step_created ON public.email_messages USING btree (id_node, lower(btrim((recipient_email)::text)), email_step, created_at) WHERE (status = ANY (ARRAY['sent'::public.message_status, 'delivered'::public.message_status, 'opened'::public.message_status, 'clicked'::public.message_status]));


--
-- Name: idx_email_messages_owner_actor_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_owner_actor_sent ON public.email_messages USING btree (workspace_owner_id, actor_user_id, sent_at);


--
-- Name: idx_email_messages_owner_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_owner_sent ON public.email_messages USING btree (workspace_owner_id, sent_at);


--
-- Name: idx_email_messages_quota_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_quota_count ON public.email_messages USING btree (id_campaign, sent_at) WHERE (status = ANY (ARRAY['sent'::public.message_status, 'delivered'::public.message_status, 'bounced'::public.message_status]));


--
-- Name: idx_email_messages_run_campaign_step_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_run_campaign_step_recipient ON public.email_messages USING btree (id_run, id_campaign, email_step, lower(btrim((recipient_email)::text))) WHERE ((id_run IS NOT NULL) AND (id_campaign IS NOT NULL) AND (email_step IS NOT NULL));


--
-- Name: idx_email_messages_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_sent ON public.email_messages USING btree (sent_at);


--
-- Name: idx_email_messages_setting_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_setting_sent ON public.email_messages USING btree (id_email_setting, sent_at) WHERE ((id_email_setting IS NOT NULL) AND (NOT is_preview));


--
-- Name: idx_email_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_status ON public.email_messages USING btree (status);


--
-- Name: idx_email_messages_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_status_created ON public.email_messages USING btree (status, created_at DESC);


--
-- Name: idx_email_settings_brand_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_brand_domain ON public.email_settings USING btree (brand_domain) WHERE (brand_domain IS NOT NULL);


--
-- Name: idx_email_settings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_status ON public.email_settings USING btree (status);


--
-- Name: idx_email_settings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_user ON public.email_settings USING btree (id_user);


--
-- Name: idx_email_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_category ON public.email_templates USING btree (category);


--
-- Name: idx_email_templates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_user ON public.email_templates USING btree (id_user);


--
-- Name: idx_facebook_token_tracking_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facebook_token_tracking_connection ON public.facebook_token_tracking USING btree (channel_connection_id);


--
-- Name: idx_facebook_token_tracking_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facebook_token_tracking_expiry ON public.facebook_token_tracking USING btree (token_expires_at) WHERE (token_expires_at IS NOT NULL);


--
-- Name: idx_favorites_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_listing ON public.marketplace_favorites USING btree (listing_id);


--
-- Name: idx_favorites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_user ON public.marketplace_favorites USING btree (id_user);


--
-- Name: idx_file_access_events_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_access_events_campaign_id ON public.file_access_events USING btree (campaign_id);


--
-- Name: idx_file_access_events_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_access_events_customer_id ON public.file_access_events USING btree (customer_id);


--
-- Name: idx_file_access_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_access_events_event_type ON public.file_access_events USING btree (event_type);


--
-- Name: idx_file_access_events_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_access_events_file_id ON public.file_access_events USING btree (file_id);


--
-- Name: idx_file_dl_events_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_dl_events_campaign_id ON public.file_download_events USING btree (campaign_id);


--
-- Name: idx_file_dl_events_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_dl_events_customer_id ON public.file_download_events USING btree (customer_id);


--
-- Name: idx_file_dl_events_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_dl_events_file_id ON public.file_download_events USING btree (file_id);


--
-- Name: idx_file_download_events_id_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_download_events_id_run ON public.file_download_events USING btree (id_run);


--
-- Name: idx_form_file_uploads_form; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_file_uploads_form ON public.form_file_uploads USING btree (form_id);


--
-- Name: idx_form_file_uploads_owner_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_file_uploads_owner_pending ON public.form_file_uploads USING btree (workspace_owner_id) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_form_file_uploads_pending_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_file_uploads_pending_expiry ON public.form_file_uploads USING btree (expires_at) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_form_file_uploads_used_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_file_uploads_used_at ON public.form_file_uploads USING btree (used_at) WHERE ((status)::text = 'used'::text);


--
-- Name: idx_form_submissions_form_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_form_created ON public.form_submissions USING btree (form_id, created_at DESC);


--
-- Name: idx_form_submissions_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_owner ON public.form_submissions USING btree (workspace_owner_id);


--
-- Name: idx_form_submissions_owner_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_owner_email_key ON public.form_submissions USING btree (workspace_owner_id, lower((respondent_email)::text));


--
-- Name: idx_form_submissions_owner_landing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_owner_landing ON public.form_submissions USING btree (workspace_owner_id, landing_page_slug) WHERE (landing_page_slug IS NOT NULL);


--
-- Name: idx_form_submissions_owner_phone_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_owner_phone_key ON public.form_submissions USING btree (workspace_owner_id, "right"(regexp_replace((respondent_phone)::text, '[^0-9]'::text, ''::text, 'g'::text), 9));


--
-- Name: idx_form_submissions_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_slot ON public.form_submissions USING btree (form_id, appointment_at) WHERE (appointment_at IS NOT NULL);


--
-- Name: idx_forms_landing_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_landing_page_id ON public.forms USING btree (landing_page_id) WHERE (landing_page_id IS NOT NULL);


--
-- Name: idx_forms_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_owner ON public.forms USING btree (workspace_owner_id);


--
-- Name: idx_forms_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_product_id ON public.forms USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: idx_forms_public_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forms_public_key ON public.forms USING btree (public_key);


--
-- Name: idx_help_article_chunks_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_article_chunks_article ON public.help_article_chunks USING btree (article_id);


--
-- Name: idx_help_article_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_article_chunks_embedding ON public.help_article_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='20');


--
-- Name: idx_help_article_media_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_article_media_article ON public.help_article_media USING btree (article_id, sort_order);


--
-- Name: idx_help_articles_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_articles_feature ON public.help_articles USING btree (feature_key, sort_order);


--
-- Name: idx_help_articles_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_articles_locale ON public.help_articles USING btree (locale, is_published);


--
-- Name: idx_help_articles_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_articles_published ON public.help_articles USING btree (is_published) WHERE (is_published = true);


--
-- Name: idx_help_unanswered_asked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_unanswered_asked ON public.help_unanswered USING btree (asked_at DESC);


--
-- Name: idx_journey_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journey_campaign ON public.customer_journey USING btree (id_campaign);


--
-- Name: idx_journey_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journey_customer ON public.customer_journey USING btree (id_customer);


--
-- Name: idx_journey_customer_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journey_customer_time ON public.customer_journey USING btree (id_customer, event_at);


--
-- Name: idx_journey_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journey_event ON public.customer_journey USING btree (event_type);


--
-- Name: idx_journey_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journey_time ON public.customer_journey USING btree (event_at);


--
-- Name: idx_kb_chunks_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_document ON public.kb_chunks USING btree (id_document);


--
-- Name: idx_kb_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_embedding ON public.kb_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='20');


--
-- Name: idx_kb_chunks_kb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_kb ON public.kb_chunks USING btree (id_kb);


--
-- Name: idx_kb_chunks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_user ON public.kb_chunks USING btree (id_user);


--
-- Name: idx_kb_chunks_user_kb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_user_kb ON public.kb_chunks USING btree (id_user, id_kb);


--
-- Name: idx_kb_doc_kb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_doc_kb ON public.kb_documents USING btree (id_kb);


--
-- Name: idx_kb_doc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_doc_status ON public.kb_documents USING btree (status);


--
-- Name: idx_kb_doc_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_doc_user ON public.kb_documents USING btree (id_user);


--
-- Name: idx_kb_documents_kb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_kb ON public.kb_documents USING btree (id_kb);


--
-- Name: idx_kb_documents_kb_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_kb_status ON public.kb_documents USING btree (id_kb, status) WHERE ((status)::text = 'ready'::text);


--
-- Name: idx_kb_documents_owner_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_owner_usage ON public.kb_documents USING btree (id_user, status, extracted_chars);


--
-- Name: idx_kb_documents_status_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_status_user ON public.kb_documents USING btree (status, id_user);


--
-- Name: idx_kb_documents_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_user ON public.kb_documents USING btree (id_user);


--
-- Name: idx_kb_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_sub ON public.knowledge_bases USING btree (id_sub_assistant);


--
-- Name: idx_kb_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_user ON public.knowledge_bases USING btree (id_user);


--
-- Name: idx_knowledge_bases_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_bases_user ON public.knowledge_bases USING btree (id_user);


--
-- Name: idx_landing_featured_courses_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_featured_courses_active_sort ON public.landing_featured_courses USING btree (is_active, sort_order, id);


--
-- Name: idx_landing_featured_courses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_featured_courses_user ON public.landing_featured_courses USING btree (id_user);


--
-- Name: idx_landing_overrides_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_overrides_active ON public.landing_page_overrides USING btree (is_active);


--
-- Name: idx_landing_overrides_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_overrides_page ON public.landing_page_overrides USING btree (page);


--
-- Name: idx_landing_page_domains_status_lower_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_domains_status_lower_host ON public.landing_page_domains USING btree (status, lower(hostname));


--
-- Name: idx_landing_page_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_events_user ON public.landing_page_events USING btree (id_user);


--
-- Name: idx_landing_page_forms_form_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_forms_form_id ON public.landing_page_forms USING btree (form_id);


--
-- Name: idx_landing_page_shares_landing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_shares_landing ON public.landing_page_shares USING btree (id_landing_page);


--
-- Name: idx_landing_page_shares_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_shares_owner ON public.landing_page_shares USING btree (id_owner);


--
-- Name: idx_landing_page_shares_pending_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_shares_pending_email ON public.landing_page_shares USING btree (lower((recipient_email)::text)) WHERE ((id_recipient IS NULL) AND ((status)::text = 'pending'::text));


--
-- Name: idx_landing_page_shares_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_shares_recipient ON public.landing_page_shares USING btree (id_recipient);


--
-- Name: idx_landing_page_versions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_versions_created_by ON public.landing_page_versions USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_landing_page_versions_page_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_versions_page_created ON public.landing_page_versions USING btree (id_landing_page, created_at DESC);


--
-- Name: idx_landing_page_versions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_versions_user ON public.landing_page_versions USING btree (id_user);


--
-- Name: idx_landing_page_versions_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_versions_workspace_owner ON public.landing_page_versions USING btree (workspace_owner_id);


--
-- Name: idx_landing_pages_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_pages_created_by ON public.landing_pages USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_landing_pages_custom_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_pages_custom_domain ON public.landing_pages USING btree (custom_domain_id);


--
-- Name: idx_landing_pages_effective_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_pages_effective_workspace_owner ON public.landing_pages USING btree (COALESCE(workspace_owner_id, id_user));


--
-- Name: idx_landing_pages_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_pages_published ON public.landing_pages USING btree (is_published);


--
-- Name: idx_landing_pages_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_pages_template ON public.landing_pages USING btree (template_id);


--
-- Name: idx_landing_pages_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_pages_updated_at ON public.landing_pages USING btree (updated_at DESC);


--
-- Name: idx_landing_pages_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_pages_workspace_owner ON public.landing_pages USING btree (workspace_owner_id);


--
-- Name: idx_landing_sections_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_sections_page ON public.landing_page_sections USING btree (page);


--
-- Name: idx_landing_sections_page_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_sections_page_section ON public.landing_page_sections USING btree (page, section);


--
-- Name: idx_landing_testimonials_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_testimonials_active_sort ON public.landing_testimonials USING btree (is_active, sort_order, id);


--
-- Name: idx_landing_testimonials_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_testimonials_user ON public.landing_testimonials USING btree (id_user);


--
-- Name: idx_leads_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_created_at ON public.leads USING btree (created_at DESC);


--
-- Name: idx_leads_effective_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_effective_workspace_owner ON public.leads USING btree (COALESCE(workspace_owner_id, id_user));


--
-- Name: idx_leads_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_email ON public.leads USING btree (email);


--
-- Name: idx_leads_landing_slug_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_landing_slug_created ON public.leads USING btree (landing_page_slug, created_at DESC);


--
-- Name: idx_leads_phone_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_phone_key ON public.leads USING btree ("right"(regexp_replace((phone)::text, '[^0-9]'::text, ''::text, 'g'::text), 9));


--
-- Name: idx_leads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_user ON public.leads USING btree (id_user);


--
-- Name: idx_leads_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_workspace_owner ON public.leads USING btree (workspace_owner_id);


--
-- Name: idx_listings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_category ON public.marketplace_listings USING btree (category);


--
-- Name: idx_listings_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_rating ON public.marketplace_listings USING btree (rating_avg DESC);


--
-- Name: idx_listings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_status ON public.marketplace_listings USING btree (status);


--
-- Name: idx_listings_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_type ON public.marketplace_listings USING btree (resource_type);


--
-- Name: idx_listings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_user ON public.marketplace_listings USING btree (id_user);


--
-- Name: idx_login_history_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_email ON public.login_history USING btree (email);


--
-- Name: idx_login_history_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_status ON public.login_history USING btree (login_status);


--
-- Name: idx_login_history_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_time ON public.login_history USING btree (created_at);


--
-- Name: idx_login_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_history_user ON public.login_history USING btree (id_user);


--
-- Name: idx_lp_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lp_templates_active ON public.landing_page_templates USING btree (is_active);


--
-- Name: idx_lp_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lp_templates_category ON public.landing_page_templates USING btree (category);


--
-- Name: idx_lp_templates_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lp_templates_public ON public.landing_page_templates USING btree (is_public);


--
-- Name: idx_lp_templates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lp_templates_user ON public.landing_page_templates USING btree (user_id);


--
-- Name: idx_lpe_slug_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lpe_slug_created ON public.landing_page_events USING btree (landing_page_slug, created_at DESC);


--
-- Name: idx_lpe_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lpe_type_created ON public.landing_page_events USING btree (event_type, created_at DESC);


--
-- Name: idx_member_channel_accounts_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_channel_accounts_employee ON public.member_channel_accounts USING btree (owner_id, employee_id, channel);


--
-- Name: idx_member_channel_accounts_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_channel_accounts_ref ON public.member_channel_accounts USING btree (channel, account_ref);


--
-- Name: idx_nodes_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nodes_campaign ON public.campaign_nodes USING btree (id_campaign);


--
-- Name: idx_nodes_parallel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nodes_parallel ON public.campaign_nodes USING btree (parallel_group_id);


--
-- Name: idx_nodes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nodes_type ON public.campaign_nodes USING btree (node_type, node_subtype);


--
-- Name: idx_notification_templates_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_templates_due ON public.notification_templates USING btree (schedule_type, scheduled_at) WHERE (((schedule_type)::text = ANY ((ARRAY['scheduled'::character varying, 'recurring'::character varying])::text[])) AND (is_active = true));


--
-- Name: idx_notification_templates_type_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_templates_type_active ON public.notification_templates USING btree (type_key) WHERE (is_active = true);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_by ON public.notifications USING btree (created_by);


--
-- Name: idx_notifications_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_scheduled ON public.notifications USING btree (scheduled_at) WHERE (status = 'scheduled'::public.notification_status);


--
-- Name: idx_notifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_status ON public.notifications USING btree (status);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type_status ON public.notifications USING btree (type, status);


--
-- Name: idx_orders_order_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_order_code ON public.orders USING btree (order_code);


--
-- Name: idx_orders_payment_reminder_scan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_payment_reminder_scan ON public.orders USING btree (created_at) WHERE ((payment_reminder_sent_at IS NULL) AND ((status)::text = 'cancelled'::text));


--
-- Name: idx_orders_voucher_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_voucher_pending ON public.orders USING btree (voucher_id, status, created_at) WHERE (voucher_id IS NOT NULL);


--
-- Name: idx_payout_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payout_requests_status ON public.marketplace_payout_requests USING btree (status);


--
-- Name: idx_payout_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payout_requests_user ON public.marketplace_payout_requests USING btree (id_user);


--
-- Name: idx_plans_custom_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plans_custom_owner ON public.plans USING btree (custom_owner_user_id) WHERE ((is_custom = true) AND (custom_owner_user_id IS NOT NULL));


--
-- Name: idx_product_chat_mentions_ws_product_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_chat_mentions_ws_product_time ON public.product_chat_mentions USING btree (workspace_owner_id, product_id, created_at);


--
-- Name: idx_products_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_created_by ON public.products USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_products_effective_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_effective_workspace_owner ON public.products USING btree (COALESCE(workspace_owner_id, (id_user)::bigint));


--
-- Name: idx_products_id_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_id_user ON public.products USING btree (id_user);


--
-- Name: idx_products_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_workspace_owner ON public.products USING btree (workspace_owner_id);


--
-- Name: idx_purchases_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_course ON public.customer_purchases USING btree (id_course);


--
-- Name: idx_purchases_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_customer ON public.customer_purchases USING btree (id_customer);


--
-- Name: idx_purchases_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_date ON public.customer_purchases USING btree (purchase_date);


--
-- Name: idx_purchases_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_listing ON public.marketplace_purchases USING btree (listing_id);


--
-- Name: idx_purchases_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_seller ON public.marketplace_purchases USING btree (seller_id);


--
-- Name: idx_purchases_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_user ON public.marketplace_purchases USING btree (id_user);


--
-- Name: idx_refresh_tokens_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_expires ON public.refresh_tokens USING btree (expires_at) WHERE (is_revoked = false);


--
-- Name: idx_refresh_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (id_user);


--
-- Name: idx_reviews_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_listing ON public.marketplace_reviews USING btree (listing_id);


--
-- Name: idx_reviews_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_user ON public.marketplace_reviews USING btree (id_user);


--
-- Name: idx_seller_stats_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seller_stats_user ON public.marketplace_seller_stats USING btree (id_user);


--
-- Name: idx_sqr_billing_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sqr_billing_cycle ON public.send_quota_reservations USING btree (billing_user_id, channel, status, cycle_start, cycle_end) WHERE (is_metered = true);


--
-- Name: idx_sqr_billing_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sqr_billing_day ON public.send_quota_reservations USING btree (billing_user_id, status, vn_day_start, vn_day_end) WHERE (is_metered = true);


--
-- Name: idx_sqr_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sqr_employee ON public.send_quota_reservations USING btree (billing_user_id, actor_user_id, channel, status, vn_day_start, vn_day_end) WHERE ((actor_user_id IS NOT NULL) AND (is_metered = true));


--
-- Name: idx_sqr_sweeper; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sqr_sweeper ON public.send_quota_reservations USING btree (status, expires_at) WHERE ((status)::text = ANY ((ARRAY['reserved'::character varying, 'sending'::character varying])::text[]));


--
-- Name: idx_sqr_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sqr_wallet ON public.send_quota_reservations USING btree (billing_user_id, wallet_item_key, status) WHERE ((wallet_quantity > 0) AND ((status)::text = ANY ((ARRAY['reserved'::character varying, 'sending'::character varying, 'uncertain'::character varying])::text[])));


--
-- Name: idx_sqsm_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sqsm_created_at ON public.send_quota_shadow_mismatches USING btree (created_at);


--
-- Name: idx_storage_objects_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_storage_objects_expiry ON public.storage_objects USING btree (expires_at) WHERE (((state)::text = 'temp'::text) AND (expires_at IS NOT NULL));


--
-- Name: idx_storage_objects_owner_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_storage_objects_owner_usage ON public.storage_objects USING btree (owner_user_id, pool_type, state) WHERE ((state)::text = ANY ((ARRAY['active'::character varying, 'temp'::character varying, 'cleanup_pending'::character varying])::text[]));


--
-- Name: idx_storage_objects_storage_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_storage_objects_storage_key ON public.storage_objects USING btree (storage_key);


--
-- Name: idx_studio_conv_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_conv_chatbot ON public.chatbot_studio_conversations USING btree (id_chatbot);


--
-- Name: idx_studio_conv_last_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_conv_last_msg ON public.chatbot_studio_conversations USING btree (id_user, last_message_at DESC);


--
-- Name: idx_studio_conv_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_conv_session ON public.chatbot_studio_conversations USING btree (session_id);


--
-- Name: idx_studio_conv_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_conv_status ON public.chatbot_studio_conversations USING btree (id_user, status);


--
-- Name: idx_studio_conv_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_conv_user ON public.chatbot_studio_conversations USING btree (id_user);


--
-- Name: idx_studio_msg_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_msg_conv ON public.chatbot_studio_messages USING btree (id_conversation);


--
-- Name: idx_studio_msg_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_msg_created ON public.chatbot_studio_messages USING btree (id_conversation, created_at DESC);


--
-- Name: idx_sub_assistants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_assistants_user ON public.sub_assistants USING btree (id_user);


--
-- Name: idx_sub_assistants_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_assistants_user_active ON public.sub_assistants USING btree (id_user) WHERE (is_active = true);


--
-- Name: idx_support_ticket_messages_ticket_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_ticket_messages_ticket_created ON public.support_ticket_messages USING btree (ticket_id, created_at);


--
-- Name: idx_support_tickets_status_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status_last_message ON public.support_tickets USING btree (status, last_message_at DESC);


--
-- Name: idx_support_tickets_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_user_created ON public.support_tickets USING btree (user_id, created_at DESC);


--
-- Name: idx_system_payment_accounts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_payment_accounts_active ON public.system_payment_accounts USING btree (is_active, is_default DESC);


--
-- Name: idx_telegram_accounts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_accounts_active ON public.telegram_accounts USING btree (id_user, is_active);


--
-- Name: idx_telegram_accounts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_accounts_user ON public.telegram_accounts USING btree (id_user);


--
-- Name: idx_telegram_conv_account_peer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_conv_account_peer ON public.telegram_personal_conversations USING btree (id_telegram_account, external_id);


--
-- Name: idx_telegram_conv_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_conv_chatbot ON public.telegram_personal_conversations USING btree (id_chatbot);


--
-- Name: idx_telegram_conv_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_conv_user ON public.telegram_personal_conversations USING btree (id_user);


--
-- Name: idx_telegram_msg_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_msg_conv ON public.telegram_personal_messages USING btree (id_conversation, created_at DESC);


--
-- Name: idx_telegram_msg_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_msg_user ON public.telegram_personal_messages USING btree (id_user);


--
-- Name: idx_telegram_session_state_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_session_state_updated ON public.telegram_session_state USING btree (updated_at DESC);


--
-- Name: idx_telegram_settings_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_settings_account ON public.telegram_chatbot_settings USING btree (id_telegram_account);


--
-- Name: idx_telegram_settings_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_settings_chatbot ON public.telegram_chatbot_settings USING btree (id_chatbot);


--
-- Name: idx_telegram_settings_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_settings_enabled ON public.telegram_chatbot_settings USING btree (id_chatbot) WHERE (is_enabled = true);


--
-- Name: idx_template_files_storage_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_files_storage_key ON public.template_files USING btree (storage_key);


--
-- Name: idx_template_files_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_files_template_id ON public.template_files USING btree (template_id);


--
-- Name: idx_template_labels_workspace_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_labels_workspace_owner ON public.template_labels USING btree (workspace_owner_id);


--
-- Name: idx_tiktok_business_accounts_expiring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiktok_business_accounts_expiring ON public.tiktok_business_accounts USING btree (access_token_expires_at) WHERE (is_active = true);


--
-- Name: idx_tiktok_business_accounts_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiktok_business_accounts_user_active ON public.tiktok_business_accounts USING btree (id_user, is_active);


--
-- Name: idx_tiktok_outbound_log_business_user_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiktok_outbound_log_business_user_recent ON public.tiktok_outbound_log USING btree (business_id, unique_identifier, sent_at DESC);


--
-- Name: idx_tiktok_outbound_log_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiktok_outbound_log_sent_at ON public.tiktok_outbound_log USING btree (sent_at);


--
-- Name: idx_tiktok_scheduled_posts_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiktok_scheduled_posts_due ON public.tiktok_scheduled_posts USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_tiktok_scheduled_posts_polling; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiktok_scheduled_posts_polling ON public.tiktok_scheduled_posts USING btree (next_poll_at) WHERE (status = 'processing'::text);


--
-- Name: idx_tiktok_scheduled_posts_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiktok_scheduled_posts_user_time ON public.tiktok_scheduled_posts USING btree (id_user, scheduled_at DESC);


--
-- Name: idx_topup_debits_user_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topup_debits_user_item ON public.topup_debits USING btree (user_id, item_key);


--
-- Name: idx_topup_grants_user_item_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topup_grants_user_item_cycle ON public.topup_grants USING btree (user_id, item_key, cycle_end);


--
-- Name: idx_topup_locked_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topup_locked_user ON public.topup_locked_resources USING btree (user_id, resource_key);


--
-- Name: idx_usage_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_logs_actor ON public.usage_logs USING btree (actor_user_id) WHERE (actor_user_id IS NOT NULL);


--
-- Name: idx_usage_logs_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_logs_period ON public.usage_logs USING btree (period_start, period_end);


--
-- Name: idx_usage_logs_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_logs_resource ON public.usage_logs USING btree (resource_type);


--
-- Name: idx_usage_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_logs_user ON public.usage_logs USING btree (id_user);


--
-- Name: idx_user_consents_user_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_consents_user_purpose ON public.user_consents USING btree (user_id, purpose, created_at DESC);


--
-- Name: idx_user_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notifications_user_created ON public.user_notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_user_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notifications_user_unread ON public.user_notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: idx_user_whatsapp_app_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_whatsapp_app_active ON public.user_whatsapp_app_credentials USING btree (id_user, is_active) WHERE (is_active = true);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_id_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_id_role ON public.users USING btree (id_role);


--
-- Name: idx_users_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_phone_unique ON public.users USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: idx_users_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_referral_code ON public.users USING btree (referral_code) WHERE (referral_code IS NOT NULL);


--
-- Name: idx_users_referred_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_referred_by ON public.users USING btree (referred_by_user_id);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_subscription_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_subscription_expires ON public.users USING btree (subscription_expires_at) WHERE (subscription_expires_at IS NOT NULL);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_verification_codes_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_codes_email ON public.verification_codes USING btree (email);


--
-- Name: idx_verification_codes_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_codes_expires ON public.verification_codes USING btree (expires_at);


--
-- Name: idx_verification_codes_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_codes_phone ON public.verification_codes USING btree (phone, type, created_at DESC);


--
-- Name: idx_voucher_redemptions_voucher_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voucher_redemptions_voucher_user ON public.voucher_redemptions USING btree (voucher_id, user_id, lower((user_email)::text));


--
-- Name: idx_vouchers_active_auto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_active_auto ON public.vouchers USING btree (is_active, auto_apply, starts_at, ends_at);


--
-- Name: idx_vouchers_offer_mode_eligibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_offer_mode_eligibility ON public.vouchers USING btree (offer_mode, is_active, starts_at, ends_at);


--
-- Name: idx_webchat_conv_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conv_session ON public.webchat_conversations USING btree (session_id);


--
-- Name: idx_webchat_conv_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conv_user ON public.webchat_conversations USING btree (id_user);


--
-- Name: idx_webchat_conv_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conv_user_status ON public.webchat_conversations USING btree (id_user, status);


--
-- Name: idx_webchat_conv_widget; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conv_widget ON public.webchat_conversations USING btree (id_widget_config);


--
-- Name: idx_webchat_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_last_message ON public.webchat_conversations USING btree (last_message_at DESC);


--
-- Name: idx_webchat_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_conversations_status ON public.webchat_conversations USING btree (status);


--
-- Name: idx_webchat_messages_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_messages_conv ON public.webchat_messages USING btree (id_conversation);


--
-- Name: idx_webchat_messages_conv_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_messages_conv_created ON public.webchat_messages USING btree (id_conversation, created_at DESC);


--
-- Name: idx_whatsapp_account_settings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_account_settings_user ON public.whatsapp_account_settings USING btree (id_user);


--
-- Name: idx_whatsapp_baileys_session_keys_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_baileys_session_keys_session ON public.whatsapp_baileys_session_keys USING btree (session_key);


--
-- Name: idx_widget_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_widget_key ON public.web_widget_configs USING btree (widget_key);


--
-- Name: idx_widget_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_widget_user ON public.web_widget_configs USING btree (id_user);


--
-- Name: idx_zalo_accounts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_accounts_active ON public.zalo_accounts USING btree (id_user, is_active) WHERE (is_active = true);


--
-- Name: idx_zalo_accounts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_accounts_user ON public.zalo_accounts USING btree (id_user);


--
-- Name: idx_zalo_friends_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_friends_search ON public.zalo_friends USING btree (id_zalo_setting, display_name);


--
-- Name: idx_zalo_friends_setting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_friends_setting ON public.zalo_friends USING btree (id_zalo_setting);


--
-- Name: idx_zalo_groups_setting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_groups_setting ON public.zalo_groups USING btree (id_zalo_setting);


--
-- Name: idx_zalo_messages_account_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_account_created ON public.zalo_messages USING btree (account_id, created_at DESC) WHERE (account_id IS NOT NULL);


--
-- Name: idx_zalo_messages_account_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_account_sent ON public.zalo_messages USING btree (account_id, sent_at) WHERE ((account_id IS NOT NULL) AND (NOT is_preview));


--
-- Name: idx_zalo_messages_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_campaign ON public.zalo_messages USING btree (id_campaign, id_run);


--
-- Name: idx_zalo_messages_campaign_preview; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_campaign_preview ON public.zalo_messages USING btree (id_campaign) WHERE (NOT is_preview);


--
-- Name: idx_zalo_messages_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_channel ON public.zalo_messages USING btree (channel);


--
-- Name: idx_zalo_messages_channel_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_channel_created ON public.zalo_messages USING btree (channel, created_at DESC);


--
-- Name: idx_zalo_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_created ON public.zalo_messages USING btree (created_at);


--
-- Name: idx_zalo_messages_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_customer ON public.zalo_messages USING btree (id_customer, id_run);


--
-- Name: idx_zalo_messages_node_channel_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_node_channel_created ON public.zalo_messages USING btree (id_node, channel, created_at) WHERE ((tracking_metadata ->> 'status'::text) = 'sent'::text);


--
-- Name: idx_zalo_messages_owner_actor_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_owner_actor_sent ON public.zalo_messages USING btree (workspace_owner_id, actor_user_id, sent_at);


--
-- Name: idx_zalo_messages_owner_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_owner_sent ON public.zalo_messages USING btree (workspace_owner_id, sent_at);


--
-- Name: idx_zalo_messages_quota_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_quota_count ON public.zalo_messages USING btree (id_campaign, sent_at) WHERE ((tracking_metadata ->> 'status'::text) = 'sent'::text);


--
-- Name: idx_zalo_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_status ON public.zalo_messages USING btree (status);


--
-- Name: idx_zalo_messages_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_messages_token ON public.zalo_messages USING btree (tracking_token);


--
-- Name: idx_zalo_personal_conv_ai_paused; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_conv_ai_paused ON public.zalo_personal_conversations USING btree (id_user, ai_paused) WHERE (ai_paused = true);


--
-- Name: idx_zalo_personal_conv_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_conv_chatbot ON public.zalo_personal_conversations USING btree (id_user, id_zalo_setting, id_chatbot) WHERE (id_chatbot IS NOT NULL);


--
-- Name: idx_zalo_personal_conv_last_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_conv_last_msg ON public.zalo_personal_conversations USING btree (last_message_at DESC);


--
-- Name: idx_zalo_personal_conv_session_reset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_conv_session_reset ON public.zalo_personal_conversations USING btree (session_reset_at DESC) WHERE (session_reset_at IS NOT NULL);


--
-- Name: idx_zalo_personal_conv_setting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_conv_setting ON public.zalo_personal_conversations USING btree (id_zalo_setting);


--
-- Name: idx_zalo_personal_conv_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_conv_status ON public.zalo_personal_conversations USING btree (id_user, status);


--
-- Name: idx_zalo_personal_conv_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_conv_user ON public.zalo_personal_conversations USING btree (id_user);


--
-- Name: idx_zalo_personal_msg_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_msg_conv ON public.zalo_personal_messages USING btree (id_conversation);


--
-- Name: idx_zalo_personal_msg_conv_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_msg_conv_created ON public.zalo_personal_messages USING btree (id_conversation, created_at DESC, id DESC);


--
-- Name: idx_zalo_personal_msg_conv_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_msg_conv_unread ON public.zalo_personal_messages USING btree (id_conversation) WHERE (((role)::text = 'visitor'::text) AND (is_read = false));


--
-- Name: idx_zalo_personal_msg_quota_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_msg_quota_count ON public.zalo_personal_messages USING btree (id_user, created_at) WHERE (((role)::text = 'agent'::text) AND ((metadata ->> 'source'::text) = 'manual_inbox'::text));


--
-- Name: idx_zalo_personal_msg_setting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_msg_setting ON public.zalo_personal_messages USING btree (id_zalo_setting);


--
-- Name: idx_zalo_personal_msg_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_personal_msg_user_created ON public.zalo_personal_messages USING btree (id_user, created_at);


--
-- Name: idx_zalo_sender_bindings_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_sender_bindings_account ON public.zalo_personal_sender_bindings USING btree (id_zalo_account);


--
-- Name: idx_zalo_sender_bindings_campaign_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_sender_bindings_campaign_run ON public.zalo_personal_sender_bindings USING btree (id_campaign_run);


--
-- Name: idx_zalo_sender_bindings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_sender_bindings_user ON public.zalo_personal_sender_bindings USING btree (id_user);


--
-- Name: idx_zalo_settings_phone_lookup_cooldown; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_settings_phone_lookup_cooldown ON public.zalo_settings USING btree (phone_lookup_cooldown_until) WHERE (phone_lookup_cooldown_until IS NOT NULL);


--
-- Name: idx_zalo_settings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_settings_user ON public.zalo_settings USING btree (id_user);


--
-- Name: idx_zalo_settings_user_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_settings_user_default ON public.zalo_settings USING btree (id_user, is_default);


--
-- Name: idx_zalo_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_templates_category ON public.zalo_templates USING btree (category);


--
-- Name: idx_zalo_templates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_templates_user ON public.zalo_templates USING btree (id_user);


--
-- Name: idx_zalo_unreachable_phones_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_unreachable_phones_user ON public.zalo_unreachable_phones USING btree (id_user);


--
-- Name: idx_zalo_unreachable_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zalo_unreachable_updated ON public.zalo_unreachable_phones USING btree (updated_at DESC);


--
-- Name: idx_zup_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zup_user ON public.zalo_unreachable_phones USING btree (id_user);


--
-- Name: ix_tracking_short_links_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tracking_short_links_created_at ON public.tracking_short_links USING btree (created_at DESC);


--
-- Name: ix_tracking_short_links_tracking_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tracking_short_links_tracking_token ON public.tracking_short_links USING btree (tracking_token);


--
-- Name: uk_email_messages_tracking_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uk_email_messages_tracking_token ON public.email_messages USING btree (tracking_token) WHERE (tracking_token IS NOT NULL);


--
-- Name: uniq_chatbot_message_conversation_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_chatbot_message_conversation_external ON public.chatbot_messages USING btree (id_conversation, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: uniq_webchat_active_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_webchat_active_session ON public.webchat_conversations USING btree (id_widget_config, session_id) WHERE ((session_id IS NOT NULL) AND ((status)::text = 'active'::text));


--
-- Name: uniq_zalo_personal_msg_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_zalo_personal_msg_external ON public.zalo_personal_messages USING btree (id_zalo_setting, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: uniq_zalo_settings_live_zalo_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_zalo_settings_live_zalo_user ON public.zalo_settings USING btree (zalo_user_id) WHERE ((zalo_user_id IS NOT NULL) AND (is_active = true) AND ((status)::text = 'connected'::text));


--
-- Name: uq_campaign_schedules_enabled_dup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_campaign_schedules_enabled_dup ON public.campaign_schedules USING btree (id_campaign, schedule_type, cron_expression) WHERE enabled;


--
-- Name: uq_chatbot_channel_legacy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_chatbot_channel_legacy ON public.chatbot_channel_connections USING btree (id_chatbot, channel_type) WHERE ((channel_type)::text = ANY ((ARRAY['zalo_oa'::character varying, 'facebook'::character varying])::text[]));


--
-- Name: uq_chatbot_channel_whatsapp; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_chatbot_channel_whatsapp ON public.chatbot_channel_connections USING btree (id_chatbot, channel_type, external_channel_id) WHERE ((channel_type)::text = 'whatsapp'::text);


--
-- Name: uq_chatbot_shares_chatbot_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_chatbot_shares_chatbot_recipient ON public.chatbot_shares USING btree (id_chatbot, id_recipient) WHERE (id_recipient IS NOT NULL);


--
-- Name: uq_cm_quota_reservation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_cm_quota_reservation_id ON public.channel_messages USING btree (quota_reservation_id) WHERE (quota_reservation_id IS NOT NULL);


--
-- Name: uq_crrs_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crrs_progress ON public.campaign_run_recipient_steps USING btree (id_run, id_node, channel, recipient_key);


--
-- Name: uq_customer_tags_ws_lower_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_customer_tags_ws_lower_name ON public.customer_tags USING btree (workspace_owner_id, lower((name)::text));


--
-- Name: uq_em_quota_reservation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_em_quota_reservation_id ON public.email_messages USING btree (quota_reservation_id) WHERE (quota_reservation_id IS NOT NULL);


--
-- Name: uq_form_submissions_payment_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_form_submissions_payment_code ON public.form_submissions USING btree (workspace_owner_id, payment_code) WHERE (payment_code IS NOT NULL);


--
-- Name: uq_landing_page_domains_hostname_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_landing_page_domains_hostname_lower ON public.landing_page_domains USING btree (lower(hostname));


--
-- Name: uq_landing_page_domains_landing_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_landing_page_domains_landing_page_id ON public.landing_page_domains USING btree (landing_page_id);


--
-- Name: uq_landing_pages_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_landing_pages_slug ON public.landing_pages USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: uq_scheduled_plan_change_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_scheduled_plan_change_pending ON public.scheduled_plan_changes USING btree (user_id) WHERE ((status)::text = 'pending'::text);


--
-- Name: uq_system_payment_accounts_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_system_payment_accounts_default ON public.system_payment_accounts USING btree (is_default) WHERE (is_default = true);


--
-- Name: uq_ul_quota_reservation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ul_quota_reservation_id ON public.usage_logs USING btree (quota_reservation_id) WHERE (quota_reservation_id IS NOT NULL);


--
-- Name: uq_user_notifications_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_notifications_dedupe ON public.user_notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: uq_user_whatsapp_app; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_whatsapp_app ON public.user_whatsapp_app_credentials USING btree (id_user, app_id);


--
-- Name: uq_user_whatsapp_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_whatsapp_default ON public.user_whatsapp_app_credentials USING btree (id_user) WHERE (is_default = true);


--
-- Name: uq_whatsapp_account_settings_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_whatsapp_account_settings_id ON public.whatsapp_account_settings USING btree (id);


--
-- Name: uq_zalo_settings_user_display_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zalo_settings_user_display_name ON public.zalo_settings USING btree (id_user, display_name);


--
-- Name: uq_zm_quota_reservation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zm_quota_reservation_id ON public.zalo_messages USING btree (quota_reservation_id) WHERE (quota_reservation_id IS NOT NULL);


--
-- Name: uq_zpm_quota_reservation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zpm_quota_reservation_id ON public.zalo_personal_messages USING btree (quota_reservation_id) WHERE (quota_reservation_id IS NOT NULL);


--
-- Name: ux_tracking_short_links_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_tracking_short_links_code ON public.tracking_short_links USING btree (short_code);


--
-- Name: vouchers_code_active_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vouchers_code_active_uniq ON public.vouchers USING btree (code) WHERE (is_active = true);


--
-- Name: campaign_shares trg_campaign_shares_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_campaign_shares_updated_at BEFORE UPDATE ON public.campaign_shares FOR EACH ROW EXECUTE FUNCTION public.update_campaign_shares_timestamp();


--
-- Name: channel_connections trg_facebook_token_tracking; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_facebook_token_tracking AFTER UPDATE OF credentials ON public.channel_connections FOR EACH ROW WHEN (((old.channel)::text = 'facebook'::text)) EXECUTE FUNCTION public.update_facebook_token_tracking();


--
-- Name: landing_page_shares trg_landing_page_shares_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_landing_page_shares_updated_at BEFORE UPDATE ON public.landing_page_shares FOR EACH ROW EXECUTE FUNCTION public.update_landing_page_shares_timestamp();


--
-- Name: marketplace_listings trg_marketplace_listings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_listings_updated_at BEFORE UPDATE ON public.marketplace_listings FOR EACH ROW EXECUTE FUNCTION public.update_marketplace_listing_timestamp();


--
-- Name: marketplace_reviews trg_marketplace_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_reviews_updated_at BEFORE UPDATE ON public.marketplace_reviews FOR EACH ROW EXECUTE FUNCTION public.update_marketplace_reviews_timestamp();


--
-- Name: marketplace_seller_stats trg_seller_stats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seller_stats_updated_at BEFORE UPDATE ON public.marketplace_seller_stats FOR EACH ROW EXECUTE FUNCTION public.update_marketplace_seller_stats_timestamp();


--
-- Name: campaigns trg_set_campaign_origin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_campaign_origin BEFORE INSERT OR UPDATE OF marketplace_purchase_id ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_campaign_origin_trigger();


--
-- Name: campaign_shares trg_update_campaign_share_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_campaign_share_count AFTER INSERT OR DELETE ON public.campaign_shares FOR EACH ROW EXECUTE FUNCTION public.update_campaign_share_count();


--
-- Name: landing_page_shares trg_update_landing_page_share_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_landing_page_share_count AFTER INSERT OR DELETE ON public.landing_page_shares FOR EACH ROW EXECUTE FUNCTION public.update_landing_page_share_count();


--
-- Name: email_settings update_email_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_settings_updated_at BEFORE UPDATE ON public.email_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_menu_layouts admin_menu_layouts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_menu_layouts
    ADD CONSTRAINT admin_menu_layouts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: affiliate_ledger affiliate_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_ledger
    ADD CONSTRAINT affiliate_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: affiliate_periods affiliate_periods_referrer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_periods
    ADD CONSTRAINT affiliate_periods_referrer_user_id_fkey FOREIGN KEY (referrer_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: affiliate_revenue_events affiliate_revenue_events_buyer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_revenue_events
    ADD CONSTRAINT affiliate_revenue_events_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: affiliate_revenue_events affiliate_revenue_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_revenue_events
    ADD CONSTRAINT affiliate_revenue_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- Name: affiliate_revenue_events affiliate_revenue_events_referrer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_revenue_events
    ADD CONSTRAINT affiliate_revenue_events_referrer_user_id_fkey FOREIGN KEY (referrer_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: affiliate_withdrawals affiliate_withdrawals_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_withdrawals
    ADD CONSTRAINT affiliate_withdrawals_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: affiliate_withdrawals affiliate_withdrawals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_withdrawals
    ADD CONSTRAINT affiliate_withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: ai_activity_summaries ai_activity_summaries_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_activity_summaries
    ADD CONSTRAINT ai_activity_summaries_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_chat_messages ai_chat_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_messages
    ADD CONSTRAINT ai_chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE;


--
-- Name: ai_chat_sessions ai_chat_sessions_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_sessions
    ADD CONSTRAINT ai_chat_sessions_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_unavailable_notices ai_unavailable_notices_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_unavailable_notices
    ADD CONSTRAINT ai_unavailable_notices_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: alert_events alert_events_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: alert_events alert_events_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.alert_rules(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_profile_chunks business_profile_chunks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profile_chunks
    ADD CONSTRAINT business_profile_chunks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: business_profiles business_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profiles
    ADD CONSTRAINT business_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaign_channel_messages campaign_channel_messages_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_channel_messages
    ADD CONSTRAINT campaign_channel_messages_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: campaign_channel_messages campaign_channel_messages_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_channel_messages
    ADD CONSTRAINT campaign_channel_messages_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: campaign_channel_messages campaign_channel_messages_id_node_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_channel_messages
    ADD CONSTRAINT campaign_channel_messages_id_node_fkey FOREIGN KEY (id_node) REFERENCES public.campaign_nodes(id) ON DELETE SET NULL;


--
-- Name: campaign_channel_messages campaign_channel_messages_id_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_channel_messages
    ADD CONSTRAINT campaign_channel_messages_id_run_fkey FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE SET NULL;


--
-- Name: campaign_channel_messages campaign_channel_messages_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_channel_messages
    ADD CONSTRAINT campaign_channel_messages_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: campaign_connections campaign_connections_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_connections
    ADD CONSTRAINT campaign_connections_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_connections campaign_connections_source_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_connections
    ADD CONSTRAINT campaign_connections_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.campaign_nodes(id) ON DELETE CASCADE;


--
-- Name: campaign_connections campaign_connections_target_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_connections
    ADD CONSTRAINT campaign_connections_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.campaign_nodes(id) ON DELETE CASCADE;


--
-- Name: campaign_customers campaign_customers_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_customers
    ADD CONSTRAINT campaign_customers_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_customers campaign_customers_id_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_customers
    ADD CONSTRAINT campaign_customers_id_customer_fkey FOREIGN KEY (id_customer) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: campaign_customers campaign_customers_source_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_customers
    ADD CONSTRAINT campaign_customers_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.campaign_nodes(id) ON DELETE SET NULL;


--
-- Name: campaign_executions campaign_executions_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_executions
    ADD CONSTRAINT campaign_executions_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_executions campaign_executions_id_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_executions
    ADD CONSTRAINT campaign_executions_id_customer_fkey FOREIGN KEY (id_customer) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: campaign_executions campaign_executions_id_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_executions
    ADD CONSTRAINT campaign_executions_id_run_fkey FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE SET NULL;


--
-- Name: campaign_nodes campaign_nodes_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_nodes
    ADD CONSTRAINT campaign_nodes_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_nodes campaign_nodes_id_email_setting_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_nodes
    ADD CONSTRAINT campaign_nodes_id_email_setting_fkey FOREIGN KEY (id_email_setting) REFERENCES public.email_settings(id) ON DELETE SET NULL;


--
-- Name: campaign_nodes campaign_nodes_id_email_template_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_nodes
    ADD CONSTRAINT campaign_nodes_id_email_template_fkey FOREIGN KEY (id_email_template) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: campaign_participations campaign_participations_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_participations
    ADD CONSTRAINT campaign_participations_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_participations campaign_participations_id_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_participations
    ADD CONSTRAINT campaign_participations_id_customer_fkey FOREIGN KEY (id_customer) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: campaign_participations campaign_participations_id_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_participations
    ADD CONSTRAINT campaign_participations_id_run_fkey FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE SET NULL;


--
-- Name: campaign_runs campaign_runs_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_runs
    ADD CONSTRAINT campaign_runs_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_runs campaign_runs_id_schedule_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_runs
    ADD CONSTRAINT campaign_runs_id_schedule_fkey FOREIGN KEY (id_schedule) REFERENCES public.campaign_schedules(id) ON DELETE SET NULL;


--
-- Name: campaign_runs campaign_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_runs
    ADD CONSTRAINT campaign_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: campaign_runs campaign_runs_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_runs
    ADD CONSTRAINT campaign_runs_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaign_schedules campaign_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_schedules
    ADD CONSTRAINT campaign_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: campaign_schedules campaign_schedules_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_schedules
    ADD CONSTRAINT campaign_schedules_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_schedules campaign_schedules_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_schedules
    ADD CONSTRAINT campaign_schedules_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaign_shares campaign_shares_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_shares
    ADD CONSTRAINT campaign_shares_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_shares campaign_shares_id_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_shares
    ADD CONSTRAINT campaign_shares_id_owner_fkey FOREIGN KEY (id_owner) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaign_shares campaign_shares_id_recipient_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_shares
    ADD CONSTRAINT campaign_shares_id_recipient_fkey FOREIGN KEY (id_recipient) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_marketplace_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_marketplace_purchase_id_fkey FOREIGN KEY (marketplace_purchase_id) REFERENCES public.marketplace_purchases(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channel_connections channel_connections_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT channel_connections_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channel_conversations channel_conversations_id_channel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_conversations
    ADD CONSTRAINT channel_conversations_id_channel_fkey FOREIGN KEY (id_channel) REFERENCES public.channel_connections(id) ON DELETE CASCADE;


--
-- Name: channel_conversations channel_conversations_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_conversations
    ADD CONSTRAINT channel_conversations_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channel_disconnect_alerts channel_disconnect_alerts_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_disconnect_alerts
    ADD CONSTRAINT channel_disconnect_alerts_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channel_messages channel_messages_id_channel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_messages
    ADD CONSTRAINT channel_messages_id_channel_fkey FOREIGN KEY (id_channel) REFERENCES public.channel_connections(id) ON DELETE CASCADE;


--
-- Name: channel_messages channel_messages_id_conversation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_messages
    ADD CONSTRAINT channel_messages_id_conversation_fkey FOREIGN KEY (id_conversation) REFERENCES public.channel_conversations(id) ON DELETE CASCADE;


--
-- Name: channel_messages channel_messages_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_messages
    ADD CONSTRAINT channel_messages_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_attachments chat_attachments_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_attachments chat_attachments_storage_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_storage_object_id_fkey FOREIGN KEY (storage_object_id) REFERENCES public.storage_objects(id) ON DELETE SET NULL;


--
-- Name: chatbot_channel_connections chatbot_channel_connections_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_channel_connections
    ADD CONSTRAINT chatbot_channel_connections_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE CASCADE;


--
-- Name: chatbot_contact_alerts chatbot_contact_alerts_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_contact_alerts
    ADD CONSTRAINT chatbot_contact_alerts_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_contact_alerts chatbot_contact_alerts_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_contact_alerts
    ADD CONSTRAINT chatbot_contact_alerts_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_conversations chatbot_conversations_id_channel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_id_channel_fkey FOREIGN KEY (id_channel) REFERENCES public.chatbot_channel_connections(id) ON DELETE SET NULL;


--
-- Name: chatbot_conversations chatbot_conversations_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE CASCADE;


--
-- Name: chatbot_digest_log chatbot_digest_log_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_digest_log
    ADD CONSTRAINT chatbot_digest_log_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_messages chatbot_messages_id_conversation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_id_conversation_fkey FOREIGN KEY (id_conversation) REFERENCES public.chatbot_conversations(id) ON DELETE CASCADE;


--
-- Name: chatbot_settings chatbot_settings_id_sub_assistant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings
    ADD CONSTRAINT chatbot_settings_id_sub_assistant_fkey FOREIGN KEY (id_sub_assistant) REFERENCES public.sub_assistants(id) ON DELETE SET NULL;


--
-- Name: chatbot_settings chatbot_settings_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings
    ADD CONSTRAINT chatbot_settings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_shares chatbot_shares_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_shares
    ADD CONSTRAINT chatbot_shares_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE CASCADE;


--
-- Name: chatbot_shares chatbot_shares_id_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_shares
    ADD CONSTRAINT chatbot_shares_id_owner_fkey FOREIGN KEY (id_owner) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_shares chatbot_shares_id_recipient_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_shares
    ADD CONSTRAINT chatbot_shares_id_recipient_fkey FOREIGN KEY (id_recipient) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_studio_conversations chatbot_studio_conversations_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_studio_conversations
    ADD CONSTRAINT chatbot_studio_conversations_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE CASCADE;


--
-- Name: chatbot_studio_conversations chatbot_studio_conversations_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_studio_conversations
    ADD CONSTRAINT chatbot_studio_conversations_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_studio_messages chatbot_studio_messages_id_conversation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_studio_messages
    ADD CONSTRAINT chatbot_studio_messages_id_conversation_fkey FOREIGN KEY (id_conversation) REFERENCES public.chatbot_studio_conversations(id) ON DELETE CASCADE;


--
-- Name: chatbot_whatsapp_account_settings chatbot_whatsapp_account_settings_id_channel_connection_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_account_settings
    ADD CONSTRAINT chatbot_whatsapp_account_settings_id_channel_connection_fkey FOREIGN KEY (id_channel_connection) REFERENCES public.chatbot_channel_connections(id) ON DELETE CASCADE;


--
-- Name: chatbot_whatsapp_account_settings chatbot_whatsapp_account_settings_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_account_settings
    ADD CONSTRAINT chatbot_whatsapp_account_settings_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE CASCADE;


--
-- Name: chatbot_whatsapp_account_settings chatbot_whatsapp_account_settings_id_sub_assistant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_account_settings
    ADD CONSTRAINT chatbot_whatsapp_account_settings_id_sub_assistant_fkey FOREIGN KEY (id_sub_assistant) REFERENCES public.sub_assistants(id) ON DELETE SET NULL;


--
-- Name: chatbot_whatsapp_account_settings chatbot_whatsapp_account_settings_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_account_settings
    ADD CONSTRAINT chatbot_whatsapp_account_settings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_whatsapp_baileys_settings chatbot_whatsapp_baileys_settings_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_baileys_settings
    ADD CONSTRAINT chatbot_whatsapp_baileys_settings_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE CASCADE;


--
-- Name: chatbot_whatsapp_baileys_settings chatbot_whatsapp_baileys_settings_id_sub_assistant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_baileys_settings
    ADD CONSTRAINT chatbot_whatsapp_baileys_settings_id_sub_assistant_fkey FOREIGN KEY (id_sub_assistant) REFERENCES public.sub_assistants(id) ON DELETE SET NULL;


--
-- Name: chatbot_whatsapp_baileys_settings chatbot_whatsapp_baileys_settings_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_whatsapp_baileys_settings
    ADD CONSTRAINT chatbot_whatsapp_baileys_settings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_zalo_account_settings chatbot_zalo_account_settings_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_zalo_account_settings
    ADD CONSTRAINT chatbot_zalo_account_settings_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE SET NULL;


--
-- Name: chatbot_zalo_account_settings chatbot_zalo_account_settings_id_sub_assistant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_zalo_account_settings
    ADD CONSTRAINT chatbot_zalo_account_settings_id_sub_assistant_fkey FOREIGN KEY (id_sub_assistant) REFERENCES public.sub_assistants(id) ON DELETE SET NULL;


--
-- Name: chatbot_zalo_account_settings chatbot_zalo_account_settings_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_zalo_account_settings
    ADD CONSTRAINT chatbot_zalo_account_settings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_zalo_account_settings chatbot_zalo_account_settings_id_zalo_setting_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_zalo_account_settings
    ADD CONSTRAINT chatbot_zalo_account_settings_id_zalo_setting_fkey FOREIGN KEY (id_zalo_setting) REFERENCES public.zalo_settings(id) ON DELETE CASCADE;


--
-- Name: course_relations course_relations_id_course_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_relations
    ADD CONSTRAINT course_relations_id_course_fkey FOREIGN KEY (id_course) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_relations course_relations_id_related_course_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_relations
    ADD CONSTRAINT course_relations_id_related_course_fkey FOREIGN KEY (id_related_course) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: courses courses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: courses courses_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: courses courses_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: custom_chatbot_chunks custom_chatbot_chunks_document_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbot_chunks
    ADD CONSTRAINT custom_chatbot_chunks_document_fk FOREIGN KEY (document_id) REFERENCES public.custom_chatbot_documents(id) ON DELETE CASCADE;


--
-- Name: custom_chatbot_documents custom_chatbot_documents_chatbot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbot_documents
    ADD CONSTRAINT custom_chatbot_documents_chatbot_id_fkey FOREIGN KEY (chatbot_id) REFERENCES public.custom_chatbots(id) ON DELETE CASCADE;


--
-- Name: custom_chatbot_documents custom_chatbot_documents_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbot_documents
    ADD CONSTRAINT custom_chatbot_documents_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: custom_chatbots custom_chatbots_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_chatbots
    ADD CONSTRAINT custom_chatbots_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: custom_domain_ssl custom_domain_ssl_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domain_ssl
    ADD CONSTRAINT custom_domain_ssl_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.custom_domains(id) ON DELETE CASCADE;


--
-- Name: custom_domain_verifications custom_domain_verifications_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domain_verifications
    ADD CONSTRAINT custom_domain_verifications_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.custom_domains(id) ON DELETE CASCADE;


--
-- Name: custom_domains custom_domains_landing_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_landing_page_id_fkey FOREIGN KEY (landing_page_id) REFERENCES public.landing_pages(id) ON DELETE SET NULL;


--
-- Name: custom_domains custom_domains_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: customer_journey customer_journey_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey
    ADD CONSTRAINT customer_journey_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: customer_journey customer_journey_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey
    ADD CONSTRAINT customer_journey_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: customer_journey customer_journey_id_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey
    ADD CONSTRAINT customer_journey_id_customer_fkey FOREIGN KEY (id_customer) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_journey customer_journey_id_email_message_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey
    ADD CONSTRAINT customer_journey_id_email_message_fkey FOREIGN KEY (id_email_message) REFERENCES public.email_messages(id) ON DELETE SET NULL;


--
-- Name: customer_journey customer_journey_id_node_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey
    ADD CONSTRAINT customer_journey_id_node_fkey FOREIGN KEY (id_node) REFERENCES public.campaign_nodes(id) ON DELETE SET NULL;


--
-- Name: customer_journey customer_journey_id_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey
    ADD CONSTRAINT customer_journey_id_run_fkey FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE SET NULL;


--
-- Name: customer_journey customer_journey_id_zalo_message_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_journey
    ADD CONSTRAINT customer_journey_id_zalo_message_fkey FOREIGN KEY (id_zalo_message) REFERENCES public.zalo_messages(id) ON DELETE SET NULL;


--
-- Name: customer_purchases customer_purchases_courses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_purchases
    ADD CONSTRAINT customer_purchases_courses_id_fk FOREIGN KEY (id_course) REFERENCES public.courses(id);


--
-- Name: customer_purchases customer_purchases_email_messages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_purchases
    ADD CONSTRAINT customer_purchases_email_messages_id_fk FOREIGN KEY (id_email_message) REFERENCES public.email_messages(id);


--
-- Name: customer_purchases customer_purchases_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_purchases
    ADD CONSTRAINT customer_purchases_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: customer_purchases customer_purchases_id_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_purchases
    ADD CONSTRAINT customer_purchases_id_customer_fkey FOREIGN KEY (id_customer) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_purchases customer_purchases_id_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_purchases
    ADD CONSTRAINT customer_purchases_id_run_fkey FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE SET NULL;


--
-- Name: customer_purchases customer_purchases_id_zalo_message_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_purchases
    ADD CONSTRAINT customer_purchases_id_zalo_message_fkey FOREIGN KEY (id_zalo_message) REFERENCES public.zalo_messages(id) ON DELETE SET NULL;


--
-- Name: customer_tag_assignments customer_tag_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tag_assignments
    ADD CONSTRAINT customer_tag_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: customer_tag_assignments customer_tag_assignments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tag_assignments
    ADD CONSTRAINT customer_tag_assignments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_tag_assignments customer_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tag_assignments
    ADD CONSTRAINT customer_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.customer_tags(id) ON DELETE CASCADE;


--
-- Name: customer_tags customer_tags_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: customers customers_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: customers customers_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dashboard_insights dashboard_insights_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_insights
    ADD CONSTRAINT dashboard_insights_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: diagnostic_messages diagnostic_messages_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostic_messages
    ADD CONSTRAINT diagnostic_messages_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.diagnostic_runs(id) ON DELETE CASCADE;


--
-- Name: diagnostic_runs diagnostic_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostic_runs
    ADD CONSTRAINT diagnostic_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: einvoices einvoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.einvoices
    ADD CONSTRAINT einvoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_id_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_id_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_id_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_id_customer_fkey FOREIGN KEY (id_customer) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_id_email_setting_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_id_email_setting_fkey FOREIGN KEY (id_email_setting) REFERENCES public.email_settings(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_id_email_template_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_id_email_template_fkey FOREIGN KEY (id_email_template) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_id_node_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_id_node_fkey FOREIGN KEY (id_node) REFERENCES public.campaign_nodes(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_id_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_id_run_fkey FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_settings email_settings_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_suppressions email_suppressions_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: facebook_token_tracking facebook_token_tracking_channel_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_token_tracking
    ADD CONSTRAINT facebook_token_tracking_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES public.channel_connections(id) ON DELETE CASCADE;


--
-- Name: file_access_events file_access_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_events
    ADD CONSTRAINT file_access_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: file_access_events file_access_events_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_events
    ADD CONSTRAINT file_access_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: file_access_events file_access_events_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_events
    ADD CONSTRAINT file_access_events_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.template_files(id) ON DELETE SET NULL;


--
-- Name: file_download_events file_download_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_download_events
    ADD CONSTRAINT file_download_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: file_download_events file_download_events_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_download_events
    ADD CONSTRAINT file_download_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: file_download_events file_download_events_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_download_events
    ADD CONSTRAINT file_download_events_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.template_files(id) ON DELETE SET NULL;


--
-- Name: file_download_events file_download_events_id_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_download_events
    ADD CONSTRAINT file_download_events_id_run_fkey FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE SET NULL;


--
-- Name: campaign_schedules fk_campaign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_schedules
    ADD CONSTRAINT fk_campaign FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_runs fk_campaign_run; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_runs
    ADD CONSTRAINT fk_campaign_run FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_run_recipient_steps fk_campaign_run_recipient_steps_campaign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_run_recipient_steps
    ADD CONSTRAINT fk_campaign_run_recipient_steps_campaign FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_run_recipient_steps fk_campaign_run_recipient_steps_run; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_run_recipient_steps
    ADD CONSTRAINT fk_campaign_run_recipient_steps_run FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE CASCADE;


--
-- Name: campaign_runs fk_schedule_run; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_runs
    ADD CONSTRAINT fk_schedule_run FOREIGN KEY (id_schedule) REFERENCES public.campaign_schedules(id) ON DELETE SET NULL;


--
-- Name: zalo_personal_sender_bindings fk_zalo_sender_binding_campaign_run; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_sender_bindings
    ADD CONSTRAINT fk_zalo_sender_binding_campaign_run FOREIGN KEY (id_campaign_run) REFERENCES public.campaign_runs(id) ON DELETE CASCADE;


--
-- Name: zalo_personal_sender_bindings fk_zalo_sender_binding_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_sender_bindings
    ADD CONSTRAINT fk_zalo_sender_binding_user FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: zalo_personal_sender_bindings fk_zalo_sender_binding_zalo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_sender_bindings
    ADD CONSTRAINT fk_zalo_sender_binding_zalo FOREIGN KEY (id_zalo_account) REFERENCES public.zalo_settings(id) ON DELETE CASCADE;


--
-- Name: zalo_unreachable_phones fk_zalo_unreachable_phones_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_unreachable_phones
    ADD CONSTRAINT fk_zalo_unreachable_phones_user FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: form_file_uploads form_file_uploads_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_file_uploads
    ADD CONSTRAINT form_file_uploads_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: form_file_uploads form_file_uploads_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_file_uploads
    ADD CONSTRAINT form_file_uploads_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: form_submissions form_submissions_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: form_submissions form_submissions_paid_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_paid_confirmed_by_fkey FOREIGN KEY (paid_confirmed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: form_submissions form_submissions_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: forms forms_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: forms forms_landing_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_landing_page_id_fkey FOREIGN KEY (landing_page_id) REFERENCES public.landing_pages(id) ON DELETE SET NULL;


--
-- Name: forms forms_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: forms forms_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: help_article_chunks help_article_chunks_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_chunks
    ADD CONSTRAINT help_article_chunks_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.help_articles(id) ON DELETE CASCADE;


--
-- Name: help_article_media help_article_media_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_article_media
    ADD CONSTRAINT help_article_media_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.help_articles(id) ON DELETE CASCADE;


--
-- Name: help_unanswered help_unanswered_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_unanswered
    ADD CONSTRAINT help_unanswered_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: kb_chunks kb_chunks_id_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks
    ADD CONSTRAINT kb_chunks_id_document_fkey FOREIGN KEY (id_document) REFERENCES public.kb_documents(id) ON DELETE CASCADE;


--
-- Name: kb_chunks kb_chunks_id_kb_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks
    ADD CONSTRAINT kb_chunks_id_kb_fkey FOREIGN KEY (id_kb) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;


--
-- Name: kb_chunks kb_chunks_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks
    ADD CONSTRAINT kb_chunks_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: kb_documents kb_documents_id_kb_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_documents
    ADD CONSTRAINT kb_documents_id_kb_fkey FOREIGN KEY (id_kb) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;


--
-- Name: kb_documents kb_documents_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_documents
    ADD CONSTRAINT kb_documents_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: knowledge_bases knowledge_bases_id_sub_assistant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_bases
    ADD CONSTRAINT knowledge_bases_id_sub_assistant_fkey FOREIGN KEY (id_sub_assistant) REFERENCES public.sub_assistants(id) ON DELETE SET NULL;


--
-- Name: knowledge_bases knowledge_bases_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_bases
    ADD CONSTRAINT knowledge_bases_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: landing_page_domains landing_page_domains_landing_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_domains
    ADD CONSTRAINT landing_page_domains_landing_page_id_fkey FOREIGN KEY (landing_page_id) REFERENCES public.landing_pages(id) ON DELETE CASCADE;


--
-- Name: landing_page_forms landing_page_forms_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_forms
    ADD CONSTRAINT landing_page_forms_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: landing_page_forms landing_page_forms_landing_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_forms
    ADD CONSTRAINT landing_page_forms_landing_page_id_fkey FOREIGN KEY (landing_page_id) REFERENCES public.landing_pages(id) ON DELETE CASCADE;


--
-- Name: landing_page_shares landing_page_shares_id_landing_page_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_shares
    ADD CONSTRAINT landing_page_shares_id_landing_page_fkey FOREIGN KEY (id_landing_page) REFERENCES public.landing_pages(id) ON DELETE CASCADE;


--
-- Name: landing_page_shares landing_page_shares_id_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_shares
    ADD CONSTRAINT landing_page_shares_id_owner_fkey FOREIGN KEY (id_owner) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: landing_page_shares landing_page_shares_id_recipient_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_shares
    ADD CONSTRAINT landing_page_shares_id_recipient_fkey FOREIGN KEY (id_recipient) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: landing_page_templates landing_page_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_templates
    ADD CONSTRAINT landing_page_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: landing_page_versions landing_page_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_versions
    ADD CONSTRAINT landing_page_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: landing_page_versions landing_page_versions_id_landing_page_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_versions
    ADD CONSTRAINT landing_page_versions_id_landing_page_fkey FOREIGN KEY (id_landing_page) REFERENCES public.landing_pages(id) ON DELETE CASCADE;


--
-- Name: landing_page_versions landing_page_versions_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_versions
    ADD CONSTRAINT landing_page_versions_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: landing_page_versions landing_page_versions_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_versions
    ADD CONSTRAINT landing_page_versions_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: landing_pages landing_pages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: landing_pages landing_pages_custom_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_custom_domain_id_fkey FOREIGN KEY (custom_domain_id) REFERENCES public.custom_domains(id) ON DELETE SET NULL;


--
-- Name: landing_pages landing_pages_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: landing_pages landing_pages_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.landing_page_templates(id);


--
-- Name: landing_pages landing_pages_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: leads leads_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: login_history login_history_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: marketplace_favorites marketplace_favorites_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_favorites
    ADD CONSTRAINT marketplace_favorites_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id);


--
-- Name: marketplace_favorites marketplace_favorites_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_favorites
    ADD CONSTRAINT marketplace_favorites_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.marketplace_listings(id);


--
-- Name: marketplace_listings marketplace_listings_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_listings
    ADD CONSTRAINT marketplace_listings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id);


--
-- Name: marketplace_payout_requests marketplace_payout_requests_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_payout_requests
    ADD CONSTRAINT marketplace_payout_requests_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: marketplace_payout_requests marketplace_payout_requests_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_payout_requests
    ADD CONSTRAINT marketplace_payout_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.users(id);


--
-- Name: marketplace_purchases marketplace_purchases_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_purchases
    ADD CONSTRAINT marketplace_purchases_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id);


--
-- Name: marketplace_purchases marketplace_purchases_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_purchases
    ADD CONSTRAINT marketplace_purchases_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.marketplace_listings(id);


--
-- Name: marketplace_purchases marketplace_purchases_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_purchases
    ADD CONSTRAINT marketplace_purchases_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id);


--
-- Name: marketplace_reviews marketplace_reviews_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_reviews
    ADD CONSTRAINT marketplace_reviews_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id);


--
-- Name: marketplace_reviews marketplace_reviews_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_reviews
    ADD CONSTRAINT marketplace_reviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.marketplace_listings(id);


--
-- Name: marketplace_seller_stats marketplace_seller_stats_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_seller_stats
    ADD CONSTRAINT marketplace_seller_stats_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_channel_accounts member_channel_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_channel_accounts
    ADD CONSTRAINT member_channel_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: member_channel_accounts member_channel_accounts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_channel_accounts
    ADD CONSTRAINT member_channel_accounts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_channel_accounts member_channel_accounts_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_channel_accounts
    ADD CONSTRAINT member_channel_accounts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_email_logs notification_email_logs_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_logs
    ADD CONSTRAINT notification_email_logs_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_email_logs notification_email_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_logs
    ADD CONSTRAINT notification_email_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: notification_event_settings notification_event_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_event_settings
    ADD CONSTRAINT notification_event_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_templates notification_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: orders orders_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: orders orders_refunded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_refunded_by_fkey FOREIGN KEY (refunded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: orders orders_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE SET NULL;


--
-- Name: plans plans_custom_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_custom_owner_user_id_fkey FOREIGN KEY (custom_owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: product_chat_mentions product_chat_mentions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_chat_mentions
    ADD CONSTRAINT product_chat_mentions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: products products_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: products products_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: scheduled_plan_changes scheduled_plan_changes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_plan_changes
    ADD CONSTRAINT scheduled_plan_changes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: scheduled_plan_changes scheduled_plan_changes_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_plan_changes
    ADD CONSTRAINT scheduled_plan_changes_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;


--
-- Name: scheduled_plan_changes scheduled_plan_changes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_plan_changes
    ADD CONSTRAINT scheduled_plan_changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: send_quota_reservations send_quota_reservations_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_reservations
    ADD CONSTRAINT send_quota_reservations_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: send_quota_reservations send_quota_reservations_billing_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_reservations
    ADD CONSTRAINT send_quota_reservations_billing_user_id_fkey FOREIGN KEY (billing_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: send_quota_reservations send_quota_reservations_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_quota_reservations
    ADD CONSTRAINT send_quota_reservations_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.user_members(id) ON DELETE SET NULL;


--
-- Name: storage_objects storage_objects_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_objects
    ADD CONSTRAINT storage_objects_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: storage_objects storage_objects_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_objects
    ADD CONSTRAINT storage_objects_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: sub_assistants sub_assistants_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_assistants
    ADD CONSTRAINT sub_assistants_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscription_reminder_settings subscription_reminder_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_reminder_settings
    ADD CONSTRAINT subscription_reminder_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_ticket_messages support_ticket_messages_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_ticket_messages support_ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: system_email_templates system_email_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_email_templates
    ADD CONSTRAINT system_email_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: telegram_accounts telegram_accounts_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: telegram_chatbot_settings telegram_chatbot_settings_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_chatbot_settings
    ADD CONSTRAINT telegram_chatbot_settings_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE CASCADE;


--
-- Name: telegram_chatbot_settings telegram_chatbot_settings_id_telegram_account_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_chatbot_settings
    ADD CONSTRAINT telegram_chatbot_settings_id_telegram_account_fkey FOREIGN KEY (id_telegram_account) REFERENCES public.telegram_accounts(id) ON DELETE CASCADE;


--
-- Name: telegram_personal_conversations telegram_personal_conversations_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_conversations
    ADD CONSTRAINT telegram_personal_conversations_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE SET NULL;


--
-- Name: telegram_personal_conversations telegram_personal_conversations_id_telegram_account_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_conversations
    ADD CONSTRAINT telegram_personal_conversations_id_telegram_account_fkey FOREIGN KEY (id_telegram_account) REFERENCES public.telegram_accounts(id) ON DELETE CASCADE;


--
-- Name: telegram_personal_conversations telegram_personal_conversations_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_conversations
    ADD CONSTRAINT telegram_personal_conversations_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: telegram_personal_messages telegram_personal_messages_id_conversation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_messages
    ADD CONSTRAINT telegram_personal_messages_id_conversation_fkey FOREIGN KEY (id_conversation) REFERENCES public.telegram_personal_conversations(id) ON DELETE CASCADE;


--
-- Name: telegram_personal_messages telegram_personal_messages_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_personal_messages
    ADD CONSTRAINT telegram_personal_messages_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: telegram_session_state telegram_session_state_telegram_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_session_state
    ADD CONSTRAINT telegram_session_state_telegram_user_id_fkey FOREIGN KEY (telegram_user_id) REFERENCES public.telegram_accounts(telegram_user_id) ON DELETE CASCADE;


--
-- Name: template_files template_files_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_files
    ADD CONSTRAINT template_files_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: template_labels template_labels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_labels
    ADD CONSTRAINT template_labels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: template_labels template_labels_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_labels
    ADD CONSTRAINT template_labels_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tiktok_business_accounts tiktok_business_accounts_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_business_accounts
    ADD CONSTRAINT tiktok_business_accounts_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tiktok_scheduled_posts tiktok_scheduled_posts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_scheduled_posts
    ADD CONSTRAINT tiktok_scheduled_posts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.tiktok_business_accounts(id) ON DELETE CASCADE;


--
-- Name: tiktok_scheduled_posts tiktok_scheduled_posts_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_scheduled_posts
    ADD CONSTRAINT tiktok_scheduled_posts_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: topup_debits topup_debits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_debits
    ADD CONSTRAINT topup_debits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: topup_grants topup_grants_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_grants
    ADD CONSTRAINT topup_grants_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: topup_grants topup_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_grants
    ADD CONSTRAINT topup_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: topup_locked_resources topup_locked_resources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topup_locked_resources
    ADD CONSTRAINT topup_locked_resources_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: usage_logs usage_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_logs
    ADD CONSTRAINT usage_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: usage_logs usage_logs_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_logs
    ADD CONSTRAINT usage_logs_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_consents user_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_members user_members_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_members
    ADD CONSTRAINT user_members_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: user_members user_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_members
    ADD CONSTRAINT user_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_notifications user_notifications_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE SET NULL;


--
-- Name: user_notifications user_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_two_factor user_two_factor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_two_factor
    ADD CONSTRAINT user_two_factor_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_whatsapp_app_credentials user_whatsapp_app_credentials_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_whatsapp_app_credentials
    ADD CONSTRAINT user_whatsapp_app_credentials_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_active_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_active_plan_id_fkey FOREIGN KEY (active_plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;


--
-- Name: users users_id_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_role_fkey FOREIGN KEY (id_role) REFERENCES public.roles(id);


--
-- Name: users users_referred_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_user_id_fkey FOREIGN KEY (referred_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: voucher_redemptions voucher_redemptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: voucher_redemptions voucher_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: voucher_redemptions voucher_redemptions_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE;


--
-- Name: web_widget_configs web_widget_configs_id_sub_assistant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_widget_configs
    ADD CONSTRAINT web_widget_configs_id_sub_assistant_fkey FOREIGN KEY (id_sub_assistant) REFERENCES public.sub_assistants(id) ON DELETE SET NULL;


--
-- Name: web_widget_configs web_widget_configs_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_widget_configs
    ADD CONSTRAINT web_widget_configs_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: webchat_conversations webchat_conversations_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: webchat_conversations webchat_conversations_id_widget_config_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_conversations
    ADD CONSTRAINT webchat_conversations_id_widget_config_fkey FOREIGN KEY (id_widget_config) REFERENCES public.web_widget_configs(id) ON DELETE CASCADE;


--
-- Name: webchat_messages webchat_messages_id_conversation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages
    ADD CONSTRAINT webchat_messages_id_conversation_fkey FOREIGN KEY (id_conversation) REFERENCES public.webchat_conversations(id) ON DELETE CASCADE;


--
-- Name: webchat_messages webchat_messages_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_messages
    ADD CONSTRAINT webchat_messages_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_account_settings whatsapp_account_settings_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_account_settings
    ADD CONSTRAINT whatsapp_account_settings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_baileys_session_profile whatsapp_baileys_session_profile_session_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_baileys_session_profile
    ADD CONSTRAINT whatsapp_baileys_session_profile_session_key_fkey FOREIGN KEY (session_key) REFERENCES public.whatsapp_baileys_session_creds(session_key) ON DELETE CASCADE;


--
-- Name: zalo_accounts zalo_accounts_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_accounts
    ADD CONSTRAINT zalo_accounts_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: zalo_friends zalo_friends_id_zalo_setting_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_friends
    ADD CONSTRAINT zalo_friends_id_zalo_setting_fkey FOREIGN KEY (id_zalo_setting) REFERENCES public.zalo_settings(id) ON DELETE CASCADE;


--
-- Name: zalo_groups zalo_groups_id_zalo_setting_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_groups
    ADD CONSTRAINT zalo_groups_id_zalo_setting_fkey FOREIGN KEY (id_zalo_setting) REFERENCES public.zalo_settings(id) ON DELETE CASCADE;


--
-- Name: zalo_messages zalo_messages_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages
    ADD CONSTRAINT zalo_messages_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: zalo_messages zalo_messages_campaign_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages
    ADD CONSTRAINT zalo_messages_campaign_fkey FOREIGN KEY (id_campaign) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: zalo_messages zalo_messages_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages
    ADD CONSTRAINT zalo_messages_customer_fkey FOREIGN KEY (id_customer) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: zalo_messages zalo_messages_node_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages
    ADD CONSTRAINT zalo_messages_node_fkey FOREIGN KEY (id_node) REFERENCES public.campaign_nodes(id) ON DELETE SET NULL;


--
-- Name: zalo_messages zalo_messages_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages
    ADD CONSTRAINT zalo_messages_run_fkey FOREIGN KEY (id_run) REFERENCES public.campaign_runs(id) ON DELETE SET NULL;


--
-- Name: zalo_messages zalo_messages_workspace_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_messages
    ADD CONSTRAINT zalo_messages_workspace_owner_id_fkey FOREIGN KEY (workspace_owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: zalo_personal_conversations zalo_personal_conversations_id_chatbot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_conversations
    ADD CONSTRAINT zalo_personal_conversations_id_chatbot_fkey FOREIGN KEY (id_chatbot) REFERENCES public.custom_chatbots(id) ON DELETE SET NULL;


--
-- Name: zalo_personal_conversations zalo_personal_conversations_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_conversations
    ADD CONSTRAINT zalo_personal_conversations_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: zalo_personal_conversations zalo_personal_conversations_id_zalo_setting_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_conversations
    ADD CONSTRAINT zalo_personal_conversations_id_zalo_setting_fkey FOREIGN KEY (id_zalo_setting) REFERENCES public.zalo_settings(id) ON DELETE CASCADE;


--
-- Name: zalo_personal_messages zalo_personal_messages_id_conversation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_messages
    ADD CONSTRAINT zalo_personal_messages_id_conversation_fkey FOREIGN KEY (id_conversation) REFERENCES public.zalo_personal_conversations(id) ON DELETE CASCADE;


--
-- Name: zalo_personal_messages zalo_personal_messages_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_messages
    ADD CONSTRAINT zalo_personal_messages_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: zalo_personal_messages zalo_personal_messages_id_zalo_setting_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_personal_messages
    ADD CONSTRAINT zalo_personal_messages_id_zalo_setting_fkey FOREIGN KEY (id_zalo_setting) REFERENCES public.zalo_settings(id) ON DELETE CASCADE;


--
-- Name: zalo_settings zalo_settings_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_settings
    ADD CONSTRAINT zalo_settings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: zalo_templates zalo_templates_id_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zalo_templates
    ADD CONSTRAINT zalo_templates_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


