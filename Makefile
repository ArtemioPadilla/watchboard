.PHONY: help dev build preview test \
        video video-install video-render video-render-progress video-fetch \
        backfill-media backfill-wikimedia backfill-wikimedia-videos \
        update-data audit measure clean

# ─────────────────────────────────────────────────────────────────────
# Default — print help
# ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "Watchboard — common dev commands"
	@echo ""
	@echo "  Site:"
	@echo "    make dev                     Start Astro dev server (localhost:4321)"
	@echo "    make build                   Build static site to dist/ (incl. pagefind)"
	@echo "    make preview                 Preview the built site"
	@echo "    make test                    Run unit tests (vitest)"
	@echo ""
	@echo "  Video — Remotion Studio (interactive timeline editor):"
	@echo "    make video                   Open Remotion Studio (timeline + preview)"
	@echo "    make video-prep              Refresh real news + thumbnails for Studio preview"
	@echo "    make video-install           Install video deps (with --legacy-peer-deps)"
	@echo "    make video-render            Render daily breaking video → video/output/"
	@echo "    make video-render-progress   Render daily progress video"
	@echo "    make video-render-all        Render BOTH (breaking + progress)"
	@echo "    make video-repost-telegram   Re-post to Telegram (ARGS=--all to do both)"
	@echo "    make video-redo-all          Render BOTH + re-post BOTH to Telegram"
	@echo "    make video-fetch             Refresh breaking.json with latest news"
	@echo ""
	@echo "  Media backfill (thumbnails for events):"
	@echo "    make backfill-media          Fetch og:image+og:video from source URLs"
	@echo "    make backfill-wikimedia      Wikipedia REST fallback for events without URLs"
	@echo "    make backfill-wikimedia-videos  Commons video file search"
	@echo ""
	@echo "  Data:"
	@echo "    make update-data             Run nightly AI updater locally (needs API key)"
	@echo "    make audit                   Run full schema + data quality audit"
	@echo "    make measure                 Print per-tracker stats table"
	@echo ""
	@echo "  Misc:"
	@echo "    make clean                   Remove dist/ + .astro/ + node_modules"
	@echo ""

# ─────────────────────────────────────────────────────────────────────
# Site
# ─────────────────────────────────────────────────────────────────────
dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

test:
	npm run test

# ─────────────────────────────────────────────────────────────────────
# Video (Remotion Studio is the equivalent of After Effects timeline)
# ─────────────────────────────────────────────────────────────────────
video-install:
	cd video && npm install --legacy-peer-deps

video: video-install-if-needed
	@echo "→ Opening Remotion Studio at http://localhost:3000"
	@echo "  Use ←/→ to step frames, Space to play, edit components for hot reload."
	cd video && npm run dev

# Auto-install only if node_modules is missing — keeps `make video` fast on subsequent runs
video-install-if-needed:
	@if [ ! -d video/node_modules ]; then \
		echo "→ First run — installing video deps with --legacy-peer-deps..."; \
		cd video && npm install --legacy-peer-deps; \
	fi

video-render:
	cd video && npx tsx render.ts

video-render-progress:
	cd video && npx tsx render.ts --mode positive

# Render both daily videos (breaking + progress) sequentially with one cmd.
# Reuses breaking.json between renders — they share tracker selection.
video-render-all: video-render video-render-progress
	@echo "→ Both videos rendered to video/output/"

# Re-post today's rendered MP4 to Telegram with the same caption logic the
# daily-video.yml workflow uses. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL_ID.
# Default posts breaking only. Pass ARGS to switch:
#   make video-repost-telegram ARGS=--dry-run         # preview only
#   make video-repost-telegram ARGS=--progress        # progress brief
#   make video-repost-telegram ARGS=--all             # both
#   make video-repost-telegram ARGS="--all --dry-run" # preview both
video-repost-telegram:
	npx tsx scripts/repost-daily-telegram.ts $(ARGS)

# Convenience: render BOTH and re-post BOTH to Telegram in one command.
video-redo-all: video-render-all
	npx tsx scripts/repost-daily-telegram.ts --all $(ARGS)

video-fetch:
	cd video && npx tsx src/data/fetch-breaking.ts

# Refresh real news + download thumbnails as base64 so the Remotion Studio
# preview shows the actual globe and photos (not just SAMPLE_DATA).
# Run before `make video` whenever you want fresh data in the timeline.
video-prep:
	cd video && npx tsx prep-studio.ts

# ─────────────────────────────────────────────────────────────────────
# Media backfill
# ─────────────────────────────────────────────────────────────────────
backfill-media:
	npm run backfill-media

backfill-wikimedia:
	npm run backfill-wikimedia

backfill-wikimedia-videos:
	npm run backfill-wikimedia -- --videos

# ─────────────────────────────────────────────────────────────────────
# Data
# ─────────────────────────────────────────────────────────────────────
update-data:
	npm run update-data

audit:
	@if [ -f /tmp/audit_all.mjs ]; then \
		node /tmp/audit_all.mjs .; \
	else \
		echo "audit script not in /tmp — run from a fresh session or recreate"; \
	fi

measure:
	@if [ -f /tmp/measure_quality.sh ]; then \
		bash /tmp/measure_quality.sh; \
	else \
		echo "measure script not in /tmp — run from a fresh session or recreate"; \
	fi

# ─────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────
clean:
	rm -rf dist/ .astro/ node_modules/ video/node_modules/
	@echo "→ Cleaned dist/, .astro/, node_modules/, video/node_modules/"
