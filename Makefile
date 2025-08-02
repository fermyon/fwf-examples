SHELL    := /bin/bash
MAKE_DIR := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))
APPS     ?= $(shell find ./samples ./tutorials -mindepth 1 -maxdepth 1 -type d)

default: build-apps

# Run a command for an app
.PHONY: $(APPS)
$(APPS):
	@echo "Running '$(SCRIPT)' for app: $@"
	@cd $(MAKE_DIR)$@ && \
		$(MAKE_DIR)scripts/$(SCRIPT) || { \
			echo "❌ Error: '$(SCRIPT)' failed for app: $@"; \
			exit 1; \
		};

# Build the apps
.PHONY: build-apps
build-apps:
	@SCRIPT='build.sh' $(MAKE) $(APPS)

# Test the apps
.PHONY: test-apps
test-apps: build-apps
	@SCRIPT="test.sh" $(MAKE) $(APPS)

# Used by the GitHub test workflow
.PHONY: echo-apps-json
echo-apps-json:
	@jq -Rn --arg str "$(APPS)" '$$str | split(" ")' | tr -d '\n'
