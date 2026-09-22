/**
 * @system publish-registry
 * @status handwritten
 * @edit edit directly
 * Shared publish-registry reading: packument, dist-tag, github-packages.
 * Hosts are caller-supplied; this primitive never embeds a registry host
 * literal so a registry rename is one config edit, not a code edit.
 */
/**
 * Is this EXACT version published?
 *
 * Distinct from "is it the latest", and that distinction is the point. A caller
 * asking whether a publish happened wants existence; comparing against
 * `dist-tags.latest` answers a different question and is wrong for every version
 * except the most recent one. publish-chain's strand classifier was doing
 * exactly that (`tagObservable = version === latest`), so any historical tag —
 * the normal case for a package published more than once — was classified NOT
 * observable and fell through to superseded/strand on a fact never checked,
 * which mis-blocks a legitimate historical tag.
 */

import { semver } from "bun";
import { isTagAheadOfRegistry } from "./version-comparison.ts";
import { getAppLogger } from "@teamscala/logger/app-loggers";
export { isTagAheadOfRegistry };

/**
 * What the registry knows about one package.
 *
 * `latest` and `versions` come from the SAME packument fetch because they always
 * did — the response carries both and only `latest` was being read. Returning
 * both costs nothing and closes a real gap: "is this version published?" and "is
 * this version the latest?" are different questions, and answering the first
 * with the second is wrong for every package published more than once.
 */
export interface PackumentSummary {
	/** `dist-tags.latest`, or null when the package is new/unreachable. */
	latest: string | null;
	/** Every published version. Empty when the package is new/unreachable. */
	versions: string[];
}

/**
 * Fetch what the registry holds for a package (null latest + empty versions =
 * new or unreachable).
 *
 * A failed fetch is indistinguishable from a new package by design here — both
 * yield "nothing known" — because every caller must treat an unknown registry
 * state conservatively (assume the version is NOT published and do the work)
 * rather than assume it is.
 */
export async function getPackumentSummary(
	name: string,
	token: string | undefined,
	registry: string,
): Promise<PackumentSummary> {
	let registryFailed = false;
	const encoded = encodeURIComponent(name);
	const headers: Record<string, string> = {
		Accept: "application/vnd.npm.install-v1+json",
		"Cache-Control": "no-cache",
		Pragma: "no-cache",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	try {
		const res = await fetch(`${registry}/${encoded}`, {
			headers,
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return { latest: null, versions: [] };
		const pkg = (await res.json()) as {
			"dist-tags"?: { latest?: string };
			versions?: Record<string, unknown>;
		};
		return {
			latest: pkg["dist-tags"]?.latest ?? null,
			versions: Object.keys(pkg.versions ?? {}),
		};
	} catch (error) {
		// Registry unreachable reads as "no versions known" downstream; the
		// reason is on stderr, not swallowed.
		getAppLogger().error(`[publish-registry] dist-tags read failed: ${String(error)}`);
		registryFailed = true;
	}
	if (registryFailed) return { latest: null, versions: [] };
	return { latest: null, versions: [] };
}

export function isVersionPublished(summary: PackumentSummary, version: string): boolean {
	return summary.versions.includes(version);
}

/**
 * Fetch the registry's latest published version for a package (null =
 * new/unreachable). Thin wrapper over `getPackumentSummary` so there is ONE
 * fetch shape and the two cannot drift.
 */
export async function getPublishedVersion(
	name: string,
	token: string | undefined,
	registry: string,
): Promise<string | null> {
	return (await getPackumentSummary(name, token, registry)).latest;
}

/**
 * Fetch the registry's dist-tag version for a package
 * (`${registry}/${name}/${distTag}`). Same contract as `getPublishedVersion` —
 * null = new or unreachable, conservative-by-design (every caller assumes
 * NOT-installed and does the work).
 *
 * Extracted from bun-stable-watch and singleton-tools-currency-watch where
 * previously hand-rolled, no typed surface.
 */
export async function getDistTagVersion(
	name: string,
	distTag: string,
	registry: string,
	token?: string,
): Promise<string | null> {
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(distTag);
	const url = `${registry}/${encodedName}/${encodedTag}`;
	try {
		const headers: Record<string, string> = {
			Accept: "application/json",
			"Cache-Control": "no-cache",
			Pragma: "no-cache",
		};
		if (token) headers.Authorization = `Bearer ${token}`;
		const res = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { version?: string };
		return typeof body.version === "string" ? body.version : null;
	} catch {
		return null;
	}
}

/**
 * Fetch the latest version of a GitHub-Packages-published package
 * (`${registry}/${name}` with GitHub-Packages token auth). Same capability as
 * `getPackumentSummary`, not a different one — the github-packages endpoint
 * speaks the npm packument protocol.
 *
 * Extracted from scala-tools-currency-watchdog which was hardcoding a URL
 * with an embedded package name and a GitHub-Packages auth header shape
 * that did not match any other call site.
 */
export async function getGithubPackagesLatestVersion(
	name: string,
	token: string | undefined,
	registry: string,
): Promise<string | null> {
	const encoded = encodeURIComponent(name);
	const url = `${registry.replace(/\/+$/, "")}/${encoded}`;
	try {
		const res = await fetch(url, {
			headers: {
				accept: "application/vnd.github+json",
				authorization: `Bearer ${token}`,
				"Cache-Control": "no-cache",
				Pragma: "no-cache",
			},
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return null;
		const packument = (await res.json()) as {
			"dist-tags"?: { latest?: unknown };
		};
		const latest = packument["dist-tags"]?.latest;
		return typeof latest === "string" ? latest : null;
	} catch {
		return null;
	}
}
