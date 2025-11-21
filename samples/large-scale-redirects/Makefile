.PHONY: build-rules-manager
build-rules-manager:
	cargo build --release -p rules-manager

.PHONY: setup
setup: build-rules-manager
	./target/release/rules-manager \
		--add-rules example-redirects.txt \
		--output-dir output
