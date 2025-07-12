-- CreateTable
CREATE TABLE "visitor_tracking" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "referrer" TEXT,
    "landing_page" TEXT,
    "visit_duration" INTEGER,
    "page_views" INTEGER NOT NULL DEFAULT 1,
    "app_downloaded" BOOLEAN NOT NULL DEFAULT false,
    "downloaded_at" TIMESTAMP(3),
    "first_visit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_visit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_returning" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "visitor_tracking_pkey" PRIMARY KEY ("id")
);
