/**
 * @system publish-registry
 * @status handwritten
 * @edit edit directly
 *
 * `isTagAheadOfRegistry` — pure semver comparison. No network, no I/O. Lives
 * here (not in the network file) because it is the ONLY non-fetch operation
 * in the primitive; mixing it with the fetch group would couple unrelated
 * concerns under one canonical unit.
 */
import { semver } from "bun";

/** Is a tag's version ahead of the registry's published version? */
export function isTagAheadOfRegistry(
	tagVersion: string,
	publishedVersion: string | null,
): boolean {
	return publishedVersion === null || semver.order(tagVersion, publishedVersion) > 0;
}