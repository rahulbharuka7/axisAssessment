.PHONY: help install seed api ai web dev test typecheck clean

VENV := .venv
PY   := $(VENV)/bin/python

help:
	@echo "Axis Bank — AI Assessment Module"
	@echo ""
	@echo "  make install     Create the venv and install Python + web dependencies"
	@echo "  make seed        Seed the database from the blueprint spreadsheets"
	@echo "  make ai          Run the AI service          (port 4100)"
	@echo "  make api         Run the backend API         (port 4000)"
	@echo "  make web         Run the web client          (port 5173)"
	@echo "  make dev         Run all three together"
	@echo "  make test        Run the eligibility test suite"
	@echo "  make typecheck   Typecheck the web client"

install:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install --quiet --upgrade pip
	$(VENV)/bin/pip install --quiet -r api/requirements.txt
	npm install --no-fund --no-audit

seed:
	$(PY) -m api.app.seed

ai:
	$(PY) -m uvicorn api.ai_service.main:app --port 4100 --reload

api:
	$(PY) -m uvicorn api.app.main:app --port 4000 --reload

web:
	npm run dev

dev:
	@$(MAKE) -j3 ai api web

test:
	$(PY) -m pytest api/tests -q

typecheck:
	npm run typecheck

clean:
	rm -f api/data/assessment.db*
