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
