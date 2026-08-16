/** App entry point. */
import { App } from "./ui/app";

const host = document.getElementById("app");
if (!host) throw new Error("#app host element is missing");

new App(host).start();
