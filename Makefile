SHELL := /bin/bash
MAKE_DIR := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))

default: build-samples build-tutorials

SAMPLES ?= $(shell ls ./samples)

# Some samples require extra setup steps
.PHONY: setup-geo-ip
setup-geo-ip:
	make -C samples/geo-ip create-test-mmdb

.PHONY: setup-large-scale-redirects
setup-large-scale-redirects:
	make -C samples/large-scale-redirects create-test-redirects

.PHONY: setup-samples
setup-samples: setup-geo-ip setup-large-scale-redirects

# Build the samples
.PHONY: build-samples
build-samples: setup-samples
	@for dir in $(SAMPLES); do \
		echo "Building sample: $$dir"; \
		cd $(MAKE_DIR)samples/$$dir; \
		spin build || { \
			echo "❌ Error: Build failed for sample: $$dir"; \
			exit 1; \
		}; \
	done

# Test the samples
# TODO: some samples have specific instructions for their requests, eg headers, paths, variables, etc.
.PHONY: test-samples
test-samples: build-samples
	@for dir in $(SAMPLES); do \
		if [[ "$$dir" == "large-scale-redirects" || \
			  "$$dir" == "geo-ip" || \
			  "$$dir" == "gh-api-token" || \
			  "$$dir" == "early-hints-rust" || \
			  "$$dir" == "linode-object-storage-streaming" ]]; then \
			echo "TODO: Skipping sample: $$dir" && continue; \
		fi; \
		echo "Testing sample: $$dir"; \
		cd $(MAKE_DIR)samples/$$dir; \
		$(MAKE_DIR)/test-app.sh || { \
			echo "❌ Error: Test failed for sample: $$dir"; \
			exit 1; \
		}; \
	done

TUTORIALS ?= $(shell ls ./tutorials)

# Build the tutorials
.PHONY: build-tutorials
build-tutorials:
	@for dir in $(TUTORIALS); do \
		echo "Building tutorial: $$dir"; \
		cd $(MAKE_DIR)tutorials/$$dir; \
		spin build || { \
			echo "❌ Error: Build failed for tutorial: $$dir"; \
			exit 1; \
		}; \
	done

# Test the tutorials
# TODO: some tutorials have specific instructions for their requests, eg headers, paths, variables, etc.
.PHONY: test-tutorials
test-tutorials: build-tutorials
	@for dir in $(TUTORIALS); do \
		if [[ "$$dir" == "stream-data-from-linode-object-store-tutorial" ]]; then \
			echo "TODO: Skipping tutorial: $$dir" && continue; \
		fi; \
		echo "Testing tutorial: $$dir"; \
		cd $(MAKE_DIR)tutorials/$$dir; \
		$(MAKE_DIR)/test-app.sh || { \
			echo "❌ Error: Test failed for tutorial: $$dir"; \
			exit 1; \
		}; \
	done