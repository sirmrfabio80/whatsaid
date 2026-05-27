/**
 * Single source of truth for the AssemblyAI base URL.
 *
 * WhatSaid is a UK-only deployment. AssemblyAI requests MUST go to the EU
 * datacenter. This constant is the only AssemblyAI host string allowed in
 * the repository — every edge function that talks to AssemblyAI imports it
 * from here. There is no override, no env-var fallback, no US endpoint.
 */
export const ASSEMBLYAI_EU_BASE_URL = "https://api.eu.assemblyai.com/v2";
