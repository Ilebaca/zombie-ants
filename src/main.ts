/** App entry point. */
import { takeNewerBuild } from "./platform";
import { App } from "./ui/app";

const host = document.getElementById("app");
if (!host) throw new Error("#app host element is missing");

new App(host).start();

// If a newer build is live, take it. The page starts either way — the check is a fetch
// that may never answer, and a game that waits for the network to start is a worse
// problem than a stale one.
void takeNewerBuild();
