// @system codegen
// @status generated
// @edit change the suite in the owned-suites band, then re-run codegen. Hand-edits are overwritten.
//
// This suite's assertions are OWNED by the codegen band: the band module
// carries them verbatim, this file is the emission, and hand edits here are
// overwritten on the next run. The rationale each assertion carries moved
// with it into the band.

import { describe, expect, test } from "bun:test";
import { isVersionPublished, isTagAheadOfRegistry } from "./index.ts";

/**
 * "IS IT PUBLISHED" IS NOT "IS IT THE LATEST".
 *
 * publish-chain's strand classifier computed `tagObservable` as
 * `version === dist-tags.latest`, while the field is documented as "the tag's
 * exact version is observable on the registry". Those coincide only for the most
 * recent version, so for any package published more than once every historical
 * tag was classified NOT observable and fell through to superseded/strand on a
 * fact that had never been checked — mis-blocking a legitimate historical tag.
 *
 * The packument response always carried the full `versions` map; only `latest`
 * was being read, so answering the question properly costs nothing.
 */
describe("isVersionPublished", () => {
	const summary = { latest: "1.2.0", versions: ["1.0.0", "1.1.0", "1.2.0"] };

	test("a published version that is NOT latest is still published", () => {
		// The regression in one assertion.
		expect(isVersionPublished(summary, "1.0.0")).toBe(true);
	});

	test("the latest version is published", () => {
		expect(isVersionPublished(summary, "1.2.0")).toBe(true);
	});

	test("a version ahead of latest is not published", () => {
		expect(isVersionPublished(summary, "1.3.0")).toBe(false);
	});

	test("an unknown registry state reports nothing published", () => {
		// A failed fetch and a new package both yield empty versions, and both must
		// be treated conservatively — assume NOT published and do the work, never
		// assume it is and skip.
		expect(isVersionPublished({ latest: null, versions: [] }, "1.0.0")).toBe(false);
	});
});

describe("isTagAheadOfRegistry", () => {
	test("a null registry latest counts as ahead — conservative by design", () => {
		// A new package or an unreachable registry must fall through to doing the
		// publish, never skip it.
		expect(isTagAheadOfRegistry("1.0.0", null)).toBe(true);
	});

	test("a version above latest is ahead", () => {
		expect(isTagAheadOfRegistry("1.3.0", "1.2.0")).toBe(true);
	});

	test("a version at or below latest is not ahead", () => {
		expect(isTagAheadOfRegistry("1.2.0", "1.2.0")).toBe(false);
		expect(isTagAheadOfRegistry("1.0.0", "1.2.0")).toBe(false);
	});
});
