/* Legacy compatibility shim.
 * The standalone substitute-work flow still exists for old direct bookmarks,
 * but it must NEVER inject a top-level entry into the main app navigation.
 * Kept as a no-op so stale cached loader references cannot resurrect the button.
 */
(()=>{ window.__substitutionEntryV1=true; })();
