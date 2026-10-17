-- Presentation drafts reference the original versioned registration engine.
CREATE TABLE cabinet_drafts (
 id text PRIMARY KEY REFERENCES questionnaire_sessions(id),
 owner_id text NOT NULL REFERENCES users(id),
 data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cabinet_drafts_owner ON cabinet_drafts(owner_id,updated_at DESC);
CREATE TABLE point_consents (
 token_hash text PRIMARY KEY, owner_id text REFERENCES users(id),
 version text NOT NULL, document jsonb NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE point_offer_reviews (
 point_id text NOT NULL REFERENCES questionnaire_sessions(id), owner_id text NOT NULL REFERENCES users(id),
 version text NOT NULL, document jsonb NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(point_id,owner_id,version)
);
CREATE TABLE point_plans (
 point_id text NOT NULL REFERENCES questionnaire_sessions(id), month text NOT NULL,
 data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(point_id,month)
);
CREATE TABLE point_operation_events (
 id text PRIMARY KEY, point_id text NOT NULL REFERENCES questionnaire_sessions(id),
 kind text NOT NULL CHECK(kind IN ('issued','paid')), reference text NOT NULL,
 amount_kopecks bigint NOT NULL CHECK(amount_kopecks>=0), occurred_at timestamptz NOT NULL,
 UNIQUE(point_id,kind,reference)
);
CREATE INDEX point_events_period ON point_operation_events(point_id,occurred_at);
